import { describe, expect, it } from 'vitest'
import { artistStats, casual, donutSlices, OTHER_KEY, conditionStats, copyStats, decadeStats, familyStats, growthStats, hasChart, heroStats, labelStats, moneyStats, monthShort, parseDuration, sentence, starStats, tagStats, tick2, yearsOf } from './stats'
import type { Album } from '../types'

const base = { collectionId: 'local', genres: [], styles: [], tracklist: [], addedAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' }
let seq = 0
function disc(p: Partial<Album> & { artist?: string }): Album {
  seq++
  return { ...base, id: `d${seq}`, title: `Disco ${seq}`, artist: 'X', ...p }
}
/** n discos iguales en lo que se pida. */
function many(n: number, p: Partial<Album>): Album[] {
  return Array.from({ length: n }, () => disc(p))
}
/** Marca de tiempo ISO de una fecha y hora LOCALES (mes 1–12): B1 agrupa por fecha local, así la prueba no depende de la zona horaria. */
function iso(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h).toISOString()
}

describe('regla general de gráfica', () => {
  it('pide dos categorías con dato y un máximo de 2', () => {
    expect(hasChart([{ count: 1 }, { count: 1 }])).toBe(false)
    expect(hasChart([{ count: 5 }])).toBe(false)
    expect(hasChart([{ count: 2 }, { count: 1 }, { count: 0 }])).toBe(true)
  })
})

describe('A1 · artistas', () => {
  it('ordena por conteo y desempata como en una tienda (sin el artículo)', () => {
    const s = artistStats([...many(3, { artist: 'The Beatles' }), ...many(3, { artist: 'AC/DC' }), ...many(2, { artist: 'Zoé' }), disc({ artist: 'Café Tacvba' }), disc({ artist: 'Cafe Tacvba (2)' })])
    expect(s.rows.map((r) => `${r.label} ${r.count}`)).toEqual(['AC/DC 3', 'The Beatles 3', 'Café Tacvba 2', 'Zoé 2'])
    expect(s.lead).toBe('AC/DC y The Beatles empatan: 3 discos cada uno.')
    expect(s.chart).toBe(true)
  })
  it('deja fuera "Various Artists" y lo cuenta aparte', () => {
    const s = artistStats([disc({ artist: 'Various Artists' }), disc({ artist: 'V/A' }), ...many(2, { artist: 'Coldplay' })])
    expect(s.rows).toHaveLength(1)
    expect(s.various).toBe(2)
    expect(s.lead).toBe('Coldplay es tu artista: 2 discos.')
  })
  it('frases: uno de cada uno, tres distintos, tres o más empatados', () => {
    expect(artistStats([disc({ artist: 'A' }), disc({ artist: 'B' }), disc({ artist: 'C' })]).lead).toBe('Tus 3 discos son de 3 artistas distintos.')
    expect(artistStats(['A', 'B', 'C', 'D', 'E'].map((artist) => disc({ artist }))).lead).toBe('Un disco de cada uno: 5 artistas.')
    expect(artistStats([...many(2, { artist: 'A' }), ...many(2, { artist: 'B' }), ...many(2, { artist: 'C' })]).lead).toBe('A, B y 1 más empatan con 2.')
    expect(artistStats([disc({ artist: 'Coldplay' })]).lead).toBe('Tu único disco es de Coldplay.')
    expect(artistStats([disc({ artist: 'Coldplay' }), ...many(2, { artist: 'Various Artists' })]).lead).toBe('Tu único disco con artista es de Coldplay.')
  })
})

