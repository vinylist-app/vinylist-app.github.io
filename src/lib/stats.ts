import type { Album, Condition } from '../types'
import { decadeOf, sortableArtist } from './filters'
import { toStars } from './rating'
import { artistKey, cleanArtist, decadeLabel, isVariousArtists, normalize, priceLabel, purchaseDateLabel, tagLabel } from './text'

/**
 * Los cálculos de "En números": puros, sin React. Cada sección devuelve sus
 * categorías contadas, si merece gráfica y la frase que la encabeza (el lead).
 * Regla general: hay gráfica solo con ≥ 2 categorías con dato y máximo ≥ 2;
 * si no, la sección es solo su frase. Lo que falta nunca se reparte ni se
 * esconde: cada sección dice de cuántos discos sale.
 */

/** Una categoría con su conteo: una barra, una columna, una fila de la hoja. */
export interface Bucket {
  /** Llave de agrupación (normalizada o uid). */
  key: string
  /** Nombre para mostrar. */
  label: string
  count: number
  /** Grafía cruda más frecuente, para el filtro de Colección (?genero=). */
  raw?: string
}

/** "1 disco", "7 discos". */
export function discos(n: number): string {
  return `${n} ${n === 1 ? 'disco' : 'discos'}`
}

/** Porcentaje entero; 0 si no hay de qué sacarlo. */
export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

/** ¿Merece gráfica? Dos categorías con dato o más y la mayor con al menos 2. */
export function hasChart(rows: { count: number }[]): boolean {
  const withData = rows.filter((r) => r.count > 0)
  return withData.length >= 2 && Math.max(...withData.map((r) => r.count)) >= 2
}

const byName = (a: string, b: string) => normalize(a).localeCompare(normalize(b), 'es')

