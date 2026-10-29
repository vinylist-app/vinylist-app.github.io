import type { ReleaseCandidate, Track } from '../types'
import { getSession } from '../session'

/**
 * Cliente de la API de Discogs (https://www.discogs.com/developers).
 * Límite: 60 peticiones por minuto autenticado. Las imágenes solo llegan autenticado.
 *
 * El token personal es gratis (discogs.com/settings/developers). Vive en la
 * colección de la nube (solo lo leen sus miembros) o en este celular; nunca en el código.
 */
const BASE = 'https://api.discogs.com'
const USER_AGENT = 'VinyList/0.2 (app familiar de vinilos)'
const LOCAL_TOKEN_KEY = 'vinylist.discogsToken'

export function localDiscogsToken(): string | undefined {
  try {
    return localStorage.getItem(LOCAL_TOKEN_KEY) || undefined
  } catch {
    return undefined
  }
}

export function setLocalDiscogsToken(t: string): void {
  try {
    if (t.trim()) localStorage.setItem(LOCAL_TOKEN_KEY, t.trim())
    else localStorage.removeItem(LOCAL_TOKEN_KEY)
  } catch {
    // Sin almacenamiento.
  }
}

function token(): string | undefined {
  return getSession().collection?.discogsToken || localDiscogsToken() || import.meta.env.VITE_DISCOGS_TOKEN || undefined
}

export function discogsConfigured(): boolean {
  return Boolean(token())
}

/** Comprueba un token contra Discogs (quién es el dueño). */
export async function checkToken(t: string): Promise<string> {
  const res = await fetch(`${BASE}/oauth/identity`, { headers: { 'User-Agent': USER_AGENT, Authorization: `Discogs token=${t.trim()}` }, signal: AbortSignal.timeout(15000) })
  if (res.status === 401) throw new Error('Discogs no reconoce ese token. Cópialo completo desde discogs.com/settings/developers.')
  if (!res.ok) throw new Error(`Discogs respondió ${res.status}`)
  const d = (await res.json()) as { username?: string }
  return d.username ?? 'tu cuenta'
}

async function get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
  const t = token()
  if (t) headers.Authorization = `Discogs token=${t}`
  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('Discogs tardó demasiado en responder. Intenta de nuevo.')
    throw e
  }
  if (res.status === 429) throw new Error('Discogs pidió esperar un momento (límite de consultas). Intenta en unos segundos.')
  if (!res.ok) throw new Error(`Discogs respondió ${res.status}`)
  return res.json() as Promise<T>
}

interface SearchResult {
  id: number
  type: string
  title: string
  year?: string
  label?: string[]
  catno?: string
  country?: string
  format?: string[]
  thumb?: string
  cover_image?: string
  barcode?: string[]
  genre?: string[]
  style?: string[]
  master_id?: number
  community?: { have?: number; want?: number }
}

function splitTitle(full: string): { artist: string; title: string } {
  // Discogs devuelve "Artista - Título".
  const i = full.indexOf(' - ')
  if (i === -1) return { artist: 'Varios', title: full }
  return { artist: cleanArtist(full.slice(0, i)), title: full.slice(i + 3) }
}

/** Discogs agrega "(2)" a artistas con nombre repetido. */
export function cleanArtist(name: string): string {
  return name.replace(/\s\(\d+\)$/, '').trim()
}

function toCandidate(r: SearchResult): ReleaseCandidate {
  const { artist, title } = splitTitle(r.title)
  return {
    source: 'discogs',
    sourceId: String(r.id),
    title,
    artist,
    year: r.year ? Number(r.year) : undefined,
    label: r.label?.[0],
    catalogNumber: r.catno,
    country: r.country,
    format: r.format?.filter((f) => f !== 'Vinyl' && f !== 'Album').slice(0, 2).join(', ') || r.format?.[0],
    thumbUrl: r.thumb || undefined,
    coverUrl: r.cover_image || undefined,
    barcode: r.barcode?.[0]?.replace(/\D/g, '') || undefined,
    genres: r.genre ?? [],
    styles: r.style ?? [],
    discogsMasterId: r.master_id || undefined,
    community: r.community ? { have: r.community.have, want: r.community.want } : undefined,
  }
}

export interface MasterInfo {
  id: number
  title: string
  artist: string
  year?: number
  genres: string[]
  styles: string[]
  thumbUrl?: string
  coverUrl?: string
  /** 0..1 según cuánta gente tiene el disco en Discogs. */
  popularity?: number
}

