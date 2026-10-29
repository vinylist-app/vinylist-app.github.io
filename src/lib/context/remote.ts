import type { Album } from '../../types'
import { cached } from '../../db'
import * as mb from '../../api/musicbrainz'
import { summaryForWikidata, type WikiSummary } from '../../api/wikipedia'
import { topReleaseGroups } from '../../api/listenbrainzPopularity'
import { artistKey, cleanArtist, isVariousArtists } from '../text'
import { discographyFacts, discographyLine, formatCount, lifeLine, nextUpDetail, studioAlbums, wikidataQid } from './pure'
import type { DiscRef, Fact } from './types'

/**
 * Lo que cuentan las fuentes de internet, con caché de 30 días en el celular.
 * Cada fuente va en su propio try/catch: si una falla, las demás siguen.
 * `onFact` avisa en cuanto llega cada línea, para irlas pintando.
 */
const TTL_DAYS = 30

/** Orden fijo de las líneas remotas, para que no bailen según quién responda primero. */
export const REMOTE_ORDER = ['artista', 'discografia', 'vida', 'iconico', 'escuchado', 'dato']

export interface RemoteContext {
  /** Discos del artista que ya tienen (para "te faltan N de M"). */
  ownedOfArtist: Pick<Album, 'title' | 'musicbrainzReleaseGroupId'>[]
  /** Ya tienen este disco: entonces "sería tu primer disco" no aplica. */
  alreadyOwned?: boolean
  signal?: AbortSignal
  onFact?: (f: Fact) => void
}

interface ArtistInfo {
  type?: string
  'life-span'?: { begin?: string; end?: string; ended?: boolean }
}

interface ReleaseGroupUrls {
  relations?: { type: string; url?: { resource: string } }[]
}

function get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(key, TTL_DAYS, fetcher)
}

function year(s?: string): number | undefined {
  const n = s ? Number(s.slice(0, 4)) : NaN
  return Number.isNaN(n) ? undefined : n
}

/** Hecho de Discogs: cuántos coleccionistas lo tienen. No necesita red (viene en la búsqueda). */
export function discogsFact(disc: DiscRef): Fact | undefined {
  const have = disc.community?.have ?? 0
  const want = disc.community?.want
  if (have < 10_000) return undefined
  const detail = `${formatCount(have)} coleccionistas lo tienen${want ? ` y ${formatCount(want)} lo buscan` : ''} en Discogs.`
  return { id: 'iconico', icon: '★', title: have >= 50_000 ? 'Es icónico.' : 'Es muy conocido.', detail, source: 'Discogs' }
}

