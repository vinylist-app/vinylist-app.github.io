import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAlbums } from '../data/hooks'
import { personName, useSession } from '../session'
import { Logo } from '../components/Logo'
import { BackIcon } from '../components/Icons'
import { ChevronIcon } from '../components/CuentaIcons'
import { Sheet } from '../components/Sheet'
import { Cover } from '../components/AlbumCard'
import { StarRating } from '../components/StarRating'
import { Columns, Donut, HBars, Meter, Readout, SegBar, segFill, type ColDatum, type DonutDatum } from '../components/NumerosFiguras'
import { artistStats, copyStats, decadeStats, discos, donutSlices, familyStats, growthStats, heroStats, labelStats, moneyStats, OTHER_KEY, pct, starStats, tagStats, yearsOf, type Bucket, type CondStats, type DecadeStats, type Extreme } from '../lib/stats'
import { getFigura, setFigura, type Figura } from '../lib/figura'
import { cleanArtist, decadeLabel, priceLabel } from '../lib/text'
import { ariaTextFor } from '../lib/starSlider'
import type { Album } from '../types'
import '../styles/numeros.css'

/**
 * En números: lo que tu colección cuenta. Héroe con las cifras grandes, el
 * Lado A (la música: artistas, años, géneros, estrellas, sellos) y el Lado B
 * (el coleccionar: crecimiento, copias, invertido, familia). Cada tarjeta es
 * una frase, su figura y, al tocar una marca, el readout con el enlace a la
 * Colección filtrada. Los cálculos viven en lib/stats.ts.
 */

function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `nu-in` cuando la tarjeta entra en pantalla (30 %), una sola vez por montaje. */
function useInView<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setOn(true); io.disconnect() }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, on]
}

/** Cuenta de 0 al total en 600 ms (ease-out), una vez por montaje; sin movimiento, va directo. */
function useCountUp(target: number): number {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0))
  const current = useRef(v)
  useEffect(() => {
    if (reducedMotion()) { current.current = target; setV(target); return }
    const from = current.current
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 600)
      const e = 1 - Math.pow(1 - p, 3)
      const n = Math.round(from + (target - from) * e)
      current.current = n
      setV(n)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

const toggle = (set: (f: (prev: string | null) => string | null) => void) => (key: string) => set((prev) => (prev === key ? null : key))

const q = (s: string) => `/?q=${encodeURIComponent(s)}`

/** Barras o pastel: una sola preferencia para toda la pantalla (se guarda por celular). */
const FiguraContext = createContext<Figura>('barras')
/** Una dona nunca pasa de 6 rebanadas: las 5 mayores y "Otros". */
const DONUT_TOP = 5

/** Las rebanadas de una sección: las 5 mayores recorren la rampa de --viz-5 a --viz-1 y "Otros" va en --viz-nd, sin cifra. */
function donutOf(rows: Bucket[], otherLabel = 'Otros'): DonutDatum[] {
  return donutSlices(rows, { top: DONUT_TOP, otherLabel }).map((s, i) => (s.key === OTHER_KEY ? { ...s, step: 0, text: false } : { ...s, step: DONUT_TOP - i, text: true }))
}

export function Numeros() {
  const loaded = useAlbums()
  const albums = loaded ?? []
  const n = albums.length
  const { collection } = useSession()
  const family = Boolean(collection && Object.keys(collection.members).length >= 2)
  const [figura, setFig] = useState<Figura>(getFigura)
  const changeFigura = (f: Figura) => { setFigura(f); setFig(f) }

  return (
    <main className="page nu">
      <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          <Link to="/" className="icon-btn icon-btn--ghost" aria-label="Volver" style={{ margin: '0 0 0 -10px' }}><BackIcon /></Link>
          <Logo />
        </div>
        <span className="eyebrow">Tu colección</span>
        <div className="title-row">
          <h1>En números</h1>
          {n > 0 && <span className="badge">{discos(n)}</span>}
        </div>
      </div>

      {loaded === undefined ? (
        <p className="muted" style={{ textAlign: 'center' }}>Cargando…</p>
      ) : n === 0 ? (
        <div className="empty">
          <div className="empty__tiles" aria-hidden="true"><i /><i /><i /><i /></div>
          <h2>Todavía no hay nada que contar</h2>
          <p>Escanea tu primer disco y aquí te digo qué tienes.</p>
          <Link to="/escanear" className="btn btn--primary">Escanear un disco</Link>
        </div>
      ) : (
        <FiguraContext value={figura}>
          <Hero albums={albums} />
          <Chips className="nu-figura" value={figura} options={[{ value: 'barras', label: 'Barras' }, { value: 'pastel', label: 'Pastel' }]} onChange={changeFigura} label="Tipo de gráfica" />
          <Lado label="Lado A · La música" />
          <Artistas albums={albums} />
          <Anos albums={albums} />
          <Generos albums={albums} />
          <Estrellas albums={albums} />
          <Sellos albums={albums} />
          <Lado label="Lado B · El coleccionar" />
          <Crecimiento albums={albums} />
          <Copias albums={albums} />
          <Invertido albums={albums} />
          {family && <Familia albums={albums} />}
          <p className="muted" style={{ textAlign: 'center' }}>Entre más llenes en cada ficha, más te cuento.</p>
        </FiguraContext>
      )}
    </main>
  )
}

/* ---------- Piezas comunes ---------- */

function Lado({ label }: { label: string }) {
  return <div className="nu-lado"><span className="eyebrow">{label}</span><i className="nu-lado__line" /></div>
}

function Card({ id, eyebrow, aside, children }: { id: string; eyebrow: string; aside?: ReactNode; children: ReactNode }) {
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <section ref={ref} id={id} className={`card nu-card ${inView ? 'nu-in' : ''}`} aria-labelledby={`${id}-h`}>
      <div className="nu-card__head"><h2 id={`${id}-h`} className="eyebrow">{eyebrow}</h2>{aside}</div>
      {children}
    </section>
  )
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="nu-lead">{children}</p>
}

