import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatLabel, mbGet, rankReleases, searchByBarcode, searchByText, vinylOnly, type MBRelease } from './musicbrainz'

/** Un lanzamiento como lo manda MusicBrainz, con lo justo para filtrar y ordenar. */
function release(id: string, o: { artist?: string; title?: string; type?: string; secondary?: string[]; formats?: string[] | null; date?: string; score?: number; rg?: string } = {}): MBRelease {
  return {
    id,
    title: o.title ?? 'Rumours',
    date: o.date,
    score: o.score ?? 100,
    'artist-credit': [{ name: o.artist ?? 'Fleetwood Mac', artist: { id: `art-${o.artist ?? 'fm'}` } }],
    ...(o.formats === null ? {} : { media: (o.formats ?? ['12" Vinyl']).map((format) => ({ format })) }),
    'release-group': { id: o.rg ?? `rg-${id}`, 'primary-type': o.type ?? 'Album', ...(o.secondary ? { 'secondary-types': o.secondary } : {}) },
  }
}

// Lo que devuelve MusicBrainz para "rumours": sencillos homónimos primero (mismo puntaje), el álbum de Fleetwood Mac después.
const fixture: MBRelease[] = [
  release('hot', { artist: 'Hot Chocolate', type: 'Single', formats: ['7" Vinyl'], date: '1973' }),
  release('kip', { artist: 'Kippington Lodge', type: 'Single', formats: ['7" Vinyl'], date: '1968' }),
  release('cd', { formats: ['CD'], date: '1990' }),
  release('fm-gb', { date: '1977-02-04', rg: 'rg-fm' }),
  release('fm-us', { formats: ['Vinyl'], rg: 'rg-fm' }),
  release('dig', { formats: ['Digital Media'], date: '2011' }),
  release('deluxe', { title: 'Rumours (Deluxe)', secondary: ['Compilation'], date: '2013' }),
  release('ep', { artist: 'Alguien', type: 'EP', date: '1999' }),
  release('sinmedia', { formats: null, date: '1977' }),
  release('viejo', { artist: 'Otro', type: 'Album', date: '1980', score: 80 }),
  release('dam', { artist: 'Damage', type: 'Single', date: '2000' }),
]

describe('vinylOnly', () => {
  it('se queda con lo que tenga algún medio en vinilo, sin importar pulgadas ni mayúsculas', () => {
    expect(vinylOnly(fixture).map((r) => r.id)).toEqual(['hot', 'kip', 'fm-gb', 'fm-us', 'deluxe', 'ep', 'viejo', 'dam'])
    expect(vinylOnly([release('x', { formats: ['CD', 'vinyl'] })])).toHaveLength(1)
  })
  it('los lanzamientos sin media quedan fuera por texto y pasan por código de barras', () => {
    expect(vinylOnly(fixture).some((r) => r.id === 'sinmedia')).toBe(false)
    expect(vinylOnly(fixture, true).some((r) => r.id === 'sinmedia')).toBe(true)
    expect(vinylOnly(fixture, true).some((r) => r.id === 'cd')).toBe(false)
  })
})

describe('rankReleases', () => {
  it('puntaje; luego álbum antes que EP y sencillo; sin tipos secundarios antes; con fecha antes; estable', () => {
    expect(rankReleases(vinylOnly(fixture)).map((r) => r.id)).toEqual(['fm-gb', 'fm-us', 'deluxe', 'ep', 'hot', 'kip', 'dam', 'viejo'])
  })
  it('no toca el arreglo original y respeta el tope', () => {
    const many = Array.from({ length: 50 }, (_, i) => release(`r${i}`, { score: 100 - (i % 5) }))
    const copy = [...many]
    const ranked = rankReleases(many)
    expect(ranked).toHaveLength(40)
    expect(ranked[0].score).toBe(100)
    expect(many).toEqual(copy)
    expect(rankReleases(many, 3)).toHaveLength(3)
  })
})

describe('formatLabel', () => {
  it('cuenta los medios repetidos y respeta el orden en que aparecen', () => {
    const media = (...formats: (string | undefined)[]) => formats.map((format) => ({ format }))
    expect(formatLabel(media('12" Vinyl', 'CD', 'CD', 'CD', 'DVD-Video'))).toBe('12" Vinyl, 3×CD, DVD-Video')
    expect(formatLabel(media('12" Vinyl', '12" Vinyl'))).toBe('2×12" Vinyl')
    expect(formatLabel(media('7" Vinyl'))).toBe('7" Vinyl')
    expect(formatLabel(media(undefined, 'CD'))).toBe('CD')
    expect(formatLabel([])).toBeUndefined()
    expect(formatLabel(undefined)).toBeUndefined()
  })
})

