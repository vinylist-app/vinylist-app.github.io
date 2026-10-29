import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useNavigationType } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { lookupBarcode } from '../api/lookup'
import { CandidateList } from '../components/CandidateList'
import { BackIcon, CloseIcon, KeyboardIcon } from '../components/Icons'
import { loadResults, saveResults, saveVista, vistaUrl } from '../lib/vistaState'
import type { ReleaseCandidate } from '../types'

type Phase = 'scanning' | 'looking' | 'results' | 'manual'

/**
 * Escanear ya no agrega el disco: cada edición abre la vista previa, donde la
 * app cuenta qué sabe del disco y la persona decide. Si el código da una sola
 * edición, se abre directo; si da varias, se elige la que se tiene en la mano.
 */
export function Scan() {
  const nav = useNavigate()
  const navType = useNavigationType()
  const videoRef = useRef<HTMLVideoElement>(null)
  // Al volver desde la vista previa ("‹ Escanear"), se recuperan las ediciones en vez de abrir la cámara.
  const [restored] = useState(() => (navType === 'POP' ? loadResults('escaneo') : undefined))
  const [phase, setPhase] = useState<Phase>(restored && restored.results.length > 1 ? 'results' : 'scanning')
  const [code, setCode] = useState(restored?.query ?? '')
  const [results, setResults] = useState<ReleaseCandidate[]>(restored?.results ?? [])
  const [error, setError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    if (phase !== 'scanning' || !videoRef.current) return
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128])
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
    let stop: (() => void) | undefined
    let done = false
    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current, (result) => {
        if (result && !done) {
          done = true
          navigator.vibrate?.(60)
          stop?.()
          lookup(result.getText())
        }
      })
      .then((controls) => { stop = () => controls.stop() })
      .catch(() => setCameraError('No pude abrir la cámara. Revisa el permiso en el navegador o escribe el código a mano.'))
    return () => stop?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function open(c: ReleaseCandidate, siblings: ReleaseCandidate[]) {
    saveVista({ candidate: c, siblings, from: 'Escanear' })
    nav(vistaUrl(c), { state: { candidate: c, siblings, from: 'Escanear' } })
  }

  async function lookup(raw: string) {
    const clean = raw.replace(/\D/g, '')
    setCode(clean)
    setPhase('looking')
    setError(null)
    try {
      const found = await lookupBarcode(clean)
      setResults(found)
      saveResults('escaneo', { query: clean, results: found })
      if (found.length === 1) {
        // Una sola edición: directo a la vista previa, sin lista.
        open(found[0], found)
        return
      }
      setPhase('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el código.')
      setPhase('results')
    }
  }

  return (
    <main className="page page--flush">
      {phase === 'scanning' && (
        <div className="scanner">
          <video ref={videoRef} muted playsInline />
          <div className="scanner__frame"><div className="scanner__box"><i className="scanner__corner" /><i className="scanner__corner" /><i className="scanner__line" /></div></div>
          <div className="scanner__top">
            <Link to="/" className="icon-btn" aria-label="Cerrar escáner"><CloseIcon /></Link>
            <span>Escanear</span>
            <button className="icon-btn" aria-label="Escribir el código a mano" onClick={() => setPhase('manual')}><KeyboardIcon /></button>
          </div>
        </div>
      )}

      {phase === 'scanning' && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="muted">Apunta al código de barras del disco</span>
          {cameraError && <div className="notice notice--error">{cameraError}</div>}
          <div className="row">
            <button className="btn" onClick={() => setPhase('manual')}>Escribir código</button>
            <Link to="/buscar" className="btn">Buscar a mano</Link>
          </div>
        </div>
      )}

      {phase === 'manual' && (
        <form className="stack" style={{ paddingTop: 'calc(24px + var(--safe-top))' }} onSubmit={(e) => { e.preventDefault(); if (code.replace(/\D/g, '').length >= 8) lookup(code) }}>
          <h2>Escribe el código de barras</h2>
          <label className="field"><span>Los 12 o 13 dígitos debajo de las barras</span>
            <input className="input" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. 075992731320" />
          </label>
          <div className="row">
            <button type="button" className="btn grow" onClick={() => setPhase('scanning')}>Volver a la cámara</button>
            <button type="submit" className="btn btn--primary grow">Buscar</button>
          </div>
        </form>
      )}

      {phase === 'looking' && <div className="empty" style={{ paddingTop: 'calc(80px + var(--safe-top))' }} role="status" aria-live="polite"><p>Buscando el código {code}…</p></div>}

      {phase === 'results' && (
        <div className="stack" style={{ paddingTop: 'calc(12px + var(--safe-top))', gap: 14 }}>
          <div className="hero-nav">
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setResults([]); setPhase('scanning') }}><BackIcon width={20} height={20} /> Escanear</button>
            <Link to="/buscar" className="btn btn--sm btn--ghost">Buscar a mano</Link>
          </div>
          {error && <div className="notice notice--error">{error}</div>}
          <div className="stack" style={{ gap: 2 }}>
            <span className="eyebrow">Código {code} · {results.length} {results.length === 1 ? 'edición' : 'ediciones'} en vinilo</span>
            {results[0] && <h2>{results[0].title}</h2>}
            {results[0] && <span className="muted">{results[0].artist}{results[0].year ? ` · ${results[0].year}` : ''}</span>}
          </div>
          {results.length > 0 ? (
            <>
              <span className="muted">Elige la edición que tienes en la mano</span>
              <CandidateList candidates={results} onPick={(c) => open(c, results)} />
              <div className="notice" style={{ background: 'transparent', border: '1px dashed var(--line)', color: 'var(--text-2)', fontWeight: 500 }}>¿Tu copia es otra edición? Elígela aquí. Si el disco ya está en la colección, te avisamos antes de repetirlo.</div>
            </>
          ) : (
            <div className="empty">
              <p>No hay ediciones con ese código. Los discos antiguos a veces no están por código.</p>
              <Link to="/buscar" className="btn btn--primary">Buscar por artista y título</Link>
            </div>
          )}
          <button className="btn" onClick={() => { setResults([]); setPhase('scanning') }}>Escanear otro</button>
        </div>
      )}
    </main>
  )
}