function Notes({ children }: { children: ReactNode }) {
  return <div className="nu-notes">{children}</div>
}

/** Cola de la figura: "y 49 más · Ver todos ›" (sin `n`, solo "Ver todos ›"). */
function More({ n, onClick }: { n?: number; onClick: () => void }) {
  // Un solo span adentro: el botón es inline-flex (para centrar los 44 px) y un texto suelto perdería su espacio final.
  return <button type="button" className="nu-more" onClick={onClick}><span>{n !== undefined && <>y {n} más · </>}<b>Ver todos ›</b></span></button>
}

/** "· Ver en la colección ›": separador y enlace van juntos para que el punto no quede colgando al final de la línea. */
function Go({ to }: { to: string }) {
  return <span className="nu-readout__go">· <Link to={to}>Ver en la colección ›</Link></span>
}

/** Fila fija que lleva a la ficha: "El más viejo: Kind of Blue · Miles Davis · 1959 ›". */
function FixedLine({ k, album, value }: { k: string; album: Album; value: string }) {
  return (
    <Link to={`/album/${album.id}`} className="nu-line">
      <span className="nu-line__body"><span className="nu-line__k">{k}</span><span className="nu-line__v">{value}</span></span>
      <ChevronIcon className="nu-line__chev" width={18} height={18} />
    </Link>
  )
}

function Chips<T extends string>({ value, options, onChange, label, className = 'nu-chips' }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div className={className} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? 'chip--on' : ''}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/**
 * Parte-de-un-todo (A1, A3, A5, B3): barras ordenadas (top `limit`) o, en modo pastel, la dona
 * (top 5 + Otros) con su leyenda. La cola «y N más · Ver todos ›» y el readout van igual en los
 * dos modos; «Otros» solo dice cuántas categorías pliega. Cambiar de modo remonta la figura
 * (cross-fade) y con ella suelta la selección.
 */
