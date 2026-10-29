import { useState, type FormEvent } from 'react'
import { useNavigate, useNavigationType } from 'react-router-dom'
import { lookupText } from '../api/lookup'
import { CandidateList } from '../components/CandidateList'
import { SearchIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { albumKey } from '../lib/text'
import { loadResults, saveResults, saveVista, vistaUrl } from '../lib/vistaState'
import type { ReleaseCandidate } from '../types'

/**
 * Buscar a mano. Cada resultado abre la vista previa; ahí se avisa si el disco
 * ya está en la colección y se decide si agregarlo.
 */
export function Search() {
  const nav = useNavigate()
  const navType = useNavigationType()
  // Al volver desde la vista previa ("‹ Buscar"), se recuperan los resultados.
  const [restored] = useState(() => (navType === 'POP' ? loadResults('busqueda') : undefined))
  const [q, setQ] = useState(restored?.query ?? '')
  const [results, setResults] = useState<ReleaseCandidate[] | null>(restored?.results ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!q.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const found = await lookupText(q.trim())
      setResults(found)
      saveResults('busqueda', { query: q.trim(), results: found })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar.')
    } finally {
      setLoading(false)
    }
  }

  function open(c: ReleaseCandidate) {
    // Como "ediciones" solo van los resultados del mismo álbum; los demás son otros discos.
    const key = albumKey(c.artist, c.title)
    const siblings = (results ?? [c]).filter((r) => (c.discogsMasterId && r.discogsMasterId === c.discogsMasterId) || albumKey(r.artist, r.title) === key)
    saveVista({ candidate: c, siblings, from: 'Buscar' })
    nav(vistaUrl(c), { state: { candidate: c, siblings, from: 'Buscar' } })
  }

  return (
    <main className="page">
      <div className="stack" style={{ gap: 8 }}>
        <Logo />
        <h1>Buscar</h1>
        <span className="muted">Por artista, título o número de catálogo.</span>
      </div>
      <form onSubmit={submit}>
        <label className="search">
          <SearchIcon width={20} height={20} />
          <span className="visually-hidden">Buscar en Discogs y MusicBrainz</span>
          <input type="search" enterKeyHint="search" placeholder="Ej. Fleetwood Mac Rumours" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!restored} />
        </label>
      </form>
      {loading && <p className="muted" role="status" aria-live="polite" style={{ margin: 0 }}>Buscando…</p>}
      {!loading && results === null && <button type="button" className="btn btn--primary" onClick={() => submit({ preventDefault() {} } as FormEvent)} disabled={!q.trim()}>Buscar</button>}

      {error && <div className="notice notice--error">{error}</div>}

      {results && results.length === 0 && <div className="empty"><p>No encontré ediciones en vinilo con ese texto. Prueba con menos palabras.</p></div>}
      {results && results.length > 0 && (
        <>
          <span className="eyebrow">{results.length} {results.length === 1 ? 'resultado' : 'resultados'} en vinilo</span>
          <CandidateList candidates={results} onPick={open} />
          <span className="muted" style={{ textAlign: 'center', fontSize: 13 }}>¿No aparece? Prueba con el número de catálogo de la funda.</span>
        </>
      )}
    </main>
  )
}
