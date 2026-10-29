/// <reference types="node" />
/**
 * Flujo real de la nube con el código de la app (src/cloud/*) contra el emulador:
 * dos personas (Ana y Luis) crean su cuenta, arman la colección de la familia,
 * agregan y califican discos, apartan deseos, suben lo que había en el celular,
 * se salen y renuevan el código de invitación.
 *
 * "El celular" es la app principal (src/cloud/firebase.ts), que cambia de cuenta
 * entre Ana y Luis como lo haría una sola persona en su teléfono. "El teléfono de
 * Luis" es un segundo cliente independiente, para comprobar que lo que escribe
 * la app de verdad llega a la nube y lo ve otra persona.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  initializeFirestore,
  memoryLocalCache,
  terminate,
  waitForPendingWrites,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'

import { signIn, signOut, signUp } from '../../src/cloud/auth'
import {
  collectionFromDoc,
  createCollection,
  forgetCollection,
  inviteLink,
  joinWithCode,
  leaveCollection,
  localCounts,
  makeInviteCode,
  previewInvite,
  regenerateInvite,
  removeMember,
  renameCollection,
  renameMe,
  setDiscogsToken,
  uploadLocal,
} from '../../src/cloud/collections'
import { getAuthClient, getDb, usingEmulator } from '../../src/cloud/firebase'
import { startMirror } from '../../src/cloud/mirror'
import { makeCloudWrites } from '../../src/cloud/writes'
import { registerCloudWrites } from '../../src/cloud/bridge'
import { addWish, db, deleteAlbum, deleteWish, updateAlbum, updateWish } from '../../src/db'
import { getSession, setSession } from '../../src/session'
import type { Album, Collection, WishlistItem } from '../../src/types'
import { authEmulador, discoDePrueba, esperarA, exigirEmulador, firestoreEmulador, limpiarEmulador, PROYECTO } from './emulador'

await exigirEmulador()

const ANA = { nombre: 'Ana', correo: 'ana@prueba.mx', clave: 'secreta-ana' }
const LUIS = { nombre: 'Luis', correo: 'luis@prueba.mx', clave: 'secreta-luis' }

// Estado que comparten las pruebas, en el orden en que corren.
let uidA = ''
let uidB = ''
let cid = ''
let codigo = ''
let codigoViejo = ''
let disco: Album
let deseo: WishlistItem
let pararEspejo: (() => void) | undefined

// El teléfono de Luis: un segundo cliente, independiente de la app.
let appB: FirebaseApp
let dbB: Firestore

/** Documento de la nube visto desde el teléfono de Luis (siempre del servidor). */
async function luisVe(...ruta: [string, ...string[]]): Promise<DocumentData | undefined> {
  const snap = await getDocFromServer(doc(dbB, ruta[0], ...ruta.slice(1)))
  return snap.exists() ? snap.data() : undefined
}

/** Documento de la nube leído por la app con la cuenta que esté abierta. */
async function appVe(...ruta: [string, ...string[]]): Promise<DocumentData | undefined> {
  const snap = await getDocFromServer(doc(getDb(), ruta[0], ...ruta.slice(1)))
  return snap.exists() ? snap.data() : undefined
}

/** Cambia la cuenta abierta en la app (como cerrar sesión y entrar con otra). */
async function entrarComo(p: typeof ANA) {
  if (getAuthClient().currentUser) await signOut()
  await signIn(p.correo, p.clave)
}

/** Deja la sesión de la app (src/session.ts) como si `uid` tuviera abierta la colección. */
function sesionDe(uid: string, nombre: string, col: Collection) {
  setSession({ status: 'signed-in', cloudAvailable: true, person: { uid, name: nombre }, collection: col, memberships: [{ id: col.id, name: col.name }] })
  registerCloudWrites(makeCloudWrites(col.id, uid))
}

async function coleccionActual(): Promise<Collection> {
  const data = await appVe('collections', cid)
  if (!data) throw new Error('La colección ya no existe')
  return collectionFromDoc(cid, data)
}

/** Espera a que las escrituras de la app (que no se esperan en la interfaz) lleguen al servidor. */
const enviado = () => waitForPendingWrites(getDb())