describe('A2 · décadas y años', () => {
  const now = new Date(2026, 10, 3)
  it('va de la década mínima a la máxima sin saltarse las vacías', () => {
    const s = decadeStats([disc({ year: 1959 }), ...many(3, { year: 2021 }), disc({ year: 1994 }), disc({})], now)
    expect(s.decades.map((d) => `${d.tick}:${d.count}`)).toEqual(['50:1', '60:0', '70:0', '80:0', '90:1', '00:0', '10:0', '20:3'])
    expect(s.top).toBe(2020)
    expect(s.without).toBe(1)
    expect(s.chart).toBe(true)
  })
  it('los diez años de una década, con los futuros en 0', () => {
    const y = yearsOf([disc({ year: 2025 }), disc({ year: 2025 }), disc({ year: 2021 })], 2020)
    expect(y.map((c) => c.tick)).toEqual(['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'])
    expect(y.map((c) => c.count)).toEqual([0, 1, 0, 0, 0, 2, 0, 0, 0, 0])
  })
  it('frases por banda y el remate', () => {
    const lead = (counts: Record<number, number>, extra = 0) => decadeStats([...Object.entries(counts).flatMap(([y, n]) => many(n, { year: Number(y) })), ...many(extra, {})], now).lead
    expect(lead({ 2025: 7, 1975: 3 })).toBe('Casi todo lo tuyo salió en los años 2020: coleccionas lo de ahora.')
    expect(lead({ 1975: 6, 2025: 4 })).toBe('Casi todo lo tuyo salió en los años 70: coleccionas clásicos.')
    expect(lead({ 2015: 11, 1995: 9 })).toBe('Más de la mitad salió en los años 2010.')
    expect(lead({ 2025: 46, 2015: 20, 1975: 21 }, 6)).toBe('Casi la mitad salió en los años 2020: coleccionas lo de ahora.')
    expect(lead({ 2015: 20, 1995: 15, 1975: 15, 1965: 10 })).toBe('Tu década más fuerte: los años 2010, con 20 discos.')
    expect(lead({ 2025: 4, 1995: 3, 1975: 3 })).toBe('Tu década más fuerte son los años 2020, con 4 discos: coleccionas lo de ahora.')
    expect(lead({ 2015: 3, 2025: 3, 1995: 1 })).toBe('Los años 2010 y 2020 empatan: 3 discos cada una.')
  })
  it('la década por defecto con empate es la más reciente', () => {
    expect(decadeStats([...many(3, { year: 2015 }), ...many(3, { year: 2025 }), disc({ year: 1995 })], now).top).toBe(2020)
  })
  it('sin gráfica dice de qué años van; sin años, lo dice', () => {
    const s = decadeStats([disc({ year: 1971, addedAt: '2026-01-02' }), disc({ year: 1998 }), disc({ year: 2024 })], now)
    expect(s.chart).toBe(false)
    expect(s.chartYears).toBe(false)
    expect(s.lead).toBe('Tus discos van de 1971 a 2024.')
    expect(s.oldest?.album.year).toBe(1971)
    expect(s.newest?.album.year).toBe(2024)
    expect(decadeStats([disc({ year: 1971 }), disc({})], now).lead).toBe('Tu disco es de 1971.')
    expect(decadeStats([disc({}), disc({})], now)).toMatchObject({ lead: 'Tus discos todavía no traen año.', decades: [], chart: false, chartYears: false })
  })
  it('toda la colección en una sola década: sin columnas de décadas pero con las de año, y el lead por bandas', () => {
    const s = decadeStats([...many(6, { year: 2021 }), ...many(4, { year: 2025 })], now)
    expect(s.chart).toBe(false)
    expect(s.chartYears).toBe(true)
    expect(s.top).toBe(2020)
    expect(s.lead).toBe('Casi todo lo tuyo salió en los años 2020: coleccionas lo de ahora.')
    // Dos discos del mismo año: ni décadas ni años merecen gráfica, pero la frase sigue siendo la de la banda.
    expect(decadeStats(many(2, { year: 2021 }), now)).toMatchObject({ chart: false, chartYears: false, lead: 'Casi todo lo tuyo salió en los años 2020: coleccionas lo de ahora.' })
  })
  it('ticks de dos dígitos', () => {
    expect([2000, 1970, 2025].map(tick2)).toEqual(['00', '70', '25'])
  })
  it('el más viejo con empate: el agregado primero y cuántos más', () => {
    const s = decadeStats([disc({ year: 1969, title: 'Tarde', addedAt: '2026-02-01' }), disc({ year: 1969, title: 'Temprano', addedAt: '2026-01-01' }), ...many(2, { year: 2020 })], now)
    expect(s.oldest?.album.title).toBe('Temprano')
    expect(s.oldest?.more).toBe(1)
  })
})

