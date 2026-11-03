import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAlbums } from '../data/hooks'
import { personName, useSession } from '../session'
import { Logo } from '../components/Logo'
import { BackIcon } from '../components/Icons'
import { ChevronIcon } from '../components/CuentaIcons'
import { Sheet } from '../components/Sheet'
import { Cover } from '../components/AlbumCard'
import { StarRating } from '../components/StarRating'
import { Columns, HBars, Meter, Readout, SegBar, segFill, type ColDatum } from '../components/NumerosFiguras'
import { artistStats, copyStats, decadeStats, discos, familyStats, growthStats, heroStats, labelStats, moneyStats, pct, starStats, tagStats, yearsOf, type Bucket, type CondStats, type Extreme } from '../lib/stats'
import { decadeLabel, priceLabel } from '../lib/text'
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

export function Numeros() {
  const loaded = useAlbums()
  const albums = loaded ?? []
  const n = albums.length
  const { collection } = useSession()
  const family = Boolean(collection && Object.keys(collection.members).length >= 2)

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
        <>
          <Hero albums={albums} />
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
        </>
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

function More({ n, onClick }: { n: number; onClick: () => void }) {
  return <button type="button" className="nu-more" onClick={onClick}>y {n} más · <b>Ver todos ›</b></button>
}

/** Fila fija que lleva a la ficha: "El más viejo: Kind of Blue · Miles Davis · 1959 ›". */
function FixedLine({ k, album, value }: { k: string; album: Album; value: string }) {
  return (
    <Link to={`/album/${album.id}`} className="nu-line">
      <span className="nu-line__k">{k}</span>
      <span className="nu-line__v">{value}</span>
      <ChevronIcon className="nu-line__chev" width={18} height={18} />
    </Link>
  )
}

function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="nu-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? 'chip--on' : ''}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
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
        <span className="nu-hero__n"><span className="nu-hero__ghost" aria-hidden="true">{h.n}</span><span>{shown}</span></span>
        <span className="nu-hero__unit">{h.n === 1 ? 'disco' : 'discos'}</span>
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
  const [sel, setSel] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const shown = s.rows.slice(0, 8)
  const rest = s.rows.length - shown.length
  const cur = sel ? s.rows.find((r) => r.key === sel) : undefined
  return (
    <Card id="nu-a1" eyebrow="A1 · Artistas">
      <Lead>{s.lead}</Lead>
      {s.chart && (
        <>
          <HBars rows={shown} selected={sel} onSelect={toggle(setSel)} />
          <Readout>{cur && <><b>{discos(cur.count)}</b> · {cur.label} · {pct(cur.count, albums.length)}% de tu colección · <Link to={q(cur.label)}>Ver en la colección ›</Link></>}</Readout>
          {rest > 0 && <More n={rest} onClick={() => setAll(true)} />}
        </>
      )}
      {s.various > 0 && <Notes><span className="nu-note">{s.various} de varios artistas no {s.various === 1 ? 'cuenta' : 'cuentan'} aquí</span></Notes>}
      {all && <AllSheet title="Artistas" sub={`${s.rows.length} artistas · ${discos(albums.length)}`} rows={s.rows} total={albums.length} hrefOf={(r) => q(r.label)} foot={s.various > 0 ? { label: 'Varios artistas', count: s.various } : undefined} onClose={() => setAll(false)} />}
    </Card>
  )
}

/* ---------- A2 · De qué año son ---------- */

function extremeText(e: Extreme): string {
  const a = e.album
  return `${a.title} · ${a.artist} · ${a.year}${e.more > 0 ? ` · y ${e.more} más de ese año` : ''}`
}