function Reparto(props: { rows: Bucket[]; limit: number; title: string; total: number; word: string; readout: (r: Bucket) => ReactNode; onAll?: () => void }) {
  const figura = useContext(FiguraContext)
  return <RepartoFig key={figura} pastel={figura === 'pastel'} {...props} />
}

function RepartoFig({ rows, limit, title, total, word, readout, onAll, pastel }: { rows: Bucket[]; limit: number; title: string; total: number; word: string; readout: (r: Bucket) => ReactNode; onAll?: () => void; pastel: boolean }) {
  const [sel, setSel] = useState<string | null>(null)
  const shown = rows.slice(0, pastel ? DONUT_TOP : limit)
  const rest = rows.length - shown.length
  const slices = useMemo(() => (pastel ? donutOf(rows) : []), [pastel, rows])
  const cur = sel ? rows.find((r) => r.key === sel) : undefined
  const other = sel === OTHER_KEY ? slices.find((s) => s.key === OTHER_KEY) : undefined
  return (
    <div className="nu-xfade nu-fig">
      {pastel
        ? <Donut slices={slices} selected={sel} onSelect={toggle(setSel)} label={title} total={total} unit="discos" />
        : <HBars rows={shown} selected={sel} onSelect={toggle(setSel)} />}
      {rest > 0 && onAll && <More n={rest} onClick={onAll} />}
      <Readout>{cur ? readout(cur) : other && <><b>{discos(other.count)}</b> · otros {other.rest} {word}</>}</Readout>
    </div>
  )
}

/** La hoja "Ver todos": la vista-tabla de la gráfica, con todo lo que no cupo. */
function AllSheet({ title, sub, rows, total, hrefOf, foot, onClose }: { title: string; sub: string; rows: Bucket[]; total: number; hrefOf?: (r: Bucket) => string; foot?: { label: string; count: number }; onClose: () => void }) {
  const nav = useNavigate()
  return (
    <Sheet onClose={onClose} labelledBy="nu-sheet-h" className="nu-sheet">
      <h2 id="nu-sheet-h">{title}</h2>
      <p className="nu-sheet__sub">{sub}</p>
      <div className="nu-table">
        {rows.map((r) => {
          const inner = <><span className="nu-trow__name">{r.label}</span><span className="nu-trow__n">{r.count}</span><span className="nu-trow__p">{pct(r.count, total)}%</span></>
          const href = hrefOf?.(r)
          return href
            ? <button key={r.key} type="button" className="nu-trow" onClick={() => { nav(href); onClose() }}>{inner}</button>
            : <div key={r.key} className="nu-trow">{inner}</div>
        })}
        {foot && <div className="nu-trow nu-trow--foot"><span className="nu-trow__name">{foot.label}</span><span className="nu-trow__n">{foot.count}</span><span className="nu-trow__p" /></div>}
      </div>
    </Sheet>
  )
}

/* ---------- Héroe ---------- */

function Hero({ albums }: { albums: Album[] }) {
  const h = useMemo(() => heroStats(albums), [albums])
  const shown = useCountUp(h.n)
  function goArtists() {
    document.getElementById('nu-a1')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <section className="nu-hero" aria-label="Tu colección en cifras">
      <span className="eyebrow nu-hero__eyebrow">Tu colección</span>
      <div className="nu-hero__fig">
        <span className="visually-hidden">{discos(h.n)}</span>
        <span className="nu-hero__n" aria-hidden="true"><span className="nu-hero__ghost">{h.n}</span><span>{shown}</span></span>
        <span className="nu-hero__unit" aria-hidden="true">{h.n === 1 ? 'disco' : 'discos'}</span>
      </div>
      <div className="nu-tiles">
        <div className="nu-tile" style={{ '--i': 0 } as CSSProperties}><span className="nu-tile__k">Horas de música</span><span className="nu-tile__v">{h.hours}</span></div>
        <div className="nu-tile" style={{ '--i': 1 } as CSSProperties}><span className="nu-tile__k">Canciones</span><span className="nu-tile__v">{h.songs}</span></div>
        <button type="button" className="nu-tile nu-tile--btn" style={{ '--i': 2 } as CSSProperties} onClick={goArtists} aria-label={`${h.artists} artistas. Ver artistas`}><span className="nu-tile__k">Artistas</span><span className="nu-tile__v">{h.artists}</span></button>
      </div>
      {h.note && <p className="nu-hero__note">{h.note}</p>}
    </section>
  )
}

