import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReleaseCandidate } from '../types'

const discogs = { configured: false, text: vi.fn(), barcode: vi.fn() }
const mb = { text: vi.fn(), barcode: vi.fn() }
const itunes = { art: vi.fn() }
vi.mock('./discogs', () => ({ discogsConfigured: () => discogs.configured, searchByText: discogs.text, searchByBarcode: discogs.barcode }))
vi.mock('./musicbrainz', () => ({ searchByText: mb.text, searchByBarcode: mb.barcode }))
vi.mock('./itunes', () => ({ searchArtwork: itunes.art }))

const cand = (o: Partial<ReleaseCandidate>): ReleaseCandidate => ({ source: 'musicbrainz', sourceId: 'x', title: 'Rumours', artist: 'Fleetwood Mac', genres: [], styles: [], ...o })
const art = (pairs: [string, string, string][]) => new Map(pairs.map(([a, t, u]) => [`${a.toLowerCase()}|${t.toLowerCase()}`, u]))

describe('lookupText', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    discogs.configured = false
  })

  it('ruta MusicBrainz: Apple Music va en paralelo y pone altCoverUrl donde coincide artista y título', async () => {
    const { lookupText } = await import('./lookup')
    mb.text.mockResolvedValue([cand({ sourceId: 'fm' }), cand({ sourceId: 'hot', artist: 'Hot Chocolate' })])
    itunes.art.mockResolvedValue(art([['Fleetwood Mac', 'Rumours', 'https://m/fm/600x600bb.jpg']]))
    const found = await lookupText('rumours')
    expect(itunes.art).toHaveBeenCalledWith('rumours')
    expect(found.map((c) => c.altCoverUrl)).toEqual(['https://m/fm/600x600bb.jpg', undefined])
    expect(discogs.text).not.toHaveBeenCalled()
  })

  it('con Discogs configurado y resultados, no se toca ni MusicBrainz ni Apple Music', async () => {
    const { lookupText } = await import('./lookup')
    discogs.configured = true
    discogs.text.mockResolvedValue([cand({ source: 'discogs', sourceId: '1' })])
    const found = await lookupText('rumours')
    expect(found).toHaveLength(1)
    expect(mb.text).not.toHaveBeenCalled()
    expect(itunes.art).not.toHaveBeenCalled()
  })

  it('código de barras por MusicBrainz: una sola consulta a Apple Music con artista y título del primero', async () => {
    const { lookupBarcode } = await import('./lookup')
    mb.barcode.mockResolvedValue([cand({ sourceId: 'fm' })])
    itunes.art.mockResolvedValue(art([['Fleetwood Mac', 'Rumours', 'https://m/fm/600x600bb.jpg']]))
    const found = await lookupBarcode('075992731317')
    expect(itunes.art).toHaveBeenCalledTimes(1)
    expect(itunes.art).toHaveBeenCalledWith('Fleetwood Mac Rumours')
    expect(found[0].altCoverUrl).toBe('https://m/fm/600x600bb.jpg')
    mb.barcode.mockResolvedValue([])
    expect(await lookupBarcode('0')).toEqual([])
    expect(itunes.art).toHaveBeenCalledTimes(1)
  })
})
