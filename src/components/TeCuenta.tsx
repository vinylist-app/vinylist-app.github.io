import { useEffect, useMemo, useState } from 'react'
import type { Album, WishlistItem } from '../types'
import { buildProfile } from '../lib/taste/profile'
import { localFacts, otherAlbums, verdictFor } from '../lib/context/local'
import { mergeFacts, remoteFacts, sourcesOf } from '../lib/context/remote'
import { similarSeedsFromCache } from '../lib/context/similar'
import type { DiscRef, Fact, Verdict } from '../lib/context/types'
import { artistKey } from '../lib/text'
import '../styles/vista.css'

/**
 * La tarjeta "TE CUENTA": lo que la colección sabe al instante y lo que las
 * fuentes de internet van agregando. El hook arma las líneas; la tarjeta las pinta.
 */
export type RemoteStatus = 'idle' | 'loading' | 'done' | 'offline'

export interface TeCuentaData {
  facts: Fact[]
  verdict?: Verdict
  status: RemoteStatus
  /** "tu colección · MusicBrainz · Wikipedia…", solo las que se usaron. */
  sources: string[]
}

interface Options {
  /** uid de quien mira. */
  me?: string
  /** Ya lo tienen (para no decir "sería tu primer disco" desde la red). */
  alreadyOwned?: boolean
  /** Sin veredicto (en la ficha de un disco que ya es tuyo no tiene sentido). */
  withVerdict?: boolean
  /** Sin las líneas de "en tu colección" (en la ficha ya lo tienes; hablarían de un disco que falta). */
  withLocal?: boolean
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useTeCuenta(disc: DiscRef | undefined, albums: Album[] | undefined, wishlist: WishlistItem[] | undefined, opts: Options = {}): TeCuentaData {
  const profile = useMemo(() => buildProfile(albums ?? []), [albums])
  const [similarTo, setSimilarTo] = useState<string[]>([])
  const [remote, setRemote] = useState<Fact[]>([])
  const [status, setStatus] = useState<RemoteStatus>('idle')
  const [retry, setRetry] = useState(0)

  // Una llave estable para no repetir el trabajo remoto cuando solo cambia la colección.
  const discKey = disc ? `${disc.artist}|${disc.title}|${disc.musicbrainzReleaseGroupId ?? ''}|${disc.musicbrainzArtistId ?? ''}|${disc.year ?? ''}` : ''

  // Artistas parecidos que "Para ti" ya guardó en el celular (sin red).
  useEffect(() => {
    if (!disc || !albums) return
    let alive = true
    similarSeedsFromCache(profile, disc.artist, disc.musicbrainzArtistId).then((s) => { if (alive) setSimilarTo(s) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discKey, profile])

  // Lo remoto: se pide una vez por disco; si no hay internet, se reintenta al volver.
  useEffect(() => {
    if (!disc || !albums) return
    setRemote([])
    if (!online()) {
      setStatus('offline')
      const onOnline = () => setRetry((n) => n + 1)
      window.addEventListener('online', onOnline)
      return () => window.removeEventListener('online', onOnline)
    }
    setStatus('loading')
    const ctrl = new AbortController()
    const ownedOfArtist = otherAlbums(disc, albums).filter((a) => artistKey(a.artist) === artistKey(disc.artist))
    remoteFacts(disc, {
      ownedOfArtist,
      alreadyOwned: opts.alreadyOwned,
      signal: ctrl.signal,
      onFact: (f) => { if (!ctrl.signal.aborted) setRemote((prev) => [...prev.filter((x) => x.id !== f.id), f]) },
    })
      .catch(() => undefined)
      .finally(() => { if (!ctrl.signal.aborted) setStatus('done') })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discKey, albums === undefined, retry])

  return useMemo<TeCuentaData>(() => {
    if (!disc || !albums) return { facts: [], status: 'idle', sources: [] }
    const local = opts.withLocal === false ? [] : localFacts(disc, albums, wishlist ?? [], profile, { me: opts.me, similarTo })
    const facts = mergeFacts(local, remote)
    const verdict = opts.withVerdict === false ? undefined : verdictFor(disc, profile)
    return { facts, verdict, status, sources: sourcesOf(facts) }
  }, [disc, albums, wishlist, profile, similarTo, remote, status, opts.me, opts.withVerdict, opts.withLocal])
}

export function TeCuentaCard({ data }: { data: TeCuentaData }) {
  const { facts, verdict, status, sources } = data
  return (
    <section className="card vista-cuenta" aria-labelledby="tecuenta-h">
      <div className="vista-cuenta__head">
        <h3 id="tecuenta-h" className="eyebrow">Te cuenta</h3>
        {verdict && <span className="vista-pill">{verdict}</span>}
      </div>

      {facts.length === 0 && status !== 'loading' && (
        <p className="muted" style={{ margin: 0 }}>{status === 'offline' ? 'Sin internet no puedo contarte más de este disco; lo intento cuando vuelvas a tener conexión.' : 'Todavía no tengo nada que contarte de este disco.'}</p>
      )}

      {facts.length > 0 && (
        <ul className="vista-facts">
          {facts.map((f) => (
            <li className="vista-fact" key={f.id}>
              <span className="vista-medal" aria-hidden="true">{f.icon}</span>
              <div className="vista-fact__body">
                <span className="vista-fact__title">{f.title}</span>
                {f.detail && (
                  <span className="vista-fact__detail">
                    {f.detail}
                    {f.url && <> <a href={f.url} target="_blank" rel="noreferrer">Leer más<span className="visually-hidden"> en Wikipedia</span></a></>}
                  </span>
                )}
                {f.source === 'Wikipedia' && <span className="vista-fact__src">Wikipedia ({f.lang ?? 'es'})</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {status === 'loading' && (
        <div className="vista-loading" role="status" aria-live="polite">
          <span className="muted">Buscando qué contarte…</span>
          <i className="vista-skel" /><i className="vista-skel vista-skel--short" />
        </div>
      )}
      {status === 'offline' && <span className="muted">Sin internet: te cuento lo que sé de tu colección.</span>}

      {sources.length > 0 && <span className="vista-sources">Fuentes: {sources.join(' · ')}</span>}
    </section>
  )
}
