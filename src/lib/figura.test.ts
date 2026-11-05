import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIGURA_KEY, getFigura, setFigura } from './figura'

/** Un localStorage de mentira (vitest corre en node, donde no existe). */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}

describe('preferencia barras / pastel', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('sin localStorage (modo privado, node) es barras', () => {
    expect(getFigura()).toBe('barras')
    expect(() => setFigura('pastel')).not.toThrow()
  })
  it('con un valor inválido o vacío es barras; con "pastel", pastel', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [FIGURA_KEY]: 'pie' }))
    expect(getFigura()).toBe('barras')
    vi.stubGlobal('localStorage', fakeStorage())
    expect(getFigura()).toBe('barras')
    vi.stubGlobal('localStorage', fakeStorage({ [FIGURA_KEY]: 'pastel' }))
    expect(getFigura()).toBe('pastel')
  })
  it('se guarda al tocar y se lee de vuelta', () => {
    const st = fakeStorage()
    vi.stubGlobal('localStorage', st)
    setFigura('pastel')
    expect(st.data.get(FIGURA_KEY)).toBe('pastel')
    expect(getFigura()).toBe('pastel')
    setFigura('barras')
    expect(getFigura()).toBe('barras')
  })
  it('si el almacenamiento truena al leer o escribir, no pasa nada', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
    expect(getFigura()).toBe('barras')
    expect(() => setFigura('pastel')).not.toThrow()
  })
})
