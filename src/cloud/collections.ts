import { arrayRemove, arrayUnion, deleteField, doc, getDoc, getDocFromServer, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { getAuthClient, getDb } from './firebase'
import { albumToCloud, wishToCloud } from './writes'
import { db } from '../db'
import { getSession, LOCAL_COLLECTION, rememberCollectionId, rememberedCollectionId, setSession } from '../session'
import type { Collection } from '../types'

/** Código de invitación legible: 6 letras y números sin los que se confunden (0/O, 1/I). */
export function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/**
 * Quién soy para la nube. El nombre sale de la sesión (que refleja el perfil en la nube,
 * donde se guarda al cambiarlo en Ajustes) y, si la sesión aún no es de esta cuenta, del
 * perfil de autenticación.
 */
function me() {
  const u = getAuthClient().currentUser
  if (!u) throw new Error('Primero entra con tu cuenta.')
  const s = getSession()
  const name = (s.person.uid === u.uid && s.person.name) || u.displayName || u.email?.split('@')[0] || 'Yo'
  return { uid: u.uid, name }
}

/** Código de error de la nube ('permission-denied', 'unavailable'…), si lo trae. */
export function cloudErrorCode(e: unknown): string {
  return (e as { code?: string } | null)?.code ?? ''
}

export function isPermissionDenied(e: unknown): boolean {
  return cloudErrorCode(e).includes('permission-denied')
}

const SIN_INTERNET = 'Necesitas internet para esto. Intenta cuando tengas señal.'

/**
 * Mensaje en español para un error de la nube; nunca el texto crudo en inglés.
 * `fallback` es lo que se dice cuando la nube niega el permiso o no se sabe qué pasó.
 */
export function cloudErrorMessage(e: unknown, fallback: string): string {
  const code = cloudErrorCode(e)
  const text = e instanceof Error ? e.message : ''
  if (code.includes('unavailable') || /client is offline/i.test(text)) return SIN_INTERNET
  if (code.includes('permission') || /false for|Missing or insufficient/i.test(text)) return fallback
  return text || fallback
}

/** Sin señal, las escrituras que esperan confirmación nunca terminan: mejor avisar antes. */
function requireOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error(SIN_INTERNET)
}

/** Crea una colección nueva (la de tu familia) y te pone como quien la administra. */
export async function createCollection(name: string): Promise<string> {
  const { uid, name: myName } = me()
  requireOnline()
  const fs = getDb()
  const ref = doc(fs, 'collections', crypto.randomUUID())
  const code = makeInviteCode()
  const now = new Date().toISOString()
  const batch = writeBatch(fs)
  batch.set(ref, {
    name: name.trim() || 'Mi colección',
    ownerUid: uid,
    members: { [uid]: { name: myName, role: 'owner', joinedAt: now } },
    inviteCode: code,
    createdAt: now,
  })
  batch.set(doc(fs, 'invites', code), { collectionId: ref.id, collectionName: name.trim() || 'Mi colección', createdBy: uid, createdAt: serverTimestamp() })
  // El nombre del perfil no se toca: es el que la persona eligió en Ajustes.
  batch.set(doc(fs, 'users', uid), { collections: arrayUnion(ref.id), activeCollection: ref.id }, { merge: true })
  await batch.commit()
  rememberCollectionId(ref.id)
  return ref.id
}

export interface InvitePreview {
  collectionId: string
  collectionName: string
}

/** Qué colección hay detrás de un código, antes de unirse. */
export async function previewInvite(code: string): Promise<InvitePreview> {
  const clean = code.trim().toUpperCase()
  const snap = await getDocFromServer(doc(getDb(), 'invites', clean)).catch(() => getDoc(doc(getDb(), 'invites', clean)))
  if (!snap.exists()) throw new Error('Ese enlace ya no sirve. Pide uno nuevo a tu familia.')
  const d = snap.data()
  return { collectionId: d.collectionId as string, collectionName: (d.collectionName as string) || 'una colección' }
}

/**
 * ¿Ya soy miembro de esta colección? Solo un miembro puede leerla, así que leerla con éxito
 * lo prueba; si la nube niega el permiso, no lo soy. Sin internet se mira lo que haya en caché.
 */
async function alreadyMember(fs: Firestore, cid: string, uid: string): Promise<boolean> {
  const has = (snap: { exists(): boolean; data(): Record<string, unknown> | undefined }) =>
    snap.exists() && uid in ((snap.data()?.members as Record<string, unknown> | undefined) ?? {})
  try {
    return has(await getDocFromServer(doc(fs, 'collections', cid)))
  } catch (e) {
    if (isPermissionDenied(e)) return false
    try {
      return has(await getDoc(doc(fs, 'collections', cid)))
    } catch {
      return false
    }
  }
}

