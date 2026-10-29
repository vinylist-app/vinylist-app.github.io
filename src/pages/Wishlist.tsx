import { useState, type FormEvent } from 'react'
import { addWish, deleteWish, updateWish } from '../db'
import { useWishlist } from '../data/hooks'
import { useSession } from '../session'
import { Cover } from '../components/AlbumCard'
import { SpotifyIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import { spotifySearchUrl } from '../lib/spotify'

/**
 * Lista de deseos de la colección. Con cuenta se comparte con la familia;
 * el "apartado para regalo" se le oculta a quien lo quiere.
 */
export function Wishlist() {
  const items = useWishlist() ?? []
  const { person, collection } = useSession()
  const me = person.uid
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addWish({ title: title.trim(), artist: artist.trim() || 'Artista por confirmar' })
    setTitle('')
    setArtist('')
  }

  return (
    <main className="page">
      <div className="stack" style={{ gap: 8 }}>
        <Logo />
        <div className="title-row">
          <h1>Deseos</h1>
          {items.length > 0 && <span className="badge">{items.length} {items.length === 1 ? 'disco' : 'discos'}</span>}
        </div>
        <span className="muted">{collection ? 'Lo que quiere la familia. Si alguien lo aparta para regalarlo, el que lo pidió no lo ve.' : 'Lo que quieres. Con tu cuenta, la lista se comparte con tu familia.'}</span>
      </div>

      {items.length === 0 && <div className="empty"><p>Aún no hay deseos. Agrega el primero aquí abajo.</p></div>}

      <div className="stack" style={{ gap: 10 }}>
        {items.map((it) => {
          const mine = it.wantedBy === me
          const reservedByOther = it.reservedBy && it.reservedBy !== it.wantedBy
          const hideFromWanter = reservedByOther && mine
          return (
            <div className="card stack" key={it.id} style={{ gap: 10 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Cover src={it.coverUrl ?? it.thumbUrl} title={it.title} className="wish__cover" />
                <div className="grow stack" style={{ gap: 2 }}>
                  <span className="result__title">{it.title}</span>
                  <span className="result__meta">{it.artist}{it.year ? ` · ${it.year}` : ''}</span>
                  <span className="result__meta">Lo quiere {mine ? `${person.name} (tú)` : it.wantedByName}</span>
                  {reservedByOther && !mine && <span className="result__meta">Apartado por {it.reservedBy === me ? 'ti' : it.reservedByName ?? 'alguien'} · {it.wantedByName} no ve esto</span>}
                </div>
              </div>
              <div className="row">
                <a className="btn btn--sm grow" href={spotifySearchUrl(it.artist, it.title)} target="_blank" rel="noreferrer">
                  <SpotifyIcon width={18} height={18} className="spotify" /> Escuchar<span className="visually-hidden"> «{it.title}» en Spotify</span>
                </a>
                {mine ? (
                  <button className="btn btn--sm grow" onClick={() => deleteWish(it.id)}>Quitar</button>
                ) : hideFromWanter ? null : (
                  <button className={`btn btn--sm grow ${it.reservedBy ? '' : 'btn--primary'}`} disabled={Boolean(it.reservedBy) && it.reservedBy !== me} onClick={() => updateWish(it.id, it.reservedBy ? { reservedBy: undefined, reservedByName: undefined } : { reservedBy: me, reservedByName: person.name })}>
                    {it.reservedBy ? (it.reservedBy === me ? 'Ya no lo regalo' : 'Ya apartado') : 'Lo regalo yo'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <form className="card stack" onSubmit={add}>
        <span className="eyebrow">Agregar un deseo</span>
        <label className="field"><span>Álbum</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Wish You Were Here" /></label>
        <label className="field"><span>Artista</span><input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Pink Floyd" /></label>
        <button className="btn btn--primary" type="submit">Agregar a mis deseos</button>
      </form>
    </main>
  )
}
