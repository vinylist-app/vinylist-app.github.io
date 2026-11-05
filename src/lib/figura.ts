/**
 * Tipo de gráfica de "En números": barras (como siempre) o pastel (donas).
 * Una sola preferencia para toda la pantalla, guardada por celular como el tema.
 */
export type Figura = 'barras' | 'pastel'
export const FIGURA_KEY = 'vinylist.numeros.figura'

/** 'pastel' solo si está guardado tal cual; sin almacenamiento (modo privado) o con basura, 'barras'. */
export function getFigura(): Figura {
  try {
    return localStorage.getItem(FIGURA_KEY) === 'pastel' ? 'pastel' : 'barras'
  } catch {
    return 'barras'
  }
}

export function setFigura(figura: Figura): void {
  try {
    localStorage.setItem(FIGURA_KEY, figura)
  } catch {
    // Sin almacenamiento: solo esta visita.
  }
}
