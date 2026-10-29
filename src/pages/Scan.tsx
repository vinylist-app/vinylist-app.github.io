import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { lookupBarcode } from '../api/lookup'
import { addCandidate, duplicateOf } from '../lib/addFromCandidate'
import { CandidateList } from '../components/CandidateList'
import { CloseIcon, KeyboardIcon } from '../components/Icons'
import type { Album, ReleaseCandidate } from '../types'

type Phase = 'scanning' | 'looking' | 'results' | 'manual'

export function Scan() {
  const nav = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('scanning')
  const [code, setCode] = useState('')
  const [results, setResults] = useState<ReleaseCandidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | undefined>()
  const [dup, setDup] = useState<Album | null>(null)
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

  async function lookup(raw: string) {
    const clean = raw.replace(/\D/g, '')
    setCode(clean)
    setPhase('looking')
    setError(null)
    try {
      const found = await lookupBarcode(clean)
      setResults(found)
      // Aviso de duplicado: si cualquiera de las ediciones ya está en la colección.
      for (const c of found) {
        const d = await duplicateOf(c)
        if (d) { setDup(d.album); break }
      }
      setPhase('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el código.')
      setPhase('results')
    }
  }

  async function pick(c: ReleaseCandidate) {
    setBusy(c.sourceId)
    try {
      const album = await addCandidate(c)
      nav(`/album/${album.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar.')
    } finally {
      setBusy(undefined)
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
            <span>Agregar disco</span>
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

      {phase === 'looking' && <div className="empty" style={{ paddingTop: 'calc(80px + var(--safe-top))' }}><p>Buscando el código {code}…</p></div>}

      {phase === 'results' && (
        <div className="stack" style={{ paddingTop: 'calc(24px + var(--safe-top))', gap: 14 }}>
          {dup && <Link to={`/album/${dup.id}`} className="notice">Ya tienen una edición de este disco: {dup.title}. Toca para verla.</Link>}
          {error && <div className="notice notice--error">{error}</div>}
          <div className="stack" style={{ gap: 2 }}>
            <span className="muted">Código {code} · {results.length} {results.length === 1 ? 'edición encontrada' : 'ediciones encontradas'}</span>
            {results[0] && <h2>{results[0].title} · {results[0].artist}</h2>}
            <span className="muted">Elige la edición que tienes en la mano</span>
          </div>
          {results.length > 0 ? (
            <CandidateList candidates={results} onPick={pick} busyId={busy} />
          ) : (
            <div className="empty">
              <p>No hay ediciones con ese código. Los discos antiguos a veces no están por código.</p>
              <Link to="/buscar" className="btn btn--primary">Buscar por artista y título</Link>
            </div>
          )}
          <button className="btn" onClick={() => { setResults([]); setDup(null); setPhase('scanning') }}>Escanear otro</button>
        </div>
      )}
    </main>
  )
}
