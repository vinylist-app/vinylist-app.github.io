/** Un disco de la colección. */
export interface Album {
  /** UUID; el mismo en el celular y en la nube. */
  id: string
  /** A qué colección pertenece: 'local' (este celular, sin cuenta) o el id de la colección en la nube. */
  collectionId: string
  title: string
  artist: string
  year?: number
  /** Sello discográfico. */
  label?: string
  /** Número de catálogo, útil para discos sin código de barras. */
  catalogNumber?: string
  country?: string
  /** Géneros amplios (Rock, Jazz…). */
  genres: string[]
  /** Estilos finos (Soft Rock, Bebop…). */
  styles: string[]
  /** LP, 7", 12", 2xLP… */
  format?: string
  barcode?: string
  coverUrl?: string
  thumbUrl?: string
  tracklist: Track[]
  /** ID del lanzamiento en Discogs, para actualizar datos después. */
  discogsId?: number
  /** MBID del lanzamiento en MusicBrainz. */
  musicbrainzId?: string
  /** Master de Discogs (el álbum sin importar la edición). */
  discogsMasterId?: number
  musicbrainzArtistId?: string
  musicbrainzReleaseGroupId?: string
  /** ID del álbum en Spotify, si MusicBrainz lo conoce; undefined = no se ha buscado o no hay. */
  spotifyAlbumId?: string
  /** Última vez que se intentó encontrar el ID de Spotify. */
  spotifyCheckedAt?: string
  /** MI calificación, de 1 a 10 (medias estrellas). Sin calificar = undefined. En la nube sale de `ratings`. */
  rating?: number
  /** Cuándo califiqué por última vez. */
  ratedAt?: string
  /** Calificación de cada persona de la colección (uid → calificación). Solo con nube. */
  ratings?: Record<string, PersonRating>
  /** Estado del disco y de la funda, escala Goldmine. */
  mediaCondition?: Condition
  sleeveCondition?: Condition
  /** Dónde está guardado físicamente. */
  location?: string
  purchaseDate?: string
  purchasePrice?: number
  purchasePlace?: string
  notes?: string
  /** uid de quien lo agregó (nube). */
  addedBy?: string
  addedAt: string
  updatedAt: string
}

export interface PersonRating {
  /** 1 a 10. */
  rating: number
  at: string
}

export interface Track {
  position: string
  title: string
  duration?: string
}

export type Condition = 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P'

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'M', label: 'Mint (nuevo)' },
  { value: 'NM', label: 'Near Mint' },
  { value: 'VG+', label: 'Very Good Plus' },
  { value: 'VG', label: 'Very Good' },
  { value: 'G+', label: 'Good Plus' },
  { value: 'G', label: 'Good' },
  { value: 'F', label: 'Fair' },
  { value: 'P', label: 'Poor' },
]

/** Resultado de buscar en Discogs o MusicBrainz, antes de agregarlo. */
export interface ReleaseCandidate {
  source: 'discogs' | 'musicbrainz'
  sourceId: string
  title: string
  artist: string
  year?: number
  label?: string
  catalogNumber?: string
  country?: string
  format?: string
  thumbUrl?: string
  coverUrl?: string
  barcode?: string
  genres: string[]
  styles: string[]
  discogsMasterId?: number
  musicbrainzArtistId?: string
  musicbrainzReleaseGroupId?: string
  /** Cuántos coleccionistas lo tienen y lo buscan en Discogs (viene en la búsqueda). */
  community?: { have?: number; want?: number }
}

/** Un disco que alguien de la colección quiere. */
export interface WishlistItem {
  id: string
  collectionId: string
  title: string
  artist: string
  year?: number
  coverUrl?: string
  thumbUrl?: string
  discogsId?: number
  discogsMasterId?: number
  musicbrainzReleaseGroupId?: string
  barcode?: string
  /** Quién lo quiere: uid en la nube, o el nombre local sin cuenta. */
  wantedBy: string
  /** Nombre para mostrar de quien lo quiere. */
  wantedByName: string
  /** Quién lo apartó para regalarlo (el que lo quiere no lo ve). uid o nombre local. */
  reservedBy?: string
  reservedByName?: string
  addedAt: string
}

/** Una colección compartida en la nube: la de una familia. */
export interface Collection {
  id: string
  name: string
  ownerUid: string
  members: Record<string, Member>
  /** Código del enlace de invitación (p. ej. "K7M2QX"). */
  inviteCode?: string
  /** Token personal de Discogs de la familia; solo lo leen los miembros. Nunca va en el código. */
  discogsToken?: string
  createdAt: string
}

export interface Member {
  name: string
  role: 'owner' | 'editor'
  joinedAt: string
}

/** Quien usa la app, con o sin cuenta. */
export interface Person {
  uid: string
  name: string
  email?: string
}
