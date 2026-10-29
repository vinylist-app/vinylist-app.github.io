import type { ReleaseGroupInfo } from '../../api/musicbrainz'
import { albumKey, normalize } from '../text'
import type { Album } from '../../types'
import type { DiscRef } from './types'

/**
 * Funciones puras del motor de contexto: números, ordinales, listas de títulos,
 * discografía de estudio y recortes de texto. Sin red ni base de datos, para probarlas fácil.
 */

/** "1.º", "12.º" (ordinal corto en español). */
export function ordinal(n: number): string {
  return `${n}.º`
}

/** 52345 → "52,345" (es-MX). */
export function formatCount(n: number): string {
  return n.toLocaleString('es-MX')
}

const WORDS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']

/** Números chicos en letra ("dos"); de once en adelante, en cifra. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n)
}

/** "setenta" para 1970; "años 2000" para 2000; "años 2010" para 2010. */
export function decadeWords(decade: number): string {
  const names: Record<number, string> = { 1920: 'veinte', 1930: 'treinta', 1940: 'cuarenta', 1950: 'cincuenta', 1960: 'sesenta', 1970: 'setenta', 1980: 'ochenta', 1990: 'noventa' }
  return names[decade] ?? `años ${decade}`
}

/** "A", "A y B", "A, B y C", "A, B, C y 2 más". */
export function listTitles(titles: string[], max = 3): string {
  if (titles.length === 0) return ''
  if (titles.length === 1) return titles[0]
  if (titles.length <= max) return `${titles.slice(0, -1).join(', ')} y ${titles[titles.length - 1]}`
  const rest = titles.length - max
  return `${titles.slice(0, max).join(', ')} y ${rest} más`
}

/** Mes en que se pidió algo: "marzo", o "marzo de 2025" si no es de este año. */
export function monthLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const month = d.toLocaleDateString('es-MX', { month: 'long' })
  return d.getFullYear() === now.getFullYear() ? month : `${month} de ${d.getFullYear()}`
}

/** Suma de duraciones "mm:ss" en minutos redondeados; undefined si ninguna canción trae duración. */
export function totalMinutes(tracks: { duration?: string }[]): number | undefined {
  let seconds = 0
  let any = false
  for (const t of tracks) {
    const m = t.duration?.match(/^(\d+):(\d{1,2})$/)
    if (!m) continue
    any = true
    seconds += Number(m[1]) * 60 + Number(m[2])
  }
  if (!any) return undefined
  return Math.round(seconds / 60)
}

/** Corta un texto largo en el fin de oración más cercano antes de `max` caracteres. */
export function trimExtract(text: string, max = 320): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const head = clean.slice(0, max)
  // Último fin de oración (". ", "? ", "! ") dentro del límite; se exige al menos un tercio del texto.
  let cut = -1
  const re = /[.!?»”]\s/g
  let m: RegExpExecArray | null
  while ((m = re.exec(head))) cut = m.index + 1
  if (cut >= max / 3) return head.slice(0, cut).trim()
  const space = head.lastIndexOf(' ')
  return `${head.slice(0, space > 0 ? space : max).trim()}…`
}

/** El Q de Wikidata desde una dirección: "https://www.wikidata.org/wiki/Q169541" → "Q169541". */
export function wikidataQid(url: string): string | undefined {
  const m = url.match(/wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i)
  return m ? m[1].toUpperCase() : undefined
}

/** Años entre la salida del disco y la muerte del artista; negativo = póstumo. */
export function yearsBeforeDeath(albumYear: number, deathYear: number): number {
  return deathYear - albumYear
}

/** Línea sobre un artista (persona) que ya murió: antes o después de su muerte. */
export function lifeLine(albumYear: number | undefined, deathYear: number): string | undefined {
  if (!albumYear) return undefined
  const n = yearsBeforeDeath(albumYear, deathYear)
  if (n === 0) return `Lo publicó el año en que murió (†${deathYear}).`
  if (n > 0) return `Lo publicó ${n === 1 ? 'un año' : `${n} años`} antes de morir (†${deathYear}).`
  const after = -n
  return `Póstumo: salió ${after === 1 ? 'un año' : `${after} años`} después de su muerte (†${deathYear}).`
}

// ---------- Discografía ----------

export interface StudioAlbum {
  id: string
  title: string
  year?: number
}