/** "Coldplay y Led Zeppelin" · "Coldplay, Led Zeppelin y 1 más". */
function tieNames(names: string[]): string {
  if (names.length <= 2) return names.join(' y ')
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`
}

/** "Rock, Pop y Jazz" · "Rock, Pop, Jazz y 2 más" (hasta tres nombres). */
function listNames(names: string[]): string {
  const shown = names.slice(0, 3)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} y ${rest} más`
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}`
}

/** "Música latina" → "música latina"; las siglas (R&B, EDM) se quedan. */
export function casual(label: string): string {
  return label
    .split(' ')
    .map((w) => (/^[A-Z0-9&]{1,4}$/.test(w) ? w : w.toLowerCase()))
    .join(' ')
}

/** "Pop Rock" → "Pop rock". */
export function sentence(label: string): string {
  const c = casual(label)
  return c.charAt(0).toUpperCase() + c.slice(1)
}

/** Cuenta por llave normalizada; cada disco cuenta una vez por categoría aunque la traiga repetida. */
function tally(albums: Album[], pick: (a: Album) => (string | undefined)[]): { rows: Bucket[]; without: number } {
  const map = new Map<string, { label: string; count: number; raws: Map<string, number> }>()
  let without = 0
  for (const a of albums) {
    const seen = new Set<string>()
    for (const value of pick(a)) {
      const raw = value?.trim()
      if (!raw) continue
      const key = normalize(raw)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const e = map.get(key) ?? { label: raw, count: 0, raws: new Map<string, number>() }
      e.count++
      e.raws.set(raw, (e.raws.get(raw) ?? 0) + 1)
      map.set(key, e)
    }
    if (seen.size === 0) without++
  }
  const rows: Bucket[] = [...map.entries()].map(([key, e]) => {
    const raw = [...e.raws.entries()].sort((x, y) => y[1] - x[1])[0][0]
    return { key, label: e.label, count: e.count, raw }
  })
  rows.sort((x, y) => y.count - x.count || byName(x.label, y.label))
  return { rows, without }
}

/* ---------- Héroe ---------- */

export interface HeroStats {
  n: number
  /** "68 h", "45 min" o "—". */
  hours: string
  /** "947" o "—". */
  songs: string
  artists: number
  withDurations: number
  note?: string
}

/** "4:54" → 294 s; "1:02:30" → 3750 s; lo que no se entiende (o trae segundos ≥ 60), undefined. */
export function parseDuration(s?: string): number | undefined {
  if (!s) return undefined
  const m = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s.trim())
  if (!m) return undefined
  const [, a, b, c] = m
  return c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c)
}

export function heroStats(albums: Album[]): HeroStats {
  let seconds = 0
  let songs = 0
  let withDurations = 0
  for (const a of albums) {
    songs += a.tracklist.length
    let any = false
    for (const t of a.tracklist) {
      // "0:00" (pasa con algunos lanzamientos de Discogs) no es una duración.
      const d = parseDuration(t.duration)
      if (d) { seconds += d; any = true }
    }
    if (any) withDurations++
  }
  const artists = new Set(albums.filter((a) => !isVariousArtists(a.artist)).map((a) => artistKey(a.artist)).filter(Boolean)).size
  const hours = seconds === 0 ? '—' : seconds < 3600 ? `${Math.round(seconds / 60)} min` : `${Math.round(seconds / 3600)} h`
  let note: string | undefined
  if (songs === 0) note = 'Sin canciones todavía: con Discogs se llenan'
  else if (withDurations === 0) note = 'Tus canciones todavía no traen duración'
  else if (withDurations < albums.length) note = `Horas de ${withDurations === 1 ? '1 disco' : `los ${withDurations} discos`} con duraciones`
  return { n: albums.length, hours, songs: songs === 0 ? '—' : String(songs), artists, withDurations, note }
}

/* ---------- A1 · Artistas ---------- */

export interface ArtistStats {
  rows: Bucket[]
  /** Recopilaciones de varios artistas, fuera del ranking. */
  various: number
  lead: string
  chart: boolean
}

export function artistStats(albums: Album[]): ArtistStats {
  const own = albums.filter((a) => !isVariousArtists(a.artist))
  const various = albums.length - own.length
  const map = new Map<string, Bucket>()
  for (const a of own) {
    const key = artistKey(a.artist)
    if (!key) continue
    const b = map.get(key)
    if (b) b.count++
    else map.set(key, { key, label: cleanArtist(a.artist), count: 1 })
  }
  const rows = [...map.values()].sort((x, y) => y.count - x.count || sortableArtist(x.label).localeCompare(sortableArtist(y.label), 'es'))
  const chart = hasChart(rows)
  let lead: string
  if (rows.length === 0) lead = various > 0 ? 'Tus discos son recopilaciones de varios artistas.' : ''
  else if (albums.length === 1) lead = `Tu único disco es de ${rows[0].label}.`
  else if (own.length === 1) lead = `Tu único disco con artista es de ${rows[0].label}.`
  else {
    const c = rows[0].count
    const tied = rows.filter((r) => r.count === c)
    if (c === 1) lead = own.length <= 3 ? `Tus ${own.length} discos son de ${rows.length} artistas distintos.` : `Un disco de cada uno: ${rows.length} artistas.`
    else if (tied.length === 1) lead = `${rows[0].label} es tu artista: ${c} discos.`
    else if (tied.length === 2) lead = `${rows[0].label} y ${rows[1].label} empatan: ${c} discos cada uno.`
    else lead = `${tieNames(tied.map((r) => r.label))} empatan con ${c}.`
  }
  return { rows, various, lead, chart }
}

/* ---------- A2 · De qué año son ---------- */

export interface YearCol {
  /** Década (1950) o año (2025). */
  value: number
  /** Dos dígitos: "50", "00", "25". */
  tick: string
  count: number
}

/** El más viejo o el más nuevo, y cuántos más hay de ese año. */
export interface Extreme {
  album: Album
  more: number
}

export interface DecadeStats {
  /** De la década mínima a la máxima, sin saltarse las vacías. */
  decades: YearCol[]
  /** Década seleccionada por defecto: la que más tiene (empate: la más reciente). */
  top?: number
  without: number
  lead: string
  /** Columnas por década (≥ 2 décadas con dato y máximo ≥ 2). */
  chart: boolean
  /** Columnas por año de `top` aunque no haya columnas de décadas (toda la colección en una sola). */
  chartYears: boolean
  oldest?: Extreme
  newest?: Extreme
}

/** "2000" → "00", "1970" → "70", "2025" → "25". */
export function tick2(n: number): string {
  return String(n % 100).padStart(2, '0')
}

type WithYear = Album & { year: number }
const hasYear = (a: Album): a is WithYear => typeof a.year === 'number' && Number.isFinite(a.year) && a.year > 0

function extremeOf(withYear: WithYear[], year: number): Extreme {
  const same = withYear.filter((a) => a.year === year).sort((a, b) => a.addedAt.localeCompare(b.addedAt))
  return { album: same[0], more: same.length - 1 }
}

export function decadeStats(albums: Album[], now = new Date()): DecadeStats {
  const withYear = albums.filter(hasYear)
  const without = albums.length - withYear.length
  if (withYear.length === 0) return { decades: [], without, lead: 'Tus discos todavía no traen año.', chart: false, chartYears: false }
  const years = withYear.map((a) => a.year)
  const minY = Math.min(...years)
  const maxY = Math.max(...years)
  const counts = new Map<number, number>()
  for (const y of years) {
    const d = decadeOf(y)
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  const decades: YearCol[] = []
  for (let d = decadeOf(minY); d <= decadeOf(maxY); d += 10) decades.push({ value: d, tick: tick2(d), count: counts.get(d) ?? 0 })
  const chart = hasChart(decades)
  const oldest = extremeOf(withYear, minY)
  const newest = extremeOf(withYear, maxY)
  const c = Math.max(...decades.map((d) => d.count))
  const tied = decades.filter((d) => d.count === c).map((d) => d.value)
  const top = tied[tied.length - 1]
  const chartYears = hasChart(yearsOf(albums, top))

  let lead: string
  if (c < 2) {
    // Nadie repite década: no hay década fuerte, solo el rango (un disco con año → su año).
    lead = minY === maxY ? `Tu disco es de ${minY}.` : `Tus discos van de ${minY} a ${maxY}.`
  } else if (tied.length >= 2) {
    const names = tied.map((d, i) => (i === 0 ? decadeLabel(d) : decadeLabel(d).replace('años ', '')))
    lead = `Los ${tieNames(names)} empatan: ${c} discos cada una.`
  } else {
    const D = top
    const s = c / albums.length
    const current = Math.floor(now.getFullYear() / 10) * 10
    const remate = s >= 0.4 ? (D === current ? ': coleccionas lo de ahora.' : D <= 1980 ? ': coleccionas clásicos.' : '.') : '.'
    if (s >= 0.6) lead = `Casi todo lo tuyo salió en los ${decadeLabel(D)}${remate}`
    else if (s >= 0.5) lead = `Más de la mitad salió en los ${decadeLabel(D)}${remate}`
    else if (s >= 0.45) lead = `Casi la mitad salió en los ${decadeLabel(D)}${remate}`
    else if (remate !== '.') lead = `Tu década más fuerte son los ${decadeLabel(D)}, con ${c} discos${remate}`
    else lead = `Tu década más fuerte: los ${decadeLabel(D)}, con ${c} discos.`
  }
  return { decades, top, without, lead, chart, chartYears, oldest, newest }
}

/** Los diez años de una década (d…d+9); los que van en 0 conservan su columna vacía. */
export function yearsOf(albums: Album[], decade: number): YearCol[] {
  const counts = new Map<number, number>()
  for (const a of albums) if (a.year && decadeOf(a.year) === decade) counts.set(a.year, (counts.get(a.year) ?? 0) + 1)
  const out: YearCol[] = []
  for (let y = decade; y < decade + 10; y++) out.push({ value: y, tick: tick2(y), count: counts.get(y) ?? 0 })
  return out
}

/* ---------- A3 · Géneros · Estilos ---------- */

export interface TagStats {
  rows: Bucket[]
  without: number
  lead: string
  chart: boolean
}

export function tagStats(albums: Album[], field: 'genres' | 'styles'): TagStats {
  const { rows: raw, without } = tally(albums, (a) => a[field] ?? [])
  const rows = raw.map((r) => ({ ...r, label: tagLabel(r.raw ?? r.label) }))
  rows.sort((x, y) => y.count - x.count || byName(x.label, y.label))
  const chart = hasChart(rows)
  const genres = field === 'genres'
  let lead: string
  if (rows.length === 0) lead = genres ? 'Tus discos todavía no traen géneros. Conecta Discogs en Ajustes y aquí te digo de qué eres.' : 'Tus discos todavía no traen estilos.'
  else {
    const c = rows[0].count
    const tied = rows.filter((r) => r.count === c)
    if (c === 1) lead = `Tus discos traen ${listNames(rows.map((r) => (genres ? r.label : sentence(r.label))))}.`
    else if (genres) {
      if (tied.length === 1) lead = `Eres de ${casual(rows[0].label)}: ${c} de tus ${albums.length} discos lo traen.`
      else lead = `${tieNames(tied.map((r) => r.label))} empatan: ${c} discos cada uno.`
    } else if (tied.length === 1) lead = `${sentence(rows[0].label)} manda: ${c} discos.`
    else lead = `${tieNames(tied.map((r) => sentence(r.label)))} empatan: ${c} cada uno.`
  }
  return { rows, without, lead, chart }
}

/* ---------- A4 · Tus estrellas ---------- */

export interface StarCol {
  /** 1…10 (medias estrellas). */
  rating: number
  /** Solo en las enteras: "1" … "5". */
  tick: string
  count: number
  /** "4½ estrellas". */
  label: string
}

export interface StarStats {
  rated: number
  total: number
  /** Promedio en estrellas con un decimal (0 si nadie). */
  avg: number
  lead: string
  chart: boolean
  hist: StarCol[]
  /** Hasta tres, por calificación y luego las más recientes. */
  best: Album[]
  /** Cuántos más comparten la nota máxima y no caben en `best`. */
  moreBest: number
  maxLabel: string
}

/** "½ estrella", "1 estrella", "4½ estrellas", "5 estrellas". */
export function starsLabel(rating: number): string {
  if (rating === 1) return '½ estrella'
  if (rating === 2) return '1 estrella'
  const whole = Math.floor(rating / 2)
  return rating % 2 === 1 ? `${whole}½ estrellas` : `${whole} estrellas`
}

export function starStats(albums: Album[]): StarStats {
  const rated = albums.filter((a): a is Album & { rating: number } => typeof a.rating === 'number' && a.rating >= 1 && a.rating <= 10)
  const hist: StarCol[] = []
  for (let r = 1; r <= 10; r++) hist.push({ rating: r, tick: r % 2 === 0 ? String(r / 2) : '', count: 0, label: starsLabel(r) })
  for (const a of rated) hist[Math.round(a.rating) - 1].count++
  const avg = rated.length ? Math.round((rated.reduce((s, a) => s + toStars(a.rating), 0) / rated.length) * 10) / 10 : 0
  const sorted = [...rated].sort((a, b) => b.rating - a.rating || (b.ratedAt ?? '').localeCompare(a.ratedAt ?? ''))
  const best = sorted.slice(0, 3)
  const max = sorted[0]?.rating ?? 0
  const moreBest = sorted.filter((a) => a.rating === max).length - best.filter((a) => a.rating === max).length
  let lead: string
  if (rated.length === 0) lead = 'Todavía no calificas ninguno. Abre un disco y desliza las estrellas.'
  else if (rated.length < 3) lead = `Has calificado ${discos(rated.length)}. Califica unos más y aquí te digo cómo repartes tus estrellas.`
  else {
    const p = avg.toFixed(1)
    if (avg >= 4.5) lead = `Promedio ${p}: te encanta casi todo.`
    else if (avg >= 4) lead = `Promedio ${p}: generoso pero exigente.`
    else if (avg >= 3.5) lead = `Promedio ${p}: ni muy muy ni tan tan.`
    else lead = `Promedio ${p}: eres duro calificando.`
  }
  return { rated: rated.length, total: albums.length, avg, lead, chart: rated.length >= 3 && hasChart(hist), hist, best, moreBest, maxLabel: max ? starsLabel(max) : '' }
}

/* ---------- A5 · Sellos ---------- */

export interface LabelStats {
  rows: Bucket[]
  without: number
  lead: string
  chart: boolean
}

export function labelStats(albums: Album[]): LabelStats {
  const { rows, without } = tally(albums, (a) => [a.label])
  const chart = hasChart(rows)
  let lead: string
  if (rows.length === 0) lead = 'Tus discos no traen sello. Se llena desde Discogs o en la ficha.'
  else {
    const c = rows[0].count
    const tied = rows.filter((r) => r.count === c)
    if (c === 1) lead = rows.length === 1 ? `Un sello por ahora: ${rows[0].label}.` : `Un disco de cada sello: ${rows.length} sellos.`
    else if (tied.length === 1) lead = `${rows[0].label} es tu casa: ${c} discos.`
    else if (tied.length === 2) lead = `${rows[0].label} y ${rows[1].label} empatan: ${c} cada uno.`
    else lead = `${tieNames(tied.map((r) => r.label))} empatan con ${c}.`
  }
  return { rows, without, lead, chart }
}

/* ---------- B1 · Cómo ha crecido ---------- */

export interface MonthCol {
  /** "2026-08". */
  key: string
  /** "ago". */
  tick: string
  /** "agosto de 2026". */
  label: string
  count: number
}

export interface GrowthStats {
  /** Los últimos doce meses, el actual incluido. */
  months: MonthCol[]
  lead: string
  /** "Este año llevas 85 · desde el 19 oct 2025". */
  sub: string
  chart: boolean
  /** ≥ 80 % entraron el mismo día: una importación, no una racha. */
  backup: boolean
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(d: Date): string {
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`
}

