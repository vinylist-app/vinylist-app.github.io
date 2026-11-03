import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { discos } from '../lib/stats'

/**
 * Las figuras de "En números": barras horizontales, columnas, la barra alta
 * segmentada, el meter y el readout. Todo en HTML y SVG a mano, una tinta
 * (--viz-bar) y texto siempre en tokens de texto. Lo tocado se queda en
 * --viz-bar y sus hermanas bajan a --viz-dim; el readout lo arma la pantalla.
 */

/** Ancho real del contenedor, para dibujar cada SVG al tamaño exacto. */
export function useWidth<T extends HTMLElement>(fallback = 320): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => { const cw = el.clientWidth; if (cw > 0) setW(cw) }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** Rectángulo con las dos esquinas de arriba redondeadas y la base cuadrada. */
function capPath(x: number, y: number, w: number, h: number, r0 = 4): string {
  const r = Math.min(r0, h / 2, w / 2)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/* ---------- Barras horizontales ---------- */

export interface BarRow {
  key: string
  label: string
  count: number
}

export function HBars({ rows, selected, onSelect }: { rows: BarRow[]; selected: string | null; onSelect: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="nu-bars">
      {rows.map((r, i) => {
        const on = selected === r.key
        const dim = selected !== null && !on
        const style = { '--r': r.count / max, '--d': `${Math.min(i * 30, 240)}ms` } as CSSProperties
        return (
          <button key={r.key} type="button" className={`nu-bar ${dim ? 'nu-bar--dim' : ''}`} style={style} aria-label={`${r.label}, ${discos(r.count)}`} aria-pressed={on} onClick={() => onSelect(r.key)}>
            <span className="nu-bar__name">{r.label}</span>
            <span className="nu-bar__rail"><i className="nu-bar__fill" /><span className="nu-bar__val">{r.count}</span></span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Columnas ---------- */

export interface ColDatum {
  key: string
  /** Lo que va bajo la línea base ("20", "ago", "1"); vacío = sin tick. */
  tick: string
  count: number
  /** Nombre completo para el lector de pantalla y el readout. */
  name: string
}

const COL_H = 160
const COL_TOP = 18
const COL_PLOT = 120
const COL_BASE = COL_TOP + COL_PLOT

export function Columns({ cols, selected, onSelect, label }: { cols: ColDatum[]; selected: string | null; onSelect: (key: string) => void; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const n = Math.max(1, cols.length)
  const slot = width / n
  const max = Math.max(1, ...cols.map((c) => c.count))
  const colW = Math.min(20, Math.max(8, Math.floor(slot - 4)))
  return (
    <div ref={ref} className="nu-cols">
      <svg width={width} height={COL_H} viewBox={`0 0 ${width} ${COL_H}`} aria-hidden="true">
        <line className="nu-base" x1={0} x2={width} y1={COL_BASE + 0.5} y2={COL_BASE + 0.5} />
        {cols.map((c, i) => {
          const cx = slot * i + slot / 2
          const h = c.count === 0 ? 0 : Math.max(2, Math.round((c.count / max) * COL_PLOT))
          const y = COL_BASE - h
          const dim = selected !== null && selected !== c.key
          return (
            <g key={c.key}>
              {h > 0 && <path className={`nu-col__mark ${dim ? 'nu-col__mark--dim' : ''}`} d={capPath(cx - colW / 2, y, colW, h)} style={{ '--d': `${i * 20}ms` } as CSSProperties} />}
              {h > 0 && <text className="nu-col__cap" x={cx} y={y - 5} textAnchor="middle">{c.count}</text>}
              {c.tick && <text className="nu-col__tick" x={cx} y={COL_BASE + 17} textAnchor="middle">{c.tick}</text>}
            </g>
          )
        })}
      </svg>
      {/* La ranura completa es el blanco táctil: botones de verdad encima del dibujo (foco y tap nativos). */}
      <div className="nu-cols__hits" role="group" aria-label={label}>
        {cols.map((c) => (
          <button key={c.key} type="button" className="nu-col__hit" aria-label={`${c.name}, ${discos(c.count)}`} aria-pressed={selected === c.key} onClick={() => onSelect(c.key)} />
        ))}
      </div>
    </div>
  )
}

/* ---------- Barra alta segmentada (condición) ---------- */

export interface SegDatum {
  key: string
  label: string
  count: number
  /** 5 = M … 1 = G+ o menos, 0 = sin dato. */
  step: number
  /** Cifra dentro del bloque ("31%"); vacío = nunca lleva texto. */
  text: string
}

const SEG_H = 28
const SEG_GAP = 2

export function segFill(step: number): string {
  return step > 0 ? `var(--viz-${step})` : 'var(--viz-nd)'
}

export function SegBar({ segs, selected, onSelect, label, describe }: { segs: SegDatum[]; selected: string | null; onSelect: (key: string) => void; label: string; describe: (s: SegDatum) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const visible = segs.filter((s) => s.count > 0)
  const total = visible.reduce((a, s) => a + s.count, 0) || 1
  const avail = Math.max(0, width - SEG_GAP * Math.max(0, visible.length - 1))
  let x = 0
  const placed = visible.map((s) => {
    const w = (s.count / total) * avail
    const out = { s, x, w }
    x += w + SEG_GAP
    return out
  })
  // Los bloques chicos van al final para quedar encima: su blanco táctil mide al menos 24 px.
  const hits = [...placed].sort((a, b) => b.w - a.w)
  return (
    <div ref={ref} className="nu-seg">
      <svg width={width} height={SEG_H} viewBox={`0 0 ${width} ${SEG_H}`} aria-hidden="true">
        {placed.map(({ s, x, w }) => {
          const dim = selected !== null && selected !== s.key
          const style = { '--d': `${Math.round((x / Math.max(1, width)) * 420)}ms`, '--dur': `${Math.max(60, Math.round((w / Math.max(1, width)) * 420))}ms` } as CSSProperties
          return (
            <g key={s.key} className={`nu-seg__part ${dim ? 'nu-seg__part--dim' : ''}`}>
              <rect className="nu-seg__block" x={x} y={0} width={w} height={SEG_H} rx={Math.min(4, w / 2)} fill={segFill(s.step)} style={style} />
              {s.text && w >= 36 && <text className="nu-seg__text" x={x + 8} y={18} fill={s.step > 0 ? `var(--viz-on-${s.step})` : 'transparent'}>{s.text}</text>}
            </g>
          )
        })}
      </svg>
      <div className="nu-seg__hits" role="group" aria-label={label}>
        {hits.map(({ s, x, w }) => {
          const hw = Math.max(w, 24)
          return <button key={s.key} type="button" className="nu-seg__hit" style={{ left: x + w / 2 - hw / 2, width: hw }} aria-label={describe(s)} aria-pressed={selected === s.key} onClick={() => onSelect(s.key)} />
        })}
      </div>
    </div>
  )
}

/* ---------- Meter ---------- */

export function Meter({ value, max, text }: { value: number; max: number; text: string }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="nu-meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={text}>
      <span className="nu-meter__stat">{text}</span>
      <div className="nu-meter__rail"><i className="nu-meter__fill" style={{ '--w': `${w}%` } as CSSProperties} /></div>
    </div>
  )
}

/* ---------- Readout ---------- */

/** Lo que dice la marca tocada. Sin selección no ocupa espacio, pero sigue siendo la región viva. */
export function Readout({ children }: { children?: ReactNode }) {
  return <p className={`nu-readout ${children ? '' : 'nu-readout--off'}`} role="status" aria-live="polite">{children}</p>
}
