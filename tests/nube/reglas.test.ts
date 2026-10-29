/// <reference types="node" />
/**
 * Reglas de seguridad de Firestore (firebase/firestore.rules) contra el emulador.
 * Cada prueba actúa como una persona distinta (o sin cuenta) y comprueba qué
 * le deja hacer la nube y qué no. No usa el código de la app: prueba las reglas solas.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore'
import { exigirEmulador, firestoreEmulador, PROYECTO } from './emulador'

await exigirEmulador()

const RULES = readFileSync(fileURLToPath(new URL('../../firebase/firestore.rules', import.meta.url)), 'utf8')

// Personas de prueba
const ANA = 'uid-ana'
const LUIS = 'uid-luis'
const PEPE = 'uid-pepe' // no es de la familia
const CID = 'familia-1'
const CODIGO = 'ABC234'

let env: RulesTestEnvironment

/** Firestore con la identidad de `uid` (o sin cuenta). Las funciones modulares aceptan la instancia compat. */
function como(uid: string | null): Firestore {
  const ctx = uid ? env.authenticatedContext(uid, { email: `${uid}@prueba.mx` }) : env.unauthenticatedContext()
  return ctx.firestore() as unknown as Firestore
}

const coleccionBase = () => ({
  name: 'Familia Prueba',
  ownerUid: ANA,
  members: {
    [ANA]: { name: 'Ana', role: 'owner', joinedAt: '2026-01-01T00:00:00.000Z' },
    [LUIS]: { name: 'Luis', role: 'editor', joinedAt: '2026-01-02T00:00:00.000Z' },
  },
  inviteCode: CODIGO,
  createdAt: '2026-01-01T00:00:00.000Z',
})

/** Datos de partida: una colección de Ana con Luis de miembro, un código y un disco. */
async function sembrar() {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore() as unknown as Firestore
    await setDoc(doc(fs, 'collections', CID), coleccionBase())
    await setDoc(doc(fs, 'invites', CODIGO), { collectionId: CID, collectionName: 'Familia Prueba', createdBy: ANA, createdAt: '2026-01-01T00:00:00.000Z' })
    await setDoc(doc(fs, 'collections', CID, 'albums', 'disco-1'), { title: 'Abbey Road', artist: 'The Beatles', genres: [], styles: [], tracklist: [], ratings: {}, addedAt: 'x', updatedAt: 'x' })
    await setDoc(doc(fs, 'collections', CID, 'wishlist', 'deseo-1'), { title: 'Kind of Blue', artist: 'Miles Davis', wantedBy: LUIS, wantedByName: 'Luis', addedAt: 'x' })
    await setDoc(doc(fs, 'users', ANA), { name: 'Ana', collections: [CID] })
    await setDoc(doc(fs, 'users', LUIS), { name: 'Luis', collections: [CID] })
  })
}

beforeAll(async () => {
  const { host, port } = firestoreEmulador()
  env = await initializeTestEnvironment({ projectId: PROYECTO, firestore: { rules: RULES, host, port } })
})

afterAll(async () => {
  await env?.clearFirestore()
  await env?.cleanup()
})

beforeEach(sembrar)

