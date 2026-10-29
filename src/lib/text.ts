/** Quita acentos y mayúsculas para comparar o buscar. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Discogs agrega "(2)" a artistas con nombre repetido. */
export function cleanArtist(name: string): string {
  return name.replace(/\s\(\d+\)$/, '').trim()
}

/** Llave estable para saber si dos álbumes son "el mismo" (sin edición). */
export function albumKey(artist: string, title: string): string {
  return `${normalize(cleanArtist(artist))}|${normalize(title).replace(/\s*[([].*?[)\]]\s*$/, '')}`
}

export function artistKey(artist: string): string {
  return normalize(cleanArtist(artist))
}

export function isVariousArtists(artist: string): boolean {
  return /^(various( artists)?|varios( artistas| int[eé]rpretes)?|va|v\/a|unknown artist)$/i.test(cleanArtist(artist).trim())
}

/** Géneros de Discogs (en inglés) con nombre en español. */
const TAG_ES: Record<string, string> = {
  electronic: 'Electrónica',
  classical: 'Clásica',
  latin: 'Música latina',
  'funk / soul': 'Funk y soul',
  'folk, world, & country': 'Folk y música del mundo',
  'stage & screen': 'Cine y teatro',
  "children's": 'Infantil',
  'non-music': 'No musical',
  'brass & military': 'Bandas',
  'hip hop': 'Hip hop',
  'hip-hop': 'Hip hop',
}

/** Nombre para mostrar de un género o estilo (MusicBrainz los manda en minúsculas). */
export function tagLabel(raw: string): string {
  const es = TAG_ES[normalize(raw)]
  if (es) return es
  return raw === raw.toLowerCase() ? raw.replace(/(^|[\s/-])\p{L}/gu, (m) => m.toUpperCase()) : raw
}

/** "años 70", "años 2010". */
export function decadeLabel(decade: number): string {
  return `años ${decade >= 2000 ? decade : String(decade).slice(2)}`
}

/** Recopilaciones y discos en vivo valen menos como sugerencia de "siguiente disco". */
export function looksLikeCompilation(title: string): boolean {
  return /(greatest hits|best of|very best|anthology|collection|grandes [eé]xitos|lo mejor de|live at|en vivo|in concert|box set)/i.test(title)
}

/** "2026-07-12" en la zona horaria del celular. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * "Hoy" si es la fecha de hoy; si no, "12 jul 2026". Regresa el texto tal cual si no se puede leer.
 * Acepta una fecha sola ("2026-07-12", como la de compra) o una marca de tiempo ISO en UTC
 * ("2026-07-13T02:00:00Z", como `addedAt`), que se pasa a la hora local antes de comparar.
 */
export function purchaseDateLabel(iso: string, now = new Date()): string {
  const d = iso.length > 10 ? new Date(iso) : new Date(`${iso}T00:00`)
  if (Number.isNaN(d.getTime())) return iso
  if (localDay(d) === localDay(now)) return 'Hoy'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "$650", "$1,250", "$649.50" (pesos). */
export function priceLabel(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
}
