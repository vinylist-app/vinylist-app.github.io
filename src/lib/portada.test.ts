import { afterEach, describe, expect, it, vi } from 'vitest'
import { coverChain, coverToSave, resolveCover, thumbFor } from './portada'
import type { ReleaseCandidate } from '../types'

const mb: ReleaseCandidate = {
  source: 'musicbrainz',
  sourceId: 'rel-1',
  title: 'Rumours',
  artist: 'Fleetwood Mac',
  thumbUrl: 'https://coverartarchive.org/release/rel-1/front-250',
  coverUrl: 'https://coverartarchive.org/release/rel-1/front-500',
  musicbrainzReleaseGroupId: 'rg-1',
  altCoverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg',
  genres: [],
  styles: [],
}

describe('coverChain', () => {
  it('miniatura: edición, grupo de lanzamiento (250) y Apple Music en 300', () => {
    expect(coverChain(mb, 'thumb')).toEqual([
      'https://coverartarchive.org/release/rel-1/front-250',
      'https://coverartarchive.org/release-group/rg-1/front-250',
      'https://is1-ssl.mzstatic.com/image/thumb/Music/x/300x300bb.jpg',
    ])
  })
  it('portada grande: edición, grupo de lanzamiento (500) y Apple Music en 600', () => {
    expect(coverChain(mb, 'cover')).toEqual([
      'https://coverartarchive.org/release/rel-1/front-500',
      'https://coverartarchive.org/release-group/rg-1/front-500',
      'https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg',
    ])
  })
  it('sin repetidos ni vacíos; sin grupo ni respaldo, solo lo propio', () => {
    expect(coverChain({ coverUrl: 'https://coverartarchive.org/release-group/rg-1/front-500', musicbrainzReleaseGroupId: 'rg-1' }, 'cover')).toEqual(['https://coverartarchive.org/release-group/rg-1/front-500'])
    expect(coverChain({}, 'thumb')).toEqual([])
    expect(coverChain({ thumbUrl: '', coverUrl: 'https://i.discogs.com/a.jpeg' }, 'thumb')).toEqual(['https://i.discogs.com/a.jpeg'])
  })
  it('Discogs: solo sus propias URLs', () => {
    const d = { thumbUrl: 'https://i.discogs.com/t.jpeg', coverUrl: 'https://i.discogs.com/c.jpeg' }
    expect(coverChain(d, 'thumb')).toEqual(['https://i.discogs.com/t.jpeg'])
    expect(coverChain(d, 'cover')).toEqual(['https://i.discogs.com/c.jpeg'])
  })
})

describe('thumbFor', () => {
  it('Cover Art Archive front-500 → front-250; Apple Music 600 → 300; lo demás igual', () => {
    expect(thumbFor('https://coverartarchive.org/release-group/rg-1/front-500')).toBe('https://coverartarchive.org/release-group/rg-1/front-250')
    expect(thumbFor('https://coverartarchive.org/release/rel-1/front-250')).toBe('https://coverartarchive.org/release/rel-1/front-250')
    expect(thumbFor('https://is1-ssl.mzstatic.com/image/thumb/Music/x/600x600bb.jpg')).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music/x/300x300bb.jpg')
    expect(thumbFor('https://i.discogs.com/c.jpeg')).toBe('https://i.discogs.com/c.jpeg')
  })
})

/** `Image` falsa: carga lo que no diga "falla"; lo demás da error. */
class FakeImage {
  static loaded: string[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(url: string) {
    FakeImage.loaded.push(url)
    queueMicrotask(() => (url.includes('falla') ? this.onerror?.() : this.onload?.()))
  }
}

describe('resolveCover', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sin Image (Node) devuelve la primera de la cadena', async () => {
    expect(await resolveCover(['a', 'b'])).toBe('a')
    expect(await resolveCover([])).toBeUndefined()
  })
  it('con Image: la primera que carga; las que fallan se saltan', async () => {
    FakeImage.loaded = []
    vi.stubGlobal('Image', FakeImage)
    expect(await resolveCover(['https://x/falla-1', 'https://x/carga-2', 'https://x/carga-3'])).toBe('https://x/carga-2')
    expect(FakeImage.loaded).toEqual(['https://x/falla-1', 'https://x/carga-2'])
    expect(await resolveCover(['https://x/falla-1', 'https://x/falla-2'])).toBeUndefined()
  })
  it('una imagen que nunca responde pasa a la siguiente por tiempo', async () => {
    vi.useFakeTimers()
    class Muda extends FakeImage {
      override set src(url: string) {
        if (!url.includes('muda')) super.src = url
      }
    }
    vi.stubGlobal('Image', Muda)
    const p = resolveCover(['https://x/muda', 'https://x/carga'], 100)
    await vi.advanceTimersByTimeAsync(150)
    expect(await p).toBe('https://x/carga')
    vi.useRealTimers()
  })
})

describe('coverToSave', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('MusicBrainz: guarda la que cargó y su miniatura', async () => {
    vi.stubGlobal('Image', FakeImage)
    const c = { ...mb, thumbUrl: 'https://coverartarchive.org/release/falla/front-250', coverUrl: 'https://coverartarchive.org/release/falla/front-500' }
    expect(await coverToSave(c)).toEqual({ coverUrl: 'https://coverartarchive.org/release-group/rg-1/front-500', thumbUrl: 'https://coverartarchive.org/release-group/rg-1/front-250' })
  })
  it('si ninguna carga, o es de Discogs, se queda lo que traía', async () => {
    vi.stubGlobal('Image', FakeImage)
    const c = { ...mb, thumbUrl: 'https://x/falla-t', coverUrl: 'https://x/falla-c', musicbrainzReleaseGroupId: undefined, altCoverUrl: undefined }
    expect(await coverToSave(c)).toEqual({ coverUrl: 'https://x/falla-c', thumbUrl: 'https://x/falla-t' })
    const d: ReleaseCandidate = { ...mb, source: 'discogs', thumbUrl: 'https://i.discogs.com/falla-t', coverUrl: 'https://i.discogs.com/falla-c' }
    expect(await coverToSave(d)).toEqual({ coverUrl: 'https://i.discogs.com/falla-c', thumbUrl: 'https://i.discogs.com/falla-t' })
  })
})
