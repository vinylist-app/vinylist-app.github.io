import { describe, expect, it } from 'vitest'
import { buildProfile, ratingSignal, recencySignal } from './profile'
import { rankCandidates, type Candidate } from './rank'
import type { Album } from '../../types'

const now = new Date('2026-10-12T00:00:00Z')
const base = { collectionId: 'local', tracklist: [], updatedAt: '2026-01-01' }
const album = (o: Partial<Album> & { id: string; title: string; artist: string }): Album => ({
  genres: [], styles: [], addedAt: '2026-09-01', ...base, ...o,
})

describe('señales del perfil', () => {
  it('la calificación domina: 5 estrellas = +1, 3 = 0, 1 = -1; sin calificar = +0.25', () => {
    expect(ratingSignal(10)).toBe(1)
    expect(ratingSignal(9)).toBe(0.75)
    expect(ratingSignal(6)).toBe(0)
    expect(ratingSignal(2)).toBe(-1)
    expect(ratingSignal(undefined)).toBe(0.25)
  })
  it('lo reciente pesa más, con piso de 0.5', () => {
    expect(recencySignal({ addedAt: '2026-10-01' }, now)).toBeCloseTo(1, 1)
    expect(recencySignal({ addedAt: '2025-10-12' }, now)).toBeCloseTo(0.75, 1)
    expect(recencySignal({ addedAt: '2010-01-01' }, now)).toBeCloseTo(0.5, 1)
    expect(recencySignal({ purchaseDate: '2026-10-01', addedAt: '2010-01-01' }, now)).toBeCloseTo(1, 1)
  })
})

describe('perfil de gustos', () => {
  const albums = [
    album({ id: '1', title: 'Rumours', artist: 'Fleetwood Mac', year: 1977, genres: ['Rock'], styles: ['Soft Rock'], rating: 9, purchaseDate: '2026-07-12' }),
    album({ id: '2', title: 'Tusk', artist: 'Fleetwood Mac', year: 1979, genres: ['Rock'], styles: ['Soft Rock', 'Pop Rock'], rating: 8 }),
    album({ id: '3', title: 'Kind of Blue', artist: 'Miles Davis', year: 1959, genres: ['Jazz'], styles: ['Modal'], rating: 10 }),
    album({ id: '4', title: 'Disco Fever', artist: 'Various', year: 1978, genres: ['Funk / Soul'], styles: ['Disco'], rating: 2 }),
    album({ id: '5', title: 'Re', artist: 'Café Tacvba', year: 1994, genres: ['Rock'], styles: ['Rock en español'] }),
  ]
  const p = buildProfile(albums, now)

  it('ignora "Various" como artista y cuenta los demás', () => {
    expect(p.artists.has('various')).toBe(false)
    expect([...p.artists.keys()].sort()).toEqual(['cafe tacvba', 'fleetwood mac', 'miles davis'])
  })
  it('el mejor artista queda en 1 y recuerda su mejor disco', () => {
    expect(p.topArtists[0].score).toBe(1)
    const fm = p.artists.get('fleetwood mac')!
    expect(fm.bestAlbum).toBe('Rumours')
    expect(fm.count).toBe(2)
  })
  it('una calificación baja empuja el estilo hacia abajo', () => {
    expect(p.tags.get('disco')!).toBeLessThan(0)
    expect(p.tags.get('rock')!).toBeGreaterThan(0)
  })
  it('el tag más fuerte queda en 1 y aparece primero', () => {
    expect(p.topTags[0].score).toBe(1)
  })
  it('tiene confianza "ok" con 5 discos y calificaciones variadas', () => {
    expect(p.confidence).toBe('ok')
    expect(buildProfile([], now).confidence).toBe('none')
    expect(buildProfile(albums.slice(0, 2), now).confidence).toBe('low')
  })
  it('un artista con muchos discos no domina sin tope', () => {
    const many = Array.from({ length: 8 }, (_, i) => album({ id: `b${i}`, title: `Beatles ${i}`, artist: 'The Beatles', rating: 10, genres: ['Rock'] }))
    const q = buildProfile([...many, albums[2]], now)
    expect(q.artists.get('the beatles')!.raw).toBe(2)
    expect(q.artists.get('miles davis')!.score).toBeGreaterThan(0.3)
  })
})