/**
 * Unirse a la colección de la familia con el código del enlace. Si ya se es miembro
 * (quien administra abre su propio enlace, o alguien repite el suyo), no se toca la
 * entrada en `members`: solo se deja esa colección como la activa.
 */
export async function joinWithCode(code: string): Promise<string> {
  const { uid, name } = me()
  requireOnline()
  const fs = getDb()
  const clean = code.trim().toUpperCase()
  const invite = await previewInvite(clean)
  const cid = invite.collectionId
  if (!(await alreadyMember(fs, cid, uid))) {
    const now = new Date().toISOString()
    // Las reglas de Firestore permiten este cambio solo si joinCode es un código válido de esta colección
    // y solo se toca la entrada propia de `members`.
    await updateDoc(doc(fs, 'collections', cid), { [`members.${uid}`]: { name, role: 'editor', joinedAt: now }, joinCode: clean })
  }
  await setDoc(doc(fs, 'users', uid), { collections: arrayUnion(cid), activeCollection: cid }, { merge: true })
  rememberCollectionId(cid)
  return cid
}

/** Cuántos discos y deseos hay en este celular sin cuenta, para ofrecer subirlos. */
export async function localCounts(): Promise<{ albums: number; wishes: number }> {
  return { albums: await db.albums.where('collectionId').equals(LOCAL_COLLECTION).count(), wishes: await db.wishlist.where('collectionId').equals(LOCAL_COLLECTION).count() }
}

/** Cuánto se espera la confirmación de un lote antes de darlo por "en cola hasta que haya señal". */
const UPLOAD_WAIT_MS = 15_000

/**
 * Espera la confirmación de la nube, pero no para siempre: si tarda más de la cuenta
 * (señal mala), la escritura ya quedó guardada en el celular y se manda sola después.
 * Devuelve false si se siguió sin confirmación.
 */
async function awaitOrQueue(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((r) => { timer = setTimeout(() => r(false), ms) })
  try {
    return await Promise.race([p.then(() => true), timeout])
  } finally {
    clearTimeout(timer)
    p.catch((e) => console.warn('nube:', e))
  }
}

/**
 * Sube a la colección de la nube lo que había en este celular sin cuenta.
 * Los ids se conservan; las filas locales pasan a ser de la colección (el espejo las volverá a escribir igual).
 */
export async function uploadLocal(cid: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const { uid, name } = me()
  requireOnline()
  const fs = getDb()
  const albums = await db.albums.where('collectionId').equals(LOCAL_COLLECTION).toArray()
  const wishes = await db.wishlist.where('collectionId').equals(LOCAL_COLLECTION).toArray()
  const total = albums.length + wishes.length
  let done = 0
  // Si un lote no se confirma a tiempo, los siguientes ya no se esperan: todos quedan en cola.
  let waiting = true
  const CHUNK = 200
  for (let i = 0; i < albums.length; i += CHUNK) {
    const batch = writeBatch(fs)
    for (const a of albums.slice(i, i + CHUNK)) batch.set(doc(fs, 'collections', cid, 'albums', a.id), { ...albumToCloud({ ...a, addedBy: a.addedBy ?? uid }, uid) })
    if (waiting) waiting = await awaitOrQueue(batch.commit(), UPLOAD_WAIT_MS)
    else batch.commit().catch((e) => console.warn('nube:', e))
    done += Math.min(CHUNK, albums.length - i)
    onProgress?.(done, total)
  }
  for (let i = 0; i < wishes.length; i += CHUNK) {
    const batch = writeBatch(fs)
    for (const w of wishes.slice(i, i + CHUNK)) {
      const mine = w.wantedBy === LOCAL_COLLECTION || w.wantedBy === 'local' || w.wantedBy === w.wantedByName
      batch.set(doc(fs, 'collections', cid, 'wishlist', w.id), wishToCloud({ ...w, wantedBy: mine ? uid : w.wantedBy, wantedByName: mine ? name : w.wantedByName, reservedBy: w.reservedBy === w.reservedByName ? undefined : w.reservedBy, reservedByName: w.reservedBy === w.reservedByName ? undefined : w.reservedByName }))
    }
    if (waiting) waiting = await awaitOrQueue(batch.commit(), UPLOAD_WAIT_MS)
    else batch.commit().catch((e) => console.warn('nube:', e))
    done += Math.min(CHUNK, wishes.length - i)
    onProgress?.(done, total)
  }
  await db.transaction('rw', db.albums, db.wishlist, async () => {
    await db.albums.where('collectionId').equals(LOCAL_COLLECTION).modify({ collectionId: cid })
    await db.wishlist.where('collectionId').equals(LOCAL_COLLECTION).modify({ collectionId: cid })
  })
  return total
}

export async function setActiveCollection(cid: string | null): Promise<void> {
  const { uid } = me()
  rememberCollectionId(cid ?? undefined)
  await setDoc(doc(getDb(), 'users', uid), { activeCollection: cid ?? deleteField() }, { merge: true })
}

