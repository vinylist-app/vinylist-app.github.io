/**
 * "Te cuenta": lo que la app sabe decir de un disco antes de agregarlo.
 * Cada línea es un Fact: un medallón con símbolo, un título en negritas y un detalle.
 */
export type FactIcon = '1.º' | '≈' | '★' | 'i' | '♥' | '↑'

export type FactSource = 'colección' | 'MusicBrainz' | 'Wikipedia' | 'Discogs' | 'ListenBrainz'

export interface Fact {
  /** Para ordenar y para que una fuente remota complete una línea local (p. ej. 'artista'). */
  id: string
  icon: FactIcon
  title: string
  detail?: string
  source?: FactSource
  /** Enlace externo ("Leer más"). */
  url?: string
  /** Idioma del artículo cuando la fuente es Wikipedia. */
  lang?: 'es' | 'en'
}

/** Lo mínimo que hay que saber de un disco para contarle algo: sirve un candidato o un disco ya guardado. */
export interface DiscRef {
  title: string
  artist: string
  year?: number
  genres: string[]
  styles: string[]
  discogsId?: number
  discogsMasterId?: number
  musicbrainzArtistId?: string
  musicbrainzReleaseGroupId?: string
  barcode?: string
  /** Cuántos lo tienen y lo buscan en Discogs. */
  community?: { have?: number; want?: number }
  /** Si el disco ya está en la colección, su id, para no compararlo consigo mismo. */
  ownAlbumId?: string
}

/** Veredicto corto según los gustos: solo con suficientes discos calificados. */
export type Verdict = 'Pinta para ti' | 'Algo distinto a lo tuyo' | 'Terreno nuevo'