describe('ranking de sugerencias', () => {
  const owned = [
    album({ id: '1', title: 'Rumours', artist: 'Fleetwood Mac', year: 1977, genres: ['Rock'], styles: ['Soft Rock'], rating: 9 }),
    album({ id: '2', title: 'Kind of Blue', artist: 'Miles Davis', year: 1959, genres: ['Jazz'], rating: 10 }),
    album({ id: '3', title: 'Abbey Road', artist: 'The Beatles', year: 1969, genres: ['Rock'], rating: 7 }),
    album({ id: '4', title: 'Let It Be', artist: 'The Beatles', year: 1970, genres: ['Rock'], rating: 6 }),
    album({ id: '5', title: 'Re', artist: 'Café Tacvba', year: 1994, genres: ['Rock'], styles: ['Rock en español'], rating: 8 }),
  ]
  const p = buildProfile(owned, now)
  const c = (o: Partial<Candidate> & { title: string; artist: string }): Candidate => ({ genres: [], styles: [], source: 'same-artist', ...o })

  it('no sugiere lo que ya tienen ni lo que ya está en deseos', () => {
    const out = rankCandidates(p, [
      c({ title: 'Rumours', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', genres: ['Rock'] }),
      c({ title: 'Tusk', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', genres: ['Rock'] }),
      c({ title: 'Mirage', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', genres: ['Rock'] }),
    ], new Set(['fleetwood mac|mirage']))
    expect(out.map((s) => s.title)).toEqual(['Tusk'])
  })
  it('máximo dos discos por artista y ordena por puntaje', () => {
    const out = rankCandidates(p, [
      c({ title: 'Tusk', artist: 'Fleetwood Mac', year: 1979, seedArtist: 'Fleetwood Mac', genres: ['Rock'], popularity: 0.9 }),
      c({ title: 'Mirage', artist: 'Fleetwood Mac', year: 1982, seedArtist: 'Fleetwood Mac', genres: ['Rock'], popularity: 0.5 }),
      c({ title: 'Tango in the Night', artist: 'Fleetwood Mac', year: 1987, seedArtist: 'Fleetwood Mac', genres: ['Rock'], popularity: 0.7 }),
      c({ title: 'Sketches of Spain', artist: 'Miles Davis', year: 1960, seedArtist: 'Miles Davis', genres: ['Jazz'], popularity: 0.6 }),
    ], new Set())
    expect(out.filter((s) => s.artist === 'Fleetwood Mac')).toHaveLength(2)
    expect(out[0].title).toBe('Sketches of Spain')
  })
  it('explica con la calificación de la semilla', () => {
    const [s] = rankCandidates(p, [c({ title: 'Tusk', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', genres: ['Rock'], styles: ['Soft Rock'] })], new Set())
    expect(s.reason).toBe('Porque le diste 4.5 estrellas a «Rumours». Además, te gusta el estilo Soft Rock.')
  })
  it('artista parecido: explica el parentesco y usa la similitud', () => {
    const [s] = rankCandidates(p, [c({ title: 'A Love Supreme', artist: 'John Coltrane', year: 1965, source: 'similar-artist', seedArtist: 'Miles Davis', similarity: 1, genres: ['Jazz'] })], new Set())
    expect(s.reason).toBe('Suena a Miles Davis: le diste 5 estrellas a «Kind of Blue». Además, te gusta el género Jazz.')
    expect(s.score).toBeGreaterThan(0.5)
  })
  it('sin géneros no se castiga: se renormaliza sobre lo que hay', () => {
    const [a] = rankCandidates(p, [c({ title: 'Tusk', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac' })], new Set())
    // Solo hay señal del artista: el puntaje es ese, sin diluirlo con partes que faltan.
    expect(a.score).toBeCloseTo(p.artists.get('fleetwood mac')!.score, 5)
    expect(a.score).toBeGreaterThan(0.5)
  })
  it('no sugiere otra edición de un disco que ya tienen', () => {
    const q = buildProfile([album({ id: 'x', title: 'Rumours (2011 Remaster)', artist: 'Fleetwood Mac', genres: ['Rock'], rating: 9 })], now)
    const out = rankCandidates(q, [c({ title: 'Rumours', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', genres: ['Rock'] })], new Set())
    expect(out).toEqual([])
  })
  it('un género que no coleccionan puntúa menos que uno que sí, aunque sea poco', () => {
    const pop = rankCandidates(p, [c({ title: 'A', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', genres: ['Rock en español'] })], new Set())[0]
    const polka = rankCandidates(p, [c({ title: 'B', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', genres: ['Polka'] })], new Set())[0]
    expect(pop.score).toBeGreaterThan(polka.score)
  })
  it('no presume de una calificación baja: dice "tienes"', () => {
    const q = buildProfile([
      ...Array.from({ length: 6 }, (_, i) => album({ id: `u${i}`, title: `Disco ${i}`, artist: 'Banda', genres: ['Rock'] })),
      album({ id: 'bad', title: 'El malo', artist: 'Banda', genres: ['Rock'], rating: 2 }),
    ], now)
    const [s] = rankCandidates(q, [c({ title: 'Nuevo', artist: 'Banda', seedArtist: 'Banda', genres: ['Rock'] })], new Set())
    expect(s.reason).toBe('Porque tienes 7 discos suyos. Además, te gusta el género Rock.')
  })
  it('los discos en vivo valen menos que los de estudio', () => {
    const out = rankCandidates(p, [
      c({ title: 'Live in Tokyo', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac', secondary: true }),
      c({ title: 'Tusk', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac' }),
    ], new Set())
    expect(out.map((s) => s.title)).toEqual(['Tusk', 'Live in Tokyo'])
  })
  it('las recopilaciones bajan de puntaje y lo desconocido sin señal no aparece', () => {
    const out = rankCandidates(p, [
      c({ title: 'Greatest Hits', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac' }),
      c({ title: 'Tusk', artist: 'Fleetwood Mac', seedArtist: 'Fleetwood Mac' }),
      c({ title: 'Nada', artist: 'Desconocido', source: 'style' }),
    ], new Set())
    expect(out.map((s) => s.title)).toEqual(['Tusk', 'Greatest Hits'])
  })
})