beforeAll(async () => {
  await limpiarEmulador()
  // mirror.ts escucha online/offline en window; en Node no existe.
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
  const fs = firestoreEmulador()
  const au = authEmulador()
  appB = initializeApp({ apiKey: 'demo', projectId: PROYECTO, appId: 'demo', authDomain: 'localhost' }, 'telefono-de-luis')
  connectAuthEmulator(getAuth(appB), `http://${au.host}:${au.port}`, { disableWarnings: true })
  dbB = initializeFirestore(appB, { localCache: memoryLocalCache() })
  connectFirestoreEmulator(dbB, fs.host, fs.port)
})

afterAll(async () => {
  pararEspejo?.()
  registerCloudWrites(null)
  if (getAuthClient().currentUser) await signOut()
  await terminate(getDb())
  await terminate(dbB)
  await deleteApp(appB)
  vi.unstubAllGlobals()
})

describe('cuentas', () => {
  it('la app está apuntando al emulador', () => {
    expect(usingEmulator()).toBe(true)
  })

  it('Ana y Luis crean su cuenta y queda su perfil en la nube', async () => {
    await signUp(ANA.nombre, ANA.correo, ANA.clave)
    const a = getAuthClient().currentUser
    expect(a?.displayName).toBe('Ana')
    uidA = a!.uid
    const perfilA = await appVe('users', uidA)
    expect(perfilA).toMatchObject({ name: 'Ana', email: ANA.correo, collections: [] })
    await signOut()

    await signUp(LUIS.nombre, LUIS.correo, LUIS.clave)
    uidB = getAuthClient().currentUser!.uid
    expect(uidB).not.toBe(uidA)
    expect(await appVe('users', uidB)).toMatchObject({ name: 'Luis', collections: [] })
    await signOut()

    // Luis también entra desde su propio teléfono.
    await signInWithEmailAndPassword(getAuth(appB), LUIS.correo, LUIS.clave)
  })

  it('los errores de cuenta llegan en español', async () => {
    await expect(signUp('Otra', ANA.correo, 'loquesea1')).rejects.toThrow('Ya hay una cuenta con ese correo')
    await expect(signIn(ANA.correo, 'equivocada')).rejects.toThrow('Correo o contraseña incorrectos')
    await expect(signIn('esto-no-es-correo', 'x')).rejects.toThrow('Ese correo no se ve bien')
    expect(getAuthClient().currentUser).toBeNull()
  })

  it('sin sesión, la app no deja crear colecciones', async () => {
    await expect(createCollection('Sin cuenta')).rejects.toThrow('Primero entra con tu cuenta')
  })
})

