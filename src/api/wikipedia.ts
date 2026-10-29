import { trimExtract, wikidataQid } from '../lib/context/pure'

/**
 * Wikidata + Wikipedia, sin clave. Se llega al artículo desde el enlace de
 * Wikidata que MusicBrainz guarda en el grupo de lanzamiento:
 *   Q… → Special:EntityData (sitelinks) → es.wikipedia (o en.) → resumen (REST).
 * Un 404 o un bloqueo de CORS se trata como "no hay artículo", no como error.
 */
const TIMEOUT_MS = 12000

export interface WikiSummary {
  /** Resumen recortado en fin de oración (~320 caracteres). */
  extract: string
  /** Enlace al artículo completo. */
  url: string
  lang: 'es' | 'en'
  title: string
}

export { wikidataQid }

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return undefined
    return (await res.json()) as T
  } catch {
    // Sin red, CORS o tiempo agotado: no hay artículo que mostrar.
    return undefined
  }
}

interface EntityData {
  entities?: Record<string, { sitelinks?: Record<string, { title: string }> }>
}

/** Títulos del artículo en español e inglés, si existen. */
export async function wikidataSitelinks(qid: string): Promise<{ es?: string; en?: string }> {
  const data = await getJson<EntityData>(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`)
  const links = data?.entities?.[qid]?.sitelinks
  return { es: links?.eswiki?.title, en: links?.enwiki?.title }
}

interface RestSummary {
  extract?: string
  type?: string
  content_urls?: { desktop?: { page?: string } }
}

/** Resumen de un artículo de Wikipedia por título. */
export async function wikipediaSummary(lang: 'es' | 'en', title: string): Promise<WikiSummary | undefined> {
  const data = await getJson<RestSummary>(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  if (!data?.extract || data.type === 'disambiguation') return undefined
  const extract = trimExtract(data.extract)
  if (!extract) return undefined
  return { extract, url: data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`, lang, title }
}

/** Del Q de Wikidata al resumen, español primero. null = no hay artículo (se guarda para no volver a preguntar). */
export async function summaryForWikidata(qid: string): Promise<WikiSummary | null> {
  const links = await wikidataSitelinks(qid)
  if (links.es) {
    const es = await wikipediaSummary('es', links.es)
    if (es) return es
  }
  if (links.en) {
    const en = await wikipediaSummary('en', links.en)
    if (en) return en
  }
  return null
}
