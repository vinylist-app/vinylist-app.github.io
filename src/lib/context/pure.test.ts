import { describe, expect, it } from 'vitest'
import { countWord, decadeWords, discographyFacts, discographyLine, formatCount, lifeLine, listTitles, monthLabel, nextUpDetail, ordinal, studioAlbums, totalMinutes, trimExtract, wikidataQid, yearsBeforeDeath } from './pure'

describe('números y palabras', () => {
  it('ordinales y números en letra', () => {
    expect(ordinal(1)).toBe('1.º')
    expect(ordinal(12)).toBe('12.º')
    expect(countWord(2)).toBe('dos')
    expect(countWord(14)).toBe('14')
  })
  it('formatea con separador de miles de México', () => {
    expect(formatCount(52345)).toBe('52,345')
    expect(formatCount(999)).toBe('999')
  })
  it('décadas en palabras', () => {
    expect(decadeWords(1970)).toBe('setenta')
    expect(decadeWords(2010)).toBe('años 2010')
  })
  it('listas de títulos con "y" y "más"', () => {
    expect(listTitles(['A'])).toBe('A')
    expect(listTitles(['A', 'B'])).toBe('A y B')
    expect(listTitles(['A', 'B', 'C'])).toBe('A, B y C')
    expect(listTitles(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C y 2 más')
  })
  it('mes del deseo, con año solo si no es el actual', () => {
    const now = new Date('2026-10-29T12:00:00Z')
    expect(monthLabel('2026-03-12T10:00:00Z', now)).toBe('marzo')
    expect(monthLabel('2025-03-12T10:00:00Z', now)).toBe('marzo de 2025')
    expect(monthLabel('basura', now)).toBe('')
  })
  it('suma duraciones de canciones en minutos', () => {
    expect(totalMinutes([{ duration: '3:30' }, { duration: '4:00' }, { duration: '' }])).toBe(8)
    expect(totalMinutes([{ title: 'x' } as { duration?: string }])).toBeUndefined()
  })
})

describe('recorte del extracto', () => {
  it('deja el texto corto tal cual', () => {
    expect(trimExtract('Rumours es un disco. Salió en 1977.')).toBe('Rumours es un disco. Salió en 1977.')
  })
  it('corta en el fin de oración anterior al límite', () => {
    const text = 'Primera oración completa que dice algo. Segunda oración que también cuenta algo. Tercera oración que ya no cabe en el espacio disponible.'
    const out = trimExtract(text, 90)
    expect(out).toBe('Primera oración completa que dice algo. Segunda oración que también cuenta algo.')
  })
  it('si no hay fin de oración razonable, corta en palabra y pone puntos suspensivos', () => {
    const text = 'Una sola oración larguísima sin puntos que sigue y sigue y sigue y no termina nunca jamás de los jamases'
    const out = trimExtract(text, 40)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out).not.toMatch(/\s…$/)
  })
})

describe('Wikidata', () => {
  it('extrae el Q de distintas formas de enlace', () => {
    expect(wikidataQid('https://www.wikidata.org/wiki/Q169541')).toBe('Q169541')
    expect(wikidataQid('http://www.wikidata.org/entity/Q42')).toBe('Q42')
    expect(wikidataQid('https://es.wikipedia.org/wiki/Rumours')).toBeUndefined()
  })
})

describe('vida del artista', () => {
  it('años antes de morir y póstumo', () => {
    expect(yearsBeforeDeath(1977, 1980)).toBe(3)
    expect(lifeLine(1977, 1980)).toBe('Lo publicó 3 años antes de morir (†1980).')
    expect(lifeLine(1979, 1980)).toBe('Lo publicó un año antes de morir (†1980).')
    expect(lifeLine(1980, 1980)).toBe('Lo publicó el año en que murió (†1980).')
    expect(lifeLine(1982, 1980)).toBe('Póstumo: salió 2 años después de su muerte (†1980).')
    expect(lifeLine(undefined, 1980)).toBeUndefined()
  })
})

describe('discografía de estudio', () => {
  const groups = [
    { id: 'g1', title: 'Fleetwood Mac', year: 1975, secondaryTypes: [] },
    { id: 'g2', title: 'Rumours', year: 1977, secondaryTypes: [] },
    { id: 'g3', title: 'Tusk', year: 1979, secondaryTypes: [] },
    { id: 'g4', title: 'Live', year: 1980, secondaryTypes: ['Live'] },
    { id: 'g5', title: 'Greatest Hits', year: 1988, secondaryTypes: ['Compilation'] },
    { id: 'g6', title: 'Mirage', year: 1982, secondaryTypes: [] },
  ]
  const studio = studioAlbums(groups)

  it('deja solo los de estudio, por año', () => {
    expect(studio.map((s) => s.title)).toEqual(['Fleetwood Mac', 'Rumours', 'Tusk', 'Mirage'])
  })
  it('sin discos del artista: posición y sugerencias cercanas', () => {
    const f = discographyFacts({ title: 'Rumours', year: 1977 }, studio, [])
    expect(f.position).toBe(2)
    expect(f.total).toBe(4)
    expect(f.owned).toBe(0)
    expect(f.missing).toBe(3)
    expect(f.nextUp.map((s) => s.title)).toEqual(['Fleetwood Mac', 'Tusk'])
    expect(nextUpDetail(f)).toBe('Después te irían bien «Fleetwood Mac» (1975) y «Tusk» (1979).')
    expect(discographyLine('Fleetwood Mac', f)).toEqual({ title: 'Es su 2.º disco de estudio.', detail: 'Fleetwood Mac tiene 4 discos de estudio en total.' })
  })
  it('te faltan N de M cuando ya tienen algunos', () => {
    const f = discographyFacts({ title: 'Rumours', year: 1977 }, studio, [{ title: 'Tusk' }])
    expect(f.owned).toBe(1)
    expect(f.missing).toBe(2)
    expect(discographyLine('Fleetwood Mac', f)?.title).toBe('Te faltarían 2 de los 4 discos de estudio de Fleetwood Mac.')
    expect(discographyLine('Fleetwood Mac', f)?.detail).toBe('Después de este: Fleetwood Mac y Mirage.')
  })
  it('con este completas la discografía', () => {
    const f = discographyFacts({ title: 'Rumours' }, studio, [{ title: 'Tusk' }, { title: 'Mirage' }, { title: 'Fleetwood Mac' }])
    expect(f.missing).toBe(0)
    expect(discographyLine('Fleetwood Mac', f)?.title).toBe('Con este completas la discografía de estudio de Fleetwood Mac.')
  })
  it('reconoce el debut y el último', () => {
    expect(discographyLine('X', discographyFacts({ title: 'Fleetwood Mac' }, studio, []))?.title).toBe('Es su debut: su primer disco de estudio.')
    expect(discographyFacts({ title: 'Mirage' }, studio, []).isLast).toBe(true)
    expect(discographyFacts({ title: 'Rumours' }, studio, []).isLast).toBe(false)
  })
  it('encuentra por id de grupo aunque el título difiera, y no inventa posición si no está', () => {
    expect(discographyFacts({ title: 'Rumours (Deluxe)', musicbrainzReleaseGroupId: 'g3' }, studio, []).position).toBe(3)
    expect(discographyFacts({ title: 'Otro disco' }, studio, []).position).toBeUndefined()
    expect(discographyLine('X', discographyFacts({ title: 'Otro disco' }, studio, []))).toBeUndefined()
  })
})
