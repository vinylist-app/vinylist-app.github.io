import { useState } from 'react'
import { uploadLocal } from '../cloud/collections'
import { discsLabel } from '../lib/invite'

/**
 * Después de crear una colección o unirse a una: si este celular ya tenía
 * discos sin cuenta, ofrece subirlos a la colección de la familia.
 */
export function UploadLocalOffer({ cid, albums, wishes, onDone }: { cid: string; albums: number; wishes: number; onDone: () => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const total = albums + wishes
  const what = albums > 0 ? discsLabel(albums) : `${wishes} ${wishes === 1 ? 'deseo' : 'deseos'}`

  async function upload() {
    setError(null)
    setProgress({ done: 0, total })
    try {
      await uploadLocal(cid, (done, t) => setProgress({ done, total: t }))
      onDone()
    } catch (e) {
      setProgress(null)
      setError(e instanceof Error ? e.message : 'No se pudieron subir. Intenta de nuevo.')
    }
  }

  return (
    <section className="card stack" style={{ gap: 12 }} aria-live="polite">
      <h3>Tienes {what} en este celular. ¿Los subo a la colección?</h3>
      <p className="muted" style={{ margin: 0 }}>
        {albums > 0 && wishes > 0 ? `También van los ${wishes} ${wishes === 1 ? 'deseo' : 'deseos'}. ` : ''}
        Así toda tu familia los ve desde su celular.
      </p>
      {progress ? (
        <div className="cu-progress">
          <progress className="progress" value={progress.done} max={progress.total || 1} aria-label="Subiendo" />
          <span className="muted">Subiendo {progress.done} de {progress.total}…</span>
        </div>
      ) : (
        <>
          <button className="btn btn--primary" onClick={upload}>Subir mis {what}</button>
          <button className="btn btn--link" onClick={onDone}>Ahora no</button>
        </>
      )}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
    </section>
  )
}