describe('la colección de la familia', () => {
  it('Ana crea "Familia Prueba": queda la colección, su código y su perfil', async () => {
    await entrarComo(ANA)
    cid = await createCollection('  Familia Prueba ')
    expect(cid).toBeTruthy()

    const col = await appVe('collections', cid)
    expect(col).toMatchObject({ name: 'Familia Prueba', ownerUid: uidA })
    expect(Object.keys(col!.members)).toEqual([uidA])
    expect(col!.members[uidA]).toMatchObject({ name: 'Ana', role: 'owner' })
    expect(typeof col!.members[uidA].joinedAt).toBe('string')
    codigo = col!.inviteCode
    expect(codigo).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)

    const invite = await appVe('invites', codigo)
    expect(invite).toMatchObject({ collectionId: cid, collectionName: 'Familia Prueba', createdBy: uidA })

    const perfil = await appVe('users', uidA)
    expect(perfil!.collections).toContain(cid)
    expect(perfil!.activeCollection).toBe(cid)
  })

  it('el código se puede ver antes de unirse; uno inventado avisa que ya no sirve', async () => {
    await entrarComo(LUIS)
    expect(await previewInvite(` ${codigo.toLowerCase()} `)).toEqual({ collectionId: cid, collectionName: 'Familia Prueba' })
    await expect(previewInvite('NOHAY2')).rejects.toThrow('Ese enlace ya no sirve')
  })

  it('Luis entra con el código y queda como editor', async () => {
    expect(await joinWithCode(codigo.toLowerCase())).toBe(cid)

    const col = await luisVe('collections', cid)
    expect(col!.members[uidB]).toMatchObject({ name: 'Luis', role: 'editor' })
    expect(col!.members[uidA]).toMatchObject({ role: 'owner' })
    expect(col!.ownerUid).toBe(uidA)

    const perfil = await luisVe('users', uidB)
    expect(perfil!.collections).toContain(cid)
    expect(perfil!.activeCollection).toBe(cid)

    const tipada = collectionFromDoc(cid, col!)
    expect(Object.keys(tipada.members).sort()).toEqual([uidA, uidB].sort())
    expect(tipada.inviteCode).toBe(codigo)
  })

  it('usar el enlace estando ya dentro no cambia nada: Ana sigue administrando y Luis sigue igual', async () => {
    const antes = (await appVe('collections', cid))!
    // Ana abre su propio enlace (por ejemplo en otro celular, al entrar con su cuenta).
    await entrarComo(ANA)
    expect(await joinWithCode(codigo)).toBe(cid)
    let col = (await appVe('collections', cid))!
    expect(col.members[uidA]).toEqual(antes.members[uidA])
    expect(col.members[uidA].role).toBe('owner')
    // El código con el que entró Luis sigue tal cual: la unión no se repitió.
    expect(col.joinCode).toBe(antes.joinCode)
    expect((await appVe('users', uidA))!.activeCollection).toBe(cid)

    // Luis repite el suyo: sigue como editor, con la misma fecha de entrada.
    await entrarComo(LUIS)
    expect(await joinWithCode(codigo)).toBe(cid)
    col = (await appVe('collections', cid))!
    expect(col.members[uidB]).toEqual(antes.members[uidB])
    expect(Object.keys(col.members).sort()).toEqual([uidA, uidB].sort())
  })

  it('el enlace de invitación lleva al código', () => {
    vi.stubGlobal('location', { origin: 'https://vinylist.ejemplo.mx' })
    expect(inviteLink(codigo)).toBe(`https://vinylist.ejemplo.mx/unirme/${codigo}`)
    vi.unstubAllGlobals()
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
    expect(makeInviteCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(makeInviteCode()).not.toBe(makeInviteCode())
  })
})

describe('discos compartidos', () => {
  it('Ana agrega un disco y Luis lo lee desde su teléfono', async () => {
    await entrarComo(ANA)
    const escribeA = makeCloudWrites(cid, uidA)
    const calificadoEl = '2026-03-01T10:00:00.000Z'
    disco = discoDePrueba({ title: 'Abbey Road', artist: 'The Beatles', rating: 8, ratedAt: calificadoEl, collectionId: 'lo-que-sea' })
    await escribeA.putAlbum(disco)
    await enviado()

    const enNube = await luisVe('collections', cid, 'albums', disco.id)
    expect(enNube).toBeDefined()
    expect(enNube).toMatchObject({ title: 'Abbey Road', artist: 'The Beatles' })
    // Lo que es solo del celular no viaja; la calificación va al mapa por persona.
    expect(enNube!.rating).toBeUndefined()
    expect(enNube!.ratedAt).toBeUndefined()
    expect(enNube!.collectionId).toBeUndefined()
    expect(enNube!.ratings).toEqual({ [uidA]: { rating: 8, at: calificadoEl } })
  })

  it('el espejo de Luis trae el disco a Dexie, de esta colección y sin calificación suya', async () => {
    pararEspejo = startMirror(cid, uidB)
    const fila = await esperarA(() => db.albums.get(disco.id), { que: 'el disco en el espejo' })
    expect(fila.collectionId).toBe(cid)
    expect(fila.title).toBe('Abbey Road')
    expect(fila.rating).toBeUndefined()
    expect(fila.ratedAt).toBeUndefined()
    expect(fila.ratings?.[uidA]?.rating).toBe(8)
    expect(fila.genres).toEqual(['Rock'])
    await esperarA(() => getSession().sync.state === 'synced', { que: 'el estado "al día"' })
  })

  it('Ana califica: el espejo de Luis muestra la de Ana y la propia sigue vacía', async () => {
    sesionDe(uidA, 'Ana', await coleccionActual())
    await updateAlbum(disco.id, { rating: 9 })
    await enviado()

    const fila = await esperarA(async () => {
      const f = await db.albums.get(disco.id)
      return f?.ratings?.[uidA]?.rating === 9 && f.rating === undefined ? f : undefined
    }, { que: 'la calificación de Ana en el espejo' })
    expect(fila.ratings?.[uidA]?.rating).toBe(9)
    expect(fila.ratings?.[uidA]?.at).toBe(fila.updatedAt)
    expect(fila.rating).toBeUndefined()
    expect(fila.ratedAt).toBeUndefined()

    const enNube = await luisVe('collections', cid, 'albums', disco.id)
    expect(enNube!.ratings[uidA].rating).toBe(9)
    expect(enNube!.rating).toBeUndefined()
  })

  it('Luis califica y aparece su calificación propia junto a la de Ana', async () => {
    sesionDe(uidB, 'Luis', await coleccionActual())
    await updateAlbum(disco.id, { rating: 6 })
    await enviado()

    const fila = await esperarA(async () => {
      const f = await db.albums.get(disco.id)
      return f?.rating === 6 && f.ratings?.[uidB]?.rating === 6 ? f : undefined
    }, { que: 'la calificación de Luis en el espejo' })
    expect(fila.ratedAt).toBeTruthy()
    expect(fila.ratings?.[uidA]?.rating).toBe(9)

    const enNube = await luisVe('collections', cid, 'albums', disco.id)
    expect(enNube!.ratings).toEqual({ [uidA]: { rating: 9, at: expect.any(String) }, [uidB]: { rating: 6, at: expect.any(String) } })
  })

  it('Luis quita su calificación y desaparece solo la suya', async () => {
    await updateAlbum(disco.id, { rating: undefined })
    await enviado()
    const fila = await esperarA(async () => {
      const f = await db.albums.get(disco.id)
      return f && f.rating === undefined && f.ratings?.[uidB] === undefined ? f : undefined
    }, { que: 'que se quite la calificación de Luis' })
    expect(fila.ratings?.[uidA]?.rating).toBe(9)
    const enNube = await luisVe('collections', cid, 'albums', disco.id)
    expect(Object.keys(enNube!.ratings)).toEqual([uidA])
  })

  it('si se borra el disco, desaparece del espejo y de la nube', async () => {
    await deleteAlbum(disco.id)
    await enviado()
    await esperarA(async () => (await db.albums.get(disco.id)) === undefined, { que: 'que el disco se vaya del espejo' })
    expect(await luisVe('collections', cid, 'albums', disco.id)).toBeUndefined()
  })
})