describe('colecciones: crear y leer', () => {
  it('una persona con cuenta crea su colección (dueña y única integrante)', async () => {
    await assertSucceeds(setDoc(doc(como(PEPE), 'collections', 'nueva'), {
      name: 'Casa de Pepe', ownerUid: PEPE, members: { [PEPE]: { name: 'Pepe', role: 'owner', joinedAt: 'x' } }, inviteCode: 'ZZZ999', createdAt: 'x',
    }))
  })

  it('no se puede crear una colección a nombre de otra persona', async () => {
    await assertFails(setDoc(doc(como(PEPE), 'collections', 'ajena'), {
      name: 'Trampa', ownerUid: ANA, members: { [ANA]: { name: 'Ana', role: 'owner', joinedAt: 'x' } }, createdAt: 'x',
    }))
  })

  it('no se puede crear una colección metiendo a más gente de entrada', async () => {
    await assertFails(setDoc(doc(como(PEPE), 'collections', 'con-colados'), {
      name: 'Con colados', ownerUid: PEPE, members: { [PEPE]: { name: 'Pepe', role: 'owner', joinedAt: 'x' }, [ANA]: { name: 'Ana', role: 'editor', joinedAt: 'x' } }, createdAt: 'x',
    }))
  })

  it('no se puede crear una colección poniéndose de editor en vez de dueño', async () => {
    await assertFails(setDoc(doc(como(PEPE), 'collections', 'sin-dueno'), {
      name: 'Sin dueño', ownerUid: PEPE, members: { [PEPE]: { name: 'Pepe', role: 'editor', joinedAt: 'x' } }, createdAt: 'x',
    }))
  })

  it('sin cuenta no se crea nada', async () => {
    await assertFails(setDoc(doc(como(null), 'collections', 'anon'), { name: 'Anon', ownerUid: 'anon', members: {}, createdAt: 'x' }))
  })

  it('los miembros leen su colección; quien no es miembro, no', async () => {
    await assertSucceeds(getDoc(doc(como(ANA), 'collections', CID)))
    await assertSucceeds(getDoc(doc(como(LUIS), 'collections', CID)))
    await assertFails(getDoc(doc(como(PEPE), 'collections', CID)))
    await assertFails(getDoc(doc(como(null), 'collections', CID)))
  })

  it('se pueden listar solo las colecciones propias, nunca todas', async () => {
    const mias = query(collection(como(LUIS), 'collections'), where(`members.${LUIS}`, '!=', null))
    const snap = await assertSucceeds(getDocs(mias))
    expect(snap.docs.map((d) => d.id)).toEqual([CID])
    await assertFails(getDocs(collection(como(LUIS), 'collections')))
    await assertFails(getDocs(collection(como(PEPE), 'collections')))
  })

  it('solo quien administra borra la colección', async () => {
    await assertFails(deleteDoc(doc(como(LUIS), 'collections', CID)))
    await assertFails(deleteDoc(doc(como(PEPE), 'collections', CID)))
    await assertSucceeds(deleteDoc(doc(como(ANA), 'collections', CID)))
  })
})

describe('invitaciones', () => {
  it('cualquiera con cuenta lee un código si lo conoce; sin cuenta, no', async () => {
    const snap = await assertSucceeds(getDoc(doc(como(PEPE), 'invites', CODIGO)))
    expect(snap.data()?.collectionId).toBe(CID)
    await assertFails(getDoc(doc(como(null), 'invites', CODIGO)))
  })

  it('nadie puede listar los códigos', async () => {
    await assertFails(getDocs(collection(como(PEPE), 'invites')))
    await assertFails(getDocs(collection(como(ANA), 'invites')))
  })

  it('quien administra crea y borra códigos de su colección; los demás no', async () => {
    await assertSucceeds(setDoc(doc(como(ANA), 'invites', 'NUEVO1'), { collectionId: CID, collectionName: 'Familia Prueba', createdBy: ANA, createdAt: 'x' }))
    await assertFails(setDoc(doc(como(LUIS), 'invites', 'NUEVO2'), { collectionId: CID, collectionName: 'Familia Prueba', createdBy: LUIS, createdAt: 'x' }))
    // Firmar como otra persona tampoco.
    await assertFails(setDoc(doc(como(LUIS), 'invites', 'NUEVO3'), { collectionId: CID, collectionName: 'Familia Prueba', createdBy: ANA, createdAt: 'x' }))
    await assertFails(deleteDoc(doc(como(LUIS), 'invites', CODIGO)))
    await assertFails(deleteDoc(doc(como(PEPE), 'invites', CODIGO)))
    await assertSucceeds(deleteDoc(doc(como(ANA), 'invites', CODIGO)))
  })

  it('la colección nueva y su código se guardan en un mismo lote (como hace la app)', async () => {
    const fs = como(PEPE)
    const lote = writeBatch(fs)
    lote.set(doc(fs, 'collections', 'de-pepe'), { name: 'Casa de Pepe', ownerUid: PEPE, members: { [PEPE]: { name: 'Pepe', role: 'owner', joinedAt: 'x' } }, inviteCode: 'PEPE22', createdAt: 'x' })
    lote.set(doc(fs, 'invites', 'PEPE22'), { collectionId: 'de-pepe', collectionName: 'Casa de Pepe', createdBy: PEPE, createdAt: 'x' })
    lote.set(doc(fs, 'users', PEPE), { name: 'Pepe', collections: ['de-pepe'], activeCollection: 'de-pepe' }, { merge: true })
    await assertSucceeds(lote.commit())
  })

  it('en un lote tampoco se cuela un código para una colección ajena', async () => {
    const fs = como(PEPE)
    const lote = writeBatch(fs)
    lote.set(doc(fs, 'collections', 'de-pepe-2'), { name: 'Otra', ownerUid: PEPE, members: { [PEPE]: { name: 'Pepe', role: 'owner', joinedAt: 'x' } }, createdAt: 'x' })
    lote.set(doc(fs, 'invites', 'COLADO'), { collectionId: CID, collectionName: 'Familia Prueba', createdBy: PEPE, createdAt: 'x' })
    await assertFails(lote.commit())
  })

  it('un código no se puede modificar', async () => {
    await assertFails(updateDoc(doc(como(ANA), 'invites', CODIGO), { collectionId: 'otra' }))
  })
})