/** Discografía (masters) de un artista en vinilo, para sugerencias. */
export async function searchMasters(artist: string): Promise<MasterInfo[]> {
  const data = await get<{ results: SearchResult[] }>('/database/search', {
    artist,
    type: 'master',
    format: 'Vinyl',
    per_page: 50,
  })
  // Discogs distingue homónimos con "(2)", "(3)"…; si hay resultados del nombre exacto, se descartan los demás.
  const all = data.results ?? []
  const rawArtist = (r: SearchResult) => r.title.split(' - ')[0]?.trim().toLowerCase()
  const exact = all.filter((r) => rawArtist(r) === artist.trim().toLowerCase())
  const rows = exact.length ? exact : all
  // log10 aplana la diferencia entre 100 y 100 000 dueños; se normaliza contra el más tenido.
  const pops = rows.map((r) => Math.log10(1 + (r.community?.have ?? 0)))
  const max = Math.max(0, ...pops)
  return rows.map((r, i) => {
    const { artist: a, title } = splitTitle(r.title)
    return {
      id: r.id,
      title,
      artist: a,
      year: r.year ? Number(r.year) || undefined : undefined,
      genres: r.genre ?? [],
      styles: r.style ?? [],
      thumbUrl: r.thumb || undefined,
      coverUrl: r.cover_image || undefined,
      popularity: max ? pops[i] / max : undefined,
    }
  })
}

export async function searchByBarcode(barcode: string): Promise<ReleaseCandidate[]> {
  const data = await get<{ results: SearchResult[] }>('/database/search', {
    barcode: barcode.replace(/\D/g, ''),
    type: 'release',
    format: 'Vinyl',
    per_page: 25,
  })
  return data.results.map(toCandidate)
}

export async function searchByText(q: string): Promise<ReleaseCandidate[]> {
  const data = await get<{ results: SearchResult[] }>('/database/search', {
    q,
    type: 'release',
    format: 'Vinyl',
    per_page: 25,
  })
  return data.results.map(toCandidate)
}

interface ReleaseDetail {
  id: number
  master_id?: number
  title: string
  year?: number
  country?: string
  artists?: { name: string }[]
  labels?: { name: string; catno?: string }[]
  formats?: { name: string; qty?: string; descriptions?: string[] }[]
  genres?: string[]
  styles?: string[]
  images?: { type: string; uri: string; uri150: string }[]
  tracklist?: { position: string; title: string; duration?: string; type_?: string }[]
  identifiers?: { type: string; value: string }[]
}

export interface ReleaseDetails {
  masterId?: number
  title: string
  artist: string
  year?: number
  country?: string
  label?: string
  catalogNumber?: string
  format?: string
  genres: string[]
  styles: string[]
  coverUrl?: string
  thumbUrl?: string
  tracklist: Track[]
  barcode?: string
}

export async function getRelease(id: number): Promise<ReleaseDetails> {
  const r = await get<ReleaseDetail>(`/releases/${id}`, {})
  const primary = r.images?.find((i) => i.type === 'primary') ?? r.images?.[0]
  const fmt = r.formats?.[0]
  const format = fmt
    ? [fmt.qty && fmt.qty !== '1' ? `${fmt.qty}x` : '', fmt.name === 'Vinyl' ? 'LP' : fmt.name, ...(fmt.descriptions ?? []).filter((d) => d !== 'Album' && d !== 'LP')]
        .filter(Boolean)
        .join(' ')
    : undefined
  return {
    masterId: r.master_id || undefined,
    title: r.title,
    artist: cleanArtist(r.artists?.map((a) => a.name).join(', ') ?? 'Varios'),
    year: r.year || undefined,
    country: r.country,
    label: r.labels?.[0]?.name,
    catalogNumber: r.labels?.[0]?.catno,
    format,
    genres: r.genres ?? [],
    styles: r.styles ?? [],
    coverUrl: primary?.uri,
    thumbUrl: primary?.uri150,
    tracklist: (r.tracklist ?? [])
      .filter((t) => t.type_ !== 'heading')
      .map((t) => ({ position: t.position, title: t.title, duration: t.duration || undefined })),
    barcode: r.identifiers?.find((i) => i.type === 'Barcode')?.value.replace(/\D/g, '') || undefined,
  }
}