describe('deseos', () => {
  it('Luis pide un disco y Ana lo aparta para regalárselo', async () => {
    sesionDe(uidB, 'Luis', await coleccionActual())
    deseo = await addWish({ title: 'Kind of Blue', artist: 'Miles Davis', year: 1959 })
    expect(deseo).toMatchObject({ collectionId: cid, wantedBy: uidB, wantedByName: 'Luis' })
    await enviado()

    const enNube = await luisVe('collections', cid, 'wishlist', deseo.id)
    expect(enNube).toMatchObject({ title: 'Kind of Blue', wantedBy: uidB, wantedByName: 'Luis', year: 1959 })
    expect(enNube!.collectionId).toBeUndefined()
    expect(enNube!.reservedBy).toBeUndefined()

    // Ana lo aparta.
    sesionDe(uidA, 'Ana', await coleccionActual())
    await updateWish(deseo.id, { reservedBy: uidA, reservedByName: 'Ana' })
    await enviado()
    const apartado = await luisVe('collections', cid, 'wishlist', deseo.id)
    expect(apartado).toMatchObject({ reservedBy: uidA, reservedByName: 'Ana', wantedBy: uidB })

    const fila = await esperarA(async () => {
      const f = await db.wishlist.get(deseo.id)
      return f?.reservedBy === uidA ? f : undefined
    }, { que: 'el apartado en el espejo' })
    expect(fila.reservedByName).toBe('Ana')
    expect(fila.collectionId).toBe(cid)
  })

  it('si Ana cancela el apartado, el campo se quita de la nube', async () => {
    await updateWish(deseo.id, { reservedBy: undefined, reservedByName: undefined })
    await enviado()
    const enNube = await luisVe('collections', cid, 'wishlist', deseo.id)
    expect(enNube!.reservedBy).toBeUndefined()
    expect(enNube!.reservedByName).toBeUndefined()
    await esperarA(async () => (await db.wishlist.get(deseo.id))?.reservedBy === undefined, { que: 'que se quite el apartado del espejo' })
  })

  it('si se borra el deseo, desaparece de los dos lados', async () => {
    await deleteWish(deseo.id)
    await enviado()
    expect(await luisVe('collections', cid, 'wishlist', deseo.id)).toBeUndefined()
    await esperarA(async () => (await db.wishlist.get(deseo.id)) === undefined, { que: 'que el deseo se vaya del espejo' })
  })
})