describe('A3 · géneros', () => {
  it('cuenta cada disco una vez por género aunque lo traiga repetido, y agrupa grafías', () => {
    const s = tagStats([disc({ genres: ['Rock', 'rock', 'Pop'] }), disc({ genres: ['Rock'] }), disc({ genres: ['Latin'] }), disc({})], 'genres')
    expect(s.rows.map((r) => `${r.label} ${r.count}`)).toEqual(['Rock 2', 'Música latina 1', 'Pop 1'])
    expect(s.rows[0].raw).toBe('Rock')
    expect(s.without).toBe(1)
    expect(s.lead).toBe('Eres de rock: 2 de tus 4 discos lo traen.')
  })
  it('frases: empate, lista corta, nadie con género, estilos', () => {
    expect(tagStats([disc({ genres: ['Rock', 'Pop'] }), disc({ genres: ['Rock', 'Pop'] })], 'genres').lead).toBe('Pop y Rock empatan: 2 discos cada uno.')
    expect(tagStats([disc({ genres: ['Rock'] }), disc({ genres: ['Pop'] }), disc({})], 'genres').lead).toBe('Tus discos traen Pop y Rock.')
    expect(tagStats([disc({}), disc({})], 'genres').lead).toBe('Tus discos todavía no traen géneros. Conecta Discogs en Ajustes y aquí te digo de qué eres.')
    expect(tagStats([...many(3, { styles: ['Pop Rock'] }), disc({ styles: ['Hard Rock'] })], 'styles').lead).toBe('Pop rock manda: 3 discos.')
    expect(tagStats([...many(2, { styles: ['Pop Rock'] }), ...many(2, { styles: ['Hard Rock'] })], 'styles').lead).toBe('Hard rock y Pop rock empatan: 2 cada uno.')
  })
  it('baja la inicial salvo en siglas', () => {
    expect(casual('Música latina')).toBe('música latina')
    expect(casual('R&B')).toBe('R&B')
    expect(sentence('Pop Rock')).toBe('Pop rock')
  })
})

describe('A4 · estrellas', () => {
  it('reparte por media estrella y saca el promedio con un decimal', () => {
    const s = starStats([...many(2, { rating: 9 }), disc({ rating: 10 }), disc({ rating: 7 }), disc({})])
    expect(s.rated).toBe(4)
    expect(s.hist.map((h) => h.count)).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 2, 1])
    expect(s.hist.map((h) => h.tick).join('')).toBe('12345')
    expect(s.avg).toBe(4.4)
    expect(s.lead).toBe('Promedio 4.4: generoso pero exigente.')
    expect(s.hist[8].label).toBe('4½ estrellas')
  })
  it('frases por banda y con pocos calificados', () => {
    expect(starStats(many(3, { rating: 10 })).lead).toBe('Promedio 5.0: te encanta casi todo.')
    expect(starStats([disc({ rating: 7 }), disc({ rating: 8 }), disc({ rating: 7 })]).lead).toBe('Promedio 3.7: ni muy muy ni tan tan.')
    expect(starStats(many(3, { rating: 5 })).lead).toBe('Promedio 2.5: eres duro calificando.')
    expect(starStats([disc({ rating: 8 }), disc({})]).lead).toBe('Has calificado 1 disco. Califica unos más y aquí te digo cómo repartes tus estrellas.')
    expect(starStats([disc({})]).lead).toBe('Todavía no calificas ninguno. Abre un disco y desliza las estrellas.')
  })
  it('los mejores: por nota y luego los más recientes, y cuántos más comparten la máxima', () => {
    const s = starStats([disc({ rating: 10, ratedAt: '2026-01-01', title: 'viejo' }), disc({ rating: 10, ratedAt: '2026-03-01', title: 'nuevo' }), ...many(3, { rating: 10, ratedAt: '2026-02-01' }), disc({ rating: 8 })])
    expect(s.best).toHaveLength(3)
    expect(s.best[0].title).toBe('nuevo')
    expect(s.moreBest).toBe(2)
    expect(s.maxLabel).toBe('5 estrellas')
  })
})

