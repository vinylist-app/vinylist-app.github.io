import { describe, expect, it } from 'vitest'
import { albumKey, decadeLabel, isVariousArtists, looksLikeCompilation, priceLabel, purchaseDateLabel, tagLabel } from './text'

describe('texto', () => {
  it('la llave de un álbum ignora la edición entre paréntesis y los acentos', () => {
    expect(albumKey('Fleetwood Mac', 'Rumours (2011 Remaster)')).toBe(albumKey('Fleetwood Mac (2)', 'Rumours'))
    expect(albumKey('Café Tacvba', 'Avalancha de Éxitos')).toBe('cafe tacvba|avalancha de exitos')
    expect(albumKey('Oasis', "(What's the Story) Morning Glory?")).not.toBe('oasis|')
  })
  it('reconoce todas las formas de "varios artistas"', () => {
    for (const v of ['Various', 'Various Artists', 'Varios', 'Varios Artistas', 'V/A', 'VA', 'Unknown Artist']) expect(isVariousArtists(v)).toBe(true)
    expect(isVariousArtists('Various Lights')).toBe(false)
  })
  it('muestra géneros en español y estilos de MusicBrainz con mayúsculas', () => {
    expect(tagLabel('Electronic')).toBe('Electrónica')
    expect(tagLabel('Folk, World, & Country')).toBe('Folk y música del mundo')
    expect(tagLabel('soft rock')).toBe('Soft Rock')
    expect(tagLabel('rock en español')).toBe('Rock En Español')
    expect(tagLabel('Soft Rock')).toBe('Soft Rock')
  })
  it('nombra las décadas sin anglicismos', () => {
    expect(decadeLabel(1970)).toBe('años 70')
    expect(decadeLabel(2010)).toBe('años 2010')
  })
  it('detecta recopilaciones por el título', () => {
    expect(looksLikeCompilation('Greatest Hits')).toBe(true)
    expect(looksLikeCompilation('Lo mejor de Juan Gabriel')).toBe(true)
    expect(looksLikeCompilation('Tusk')).toBe(false)
  })
})

describe('fechas y precios de compra', () => {
  it('dice Hoy cuando la compra es de hoy', () => {
    expect(purchaseDateLabel('2026-07-12', new Date(2026, 6, 12, 15))).toBe('Hoy')
  })
  it('escribe la fecha corta en español', () => {
    expect(purchaseDateLabel('2026-07-12', new Date(2026, 9, 28))).toMatch(/12 jul 2026/)
  })
  it('deja pasar una fecha ilegible', () => {
    expect(purchaseDateLabel('ayer')).toBe('ayer')
  })
  it('una marca de tiempo en UTC se lee en hora local: lo agregado esta noche sigue siendo Hoy', () => {
    const tonight = new Date(2026, 9, 29, 20, 0, 0)
    expect(purchaseDateLabel(tonight.toISOString(), tonight)).toBe('Hoy')
    const tomorrow = new Date(2026, 9, 30, 9)
    expect(purchaseDateLabel(tonight.toISOString(), tomorrow)).toMatch(/29 oct 2026/)
  })
  it('formatea precios en pesos', () => {
    expect(priceLabel(650)).toBe('$650')
    expect(priceLabel(1250)).toBe('$1,250')
    expect(priceLabel(649.5)).toBe('$649.50')
  })
})
