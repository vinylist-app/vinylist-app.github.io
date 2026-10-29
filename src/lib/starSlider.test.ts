import { describe, expect, it } from 'vitest'
import { ariaTextFor, averageOf, fillFor, formatAverage, labelFor, saveButton, saveLabelFor, snap, starUnder, stepRating, tapValue, valueAt } from './starSlider'

// Un riel de 300 px que empieza en x=100, sin margen: cada estrella mide 60 px.
const rect = { left: 100, width: 300 }

describe('valueAt: posición del dedo → 0..5', () => {
  it('borde izquierdo es 0 y borde derecho es 5', () => {
    expect(valueAt(100, rect)).toBe(0)
    expect(valueAt(400, rect)).toBe(5)
  })
  it('no se sale del riel', () => {
    expect(valueAt(-50, rect)).toBe(0)
    expect(valueAt(900, rect)).toBe(5)
  })
  it('exactamente en la mitad da 2.5', () => {
    expect(valueAt(250, rect)).toBe(2.5)
  })
  it('respeta el margen interno', () => {
    // Con 10 px de margen, las estrellas van de 110 a 390 (280 px).
    expect(valueAt(110, rect, 10)).toBe(0)
    expect(valueAt(390, rect, 10)).toBe(5)
    expect(valueAt(250, rect, 10)).toBe(2.5)
  })
  it('con ancho cero no truena', () => {
    expect(valueAt(150, { left: 100, width: 0 })).toBe(0)
  })
})

describe('snap: ajusta a media estrella', () => {
  it('menos de un cuarto de estrella es sin calificar', () => {
    expect(snap(0)).toBeUndefined()
    expect(snap(0.24)).toBeUndefined()
    expect(snap(0.25)).toBe(1)
  })
  it('redondea .25 hacia arriba y .75 hacia la estrella completa', () => {
    expect(snap(1.25)).toBe(3) // 1.5 estrellas
    expect(snap(1.75)).toBe(4) // 2 estrellas
    expect(snap(1.2)).toBe(2) // 1 estrella
    expect(snap(1.7)).toBe(3) // 1.5 estrellas
  })
  it('los extremos quedan en 1 y 10', () => {
    expect(snap(0.5)).toBe(1)
    expect(snap(5)).toBe(10)
    expect(snap(7)).toBe(10)
  })
})

describe('tapValue: un toque directo', () => {
  it('mitad izquierda de la estrella 1 da media estrella; derecha, una entera', () => {
    expect(tapValue(110, rect)).toBe(1)
    expect(tapValue(150, rect)).toBe(2)
  })
  it('exactamente en la mitad cuenta como la derecha', () => {
    expect(tapValue(130, rect)).toBe(2)
  })
  it('estrella 3: izquierda 2.5, derecha 3', () => {
    expect(tapValue(225, rect)).toBe(5)
    expect(tapValue(255, rect)).toBe(6)
  })
  it('en los bordes da media estrella o cinco', () => {
    expect(tapValue(100, rect)).toBe(1)
    expect(tapValue(50, rect)).toBe(1)
    expect(tapValue(400, rect)).toBe(10)
    expect(tapValue(999, rect)).toBe(10)
  })
})

describe('fillFor: relleno de cada estrella', () => {
  it('llena las anteriores, deja vacías las siguientes y parte la actual', () => {
    expect(fillFor(2.5, 1)).toBe(1)
    expect(fillFor(2.5, 2)).toBe(1)
    expect(fillFor(2.5, 3)).toBe(0.5)
    expect(fillFor(2.5, 4)).toBe(0)
    expect(fillFor(2.5, 5)).toBe(0)
  })
  it('en 0 todo vacío y en 5 todo lleno', () => {
    expect([1, 2, 3, 4, 5].map((i) => fillFor(0, i))).toEqual([0, 0, 0, 0, 0])
    expect([1, 2, 3, 4, 5].map((i) => fillFor(5, i))).toEqual([1, 1, 1, 1, 1])
  })
})

