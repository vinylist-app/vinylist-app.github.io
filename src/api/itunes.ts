import { albumKey, isVariousArtists } from '../lib/text'

/**
 * iTunes Search API (https://performance-partners.apple.com/search-api): abierta, sin llave y con CORS.
 * Solo da portadas de respaldo para lo que viene de MusicBrainz; nunca rompe una búsqueda.
 */
const BASE = 'https://itunes.apple.com/search'
const TIMEOUT_MS = 8000
/** Apple nombra los sencillos y EP "Rumours - Single" o "Rumours - EP"; MusicBrainz, solo "Rumours". */
const EDITION_SUFFIX = /\s+-\s+(EP|Single)$/i

interface ITunesAlbum {
  artistName?: string
  collectionName?: string
  /** `…/100x100bb.jpg`; cambiando el tamaño en la URL se obtiene la grande. */
  artworkUrl100?: string
}

/** Portadas grandes (600×600) por `albumKey(artista, título)` de lo que Apple Music encuentre con ese texto. Una sola petición; ante cualquier error, mapa vacío. */
export async function searchArtwork(q: string): Promise<Map<string, string>> {
  try {
    const url = new URL(BASE)
    url.searchParams.set('term', q)
    url.searchParams.set('entity', 'album')
    url.searchParams.set('limit', '25')
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return new Map()
    const data = (await res.json()) as { results?: ITunesAlbum[] }
    const art = new Map<string, string>()
    for (const r of data.results ?? []) {
      // Las recopilaciones ("Various Artists") no se indexan: por título solo, se confunden entre sí.
      if (!r.artistName || !r.collectionName || !r.artworkUrl100 || isVariousArtists(r.artistName)) continue
      const key = albumKey(r.artistName, r.collectionName.replace(EDITION_SUFFIX, ''))
      if (!art.has(key)) art.set(key, largeArtwork(r.artworkUrl100))
    }
    return art
  } catch {
    // Sin Apple Music la búsqueda sigue igual, solo sin esa portada de respaldo.
    return new Map()
  }
}

/** `…/100x100bb.jpg` → `…/600x600bb.jpg`. */
export function largeArtwork(url: string): string {
  return url.replace(/\/\d+x\d+bb(\.[a-z0-9]+)?$/i, '/600x600bb$1')
}