function Anos({ albums }: { albums: Album[] }) {
  const s = useMemo(() => decadeStats(albums), [albums])
  const [dec, setDec] = useState<string | null>(s.top !== undefined ? String(s.top) : null)
  const [year, setYear] = useState<string | null>(null)
  useEffect(() => { setDec(s.top !== undefined ? String(s.top) : null); setYear(null) }, [s.top])
  const decade = dec !== null ? Number(dec) : null
  const years = useMemo(() => (decade !== null ? yearsOf(albums, decade) : []), [albums, decade])

  const decCols: ColDatum[] = s.decades.map((d) => ({ key: String(d.value), tick: d.tick, count: d.count, name: decadeLabel(d.value) }))
  const yearCols: ColDatum[] = years.map((y) => ({ key: String(y.value), tick: y.tick, count: y.count, name: String(y.value) }))
  const curDec = decade !== null ? s.decades.find((d) => d.value === decade) : undefined
  const curYear = year !== null ? years.find((y) => String(y.value) === year) : undefined

  return (
    <Card id="nu-a2" eyebrow="A2 · De qué año son">
      <Lead>{s.lead}</Lead>
      {s.chart && (
        <>
          <Columns cols={decCols} selected={dec} onSelect={(k) => { setYear(null); setDec((p) => (p === k ? null : k)) }} label="Discos por década" />
          {decade !== null && (
            <div key={decade} className="nu-xfade nu-years">
              <span className="nu-years__k">Por año · {decadeLabel(decade)}</span>
              <Columns cols={yearCols} selected={year} onSelect={toggle(setYear)} label={`Discos por año, ${decadeLabel(decade)}`} />
            </div>
          )}
          <Readout>
            {curYear
              ? <><b>{discos(curYear.count)}</b> · {curYear.value} · <Link to={q(String(curYear.value))}>Ver en la colección ›</Link></>
              : curDec && <><b>{discos(curDec.count)}</b> · {decadeLabel(curDec.value)} · {pct(curDec.count, albums.length)}% · <Link to={`/?decada=${curDec.value}`}>Ver en la colección ›</Link></>}
          </Readout>
        </>
      )}
      {s.oldest && s.newest && (
        <div className="nu-lines">
          <FixedLine k="El más viejo" album={s.oldest.album} value={extremeText(s.oldest)} />
          <FixedLine k="El más nuevo" album={s.newest.album} value={extremeText(s.newest)} />
        </div>
      )}
      {s.without > 0 && <Notes><span className="nu-note">{s.without === 1 ? '1 disco sin año no entra aquí' : `${s.without} discos sin año no entran aquí`}</span></Notes>}
    </Card>
  )
}

/* ---------- A3 · Géneros · Estilos ---------- */