/* ---------- A1 · Artistas ---------- */

function Artistas({ albums }: { albums: Album[] }) {
  const s = useMemo(() => artistStats(albums), [albums])
  const [all, setAll] = useState(false)
  return (
    <Card id="nu-a1" eyebrow="A1 · Artistas">
      <Lead>{s.lead}</Lead>
      {s.chart && <Reparto rows={s.rows} limit={8} title="Artistas" total={albums.length} word="artistas" onAll={() => setAll(true)} readout={(r) => <><b>{discos(r.count)}</b> · {r.label} · {pct(r.count, albums.length)}% de tu colección <Go to={q(r.label)} /></>} />}
      {s.various > 0 && <Notes><span className="nu-note">{s.various} de varios artistas no {s.various === 1 ? 'cuenta' : 'cuentan'} aquí</span></Notes>}
      {all && <AllSheet title="Artistas" sub={`${s.rows.length} artistas · ${discos(albums.length)}`} rows={s.rows} total={albums.length} hrefOf={(r) => q(r.label)} foot={s.various > 0 ? { label: 'Varios artistas', count: s.various } : undefined} onClose={() => setAll(false)} />}
    </Card>
  )
}

/* ---------- A2 · De qué año son ---------- */

function extremeText(e: Extreme): string {
  const a = e.album
  return `${a.title} · ${cleanArtist(a.artist)} · ${a.year}${e.more > 0 ? ` · y ${e.more} más de ese año` : ''}`
}

function Anos({ albums }: { albums: Album[] }) {
  const s = useMemo(() => decadeStats(albums), [albums])
  const figura = useContext(FiguraContext)
  return (
    <Card id="nu-a2" eyebrow="A2 · De qué año son">
      <Lead>{s.lead}</Lead>
      {(s.chart || s.chartYears) && <AnosFig key={figura} albums={albums} s={s} pastel={figura === 'pastel'} />}
      {s.oldest && s.newest && (
        <div className="nu-lines">
          <FixedLine k="El más viejo" album={s.oldest.album} value={extremeText(s.oldest)} />
          <FixedLine k="El más nuevo" album={s.newest.album} value={extremeText(s.newest)} />
        </div>
      )}
      {s.without > 0 && s.decades.length > 0 && <Notes><span className="nu-note">{s.without === 1 ? '1 disco sin año no entra aquí' : `${s.without} discos sin año no entran aquí`}</span></Notes>}
    </Card>
  )
}

/**
 * La figura de A2: columnas por década (o, en pastel, la dona de las 5 décadas mayores + «Otras
 * décadas») y debajo los diez años de la década seleccionada (por defecto la mayor), que siguen
 * siendo columnas en los dos modos. «Otras décadas» se marca y da su readout, pero no cambia la
 * fila de años. Se remonta al cambiar de modo (cross-fade) y vuelve a la década por defecto.
 */
