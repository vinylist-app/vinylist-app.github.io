import { arrayRemove, arrayUnion, deleteField, doc, getDoc, getDocFromServer, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { getAuthClient, getDb } from './firebase'
import { albumToCloud, wishToCloud } from './writes'
import { db } from '../db'
import { LOCAL_COLLECTION, rememberCollectionId, setSession } from '../session'
import type { Collection } from '../types'

/** Código de invitación legible: 6 letras y números sin los que se confunden (0/O, 1/I). */
export function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function me() {
  const u = getAuthClient().currentUser
  if (!u) throw new Error('Primero entra con tu cuenta.')
  return { uid: u.uid, name: u.displayName || u.email?.split('@')[0] || 'Yo' }
}

/** Crea una colección nueva (la de tu familia) y te pone como quien la administra. */
export async function createCollection(name: string): Promise<string> {
  const { uid, name: myName } = me()
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
  batch.set(doc(fs, 'users', uid), { name: myName, collections: arrayUnion(ref.id), activeCollection: ref.id }, { merge: true })
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

/** Unirse a la colección de la familia con el código del enlace. */
export async function joinWithCode(code: string): Promise<string> {
  const { uid, name } = me()
  const fs = getDb()
  const clean = code.trim().toUpperCase()
  const invite = await previewInvite(clean)
  const now = new Date().toISOString()
  // Las reglas de Firestore permiten este cambio solo si joinCode es un código válido de esta colección
  // y solo se toca la entrada propia de `members`.
  await updateDoc(doc(fs, 'collections', invite.collectionId), { [`members.${uid}`]: { name, role: 'editor', joinedAt: now }, joinCode: clean })
  await setDoc(doc(fs, 'users', uid), { name, collections: arrayUnion(invite.collectionId), activeCollection: invite.collectionId }, { merge: true })
  rememberCollectionId(invite.collectionId)
  return invite.collectionId
}

/** Cuántos discos y deseos hay en este celular sin cuenta, para ofrecer subirlos. */
export async function localCounts(): Promise<{ albums: number; wishes: number }> {
  return { albums: await db.albums.where('collectionId').equals(LOCAL_COLLECTION).count(), wishes: await db.wishlist.where('collectionId').equals(LOCAL_COLLECTION).count() }
}

/**
 * Sube a la colección de la nube lo que había en este celular sin cuenta.
 * Los ids se conservan; las filas locales pasan a ser de la colección (el espejo las volverá a escribir igual).
 */
export async function uploadLocal(cid: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const { uid, name } = me()
  const fs = getDb()
  const albums = await db.albums.where('collectionId').equals(LOCAL_COLLECTION).toArray()
  const wishes = await db.wishlist.where('collectionId').equals(LOCAL_COLLECTION).toArray()
  const total = albums.length + wishes.length
  let done = 0
  const CHUNK = 200
  for (let i = 0; i < albums.length; i += CHUNK) {
    const batch = writeBatch(fs)
    for (const a of albums.slice(i, i + CHUNK)) batch.set(doc(fs, 'collections', cid, 'albums', a.id), { ...albumToCloud({ ...a, addedBy: a.addedBy ?? uid }, uid) })
    await batch.commit()
    done += Math.min(CHUNK, albums.length - i)
    onProgress?.(done, total)
  }
  for (let i = 0; i < wishes.length; i += CHUNK) {
    const batch = writeBatch(fs)
    for (const w of wishes.slice(i, i + CHUNK)) {
      const mine = w.wantedBy === LOCAL_COLLECTION || w.wantedBy === 'local' || w.wantedBy === w.wantedByName
      batch.set(doc(fs, 'collections', cid, 'wishlist', w.id), wishToCloud({ ...w, wantedBy: mine ? uid : w.wantedBy, wantedByName: mine ? name : w.wantedByName, reservedBy: w.reservedBy === w.reservedByName ? undefined : w.reservedBy, reservedByName: w.reservedBy === w.reservedByName ? undefined : w.reservedByName }))
    }
    await batch.commit()
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
}

/** Guarda el token de Discogs de la familia en la colección (solo lo leen sus miembros). */
export async function setDiscogsToken(cid: string, token: string): Promise<void> {
  await updateDoc(doc(getDb(), 'collections', cid), { discogsToken: token.trim() || deleteField() })
}

/** Un código nuevo deja sin efecto el anterior. */
export async function regenerateInvite(cid: string): Promise<string> {
  const { uid } = me()
  const fs = getDb()
  const col = await getDoc(doc(fs, 'collections', cid))
  const old = col.data()?.inviteCode as string | undefined
  const code = makeInviteCode()
  const colName = (col.data()?.name as string) || 'Mi colección'
  await runTransaction(fs, async (tx) => {
    tx.set(doc(fs, 'invites', code), { collectionId: cid, collectionName: colName, createdBy: uid, createdAt: serverTimestamp() })
    tx.update(doc(fs, 'collections', cid), { inviteCode: code })
    if (old) tx.delete(doc(fs, 'invites', old))
  })
  return code
}

/** Salir de una colección (quien la administra no puede salir; la borraría). */
export async function leaveCollection(cid: string): Promise<void> {
  const { uid } = me()
  const fs = getDb()
  await updateDoc(doc(fs, 'collections', cid), { [`members.${uid}`]: deleteField() })
  await setDoc(doc(fs, 'users', uid), { collections: arrayRemove(cid), activeCollection: deleteField() }, { merge: true })
  rememberCollectionId(undefined)
}

/** Quien administra puede sacar a alguien. */
export async function removeMember(cid: string, uid: string): Promise<void> {
  await updateDoc(doc(getDb(), 'collections', cid), { [`members.${uid}`]: deleteField() })
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