describe('subir lo que había en el celular', () => {
  it('3 discos y 1 deseo locales suben a la colección y quedan re-etiquetados', async () => {
    pararEspejo?.()
    pararEspejo = undefined
    registerCloudWrites(null)
    await entrarComo(ANA)

    const locales = [
      discoDePrueba({ title: 'Local uno', collectionId: 'local', rating: 7, ratedAt: '2026-01-05T00:00:00.000Z' }),
      discoDePrueba({ title: 'Local dos', collectionId: 'local' }),
      discoDePrueba({ title: 'Local tres', collectionId: 'local', notes: 'Regalo de la abuela' }),
    ]
    await db.albums.bulkAdd(locales)
    const deseoLocal: WishlistItem = { id: 'deseo-local-1', collectionId: 'local', title: 'Blue', artist: 'Joni Mitchell', wantedBy: 'Yo', wantedByName: 'Yo', addedAt: new Date().toISOString() }
    await db.wishlist.add(deseoLocal)
    expect(await localCounts()).toEqual({ albums: 3, wishes: 1 })

    const avances: [number, number][] = []
    const total = await uploadLocal(cid, (hecho, tot) => avances.push([hecho, tot]))
    expect(total).toBe(4)
    expect(avances.at(-1)).toEqual([4, 4])
    expect(avances.length).toBeGreaterThanOrEqual(2)

    // Ya no queda nada "local": ahora todo es de la colección, con los mismos ids.
    expect(await localCounts()).toEqual({ albums: 0, wishes: 0 })
    const filas = await db.albums.where('collectionId').equals(cid).toArray()
    expect(filas.map((f) => f.id).sort()).toEqual(locales.map((l) => l.id).sort())
    expect((await db.wishlist.get(deseoLocal.id))?.collectionId).toBe(cid)

    // Y Luis los ve en la nube, anotados como agregados por Ana.
    for (const l of locales) {
      const enNube = await luisVe('collections', cid, 'albums', l.id)
      expect(enNube).toMatchObject({ title: l.title, addedBy: uidA })
      expect(enNube!.collectionId).toBeUndefined()
      expect(enNube!.rating).toBeUndefined()
    }
    expect((await luisVe('collections', cid, 'albums', locales[0].id))!.ratings).toEqual({ [uidA]: { rating: 7, at: '2026-01-05T00:00:00.000Z' } })
    expect((await luisVe('collections', cid, 'albums', locales[1].id))!.ratings).toEqual({})
    expect((await luisVe('collections', cid, 'albums', locales[2].id))!.notes).toBe('Regalo de la abuela')

    const deseoNube = await luisVe('collections', cid, 'wishlist', deseoLocal.id)
    expect(deseoNube).toMatchObject({ title: 'Blue', wantedBy: uidA, wantedByName: 'Ana' })
    expect(deseoNube!.collectionId).toBeUndefined()
  })
})