function AnosFig({ albums, s, pastel }: { albums: Album[]; s: DecadeStats; pastel: boolean }) {
  const [dec, setDec] = useState<string | null>(s.top !== undefined ? String(s.top) : null)
  const [year, setYear] = useState<string | null>(null)
  /** «Otras décadas» tocada en la dona (la década del drill-down se queda). */
  const [otras, setOtras] = useState(false)
  useEffect(() => { setDec(s.top !== undefined ? String(s.top) : null); setYear(null); setOtras(false) }, [s.top])
  const decade = dec !== null ? Number(dec) : null
  const years = useMemo(() => (decade !== null ? yearsOf(albums, decade) : []), [albums, decade])

  const decCols: ColDatum[] = s.decades.map((d) => ({ key: String(d.value), tick: d.tick, count: d.count, name: decadeLabel(d.value) }))
  // Dona: las décadas con dato por conteo (empate: la más reciente primero), las 5 mayores y «Otras décadas».
  const decSlices = useMemo(() => {
    if (!pastel) return []
    const ranked = s.decades.filter((d) => d.count > 0).sort((a, b) => b.count - a.count || b.value - a.value)
    return donutOf(ranked.map((d) => ({ key: String(d.value), label: decadeLabel(d.value), count: d.count })), 'Otras décadas')
  }, [pastel, s.decades])
  const withYear = s.decades.reduce((a, d) => a + d.count, 0)
  const yearCols: ColDatum[] = years.map((y) => ({ key: String(y.value), tick: y.tick, count: y.count, name: String(y.value) }))
  const curDec = decade !== null ? s.decades.find((d) => d.value === decade) : undefined
  const curYear = year !== null ? years.find((y) => String(y.value) === year) : undefined
  const otrasSlice = otras ? decSlices.find((d) => d.key === OTHER_KEY) : undefined

  const pickDec = (k: string) => { setYear(null); setDec((p) => (p === k ? null : k)) }
  const pickSlice = (k: string) => {
    if (k === OTHER_KEY) { setOtras((o) => !o); return }
    setOtras(false)
    pickDec(k)
  }

  return (
    <div className="nu-xfade nu-fig">
      {s.chart && (pastel
        ? <Donut slices={decSlices} selected={otras ? OTHER_KEY : dec} onSelect={pickSlice} label="Discos por década" total={withYear} unit="con año" />
        : <Columns cols={decCols} selected={dec} onSelect={pickDec} label="Discos por década" />)}
      {decade !== null && (
        <div key={decade} className="nu-xfade nu-years">
          <span className="nu-years__k">Por año · {decadeLabel(decade)}</span>
          <Columns cols={yearCols} selected={year} onSelect={toggle(setYear)} label={`Discos por año, ${decadeLabel(decade)}`} />
        </div>
      )}
      <Readout>
        {curYear
          ? <><b>{discos(curYear.count)}</b> · {curYear.value} <Go to={q(String(curYear.value))} /></>
          : otrasSlice
            ? <><b>{discos(otrasSlice.count)}</b> · otras décadas</>
            : s.chart && curDec && <><b>{discos(curDec.count)}</b> · {decadeLabel(curDec.value)} · {pct(curDec.count, albums.length)}% <Go to={`/?decada=${curDec.value}`} /></>}
      </Readout>
    </div>
  )
}

/* ---------- A3 · Géneros · Estilos ---------- */

function Generos({ albums }: { albums: Album[] }) {
  const g = useMemo(() => tagStats(albums, 'genres'), [albums])
  const st = useMemo(() => tagStats(albums, 'styles'), [albums])
  // Arranca en la vista que tenga filas; los chips existen en cuanto algún disco trae estilos.
  const [view, setView] = useState<'genres' | 'styles'>(g.rows.length > 0 || st.rows.length === 0 ? 'genres' : 'styles')
  const [all, setAll] = useState(false)
  const chips = st.rows.length > 0
  const s = view === 'genres' ? g : st
  const limit = view === 'genres' ? 6 : 8
  const word = view === 'genres' ? 'género' : 'estilo'
  const title = view === 'genres' ? 'Géneros' : 'Estilos'
  const href = (r: Bucket) => `/?genero=${encodeURIComponent(r.raw ?? r.label)}`

  return (
    <Card id="nu-a3" eyebrow="A3 · Géneros · Estilos" aside={chips && <Chips value={view} options={[{ value: 'genres', label: 'Géneros' }, { value: 'styles', label: 'Estilos' }]} onChange={setView} label="Vista" />}>
      <div key={view} className="nu-xfade nu-card__body">
        <Lead>{s.lead}</Lead>
        {s.chart && <Reparto rows={s.rows} limit={limit} title={title} total={albums.length} word={`${word}s`} onAll={() => setAll(true)} readout={(r) => <><b>{discos(r.count)}</b> · {r.label} · {pct(r.count, albums.length)}% de tu colección <Go to={href(r)} /></>} />}
        {s.rows.length > 0 && (
          <Notes>
            <span className="nu-note">Un disco puede traer varios {word}s</span>
            {s.without > 0 && <span className="nu-note">{s.without} sin {word} · <Link to="/ajustes">Conecta Discogs en Ajustes ›</Link></span>}
          </Notes>
        )}
      </div>
      {all && <AllSheet title={title} sub={`${s.rows.length} ${word}s · ${discos(albums.length)}`} rows={s.rows} total={albums.length} hrefOf={href} foot={s.without > 0 ? { label: `Sin ${word}`, count: s.without } : undefined} onClose={() => setAll(false)} />}
    </Card>
  )
}

