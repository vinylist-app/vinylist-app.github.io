import { describe, expect, it } from 'vitest'
import { arcPath, focusPath, hitSpans } from './NumerosFiguras'

describe('barra alta · blancos táctiles', () => {
  it('parte el riel sin encimar y ensancha los bloques angostos a costa de los vecinos anchos', () => {
    // Como la semilla: M 48 · NM 80 · VG+ 106 · VG 22 · G+ 4 · sin dato 80, huecos de 2.
    const widths = [48, 80, 106, 22, 4, 80]
    let x = 0
    const blocks = widths.map((w) => { const b = { x, w }; x += w + 2; return b })
    const spans = hitSpans(blocks, x - 2)
    expect(spans[0].left).toBe(0)
    expect(spans.at(-1)!.left + spans.at(-1)!.width).toBe(x - 2)
    for (let i = 1; i < spans.length; i++) expect(spans[i].left).toBeCloseTo(spans[i - 1].left + spans[i - 1].width)
    expect(spans.map((s) => Math.round(s.width))).toEqual([49, 82, 108, 24, 24, 63])
  })
  it('si ningún vecino puede ceder, el bloque se queda con lo que hay', () => {
    expect(hitSpans([{ x: 0, w: 10 }, { x: 12, w: 10 }], 22).map((s) => s.width)).toEqual([11, 11])
    expect(hitSpans([], 100)).toEqual([])
  })
})

describe('dona · arcos', () => {
  it('va desde arriba en el sentido del reloj y marca el arco largo pasando 180°', () => {
    // Un cuarto: de las 12 a las 3, radio 90 sobre el centro (110, 110).
    expect(arcPath(0, 90, 90)).toBe('M110,20 A90,90 0 0 1 200,110')
    expect(arcPath(0, 270, 90)).toBe('M110,20 A90,90 0 1 1 20,110')
  })
  it('el anillo completo (una sola rebanada) son dos mitades que cierran en el mismo punto', () => {
    expect(arcPath(0, 360, 90)).toBe('M110,20 A90,90 0 0 1 110,200 A90,90 0 0 1 110,20')
  })
  it('el contorno de foco cierra la rebanada: arco a 109, arista, arco de regreso a 71 y Z; el anillo completo son dos círculos', () => {
    expect(focusPath(0, 90)).toBe('M110,1 A109,109 0 0 1 219,110 L181,110 A71,71 0 0 0 110,39 Z')
    expect(focusPath(0, 360)).toBe(`${arcPath(0, 360, 109)} ${arcPath(0, 360, 71)}`)
  })
})
