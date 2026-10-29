import { useLiveQuery } from 'dexie-react-hooks'
import { albumsOf, wishlistOf } from '../db'
import { useSession } from '../session'
import type { Album, WishlistItem } from '../types'

/** Discos de la colección activa, en vivo. undefined mientras carga. */
export function useAlbums(): Album[] | undefined {
  const { collection } = useSession()
  const cid = collection?.id ?? 'local'
  return useLiveQuery(() => albumsOf(cid).toArray(), [cid])
}

/** Deseos de la colección activa, los más nuevos primero. */
export function useWishlist(): WishlistItem[] | undefined {
  const { collection } = useSession()
  const cid = collection?.id ?? 'local'
  return useLiveQuery(async () => (await wishlistOf(cid).toArray()).sort((a, b) => b.addedAt.localeCompare(a.addedAt)), [cid])
}
