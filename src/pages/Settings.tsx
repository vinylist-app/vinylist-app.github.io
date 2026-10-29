import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db, exportCollection } from '../db'
import { useAlbums } from '../data/hooks'
import { activeCollectionId, useSession } from '../session'
import { getProfileName, setProfileName } from '../lib/profile'
import { discogsConfigured } from '../api/discogs'
import { BackIcon } from '../components/Icons'
import { Logo } from '../components/Logo'
import type { Album } from '../types'

export function Settings() {
  const albums = useAlbums() ?? []
  const { collection } = useSession()
  const [name, setName] = useState(getProfileName())
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const cloud = Boolean(collection)

  function download() {
    const blob = new Blob([exportCollection(albums)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vinylist-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importFile(file: File) {
    try {
      const data = JSON.parse(await file.text()) as { albums?: Album[] }
      if (!Array.isArray(data.albums)) throw new Error('El archivo no es un respaldo de VinyList.')
      const cid = activeCollectionId()
      await db.albums.bulkPut(data.albums.map((a) => ({ ...a, collectionId: cid })))
      setMsg({ text: `Se importaron ${data.albums.length} discos.` })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo importar.', error: true })
    }
  }

  return (
    <main className="page">
      <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          <Link to="/" className="icon-btn icon-btn--ghost" aria-label="Volver" style={{ margin: '0 0 0 -10px' }}><BackIcon /></Link>
          <Logo />
        </div>
        <h1>Ajustes</h1>
      </div>

      <section className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">Tú</span>
        <label className="settings-row">
          <span>Tu nombre</span>
          <input className="input input--inline" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setProfileName(name)} aria-describedby="nombre-ayuda" />
        </label>
        <span id="nombre-ayuda" className="muted" style={{ fontSize: 13, padding: '8px 0 12px' }}>Para las calificaciones y los deseos, mientras llega la cuenta por persona.</span>
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">Respaldo</span>
        <div className="settings-row">
          <span>Exportar colección</span>
          <button className="btn btn--sm" onClick={download} disabled={albums.length === 0}>Archivo JSON</button>
        </div>
        <div className="settings-row">
          <span>Restaurar un respaldo</span>
          <label className="btn btn--sm">Elegir archivo<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
        </div>
        {msg && <div className={`notice ${msg.error ? 'notice--error' : ''}`} role="status" style={{ marginTop: 10 }}>{msg.text}</div>}
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">De dónde salen los datos</span>
        <div className="settings-row"><span>Discogs</span><span>{discogsConfigured() ? <>Conectado<i className="dot" /></> : <>Sin configurar<i className="dot dot--off" /></>}</span></div>
        <div className="settings-row"><span>MusicBrainz</span><span>Listo<i className="dot" /></span></div>
        <div className="settings-row"><span>Spotify</span><span>Abre la app<i className="dot" /></span></div>
        <div className="settings-row"><span>Nube familiar</span><span>{cloud ? <>Configurada<i className="dot" /></> : <>Viene en la v0.2<i className="dot dot--off" /></>}</span></div>
        {!discogsConfigured() && <span className="muted" style={{ fontSize: 13, padding: '8px 0 0' }}>Sin Discogs se usa MusicBrainz: funciona, pero sin géneros ni lista de canciones.</span>}
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">VinyList</span>
        <div className="settings-row"><span>Apariencia</span><span>Como el celular</span></div>
        <div className="settings-row"><span>Versión</span><span className="mono">{__APP_VERSION__}</span></div>
      </section>

      <div className="about">
        <Logo />
        <span>Hecha para la familia, sin membresías. Tus datos siempre son tuyos.</span>
      </div>
    </main>
  )
}
