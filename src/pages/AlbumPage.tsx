import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addWish, db, deleteAlbum, updateAlbum } from '../db'
import { personName, useSession } from '../session'
import { StarRating } from '../components/StarRating'
import { RateSheet } from '../components/RateSheet'
import { Sheet } from '../components/Sheet'
import { AboutAlbum } from '../components/AboutAlbum'
import { Cover } from '../components/AlbumCard'
import { BackIcon, DiscIcon, SpotifyIcon, StarPath } from '../components/Icons'
import { formatStars } from '../lib/rating'
import { averageOf, formatAverage } from '../lib/starSlider'
import { priceLabel, purchaseDateLabel } from '../lib/text'
import { resolveSpotifyAlbumId, spotifyUrlFor } from '../lib/spotifyLink'
import { CONDITIONS, type Album, type Condition, type WishlistItem } from '../types'
import '../styles/calificar.css'

/** Lo que manda quien abre la ficha (la vista previa): si acaba de agregar el disco, qué deseo quitó y de dónde venía. */
interface EntryState {
  justAdded?: boolean
  /** El deseo propio que se quitó al agregar, para poder devolverlo con "Deshacer". */
  removedWish?: WishlistItem
  /** Rótulo del botón de regreso ("Escanear", "Buscar", "Vista previa"); sin él, "Colección". */
  from?: string
}

/** Ficha del disco (pantalla 7): portada, calificación, datos de tu copia, canciones y enlaces. */
export function AlbumPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  // undefined = cargando; null = ya no está (otra persona de la familia pudo quitarlo mientras lo veías).
  const album = useLiveQuery(async () => (await db.albums.get(id)) ?? null, [id])
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(false)
  const [entry, setEntry] = useState<EntryState>(() => (location.state as EntryState | null) ?? {})
  const [undoError, setUndoError] = useState<string | null>(null)
  const justAdded = Boolean(entry.justAdded)

  useEffect(() => {
    if (!justAdded) return
    // Se limpia el aviso del estado de la ruta (se conserva de dónde se venía) para que no vuelva al regresar a esta pantalla.
    nav(location.pathname, { replace: true, state: entry.from ? { from: entry.from } : null })
    // El aviso se va solo; con "Deshacer" dura más, para alcanzar a tocarlo.
    const t = setTimeout(() => setEntry((e) => ({ ...e, justAdded: false, removedWish: undefined })), entry.removedWish ? 6000 : 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justAdded])

  /** Devuelve a Deseos el que se quitó al agregar (el mismo disco, con los mismos datos). */
  async function undoWish() {
    const w = entry.removedWish
    if (!w) return
    setEntry((e) => ({ ...e, justAdded: false, removedWish: undefined }))
    try {
      await addWish({ title: w.title, artist: w.artist, year: w.year, coverUrl: w.coverUrl, thumbUrl: w.thumbUrl, discogsId: w.discogsId, discogsMasterId: w.discogsMasterId, musicbrainzReleaseGroupId: w.musicbrainzReleaseGroupId, barcode: w.barcode })
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : 'No pude devolverlo a tus deseos.')
    }
  }

  // Busca una sola vez el ID exacto de Spotify; la ficha se actualiza sola cuando llega.
  useEffect(() => {
    if (album) void resolveSpotifyAlbumId(album)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album?.id, album?.spotifyCheckedAt])

  if (album === undefined) return <main className="page"><p className="muted">Cargando…</p></main>
  if (album === null) return <main className="page"><p>Este disco ya no está en la colección.</p><Link to="/" className="btn">Volver</Link></main>

  const spotify = spotifyUrlFor(album)
  const discogs = album.discogsId ? `https://www.discogs.com/release/${album.discogsId}` : undefined

  return (
    <main className="page">
      <div className="hero-nav">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => nav(-1)}><BackIcon width={20} height={20} /> {entry.from ?? 'Colección'}</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(true)}>Editar</button>
      </div>
      {justAdded && (
        <div className="notice cal-notice" role="status">
          {entry.removedWish ? (
            <>Agregado. Lo quité de tus deseos · <button type="button" className="btn btn--sm btn--link" style={{ color: 'inherit', minHeight: 36, padding: '4px 6px' }} onClick={undoWish}>Deshacer</button></>
          ) : 'Listo, ya está en tu colección'}
        </div>
      )}
      {undoError && <div className="notice notice--error" role="alert">{undoError}</div>}
      <div className="hero">
        <Cover src={album.coverUrl ?? album.thumbUrl} title={album.title} className="hero__img" />
      </div>

      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ fontSize: 28 }}>{album.title}</h1>
        <span className="muted" style={{ fontSize: 15 }}>{[album.artist, album.year].filter(Boolean).join(' · ')}</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {[...album.genres, ...album.styles.slice(0, 2), album.format, album.country].filter(Boolean).map((t) => <span className="tag" key={t}>{t}</span>)}
        </div>
      </div>

      <section className="stack" style={{ gap: 6 }} aria-labelledby="rating-h">
        <RatingRow album={album} onOpen={() => setRating(true)} />
        <FamilyAverage album={album} />
      </section>

      <CopyFacts album={album} onComplete={() => setEditing(true)} />

      {album.notes && <p className="card" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{album.notes}</p>}

      {album.tracklist.length > 0 && (
        <section className="stack" aria-labelledby="tracks-h">
          <h3 id="tracks-h" className="eyebrow">Canciones</h3>
          <div className="cal-tracks">
            {album.tracklist.map((t, i) => (
              <div className="track" key={`${t.position}-${i}`}><span>{t.position}</span><span>{t.title}</span><span>{t.duration}</span></div>
            ))}
          </div>
        </section>
      )}

      <AboutSection album={album} />

      <div className="album-actions">
        <a className="btn btn--sm" href={spotify} target="_blank" rel="noreferrer"><SpotifyIcon width={18} height={18} className="spotify" /> Escuchar en Spotify</a>
        {discogs && <a className="btn btn--sm btn--primary" href={discogs} target="_blank" rel="noreferrer"><DiscIcon width={18} height={18} /> Ver en Discogs</a>}
      </div>
      <button type="button" className="btn btn--sm btn--link" style={{ alignSelf: 'center' }} onClick={async () => { if (confirm(`¿Quitar "${album.title}" de la colección?`)) { await deleteAlbum(album.id); nav('/', { replace: true }) } }}>Quitar de la colección</button>

      {editing && <EditSheet album={album} onClose={() => setEditing(false)} />}
      {rating && <RateSheet album={album} onClose={() => setRating(false)} />}
    </main>
  )
}