export async function remoteFacts(disc: DiscRef, ctx: RemoteContext): Promise<Fact[]> {
  const facts: Fact[] = []
  const emit = (f: Fact) => {
    if (ctx.signal?.aborted) return
    facts.push(f)
    ctx.onFact?.(f)
  }

  const dg = discogsFact(disc)
  if (dg) emit(dg)

  if (isVariousArtists(disc.artist)) return facts
  const artist = cleanArtist(disc.artist)

  // 1) El artista en MusicBrainz: su MBID y su discografía de estudio.
  let artistMbid = disc.musicbrainzArtistId
  let rgid = disc.musicbrainzReleaseGroupId
  try {
    artistMbid = artistMbid ?? (await get(`mb:artist:${artistKey(artist)}`, () => mb.findArtistMbid(artist)))
  } catch {
    artistMbid = undefined
  }
  if (!artistMbid || ctx.signal?.aborted) return facts

  let isLast = false
  let discYear = disc.year
  try {
    const groups = await get(`mb:rgs:${artistMbid}`, () => mb.browseReleaseGroups(artistMbid!))
    const studio = studioAlbums(groups)
    const f = discographyFacts(disc, studio, ctx.ownedOfArtist)
    isLast = f.isLast
    if (!rgid) {
      // Si la búsqueda no trajo el grupo, se toma el del mismo título (de estudio o no).
      const match = groups.find((g) => g.title.toLowerCase() === disc.title.toLowerCase()) ?? (f.position ? studio[f.position - 1] : undefined)
      rgid = match?.id
    }
    if (!discYear && f.position) discYear = studio[f.position - 1].year
    if (!ctx.alreadyOwned && ctx.ownedOfArtist.length === 0) {
      const detail = nextUpDetail(f)
      if (detail) emit({ id: 'artista', icon: '1.º', title: `Sería tu primer disco de ${artist}.`, detail, source: 'MusicBrainz' })
    }
    const line = discographyLine(artist, f)
    if (line) emit({ id: 'discografia', icon: '↑', title: line.title, detail: line.detail, source: 'MusicBrainz' })
  } catch {
    // Sin discografía; seguimos.
  }

  // 2) La vida del artista: persona que murió, grupo que se separó.
  try {
    const info = await get<ArtistInfo>(`mb:artistinfo:${artistMbid}`, () => mb.mbGet<ArtistInfo>(`/artist/${artistMbid}`, {}, true))
    const end = year(info['life-span']?.end)
    if (end && info.type === 'Person') {
      const line = lifeLine(discYear, end)
      if (line) emit({ id: 'vida', icon: 'i', title: line, source: 'MusicBrainz' })
    } else if (end && info.type === 'Group' && isLast) {
      emit({ id: 'vida', icon: 'i', title: `Fue su último disco de estudio antes de separarse (${end}).`, source: 'MusicBrainz' })
    }
  } catch {
    // Sin datos del artista.
  }

  if (ctx.signal?.aborted) return facts

  // 3) ListenBrainz: ¿es el más escuchado del artista?
  if (rgid) {
    try {
      const top = await get(`lb:top:${artistMbid}`, () => topReleaseGroups(artistMbid!))
      if (top[0]?.releaseGroupMbid === rgid) {
        emit({ id: 'escuchado', icon: '★', title: `Es el disco más escuchado de ${artist} en ListenBrainz.`, detail: top[0].listens ? `${formatCount(top[0].listens)} escuchas registradas.` : undefined, source: 'ListenBrainz' })
      }
    } catch {
      // ListenBrainz no respondió.
    }
  }

  // 4) Wikipedia, vía el enlace a Wikidata que guarda MusicBrainz.
  if (rgid) {
    try {
      const urls = await get<ReleaseGroupUrls>(`mb:rgurls:${rgid}`, () => mb.mbGet<ReleaseGroupUrls>(`/release-group/${rgid}`, { inc: 'url-rels' }, true))
      const qid = (urls.relations ?? []).map((r) => r.url?.resource ?? '').map(wikidataQid).find(Boolean)
      if (qid) {
        const summary = await get<WikiSummary | null>(`wp:summary:${qid}`, () => summaryForWikidata(qid))
        if (summary) emit({ id: 'dato', icon: 'i', title: 'Un dato.', detail: summary.extract, source: 'Wikipedia', url: summary.url, lang: summary.lang })
      }
    } catch {
      // Sin artículo.
    }
  }

  return facts
}

/** Mezcla las líneas locales con las remotas: la remota 'artista' completa a la local; el resto va en orden fijo. */
export function mergeFacts(local: Fact[], remote: Fact[]): Fact[] {
  const out = local.map((f) => {
    const r = remote.find((x) => x.id === f.id)
    return r ? { ...f, detail: r.detail ?? f.detail, source: f.source } : f
  })
  const rest = remote.filter((r) => !local.some((f) => f.id === r.id)).sort((a, b) => REMOTE_ORDER.indexOf(a.id) - REMOTE_ORDER.indexOf(b.id))
  return [...out, ...rest]
}

/** Fuentes usadas, en el orden de la maqueta: "tu colección · MusicBrainz · Wikipedia · Discogs". */
export function sourcesOf(facts: Fact[]): string[] {
  const order: { key: Fact['source']; label: string }[] = [
    { key: 'colección', label: 'tu colección' },
    { key: 'MusicBrainz', label: 'MusicBrainz' },
    { key: 'Wikipedia', label: 'Wikipedia' },
    { key: 'Discogs', label: 'Discogs' },
    { key: 'ListenBrainz', label: 'ListenBrainz' },
  ]
  const used = new Set(facts.map((f) => f.source))
  // La línea "Sería tu primer disco" completada con MusicBrainz cuenta para las dos fuentes.
  if (facts.some((f) => f.id === 'artista' && f.detail)) used.add('MusicBrainz')
  return order.filter((o) => used.has(o.key)).map((o) => o.label)
}
