import { describe, expect, it } from 'vitest'
import { applyFilters, DEFAULT_FILTERS, filtersFromParams, normalize, sortableArtist } from './filters'
import { formatStars, fromStars, starFill, toStars } from './rating'
import type { Album } from '../types'

const base = { collectionId: 'local', genres: [], styles: [], tracklist: [], addedAt: '2026-01-01', updatedAt: '2026-01-01' }
const albums: Album[] = [
  { ...base, id: '1', title: 'Re', artist: 'Café Tacvba', year: 1994, genres: ['Rock'], styles: ['Rock en español'], rating: 8, addedAt: '2026-01-03' },
  { ...base, id: '2', title: 'Abbey Road', artist: 'The Beatles', year: 1969, genres: ['Rock'], rating: 9, addedAt: '2026-01-02' },
  { ...base, id: '3', title: 'Kind of Blue', artist: 'Miles Davis', year: 1959, genres: ['Jazz'], rating: 10, addedAt: '2026-01-01' },
]

describe('búsqueda', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(normalize('Café Tacvba')).toBe('cafe tacvba')
    expect(applyFilters(albums, { ...DEFAULT_FILTERS, query: 'cafe' }).map((a) => a.id)).toEqual(['1'])
  })
  it('filtra por género, década y calificación mínima', () => {
    expect(applyFilters(albums, { ...DEFAULT_FILTERS, genre: 'Jazz' }).map((a) => a.id)).toEqual(['3'])
    expect(applyFilters(albums, { ...DEFAULT_FILTERS, decade: 1960 }).map((a) => a.id)).toEqual(['2'])
    expect(applyFilters(albums, { ...DEFAULT_FILTERS, minRating: 9 }).map((a) => a.id)).toEqual(['2', '3'])
  })
  it('ordena por artista sin el artículo', () => {
    expect(sortableArtist('The Beatles')).toBe('Beatles')
    expect(applyFilters(albums, { ...DEFAULT_FILTERS, sort: 'artist' }).map((a) => a.id)).toEqual(['2', '1', '3'])
  })
  it('por defecto muestra lo más reciente primero', () => {
    expect(applyFilters(albums, DEFAULT_FILTERS).map((a) => a.id)).toEqual(['1', '2', '3'])
  })
})

describe('medias estrellas', () => {
  it('convierte entre 1–10 y 0.5–5', () => {
    expect(toStars(9)).toBe(4.5)
    expect(fromStars(4.5)).toBe(9)
    expect(formatStars(9)).toBe('4.5')
    expect(formatStars(10)).toBe('5')
    expect(formatStars(undefined)).toBe('Sin calificar')
  })
  it('pinta la estrella correcta como media', () => {
    expect(starFill(9, 4)).toBe('full')
    expect(starFill(9, 5)).toBe('half')
    expect(starFill(9, 6)).toBe('empty')
  })
})

describe('filtros desde la URL', () => {
  it('lee q, genero, decada y orden; ignora lo inválido', () => {
    expect(filtersFromParams(new URLSearchParams('q=Coldplay&genero=Rock&decada=2020&orden=rating'))).toEqual({ query: 'Coldplay', genre: 'Rock', decade: 2020, sort: 'rating' })
    expect(filtersFromParams(new URLSearchParams('decada=abc&orden=nada'))).toEqual({ query: '', sort: 'recent' })
  })
  it('cualquier año se redondea a su década; fuera de rango se ignora', () => {
    expect(filtersFromParams(new URLSearchParams('decada=2025')).decade).toBe(2020)
    expect(filtersFromParams(new URLSearchParams('decada=1969')).decade).toBe(1960)
    expect(filtersFromParams(new URLSearchParams('decada=25')).decade).toBeUndefined()
    expect(filtersFromParams(new URLSearchParams('decada=-2020')).decade).toBeUndefined()
  })
})