/** "agosto de 2026". */
export function monthLong(d: Date): string {
  return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
}

/** "ago", "sep" (tres letras, sin punto). */
export function monthShort(d: Date): string {
  return d.toLocaleDateString('es-MX', { month: 'short' }).replace(/\./g, '').slice(0, 3)
}

export function growthStats(albums: Album[], now = new Date()): GrowthStats {
  const dates = albums.map((a) => new Date(a.addedAt)).filter((d) => !Number.isNaN(d.getTime()))
  const months: MonthCol[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: monthKey(d), tick: monthShort(d), label: monthLong(d), count: 0 })
  }
  if (dates.length === 0) return { months, lead: 'Tus discos no traen fecha de alta.', sub: '', chart: false, backup: false }

  const byMonth = new Map<string, { count: number; date: Date }>()
  const byDay = new Map<string, number>()
  let yearCount = 0
  let first = dates[0]
  for (const d of dates) {
    const mk = monthKey(d)
    const e = byMonth.get(mk)
    if (e) e.count++
    else byMonth.set(mk, { count: 1, date: d })
    byDay.set(dayKey(d), (byDay.get(dayKey(d)) ?? 0) + 1)
    if (d.getFullYear() === now.getFullYear()) yearCount++
    if (d < first) first = d
  }
  for (const m of months) m.count = byMonth.get(m.key)?.count ?? 0

  const topDay = [...byDay.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]
  const backup = dates.length >= 10 && topDay[1] / dates.length >= 0.8
  const topMonth = [...byMonth.entries()].sort((a, b) => b[1].count - a[1].count || b[0].localeCompare(a[0]))[0]
  // La gráfica solo enseña los últimos doce meses: si el mes más intenso quedó antes, el lead lo dice.
  const inWindow = months.some((m) => m.key === topMonth[0])
  let lead: string
  if (backup) {
    const when = purchaseDateLabel(topDay[0], now)
    lead = `${topDay[1]} discos entraron de golpe ${when === 'Hoy' ? 'hoy' : `el ${when}`}: un respaldo.`
  } else if (byMonth.size === 1) lead = `Todo lo agregaste en ${monthLong(topMonth[1].date)}.`
  else lead = `Tu mes más intenso: ${monthLong(topMonth[1].date)}, con ${discos(topMonth[1].count)}${inWindow ? '' : ' (antes de estos doce meses)'}.`
  const since = purchaseDateLabel(first.toISOString(), now)
  const sub = `Este año llevas ${yearCount} · ${since === 'Hoy' ? 'desde hoy' : `desde el ${since}`}`
  return { months, lead, sub, chart: hasChart(months), backup }
}

