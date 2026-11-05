import type { ReleaseCandidate } from '../types'

/**
 * MusicBrainz (https://musicbrainz.org/doc/MusicBrainz_API): base abierta, sin token.
 * Límite: 1 petición por segundo; aquí se serializan todas las llamadas.
 * Portadas: Cover Art Archive (https://musicbrainz.org/doc/Cover_Art_Archive/API).
 */
const BASE = 'https://musicbrainz.org/ws/2'
const SPACING_MS = 1100
const TIMEOUT_MS = 15000
/** Ante 503 o 429 (saturado, o el límite por IP cuando dos celulares comparten red) se reintenta con estas pausas. */
const RETRY_MS = [1500, 3000]
const SATURATED = 'MusicBrainz está saturado. Espera unos segundos y vuelve a buscar.'
/** Búsqueda por texto: tamaño de página, vinilos que bastan para no pedir la segunda y tope de resultados. */
const PAGE = 100
const MIN_VINYL = 8
const MAX_RESULTS = 40

type Params = Record<string, string | number | undefined>
interface Job {
  background: boolean
  run: () => Promise<void>
}

const queue: Job[] = []
let draining = false
let lastAt = 0

/** Una sola fila para toda la app; lo que pidió el usuario (escanear, buscar) pasa antes que el trabajo de fondo. */
async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length) {
      const i = queue.findIndex((j) => !j.background)
      const job = queue.splice(i === -1 ? 0 : i, 1)[0]
      const wait = Math.max(0, lastAt + SPACING_MS - Date.now())
      if (wait) await new Promise((r) => setTimeout(r, wait))
      lastAt = Date.now()
      await job.run()
    }
  } finally {
    draining = false
  }
}

async function fetchJson<T>(path: string, params: Params): Promise<T> {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  url.searchParams.set('fmt', 'json')
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('MusicBrainz tardó demasiado en responder. Intenta de nuevo.')
      throw e
    }
    if (res.status === 503 || res.status === 429) {
      const pause = RETRY_MS[attempt]
      if (pause === undefined) throw new Error(SATURATED)
      await new Promise((r) => setTimeout(r, pause))
      // La fila mide el espaciado desde la última petición: que cuente este reintento.
      lastAt = Date.now()
      continue
    }
    if (!res.ok) throw new Error(`MusicBrainz respondió ${res.status}`)
    return res.json() as Promise<T>
  }
}

/** `background` = trabajo de "Para ti" o del enlace a Spotify; cede el turno a las búsquedas del usuario. */
export function mbGet<T>(path: string, params: Params, background = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ background, run: () => fetchJson<T>(path, params).then(resolve, reject) })
    void drain()
  })
}

/** Un lanzamiento tal como lo manda la búsqueda de MusicBrainz (fmt=json). */
export interface MBRelease {
  id: string
  title: string
  date?: string
  country?: string
  barcode?: string
  score?: number
  'artist-credit'?: { name: string; joinphrase?: string; artist?: { id: string } }[]
  'label-info'?: { label?: { name: string }; 'catalog-number'?: string }[]
  media?: { format?: string }[]
  'release-group'?: { id: string; 'primary-type'?: string; 'secondary-types'?: string[] }
  relations?: { type: string; url?: { resource: string } }[]
}

interface SearchPage {
  releases?: MBRelease[]
  /** Total de coincidencias, no solo las de esta página. */
  count?: number
  offset?: number
}

/**
 * Solo ediciones en vinilo: algún medio cuyo formato diga "vinyl" (`12" Vinyl`, `7" Vinyl`, `Vinyl`…).
 * Las que no traen `media` pasan solo si `keepWithoutMedia` (por código de barras ya se sabe qué disco es).
 */
export function vinylOnly(releases: MBRelease[], keepWithoutMedia = false): MBRelease[] {
  return releases.filter((r) => (r.media?.length ? r.media.some((m) => /vinyl/i.test(m.format ?? '')) : keepWithoutMedia))
}

const TYPE_ORDER: Record<string, number> = { Album: 0, EP: 1, Single: 2 }

/**
 * Orden de los resultados: puntaje de MusicBrainz; a igual puntaje, álbumes antes que EP, sencillos y lo demás;
 * luego sin tipos secundarios (recopilación, en vivo…) antes que con; luego con fecha antes que sin.
 * Estable: en empates se respeta el orden en que llegaron. Como mucho `limit` resultados.
 */
export function rankReleases(releases: MBRelease[], limit = MAX_RESULTS): MBRelease[] {
  const typeRank = (r: MBRelease) => TYPE_ORDER[r['release-group']?.['primary-type'] ?? ''] ?? 3
  const secondary = (r: MBRelease) => Number(Boolean(r['release-group']?.['secondary-types']?.length))
  return [...releases]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || typeRank(a) - typeRank(b) || secondary(a) - secondary(b) || Number(!a.date) - Number(!b.date))
    .slice(0, limit)
}

