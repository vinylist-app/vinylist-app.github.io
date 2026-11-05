import { afterEach, describe, expect, it, vi } from 'vitest'
import { largeArtwork, searchArtwork } from './itunes'
import { albumKey } from '../lib/text'

const results = [
  { artistName: 'Fleetwood Mac', collectionName: 'Rumours (Super Deluxe)', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/fm/100x100bb.jpg', collectionId: 1 },
  { artistName: 'Fleetwood Mac', collectionName: 'Rumours', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/fm2/100x100bb.jpg', collectionId: 2 },
  { artistName: 'Damage', collectionName: 'Rumours', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/dam/100x100bb.jpg' },
  { artistName: 'Sin arte', collectionName: 'Nada' },
]

describe('searchArtwork', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('una petición por álbumes; mapa por albumKey con la portada en 600×600 (la primera gana)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ resultCount: 4, results }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const art = await searchArtwork('fleetwood mac rumours')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe('https://itunes.apple.com/search')
    expect(url.searchParams.get('term')).toBe('fleetwood mac rumours')
    expect(url.searchParams.get('entity')).toBe('album')
    expect(url.searchParams.get('limit')).toBe('25')
    expect(art.get(albumKey('Fleetwood Mac', 'Rumours'))).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music/fm/600x600bb.jpg')
    expect(art.get(albumKey('Damage', 'Rumours'))).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music/dam/600x600bb.jpg')
    expect(art.size).toBe(2)
  })
  it('error de red, respuesta fea o tiempo agotado → mapa vacío, sin lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect((await searchArtwork('x')).size).toBe(0)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 403 })))
    expect((await searchArtwork('x')).size).toBe(0)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no es json', { status: 200 })))
    expect((await searchArtwork('x')).size).toBe(0)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError')))
    expect((await searchArtwork('x')).size).toBe(0)
  })
  it('largeArtwork cambia el tamaño al final de la URL', () => {
    expect(largeArtwork('https://a/100x100bb.jpg')).toBe('https://a/600x600bb.jpg')
    expect(largeArtwork('https://a/60x60bb.png')).toBe('https://a/600x600bb.png')
    expect(largeArtwork('https://a/otra.jpg')).toBe('https://a/otra.jpg')
  })
})