/* ---------- B2 · Tus copias ---------- */

/** Un bloque de la barra alta; `step` 5 = M … 1 = G+ o menos, 0 = sin dato. */
export interface CondBlock {
  key: string
  label: string
  count: number
  step: 0 | 1 | 2 | 3 | 4 | 5
}

export interface CondStats {
  blocks: CondBlock[]
  withData: number
  lead: string
  /** Al menos 5 con estado: se dibuja la barra. */
  enough: boolean
}

export interface CopyStats {
  /** "69 LP · 21 dobles · 2 sencillos de 7\" · 1 Box Set". */
  formatLine: string
  /** "EU 39 · US 36 · México 12 · y 2 más"; undefined sin países. */
  countryLine?: string
  media: CondStats
  sleeve: CondStats
  anySleeve: boolean
}

/** [singular, plural]: "1 doble", "21 dobles". */
const FORMAT_ES: Record<string, [string, string]> = { lp: ['LP', 'LP'], '2xlp': ['doble', 'dobles'], '7"': ['sencillo de 7"', 'sencillos de 7"'] }
const COUNTRY_ES: Record<string, string> = { mexico: 'México', germany: 'Alemania', spain: 'España', japan: 'Japón', brazil: 'Brasil', italy: 'Italia', france: 'Francia', netherlands: 'Países Bajos' }
const COND_STEP: Record<Condition, 1 | 2 | 3 | 4 | 5> = { M: 5, NM: 4, 'VG+': 3, VG: 2, 'G+': 1, G: 1, F: 1, P: 1 }
const COND_LABEL: Record<number, string> = { 5: 'M', 4: 'NM', 3: 'VG+', 2: 'VG', 1: 'G+ o menos', 0: 'sin dato' }