/**
 * "Sobre el disco": la misma tarjeta "Te cuenta" de la vista previa, plegada para no
 * alargar la ficha ni consultar las fuentes hasta que la persona quiera leerla.
 * Aquí no hay veredicto ni líneas de "en tu colección": el disco ya es tuyo.
 */
function AboutSection({ album }: { album: Album }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="stack" style={{ gap: 8 }} aria-labelledby="about-h">
      <button type="button" className="cal-row" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="about-body">
        <span className="cal-row__body cal-row__body--grow">
          <span id="about-h" className="eyebrow">Sobre el disco</span>
          <span className="cal-row__text">{open ? 'Lo que cuentan tu colección y las fuentes' : 'Historia, discografía y qué tan conocido es'}</span>
        </span>
        <span aria-hidden="true" className={`cal-row__chevron ${open ? 'cal-row__chevron--open' : ''}`}>›</span>
      </button>
      {open && <div id="about-body"><AboutAlbum album={album} /></div>}
    </section>
  )
}

/** Fila "Tu calificación": toda la fila abre la hoja para calificar deslizando. */
function RatingRow({ album, onOpen }: { album: Album; onOpen: () => void }) {
  const has = Boolean(album.rating)
  return (
    <button type="button" className="cal-row" onClick={onOpen} aria-describedby="rating-text">
      <span className={`cal-row__disc ${has ? 'cal-row__disc--on' : ''}`} aria-hidden="true">
        <svg width={26} height={26} viewBox="0 0 24 24" fill={has ? 'var(--star)' : 'none'} stroke="var(--star-empty)" strokeWidth={1.5} strokeLinejoin="round"><StarPath /></svg>
      </span>
      <span className="cal-row__body">
        <span id="rating-h" className="eyebrow">Tu calificación · opcional</span>
        <StarRating value={album.rating} size={24} />
        <span id="rating-text" className="cal-row__text">{has ? `${formatStars(album.rating)} / 5 · Desliza para cambiarla` : 'Sin calificar. Califícalo cuando quieras.'}</span>
      </span>
    </button>
  )
}

/** Promedio de la familia, solo cuando calificaron dos personas o más. */
function FamilyAverage({ album }: { album: Album }) {
  // Se suscribe a la sesión para que los nombres se actualicen si cambian los miembros.
  useSession()
  const { avg, count } = averageOf(album.ratings)
  if (count < 2) return null
  const people = Object.entries(album.ratings ?? {})
    .filter(([, r]) => r.rating >= 1 && r.rating <= 10)
    .sort((a, b) => b[1].rating - a[1].rating)
    .map(([uid, r]) => `${personName(uid)} ${formatStars(r.rating)}`)
  return (
    <div className="cal-family">
      <span>Promedio de la familia <b>{formatAverage(avg)}</b> · {count} calificaciones</span>
      {people.length > 0 && <span>{people.join(' · ')}</span>}
    </div>
  )
}

