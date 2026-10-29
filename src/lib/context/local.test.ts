import { describe, expect, it } from 'vitest'
import { localFacts, matchInCollection, matchWishes, verdictFor } from './local'
import { discogsFact, mergeFacts, sourcesOf } from './remote'
import { similarSeeds } from './similar'
import { buildProfile } from '../taste/profile'
import type { Album, WishlistItem } from '../../types'
import type { DiscRef, Fact } from './types'

const now = new Date('2026-10-29T12:00:00Z')
const album = (o: Partial<Album> & { id: string; title: string; artist: string }): Album => ({
  collectionId: 'local', genres: [], styles: [], tracklist: [], addedAt: '2026-09-01', updatedAt: '2026-09-01', ...o,
})
const wish = (o: Partial<WishlistItem> & { id: string; title: string; artist: string; wantedBy: string; wantedByName: string }): WishlistItem => ({
  collectionId: 'local', addedAt: '2026-03-12T10:00:00Z', ...o,
})
const disc = (o: Partial<DiscRef> & { title: string; artist: string }): DiscRef => ({ genres: [], styles: [], ...o })

const collection = [
  album({ id: '1', title: 'Harvest', artist: 'Neil Young', year: 1972, genres: ['Rock'], styles: ['Folk Rock'], rating: 9, musicbrainzArtistId: 'mb-neil' }),
  album({ id: '2', title: 'The Dark Side of the Moon', artist: 'Pink Floyd', year: 1973, genres: ['Rock'], styles: ['Prog Rock'], rating: 10 }),
  album({ id: '3', title: 'Kind of Blue', artist: 'Miles Davis', year: 1959, genres: ['Jazz'], styles: ['Modal'], rating: 10 }),
  album({ id: '4', title: 'Re', artist: 'Café Tacvba', year: 1994, genres: ['Rock'], styles: ['Rock en español'], rating: 8 }),
  album({ id: '5', title: 'Hotel California', artist: 'Eagles', year: 1976, genres: ['Rock'], styles: ['Soft Rock'], rating: 7 }),
]
const profile = buildProfile(collection, now)

describe('coincidencias con la colección', () => {
  it('misma edición por Discogs o código; otra edición por master o por artista y título', () => {
    const albums = [album({ id: 'a', title: 'Rumours', artist: 'Fleetwood Mac', discogsId: 111, barcode: '0936249793', discogsMasterId: 9 })]
    expect(matchInCollection(disc({ title: 'x', artist: 'y', discogsId: 111 }), albums)?.kind).toBe('same')
    expect(matchInCollection(disc({ title: 'x', artist: 'y', barcode: '0 93624 9793' }), albums)?.kind).toBe('same')
    expect(matchInCollection(disc({ title: 'Rumours (2011 Remaster)', artist: 'Fleetwood Mac' }), albums)?.kind).toBe('other')
    expect(matchInCollection(disc({ title: 'x', artist: 'y', discogsMasterId: 9 }), albums)?.kind).toBe('other')
    expect(matchInCollection(disc({ title: 'Tusk', artist: 'Fleetwood Mac' }), albums)).toBeUndefined()
  })
  it('encuentra deseos por id o por título', () => {
    const wishes = [wish({ id: 'w', title: 'Rumours', artist: 'Fleetwood Mac', wantedBy: 'ana', wantedByName: 'Ana' })]
    expect(matchWishes(disc({ title: 'rumours', artist: 'Fleetwood Mac' }), wishes)).toHaveLength(1)
    expect(matchWishes(disc({ title: 'Tusk', artist: 'Fleetwood Mac' }), wishes)).toHaveLength(0)
  })
})

