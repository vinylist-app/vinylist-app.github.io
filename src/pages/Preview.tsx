import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Album, ReleaseCandidate, Track } from '../types'
import { addWish, cached, deleteWish } from '../db'
import { useAlbums, useWishlist } from '../data/hooks'
import { personName, useSession } from '../session'
import { discogsConfigured, getRelease, type ReleaseDetails } from '../api/discogs'
import { addCandidate } from '../lib/addFromCandidate'
import { matchInCollection, matchWishes } from '../lib/context/local'
import { totalMinutes } from '../lib/context/pure'
import { formatStars } from '../lib/rating'
import { purchaseDateLabel } from '../lib/text'
import { spotifySearchUrl } from '../lib/spotify'
import { loadVista, saveVista, vistaUrl, type VistaState } from '../lib/vistaState'
import { Cover } from '../components/AlbumCard'
import { CandidateList } from '../components/CandidateList'
import { BackIcon, DiscIcon, HeartIcon, SpotifyIcon } from '../components/Icons'
import { HeartFilledIcon, PlusIcon } from '../components/VistaIcons'
import { TeCuentaCard, useTeCuenta } from '../components/TeCuenta'
import { discRefOf } from '../components/AboutAlbum'
import '../styles/vista.css'

type DetailsState = 'idle' | 'loading' | 'done' | 'error'

/**
 * Vista previa: antes de agregar nada, la app compara el disco con la colección
 * y cuenta lo que sabe. Aquí se decide: agregarlo, ponerlo en Deseos o solo escucharlo.
 * Nunca se pide calificación en esta pantalla.
 */