describe('A5 · sellos', () => {
  it('agrupa por grafía normalizada y arma la frase', () => {
    const s = labelStats([...many(3, { label: 'Parlophone' }), disc({ label: ' parlophone ' }), disc({ label: 'Columbia' }), disc({})])
    expect(s.rows[0]).toMatchObject({ label: 'Parlophone', count: 4 })
    expect(s.without).toBe(1)
    expect(s.lead).toBe('Parlophone es tu casa: 4 discos.')
    expect(labelStats([disc({ label: 'A' }), disc({ label: 'B' })]).lead).toBe('Un disco de cada sello: 2 sellos.')
    expect(labelStats([disc({})]).lead).toBe('Tus discos no traen sello. Se llena desde Discogs o en la ficha.')
  })
})

describe('héroe · horas', () => {
  it('lee m:ss y h:mm:ss e ignora lo que no entiende', () => {
    expect(parseDuration('4:54')).toBe(294)
    expect(parseDuration('1:02:30')).toBe(3750)
    expect(parseDuration('')).toBeUndefined()
    expect(parseDuration('cuatro')).toBeUndefined()
    expect(parseDuration('12:60')).toBeUndefined()
    expect(parseDuration('0:00')).toBe(0)
  })
  it('suma horas, canciones y artistas, y dice de cuántos discos salen', () => {
    const s = heroStats([
      disc({ artist: 'A', tracklist: [{ position: '1', title: 't', duration: '30:00' }, { position: '2', title: 't', duration: '45:00' }] }),
      disc({ artist: 'A (2)', tracklist: [{ position: '1', title: 't', duration: '1:00:00' }] }),
      disc({ artist: 'Various', tracklist: [{ position: '1', title: 't' }] }),
    ])
    expect(s).toMatchObject({ n: 3, hours: '2 h', songs: '4', artists: 1, withDurations: 2, note: 'Horas de los 2 discos con duraciones' })
    expect(heroStats([disc({ tracklist: [{ position: '1', title: 't', duration: '12:00' }] })]).hours).toBe('12 min')
    expect(heroStats([disc({})])).toMatchObject({ hours: '—', songs: '—', note: 'Sin canciones todavía: con Discogs se llenan' })
  })
  it('canciones sin duración (o en 0:00) no cuentan como duración', () => {
    expect(heroStats([disc({ tracklist: [{ position: '1', title: 't' }, { position: '2', title: 't', duration: '0:00' }] })])).toMatchObject({ hours: '—', songs: '2', withDurations: 0, note: 'Tus canciones todavía no traen duración' })
  })
})

