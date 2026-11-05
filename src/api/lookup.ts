import * as discogs from './discogs'
import * as musicbrainz from './musicbrainz'
import { searchArtwork } from './itunes'
import { albumKey } from '../lib/text'
import type { ReleaseCandidate } from '../types'

/** Busca primero en Discogs; si no hay nada (o falla), en MusicBrainz. */
export async function lookupBarcode(barcode: string): Promise<ReleaseCandidate[]> {
  return withFallback(() => discogs.searchByBarcode(barcode), () => musicbrainzBarcode(barcode))
}

export async function lookupText(q: string): Promise<ReleaseCandidate[]> {
  return withFallback(() => discogs.searchByText(q), () => musicbrainzText(q))
}

/** MusicBrainz y, en paralelo, Apple Music para las portadas que Cover Art Archive no tenga. */
async function musicbrainzText(q: string): Promise<ReleaseCandidate[]> {
  const artwork = searchArtwork(q)
  const found = await musicbrainz.searchByText(q)
  return withArtwork(found, await artwork)
}

/** Por código de barras MusicBrainz ya dice qué disco es: una sola consulta a Apple Music con artista y título. */
async function musicbrainzBarcode(barcode: string): Promise<ReleaseCandidate[]> {
  const found = await musicbrainz.searchByBarcode(barcode)
  const first = found[0]
  if (!first?.artist || !first.title) return found
  return withArtwork(found, await searchArtwork(`${first.artist} ${first.title}`))
}

/** Pone `altCoverUrl` en cada candidato cuyo álbum (artista y título) tenga portada en Apple Music. */
function withArtwork(found: ReleaseCandidate[], artwork: Map<string, string>): ReleaseCandidate[] {
  if (!artwork.size) return found
  return found.map((c) => {
    const alt = artwork.get(albumKey(c.artist, c.title))
    return alt ? { ...c, altCoverUrl: alt } : c
  })
}

async function withFallback(primary: () => Promise<ReleaseCandidate[]>, secondary: () => Promise<ReleaseCandidate[]>) {
  let first: ReleaseCandidate[] = []
  let firstError: unknown
  if (discogs.discogsConfigured()) {
    try {
      first = await primary()
    } catch (e) {
      firstError = e
    }
  }
  if (first.length) return first
  try {
    return await secondary()
  } catch (e) {
    throw friendly(firstError ?? e)
  }
}

function friendly(e: unknown): Error {
  if (e instanceof TypeError) return new Error('Sin conexión. Revisa el internet e intenta de nuevo.')
  return e instanceof Error ? e : new Error('No se pudo buscar.')
}
