import { deleteDoc, deleteField, doc, setDoc, updateDoc, type DocumentData, type UpdateData } from 'firebase/firestore'
import { getDb } from './firebase'
import type { CloudWrites } from './bridge'
import type { Album, WishlistItem } from '../types'

/** Campos que solo existen en el celular (derivados por persona o de la base local). */
const LOCAL_ONLY: (keyof Album)[] = ['rating', 'ratedAt', 'collectionId']

export function albumToCloud(album: Album, uid: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(album)) {
    if (LOCAL_ONLY.includes(k as keyof Album) || v === undefined) continue
    out[k] = v
  }
  const ratings = { ...(album.ratings ?? {}) }
  if (album.rating) ratings[uid] = { rating: album.rating, at: album.ratedAt ?? album.updatedAt }
  out.ratings = ratings
  return out
}

export function wishToCloud(item: WishlistItem): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(item)) {
    if (k === 'collectionId' || v === undefined) continue
    out[k] = v
  }
  return out
}

/**
 * Traduce un cambio local a una actualización de Firestore. La calificación
 * propia va al mapa `ratings` bajo el uid; un undefined borra el campo.
 */
export function albumPatchToCloud(changes: Partial<Album>, uid: string): UpdateData<DocumentData> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(changes)) {
    if (k === 'rating') {
      out[`ratings.${uid}`] = v ? { rating: v, at: changes.ratedAt ?? changes.updatedAt ?? new Date().toISOString() } : deleteField()
      continue
    }
    if (k === 'ratedAt' || k === 'collectionId' || k === 'ratings') continue
    out[k] = v === undefined ? deleteField() : v
  }
  return out
}

export function wishPatchToCloud(changes: Partial<WishlistItem>): UpdateData<DocumentData> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(changes)) {
    if (k === 'collectionId') continue
    out[k] = v === undefined ? deleteField() : v
  }
  return out
}

/** Escrituras hacia la colección `cid` como la persona `uid`. */
export function makeCloudWrites(cid: string, uid: string): CloudWrites {
  const db = getDb()
  const album = (id: string) => doc(db, 'collections', cid, 'albums', id)
  const wish = (id: string) => doc(db, 'collections', cid, 'wishlist', id)
  // Firestore guarda la escritura en el celular y la manda cuando hay internet; no
  // esperamos la confirmación del servidor para no congelar la interfaz sin conexión.
  const fire = (p: Promise<unknown>) => { p.catch((e) => console.warn('nube:', e)); return Promise.resolve() }
  return {
    putAlbum: (a) => fire(setDoc(album(a.id), albumToCloud(a, uid))),
    updateAlbum: (id, changes) => {
      const patch = albumPatchToCloud(changes, uid)
      return Object.keys(patch).length ? fire(updateDoc(album(id), patch)) : Promise.resolve()
    },
    deleteAlbum: (id) => fire(deleteDoc(album(id))),
    putWish: (w) => fire(setDoc(wish(w.id), wishToCloud(w))),
    updateWish: (id, changes) => fire(updateDoc(wish(id), wishPatchToCloud(changes))),
    deleteWish: (id) => fire(deleteDoc(wish(id))),
  }
}
