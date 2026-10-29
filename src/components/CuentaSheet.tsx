import type { ReactNode } from 'react'
import { Sheet } from './Sheet'

/**
 * Hoja que sube desde abajo para las pantallas de cuenta, colección y ajustes:
 * la Sheet común con un título opcional arriba. Se cierra tocando fuera o con Escape.
 */
export function CuentaSheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet onClose={onClose} label={title ?? 'Opciones'}>
      {title && <h3 className="cu-sheet-title">{title}</h3>}
      {children}
    </Sheet>
  )
}
