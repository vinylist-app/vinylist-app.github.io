import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Album } from '../types'
import { coverChain } from '../lib/portada'
import { StarRating } from './StarRating'

/** Iniciales para las miniaturas sin portada: "Sketches of Spain" → "SS". */
function initials(title: string): string {
  const words = title.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·'
}

/**
 * Portada. Con `srcs` prueba cada URL en orden (edición, grupo de lanzamiento, Apple Music) sin que
 * la caja salte; si ninguna carga (o no hay), muestra el título (o sus iniciales, en chico) sobre un fondo.
 */
export function Cover({ src, srcs, title, className = 'cover' }: { src?: string; srcs?: string[]; title: string; className?: string }) {
  const list = srcs ?? (src ? [src] : [])
  const key = list.join('\n')
  // Cuál URL de la cadena se está mostrando; si la cadena cambia, se vuelve a empezar.
  const [tried, setTried] = useState({ key, i: 0 })
  const i = tried.key === key ? tried.i : 0
  const current = list[i]
  if (current) return <img className={className} src={current} alt="" loading="lazy" onError={() => setTried({ key, i: i + 1 })} />
  const small = className.includes('thumb') || className.includes('wish__cover')
  return <div className={`${className} cover--placeholder`} aria-label={title}>{small ? initials(title) : title}</div>
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link to={`/album/${album.id}`} className="album-card">
      <Cover srcs={coverChain(album, 'cover')} title={album.title} />
      <div className="stack" style={{ gap: 3 }}>
        <span className="album-card__title">{album.title}</span>
        <span className="album-card__meta">{album.artist}{album.year ? ` · ${album.year}` : ''}</span>
        {album.rating ? <StarRating value={album.rating} size="sm" /> : <span className="eyebrow">Sin calificar</span>}
      </div>
    </Link>
  )
}
