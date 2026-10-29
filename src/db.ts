import Dexie, { type EntityTable } from 'dexie'
import type { Album, WishlistItem } from './types'
import { activeCollectionId, getSession, LOCAL_COLLECTION, LOCAL_UID } from './session'
import { cloudWrites } from './cloud/bridge'
import { albumKey } from './lib/text'
import { normalizeLocalWish } from './data/pure'

/**
 * Base local (IndexedDB). La app funciona sin internet con esto.
 * Con cuenta, la colección de la nube se refleja aquí (cloud/mirror.ts) y las
 * escrituras van a las dos partes: a la base local al instante y a la nube
 * (que las guarda y las manda cuando hay internet).
 */
interface CacheEntry {
  key: string
  fetchedAt: string
  value: unknown
}

class VinyListDB extends Dexie {
  albums!: EntityTable<Album, 'id'>
  wishlist!: EntityTable<WishlistItem, 'id'>
  /** Respuestas de Discogs, MusicBrainz, ListenBrainz y Wikipedia, con fecha. */
  tasteCache!: EntityTable<CacheEntry, 'key'>

  constructor() {
    super('vinylist')
    this.version(1).stores({
      albums: 'id, artist, title, year, barcode, discogsId, rating, addedAt, *genres, *styles',
      wishlist: 'id, wantedBy, addedAt',
    })
    this.version(2).stores({
      albums: 'id, artist, title, year, barcode, discogsId, rating, addedAt, spotifyAlbumId, *genres, *styles',
      wishlist: 'id, wantedBy, addedAt',
      tasteCache: 'key, fetchedAt',
    })
    // v0.2: cada disco y deseo sabe a qué colección pertenece; índices para detectar otras ediciones.
    this.version(3).stores({
      albums: 'id, collectionId, artist, title, year, barcode, discogsId, discogsMasterId, musicbrainzReleaseGroupId, rating, addedAt, spotifyAlbumId, *genres, *styles',
      wishlist: 'id, collectionId, wantedBy, addedAt',
      tasteCache: 'key, fetchedAt',
    }).upgrade((tx) => {
      const albums = tx.table('albums')
      const wishlist = tx.table('wishlist')
      return Promise.all([
        albums.toCollection().modify((a: Album) => { if (!a.collectionId) a.collectionId = LOCAL_COLLECTION }),
        wishlist.toCollection().modify(normalizeWishInPlace),
      ])
    })
    // v0.2.1: la versión 3 original dejó los deseos de v0.1 con el nombre del perfil
    // como uid, y la app ya no los reconocía como propios. Quien ya pasó por esa
    // versión los corrige aquí (misma regla; para los demás no cambia nada).
    this.version(4).stores({
      albums: 'id, collectionId, artist, title, year, barcode, discogsId, discogsMasterId, musicbrainzReleaseGroupId, rating, addedAt, spotifyAlbumId, *genres, *styles',
      wishlist: 'id, collectionId, wantedBy, addedAt',
      tasteCache: 'key, fetchedAt',
    }).upgrade((tx) => tx.table('wishlist').toCollection().modify(normalizeWishInPlace))
  }
}

/** Aplica normalizeLocalWish sobre la fila que Dexie entrega en una migración. */
function normalizeWishInPlace(w: WishlistItem): void {
  Object.assign(w, normalizeLocalWish(w))
}

export const db = new VinyListDB()

export function newId(): string {
  return crypto.randomUUID()
}

/** Discos de la colección activa, para consultas en vivo. */
export function albumsOf(collectionId = activeCollectionId()) {
  return db.albums.where('collectionId').equals(collectionId)
}

export function wishlistOf(collectionId = activeCollectionId()) {
  return db.wishlist.where('collectionId').equals(collectionId)
}

export async function addAlbum(album: Omit<Album, 'id' | 'addedAt' | 'updatedAt' | 'collectionId'>): Promise<Album> {
  const now = new Date().toISOString()
  const s = getSession()
  const full: Album = { ...album, id: newId(), collectionId: activeCollectionId(), addedAt: now, updatedAt: now }
  if (s.person.uid !== LOCAL_UID) full.addedBy = s.person.uid
  if (full.rating) full.ratedAt = now
  await db.albums.add(full)
  await cloudWrites()?.putAlbum(full)
  return full
}

export async function updateAlbum(id: string, changes: Partial<Album>): Promise<void> {
  const patch: Partial<Album> = { ...changes, updatedAt: new Date().toISOString() }
  if ('rating' in changes) patch.ratedAt = changes.rating ? patch.updatedAt : undefined
  await db.albums.update(id, patch)
  await cloudWrites()?.updateAlbum(id, patch)
}

export async function deleteAlbum(id: string): Promise<void> {
  await db.albums.delete(id)
  await cloudWrites()?.deleteAlbum(id)
}

/** Datos que la app averigua sola (enlaces, IDs): no cuentan como edición del usuario. */
export async function patchAlbumMeta(id: string, changes: Pick<Album, 'spotifyAlbumId' | 'spotifyCheckedAt' | 'musicbrainzReleaseGroupId'>): Promise<void> {
  await db.albums.update(id, changes)
  await cloudWrites()?.updateAlbum(id, changes)
}

export interface DuplicateMatch {
  album: Album
  /** same: misma edición (mismo Discogs o código) · other: otra edición del mismo álbum. */
  kind: 'same' | 'other'
}