/* ---------- A4 · Tus estrellas ---------- */

function Estrellas({ albums }: { albums: Album[] }) {
  const s = useMemo(() => starStats(albums), [albums])
  const [sel, setSel] = useState<string | null>(null)
  const cols: ColDatum[] = s.hist.map((h) => ({ key: String(h.rating), tick: h.tick, count: h.count, name: h.label }))
  const cur = sel ? s.hist.find((h) => String(h.rating) === sel) : undefined
  const pending = s.total - s.rated
  return (
    <Card id="nu-a4" eyebrow="A4 · Tus estrellas">
      {s.rated > 0 && <Meter value={s.rated} max={s.total} text={`${s.rated} de ${s.total} calificados`} />}
      <Lead>{s.lead}</Lead>
      {s.chart && (
        <>
          <Columns cols={cols} selected={sel} onSelect={toggle(setSel)} label="Discos por calificación, de media estrella a cinco" />
          <Readout>{cur && <><b>{discos(cur.count)}</b> · {cur.label}</>}</Readout>
        </>
      )}
      {s.best.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Tus mejores</span>
          <div className="nu-best">
            {s.best.map((a) => (
              <Link key={a.id} to={`/album/${a.id}`} className="nu-best__item" aria-label={`${a.title}, ${cleanArtist(a.artist)}, ${ariaTextFor(a.rating)}`}>
                <Cover src={a.thumbUrl ?? a.coverUrl} title={a.title} className="thumb nu-best__cover" />
                <StarRating value={a.rating} size={12} />
              </Link>
            ))}
          </div>
          {s.moreBest > 0 && <span className="nu-note">y {s.moreBest} más con {s.maxLabel} · <Link to="/?orden=rating">Ver en la colección ›</Link></span>}
        </div>
      )}
      {pending > 0 && s.rated > 0 && <Notes><span className="nu-note">{pending} sin calificar</span></Notes>}
    </Card>
  )
}

/* ---------- A5 · Sellos ---------- */

function Sellos({ albums }: { albums: Album[] }) {
  const s = useMemo(() => labelStats(albums), [albums])
  const [all, setAll] = useState(false)
  return (
    <Card id="nu-a5" eyebrow="A5 · Sellos">
      <Lead>{s.lead}</Lead>
      {s.chart && <Reparto rows={s.rows} limit={6} title="Sellos" total={albums.length} word="sellos" onAll={() => setAll(true)} readout={(r) => <><b>{discos(r.count)}</b> · {r.label} · {pct(r.count, albums.length)}% <Go to={q(r.label)} /></>} />}
      {s.without > 0 && s.rows.length > 0 && <Notes><span className="nu-note">{s.without} sin sello</span></Notes>}
      {all && <AllSheet title="Sellos" sub={`${s.rows.length} sellos · ${discos(albums.length)}`} rows={s.rows} total={albums.length} hrefOf={(r) => q(r.label)} foot={s.without > 0 ? { label: 'Sin sello', count: s.without } : undefined} onClose={() => setAll(false)} />}
    </Card>
  )
}

