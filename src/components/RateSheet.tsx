import { useState } from 'react'
import { updateAlbum } from '../db'
import type { Album } from '../types'
import { Cover } from './AlbumCard'
import { BackIcon } from './Icons'
import { StarSlider } from './StarSlider'
import { formatStars } from '../lib/rating'
import { saveButton } from '../lib/starSlider'
import '../styles/calificar.css'

/**
 * Hoja "Calificar deslizando" (pantalla 8). El valor es provisional mientras la
 * hoja está abierta; solo se guarda al tocar el botón de abajo.
 */
export function RateSheet({ album, onClose }: { album: Album; onClose: () => void }) {
  /** Lo que se guardaría al tocar el botón. */
  const [draft, setDraft] = useState<number | undefined>(album.rating)
  /** Lo que se ve en el medallón: sigue al dedo mientras se arrastra. */
  const [shown, setShown] = useState<number | undefined>(album.rating)
  const [saving, setSaving] = useState(false)
  const button = saveButton(draft, album.rating)

  async function save() {
    if (button.disabled || saving) return
    setSaving(true)
    try {
      await updateAlbum(album.id, { rating: draft })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const meta = [album.artist, album.year].filter(Boolean).join(' · ')

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__panel cal-sheet" role="dialog" aria-modal="true" aria-labelledby="cal-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="cal-sheet__nav">
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose} aria-label={`Volver a ${album.title}`}><BackIcon width={20} height={20} /> <span>{album.title}</span></button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>Ahora no</button>
        </div>

        <Cover src={album.coverUrl ?? album.thumbUrl} title={album.title} className="cal-sheet__cover" />
        <div className="stack" style={{ gap: 4, alignItems: 'center' }}>
          <h2 id="cal-sheet-title">{album.title}</h2>
          {meta && <span className="muted" style={{ fontSize: 15 }}>{meta}</span>}
        </div>

        <span className="eyebrow" style={{ marginTop: 6 }}>Tu calificación · opcional</span>
        <StarSlider value={draft} size={48} showScale onChange={(r) => { setDraft(r); setShown(r) }} onPreview={setShown} />

        <div className={`cal-medal ${shown ? '' : 'cal-medal--empty'}`} aria-live="polite" aria-label={shown ? `${formatStars(shown)} de 5 estrellas` : 'Sin calificar'}>
          {shown ? formatStars(shown) : '—'}
        </div>

        <p className="cal-sheet__help">Desliza el dedo de izquierda a derecha y las estrellas se van llenando. Al soltar, se ajusta a la <b>media estrella</b> más cercana.</p>
        <p className="cal-sheet__hint">También puedes tocar una estrella directo. Si hoy no quieres, lo calificas cuando lo escuches.</p>

        <button type="button" className="btn btn--primary cal-sheet__save" disabled={button.disabled || saving} onClick={save}>{button.label}</button>
      </div>
    </div>
  )
}
