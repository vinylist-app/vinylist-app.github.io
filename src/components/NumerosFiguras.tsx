import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { discos, type Slice } from '../lib/stats'

/**
 * Las figuras de "En números": barras horizontales, columnas, la barra alta
 * segmentada, el meter y el readout. Todo en HTML y SVG a mano, una tinta
 * (--viz-bar) y texto siempre en tokens de texto. Lo tocado se queda en
 * --viz-bar y sus hermanas bajan a --viz-dim; el readout lo arma la pantalla.
 */

/** Ancho real del contenedor, para dibujar cada SVG al tamaño exacto (se mide antes de pintar: el primer cuadro ya va al ancho real). */
export function useWidth<T extends HTMLElement>(fallback = 320): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
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
      {/* La ranura completa es el blanco táctil: botones de verdad encima del dibujo (foco y tap nativos).
          Una columna en 0 no tiene nada que seleccionar: su botón va deshabilitado, pero conserva el nombre para el lector de pantalla. */}
      <div className="nu-cols__hits" role="group" aria-label={label}>
        {cols.map((c) => (
          <button key={c.key} type="button" className="nu-col__hit" aria-label={`${c.name}, ${discos(c.count)}`} aria-pressed={selected === c.key} disabled={c.count === 0} onClick={() => onSelect(c.key)} />
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

/**
 * Blancos táctiles de la barra alta: una partición del riel, sin encimarse. Cada bloque recibe
 * su ancho (más la mitad de cada hueco) y los angostos crecen hasta `min` a costa de los vecinos
 * que tengan de sobra; si ningún vecino puede ceder, se quedan con lo que hay.
 */
export function hitSpans(blocks: { x: number; w: number }[], width: number, min = 24): { left: number; width: number }[] {
  const n = blocks.length
  if (n === 0) return []
  const b: number[] = [0]
  for (let i = 1; i < n; i++) b.push((blocks[i - 1].x + blocks[i - 1].w + blocks[i].x) / 2)
  b.push(Math.max(width, blocks[n - 1].x + blocks[n - 1].w))
  for (let i = 0; i < n; i++) {
    let need = min - (b[i + 1] - b[i])
    if (need <= 0) continue
    const fromLeft = i > 0 ? Math.min(need, Math.max(0, b[i] - b[i - 1] - min)) : 0
    b[i] -= fromLeft
    need -= fromLeft
    const fromRight = i < n - 1 ? Math.min(need, Math.max(0, b[i + 2] - b[i + 1] - min)) : 0
    b[i + 1] += fromRight
  }
  return blocks.map((_, i) => ({ left: b[i], width: b[i + 1] - b[i] }))
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
  const spans = hitSpans(placed, width)
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
        {placed.map(({ s }, i) => (
          <button key={s.key} type="button" className="nu-seg__hit" style={{ left: spans[i].left, width: spans[i].width }} aria-label={describe(s)} aria-pressed={selected === s.key} onClick={() => onSelect(s.key)} />
        ))}
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

/* ---------- Dona (modo pastel) ---------- */

export interface DonutDatum extends Slice {
  /** 5 … 1 = paso de la rampa (de mayor a menor); 0 = --viz-nd ("Otros", "sin dato"). */
  step: number
  /** false = nunca lleva su cifra adentro ("Otros", "sin dato"). */
  text: boolean
}

const DN_C = 110
/** Radio medio del anillo: exterior 105, interior 75 (grosor 30). */
const DN_R = 90
const DN_RING = 2 * Math.PI * DN_R
/** Grados mínimos para que la rebanada lleve su cifra adentro. */
const DN_TEXT_MIN = 36

/** Punto a `deg` grados desde arriba (sentido del reloj) y radio r, con dos decimales. */
function polar(deg: number, r: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [Math.round((DN_C + r * Math.cos(a)) * 100) / 100, Math.round((DN_C + r * Math.sin(a)) * 100) / 100]
}

/** Arco de a0 a a1 a radio r. El anillo completo va en dos mitades: un arco no puede cerrar sobre su propio inicio. */
export function arcPath(a0: number, a1: number, r: number): string {
  if (a1 - a0 >= 360) return `M${polar(0, r).join(',')} A${r},${r} 0 0 1 ${polar(180, r).join(',')} A${r},${r} 0 0 1 ${polar(360, r).join(',')}`
  return `M${polar(a0, r).join(',')} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${polar(a1, r).join(',')}`
}

/**
 * La dona: cada rebanada es un arco de trazo grueso (así la entrada es un dash que se dibuja en
 * secuencia) y es a la vez el botón; encima, hairlines en --card marcan los huecos de 2 px en
 * cada frontera. El centro es HTML (la elipsis del nombre sale gratis) y la leyenda de abajo es
 * la vista-tabla rápida: sus filas seleccionan lo mismo que las rebanadas.
 */
export function Donut({ slices, selected, onSelect, label, total, unit }: { slices: DonutDatum[]; selected: string | null; onSelect: (key: string) => void; label: string; total: number; unit: string }) {
  const cur = selected !== null ? slices.find((s) => s.key === selected) : undefined
  return (
    <>
      <div className="nu-donut">
        <svg viewBox="0 0 220 220" role="group" aria-label={`${label}: ${total} ${unit}`}>
          {slices.map((s) => {
            const deg = s.end - s.start
            const on = selected === s.key
            const dim = selected !== null && !on
            // --len con un píxel de sobra: el dash cubre el arco entero aunque el redondeo lo deje un pelo más largo.
            const style = { '--len': `${((DN_RING * deg) / 360 + 1).toFixed(2)}px`, '--d': `${Math.round((s.start / 360) * 420)}ms`, '--dur': `${Math.max(60, Math.round((deg / 360) * 420))}ms` } as CSSProperties
            const onKey = (e: KeyboardEvent<SVGPathElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.key) } }
            const [tx, ty] = polar(s.start + deg / 2, DN_R)
            return (
              <g key={s.key} className={`nu-donut__part ${dim ? 'nu-donut__part--dim' : ''}`}>
                <path className="nu-donut__slice" d={arcPath(s.start, s.end, DN_R)} stroke={segFill(s.step)} style={style} role="button" tabIndex={0} aria-label={`${s.label}, ${discos(s.count)}, ${s.pct}%`} aria-pressed={on} onClick={() => onSelect(s.key)} onKeyDown={onKey} />
                <path className="nu-donut__ring" d={`${arcPath(s.start, s.end, 107)} ${arcPath(s.start, s.end, 73)}`} aria-hidden="true" />
                {s.text && deg >= DN_TEXT_MIN && <text className="nu-donut__text" x={tx} y={ty} dy="0.35em" textAnchor="middle" fill={s.step > 0 ? `var(--viz-on-${s.step})` : 'transparent'}>{s.pct}%</text>}
              </g>
            )
          })}
          {slices.length > 1 && slices.map((s) => {
            const [x1, y1] = polar(s.start, 72)
            const [x2, y2] = polar(s.start, 108)
            return <line key={s.key} className="nu-donut__gap" x1={x1} y1={y1} x2={x2} y2={y2} aria-hidden="true" />
          })}
        </svg>
        <div key={cur?.key ?? ''} className="nu-donut__center nu-xfade" aria-hidden="true">
          <b className="nu-donut__n">{cur ? cur.count : total}</b>
          <span className="nu-donut__u">{cur ? cur.label : unit}</span>
        </div>
      </div>
      <div className="nu-lrows" role="group" aria-label={`Leyenda: ${label}`}>
        {slices.map((s) => {
          const on = selected === s.key
          return (
            <button key={s.key} type="button" className={`nu-legend__row ${selected !== null && !on ? 'nu-legend__row--dim' : ''}`} aria-pressed={on} onClick={() => onSelect(s.key)}>
              <i className="nu-legend__sw" style={{ background: segFill(s.step) }} />
              <span className="nu-legend__name">{s.label}</span>
              <span className="nu-legend__val">{s.count} · {s.pct}%</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