/* ---------- B1 · Cómo ha crecido ---------- */

function Crecimiento({ albums }: { albums: Album[] }) {
  const s = useMemo(() => growthStats(albums), [albums])
  const [sel, setSel] = useState<string | null>(null)
  const cols: ColDatum[] = s.months.map((m) => ({ key: m.key, tick: m.tick, count: m.count, name: m.label }))
  const cur = sel ? s.months.find((m) => m.key === sel) : undefined
  return (
    <Card id="nu-b1" eyebrow="B1 · Cómo ha crecido">
      <Lead>{s.lead}</Lead>
      {s.sub && <span className="nu-sub">{s.sub}</span>}
      {s.chart && (
        <>
          <Columns cols={cols} selected={sel} onSelect={toggle(setSel)} label="Discos agregados por mes, últimos doce meses" />
          <Readout>{cur && <><b>{discos(cur.count)}</b> · {cur.label}</>}</Readout>
        </>
      )}
    </Card>
  )
}

/* ---------- B2 · Tus copias ---------- */

function Condicion({ c, total, view, pastel }: { c: CondStats; total: number; view: string; pastel: boolean }) {
  const [sel, setSel] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const segs = c.blocks.map((b) => ({ key: b.key, label: b.label, count: b.count, step: b.step, text: b.step > 0 ? `${pct(b.count, total)}%` : '' }))
  // La dona lleva los mismos bloques, en el mismo orden y con los mismos colores por estado; "sin dato" sin cifra.
  const slices = useMemo(() => (pastel ? donutSlices(c.blocks, { top: c.blocks.length }).map((s) => { const step = c.blocks.find((b) => b.key === s.key)?.step ?? 0; return { ...s, step, text: step > 0 } }) : []), [pastel, c.blocks])
  const cur = sel ? c.blocks.find((b) => b.key === sel) : undefined
  const visible = c.blocks.filter((b) => b.count > 0)
  const title = `Estado ${view === 'media' ? 'del disco' : 'de la funda'}`
  // La hoja es la vista-tabla de la barra: los bloques con estado, de M a G+ o menos, y "Sin dato" al final.
  const rows: Bucket[] = visible.filter((b) => b.step > 0).map((b) => ({ key: b.key, label: b.label, count: b.count }))
  const nd = c.blocks.find((b) => b.step === 0)
  return (
    <div key={view} className="nu-xfade nu-card__body">
      <Lead>{c.lead}</Lead>
      {c.enough && (
        <>
          {pastel
            ? <Donut slices={slices} selected={sel} onSelect={toggle(setSel)} label={title} total={c.withData} unit="con estado" />
            : (
              <>
                <SegBar segs={segs} selected={sel} onSelect={toggle(setSel)} label={title} describe={(s) => (s.step > 0 ? `${s.label}, ${discos(s.count)}, ${pct(s.count, c.withData)}% de los que tienen estado` : `Sin dato, ${discos(s.count)}`)} />
                <ul className="nu-legend">
                  {visible.map((b) => <li key={b.key}><i style={{ background: segFill(b.step) }} />{b.label}</li>)}
                </ul>
              </>
            )}
          <More onClick={() => setAll(true)} />
          <Readout>{cur && (cur.step > 0 ? <><b>{discos(cur.count)}</b> · {cur.label} · {pct(cur.count, c.withData)}% de los que tienen estado</> : <><b>{discos(cur.count)}</b> · sin dato</>)}</Readout>
        </>
      )}
      {all && <AllSheet title={title} sub={`${c.withData} con estado · ${discos(total)}`} rows={rows} total={c.withData} foot={nd && nd.count > 0 ? { label: 'Sin dato', count: nd.count } : undefined} onClose={() => setAll(false)} />}
    </div>
  )
}

