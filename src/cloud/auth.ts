import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getAuthClient, getDb } from './firebase'

/** Entrar con correo y contraseña. */
export async function signIn(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(getAuthClient(), email.trim(), password)
  } catch (e) {
    throw friendly(e)
  }
}

/** Crear la cuenta (primera vez) con nombre, correo y contraseña. */
export async function signUp(name: string, email: string, password: string): Promise<void> {
  try {
    const cred = await createUserWithEmailAndPassword(getAuthClient(), email.trim(), password)
    await updateProfile(cred.user, { displayName: name.trim() })
    await setDoc(doc(getDb(), 'users', cred.user.uid), { name: name.trim(), email: email.trim(), collections: [], createdAt: serverTimestamp() }, { merge: true })
  } catch (e) {
    throw friendly(e)
  }
}

export async function sendReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getAuthClient(), email.trim())
  } catch (e) {
    throw friendly(e)
  }
}

export async function signOut(): Promise<void> {
  await fbSignOut(getAuthClient())
}

export function onAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(getAuthClient(), cb)
}

/** Mensajes en español para los errores de Firebase Auth. */
export function friendly(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-email': 'Ese correo no se ve bien. Revísalo.',
    'auth/missing-password': 'Escribe tu contraseña.',
    'auth/weak-password': 'La contraseña necesita al menos 6 caracteres.',
    'auth/email-already-in-use': 'Ya hay una cuenta con ese correo. Entra con tu contraseña.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No hay cuenta con ese correo. ¿Es tu primera vez? Crea tu cuenta.',
    'auth/user-disabled': 'Esta cuenta está desactivada.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    'auth/network-request-failed': 'Sin conexión. Revisa el internet e intenta de nuevo.',
    'auth/operation-not-allowed': 'La entrada con correo no está activada en la nube.',
  }
  if (code in map) return Object.assign(new Error(map[code]), { code })
  if (e instanceof Error) return e
  return new Error('No se pudo completar. Intenta de nuevo.')
}
