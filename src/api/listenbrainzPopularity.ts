/**
 * ListenBrainz (https://api.listenbrainz.org): los discos más escuchados de un artista.
 * Datos abiertos, sin clave. Se usa para decir "es el más escuchado de X".
 */
const BASE = 'https://api.listenbrainz.org/1'

export interface PopularReleaseGroup {
  releaseGroupMbid: string
  listens: number
}

export async function topReleaseGroups(artistMbid: string): Promise<PopularReleaseGroup[]> {
  const res = await fetch(`${BASE}/popularity/top-release-groups-for-artist/${encodeURIComponent(artistMbid)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`ListenBrainz respondió ${res.status}`)
  const data = (await res.json()) as { release_group_mbid?: string; total_listen_count?: number }[]
  if (!Array.isArray(data)) return []
  return data
    .filter((r) => r.release_group_mbid)
    .map((r) => ({ releaseGroupMbid: r.release_group_mbid as string, listens: r.total_listen_count ?? 0 }))
    .sort((a, b) => b.listens - a.listens)
}
