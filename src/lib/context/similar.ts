import { db } from '../../db'
import type { TasteProfile } from '../taste/profile'
import { artistKey } from '../text'

/**
 * "Para ti" ya guardó en el celular los artistas parecidos a los favoritos de la
 * colección (ListenBrainz, 30 días). Aquí se reutiliza eso sin pedir nada a la red:
 * si el artista del disco aparece como parecido a alguno de la colección, se dice.
 */

export interface SimilarEntry {
  /** MBID del artista de la colección al que pertenece la lista. */
  seedMbid: string
  list: { mbid: string; name: string }[]
}

/** Nombres de artistas de la colección a los que el del disco se parece (lógica pura). */
export function similarSeeds(entries: SimilarEntry[], profile: TasteProfile, artist: string, artistMbid?: string): string[] {
  const key = artistKey(artist)
  const out: string[] = []
  for (const e of entries) {
    const hit = e.list.some((s) => (artistMbid && s.mbid === artistMbid) || artistKey(s.name) === key)
    if (!hit) continue
    const seed = [...profile.artists.values()].find((a) => a.musicbrainzArtistId === e.seedMbid)
    if (seed && !out.includes(seed.name)) out.push(seed.name)
  }
  return out
}

const PREFIX = 'lb:similar:'

/** Lee la caché de ListenBrainz que dejó "Para ti". */
export async function similarSeedsFromCache(profile: TasteProfile, artist: string, artistMbid?: string): Promise<string[]> {
  try {
    const rows = await db.tasteCache.where('key').startsWith(PREFIX).toArray()
    const entries: SimilarEntry[] = rows.map((r) => ({ seedMbid: r.key.slice(PREFIX.length), list: Array.isArray(r.value) ? (r.value as { mbid: string; name: string }[]) : [] }))
    return similarSeeds(entries, profile, artist, artistMbid)
  } catch {
    return []
  }
}