function toCandidate(r: MBRelease): ReleaseCandidate {
  return {
    source: 'musicbrainz',
    sourceId: r.id,
    title: r.title,
    artist: r['artist-credit']?.map((a) => a.name + (a.joinphrase ?? '')).join('') ?? 'Varios',
    year: r.date ? Number(r.date.slice(0, 4)) || undefined : undefined,
    country: r.country,
    label: r['label-info']?.[0]?.label?.name,
    catalogNumber: r['label-info']?.[0]?.['catalog-number'],
    format: r.media?.map((m) => m.format).filter(Boolean).join(', ') || undefined,
    barcode: r.barcode?.replace(/\D/g, '') || undefined,
    thumbUrl: coverUrl(r.id, 250),
    coverUrl: coverUrl(r.id, 500),
    genres: [],
    styles: [],
    musicbrainzArtistId: r['artist-credit']?.[0]?.artist?.id,
    musicbrainzReleaseGroupId: r['release-group']?.id,
  }
}

export function coverUrl(mbid: string, size: 250 | 500 | 1200): string {
  return `https://coverartarchive.org/release/${mbid}/front-${size}`
}

export function releaseGroupCoverUrl(rgMbid: string, size: 250 | 500 | 1200): string {
  return `https://coverartarchive.org/release-group/${rgMbid}/front-${size}`
}

export async function searchByBarcode(barcode: string): Promise<ReleaseCandidate[]> {
  const data = await mbGet<SearchPage>('/release', { query: `barcode:${barcode.replace(/\D/g, '')}`, limit: 25 })
  return vinylOnly(data.releases ?? [], true).map(toCandidate)
}

/**
 * Búsqueda "simple" de MusicBrainz (`dismax`): pondera título, artista y demás, así "fleetwood mac" encuentra
 * por artista. Con dismax no se pueden combinar filtros, por eso el vinilo se filtra aquí. Si la primera
 * página trae pocos vinilos y hay más, se pide una segunda; nunca más de dos peticiones por búsqueda.
 */
export async function searchByText(q: string): Promise<ReleaseCandidate[]> {
  const params = { query: q, dismax: 'true', limit: PAGE }
  const first = await mbGet<SearchPage>('/release', params)
  let releases = first.releases ?? []
  if (vinylOnly(releases).length < MIN_VINYL && (first.count ?? 0) > PAGE) {
    const second = await mbGet<SearchPage>('/release', { ...params, offset: PAGE })
    releases = releases.concat(second.releases ?? [])
  }
  return rankReleases(vinylOnly(releases)).map(toCandidate)
}

/** MBID del artista por nombre; solo si la coincidencia es clara. */
export async function findArtistMbid(name: string): Promise<string | undefined> {
  const data = await mbGet<{ artists: { id: string; score: number; name: string }[] }>('/artist', { query: `artist:"${name.replace(/"/g, '')}"`, limit: 3 }, true)
  const hit = data.artists?.[0]
  return hit && hit.score >= 90 ? hit.id : undefined
}

export interface ReleaseGroupInfo {
  id: string
  title: string
  year?: number
  genres: string[]
  secondaryTypes: string[]
}

/** Discografía (álbumes) de un artista. */
export async function browseReleaseGroups(artistMbid: string): Promise<ReleaseGroupInfo[]> {
  const data = await mbGet<{ 'release-groups': { id: string; title: string; 'first-release-date'?: string; 'secondary-types'?: string[]; genres?: { name: string; count: number }[] }[] }>(
    '/release-group',
    { artist: artistMbid, type: 'album', limit: 100, inc: 'genres' },
    true,
  )
  return (data['release-groups'] ?? []).map((rg) => ({
    id: rg.id,
    title: rg.title,
    year: rg['first-release-date'] ? Number(rg['first-release-date'].slice(0, 4)) || undefined : undefined,
    genres: (rg.genres ?? []).sort((a, b) => b.count - a.count).slice(0, 4).map((g) => g.name),
    secondaryTypes: rg['secondary-types'] ?? [],
  }))
}

/** Grupo de lanzamiento de un álbum: por MBID del lanzamiento, o buscando por artista y título. */
export async function findReleaseGroup(opts: { releaseMbid?: string; artist: string; title: string }): Promise<string | undefined> {
  if (opts.releaseMbid) {
    try {
      const r = await mbGet<MBRelease>(`/release/${opts.releaseMbid}`, { inc: 'release-groups' }, true)
      if (r['release-group']?.id) return r['release-group'].id
    } catch {
      // MBID viejo o fusionado: se busca por título.
    }
  }
  const q = `releasegroup:"${opts.title.replace(/"/g, '')}" AND artist:"${opts.artist.replace(/"/g, '')}"`
  const data = await mbGet<{ 'release-groups': { id: string; score: number }[] }>('/release-group', { query: q, limit: 3 }, true)
  const hit = data['release-groups']?.[0]
  return hit && hit.score >= 85 ? hit.id : undefined
}

/**
 * ID del álbum en Spotify, vía las relaciones "streaming" de MusicBrainz.
 * Esas ligas viven en la edición digital del mismo grupo de lanzamiento, no en el vinilo.
 */
export async function findSpotifyAlbumId(releaseGroupMbid: string): Promise<string | undefined> {
  const data = await mbGet<{ releases: MBRelease[] }>('/release', { 'release-group': releaseGroupMbid, inc: 'url-rels+media', limit: 100 }, true)
  const releases = (data.releases ?? []).sort((a, b) => (a.media?.some((m) => /digital/i.test(m.format ?? '')) ? -1 : 1) - (b.media?.some((m) => /digital/i.test(m.format ?? '')) ? -1 : 1))
  for (const r of releases) {
    for (const rel of r.relations ?? []) {
      const m = rel.url?.resource.match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/)
      if (m && /streaming/i.test(rel.type)) return m[1]
    }
  }
  return undefined
}