describe('starUnder: la estrella bajo el dedo', () => {
  it('va de 1 a 5 y 0 antes de empezar', () => {
    expect(starUnder(0)).toBe(0)
    expect(starUnder(0.1)).toBe(1)
    expect(starUnder(1)).toBe(1)
    expect(starUnder(1.01)).toBe(2)
    expect(starUnder(5)).toBe(5)
  })
})

describe('textos', () => {
  it('labelFor', () => {
    expect(labelFor(undefined)).toBe('Sin calificar')
    expect(labelFor(0)).toBe('Sin calificar')
    expect(labelFor(7)).toBe('3.5 / 5')
    expect(labelFor(10)).toBe('5 / 5')
  })
  it('ariaTextFor', () => {
    expect(ariaTextFor(undefined)).toBe('Sin calificar')
    expect(ariaTextFor(1)).toBe('media estrella')
    expect(ariaTextFor(2)).toBe('1 estrella')
    expect(ariaTextFor(3)).toBe('1 y media estrellas')
    expect(ariaTextFor(4)).toBe('2 estrellas')
    expect(ariaTextFor(9)).toBe('4 y media estrellas')
    expect(ariaTextFor(10)).toBe('5 estrellas')
  })
  it('saveLabelFor', () => {
    expect(saveLabelFor(undefined)).toBe('Guardar')
    expect(saveLabelFor(1)).toBe('Guardar media estrella')
    expect(saveLabelFor(2)).toBe('Guardar 1 estrella')
    expect(saveLabelFor(9)).toBe('Guardar 4.5 estrellas')
  })
})

describe('saveButton: el botón de la hoja', () => {
  it('sin cambios queda deshabilitado', () => {
    expect(saveButton(9, 9)).toEqual({ label: 'Guardar 4.5 estrellas', disabled: true })
    expect(saveButton(undefined, undefined)).toEqual({ label: 'Guardar', disabled: true })
  })
  it('con valor nuevo guarda', () => {
    expect(saveButton(9, undefined)).toEqual({ label: 'Guardar 4.5 estrellas', disabled: false })
    expect(saveButton(2, 9)).toEqual({ label: 'Guardar 1 estrella', disabled: false })
  })
  it('sin valor pero con calificación guardada, ofrece quitarla', () => {
    expect(saveButton(undefined, 6)).toEqual({ label: 'Quitar calificación', disabled: false })
  })
})

describe('stepRating: teclado', () => {
  it('sube y baja de media en media', () => {
    expect(stepRating(4, 1)).toBe(5)
    expect(stepRating(4, -1)).toBe(3)
  })
  it('desde sin calificar sube a media estrella; bajar la deja igual', () => {
    expect(stepRating(undefined, 1)).toBe(1)
    expect(stepRating(undefined, -1)).toBeUndefined()
  })
  it('bajar de media estrella la quita y no pasa de 5', () => {
    expect(stepRating(1, -1)).toBeUndefined()
    expect(stepRating(10, 1)).toBe(10)
  })
})

describe('averageOf: promedio de la familia', () => {
  it('sin calificaciones', () => {
    expect(averageOf(undefined)).toEqual({ avg: 0, count: 0 })
    expect(averageOf({})).toEqual({ avg: 0, count: 0 })
  })
  it('con una persona es su misma calificación', () => {
    expect(averageOf({ ana: { rating: 9, at: '2026-01-01' } })).toEqual({ avg: 4.5, count: 1 })
  })
  it('con tres personas redondea a un decimal', () => {
    const r = averageOf({
      ana: { rating: 10, at: '2026-01-01' },
      luis: { rating: 7, at: '2026-01-02' },
      sofi: { rating: 8, at: '2026-01-03' },
    })
    // (5 + 3.5 + 4) / 3 = 4.1666… → 4.2
    expect(r).toEqual({ avg: 4.2, count: 3 })
  })
  it('ignora valores fuera de rango', () => {
    expect(averageOf({ a: { rating: 8, at: '' }, b: { rating: 0, at: '' } })).toEqual({ avg: 4, count: 1 })
  })
  it('formatAverage no deja ceros de más', () => {
    expect(formatAverage(4)).toBe('4')
    expect(formatAverage(4.2)).toBe('4.2')
  })
})
