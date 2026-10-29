import type { CSSProperties } from 'react'
import { StarPath } from './Icons'
import { starFill } from '../lib/rating'
import { ariaTextFor } from '../lib/starSlider'

interface Props {
  /** 1 a 10, o undefined (todas vacías). */
  value?: number
  /** 'sm' = 16 px (tarjetas), 'md' = 40 px, o un número de píxeles por estrella. */
  size?: 'sm' | 'md' | number
}

/**
 * Cinco estrellas de solo lectura, con medias. Para calificar se usa StarSlider.
 * La estrella vacía lleva solo el contorno petróleo; la llena, el relleno de la etiqueta.
 */
export function StarRating({ value, size = 'md' }: Props) {
  const px = typeof size === 'number' ? size : size === 'sm' ? 16 : 40
  const custom = typeof size === 'number'
  const wrapStyle: CSSProperties | undefined = custom ? { gap: Math.max(2, Math.round(px / 8)) } : undefined
  const starStyle: CSSProperties | undefined = custom ? { width: px, height: px } : undefined
  return (
    <div className={`stars ${size === 'sm' ? 'stars--sm' : ''}`} style={wrapStyle} role="img" aria-label={ariaTextFor(value)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = starFill(value, i)
        const width = fill === 'full' ? '100%' : fill === 'half' ? '50%' : '0%'
        return (
          <div className="star" key={i} style={starStyle}>
            <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="var(--star-empty)" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true"><StarPath /></svg>
            <div className="star__fill" style={{ width }}>
              <svg width={px} height={px} viewBox="0 0 24 24" fill="var(--star)" stroke="var(--star)" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true"><StarPath /></svg>
            </div>
          </div>
        )
      })}
    </div>
  )
}