describe('unirse con código', () => {
  const entrada = { name: 'Pepe', role: 'editor', joinedAt: '2026-02-01T00:00:00.000Z' }

  it('con código válido, tocando solo su propia entrada de members → permitido', async () => {
    await assertSucceeds(updateDoc(doc(como(PEPE), 'collections', CID), { [`members.${PEPE}`]: entrada, joinCode: CODIGO }))
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore() as unknown as Firestore, 'collections', CID))
      expect(snap.data()?.members[PEPE]).toEqual(entrada)
    })
  })

  it('con código inventado → denegado', async () => {
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID), { [`members.${PEPE}`]: entrada, joinCode: 'NOEXIS' }))
  })

  it('con código de otra colección → denegado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'invites', 'OTRA11'), { collectionId: 'otra-familia', createdBy: 'x', createdAt: 'x' })
    })
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID), { [`members.${PEPE}`]: entrada, joinCode: 'OTRA11' }))
  })

  it('sin código → denegado', async () => {
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID), { [`members.${PEPE}`]: entrada }))
  })

  it('tocando además otro campo (el nombre) → denegado', async () => {
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID), { [`members.${PEPE}`]: entrada, joinCode: CODIGO, name: 'Ahora es mía' }))
  })

  it('agregando también a otra persona → denegado', async () => {
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID), { [`members.${PEPE}`]: entrada, 'members.uid-colado': entrada, joinCode: CODIGO }))
  })

  it('entrando como dueño en vez de editor → denegado', async () => {
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID), { [`members.${PEPE}`]: { ...entrada, role: 'owner' }, joinCode: CODIGO }))
  })
})

describe('cambios en la colección', () => {
  it('un miembro cambia su propio nombre', async () => {
    await assertSucceeds(updateDoc(doc(como(LUIS), 'collections', CID), { [`members.${LUIS}.name`]: 'Luis Alberto' }))
  })

  it('un miembro no cambia el nombre de otra persona', async () => {
    await assertFails(updateDoc(doc(como(LUIS), 'collections', CID), { [`members.${ANA}.name`]: 'Anita' }))
  })

  it('un miembro no se vuelve dueño ni cambia el nombre de la colección', async () => {
    await assertFails(updateDoc(doc(como(LUIS), 'collections', CID), { [`members.${LUIS}.role`]: 'owner', ownerUid: LUIS }))
    await assertFails(updateDoc(doc(como(LUIS), 'collections', CID), { name: 'La de Luis' }))
  })

  it('un miembro puede salirse (borra su entrada), pero no sacar a otro', async () => {
    await assertFails(updateDoc(doc(como(LUIS), 'collections', CID), { [`members.${ANA}`]: deleteField() }))
    await assertSucceeds(updateDoc(doc(como(LUIS), 'collections', CID), { [`members.${LUIS}`]: deleteField() }))
  })

  it('quien administra cambia el token de Discogs, el nombre y el código; un miembro no', async () => {
    await assertSucceeds(updateDoc(doc(como(ANA), 'collections', CID), { discogsToken: 'token-de-la-familia' }))
    await assertSucceeds(updateDoc(doc(como(ANA), 'collections', CID), { name: 'Los Tapia', inviteCode: 'NUEVO1' }))
    await assertFails(updateDoc(doc(como(LUIS), 'collections', CID), { discogsToken: 'mi-token' }))
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID), { discogsToken: 'mi-token' }))
  })

  it('quien administra saca a un miembro, pero no puede regalar la colección', async () => {
    await assertSucceeds(updateDoc(doc(como(ANA), 'collections', CID), { [`members.${LUIS}`]: deleteField() }))
    await assertFails(updateDoc(doc(como(ANA), 'collections', CID), { ownerUid: LUIS }))
  })
})

