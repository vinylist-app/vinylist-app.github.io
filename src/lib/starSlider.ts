import { formatStars } from './rating'
import type { PersonRating } from '../types'

/**
 * La lógica de "calificar deslizando", sin pantalla: convierte la posición del
 * dedo en estrellas, ajusta a medias estrellas y arma los textos que se muestran.
 * Las calificaciones se guardan de 1 a 10 (medias estrellas) y se ven de 0.5 a 5.
 */

/** Lo único que necesitamos del rectángulo del riel. */
export interface Box {
  left: number
  width: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Valor continuo de 0 a 5 según dónde está el dedo. `pad` es el margen interno
 * del riel a cada lado; `starsWidth`, el ancho que ocupan las cinco estrellas.
 */
export function valueAt(clientX: number, rect: Box, pad = 0, starsWidth = rect.width - pad * 2): number {
  if (!(starsWidth > 0)) return 0
  const x = clientX - rect.left - pad
  return clamp((x / starsWidth) * 5, 0, 5)
}

/** Ajusta a la media estrella más cercana (1..10). Menos de un cuarto de estrella = sin calificar. */
export function snap(v: number): number | undefined {
  if (!(v >= 0.25)) return undefined
  return clamp(Math.round(v * 2), 1, 10)
}

/**
 * Un toque directo: la mitad izquierda de la estrella n da n − 0.5, la derecha da n.
 * En escala 1..10: izquierda = 2n − 1, derecha = 2n.
 */
export function tapValue(clientX: number, rect: Box, pad = 0, starsWidth = rect.width - pad * 2): number {
  const v = valueAt(clientX, rect, pad, starsWidth)
  const star = clamp(Math.floor(v) + 1, 1, 5)
  const inStar = v - (star - 1)
  return inStar < 0.5 ? star * 2 - 1 : star * 2
}

/** Cuánto se llena la estrella i (1..5) con el valor continuo v: de 0 (vacía) a 1 (llena). */
export function fillFor(v: number, i: number): number {
  return clamp(v - (i - 1), 0, 1)
}

/** Estrella (1..5) que queda bajo el dedo; 0 si está antes de la primera. */
export function starUnder(v: number): number {
  if (v <= 0) return 0
  return clamp(Math.ceil(v), 1, 5)
}

/**
 * Cuántas estrellas se pintan: el valor continuo mientras el dedo está encima
 * (`live`), o la calificación guardada si no. Por debajo de un cuarto de estrella
 * `snap` da "sin calificar", así que las cinco se ven vacías: la persona ve que va
 * a borrar antes de soltar.
 */
export function shownStarsFor(live: number | null, value?: number): number {
  if (live === null) return (value ?? 0) / 2
  return snap(live) === undefined ? 0 : live
}

/** Estrella que se agranda bajo el dedo durante el arrastre; 0 en la franja de "sin calificar". */
export function hotStarFor(live: number | null): number {
  if (live === null || snap(live) === undefined) return 0
  return starUnder(live)
}

/** "Sin calificar" o "3.5 / 5". */
export function labelFor(rating?: number): string {
  if (!rating) return 'Sin calificar'
  return `${formatStars(rating)} / 5`
}

/** Cómo se dice en voz alta: "media estrella", "1 estrella", "1 y media estrellas", "2 estrellas"… */
export function ariaTextFor(rating?: number): string {
  if (!rating) return 'Sin calificar'
  const r = clamp(Math.round(rating), 1, 10)
  if (r === 1) return 'media estrella'
  if (r === 2) return '1 estrella'
  const whole = Math.floor(r / 2)
  return r % 2 === 1 ? `${whole} y media estrellas` : `${whole} estrellas`
}

/** Texto del botón de guardar: "Guardar 4.5 estrellas", "Guardar 1 estrella", "Guardar media estrella". */
export function saveLabelFor(rating?: number): string {
  if (!rating) return 'Guardar'
  const r = clamp(Math.round(rating), 1, 10)
  if (r === 1) return 'Guardar media estrella'
  if (r === 2) return 'Guardar 1 estrella'
  return `Guardar ${formatStars(r)} estrellas`
}

/**
 * Qué dice y si se puede tocar el botón principal de la hoja, según el valor
 * provisional (`draft`) y el guardado (`saved`). Quitar solo si había calificación.
 */
export function saveButton(draft: number | undefined, saved: number | undefined): { label: string; disabled: boolean } {
  if (draft === saved) return { label: saveLabelFor(saved), disabled: true }
  if (draft === undefined) return { label: 'Quitar calificación', disabled: false }
  return { label: saveLabelFor(draft), disabled: false }
}

/** Siguiente valor con el teclado: media estrella arriba o abajo. Bajar de media estrella la quita. */
export function stepRating(rating: number | undefined, dir: 1 | -1): number | undefined {
  if (!rating) return dir > 0 ? 1 : undefined
  const next = Math.round(rating) + dir
  if (next < 1) return undefined
  return clamp(next, 1, 10)
}

/** Promedio de la familia en estrellas (1 decimal) y cuántas personas calificaron. */
export function averageOf(ratings?: Record<string, PersonRating>): { avg: number; count: number } {
  const values = Object.values(ratings ?? {}).map((r) => r.rating).filter((r) => r >= 1 && r <= 10)
  if (values.length === 0) return { avg: 0, count: 0 }
  const sum = values.reduce((a, b) => a + b, 0)
  const avg = Math.round((sum / values.length / 2) * 10) / 10
  return { avg, count: values.length }
}

/** "4.2" o "4" para mostrar el promedio sin ceros de más. */
export function formatAverage(avg: number): string {
  return Number.isInteger(avg) ? `${avg}` : avg.toFixed(1)
}
