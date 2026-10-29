import { useMemo } from 'react'
import type { Album, ReleaseCandidate } from '../types'
import { useAlbums, useWishlist } from '../data/hooks'
import { useSession } from '../session'
import type { DiscRef } from '../lib/context/types'
import { TeCuentaCard, useTeCuenta } from './TeCuenta'

/**
 * "Sobre el disco": la misma tarjeta "Te cuenta" de la vista previa, lista para
 * ponerla en la ficha de un disco ya guardado (o para un candidato). Carga sus
 * propios datos; basta con <AboutAlbum album={album} />.
 */
export function discRefOf(x: Album | ReleaseCandidate): DiscRef {
  if ('collectionId' in x) {
    return {
      title: x.title,
      artist: x.artist,
      year: x.year,
      genres: x.genres,
      styles: x.styles,
      discogsId: x.discogsId,
      discogsMasterId: x.discogsMasterId,
      musicbrainzArtistId: x.musicbrainzArtistId,
      musicbrainzReleaseGroupId: x.musicbrainzReleaseGroupId,
      barcode: x.barcode,
      ownAlbumId: x.id,
    }
  }
  return {
    title: x.title,
    artist: x.artist,
    year: x.year,
    genres: x.genres,
    styles: x.styles,
    discogsId: x.source === 'discogs' ? Number(x.sourceId) : undefined,
    discogsMasterId: x.discogsMasterId,
    musicbrainzArtistId: x.musicbrainzArtistId,
    musicbrainzReleaseGroupId: x.musicbrainzReleaseGroupId,
    barcode: x.barcode,
    community: x.community,
  }
}

export function AboutAlbum({ album, candidate }: { album?: Album; candidate?: ReleaseCandidate }) {
  const albums = useAlbums()
  const wishlist = useWishlist()
  const { person } = useSession()
  const subject = album ?? candidate
  const disc = useMemo(() => (subject ? discRefOf(subject) : undefined), [subject])
  const data = useTeCuenta(disc, albums, wishlist, { me: person.uid, alreadyOwned: Boolean(album), withVerdict: !album, withLocal: !album })
  if (!disc) return null
  return <TeCuentaCard data={data} />
}
