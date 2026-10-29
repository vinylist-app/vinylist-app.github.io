import type { Album, WishlistItem } from '../types'

/**
 * Puente entre la base local (db.ts) y la nube: cuando hay una colección en la
 * nube activa, el módulo de Firebase registra aquí cómo escribir. Así db.ts no
 * importa Firebase (que es pesado) y la app sin cuenta no lo carga nunca.
 */
export interface CloudWrites {
  putAlbum(album: Album): Promise<void>
  updateAlbum(id: string, changes: Partial<Album>): Promise<void>
  deleteAlbum(id: string): Promise<void>
  putWish(item: WishlistItem): Promise<void>
  updateWish(id: string, changes: Partial<WishlistItem>): Promise<void>
  deleteWish(id: string): Promise<void>
}

let writes: CloudWrites | null = null

export function registerCloudWrites(w: CloudWrites | null): void {
  writes = w
}

export function cloudWrites(): CloudWrites | null {
  return writes
}