/** Datos de tu copia: solo las filas con dato. Si falta algo, una fila para completarlo. */
function CopyFacts({ album, onComplete }: { album: Album; onComplete: () => void }) {
  const rows: { label: string; value: string; mono?: boolean }[] = []
  if (album.mediaCondition && album.sleeveCondition) rows.push({ label: 'Estado disco / funda', value: `${album.mediaCondition} / ${album.sleeveCondition}` })
  else if (album.mediaCondition) rows.push({ label: 'Estado del disco', value: album.mediaCondition })
  else if (album.sleeveCondition) rows.push({ label: 'Estado de la funda', value: album.sleeveCondition })
  if (album.location) rows.push({ label: 'Ubicación', value: album.location })
  const purchase = [album.purchaseDate && purchaseDateLabel(album.purchaseDate), album.purchasePrice !== undefined ? priceLabel(album.purchasePrice) : undefined, album.purchasePlace].filter(Boolean).join(' · ')
  if (purchase) rows.push({ label: 'Compra', value: purchase })
  if (album.label || album.catalogNumber) rows.push({ label: 'Edición', value: [album.label, album.year, album.catalogNumber].filter(Boolean).join(' · ') })
  if (album.barcode) rows.push({ label: 'Código', value: album.barcode, mono: true })

  const incomplete = !album.mediaCondition || !album.sleeveCondition || !album.location || !purchase
  if (rows.length === 0 && !incomplete) return null

  return (
    <div className="facts facts--rows cal-facts">
      {rows.map((r) => (
        <div className="fact" key={r.label}><span>{r.label}</span><span className={r.mono ? 'mono' : undefined}>{r.value}</span></div>
      ))}
      {incomplete && (
        <button type="button" className="fact cal-fact-btn" onClick={onComplete}><span>Completar datos de tu copia</span><span aria-hidden="true">›</span></button>
      )}
    </div>
  )
}

function EditSheet({ album, onClose }: { album: Album; onClose: () => void }) {
  const [f, setF] = useState({
    mediaCondition: album.mediaCondition ?? '',
    sleeveCondition: album.sleeveCondition ?? '',
    location: album.location ?? '',
    purchaseDate: album.purchaseDate ?? '',
    purchasePrice: album.purchasePrice?.toString() ?? '',
    purchasePlace: album.purchasePlace ?? '',
    notes: album.notes ?? '',
  })
  async function save() {
    await updateAlbum(album.id, {
      mediaCondition: (f.mediaCondition || undefined) as Condition | undefined,
      sleeveCondition: (f.sleeveCondition || undefined) as Condition | undefined,
      location: f.location || undefined,
      purchaseDate: f.purchaseDate || undefined,
      purchasePrice: f.purchasePrice ? Number(f.purchasePrice) : undefined,
      purchasePlace: f.purchasePlace || undefined,
      notes: f.notes || undefined,
    })
    onClose()
  }
  const condSelect = (key: 'mediaCondition' | 'sleeveCondition', label: string) => (
    <label className="field"><span>{label}</span>
      <select className="select" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
        <option value="">Sin indicar</option>
        {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.value} · {c.label}</option>)}
      </select>
    </label>
  )
  return (
    <Sheet onClose={onClose} labelledBy="edit-sheet-h">
      <form className="stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save() }}>
        <h2 id="edit-sheet-h">Datos de tu copia</h2>
        <div className="facts">
          {condSelect('mediaCondition', 'Estado del disco')}
          {condSelect('sleeveCondition', 'Estado de la funda')}
        </div>
        <label className="field"><span>Dónde está guardado</span><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Repisa 2, caja B" /></label>
        <div className="facts">
          <label className="field"><span>Fecha de compra</span><input className="input" type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} /></label>
          <label className="field"><span>Precio</span><input className="input" inputMode="decimal" value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: e.target.value })} placeholder="0" /></label>
        </div>
        <label className="field"><span>Dónde lo compraste</span><input className="input" value={f.purchasePlace} onChange={(e) => setF({ ...f, purchasePlace: e.target.value })} placeholder="Tienda o sitio" /></label>
        <label className="field"><span>Notas</span><textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <div className="row">
          <button type="button" className="btn grow" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary grow">Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}