export function Preview() {
  const { source = '', sourceId = '' } = useParams()
  const location = useLocation()
  const nav = useNavigate()
  const { person, collection } = useSession()
  const albums = useAlbums()
  const wishlist = useWishlist()

  // El candidato llega por el estado de la navegación; si se recargó la página, del respaldo.
  const state = useMemo<VistaState | undefined>(() => {
    const s = location.state as Partial<VistaState> | null
    if (s?.candidate) return { candidate: s.candidate, siblings: s.siblings, from: s.from }
    return loadVista(source, sourceId)
  }, [location.state, source, sourceId])
  const candidate = state?.candidate
  const siblings = useMemo(() => (state?.siblings?.length ? state.siblings : candidate ? [candidate] : []), [state, candidate])

  const [details, setDetails] = useState<ReleaseDetails | undefined>()
  const [detailsState, setDetailsState] = useState<DetailsState>('idle')
  const [adding, setAdding] = useState(false)
  const [wishBusy, setWishBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)

  // Ficha completa de Discogs: canciones, portada grande, master. Guardada 30 días.
  // El token de la familia llega con la sesión (tras recargar, después del primer render): se vuelve a intentar cuando aparece.
  useEffect(() => {
    setDetails(undefined)
    if (!candidate || candidate.source !== 'discogs' || !discogsConfigured()) { setDetailsState('idle'); return }
    let alive = true
    setDetailsState('loading')
    cached(`dg:release:${candidate.sourceId}`, 30, () => getRelease(Number(candidate.sourceId)))
      .then((d) => { if (alive) { setDetails(d); setDetailsState('done') } })
      .catch(() => { if (alive) setDetailsState('error') })
    return () => { alive = false }
  }, [candidate, collection?.discogsToken])

  // El candidato con lo que la ficha completa agregó.
  const merged = useMemo<ReleaseCandidate | undefined>(() => {
    if (!candidate) return undefined
    if (!details) return candidate
    return {
      ...candidate,
      title: details.title || candidate.title,
      artist: details.artist || candidate.artist,
      year: details.year ?? candidate.year,
      label: details.label ?? candidate.label,
      catalogNumber: details.catalogNumber ?? candidate.catalogNumber,
      country: details.country ?? candidate.country,
      format: details.format ?? candidate.format,
      barcode: details.barcode ?? candidate.barcode,
      coverUrl: details.coverUrl ?? candidate.coverUrl,
      thumbUrl: details.thumbUrl ?? candidate.thumbUrl,
      genres: details.genres.length ? details.genres : candidate.genres,
      styles: details.styles.length ? details.styles : candidate.styles,
      discogsMasterId: candidate.discogsMasterId ?? details.masterId,
    }
  }, [candidate, details])
  const tracklist: Track[] = details?.tracklist ?? []

  const disc = useMemo(() => (merged ? discRefOf(merged) : undefined), [merged])
  const owned = useMemo(() => (disc && albums ? matchInCollection(disc, albums) : undefined), [disc, albums])
  const wishes = useMemo(() => (disc && wishlist ? matchWishes(disc, wishlist) : []), [disc, wishlist])
  const myWish = wishes.find((w) => w.wantedBy === person.uid)
  const teCuenta = useTeCuenta(disc, albums, wishlist, { me: person.uid, alreadyOwned: Boolean(owned) })

  if (!candidate || !merged) {
    return (
      <main className="page vista">
        <div className="hero-nav">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => nav(-1)}><BackIcon width={20} height={20} /> Atrás</button>
        </div>
        <div className="empty">
          <h2>Vuelve a buscar el disco</h2>
          <p>Esta vista previa ya no tiene los datos del disco. Escanéalo o búscalo otra vez y lo volvemos a abrir.</p>
          <Link to="/buscar" className="btn btn--primary">Buscar</Link>
        </div>
      </main>
    )
  }

  const c = merged
  const editionIndex = siblings.findIndex((s) => s.source === c.source && s.sourceId === c.sourceId)
  const manyEditions = siblings.length > 1
  const backLabel = manyEditions ? 'Ediciones' : state?.from ?? 'Buscar'
  const spotify = spotifySearchUrl(c.artist, c.title)
  const discogsUrl = c.source === 'discogs' ? `https://www.discogs.com/release/${c.sourceId}` : undefined
  const minutes = totalMinutes(tracklist)
  const metaLine = [
    [c.label, c.year].filter(Boolean).join(' '),
    tracklist.length ? `${tracklist.length} ${tracklist.length === 1 ? 'canción' : 'canciones'}` : '',
    minutes ? `${minutes} min` : '',
  ].filter(Boolean).join(' · ')
  const tags = [...c.genres, ...c.styles.slice(0, 2)].filter(Boolean).slice(0, 4)
  const statusLabel = owned ? (owned.kind === 'same' ? 'Ya lo tienes' : 'Ya tienes otra edición') : myWish ? 'En tus deseos' : 'Aún no lo tienes'

  function back() {
    if (window.history.length > 1) nav(-1)
    else nav(state?.from === 'Escanear' ? '/escanear' : '/buscar')
  }

  async function add() {
    if (adding) return
    setAdding(true)
    setError(null)
    try {
      const album = await addCandidate(c)
      // Si quien lo quería era yo, sale de Deseos; la ficha lo avisa y ofrece deshacerlo.
      if (myWish) await deleteWish(myWish.id)
      nav(`/album/${album.id}`, { replace: true, state: { justAdded: true, removedWish: myWish, from: state?.from } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar. Intenta de nuevo.')
      setAdding(false)
    }
  }

  async function toggleWish() {
    if (wishBusy) return
    setWishBusy(true)
    setError(null)
    try {
      if (myWish) await deleteWish(myWish.id)
      else await addWish({ title: c.title, artist: c.artist, year: c.year, coverUrl: c.coverUrl ?? c.thumbUrl, thumbUrl: c.thumbUrl, discogsId: c.source === 'discogs' ? Number(c.sourceId) : undefined, discogsMasterId: c.discogsMasterId, musicbrainzReleaseGroupId: c.musicbrainzReleaseGroupId, barcode: c.barcode })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el deseo.')
    } finally {
      setWishBusy(false)
    }
  }

  function changeEdition(next: ReleaseCandidate) {
    setSheet(false)
    const s: VistaState = { candidate: next, siblings, from: state?.from }
    saveVista(s)
    nav(vistaUrl(next), { replace: true, state: s })
  }

  return (
    <main className="page vista">
      <div className="hero-nav">
        <button type="button" className="btn btn--sm btn--ghost" onClick={back}><BackIcon width={20} height={20} /> {backLabel}</button>
        <button type="button" className="icon-btn icon-btn--ghost" aria-label={myWish ? 'Quitar de mis deseos' : 'Agregar a mis deseos'} aria-pressed={Boolean(myWish)} onClick={toggleWish} disabled={wishBusy} style={{ color: 'var(--accent)' }}>
          {myWish ? <HeartFilledIcon /> : <HeartIcon />}
        </button>
      </div>

      <header className="vista-head">
        <Cover src={c.coverUrl ?? c.thumbUrl} title={c.title} className="vista-cover" />
        <div className="vista-head__text">
          <span className="badge">{statusLabel}</span>
          <h2>{c.title}</h2>
          <span className="muted" style={{ fontSize: 15 }}>{[c.artist, c.year].filter(Boolean).join(' · ')}</span>
          {tags.length > 0 && <div className="vista-tags">{tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
          {metaLine && <span className="vista-meta">{metaLine}</span>}
        </div>
      </header>

      {owned && (
        <div className="notice vista-owned">
          <span>{ownedLine(owned.album, owned.kind, person.uid)}</span>
          <Link to={`/album/${owned.album.id}`} state={{ from: 'Vista previa' }} className="btn btn--sm">Ver mi copia</Link>
        </div>
      )}

      {manyEditions && (
        <button type="button" className="chip vista-edition" onClick={() => setSheet(true)} aria-haspopup="dialog">
          {[`Edición ${editionIndex + 1} de ${siblings.length}`, [c.country, c.year].filter(Boolean).join(' '), c.catalogNumber].filter(Boolean).join(' · ')} · <b>Cambiar</b>
        </button>
      )}

      {error && <div className="notice notice--error" role="alert">{error}</div>}

      <TeCuentaCard data={teCuenta} />

      {detailsState === 'loading' && <span className="vista-note" role="status" aria-live="polite">Cargando la ficha completa…</span>}
      {detailsState === 'error' && <span className="vista-note">No pude cargar la ficha completa. Te muestro lo que encontré.</span>}

      {tracklist.length > 0 && (
        <section className="stack" aria-labelledby="vista-tracks-h">
          <h3 id="vista-tracks-h" className="eyebrow">Canciones</h3>
          {tracklist.map((t, i) => (
            <div className="track" key={`${t.position}-${i}`}><span>{t.position}</span><span>{t.title}</span><span>{t.duration}</span></div>
          ))}
        </section>
      )}
      {tracklist.length === 0 && c.source === 'musicbrainz' && <span className="vista-note">No tengo las canciones de esta edición.</span>}

      <section className="stack" aria-labelledby="vista-edition-h">
        <h3 id="vista-edition-h" className="eyebrow">Datos de la edición</h3>
        <div className="facts facts--rows">
          {([
            ['Sello', c.label],
            ['Catálogo', c.catalogNumber],
            ['País', c.country],
            ['Formato', c.format],
            ['Código de barras', c.barcode],
            ['Año', c.year ? String(c.year) : undefined],
          ] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
            <div className="fact" key={k}><span>{k}</span><span className={k === 'Catálogo' || k === 'Código de barras' ? 'mono' : undefined}>{v}</span></div>
          ))}
        </div>
      </section>

      <div className="stack" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span className="eyebrow">Fuentes</span>
        <span className="vista-note">{sourcesLine(c.source, teCuenta.sources)}</span>
        {discogsUrl && <a className="btn btn--sm" href={discogsUrl} target="_blank" rel="noreferrer"><DiscIcon width={18} height={18} /> Ver en Discogs</a>}
      </div>

      <div className="vista-bar">
        <div className="vista-bar__inner">
          {owned ? (
            <Link to={`/album/${owned.album.id}`} state={{ from: 'Vista previa' }} className="btn btn--primary">Ver mi copia</Link>
          ) : (
            <button type="button" className="btn btn--primary" onClick={add} disabled={adding}><PlusIcon width={20} height={20} /> {adding ? 'Agregando…' : 'Agregar a mi colección'}</button>
          )}
          <div className="vista-bar__row">
            {owned ? (
              <button type="button" className="btn" onClick={add} disabled={adding}>{adding ? 'Agregando…' : 'Agregar otra copia'}</button>
            ) : (
              <button type="button" className={`btn ${myWish ? 'vista-on' : ''}`} onClick={toggleWish} disabled={wishBusy} aria-pressed={Boolean(myWish)}>
                {myWish ? <HeartFilledIcon width={18} height={18} /> : <HeartIcon width={18} height={18} />} {myWish ? 'En tus deseos' : 'Lo quiero'}
              </button>
            )}
            <a className="btn" href={spotify} target="_blank" rel="noreferrer"><SpotifyIcon width={18} height={18} className="spotify" /> Escuchar<span className="visually-hidden"> «{c.title}» en Spotify</span></a>
          </div>
        </div>
      </div>

      {sheet && (
        <div className="sheet" onClick={() => setSheet(false)}>
          <div className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="vista-sheet-h" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" />
            <h2 id="vista-sheet-h">¿Cuál edición tienes en la mano?</h2>
            <CandidateList candidates={siblings} onPick={changeEdition} pickLabel="Es esta" currentId={c.sourceId} />
            <button type="button" className="btn" onClick={() => setSheet(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </main>
  )
}

/** "Ya lo tienes: lo agregaste el 12 mar 2026 · 4.5 estrellas" (o quién de la familia lo tiene, con SU calificación). */
function ownedLine(album: Pick<Album, 'addedAt' | 'addedBy' | 'rating' | 'ratings'>, kind: 'same' | 'other', me: string): string {
  const date = purchaseDateLabel(album.addedAt)
  const other = album.addedBy && album.addedBy !== me ? personName(album.addedBy) : undefined
  // `rating` es la de quien mira; la de otra persona está en `ratings` por uid.
  const rating = other ? album.ratings?.[album.addedBy!]?.rating : album.rating
  const stars = rating ? `${formatStars(rating)} ${formatStars(rating) === '1' ? 'estrella' : 'estrellas'}` : 'Sin calificar'
  const what = kind === 'same' ? 'lo' : 'otra edición'
  if (other) return kind === 'same' ? `Ya lo tiene ${other}: lo agregó el ${date} · ${stars}` : `${other} ya tiene otra edición: la agregó el ${date} · ${stars}`
  return kind === 'same' ? `Ya lo tienes: lo agregaste el ${date} · ${stars}` : `Ya tienes ${what}: la agregaste el ${date} · ${stars}`
}

/** "Datos e imagen de Discogs · Contexto de Wikipedia y MusicBrainz". */
function sourcesLine(source: ReleaseCandidate['source'], contextSources: string[]): string {
  const data = source === 'discogs' ? 'Datos e imagen de Discogs' : 'Datos de MusicBrainz e imagen de Cover Art Archive'
  const ctx = contextSources.filter((s) => s !== 'tu colección' && s !== (source === 'discogs' ? 'Discogs' : 'MusicBrainz'))
  return ctx.length ? `${data} · Contexto de ${ctx.join(', ').replace(/, ([^,]*)$/, ' y $1')}` : data
}