function Copias({ albums }: { albums: Album[] }) {
  const s = useMemo(() => copyStats(albums), [albums])
  const [view, setView] = useState<'media' | 'sleeve'>('media')
  const figura = useContext(FiguraContext)
  const c = view === 'media' ? s.media : s.sleeve
  return (
    <Card id="nu-b2" eyebrow="B2 · Tus copias" aside={s.anySleeve && (s.media.enough || s.sleeve.enough) && <Chips value={view} options={[{ value: 'media', label: 'Disco' }, { value: 'sleeve', label: 'Funda' }]} onChange={setView} label="Condición de" />}>
      <Condicion key={`${view}:${figura}`} c={c} total={albums.length} view={view} pastel={figura === 'pastel'} />
      <div className="nu-kvs">
        <div className="nu-kv"><span className="nu-kv__k">Formato</span><span className="nu-kv__v">{s.formatLine}</span></div>
        {s.countryLine && <div className="nu-kv"><span className="nu-kv__k">Prensados en</span><span className="nu-kv__v">{s.countryLine}</span></div>}
      </div>
    </Card>
  )
}

/* ---------- B3 · Lo que llevas invertido ---------- */

function Invertido({ albums }: { albums: Album[] }) {
  const s = useMemo(() => moneyStats(albums), [albums])
  const [all, setAll] = useState(false)
  const withPlace = s.places.reduce((a, r) => a + r.count, 0)
  return (
    <Card id="nu-b3" eyebrow="B3 · Lo que llevas invertido">
      <Lead>{s.lead}</Lead>
      {s.priced > 0 && (
        <>
          {s.top && s.top.purchasePrice !== undefined && <div className="nu-lines"><FixedLine k="El más caro" album={s.top} value={`${s.top.title} · ${cleanArtist(s.top.artist)} · ${priceLabel(s.top.purchasePrice)}`} /></div>}
          {s.places.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">Dónde compras</span>
              {s.placesChart ? (
                <Reparto rows={s.places} limit={5} title="Dónde compras" total={albums.length} word="lugares" onAll={() => setAll(true)} readout={(r) => <><b>{discos(r.count)}</b> · {r.label}</>} />
              ) : (
                <span className="nu-line15">{s.places.map((p) => `${p.label} ${p.count}`).join(' · ')}</span>
              )}
            </div>
          )}
          {s.withoutPrice > 0 && <Notes><span className="nu-note">{s.withoutPrice} sin precio</span></Notes>}
        </>
      )}
      {all && <AllSheet title="Dónde compras" sub={`${s.places.length} lugares · ${discos(albums.length)}`} rows={s.places} total={albums.length} foot={albums.length - withPlace > 0 ? { label: 'Sin lugar', count: albums.length - withPlace } : undefined} onClose={() => setAll(false)} />}
    </Card>
  )
}

/* ---------- B4 · En familia ---------- */

function Familia({ albums }: { albums: Album[] }) {
  const { collection } = useSession()
  // Los nombres salen de la colección activa; se recalcula si cambian los miembros.
  const s = useMemo(() => familyStats(albums, personName), [albums, collection])
  const [sel, setSel] = useState<string | null>(null)
  const cur = sel ? s.rows.find((r) => r.key === sel) : undefined
  return (
    <Card id="nu-b4" eyebrow="B4 · En familia">
      <Lead>{s.lead || 'Todavía nadie ha agregado discos desde su cuenta.'}</Lead>
      {s.chart && (
        <>
          <HBars rows={s.rows.slice(0, 8)} selected={sel} onSelect={toggle(setSel)} />
          <Readout>{cur && <><b>{discos(cur.count)}</b> · {cur.label}</>}</Readout>
        </>
      )}
      {s.raters.length > 0 && (
        <div className="nu-kvs">
          {s.raters.map((r) => <span key={r.uid} className="nu-line15">{r.name} · {r.count} {r.count === 1 ? 'calificado' : 'calificados'} · promedio {r.avg.toFixed(1)}</span>)}
        </div>
      )}
      {s.without > 0 && <Notes><span className="nu-note">{s.without} sin dato de quién {s.without === 1 ? 'lo' : 'los'} agregó</span></Notes>}
    </Card>
  )
}