export async function renameCollection(cid: string, name: string): Promise<void> {
  await updateDoc(doc(getDb(), 'collections', cid), { name: name.trim() || 'Mi colección' })
}

/** Cambiar mi nombre en la colección y en mi perfil. */
export async function renameMe(cid: string | null, name: string): Promise<void> {
  const { uid } = me()
  const clean = name.trim() || 'Yo'
  const fs = getDb()
  await setDoc(doc(fs, 'users', uid), { name: clean }, { merge: true })
  if (cid) await updateDoc(doc(fs, 'collections', cid), { [`members.${uid}.name`]: clean })
  setSession((s) => ({ person: { ...s.person, name: clean } }))
  // También en la cuenta, para que el nombre siga igual aunque la sesión no lo tenga a mano.
  const u = getAuthClient().currentUser
  if (u) await updateProfile(u, { displayName: clean }).catch(() => undefined)
}

/** Guarda el token de Discogs de la familia en la colección (solo lo leen sus miembros). */
export async function setDiscogsToken(cid: string, token: string): Promise<void> {
  await updateDoc(doc(getDb(), 'collections', cid), { discogsToken: token.trim() || deleteField() })
}

/**
 * Dentro de una transacción: código nuevo para la colección, el anterior deja de servir.
 * `extra` son otros cambios de la colección que van en el mismo paso.
 */
async function rotateInvite(cid: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { uid } = me()
  const fs = getDb()
  const col = await getDoc(doc(fs, 'collections', cid))
  const old = col.data()?.inviteCode as string | undefined
  const code = makeInviteCode()
  const colName = (col.data()?.name as string) || 'Mi colección'
  await runTransaction(fs, async (tx) => {
    tx.set(doc(fs, 'invites', code), { collectionId: cid, collectionName: colName, createdBy: uid, createdAt: serverTimestamp() })
    tx.update(doc(fs, 'collections', cid), { ...extra, inviteCode: code })
    if (old) tx.delete(doc(fs, 'invites', old))
  })
  return code
}

/** Un código nuevo deja sin efecto el anterior. */
export async function regenerateInvite(cid: string): Promise<string> {
  return rotateInvite(cid)
}

/**
 * Olvidar una colección a la que ya no se pertenece (te sacaron, o ya no existe): se quita
 * del perfil propio y sus discos y deseos salen de este celular. Solo toca lo propio, así
 * que funciona aunque la nube ya no deje ver la colección.
 */
export async function forgetCollection(cid: string): Promise<void> {
  const { uid } = me()
  const fs = getDb()
  if (rememberedCollectionId() === cid) rememberCollectionId(undefined)
  // Primero lo del celular (es inmediato); la nube confirma el perfil cuando puede.
  await db.transaction('rw', db.albums, db.wishlist, async () => {
    await db.albums.where('collectionId').equals(cid).delete()
    await db.wishlist.where('collectionId').equals(cid).delete()
  })
  const ref = doc(fs, 'users', uid)
  const active = await getDoc(ref).then((s) => s.data()?.activeCollection as string | undefined).catch(() => cid)
  await setDoc(ref, { collections: arrayRemove(cid), ...(active === cid ? { activeCollection: deleteField() } : {}) }, { merge: true })
}

/**
 * Salir de una colección (quien la administra no puede salir; la borraría).
 * Si ya no se es miembro (te sacaron antes), la nube niega el cambio en la colección
 * y aun así se limpia el perfil propio.
 */
export async function leaveCollection(cid: string): Promise<void> {
  const { uid } = me()
  const fs = getDb()
  try {
    await updateDoc(doc(fs, 'collections', cid), { [`members.${uid}`]: deleteField() })
  } catch (e) {
    if (!isPermissionDenied(e)) throw e
  }
  await forgetCollection(cid)
}

/**
 * Quien administra puede sacar a alguien. En el mismo paso se renueva el enlace de
 * invitación: el que la persona guardó deja de servir, si no volvería a entrar con él.
 * Devuelve el código nuevo.
 */
export async function removeMember(cid: string, uid: string): Promise<string> {
  return rotateInvite(cid, { [`members.${uid}`]: deleteField() })
}

export function inviteLink(code: string): string {
  const base = `${location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
  return `${base}/unirme/${code}`
}

export function collectionFromDoc(id: string, data: Record<string, unknown>): Collection {
  return {
    id,
    name: (data.name as string) || 'Mi colección',
    ownerUid: data.ownerUid as string,
    members: (data.members as Collection['members']) ?? {},
    inviteCode: data.inviteCode as string | undefined,
    discogsToken: data.discogsToken as string | undefined,
    createdAt: (data.createdAt as string) || '',
  }
}
