import type { Album } from '../types'

export interface Filters {
  query: string
  genre?: string
  decade?: number
  minRating?: number
  sort: 'recent' | 'artist' | 'title' | 'year' | 'rating'
}

export const DEFAULT_FILTERS: Filters = { query: '', sort: 'recent' }

const SORTS: Filters['sort'][] = ['recent', 'artist', 'title', 'year', 'rating']

/**
 * Filtros iniciales desde la URL (`/?q=Coldplay`, `?genero=Rock`, `?decada=2020`, `?orden=rating`):
 * así "Ver en la colección" desde En números abre la Colección ya filtrada. Lo que no se entiende se ignora.
 */
export function filtersFromParams(p: URLSearchParams): Filters {
  const f: Filters = { ...DEFAULT_FILTERS }
  const q = p.get('q')
  if (q) f.query = q
  const genre = p.get('genero')
  if (genre) f.genre = genre
  // Cualquier año vale ("?decada=2025" → 2020); fuera de 1000–9999 se ignora.
  const decade = Number(p.get('decada'))
  if (p.get('decada') && Number.isInteger(decade) && decade >= 1000 && decade <= 9999) f.decade = Math.floor(decade / 10) * 10
  const sort = p.get('orden') as Filters['sort'] | null
  if (sort && SORTS.includes(sort)) f.sort = sort
  return f
}

/** Quita acentos y mayúsculas para que "cafe tacuba" encuentre "Café Tacvba". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function decadeOf(year: number): number
export function decadeOf(year?: number): number | undefined
export function decadeOf(year?: number): number | undefined {
  if (!year) return undefined
  return Math.floor(year / 10) * 10
}

export function applyFilters(albums: Album[], f: Filters): Album[] {
  const q = normalize(f.query)
  let out = albums.filter((a) => {
    if (q) {
      const hay = normalize(`${a.title} ${a.artist} ${a.label ?? ''} ${a.genres.join(' ')} ${a.styles.join(' ')} ${a.year ?? ''}`)
      if (!hay.includes(q)) return false
    }
    if (f.genre && !a.genres.includes(f.genre) && !a.styles.includes(f.genre)) return false
    if (f.decade !== undefined && decadeOf(a.year) !== f.decade) return false
    if (f.minRating !== undefined && (a.rating ?? 0) < f.minRating) return false
    return true
  })

  const byText = (x?: string, y?: string) => normalize(x ?? '').localeCompare(normalize(y ?? ''), 'es')
  switch (f.sort) {
    case 'artist':
      out = out.sort((a, b) => byText(sortableArtist(a.artist), sortableArtist(b.artist)) || byText(a.title, b.title))
      break
    case 'title':
      out = out.sort((a, b) => byText(a.title, b.title))
      break
    case 'year':
      out = out.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || byText(a.title, b.title))
      break
    case 'rating':
      out = out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byText(a.title, b.title))
      break
    default:
      out = out.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }
  return out
}

/** "The Beatles" se ordena en la B, como en una tienda de discos. */
export function sortableArtist(artist: string): string {
  return artist.replace(/^(the|los|las|el|la)\s+/i, '')
}

export function collectGenres(albums: Album[]): string[] {
  const count = new Map<string, number>()
  for (const a of albums) for (const g of [...a.genres, ...a.styles]) count.set(g, (count.get(g) ?? 0) + 1)
  return [...count.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([g]) => g)
}

export function collectDecades(albums: Album[]): number[] {
  const set = new Set<number>()
  for (const a of albums) {
    const d = decadeOf(a.year)
    if (d) set.add(d)
  }
  return [...set].sort((a, b) => a - b)
}
