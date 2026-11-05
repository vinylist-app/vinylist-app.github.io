import type { ReactNode } from 'react'
import type { ReleaseCandidate } from '../types'
import { Cover } from './AlbumCard'
import { coverChain } from '../lib/portada'
import { spotifySearchUrl } from '../lib/spotify'
import { ChevronIcon } from './VistaIcons'

interface Props {
  candidates: ReleaseCandidate[]
  onPick: (c: ReleaseCandidate) => void
  busyId?: string
  /** Texto del botón de cada fila; por omisión "Ver ›" (abre la vista previa). */
  pickLabel?: ReactNode
  /** Edición que ya se está viendo: su botón se deshabilita. */
  currentId?: string
}

/** Lista de ediciones encontradas para que el usuario elija la que tiene en la mano. */
export function CandidateList({ candidates, onPick, busyId, pickLabel, currentId }: Props) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {candidates.map((c) => {
        const current = currentId !== undefined && c.sourceId === currentId
        return (
          <div className="result" key={`${c.source}-${c.sourceId}`}>
            <Cover srcs={coverChain(c, 'thumb')} title="" className="thumb" />
            <div className="grow stack" style={{ gap: 2 }}>
              <span className="result__title">{c.title}</span>
              <span className="result__meta">{c.artist}{c.year ? ` · ${c.year}` : ''}</span>
              <span className="result__code">{[c.label, c.catalogNumber, c.country, c.format].filter(Boolean).join(' · ')}</span>
              <a className="result__meta" href={spotifySearchUrl(c.artist, c.title)} target="_blank" rel="noreferrer" aria-label={`Escuchar «${c.title}» en Spotify`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, margin: '-10px 0', color: 'var(--accent)', fontWeight: 700 }}>Escuchar en Spotify</a>
            </div>
            <button className={`btn btn--sm ${pickLabel ? 'btn--primary' : ''}`} onClick={() => onPick(c)} disabled={busyId === c.sourceId || current} aria-label={`${pickLabel ? 'Elegir' : 'Ver'} ${c.title}${c.year ? ` (${c.year})` : ''}`} style={{ paddingRight: pickLabel ? undefined : 10 }}>
              {busyId === c.sourceId ? '…' : current ? 'La actual' : pickLabel ?? <>Ver <ChevronIcon width={18} height={18} style={{ marginLeft: -4 }} /></>}
            </button>
          </div>
        )
      })}
      <span className="muted">{candidates[0]?.source === 'musicbrainz' ? 'Datos de MusicBrainz; portadas de Cover Art Archive y Apple Music' : 'Datos e imágenes de Discogs'}</span>
    </div>
  )
}
