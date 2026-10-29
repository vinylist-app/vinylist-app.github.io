import { useLiveQuery } from 'dexie-react-hooks'
import { albumsOf, wishlistOf } from '../db'
import { rememberedCollectionId, useSession } from '../session'
import { queryCollectionId } from './pure'
import type { Album, WishlistItem } from '../types'

/**
 * Colección que se consulta en la base local. Mientras la sesión arranca aún no
 * hay colección en memoria, pero la última que se abrió se recuerda en el celular
 * y sus discos ya están aquí: se consulta esa en vez de la local vacía, para no
 * mostrar "Tu colección empieza aquí" a quien tiene cuenta. Si no se recordó
 * ninguna, undefined: todavía no se sabe qué mostrar.
 */
function useQueryCollectionId(): string | undefined {
  const { collection, status } = useSession()
  return queryCollectionId(collection, status, status === 'starting' ? rememberedCollectionId() : undefined)
}

/** Discos de la colección activa, en vivo. undefined mientras carga. */
export function useAlbums(): Album[] | undefined {
  const cid = useQueryCollectionId()
  return useLiveQuery<Album[] | undefined>(() => (cid ? albumsOf(cid).toArray() : undefined), [cid])
}

/** Deseos de la colección activa, los más nuevos primero. undefined mientras carga. */
export function useWishlist(): WishlistItem[] | undefined {
  const cid = useQueryCollectionId()
  return useLiveQuery(async () => (cid ? (await wishlistOf(cid).toArray()).sort((a, b) => b.addedAt.localeCompare(a.addedAt)) : undefined), [cid])
}
