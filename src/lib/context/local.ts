import type { Album, WishlistItem } from '../../types'
import type { TasteProfile } from '../taste/profile'
import { rankCandidates } from '../taste/rank'
import { albumKey, artistKey, cleanArtist, isVariousArtists, tagLabel } from '../text'
import { decadeOf } from '../filters'
import { countWord, decadeWords, listTitles, monthLabel, ordinal, tagKey } from './pure'
import type { DiscRef, Fact, Verdict } from './types'

/**
 * Lo que la colección sola puede contar de un disco, al instante y sin internet.
 * Máximo cuatro líneas, en orden de prioridad: artista, género, parecidos, década, deseos.
 */

export interface LocalOptions {
  /** uid de quien mira la pantalla (para "lo quiere {otra persona}"). */
  me?: string
  /** Artistas de la colección que suenan parecido al del disco (de la caché de ListenBrainz). */
  similarTo?: string[]
  now?: Date
}

export interface CollectionMatch {
  album: Album
  /** same: misma edición · other: otra edición del mismo álbum. */
  kind: 'same' | 'other'
}

/** ¿Ya está en la colección? Misma edición por Discogs o código; otra edición por master, grupo o artista + título. */
export function matchInCollection(disc: DiscRef, albums: Album[]): CollectionMatch | undefined {
  const code = disc.barcode?.replace(/\D/g, '') || undefined
  const same = albums.find((a) => (disc.discogsId && a.discogsId === disc.discogsId) || (code && a.barcode === code))
  if (same) return { album: same, kind: 'same' }
  const key = albumKey(disc.artist, disc.title)
  const other = albums.find((a) =>
    (disc.discogsMasterId && a.discogsMasterId === disc.discogsMasterId) ||
    (disc.musicbrainzReleaseGroupId && a.musicbrainzReleaseGroupId === disc.musicbrainzReleaseGroupId) ||
    albumKey(a.artist, a.title) === key,
  )
  return other ? { album: other, kind: 'other' } : undefined
}

/** ¿Está en los deseos (de quien sea)? */
export function matchWishes(disc: DiscRef, wishlist: WishlistItem[]): WishlistItem[] {
  const key = albumKey(disc.artist, disc.title)
  const code = disc.barcode?.replace(/\D/g, '') || undefined
  return wishlist.filter((w) =>
    (disc.discogsId && w.discogsId === disc.discogsId) ||
    (disc.discogsMasterId && w.discogsMasterId === disc.discogsMasterId) ||
    (disc.musicbrainzReleaseGroupId && w.musicbrainzReleaseGroupId === disc.musicbrainzReleaseGroupId) ||
    (code && w.barcode === code) ||
    albumKey(w.artist, w.title) === key,
  )
}

/** Los demás discos: la colección sin este mismo álbum (en cualquier edición). */
export function otherAlbums(disc: DiscRef, albums: Album[]): Album[] {
  const key = albumKey(disc.artist, disc.title)
  return albums.filter((a) =>
    a.id !== disc.ownAlbumId &&
    !(disc.discogsMasterId && a.discogsMasterId === disc.discogsMasterId) &&
    !(disc.musicbrainzReleaseGroupId && a.musicbrainzReleaseGroupId === disc.musicbrainzReleaseGroupId) &&
    albumKey(a.artist, a.title) !== key,
  )
}

function hasTag(a: Album, key: string): boolean {
  return [...a.genres, ...a.styles].some((t) => tagKey(t) === key)
}

function byYear(a: Album, b: Album): number {
  return (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title)
}