describe('B1 · crecimiento', () => {
  const now = new Date(2026, 10, 3, 12)
  it('los últimos doce meses con el actual en 0', () => {
    const s = growthStats([...many(3, { addedAt: iso(2026, 8, 10) }), disc({ addedAt: iso(2025, 10, 19) }), disc({ addedAt: iso(2026, 3, 2) })], now)
    expect(s.months.map((m) => m.tick)).toEqual(['dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov'])
    expect(s.months.map((m) => m.count)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 0, 0])
    expect(s.lead).toBe('Tu mes más intenso: agosto de 2026, con 3 discos.')
    expect(s.sub).toBe('Este año llevas 4 · desde el 19 oct 2025')
    expect(s.chart).toBe(true)
  })
  it('un respaldo (≥ 80 % el mismo día, ≥ 10 discos) no se lee como racha', () => {
    const s = growthStats([...many(9, { addedAt: iso(2026, 6, 14) }), disc({ addedAt: iso(2026, 2, 1) })], now)
    expect(s.backup).toBe(true)
    expect(s.lead).toBe('9 discos entraron de golpe el 14 jun 2026: un respaldo.')
    expect(growthStats([...many(7, { addedAt: iso(2026, 6, 14) }), disc({ addedAt: iso(2026, 2, 1) })], now).backup).toBe(false)
  })
  it('un solo mes con datos', () => {
    expect(growthStats(many(2, { addedAt: iso(2026, 11, 1) }), now).lead).toBe('Todo lo agregaste en noviembre de 2026.')
  })
  it('el mes más intenso fuera de los doce meses de la gráfica lo dice', () => {
    const s = growthStats([...many(8, { addedAt: iso(2024, 5, 10) }), ...many(3, { addedAt: iso(2026, 10, 2) }), ...many(2, { addedAt: iso(2026, 9, 2) })], now)
    expect(s.lead).toBe('Tu mes más intenso: mayo de 2024, con 8 discos (antes de estos doce meses).')
    expect(Math.max(...s.months.map((m) => m.count))).toBe(3)
    expect(s.sub).toBe('Este año llevas 5 · desde el 10 may 2024')
    // Un respaldo viejo: la frase sigue siendo verdad aunque las doce columnas vayan en 0.
    expect(growthStats(many(12, { addedAt: iso(2024, 5, 10) }), now)).toMatchObject({ lead: '12 discos entraron de golpe el 10 may 2024: un respaldo.', chart: false })
  })
  it('sin fechas legibles no deja la tarjeta vacía', () => {
    expect(growthStats(many(2, { addedAt: 'ayer' }), now)).toMatchObject({ lead: 'Tus discos no traen fecha de alta.', sub: '', chart: false })
  })
  it('ticks de tres letras sin punto', () => {
    expect([0, 8, 11].map((m) => monthShort(new Date(2026, m, 1)))).toEqual(['ene', 'sep', 'dic'])
  })
})

describe('B2 · condición', () => {
  it('pliega G+ o menos y cuenta sin dato', () => {
    const s = conditionStats([...many(3, { mediaCondition: 'VG+' }), ...many(2, { mediaCondition: 'NM' }), disc({ mediaCondition: 'G' }), disc({ mediaCondition: 'P' }), disc({})], 'mediaCondition')
    expect(s.blocks.map((b) => `${b.label}:${b.count}`)).toEqual(['M:0', 'NM:2', 'VG+:3', 'VG:0', 'G+ o menos:2', 'sin dato:1'])
    expect(s.withData).toBe(7)
    expect(s.lead).toBe('VG+ es lo más común: 3 de 7 con estado.')
  })
  it('con menos de cinco pide anotar el estado', () => {
    expect(conditionStats(many(4, { mediaCondition: 'M' }), 'mediaCondition')).toMatchObject({ enough: false, lead: 'Anota el estado de tus discos en la ficha y aquí te sale cómo están.' })
  })
  it('formato en singular y plural, países en español con "y N más", y si hay funda', () => {
    const s = copyStats([...many(2, { format: 'LP', country: 'US' }), disc({ format: '2xLP', country: 'Mexico' }), disc({ format: '7"', country: 'Germany' }), disc({ format: 'Box Set', country: 'Japan', sleeveCondition: 'NM' }), disc({})])
    expect(s.formatLine).toBe('2 LP · 1 doble · 1 sencillo de 7" · 1 Box Set · 1 sin formato')
    expect(s.countryLine).toBe('US 2 · Alemania 1 · Japón 1 · y 1 más')
    expect(s.anySleeve).toBe(true)
    expect(copyStats([...many(21, { format: '2xLP' }), ...many(2, { format: '7"' })])).toMatchObject({ formatLine: '21 dobles · 2 sencillos de 7"', countryLine: undefined, anySleeve: false })
  })
})

describe('B3 · invertido', () => {
  it('suma, promedia y encuentra el más caro (empate: el más reciente)', () => {
    const s = moneyStats([disc({ purchasePrice: 650, addedAt: '2026-01-01', title: 'a' }), disc({ purchasePrice: 1480, addedAt: '2026-01-01', title: 'viejo' }), disc({ purchasePrice: 1480, addedAt: '2026-05-01', title: 'nuevo' }), disc({})])
    expect(s.lead).toBe('Llevas $3,610 en 3 discos: $1,203 cada uno.')
    expect(s.top?.title).toBe('nuevo')
    expect(s.withoutPrice).toBe(1)
    expect(moneyStats([disc({ purchasePrice: 650 })]).lead).toBe('Llevas $650 en 1 disco.')
    expect(moneyStats([disc({})]).lead).toBe('Ponle precio a tus discos y te digo cuánto llevas.')
  })
})