export function conditionStats(albums: Album[], field: 'mediaCondition' | 'sleeveCondition'): CondStats {
  const counts = [0, 0, 0, 0, 0, 0]
  for (const a of albums) {
    const c = a[field]
    counts[c && COND_STEP[c] ? COND_STEP[c] : 0]++
  }
  const blocks: CondBlock[] = ([5, 4, 3, 2, 1, 0] as const).map((step) => ({ key: COND_LABEL[step], label: COND_LABEL[step], count: counts[step], step }))
  const withData = albums.length - counts[0]
  const enough = withData >= 5
  let lead: string
  if (!enough) lead = 'Anota el estado de tus discos en la ficha y aquí te sale cómo están.'
  else {
    const known = blocks.filter((b) => b.step > 0)
    const c = Math.max(...known.map((b) => b.count))
    const tied = known.filter((b) => b.count === c)
    if (tied.length === 1) lead = `${tied[0].label} es lo más común: ${c} de ${withData} con estado.`
    else lead = `${tieNames(tied.map((b) => b.label))} empatan: ${c} cada uno de ${withData} con estado.`
  }
  return { blocks, withData, lead, enough }
}

export function copyStats(albums: Album[]): CopyStats {
  const fmt = tally(albums, (a) => [a.format])
  const parts = fmt.rows.map((r) => { const es = FORMAT_ES[r.key]; return `${r.count} ${es ? es[r.count === 1 ? 0 : 1] : r.label}` })
  if (fmt.without > 0) parts.push(`${fmt.without} sin formato`)
  const countries = tally(albums, (a) => [a.country])
  const cParts = countries.rows.slice(0, 3).map((r) => `${COUNTRY_ES[r.key] ?? r.label} ${r.count}`)
  if (countries.rows.length > 3) cParts.push(`y ${countries.rows.length - 3} más`)
  return {
    formatLine: parts.join(' · '),
    countryLine: cParts.length ? cParts.join(' · ') : undefined,
    media: conditionStats(albums, 'mediaCondition'),
    sleeve: conditionStats(albums, 'sleeveCondition'),
    anySleeve: albums.some((a) => a.sleeveCondition),
  }
}

