import { useEffect, type ReactNode } from 'react'

/**
 * Hoja que sube desde abajo (reutiliza .sheet de styles.css) para las
 * pantallas de cuenta, colección y ajustes. Se cierra tocando fuera o con Escape.
 */
export function CuentaSheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet" onClick={onClose} role="presentation">
      <div className="sheet__panel" role="dialog" aria-modal="true" aria-label={title ?? 'Opciones'} onClick={(e) => e.stopPropagation()}>
        <span className="sheet__handle" />
        {title && <h3 className="cu-sheet-title">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
