import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { lookupText } from '../api/lookup'
import { addCandidate, duplicateOf } from '../lib/addFromCandidate'
import { CandidateList } from '../components/CandidateList'
import { SearchIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import type { Album, ReleaseCandidate } from '../types'

export function Search() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ReleaseCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | undefined>()
  const [dup, setDup] = useState<{ album: Album; candidate: ReleaseCandidate } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!q.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      setResults(await lookupText(q.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar.')
    } finally {
      setLoading(false)
    }
  }

  async function pick(c: ReleaseCandidate, force = false) {
    setBusy(c.sourceId)
    try {
      if (!force) {
        const existing = await duplicateOf(c)
        if (existing) {
          setDup({ album: existing.album, candidate: c })
          return
        }
      }
      const album = await addCandidate(c)
      nav(`/album/${album.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar.')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <main className="page">
      <div className="stack" style={{ gap: 8 }}>
        <Logo />
        <h1>Buscar</h1>
        <span className="muted">Por artista, título o número de catálogo. Sirve para discos sin código de barras.</span>
      </div>
      <form onSubmit={submit}>
        <label className="search">
          <SearchIcon width={20} height={20} />
          <span className="visually-hidden">Buscar en Discogs y MusicBrainz</span>
          <input type="search" enterKeyHint="search" placeholder="Ej. Fleetwood Mac Rumours" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </label>
      </form>
      {loading && <p className="muted" role="status" aria-live="polite" style={{ margin: 0 }}>Buscando…</p>}
      {!loading && results === null && <button type="button" className="btn btn--primary" onClick={() => submit({ preventDefault() {} } as FormEvent)} disabled={!q.trim()}>Buscar</button>}

      {error && <div className="notice notice--error">{error}</div>}

      {dup && (
        <div className="sheet" onClick={() => setDup(null)}>
          <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" />
            <div className="notice">Ya tienen este disco: {dup.album.title} ({dup.album.year ?? 's/f'})</div>
            <p className="muted">¿Es otra copia o una edición distinta? Puedes agregarlo de todas formas o abrir el que ya tienen.</p>
            <div className="row">
              <Link to={`/album/${dup.album.id}`} className="btn grow">Abrir el que ya tienen</Link>
              <button className="btn btn--primary grow" onClick={() => { const c = dup.candidate; setDup(null); pick(c, true) }}>Agregar otra copia</button>
            </div>
          </div>
        </div>
      )}

      {results && results.length === 0 && <div className="empty"><p>No encontré ediciones en vinilo con ese texto. Prueba con menos palabras.</p></div>}
      {results && results.length > 0 && (
        <>
          <span className="eyebrow">{results.length} {results.length === 1 ? 'resultado' : 'resultados'} en vinilo</span>
          <CandidateList candidates={results} onPick={pick} busyId={busy} />
          <span className="muted" style={{ textAlign: 'center', fontSize: 13 }}>¿No aparece? Prueba con el número de catálogo de la funda.</span>
        </>
      )}
    </main>
  )
}