export function localFacts(disc: DiscRef, albums: Album[], wishlist: WishlistItem[], profile: TasteProfile, opts: LocalOptions = {}): Fact[] {
  const facts: Fact[] = []
  const others = otherAlbums(disc, albums)
  // El nombre del artista como ya está escrito en la colección, si existe ahí.
  const artist = profile.artists.get(artistKey(disc.artist))?.name ?? cleanArtist(disc.artist)

  // (a) El artista.
  if (!isVariousArtists(disc.artist)) {
    const own = others.filter((a) => artistKey(a.artist) === artistKey(disc.artist)).sort(byYear)
    if (own.length === 0) {
      facts.push({ id: 'artista', icon: '1.º', title: `Sería tu primer disco de ${artist}.`, source: 'colección' })
    } else if (own.length === 1) {
      facts.push({ id: 'artista', icon: '↑', title: `Ya tienes «${own[0].title}» de ${artist}; este te faltaba.`, source: 'colección' })
    } else {
      facts.push({ id: 'artista', icon: '↑', title: `Ya tienes ${own.length} de ${artist}: ${listTitles(own.map((a) => a.title))}. Este te faltaba.`, source: 'colección' })
    }
  }

  // (b) El género (y el estilo).
  const genre = disc.genres[0]
  const style = disc.styles[0]
  if (genre || style) {
    const g = genre ? { label: tagLabel(genre), count: others.filter((a) => hasTag(a, tagKey(genre))).length } : undefined
    const s = style ? { label: tagLabel(style), count: others.filter((a) => hasTag(a, tagKey(style))).length } : undefined
    if (g && g.count === 0) {
      const extra = s && s.count === 0 && tagKey(style!) !== tagKey(genre!) ? ` (y de ${s.label})` : ''
      facts.push({ id: 'genero', icon: '1.º', title: `Sería tu primer disco de ${g.label}${extra}.`, source: 'colección' })
    } else if (s && s.count === 0 && g) {
      facts.push({ id: 'genero', icon: '1.º', title: `Sería tu primer disco de ${s.label}.`, detail: `Ya tienes ${g.count} de ${g.label}.`, source: 'colección' })
    } else if (g) {
      facts.push({ id: 'genero', icon: '↑', title: `Ya tienes ${g.count} de ${g.label}; este sería el ${ordinal(g.count + 1)}`, detail: s && s.count > 0 && tagKey(style!) !== tagKey(genre!) ? `${s.count === 1 ? 'Uno de ellos es' : `${s.count} de ellos son`} ${s.label}.` : undefined, source: 'colección' })
    } else if (s) {
      facts.push(s.count === 0
        ? { id: 'genero', icon: '1.º', title: `Sería tu primer disco de ${s.label}.`, source: 'colección' }
        : { id: 'genero', icon: '↑', title: `Ya tienes ${s.count} de ${s.label}; este sería el ${ordinal(s.count + 1)}`, source: 'colección' })
    }
  }

  // (c) Parecidos: misma década y mismo género o estilo; si no, artista parecido según ListenBrainz.
  const decade = decadeOf(disc.year)
  const tags = [...disc.genres, ...disc.styles].map(tagKey)
  const alike = others
    .filter((a) => artistKey(a.artist) !== artistKey(disc.artist))
    .filter((a) => tags.some((t) => hasTag(a, t)) && (decade === undefined || decadeOf(a.year) === decade))
    .sort(byYear)
  if (alike.length > 0) {
    const shared = tags.find((t) => alike.every((a) => hasTag(a, t))) ?? tags.find((t) => alike.some((a) => hasTag(a, t)))!
    const sharedName = [...disc.genres, ...disc.styles].find((t) => tagKey(t) === shared) ?? shared
    const what = tagLabel(sharedName).toLowerCase()
    const titles = listTitles(alike.map((a) => a.title))
    facts.push({
      id: 'parecidos',
      icon: '≈',
      title: `Va con ${countWord(alike.length)} que ya tienes.`,
      detail: decade !== undefined ? `${titles}: ${what} de los ${decadeWords(decade)}.` : `${titles}: también ${what}.`,
      source: 'colección',
    })
  } else if (opts.similarTo?.length) {
    const seeds = opts.similarTo.map(artistKey)
    const bySeed = others.filter((a) => seeds.includes(artistKey(a.artist))).sort(byYear)
    if (bySeed.length) {
      facts.push({
        id: 'parecidos',
        icon: '≈',
        title: `Va con ${countWord(bySeed.length)} que ya tienes.`,
        detail: `${listTitles(bySeed.map((a) => a.title))}: ${listTitles([...new Set(bySeed.map((a) => cleanArtist(a.artist)))])} ${bySeed.length === 1 ? 'suena' : 'suenan'} parecido a ${artist}, según ListenBrainz.`,
        source: 'ListenBrainz',
      })
    }
  }

  // (d) La década fuerte: solo si la del disco es la más frecuente (y hay al menos tres).
  if (decade !== undefined) {
    const counts = new Map<number, number>()
    for (const a of others) {
      const d = decadeOf(a.year)
      if (d !== undefined) counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    const mine = counts.get(decade) ?? 0
    const top = Math.max(0, ...counts.values())
    const ties = [...counts.values()].filter((n) => n === top).length
    if (mine >= 3 && mine === top && ties === 1) {
      facts.push({ id: 'decada', icon: '↑', title: `Los ${decadeWords(decade)} son tu década fuerte: ${mine} discos.`, source: 'colección' })
    }
  }

  // (e) Lo quiere alguien más de la familia.
  const wishes = matchWishes(disc, wishlist).filter((w) => w.wantedBy !== opts.me)
  if (wishes.length) {
    const w = wishes[0]
    const when = monthLabel(w.addedAt, opts.now)
    facts.push({ id: 'deseo', icon: '♥', title: `Lo quiere ${w.wantedByName}${when ? ` desde ${when}` : ''}.`, detail: 'Está en los deseos de la familia.', source: 'colección' })
  }

  return facts.slice(0, 4)
}

/**
 * Veredicto corto según los gustos. Solo con cinco o más discos calificados;
 * con menos, nada: no vale la pena opinar sin datos.
 */
export function verdictFor(disc: DiscRef, profile: TasteProfile): Verdict | undefined {
  if (profile.ratedCount < 5) return undefined
  const known = profile.artists.has(artistKey(disc.artist))
  const [hit] = rankCandidates(profile, [{
    title: disc.title,
    artist: disc.artist,
    year: disc.year,
    genres: disc.genres,
    styles: disc.styles,
    source: known ? 'same-artist' : 'style',
    seedArtist: known ? disc.artist : undefined,
  }], new Set(), 1)
  // Si ya lo tienen, rank lo descarta: se evalúa con la misma lógica pero sin ese filtro.
  const score = hit?.score ?? (profile.ownedKeys.has(albumKey(disc.artist, disc.title)) ? undefined : 0)
  if (score === undefined) return undefined
  if (score >= 0.6) return 'Pinta para ti'
  if (score >= 0.3) return 'Algo distinto a lo tuyo'
  return 'Terreno nuevo'
}