describe('lo que cuenta la colección', () => {
  it('primer disco del artista y del género, parecidos de la misma década, década fuerte', () => {
    const facts = localFacts(disc({ title: 'Rumours', artist: 'Fleetwood Mac', year: 1977, genres: ['Rock'], styles: ['Soft Rock'] }), collection, [], profile, { now })
    expect(facts.map((f) => f.id)).toEqual(['artista', 'genero', 'parecidos', 'decada'])
    expect(facts[0]).toMatchObject({ icon: '1.º', title: 'Sería tu primer disco de Fleetwood Mac.', source: 'colección' })
    expect(facts[0].detail).toBeUndefined()
    expect(facts[1].title).toBe('Ya tienes 4 de Rock; este sería el 5.º')
    expect(facts[1].detail).toBe('Uno de ellos es Soft Rock.')
    expect(facts[2].title).toBe('Va con tres que ya tienes.')
    expect(facts[2].detail).toBe('Harvest, The Dark Side of the Moon y Hotel California: rock de los setenta.')
    expect(facts[3].title).toBe('Los setenta son tu década fuerte: 3 discos.')
  })
  it('ya tienes uno del artista', () => {
    const facts = localFacts(disc({ title: 'After the Gold Rush', artist: 'Neil Young', year: 1970, genres: ['Rock'] }), collection, [], profile, { now })
    expect(facts[0].title).toBe('Ya tienes «Harvest» de Neil Young; este te faltaba.')
    expect(facts[0].icon).toBe('↑')
  })
  it('ya tienes varios del artista, con lista', () => {
    const more = [...collection, album({ id: '6', title: 'On the Beach', artist: 'Neil Young', year: 1974, genres: ['Rock'] }), album({ id: '7', title: 'Zuma', artist: 'Neil Young', year: 1975, genres: ['Rock'] })]
    const facts = localFacts(disc({ title: 'Comes a Time', artist: 'Neil Young', year: 1978, genres: ['Rock'] }), more, [], buildProfile(more, now), { now })
    expect(facts[0].title).toBe('Ya tienes 3 de Neil Young: Harvest, On the Beach y Zuma. Este te faltaba.')
  })
  it('primer disco de un género nuevo (y de su estilo)', () => {
    const facts = localFacts(disc({ title: 'Blue Train', artist: 'John Coltrane', year: 1958, genres: ['Jazz'], styles: ['Hard Bop'] }), collection, [], profile, { now })
    expect(facts[1].title).toBe('Sería tu primer disco de Hard Bop.')
    expect(facts[1].detail).toBe('Ya tienes 1 de Jazz.')
    const polka = localFacts(disc({ title: 'P', artist: 'Q', genres: ['Polka'], styles: ['Oberek'] }), collection, [], profile, { now })
    expect(polka[1].title).toBe('Sería tu primer disco de Polka (y de Oberek).')
  })
  it('no compara el disco consigo mismo (otra edición ya en la colección)', () => {
    const facts = localFacts(disc({ title: 'Harvest', artist: 'Neil Young', year: 1972, genres: ['Rock'] }), collection, [], profile, { now })
    expect(facts[0].title).toBe('Sería tu primer disco de Neil Young.')
  })
  it('no habla de "Various" como artista', () => {
    const facts = localFacts(disc({ title: 'Disco Fever', artist: 'Various', year: 1978, genres: ['Funk / Soul'] }), collection, [], profile, { now })
    expect(facts.find((f) => f.id === 'artista')).toBeUndefined()
  })
  it('década fuerte solo si es la más frecuente y hay empate no la menciona', () => {
    const tie = [...collection, album({ id: '8', title: 'Nevermind', artist: 'Nirvana', year: 1991, genres: ['Rock'] }), album({ id: '9', title: 'OK Computer', artist: 'Radiohead', year: 1997, genres: ['Rock'] })]
    const facts = localFacts(disc({ title: 'X', artist: 'Y', year: 1995, genres: ['Rock'] }), tie, [], buildProfile(tie, now), { now })
    expect(facts.find((f) => f.id === 'decada')).toBeUndefined()
  })
  it('lo quiere otra persona desde cierto mes; mis propios deseos no se cuentan', () => {
    const wishes = [wish({ id: 'w', title: 'Rumours', artist: 'Fleetwood Mac', wantedBy: 'ana', wantedByName: 'Ana' })]
    const facts = localFacts(disc({ title: 'Rumours', artist: 'Fleetwood Mac', year: 1977, genres: ['Rock'] }), collection, wishes, profile, { me: 'yo', now })
    const deseo = facts.find((f) => f.id === 'deseo')
    expect(deseo).toBeUndefined() // ya había cuatro líneas de más prioridad
    const few = localFacts(disc({ title: 'Rumours', artist: 'Fleetwood Mac', year: 1977 }), collection, wishes, profile, { me: 'yo', now })
    expect(few.find((f) => f.id === 'deseo')).toMatchObject({ icon: '♥', title: 'Lo quiere Ana desde marzo.' })
    const mine = localFacts(disc({ title: 'Rumours', artist: 'Fleetwood Mac', year: 1977 }), collection, wishes, profile, { me: 'ana', now })
    expect(mine.find((f) => f.id === 'deseo')).toBeUndefined()
  })
  it('nunca más de cuatro líneas', () => {
    const wishes = [wish({ id: 'w', title: 'Rumours', artist: 'Fleetwood Mac', wantedBy: 'ana', wantedByName: 'Ana' })]
    expect(localFacts(disc({ title: 'Rumours', artist: 'Fleetwood Mac', year: 1977, genres: ['Rock'] }), collection, wishes, profile, { now }).length).toBeLessThanOrEqual(4)
  })
  it('artista parecido según la caché de ListenBrainz cuando no hay parecidos directos', () => {
    const seeds = similarSeeds([{ seedMbid: 'mb-neil', list: [{ mbid: 'mb-cs', name: 'Crosby, Stills & Nash' }] }], profile, 'Crosby, Stills & Nash')
    expect(seeds).toEqual(['Neil Young'])
    const facts = localFacts(disc({ title: 'Déjà Vu', artist: 'Crosby, Stills & Nash', year: 1970, genres: ['Folk'] }), collection, [], profile, { similarTo: seeds, now })
    const p = facts.find((f) => f.id === 'parecidos')
    expect(p?.title).toBe('Va con uno que ya tienes.')
    expect(p?.detail).toBe('Harvest: Neil Young suena parecido a Crosby, Stills & Nash, según ListenBrainz.')
    expect(p?.source).toBe('ListenBrainz')
  })
})

