import { collection, onSnapshot, type DocumentData, type QuerySnapshot } from 'firebase/firestore'
import { getDb } from './firebase'
import { db } from '../db'
import { setSession } from '../session'
import type { Album, WishlistItem } from '../types'

/**
 * Refleja la colección de la nube en la base local, para que todas las pantallas
 * sigan leyendo de Dexie (en vivo) sin saber de dónde vienen los datos.
 * Firestore avisa de inmediato de los cambios propios (aunque no haya internet)
 * y de los de la familia cuando llegan.
 */
export function albumFromCloud(id: string, data: DocumentData, cid: string, uid: string): Album {
  const ratings = (data.ratings ?? {}) as Album['ratings']
  const mine = ratings?.[uid]
  const base = data as Omit<Album, 'id' | 'collectionId'>
  return {
    ...base,
    genres: base.genres ?? [],
    styles: base.styles ?? [],
    tracklist: base.tracklist ?? [],
    id,
    collectionId: cid,
    ratings,
    rating: mine?.rating,
    ratedAt: mine?.at,
  }
}

export function wishFromCloud(id: string, data: DocumentData, cid: string): WishlistItem {
  return { ...(data as Omit<WishlistItem, 'id' | 'collectionId'>), id, collectionId: cid }
}

export function startMirror(cid: string, uid: string): () => void {
  const fs = getDb()
  let firstAlbums = true
  let firstWishes = true

  const status = (snap: QuerySnapshot) => {
    const pending = snap.metadata.hasPendingWrites
    const offline = snap.metadata.fromCache && typeof navigator !== 'undefined' && !navigator.onLine
    setSession((s) => ({ sync: { state: offline ? 'offline' : pending ? 'pending' : 'synced', at: offline || pending ? s.sync.at : new Date().toISOString() } }))
  }

  const stopAlbums = onSnapshot(
    collection(fs, 'collections', cid, 'albums'),
    { includeMetadataChanges: true },
    async (snap) => {
      try {
        if (firstAlbums) {
          // Primera foto completa: lo que no esté en la nube se quita del espejo local.
          firstAlbums = false
          const ids = new Set(snap.docs.map((d) => d.id))
          const rows = snap.docs.map((d) => albumFromCloud(d.id, d.data(), cid, uid))
          await db.transaction('rw', db.albums, async () => {
            await db.albums.where('collectionId').equals(cid).filter((a) => !ids.has(a.id)).delete()
            await db.albums.bulkPut(rows)
          })
        } else {
          const puts: Album[] = []
          const dels: string[] = []
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') dels.push(ch.doc.id)
            else puts.push(albumFromCloud(ch.doc.id, ch.doc.data(), cid, uid))
          }
          if (puts.length) await db.albums.bulkPut(puts)
          if (dels.length) await db.albums.bulkDelete(dels)
        }
        status(snap)
      } catch (e) {
        setSession({ sync: { state: 'error', message: e instanceof Error ? e.message : String(e) } })
      }
    },
    (err) => setSession({ sync: { state: 'error', message: err.message } }),
  )

  const stopWishes = onSnapshot(
    collection(fs, 'collections', cid, 'wishlist'),
    async (snap) => {
      try {
        if (firstWishes) {
          firstWishes = false
          const ids = new Set(snap.docs.map((d) => d.id))
          const rows = snap.docs.map((d) => wishFromCloud(d.id, d.data(), cid))
          await db.transaction('rw', db.wishlist, async () => {
            await db.wishlist.where('collectionId').equals(cid).filter((w) => !ids.has(w.id)).delete()
            await db.wishlist.bulkPut(rows)
          })
        } else {
          const puts: WishlistItem[] = []
          const dels: string[] = []
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') dels.push(ch.doc.id)
            else puts.push(wishFromCloud(ch.doc.id, ch.doc.data(), cid))
          }
          if (puts.length) await db.wishlist.bulkPut(puts)
          if (dels.length) await db.wishlist.bulkDelete(dels)
        }
      } catch (e) {
        setSession({ sync: { state: 'error', message: e instanceof Error ? e.message : String(e) } })
      }
    },
    (err) => setSession({ sync: { state: 'error', message: err.message } }),
  )

  const online = () => setSession((s) => ({ sync: { ...s.sync, state: s.sync.state === 'offline' ? 'pending' : s.sync.state } }))
  const offline = () => setSession((s) => ({ sync: { ...s.sync, state: 'offline' } }))
  window.addEventListener('online', online)
  window.addEventListener('offline', offline)

  return () => {
    stopAlbums()
    stopWishes()
    window.removeEventListener('online', online)
    window.removeEventListener('offline', offline)
  }
}
