import { addAlbum, cached, findDuplicate, type DuplicateMatch } from '../db'
import { getRelease } from '../api/discogs'
import { coverToSave } from './portada'
import type { Album, ReleaseCandidate } from '../types'

/**
 * Convierte una edición encontrada en un disco de la colección.
 * Si viene de Discogs, pide la ficha completa (canciones, portada grande) con la misma
 * llave de caché que la vista previa, así no se vuelve a pedir lo que ya se mostró.
 * Si viene de MusicBrainz, antes de guardar averigua cuál portada de la cadena carga de verdad.
 */
export async function albumFromCandidate(c: ReleaseCandidate): Promise<Omit<Album, 'id' | 'addedAt' | 'updatedAt' | 'collectionId'>> {
  if (c.source === 'discogs') {
    try {
      const d = await cached(`dg:release:${c.sourceId}`, 30, () => getRelease(Number(c.sourceId)))
      return {
        title: d.title,
        artist: d.artist,
        year: d.year ?? c.year,
        label: d.label ?? c.label,
        catalogNumber: d.catalogNumber ?? c.catalogNumber,
        country: d.country ?? c.country,
        genres: d.genres.length ? d.genres : c.genres,
        styles: d.styles.length ? d.styles : c.styles,
        format: d.format ?? c.format,
        barcode: d.barcode ?? c.barcode,
        coverUrl: d.coverUrl ?? c.coverUrl,
        thumbUrl: d.thumbUrl ?? c.thumbUrl,
        tracklist: d.tracklist,
        discogsId: Number(c.sourceId),
        discogsMasterId: c.discogsMasterId ?? d.masterId,
        musicbrainzArtistId: c.musicbrainzArtistId,
        musicbrainzReleaseGroupId: c.musicbrainzReleaseGroupId,
      }
    } catch {
      // Si la ficha completa falla, guardamos lo que ya tenemos.
    }
  }
  const { coverUrl, thumbUrl } = await coverToSave(c)
  return {
    title: c.title,
    artist: c.artist,
    year: c.year,
    label: c.label,
    catalogNumber: c.catalogNumber,
    country: c.country,
    genres: c.genres,
    styles: c.styles,
    format: c.format,
    barcode: c.barcode,
    coverUrl,
    thumbUrl,
    tracklist: [],
    discogsId: c.source === 'discogs' ? Number(c.sourceId) : undefined,
    discogsMasterId: c.discogsMasterId,
    musicbrainzId: c.source === 'musicbrainz' ? c.sourceId : undefined,
    musicbrainzArtistId: c.musicbrainzArtistId,
    musicbrainzReleaseGroupId: c.musicbrainzReleaseGroupId,
  }
}

/** ¿Ya tienen esta edición (same) u otra edición del mismo álbum (other)? */
export async function duplicateOf(c: ReleaseCandidate): Promise<DuplicateMatch | undefined> {
  return findDuplicate({
    discogsId: c.source === 'discogs' ? Number(c.sourceId) : undefined,
    barcode: c.barcode,
    discogsMasterId: c.discogsMasterId,
    musicbrainzReleaseGroupId: c.musicbrainzReleaseGroupId,
    artist: c.artist,
    title: c.title,
  })
}

export async function addCandidate(c: ReleaseCandidate): Promise<Album> {
  const data = await albumFromCandidate(c)
  return addAlbum(data)
}