describe('B4 · familia', () => {
  it('cuenta por quien agregó y promedia por persona', () => {
    const s = familyStats([...many(3, { addedBy: 'u1', ratings: { u1: { rating: 8, at: '' }, u2: { rating: 10, at: '' } } }), disc({ addedBy: 'u2' }), disc({})], (uid) => (uid === 'u1' ? 'Santiago' : 'Ana'))
    expect(s.lead).toBe('Santiago ha agregado 3; Ana, 1.')
    expect(s.without).toBe(1)
    // Empate en calificados: por nombre.
    expect(s.raters).toEqual([{ uid: 'u2', name: 'Ana', count: 3, avg: 5 }, { uid: 'u1', name: 'Santiago', count: 3, avg: 4 }])
  })
})

describe('dona · rebanadas', () => {
  const rows = (counts: number[]) => counts.map((count, i) => ({ key: `k${i}`, label: `C${i}`, count }))
  it('top 5 en su orden y "Otros" con la suma y el número del resto', () => {
    const s = donutSlices(rows([7, 7, 4, 3, 3, 2, 2, 1, 1]), { top: 5 })
    expect(s.map((x) => `${x.label} ${x.count}`)).toEqual(['C0 7', 'C1 7', 'C2 4', 'C3 3', 'C4 3', 'Otros 6'])
    expect(s.at(-1)).toMatchObject({ key: OTHER_KEY, rest: 4 })
    expect(s[0].start).toBe(0)
    expect(s[0].end).toBeCloseTo((7 / 30) * 360)
    for (let i = 1; i < s.length; i++) expect(s[i].start).toBeCloseTo(s[i - 1].end)
    expect(s.at(-1)!.end).toBe(360)
    expect(s.reduce((a, x) => a + x.pct, 0)).toBe(100)
  })
  it('con menos categorías que el tope no hay "Otros"; las de 0 no entran', () => {
    const s = donutSlices(rows([5, 3, 0]))
    expect(s.map((x) => x.key)).toEqual(['k0', 'k1'])
    expect(s.every((x) => x.rest === undefined)).toBe(true)
    // 62.5 y 37.5 redondean a 63 y 38: el punto de más se lo quita la mayor.
    expect(s.map((x) => x.pct)).toEqual([62, 38])
  })
  it('una sola rebanada es el anillo completo', () => {
    expect(donutSlices(rows([4]))).toEqual([{ key: 'k0', label: 'C0', count: 4, pct: 100, start: 0, end: 360 }])
    expect(donutSlices(rows([0, 0]))).toEqual([])
  })
  it('los porcentajes cierran en 100 con el ajuste en la mayor no empatada (si todas empatan, la primera)', () => {
    expect(donutSlices(rows([1, 1, 1])).map((x) => x.pct)).toEqual([34, 33, 33])
    expect(donutSlices(rows([2, 1, 1, 1, 1, 1])).map((x) => x.pct)).toEqual([30, 14, 14, 14, 14, 14])
    // Como los lugares de la semilla: Discogs y Discos Roma empatan con 12 y deben decir lo mismo; el punto de más lo pone Mercado Libre.
    expect(donutSlices(rows([12, 12, 10, 8, 6, 5, 4])).map((x) => `${x.count}:${x.pct}`)).toEqual(['12:21', '12:21', '10:17', '8:14', '6:11', '9:16'])
  })
  it('orden estable: no reordena lo que recibe, y la cola lleva el nombre que se le pida', () => {
    const s = donutSlices(rows([2, 5, 3, 1]), { top: 2, otherLabel: 'Otras décadas' })
    expect(s.map((x) => x.key)).toEqual(['k0', 'k1', OTHER_KEY])
    expect(s[2]).toMatchObject({ label: 'Otras décadas', count: 4, rest: 2 })
  })
})