function Generos({ albums }: { albums: Album[] }) {
  const g = useMemo(() => tagStats(albums, 'genres'), [albums])
  const st = useMemo(() => tagStats(albums, 'styles'), [albums])
  const [view, setView] = useState<'genres' | 'styles'>('genres')
  const [sel, setSel] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const chips = g.rows.length > 0 && st.rows.length > 0
  const s = view === 'genres' ? g : st
  const limit = view === 'genres' ? 6 : 8
  const shown = s.rows.slice(0, limit)
  const rest = s.rows.length - shown.length
  const cur = sel ? s.rows.find((r) => r.key === sel) : undefined
  const word = view === 'genres' ? 'género' : 'estilo'
  const title = view === 'genres' ? 'Géneros' : 'Estilos'
  const href = (r: Bucket) => `/?genero=${encodeURIComponent(r.raw ?? r.label)}`

  return (
    <Card id="nu-a3" eyebrow="A3 · Géneros · Estilos" aside={chips && <Chips value={view} options={[{ value: 'genres', label: 'Géneros' }, { value: 'styles', label: 'Estilos' }]} onChange={(v) => { setView(v); setSel(null) }} label="Vista" />}>
      <div key={view} className="nu-xfade nu-card__body">
        <Lead>{s.lead}</Lead>
        {s.chart && (
          <>
            <HBars rows={shown} selected={sel} onSelect={toggle(setSel)} />
            <Readout>{cur && <><b>{discos(cur.count)}</b> · {cur.label} · {pct(cur.count, albums.length)}% de tu colección · <Link to={href(cur)}>Ver en la colección ›</Link></>}</Readout>
            {rest > 0 && <More n={rest} onClick={() => setAll(true)} />}
          </>
        )}
        {g.rows.length > 0 && (
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
              <Link key={a.id} to={`/album/${a.id}`} className="nu-best__item" aria-label={`${a.title}, ${a.artist}`}>
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
  const [sel, setSel] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const shown = s.rows.slice(0, 6)
  const rest = s.rows.length - shown.length
  const cur = sel ? s.rows.find((r) => r.key === sel) : undefined
  return (
    <Card id="nu-a5" eyebrow="A5 · Sellos">
      <Lead>{s.lead}</Lead>
      {s.chart && (
        <>
          <HBars rows={shown} selected={sel} onSelect={toggle(setSel)} />
          <Readout>{cur && <><b>{discos(cur.count)}</b> · {cur.label} · {pct(cur.count, albums.length)}% · <Link to={q(cur.label)}>Ver en la colección ›</Link></>}</Readout>
          {rest > 0 && <More n={rest} onClick={() => setAll(true)} />}
        </>
      )}
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
      <span className="nu-sub">{s.sub}</span>
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

function Condicion({ c, total, view }: { c: CondStats; total: number; view: string }) {
  const [sel, setSel] = useState<string | null>(null)
  const segs = c.blocks.map((b) => ({ key: b.key, label: b.label, count: b.count, step: b.step, text: b.step > 0 ? `${pct(b.count, total)}%` : '' }))
  const cur = sel ? c.blocks.find((b) => b.key === sel) : undefined
  const visible = c.blocks.filter((b) => b.count > 0)
  return (
    <div key={view} className="nu-xfade nu-card__body">
      <Lead>{c.lead}</Lead>
      {c.enough && (
        <>
          <SegBar segs={segs} selected={sel} onSelect={toggle(setSel)} label={`Estado ${view === 'media' ? 'del disco' : 'de la funda'}`} describe={(s) => (s.step > 0 ? `${s.label}, ${discos(s.count)}, ${pct(s.count, c.withData)}% de los que tienen estado` : `Sin dato, ${discos(s.count)}`)} />
          <ul className="nu-legend">
            {visible.map((b) => <li key={b.key}><i style={{ background: segFill(b.step) }} />{b.label}</li>)}
          </ul>
          <Readout>{cur && (cur.step > 0 ? <><b>{discos(cur.count)}</b> · {cur.label} · {pct(cur.count, c.withData)}% de los que tienen estado</> : <><b>{discos(cur.count)}</b> · sin dato</>)}</Readout>
        </>
      )}
    </div>
  )
}

function Copias({ albums }: { albums: Album[] }) {
  const s = useMemo(() => copyStats(albums), [albums])
  const [view, setView] = useState<'media' | 'sleeve'>('media')
  const c = view === 'media' ? s.media : s.sleeve
  return (
    <Card id="nu-b2" eyebrow="B2 · Tus copias" aside={s.anySleeve && <Chips value={view} options={[{ value: 'media', label: 'Disco' }, { value: 'sleeve', label: 'Funda' }]} onChange={setView} label="Condición de" />}>
      <Condicion key={view} c={c} total={albums.length} view={view} />
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
  const [sel, setSel] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const shown = s.places.slice(0, 5)
  const rest = s.places.length - shown.length
  const cur = sel ? s.places.find((r) => r.key === sel) : undefined
  const withPlace = s.places.reduce((a, r) => a + r.count, 0)
  return (
    <Card id="nu-b3" eyebrow="B3 · Lo que llevas invertido">
      <Lead>{s.lead}</Lead>
      {s.priced > 0 && (
        <>
          {s.top && s.top.purchasePrice !== undefined && <div className="nu-lines"><FixedLine k="El más caro" album={s.top} value={`${s.top.title} · ${s.top.artist} · ${priceLabel(s.top.purchasePrice)}`} /></div>}
          {s.places.length > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">Dónde compras</span>
              {s.placesChart ? (
                <>
                  <HBars rows={shown} selected={sel} onSelect={toggle(setSel)} />
                  <Readout>{cur && <><b>{discos(cur.count)}</b> · {cur.label}</>}</Readout>
                  {rest > 0 && <More n={rest} onClick={() => setAll(true)} />}
                </>
              ) : (
                <span className="nu-line15">{s.places.map((p) => `${p.label} ${p.count}`).join(' · ')}</span>
              )}
            </div>
          )}
          {s.withoutPrice > 0 && <Notes><span className="nu-note">{s.withoutPrice} sin precio</span></Notes>}
        </>
      )}
      {all && <AllSheet title="Dónde compras" sub={`${s.places.length} lugares · ${discos(withPlace)}`} rows={s.places} total={albums.length} foot={albums.length - withPlace > 0 ? { label: 'Sin lugar', count: albums.length - withPlace } : undefined} onClose={() => setAll(false)} />}
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