describe('ajustes y salida', () => {
  it('Ana cambia su nombre, el de la colección y el token de Discogs', async () => {
    await entrarComo(ANA)
    await renameMe(cid, ' Ana María ')
    expect((await appVe('users', uidA))!.name).toBe('Ana María')
    expect((await appVe('collections', cid))!.members[uidA].name).toBe('Ana María')
    expect(getSession().person.name).toBe('Ana María')

    await renameCollection(cid, 'Los Tapia')
    expect((await appVe('collections', cid))!.name).toBe('Los Tapia')

    await setDiscogsToken(cid, ' token-familiar ')
    expect((await luisVe('collections', cid))!.discogsToken).toBe('token-familiar')
    await setDiscogsToken(cid, '')
    expect((await luisVe('collections', cid))!.discogsToken).toBeUndefined()
  })

  it('después de cambiar el nombre, crear otra colección no lo pisa', async () => {
    expect(getAuthClient().currentUser!.displayName).toBe('Ana María')
    const otra = await createCollection('Solo de Ana')
    expect((await appVe('collections', otra))!.members[uidA]).toMatchObject({ name: 'Ana María', role: 'owner' })
    const perfil = (await appVe('users', uidA))!
    expect(perfil.name).toBe('Ana María')
    expect(perfil.collections).toEqual([cid, otra])
    expect(perfil.activeCollection).toBe(otra)
    expect(getSession().person.name).toBe('Ana María')
  })

  it('Luis se sale: ya no es miembro y su perfil olvida la colección', async () => {
    await entrarComo(LUIS)
    await leaveCollection(cid)
    const perfil = await appVe('users', uidB)
    expect(perfil!.collections).not.toContain(cid)
    expect(perfil!.activeCollection).toBeUndefined()
    // Ya sin ser miembro, la nube no le deja ver la colección.
    await expect(appVe('collections', cid)).rejects.toThrow()

    await entrarComo(ANA)
    const col = await appVe('collections', cid)
    expect(Object.keys(col!.members)).toEqual([uidA])
  })

  it('un código nuevo deja sin efecto el anterior y sirve para volver a entrar', async () => {
    const nuevo = await regenerateInvite(cid)
    expect(nuevo).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(nuevo).not.toBe(codigo)
    expect(await appVe('invites', codigo)).toBeUndefined()
    expect(await appVe('invites', nuevo)).toMatchObject({ collectionId: cid, collectionName: 'Los Tapia', createdBy: uidA })
    expect((await appVe('collections', cid))!.inviteCode).toBe(nuevo)
    await expect(previewInvite(codigo)).rejects.toThrow('Ese enlace ya no sirve')
    expect(await previewInvite(nuevo)).toEqual({ collectionId: cid, collectionName: 'Los Tapia' })

    await entrarComo(LUIS)
    await expect(joinWithCode(codigo)).rejects.toThrow('Ese enlace ya no sirve')
    expect(await joinWithCode(nuevo)).toBe(cid)
    expect((await appVe('collections', cid))!.members[uidB]).toMatchObject({ name: 'Luis', role: 'editor' })
    codigo = nuevo
  })

  it('Ana saca a Luis de la colección y el enlace que él tenía deja de servir', async () => {
    await entrarComo(ANA)
    const viejo = codigo
    const nuevo = await removeMember(cid, uidB)
    const col = (await appVe('collections', cid))!
    expect(Object.keys(col.members)).toEqual([uidA])
    expect(nuevo).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(nuevo).not.toBe(viejo)
    expect(col.inviteCode).toBe(nuevo)
    expect(await appVe('invites', viejo)).toBeUndefined()
    expect(await appVe('invites', nuevo)).toMatchObject({ collectionId: cid, createdBy: uidA })
    await expect(previewInvite(viejo)).rejects.toThrow('Ese enlace ya no sirve')
    codigo = nuevo
    codigoViejo = viejo
  })

  it('Luis, ya fuera, no vuelve con el enlace viejo; limpia su perfil y crea su propia colección', async () => {
    await entrarComo(LUIS)
    // La nube ya no le deja ver la colección, pero su perfil todavía la lista (nadie más puede escribirlo).
    await expect(appVe('collections', cid)).rejects.toThrow()
    await expect(joinWithCode(codigoViejo)).rejects.toThrow('Ese enlace ya no sirve')
    expect((await appVe('users', uidB))!.collections).toContain(cid)
    await db.albums.add(discoDePrueba({ title: 'Copia ajena', collectionId: cid }))

    // Es lo que hace la app al recibir "sin permiso" de la colección.
    await forgetCollection(cid)
    const perfil = (await appVe('users', uidB))!
    expect(perfil.collections).not.toContain(cid)
    expect(perfil.activeCollection).toBeUndefined()
    expect(await db.albums.where('collectionId').equals(cid).count()).toBe(0)
    // Salir de una colección en la que ya no se está tampoco falla.
    await expect(leaveCollection(cid)).resolves.toBeUndefined()

    const propia = await createCollection('La de Luis')
    expect((await appVe('collections', propia))!.members[uidB]).toMatchObject({ name: 'Luis', role: 'owner' })
    const despues = (await appVe('users', uidB))!
    expect(despues.collections).toEqual([propia])
    expect(despues.activeCollection).toBe(propia)
  })
})
