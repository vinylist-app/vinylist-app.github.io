import type { ReleaseCandidate } from '../types'

/**
 * Lo que la vista previa necesita recordar entre pantallas y recargas:
 * la edición elegida, sus hermanas (para "Cambiar edición") y de dónde se venía.
 * Va por location.state y, de respaldo, en sessionStorage.
 */
export interface VistaState {
  candidate: ReleaseCandidate
  siblings?: ReleaseCandidate[]
  /** Texto del botón de regreso: "Escanear" o "Buscar". */
  from?: 'Escanear' | 'Buscar'
}

export function vistaUrl(c: ReleaseCandidate): string {
  return `/vista/${c.source}/${encodeURIComponent(c.sourceId)}`
}

const key = (source: string, id: string) => `vinylist.vista:${source}:${id}`

export function saveVista(state: VistaState): void {
  try {
    sessionStorage.setItem(key(state.candidate.source, state.candidate.sourceId), JSON.stringify(state))
  } catch {
    // Sin almacenamiento: solo sobrevive mientras no se recargue.
  }
}

export function loadVista(source: string, id: string): VistaState | undefined {
  try {
    const raw = sessionStorage.getItem(key(source, id))
    if (!raw) return undefined
    const s = JSON.parse(raw) as VistaState
    return s && s.candidate ? s : undefined
  } catch {
    return undefined
  }
}

/** Resultados de la última búsqueda o escaneo, para volver a ellos con "‹ Atrás". */
export function saveResults(which: 'escaneo' | 'busqueda', data: { query: string; results: ReleaseCandidate[] }): void {
  try {
    sessionStorage.setItem(`vinylist.${which}`, JSON.stringify(data))
  } catch {
    // Sin almacenamiento.
  }
}

export function loadResults(which: 'escaneo' | 'busqueda'): { query: string; results: ReleaseCandidate[] } | undefined {
  try {
    const raw = sessionStorage.getItem(`vinylist.${which}`)
    if (!raw) return undefined
    const d = JSON.parse(raw) as { query: string; results: ReleaseCandidate[] }
    return Array.isArray(d.results) ? d : undefined
  } catch {
    return undefined
  }
}
