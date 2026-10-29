import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addWish, deleteWish } from '../db'
import { useAlbums, useWishlist } from '../data/hooks'
import { buildProfile } from '../lib/taste/profile'
import { rankCandidates, type Suggestion } from '../lib/taste/rank'
import { generateCandidates, type CandidateRun, type Progress } from '../lib/taste/candidates'
import { albumKey, decadeLabel } from '../lib/text'
import { spotifySearchUrl } from '../lib/spotify'
import { Cover } from '../components/AlbumCard'
import { SpotifyIcon } from '../components/Icons'
import { Logo } from '../components/Logo'

const OFFLINE_MSG = 'Sin conexión. Revisa el internet e intenta de nuevo.'

function ageLabel(iso?: string): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5)
  if (days < 1) return null
  return days === 1 ? 'Datos de ayer' : `Datos de hace ${days} días`
}

export function ForYou() {
  const albums = useAlbums()
  const wishlist = useWishlist() ?? []
  const profile = useMemo(() => buildProfile(albums ?? []), [albums])
  const wishedKeys = useMemo(() => new Set(wishlist.map((w) => albumKey(w.artist, w.title))), [wishlist])
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [lastRun, setLastRun] = useState<Pick<CandidateRun, 'dataFrom' | 'usedStale'> | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const signature = profile.topArtists.slice(0, 5).map((a) => a.key).join(',')
  const hasSeeds = profile.topArtists.length > 0

  const run = useCallback(async (force: boolean) => {
    if (controller.current || !hasSeeds) return
    if (force && typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError(OFFLINE_MSG)
      return
    }
    const ctl = new AbortController()
    controller.current = ctl
    setError(null)
    try {
      const result = await generateCandidates(profile, setProgress, force, ctl.signal)
      if (ctl.signal.aborted) return
      setSuggestions(rankCandidates(profile, result.candidates, wishedKeys))
      setLastRun({ dataFrom: result.dataFrom, usedStale: result.usedStale })
      if (!result.candidates.length) setError('No encontré sugerencias todavía. Revisa la conexión o intenta más tarde.')
    } catch (e) {
      console.error(e)
      if (!ctl.signal.aborted) setError('No se pudieron cargar las sugerencias. Intenta más tarde.')
    } finally {
      setProgress(null)
      if (controller.current === ctl) controller.current = null
    }
  }, [profile, wishedKeys, hasSeeds])

  useEffect(() => {
    if (albums && hasSeeds) run(false)
    // Se recalcula cuando cambian los artistas favoritos, no en cada render.
    // Al salir de la pantalla se cancela lo que falte para no gastar consultas.
    return () => {
      controller.current?.abort()
      controller.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, albums === undefined])

  async function toggleWish(s: Suggestion) {
    const existing = wishlist.find((w) => albumKey(w.artist, w.title) === s.key)
    if (existing) await deleteWish(existing.id)
    else await addWish({ title: s.title, artist: s.artist, year: s.year, coverUrl: s.coverUrl ?? s.thumbUrl, thumbUrl: s.thumbUrl, discogsMasterId: s.discogsMasterId, musicbrainzReleaseGroupId: s.musicbrainzReleaseGroupId })
  }

  if (albums === undefined) return <main className="page"><p className="muted">Cargando…</p></main>

  const age = ageLabel(lastRun?.dataFrom)

  return (
    <main className="page">
      <div className="stack" style={{ gap: 8 }}>
        <Logo />
        <h1>Para ti</h1>
        <span className="muted">Según tus calificaciones y lo que has comprado</span>
      </div>

      {profile.confidence === 'none' ? (
        <div className="empty">
          <h2>Primero, unos discos</h2>
          <p>Agrega y califica algunos vinilos; aquí te diremos qué escuchar después y por qué.</p>
          <Link to="/escanear" className="btn btn--primary">Escanear un disco</Link>
        </div>
      ) : (
        <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {profile.topTags.length > 0 && <span className="tag">Te gusta: {profile.topTags.slice(0, 3).map((t) => t.name).join(' · ')}</span>}
            {profile.topDecades[0] && <span className="tag">{decadeLabel(profile.topDecades[0].decade).replace(/^a/, 'A')}</span>}
            {profile.topArtists.length > 0 && <span className="tag">Favoritos: {profile.topArtists.slice(0, 2).map((a) => a.name).join(', ')}</span>}
          </div>
          {!hasSeeds && <div className="notice">Califica algún disco con 4 o 5 estrellas para que haya de dónde partir.</div>}
          {hasSeeds && profile.confidence === 'low' && <span className="muted">Califica más discos (y no solo con 5 estrellas) para afinar las sugerencias.</span>}

          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>
              {lastRun?.usedStale ? 'Sin conexión: te mostramos las sugerencias de la última vez.' : age ?? ''}
            </span>
            <button className="btn btn--sm" onClick={() => run(true)} disabled={Boolean(progress) || !hasSeeds} aria-busy={Boolean(progress)}>
              {progress ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {progress && (
            <div className="stack" role="status" aria-live="polite" style={{ gap: 4 }}>
              {!suggestions && <span className="muted">La primera vez tarda hasta un minuto porque consultamos los catálogos con calma; después es casi instantáneo.</span>}
              <progress className="progress" value={progress.done} max={progress.total} />
              <span className="muted">{progress.step}…</span>
            </div>
          )}
          {error && <div className="notice notice--error" role="alert">{error}</div>}

          {suggestions && suggestions.length > 0 && (
            <ol className="stack" style={{ gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
              {suggestions.map((s) => {
                const wished = wishedKeys.has(s.key)
                return (
                  <li className="card stack" key={s.key} style={{ gap: 10 }}>
                    <div className="row" style={{ alignItems: 'center' }}>
                      <Cover src={s.thumbUrl ?? s.coverUrl} title={s.title} className="thumb" />
                      <div className="grow stack" style={{ gap: 2 }}>
                        <h3 className="result__title">{s.title}</h3>
                        <span className="result__meta">{s.artist}{s.year ? ` · ${s.year}` : ''}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.reason}</span>
                      </div>
                    </div>
                    <div className="row">
                      <a className="btn btn--sm grow" href={spotifySearchUrl(s.artist, s.title)} target="_blank" rel="noreferrer">
                        <SpotifyIcon width={18} height={18} className="spotify" /> Escuchar<span className="visually-hidden"> «{s.title}» en Spotify</span>
                      </a>
                      <button className={`btn btn--sm grow ${wished ? '' : 'btn--primary'}`} onClick={() => toggleWish(s)} aria-pressed={wished}>{wished ? '✓ En tus deseos' : 'Lo quiero'}</button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {suggestions && suggestions.length === 0 && !progress && !error && (
            <div className="empty"><p>Ya tienes (o ya quieres) todo lo que encontré. Califica más discos o toca Actualizar.</p></div>
          )}

          <span className="muted" style={{ fontSize: 12 }}>Sugerencias calculadas en tu celular con datos abiertos de Discogs, MusicBrainz y ListenBrainz. «Escuchar» abre Spotify.</span>
        </>
      )}
    </main>
  )
}