/** Discos de estudio: los grupos de lanzamiento sin tipo secundario (ni recopilación, ni en vivo, ni remix, ni soundtrack…), por año. */
export function studioAlbums(groups: Pick<ReleaseGroupInfo, 'id' | 'title' | 'year' | 'secondaryTypes'>[]): StudioAlbum[] {
  return groups
    .filter((g) => g.secondaryTypes.length === 0)
    .map((g) => ({ id: g.id, title: g.title, year: g.year }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title))
}

function sameTitle(a: string, b: string): boolean {
  return albumKey('x', a) === albumKey('x', b)
}

/** Posición del disco en la discografía (por id de grupo o por título). -1 si no está. */
export function indexInDiscography(disc: Pick<DiscRef, 'title' | 'musicbrainzReleaseGroupId'>, studio: StudioAlbum[]): number {
  if (disc.musicbrainzReleaseGroupId) {
    const i = studio.findIndex((s) => s.id === disc.musicbrainzReleaseGroupId)
    if (i !== -1) return i
  }
  return studio.findIndex((s) => sameTitle(s.title, disc.title))
}

export interface DiscographyFacts {
  /** Cuántos discos de estudio tiene el artista. */
  total: number
  /** Posición del disco (1 = debut); undefined si no aparece en la discografía. */
  position?: number
  /** Cuántos de estudio ya tiene la persona (sin contar este). */
  owned: number
  /** Cuántos le faltarían después de agregar este. */
  missing: number
  /** Los que le faltarían, por año. */
  missingTitles: StudioAlbum[]
  /** ¿Es el último de estudio (por año)? */
  isLast: boolean
  /** Dos discos cercanos en el tiempo para recomendar después del primero. */
  nextUp: StudioAlbum[]
}

/** Cruza la discografía de estudio con los discos del artista que ya tienen. */
export function discographyFacts(disc: Pick<DiscRef, 'title' | 'year' | 'musicbrainzReleaseGroupId'>, studio: StudioAlbum[], ownedOfArtist: Pick<Album, 'title' | 'musicbrainzReleaseGroupId'>[]): DiscographyFacts {
  const idx = indexInDiscography(disc, studio)
  const isOwned = (s: StudioAlbum) => ownedOfArtist.some((a) => a.musicbrainzReleaseGroupId === s.id || sameTitle(a.title, s.title))
  const missingTitles = studio.filter((s, i) => i !== idx && !isOwned(s))
  const year = disc.year ?? (idx !== -1 ? studio[idx].year : undefined)
  const nextUp = studio
    .filter((s, i) => i !== idx && !isOwned(s))
    .sort((a, b) => Math.abs((a.year ?? 0) - (year ?? 0)) - Math.abs((b.year ?? 0) - (year ?? 0)))
    .slice(0, 2)
  const lastYear = Math.max(...studio.map((s) => s.year ?? 0))
  return {
    total: studio.length,
    position: idx === -1 ? undefined : idx + 1,
    owned: studio.filter((s, i) => i !== idx && isOwned(s)).length,
    missing: missingTitles.length,
    missingTitles,
    isLast: idx !== -1 && (studio[idx].year ?? 0) === lastYear && lastYear > 0,
    nextUp,
  }
}

/** Texto principal de la discografía según lo que ya tienen. */
export function discographyLine(artist: string, f: DiscographyFacts): { title: string; detail?: string } | undefined {
  if (f.total === 0) return undefined
  const position = f.position
    ? f.position === 1
      ? 'Es su debut: su primer disco de estudio.'
      : `Es su ${ordinal(f.position)} disco de estudio.`
    : undefined
  if (f.owned > 0) {
    if (f.missing === 0) return { title: `Con este completas la discografía de estudio de ${artist}.`, detail: `Son ${f.total} discos de estudio y los tendrías todos.` }
    const names = listTitles(f.missingTitles.map((s) => s.title), 3)
    return { title: `Te ${f.missing === 1 ? 'faltaría 1' : `faltarían ${f.missing}`} de los ${f.total} discos de estudio de ${artist}.`, detail: names ? `Después de este: ${names}.` : position }
  }
  if (!position) return undefined
  return { title: position, detail: f.total > 1 ? `${artist} tiene ${f.total} discos de estudio en total.` : undefined }
}

/** Detalle para "Sería tu primer disco de X": dos discos cercanos para seguir. */
export function nextUpDetail(f: DiscographyFacts): string | undefined {
  if (!f.nextUp.length) return undefined
  const names = f.nextUp.map((s) => (s.year ? `«${s.title}» (${s.year})` : `«${s.title}»`))
  return `Después te irían bien ${listTitles(names)}.`
}

/** Normaliza una etiqueta para compararla con las de la colección. */
export function tagKey(t: string): string {
  return normalize(t)
}