/* ---------- B3 · Lo que llevas invertido ---------- */

export interface MoneyStats {
  priced: number
  total: number
  lead: string
  /** El más caro (empate: el agregado más recientemente). */
  top?: Album
  places: Bucket[]
  placesChart: boolean
  withoutPrice: number
}

export function moneyStats(albums: Album[]): MoneyStats {
  const priced = albums.filter((a): a is Album & { purchasePrice: number } => typeof a.purchasePrice === 'number' && Number.isFinite(a.purchasePrice))
  const total = priced.reduce((s, a) => s + a.purchasePrice, 0)
  const withoutPrice = albums.length - priced.length
  let lead: string
  if (priced.length === 0) lead = 'Ponle precio a tus discos y te digo cuánto llevas.'
  else if (priced.length === 1) lead = `Llevas ${priceLabel(total)} en 1 disco.`
  else lead = `Llevas ${priceLabel(total)} en ${priced.length} discos: ${priceLabel(Math.round(total / priced.length))} cada uno.`
  const top = [...priced].sort((a, b) => b.purchasePrice - a.purchasePrice || b.addedAt.localeCompare(a.addedAt))[0]
  const { rows: places } = tally(albums, (a) => [a.purchasePlace])
  return { priced: priced.length, total, lead, top, places, placesChart: hasChart(places), withoutPrice }
}

/* ---------- B4 · En familia ---------- */

export interface Rater {
  uid: string
  name: string
  count: number
  avg: number
}

export interface FamilyStats {
  rows: Bucket[]
  without: number
  lead: string
  chart: boolean
  raters: Rater[]
}