describe('discos y deseos de la colección', () => {
  const disco = { title: 'Blue', artist: 'Joni Mitchell', genres: [], styles: [], tracklist: [], ratings: {}, addedAt: 'x', updatedAt: 'x' }
  const deseo = { title: 'Rumours', artist: 'Fleetwood Mac', wantedBy: ANA, wantedByName: 'Ana', addedAt: 'x' }

  it('los miembros leen y escriben discos', async () => {
    await assertSucceeds(getDoc(doc(como(LUIS), 'collections', CID, 'albums', 'disco-1')))
    await assertSucceeds(getDocs(collection(como(ANA), 'collections', CID, 'albums')))
    await assertSucceeds(setDoc(doc(como(LUIS), 'collections', CID, 'albums', 'disco-2'), disco))
    await assertSucceeds(updateDoc(doc(como(ANA), 'collections', CID, 'albums', 'disco-1'), { [`ratings.${ANA}`]: { rating: 9, at: 'x' } }))
    await assertSucceeds(deleteDoc(doc(como(LUIS), 'collections', CID, 'albums', 'disco-1')))
  })

  it('quien no es miembro no lee ni escribe discos', async () => {
    await assertFails(getDoc(doc(como(PEPE), 'collections', CID, 'albums', 'disco-1')))
    await assertFails(getDocs(collection(como(PEPE), 'collections', CID, 'albums')))
    await assertFails(setDoc(doc(como(PEPE), 'collections', CID, 'albums', 'colado'), disco))
    await assertFails(deleteDoc(doc(como(PEPE), 'collections', CID, 'albums', 'disco-1')))
    await assertFails(getDoc(doc(como(null), 'collections', CID, 'albums', 'disco-1')))
  })

  it('los miembros leen y escriben deseos', async () => {
    await assertSucceeds(getDocs(collection(como(LUIS), 'collections', CID, 'wishlist')))
    await assertSucceeds(setDoc(doc(como(ANA), 'collections', CID, 'wishlist', 'deseo-2'), deseo))
    await assertSucceeds(updateDoc(doc(como(ANA), 'collections', CID, 'wishlist', 'deseo-1'), { reservedBy: ANA, reservedByName: 'Ana' }))
    await assertSucceeds(deleteDoc(doc(como(LUIS), 'collections', CID, 'wishlist', 'deseo-1')))
  })

  it('quien no es miembro no lee ni escribe deseos', async () => {
    await assertFails(getDocs(collection(como(PEPE), 'collections', CID, 'wishlist')))
    await assertFails(setDoc(doc(como(PEPE), 'collections', CID, 'wishlist', 'colado'), deseo))
    await assertFails(updateDoc(doc(como(PEPE), 'collections', CID, 'wishlist', 'deseo-1'), { reservedBy: PEPE }))
  })
})

describe('perfil de usuario', () => {
  it('cada quien lee y escribe su propio perfil', async () => {
    await assertSucceeds(getDoc(doc(como(ANA), 'users', ANA)))
    await assertSucceeds(setDoc(doc(como(ANA), 'users', ANA), { name: 'Ana María' }, { merge: true }))
    await assertSucceeds(setDoc(doc(como(PEPE), 'users', PEPE), { name: 'Pepe', collections: [] }))
  })

  it('nadie lee ni escribe el perfil de otra persona', async () => {
    await assertFails(getDoc(doc(como(LUIS), 'users', ANA)))
    await assertFails(setDoc(doc(como(LUIS), 'users', ANA), { name: 'Hackeada' }, { merge: true }))
    await assertFails(getDoc(doc(como(null), 'users', ANA)))
    await assertFails(getDocs(collection(como(ANA), 'users')))
  })
})
