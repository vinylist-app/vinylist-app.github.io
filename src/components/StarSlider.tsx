import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { StarPath } from './Icons'
import { ariaTextFor, fillFor, snap, starUnder, stepRating, tapValue, valueAt } from '../lib/starSlider'
import '../styles/calificar.css'

interface Props {
  /** Calificación guardada o provisional, de 1 a 10. */
  value?: number
  /** Se llama UNA vez al soltar el dedo (o con el teclado) y solo si cambió. */
  onChange: (rating: number | undefined) => void
  /** Aviso mientras se arrastra, ya redondeado a media estrella; al soltar vuelve al valor real. */
  onPreview?: (rating: number | undefined) => void
  /** Píxeles por estrella. */
  size?: number
  /** Muestra "1 2 3 4 5" debajo, alineado con cada estrella. */
  showScale?: boolean
}

/** El riel tiene 8 px de margen a cada lado para que el dedo alcance los bordes sin esfuerzo. */
const PAD = 8
const STARS = [1, 2, 3, 4, 5]

/**
 * Cinco estrellas que se llenan al deslizar el dedo de izquierda a derecha.
 * Al soltar, se ajusta a la media estrella más cercana; un toque directo elige
 * la mitad izquierda (media estrella) o la derecha (entera). Tocar el mismo valor
 * no lo borra: para quitar la calificación se arrastra a la izquierda del todo.
 */
export function StarSlider({ value, onChange, onPreview, size = 48, showScale = false }: Props) {
  const rectRef = useRef<DOMRect | null>(null)
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null)
  const lastHalf = useRef<number | undefined>(undefined)
  /** Valor continuo (0..5) mientras el dedo está encima; null cuando no. */
  const [live, setLive] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const starsWidth = size * 5
  const shownStars = live !== null ? live : (value ?? 0) / 2
  const hot = dragging && live !== null ? starUnder(live) : 0
  const previewRating = live !== null ? snap(live) : value

  function valueFrom(e: PointerEvent<HTMLDivElement>): number {
    const rect = rectRef.current ?? e.currentTarget.getBoundingClientRect()
    return valueAt(e.clientX, rect, PAD, starsWidth)
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return
    rectRef.current = e.currentTarget.getBoundingClientRect()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* algún navegador viejo */ }
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
    const v = valueFrom(e)
    lastHalf.current = snap(v)
    setDragging(true)
    setLive(v)
    onPreview?.(snap(v))
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (start.current) {
      if (e.pointerId !== start.current.id) return
      const v = valueFrom(e)
      setLive(v)
      const half = snap(v)
      if (half !== lastHalf.current) {
        lastHalf.current = half
        navigator.vibrate?.(8)
        onPreview?.(half)
      }
    } else if (e.pointerType === 'mouse') {
      // Con ratón: se ve lo que se elegiría al hacer clic, sin guardar nada.
      setLive(valueFrom(e))
    }
  }

  function finish() {
    start.current = null
    rectRef.current = null
    setDragging(false)
    setLive(null)
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const s = start.current
    if (!s || e.pointerId !== s.id) return
    const quick = performance.now() - s.t < 300 && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6
    const rect = rectRef.current ?? e.currentTarget.getBoundingClientRect()
    const next = quick ? tapValue(e.clientX, rect, PAD, starsWidth) : snap(valueAt(e.clientX, rect, PAD, starsWidth))
    finish()
    if (next !== value) {
      navigator.vibrate?.(15)
      onChange(next)
    }
    onPreview?.(next)
  }

  /** El sistema tomó el gesto (p. ej. para desplazar la página): se regresa al valor guardado. */
  function onCancel() {
    if (!start.current) return
    finish()
    onPreview?.(value)
  }

  function onPointerLeave() {
    if (!start.current) setLive(null)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    let next: number | undefined = value
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': next = stepRating(value, 1); break
      case 'ArrowLeft': case 'ArrowDown': next = stepRating(value, -1); break
      case 'Home': next = 1; break
      case 'End': next = 10; break
      case 'Backspace': case 'Delete': next = undefined; break
      default: return
    }
    e.preventDefault()
    if (next !== value) onChange(next)
  }

  const style = { '--cal-size': `${size}px` } as CSSProperties

  return (
    <div
      className={`cal-slider ${dragging ? 'cal-slider--live' : ''}`}
      style={style}
      role="slider"
      tabIndex={0}
      aria-label="Tu calificación"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={previewRating ? previewRating / 2 : 0}
      aria-valuetext={ariaTextFor(previewRating)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onCancel}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      <div className="cal-slider__stars">
        {STARS.map((i) => {
          const fill = fillFor(shownStars, i)
          return (
            <span className={`cal-star ${hot === i ? 'cal-star--hot' : ''}`} key={i} style={{ width: size, height: size }}>
              <svg viewBox="-1.5 -1.5 27 27" fill="none" stroke="var(--star-empty)" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true"><StarPath /></svg>
              <span className="cal-star__fill" style={{ width: `${fill * 100}%` }}>
                <svg viewBox="-1.5 -1.5 27 27" fill="var(--star)" stroke="var(--star-empty)" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true"><StarPath /></svg>
              </span>
            </span>
          )
        })}
      </div>
      {showScale && (
        <div className="cal-slider__scale" aria-hidden="true">
          {STARS.map((i) => <span key={i} style={{ width: size }}>{i}</span>)}
        </div>
      )}
    </div>
  )
}
