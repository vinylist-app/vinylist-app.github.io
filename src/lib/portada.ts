import { releaseGroupCoverUrl } from '../api/musicbrainz'
import type { ReleaseCandidate } from '../types'

/**
 * Portadas con respaldo. Cover Art Archive solo tiene imagen de la edición exacta si alguien
 * la subió; la del grupo de lanzamiento casi siempre existe para discos conocidos, y Apple Music
 * cubre lo que falte. Lo de Discogs trae sus propias imágenes: su cadena son solo esas.
 */
export interface CoverSource {
  coverUrl?: string
  thumbUrl?: string
  musicbrainzReleaseGroupId?: string
  /** Portada de respaldo (Apple Music, 600×600). */
  altCoverUrl?: string
}

/** `…/600x600bb.jpg` y parecidos de Apple Music. */
const ITUNES_SIZE = /\/\d+x\d+bb(\.[a-z0-9]+)?$/i

/** URLs a probar en orden para la miniatura o la portada grande: edición, grupo de lanzamiento, Apple Music. Sin vacíos ni repetidos. */
export function coverChain(x: CoverSource, size: 'thumb' | 'cover'): string[] {
  const own = size === 'thumb' ? x.thumbUrl || x.coverUrl : x.coverUrl || x.thumbUrl
  const group = x.musicbrainzReleaseGroupId ? releaseGroupCoverUrl(x.musicbrainzReleaseGroupId, size === 'thumb' ? 250 : 500) : undefined
  const alt = x.altCoverUrl && size === 'thumb' ? thumbFor(x.altCoverUrl) : x.altCoverUrl
  const chain: string[] = []
  for (const u of [own, group, alt]) if (u && !chain.includes(u)) chain.push(u)
  return chain
}

/** La miniatura equivalente a una portada: Cover Art Archive front-500 → front-250, Apple Music 600x600bb → 300x300bb; otra, igual. */
export function thumbFor(url: string): string {
  if (/^https:\/\/coverartarchive\.org\//i.test(url)) return url.replace(/\/front-(500|1200)$/, '/front-250')
  return url.replace(ITUNES_SIZE, '/300x300bb$1')
}

/** Primera URL de la cadena que de verdad carga como imagen. Sin `Image` (Node, pruebas), la primera. */
export async function resolveCover(chain: string[], timeoutMs = 4000): Promise<string | undefined> {
  if (typeof Image === 'undefined') return chain[0]
  for (const url of chain) if (await loads(url, timeoutMs)) return url
  return undefined
}

function loads(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = (ok: boolean) => {
      clearTimeout(timer)
      img.onload = img.onerror = null
      resolve(ok)
    }
    // Al vencer el tiempo, vaciar la fuente corta la descarga; ya sin manejadores, el onerror que eso dispara no entra aquí.
    timer = setTimeout(() => {
      done(false)
      img.src = ''
    }, timeoutMs)
    img.onload = () => done(true)
    img.onerror = () => done(false)
    img.src = url
  })
}

/** Al guardar, la vista previa ya cargó la cadena (está en caché); si Cover Art Archive no responde, no vale la pena esperar más por cada URL. */
const SAVE_TIMEOUT_MS = 2500

/**
 * Lo que se guarda como portada al agregar una edición a la colección o a deseos: para MusicBrainz,
 * la URL de la cadena que de verdad carga y su miniatura; si ninguna carga (o es de Discogs), lo que traía.
 */
export async function coverToSave(c: ReleaseCandidate, timeoutMs = SAVE_TIMEOUT_MS): Promise<{ coverUrl?: string; thumbUrl?: string }> {
  if (c.source === 'musicbrainz') {
    const real = await resolveCover(coverChain(c, 'cover'), timeoutMs)
    if (real) return { coverUrl: real, thumbUrl: thumbFor(real) }
  }
  return { coverUrl: c.coverUrl, thumbUrl: c.thumbUrl }
}
