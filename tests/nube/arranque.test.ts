/// <reference types="node" />
/**
 * Arranque de la nube (src/cloud/index.ts) contra el emulador, con el código real de la app:
 * al entrar, la app carga los nombres de todas las colecciones propias y abre la activa;
 * si a la persona la sacan de su colección, la app lo nota sola, limpia su perfil y la
 * deja crear otra. Ana actúa desde "su teléfono" (un segundo cliente) para sacar a Luis.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { connectFirestoreEmulator, deleteField, doc, getDocFromServer, initializeFirestore, memoryLocalCache, terminate, updateDoc, type DocumentData, type Firestore } from 'firebase/firestore'

import { startCloud } from '../../src/cloud'
import { signIn, signOut, signUp } from '../../src/cloud/auth'
import { createCollection, joinWithCode } from '../../src/cloud/collections'
import { getAuthClient, getDb } from '../../src/cloud/firebase'
import { db } from '../../src/db'
import { getSession } from '../../src/session'
import { authEmulador, discoDePrueba, esperarA, exigirEmulador, firestoreEmulador, limpiarEmulador, PROYECTO } from './emulador'

await exigirEmulador()

const ANA = { nombre: 'Ana', correo: 'ana@arranque.mx', clave: 'secreta-ana' }
const LUIS = { nombre: 'Luis', correo: 'luis@arranque.mx', clave: 'secreta-luis' }

let uidA = ''
let uidB = ''
let casa = ''
let cabana = ''

// El teléfono de Ana: un segundo cliente, independiente de la app.
let appA: FirebaseApp
let dbA: Firestore

/** Documento de la nube leído por la app con la cuenta que esté abierta. */
async function appVe(...ruta: [string, ...string[]]): Promise<DocumentData | undefined> {
  const snap = await getDocFromServer(doc(getDb(), ruta[0], ...ruta.slice(1)))
  return snap.exists() ? snap.data() : undefined
}

const nombres = () => getSession().memberships.map((m) => m.name).sort()

beforeAll(async () => {
  await limpiarEmulador()
  // La base de la app se abre antes de fingir `window`, para que use la caché en memoria (la de Node).
  getDb()
  // mirror.ts escucha online/offline en window; en Node no existe.
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })

  // Datos de partida, sin el arranque todavía: Ana con dos colecciones, Luis en "Casa".
  await signUp(ANA.nombre, ANA.correo, ANA.clave)
  uidA = getAuthClient().currentUser!.uid
  casa = await createCollection('Casa')
  cabana = await createCollection('Cabaña')
  const codigoCasa = (await appVe('collections', casa))!.inviteCode as string
  await signOut()
  await signUp(LUIS.nombre, LUIS.correo, LUIS.clave)
  uidB = getAuthClient().currentUser!.uid
  await joinWithCode(codigoCasa)
  await signOut()

  const fs = firestoreEmulador()
  const au = authEmulador()
  appA = initializeApp({ apiKey: 'demo', projectId: PROYECTO, appId: 'demo', authDomain: 'localhost' }, 'telefono-de-ana')
  connectAuthEmulator(getAuth(appA), `http://${au.host}:${au.port}`, { disableWarnings: true })
  dbA = initializeFirestore(appA, { localCache: memoryLocalCache() })
  connectFirestoreEmulator(dbA, fs.host, fs.port)
  await signInWithEmailAndPassword(getAuth(appA), ANA.correo, ANA.clave)
})

afterAll(async () => {
  if (getAuthClient().currentUser) await signOut()
  await terminate(getDb())
  await terminate(dbA)
  await deleteApp(appA)
  vi.unstubAllGlobals()
})

describe('arranque de la nube', () => {
  it('sin sesión, la app queda en modo solo celular', async () => {
    startCloud()
    expect(getSession().cloudAvailable).toBe(true)
    await esperarA(() => getSession().status === 'signed-out', { que: 'la sesión cerrada' })
    expect(getSession().collection).toBeNull()
    expect(getSession().memberships).toEqual([])
  })

  it('al entrar, Ana ve los nombres de sus dos colecciones y abre la última que usó', async () => {
    await signIn(ANA.correo, ANA.clave)
    await esperarA(() => getSession().memberships.length === 2, { que: 'las dos colecciones de Ana' })
    expect(nombres()).toEqual(['Cabaña', 'Casa'])
    await esperarA(() => getSession().collection?.id === cabana, { que: 'la colección activa de Ana' })
    expect(getSession().collection?.members[uidA]).toMatchObject({ name: 'Ana', role: 'owner' })
    expect(getSession().person).toMatchObject({ uid: uidA, name: 'Ana' })
    await esperarA(() => getSession().sync.state === 'synced', { que: 'el estado "al día"' })
  })

  it('Luis entra y abre "Casa"', async () => {
    await signOut()
    await esperarA(() => getSession().status === 'signed-out', { que: 'la salida de Ana' })
    expect(getSession().collection).toBeNull()

    await signIn(LUIS.correo, LUIS.clave)
    await esperarA(() => getSession().collection?.id === casa, { que: 'la colección de Luis' })
    await esperarA(() => getSession().memberships.length === 1, { que: 'la membresía de Luis' })
    expect(nombres()).toEqual(['Casa'])
    await esperarA(() => getSession().sync.state === 'synced', { que: 'el estado "al día"' })
    await db.albums.add(discoDePrueba({ title: 'Copia de Casa', collectionId: casa }))
  })

  it('si Ana lo saca, la app de Luis se queda sin colección, limpia su perfil y lo deja crear la suya', async () => {
    // Ana, desde su teléfono, lo quita de la colección.
    await updateDoc(doc(dbA, 'collections', casa), { [`members.${uidB}`]: deleteField() })

    await esperarA(() => getSession().collection === null, { que: 'que la app suelte la colección' })
    await esperarA(() => getSession().memberships.length === 0, { que: 'que se olvide la membresía' })
    await esperarA(async () => !((await appVe('users', uidB))!.collections as string[]).includes(casa), { que: 'el perfil limpio' })
    expect((await appVe('users', uidB))!.activeCollection).toBeUndefined()
    expect(getSession().sync.state).toBe('local')
    expect(getSession().status).toBe('signed-in')
    // Los discos ajenos ya no están en este celular.
    await esperarA(async () => (await db.albums.where('collectionId').equals(casa).count()) === 0, { que: 'que se borre la copia ajena' })

    const propia = await createCollection('La de Luis')
    await esperarA(() => getSession().collection?.id === propia, { que: 'la colección nueva de Luis' })
    await esperarA(() => nombres().join() === 'La de Luis', { que: 'el nombre de la colección nueva' })
    expect(getSession().collection?.members[uidB]).toMatchObject({ name: 'Luis', role: 'owner' })
  })
})