/** Respuesta JSON de MusicBrainz con estado dado. */
function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('searchByText', () => {
  const fetchMock = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>()
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function settled<T>(p: Promise<T>): Promise<T> {
    // Los temporizadores de la fila (1.1 s entre peticiones) y de los reintentos corren con el reloj falso.
    await vi.runAllTimersAsync()
    return p
  }

  it('pide la búsqueda simple (dismax) de 100 en 100 y regresa solo vinilos, ordenados', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { count: 11, offset: 0, releases: fixture }))
    const found = await settled(searchByText('rumours'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.pathname).toBe('/ws/2/release')
    expect(url.searchParams.get('query')).toBe('rumours')
    expect(url.searchParams.get('dismax')).toBe('true')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('fmt')).toBe('json')
    expect(found.map((c) => c.sourceId)).toEqual(['fm-gb', 'fm-us', 'deluxe', 'ep', 'hot', 'kip', 'dam', 'viejo'])
    expect(found[0]).toMatchObject({ source: 'musicbrainz', artist: 'Fleetwood Mac', year: 1977, format: '12" Vinyl', musicbrainzReleaseGroupId: 'rg-fm', thumbUrl: 'https://coverartarchive.org/release/fm-gb/front-250', coverUrl: 'https://coverartarchive.org/release/fm-gb/front-500' })
  })

  it('ante 503 reintenta (1.5 s y 3 s) y entrega el resultado a la tercera', async () => {
    fetchMock.mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200, { count: 1, releases: [fixture[3]] }))
    const found = await settled(searchByText('fleetwood mac'))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(found).toHaveLength(1)
  })

  it('tres 503 (o 429) seguidos: el aviso de saturación, con tres llamadas y no más', async () => {
    fetchMock.mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(429)).mockResolvedValueOnce(reply(503))
    const check = expect(searchByText('rumours')).rejects.toThrow('MusicBrainz está saturado. Espera unos segundos y vuelve a buscar.')
    await vi.runAllTimersAsync()
    await check
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('un trabajo de fondo que recibe 503 falla a la primera y no retiene la fila: la búsqueda sigue enseguida', async () => {
    const at: number[] = []
    fetchMock.mockImplementation(async () => {
      at.push(Date.now())
      return at.length === 1 ? reply(503) : reply(200, { count: 1, releases: [fixture[3]] })
    })
    const fondo = expect(mbGet('/artist', { query: 'artist:"x"', limit: 3 }, true)).rejects.toThrow('MusicBrainz está saturado')
    const found = settled(searchByText('rumours'))
    await fondo
    expect(await found).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Entre la petición de fondo y la del usuario solo pasa el espaciado de la fila (1.1 s), no la pausa del reintento.
    expect(at[1] - at[0]).toBeLessThan(1500)
  })

  it('otros errores siguen igual, sin reintento', async () => {
    fetchMock.mockResolvedValueOnce(reply(400))
    const check = expect(searchByText('rumours')).rejects.toThrow('MusicBrainz respondió 400')
    await vi.runAllTimersAsync()
    await check
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('pide la segunda página solo si la primera trae menos de 8 vinilos y hay más de 100', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => release(`cd${i}`, { formats: i < 3 ? ['12" Vinyl'] : ['CD'] }))
    const page2 = Array.from({ length: 20 }, (_, i) => release(`v${i}`, { formats: ['7" Vinyl'], type: 'Single' }))
    fetchMock.mockResolvedValueOnce(reply(200, { count: 120, offset: 0, releases: page1 })).mockResolvedValueOnce(reply(200, { count: 120, offset: 100, releases: page2 }))
    const found = await settled(searchByText('rumours'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const second = new URL(String(fetchMock.mock.calls[1][0]))
    expect(second.searchParams.get('offset')).toBe('100')
    expect(second.searchParams.get('dismax')).toBe('true')
    expect(found).toHaveLength(23)
    expect(found.slice(0, 3).map((c) => c.sourceId)).toEqual(['cd0', 'cd1', 'cd2'])
  })

  it('si la segunda página falla, se queda con lo que trajo la primera', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => release(`p${i}`, { formats: i < 3 ? ['12" Vinyl'] : ['CD'] }))
    fetchMock.mockResolvedValueOnce(reply(200, { count: 120, offset: 0, releases: page1 })).mockImplementation(async () => reply(503))
    const found = await settled(searchByText('rumours'))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(found.map((c) => c.sourceId)).toEqual(['p0', 'p1', 'p2'])
  })

  it('nunca pide una tercera página, aunque sigan faltando vinilos y haya más', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => release(`a${i}`, { formats: i < 2 ? ['12" Vinyl'] : ['CD'] }))
    const page2 = Array.from({ length: 100 }, (_, i) => release(`b${i}`, { formats: i < 1 ? ['12" Vinyl'] : ['CD'] }))
    fetchMock.mockResolvedValueOnce(reply(200, { count: 300, offset: 0, releases: page1 })).mockResolvedValueOnce(reply(200, { count: 300, offset: 100, releases: page2 }))
    const found = await settled(searchByText('rumours'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(found.map((c) => c.sourceId)).toEqual(['a0', 'a1', 'b0'])
  })

  it('con 8 o más vinilos, o sin más páginas, una sola petición', async () => {
    const pocos = Array.from({ length: 100 }, (_, i) => release(`r${i}`, { formats: i < 8 ? ['12" Vinyl'] : ['CD'] }))
    fetchMock.mockResolvedValueOnce(reply(200, { count: 500, releases: pocos }))
    expect(await settled(searchByText('a'))).toHaveLength(8)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(reply(200, { count: 100, releases: pocos.slice(0, 20) }))
    expect(await settled(searchByText('b'))).toHaveLength(8)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('searchByBarcode sigue con Lucene, sin dismax, y deja pasar lo que no trae media', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { count: 11, releases: fixture }))
    const found = await settled(searchByBarcode('0 075992-731317 '))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('query')).toBe('barcode:0075992731317')
    expect(url.searchParams.has('dismax')).toBe(false)
    expect(url.searchParams.get('limit')).toBe('25')
    expect(found.map((c) => c.sourceId)).toContain('sinmedia')
    expect(found.map((c) => c.sourceId)).not.toContain('cd')
  })
})
