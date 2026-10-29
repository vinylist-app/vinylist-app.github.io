import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'
import rawConfig from './firebase-config.json'

/**
 * Conexión con Firebase (Auth + Firestore). La configuración es pública por
 * diseño (va en cualquier app web de Firebase); lo que protege los datos son
 * las reglas de Firestore (firebase/firestore.rules). Si el archivo de
 * configuración está vacío, la app funciona solo en el celular.
 */
// Con VITE_FIREBASE_EMULATOR=1 (pruebas) se usa el emulador local con un proyecto de mentira.
const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === '1'
const config: FirebaseOptions = EMULATOR ? { apiKey: 'demo', projectId: 'demo-vinylist', appId: 'demo', authDomain: 'localhost' } : (rawConfig as FirebaseOptions)

export { cloudConfigured } from './config'

export function usingEmulator(): boolean {
  return EMULATOR
}

const EMULATOR_HOST = typeof location !== 'undefined' && location.hostname ? location.hostname : '127.0.0.1'

let app: FirebaseApp | undefined
let auth: Auth | undefined
let firestore: Firestore | undefined

export function getApp(): FirebaseApp {
  if (!app) app = initializeApp(config)
  return app
}

export function getAuthClient(): Auth {
  if (!auth) {
    auth = getAuth(getApp())
    if (EMULATOR) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true })
  }
  return auth
}

export function getDb(): Firestore {
  if (!firestore) {
    firestore = initializeFirestore(getApp(), {
      // Los datos se guardan en el celular y las escrituras esperan a que haya internet.
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    })
    if (EMULATOR) connectFirestoreEmulator(firestore, EMULATOR_HOST, 8080)
  }
  return firestore
}