/**
 * ¿Ya tienen este disco? Misma edición: por ID de Discogs o código de barras.
 * Otra edición: por master de Discogs, grupo de MusicBrainz o artista + título.
 */
export async function findDuplicate(opts: { discogsId?: number; barcode?: string; discogsMasterId?: number; musicbrainzReleaseGroupId?: string; artist?: string; title?: string }): Promise<DuplicateMatch | undefined> {
  const cid = activeCollectionId()
  const inCollection = (a: Album | undefined) => (a && a.collectionId === cid ? a : undefined)
  if (opts.discogsId) {
    const byId = inCollection(await db.albums.where('discogsId').equals(opts.discogsId).filter((a) => a.collectionId === cid).first())
    if (byId) return { album: byId, kind: 'same' }
  }
  if (opts.barcode) {
    const clean = opts.barcode.replace(/\D/g, '')
    if (clean) {
      const byCode = inCollection(await db.albums.where('barcode').equals(clean).filter((a) => a.collectionId === cid).first())
      if (byCode) return { album: byCode, kind: 'same' }
    }
  }
  if (opts.discogsMasterId) {
    const byMaster = inCollection(await db.albums.where('discogsMasterId').equals(opts.discogsMasterId).filter((a) => a.collectionId === cid).first())
    if (byMaster) return { album: byMaster, kind: 'other' }
  }
  if (opts.musicbrainzReleaseGroupId) {
    const byGroup = inCollection(await db.albums.where('musicbrainzReleaseGroupId').equals(opts.musicbrainzReleaseGroupId).filter((a) => a.collectionId === cid).first())
    if (byGroup) return { album: byGroup, kind: 'other' }
  }
  if (opts.artist && opts.title) {
    const key = albumKey(opts.artist, opts.title)
    const byKey = await albumsOf(cid).filter((a) => albumKey(a.artist, a.title) === key).first()
    if (byKey) return { album: byKey, kind: 'other' }
  }
  return undefined
}

// ---------- Deseos ----------

export async function addWish(item: Omit<WishlistItem, 'id' | 'addedAt' | 'collectionId' | 'wantedBy' | 'wantedByName'>): Promise<WishlistItem> {
  const s = getSession()
  const full: WishlistItem = { ...item, id: newId(), collectionId: activeCollectionId(), wantedBy: s.person.uid, wantedByName: s.person.name, addedAt: new Date().toISOString() }
  await db.wishlist.add(full)
  await cloudWrites()?.putWish(full)
  return full
}

export async function updateWish(id: string, changes: Partial<WishlistItem>): Promise<void> {
  await db.wishlist.update(id, changes)
  await cloudWrites()?.updateWish(id, changes)
}

export async function deleteWish(id: string): Promise<void> {
  await db.wishlist.delete(id)
  await cloudWrites()?.deleteWish(id)
}

/** ¿Este disco está en los deseos de la colección activa? */
export async function findWish(opts: { discogsId?: number; discogsMasterId?: number; musicbrainzReleaseGroupId?: string; barcode?: string; artist?: string; title?: string }): Promise<WishlistItem | undefined> {
  const items = await wishlistOf().toArray()
  const key = opts.artist && opts.title ? albumKey(opts.artist, opts.title) : undefined
  const code = opts.barcode?.replace(/\D/g, '') || undefined
  return items.find((w) =>
    (opts.discogsId && w.discogsId === opts.discogsId) ||
    (opts.discogsMasterId && w.discogsMasterId === opts.discogsMasterId) ||
    (opts.musicbrainzReleaseGroupId && w.musicbrainzReleaseGroupId === opts.musicbrainzReleaseGroupId) ||
    (code && w.barcode === code) ||
    (key && albumKey(w.artist, w.title) === key),
  )
}

// ---------- Caché ----------

/**
 * Devuelve el valor guardado si tiene menos de `ttlDays`; si no, llama a `fetcher` y lo guarda.
 * Si la red falla pero hay un valor viejo, se usa el viejo antes que fallar.
 */
const inFlight = new Map<string, Promise<unknown>>()

export interface ServedInfo {
  fetchedAt: string
  /** true si la red falló y se usó un dato vencido. */
  stale: boolean
}

export async function cached<T>(key: string, ttlDays: number, fetcher: () => Promise<T>, force = false, onServed?: (info: ServedInfo) => void): Promise<T> {
  const hit = await db.tasteCache.get(key)
  const fresh = hit && Date.now() - Date.parse(hit.fetchedAt) < ttlDays * 864e5
  if (hit && fresh && !force) {
    onServed?.({ fetchedAt: hit.fetchedAt, stale: false })
    return hit.value as T
  }
  // Dos pantallas pidiendo lo mismo a la vez comparten una sola petición.
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>
  const p = (async () => {
    try {
      const value = await fetcher()
      const fetchedAt = new Date().toISOString()
      await db.tasteCache.put({ key, fetchedAt, value })
      onServed?.({ fetchedAt, stale: false })
      return value
    } catch (e) {
      if (hit) {
        onServed?.({ fetchedAt: hit.fetchedAt, stale: true })
        return hit.value as T
      }
      throw e
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, p)
  return p
}

export function exportCollection(albums: Album[], wishlist: WishlistItem[] = []): string {
  return JSON.stringify({ app: 'vinylist', version: 2, exportedAt: new Date().toISOString(), albums, wishlist }, null, 2)
}
