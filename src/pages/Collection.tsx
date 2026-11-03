import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAlbums } from '../data/hooks'
import { applyFilters, collectDecades, collectGenres, filtersFromParams, type Filters } from '../lib/filters'
import { AlbumCard } from '../components/AlbumCard'
import { BarsIcon, SearchIcon, ScanIcon, SettingsIcon } from '../components/Icons'
import { Logo } from '../components/Logo'

const SORTS: { value: Filters['sort']; label: string }[] = [
  { value: 'recent', label: 'Recientes' },
  { value: 'artist', label: 'Artista' },
  { value: 'title', label: 'Título' },
  { value: 'year', label: 'Año' },
  { value: 'rating', label: 'Calificación' },
]

export function Collection() {
  const loaded = useAlbums()
  // undefined mientras la base responde o la sesión arranca: se muestra "Cargando…", no el vacío de bienvenida.
  const cargando = loaded === undefined
  const albums = loaded ?? []
  // Los filtros iniciales pueden venir en la URL ("Ver en la colección" desde En números); no se sincronizan de vuelta.
  const [params] = useSearchParams()
  const [f, setF] = useState<Filters>(() => filtersFromParams(params))
  const genres = useMemo(() => collectGenres(albums).slice(0, 12), [albums])
  const decades = useMemo(() => collectDecades(albums), [albums])
  const shown = useMemo(() => applyFilters(albums, f), [albums, f])

  const conChips = Boolean(f.genre || f.decade !== undefined || f.minRating !== undefined)
  const filtrado = conChips || f.query.trim() !== ''
  const resumen = [
    f.genre,
    f.decade !== undefined && `años ${String(f.decade).slice(2)}`,
    f.minRating !== undefined && '4.5+ estrellas',
    f.sort !== 'recent' && `ordenado por ${SORTS.find((s) => s.value === f.sort)?.label ?? ''}`,
  ].filter(Boolean).join(' · ')

  return (
    <main className="page">
      <div className="header">
        <div className="stack" style={{ gap: 8 }}>
          <Logo />
          <div className="title-row">
            <h1>Colección</h1>
            {!cargando && <span className="badge">{filtrado ? `${shown.length} de ${albums.length}` : `${albums.length} ${albums.length === 1 ? 'disco' : 'discos'}`}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 0 }}>
          {albums.length > 0 && <Link to="/numeros" className="icon-btn icon-btn--ghost" aria-label="En números" style={{ marginRight: 0 }}><BarsIcon /></Link>}
          <Link to="/ajustes" className="icon-btn icon-btn--ghost" aria-label="Ajustes"><SettingsIcon /></Link>
        </div>
      </div>

      {albums.length > 0 && (
        <>
          <label className="search">
            <SearchIcon width={20} height={20} />
            <span className="visually-hidden">Buscar en la colección</span>
            <input type="search" placeholder="Busca por título o artista" value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} />
          </label>

          <div className="chips" role="group" aria-label="Filtrar y ordenar">
            <button className={`chip ${!conChips ? 'chip--on' : ''}`} onClick={() => setF({ ...f, genre: undefined, decade: undefined, minRating: undefined })}>Todos</button>
            {genres.map((g) => (
              <button key={g} className={`chip ${f.genre === g ? 'chip--on' : ''}`} onClick={() => setF({ ...f, genre: f.genre === g ? undefined : g })}>{g}</button>
            ))}
            {decades.map((d) => (
              <button key={d} className={`chip ${f.decade === d ? 'chip--on' : ''}`} onClick={() => setF({ ...f, decade: f.decade === d ? undefined : d })}>Años {String(d).slice(2)}</button>
            ))}
            <button className={`chip ${f.minRating === 9 ? 'chip--on' : ''}`} onClick={() => setF({ ...f, minRating: f.minRating === 9 ? undefined : 9 })}>4.5+ estrellas</button>
            <select className={`chip chip--select ${f.sort !== 'recent' ? 'chip--on' : ''}`} aria-label="Ordenar" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as Filters['sort'] })}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.value === 'recent' ? 'Orden' : s.label}</option>)}
            </select>
          </div>
          {resumen && <span className="eyebrow">{resumen}</span>}
        </>
      )}

      {cargando ? (
        <p className="muted" style={{ textAlign: 'center' }}>Cargando…</p>
      ) : albums.length === 0 ? (
        <div className="empty">
          <div className="empty__tiles" aria-hidden="true"><i /><i /><i /><i /></div>
          <h2>Tu colección empieza aquí</h2>
          <p>Escanea el código de barras de un disco o búscalo por nombre. La portada y los datos se llenan solos.</p>
          <Link to="/escanear" className="btn btn--primary"><ScanIcon width={20} height={20} /> Escanear un disco</Link>
          <Link to="/buscar" className="btn"><SearchIcon width={20} height={20} /> Buscar a mano</Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty"><p>Ningún disco coincide con ese filtro.</p></div>
      ) : (
        <>
          <div className="grid">
            {shown.map((a) => <AlbumCard key={a.id} album={a} />)}
          </div>
          {conChips && <span className="muted" style={{ textAlign: 'center', fontSize: 13 }}>Toca un chip otra vez para quitar el filtro.</span>}
        </>
      )}
    </main>
  )
}