describe('veredicto', () => {
  it('nada con menos de cinco discos calificados', () => {
    expect(verdictFor(disc({ title: 'X', artist: 'Y', genres: ['Rock'] }), buildProfile(collection.slice(0, 3), now))).toBeUndefined()
  })
  it('pinta para ti cuando va con el gusto; terreno nuevo cuando no', () => {
    expect(verdictFor(disc({ title: 'Wish You Were Here', artist: 'Pink Floyd', year: 1975, genres: ['Rock'], styles: ['Prog Rock'] }), profile)).toBe('Pinta para ti')
    expect(verdictFor(disc({ title: 'P', artist: 'Q', year: 2020, genres: ['Polka'] }), profile)).toBe('Terreno nuevo')
  })
})

describe('Discogs y mezcla de líneas', () => {
  it('icónico desde 50 000, muy conocido desde 10 000, nada abajo', () => {
    expect(discogsFact(disc({ title: 'x', artist: 'y', community: { have: 52345, want: 12000 } }))).toMatchObject({ title: 'Es icónico.', detail: '52,345 coleccionistas lo tienen y 12,000 lo buscan en Discogs.' })
    expect(discogsFact(disc({ title: 'x', artist: 'y', community: { have: 12000 } }))?.title).toBe('Es muy conocido.')
    expect(discogsFact(disc({ title: 'x', artist: 'y', community: { have: 300 } }))).toBeUndefined()
  })
  it('la remota completa la local y el resto va en orden fijo', () => {
    const local: Fact[] = [{ id: 'artista', icon: '1.º', title: 'Sería tu primer disco de X.', source: 'colección' }]
    const remote: Fact[] = [
      { id: 'dato', icon: 'i', title: 'Un dato.', detail: 'Bla.', source: 'Wikipedia' },
      { id: 'artista', icon: '1.º', title: 'Sería tu primer disco de X.', detail: 'Después te irían bien «A» (1979).', source: 'MusicBrainz' },
      { id: 'iconico', icon: '★', title: 'Es icónico.', source: 'Discogs' },
    ]
    const merged = mergeFacts(local, remote)
    expect(merged.map((f) => f.id)).toEqual(['artista', 'iconico', 'dato'])
    expect(merged[0].detail).toBe('Después te irían bien «A» (1979).')
    expect(sourcesOf(merged)).toEqual(['tu colección', 'MusicBrainz', 'Wikipedia', 'Discogs'])
  })
})