export function familyStats(albums: Album[], nameOf: (uid: string) => string): FamilyStats {
  const map = new Map<string, number>()
  let without = 0
  for (const a of albums) {
    if (a.addedBy) map.set(a.addedBy, (map.get(a.addedBy) ?? 0) + 1)
    else without++
  }
  const rows: Bucket[] = [...map.entries()].map(([uid, count]) => ({ key: uid, label: nameOf(uid), count }))
  rows.sort((x, y) => y.count - x.count || byName(x.label, y.label))
  let lead = ''
  if (rows.length === 1) lead = `${rows[0].label} ha agregado ${rows[0].count}.`
  else if (rows.length >= 2) lead = `${rows[0].label} ha agregado ${rows[0].count}; ${rows[1].label}, ${rows[1].count}.`
  const sums = new Map<string, { count: number; sum: number }>()
  for (const a of albums) {
    for (const [uid, r] of Object.entries(a.ratings ?? {})) {
      if (!(r.rating >= 1 && r.rating <= 10)) continue
      const e = sums.get(uid) ?? { count: 0, sum: 0 }
      e.count++
      e.sum += toStars(r.rating)
      sums.set(uid, e)
    }
  }
  const raters: Rater[] = [...sums.entries()].map(([uid, e]) => ({ uid, name: nameOf(uid), count: e.count, avg: Math.round((e.sum / e.count) * 10) / 10 }))
  raters.sort((x, y) => y.count - x.count || byName(x.name, y.name))
  return { rows, without, lead, chart: hasChart(rows), raters }
}

/* ---------- Dona (modo pastel) ---------- */

/** Una rebanada de la dona; ángulos en grados desde arriba, en el sentido del reloj. */
export interface Slice {
  key: string
  label: string
  count: number
  /** Entero sobre la suma de las rebanadas; entre todas cierran en 100. */
  pct: number
  start: number
  end: number
  /** Solo en "Otros": cuántas categorías pliega. */
  rest?: number
}

/** Llave de la rebanada "Otros" (ninguna categoría normalizada la produce). */
export const OTHER_KEY = '__otros__'

/** Lo que pliega la rebanada "Otros" en el readout: «otro sello» con una sola categoría, «otros 3 sellos» con más. */
export function otrosLabel(rest: number, singular: string, plural: string): string {
  return rest === 1 ? `otro ${singular}` : `otros ${rest} ${plural}`
}

/**
 * Las rebanadas de una dona: las `top` categorías mayores en el orden en que vienen (ya
 * ordenadas) y, si sobra algo, una "Otros" con la suma del resto. Lo que va en 0 no entra.
 * Los porcentajes son enteros sobre la suma de las rebanadas y cierran en 100: el ajuste
 * del redondeo va de a un punto por rebanada, primero a la mayor que no esté empatada (dos
 * rebanadas con el mismo conteo muestran el mismo % mientras se pueda) y luego a las demás de
 * mayor a menor; así ninguna se aleja más de un punto de su redondeo natural.
 */
export function donutSlices(rows: { key: string; label: string; count: number }[], { top = 5, otherLabel = 'Otros' }: { top?: number; otherLabel?: string } = {}): Slice[] {
  const withData = rows.filter((r) => r.count > 0)
  const parts: Omit<Slice, 'pct' | 'start' | 'end'>[] = withData.slice(0, top).map((r) => ({ key: r.key, label: r.label, count: r.count }))
  const tail = withData.slice(top)
  const restCount = tail.reduce((a, r) => a + r.count, 0)
  if (restCount > 0) parts.push({ key: OTHER_KEY, label: otherLabel, count: restCount, rest: tail.length })
  const sum = parts.reduce((a, p) => a + p.count, 0)
  if (sum === 0) return []
  const pcts = parts.map((p) => Math.round((p.count / sum) * 100))
  let diff = 100 - pcts.reduce((a, b) => a + b, 0)
  if (diff !== 0) {
    const order = parts.map((_, i) => i).sort((a, b) => parts[b].count - parts[a].count || a - b)
    const unique = order.find((i) => parts.every((p, j) => j === i || p.count !== parts[i].count))
    const queue = unique === undefined ? order : [unique, ...order.filter((i) => i !== unique)]
    const step = Math.sign(diff)
    for (const i of queue) {
      if (diff === 0) break
      pcts[i] += step
      diff -= step
    }
  }
  let acc = 0
  return parts.map((p, i) => {
    const start = (acc / sum) * 360
    acc += p.count
    const end = i === parts.length - 1 ? 360 : (acc / sum) * 360
    return { ...p, pct: pcts[i], start, end }
  })
}
