import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addAlbum, addWish, db, exportCollection } from '../db'
import { useAlbums, useWishlist } from '../data/hooks'
import { activeCollectionId, setSession, useSession } from '../session'
import { setProfileName } from '../lib/profile'
import { checkToken, discogsConfigured, localDiscogsToken, setLocalDiscogsToken } from '../api/discogs'
import { getTheme, setTheme, THEME_LABELS, type Theme } from '../lib/theme'
import { peopleLabel } from '../lib/invite'
import { BackIcon } from '../components/Icons'
import { ChevronIcon, DownloadIcon, ExternalIcon, PencilIcon, PhoneIcon } from '../components/CuentaIcons'
import { CuentaSheet } from '../components/CuentaSheet'
import { Logo } from '../components/Logo'
import type { Album, WishlistItem } from '../types'
import '../styles/cuenta.css'

/**
 * Ajustes (pantalla 18): tu nombre, cuenta y colección; respaldo; de dónde
 * salen los datos; apariencia, versión e instalar en el celular.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// El navegador avisa que la app se puede instalar al cargar, antes de abrir Ajustes;
// se guarda aquí (este módulo carga con la app) para usarlo cuando la persona lo pida.
let installPrompt: InstallPromptEvent | null = null
const installListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e as InstallPromptEvent
    for (const l of installListeners) l()
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    for (const l of installListeners) l()
  })
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || (navigator as { standalone?: boolean }).standalone === true
}

function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

const DISCOGS_DEVELOPERS = 'https://www.discogs.com/settings/developers'
const THEMES: Theme[] = ['system', 'light', 'dark']

export function Settings() {
  const nav = useNavigate()
  const albums = useAlbums() ?? []
  const wishlist = useWishlist() ?? []
  const { status, cloudAvailable, person, collection } = useSession()
  const signedIn = status === 'signed-in'
  const cloud = Boolean(collection)

  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(person.name)
  const nameRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [sheet, setSheet] = useState<'theme' | 'discogs' | 'install' | null>(null)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [discogsOn, setDiscogsOn] = useState(discogsConfigured())
  const [installed, setInstalled] = useState(isStandalone())
  const [canPrompt, setCanPrompt] = useState(installPrompt !== null)

  useEffect(() => { if (!editingName) setName(person.name) }, [person.name, editingName])
  useEffect(() => { if (editingName) nameRef.current?.select() }, [editingName])
  useEffect(() => {
    const on = () => { setCanPrompt(installPrompt !== null); setInstalled(isStandalone()) }
    installListeners.add(on)
    return () => { installListeners.delete(on) }
  }, [])
  useEffect(() => { setDiscogsOn(discogsConfigured()) }, [collection?.discogsToken])

  async function saveName() {
    setEditingName(false)
    const clean = name.trim()
    if (!clean || clean === person.name) { setName(person.name); return }
    try {
      if (signedIn) {
        const { renameMe } = await import('../cloud/collections')
        await renameMe(collection?.id ?? null, clean)
      } else {
        setProfileName(clean)
        setSession((s) => ({ person: { ...s.person, name: clean } }))
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo cambiar el nombre.', error: true })
      setName(person.name)
    }
  }

  function download() {
    const blob = new Blob([exportCollection(albums, wishlist)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vinylist-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importFile(file: File) {
    setMsg(null)
    try {
      const data = JSON.parse(await file.text()) as { albums?: Album[]; wishlist?: WishlistItem[] }
      if (!Array.isArray(data.albums)) throw new Error('El archivo no es un respaldo de VinyList.')
      const wishes = Array.isArray(data.wishlist) ? data.wishlist : []
      const cid = activeCollectionId()
      let added = 0
      if (!cloud) {
        // Solo este celular: se restaura tal cual, conservando ids.
        await db.albums.bulkPut(data.albums.map((a) => ({ ...a, collectionId: cid })))
        if (wishes.length) await db.wishlist.bulkPut(wishes.map((w) => ({ ...w, collectionId: cid })))
        added = data.albums.length
      } else {
        // Con nube: cada disco entra por el camino normal (así también sube), sin repetir los que ya están.
        setBusy(true)
        const have = new Set((await db.albums.where('collectionId').equals(cid).primaryKeys()) as string[])
        for (const a of data.albums) {
          if (have.has(a.id)) continue
          const rest: Partial<Album> = { ...a }
          delete rest.id; delete rest.addedAt; delete rest.updatedAt; delete rest.collectionId
          await addAlbum(rest as Omit<Album, 'id' | 'addedAt' | 'updatedAt' | 'collectionId'>)
          added++
        }
        const haveWishes = new Set((await db.wishlist.where('collectionId').equals(cid).primaryKeys()) as string[])
        for (const w of wishes) {
          if (haveWishes.has(w.id)) continue
          await addWish({ title: w.title, artist: w.artist, year: w.year, coverUrl: w.coverUrl, thumbUrl: w.thumbUrl, discogsId: w.discogsId, discogsMasterId: w.discogsMasterId, musicbrainzReleaseGroupId: w.musicbrainzReleaseGroupId, barcode: w.barcode })
        }
      }
      setMsg({ text: added === 0 ? 'Todo lo del respaldo ya estaba en la colección.' : `Se restauraron ${added} ${added === 1 ? 'disco' : 'discos'}.` })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'No se pudo restaurar.', error: true })
    } finally {
      setBusy(false)
    }
  }

  function pickTheme(t: Theme) {
    setTheme(t)
    setThemeState(t)
    setSheet(null)
  }

  async function saveLocalToken(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const user = await checkToken(token)
      setLocalDiscogsToken(token)
      setDiscogsOn(true)
      setToken('')
      setSheet(null)
      setMsg({ text: `Discogs conectado como ${user}.` })
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo conectar con Discogs.', error: true })
    } finally {
      setBusy(false)
    }
  }

  function forgetLocalToken() {
    setLocalDiscogsToken('')
    setDiscogsOn(discogsConfigured())
    setSheet(null)
    setMsg({ text: 'Discogs desconectado. La app sigue con MusicBrainz.' })
  }

  async function install() {
    if (installed) return
    if (installPrompt) {
      const p = installPrompt
      await p.prompt()
      const { outcome } = await p.userChoice
      if (outcome === 'accepted') { installPrompt = null; setCanPrompt(false); setInstalled(true) }
      return
    }
    setSheet('install')
  }

  const accountValue = !cloudAvailable ? 'Pronto' : signedIn ? (person.email ?? 'Tu cuenta') : 'Entrar'
  const collectionValue = collection ? `${collection.name} · ${peopleLabel(Object.keys(collection.members).length)}` : 'Solo este celular'

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
        <div className="settings-row">
          <span>Tu nombre</span>
          {editingName ? (
            <input ref={nameRef} className="input input--inline" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setName(person.name); setEditingName(false) } }} aria-label="Tu nombre" autoComplete="name" />
          ) : (
            <span className="cu-name-edit">
              <span>{person.name}</span>
              <button className="icon-btn" onClick={() => setEditingName(true)} aria-label="Cambiar tu nombre"><PencilIcon width={18} height={18} /></button>
            </span>
          )}
        </div>
        <button className="settings-row cu-srow" onClick={() => cloudAvailable && nav('/cuenta')} disabled={!cloudAvailable}>
          <span>Cuenta</span>
          <span>{accountValue}{cloudAvailable && <ChevronIcon className="cu-chev" width={18} height={18} />}</span>
        </button>
        <button className="settings-row cu-srow" onClick={() => nav(collection ? '/coleccion' : '/cuenta')}>
          <span>Tu colección</span>
          <span>{collectionValue}<ChevronIcon className="cu-chev" width={18} height={18} /></span>
        </button>
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">Respaldo</span>
        <div className="settings-row">
          <span>Exportar colección</span>
          <button className="btn btn--sm" onClick={download} disabled={albums.length === 0 && wishlist.length === 0}><DownloadIcon width={18} height={18} /> Archivo JSON</button>
        </div>
        <div className="settings-row">
          <span>Restaurar un respaldo</span>
          <label className={`btn btn--sm ${busy ? 'btn--ghost' : ''}`}>{busy ? 'Restaurando…' : 'Elegir archivo'}<input type="file" accept="application/json,.json" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} /></label>
        </div>
        {msg && <div className={`notice ${msg.error ? 'notice--error' : ''}`} role="status" style={{ marginTop: 10 }}>{msg.text}</div>}
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">De dónde salen los datos</span>
        <button className="settings-row cu-srow" onClick={() => (cloud ? nav('/coleccion') : setSheet('discogs'))}>
          <span>Discogs</span>
          <span>{discogsOn ? <>Conectado<i className="dot" /></> : <>Sin configurar<i className="dot dot--off" /></>}<ChevronIcon className="cu-chev" width={18} height={18} /></span>
        </button>
        <div className="settings-row"><span>MusicBrainz</span><span>Listo<i className="dot" /></span></div>
        <div className="settings-row"><span>Spotify</span><span>Abre la app<i className="dot" /></span></div>
        <div className="settings-row">
          <span>Nube familiar</span>
          <span>{cloud ? <>Activa<i className="dot" /></> : cloudAvailable ? <>Entra con tu cuenta<i className="dot dot--off" /></> : <>Pronto<i className="dot dot--off" /></>}</span>
        </div>
        {!discogsOn && <span className="muted" style={{ fontSize: 13, padding: '8px 0 0' }}>Sin Discogs se usa MusicBrainz: funciona, pero sin géneros ni lista de canciones.</span>}
      </section>

      <section className="stack" style={{ gap: 0 }}>
        <span className="eyebrow">VinyList</span>
        <button className="settings-row cu-srow" onClick={() => setSheet('theme')}>
          <span>Apariencia</span>
          <span>{THEME_LABELS[theme]}<ChevronIcon className="cu-chev" width={18} height={18} /></span>
        </button>
        <div className="settings-row"><span>Versión</span><span className="mono">{__APP_VERSION__}</span></div>
        <button className="settings-row cu-srow" onClick={install} disabled={installed}>
          <span>Instalar en el celular</span>
          <span>{installed ? 'Ya instalada' : 'Agregar a inicio'}{!installed && <ChevronIcon className="cu-chev" width={18} height={18} />}</span>
        </button>
      </section>

      <div className="about">
        <Logo />
        <span>Hecha para la familia, sin membresías. Tus datos siempre son tuyos.</span>
      </div>

      {sheet === 'theme' && (
        <CuentaSheet title="Apariencia" onClose={() => setSheet(null)}>
          {THEMES.map((t) => (
            <button key={t} className={`cu-choice ${theme === t ? 'cu-choice--on' : ''}`} onClick={() => pickTheme(t)} aria-pressed={theme === t}>
              {THEME_LABELS[t]}
              {theme === t && <span className="mono">Actual</span>}
            </button>
          ))}
        </CuentaSheet>
      )}

      {sheet === 'discogs' && (
        <CuentaSheet title="Conectar Discogs" onClose={() => setSheet(null)}>
          <p className="muted" style={{ margin: 0 }}>Con Discogs salen las portadas, los géneros y las canciones de cada disco. Es gratis: en Discogs, Settings → Developers → Generate new token. Pega aquí el token; se guarda solo en este celular.</p>
          <a className="cu-ext" href={DISCOGS_DEVELOPERS} target="_blank" rel="noopener noreferrer">Abrir Discogs <ExternalIcon width={18} height={18} /></a>
          <form className="cu-form" onSubmit={saveLocalToken}>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pega aquí el token" aria-label="Token de Discogs" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus />
            <button className="btn btn--primary" type="submit" disabled={busy || !token.trim()}>{busy ? 'Revisando…' : 'Conectar'}</button>
            {localDiscogsToken() && <button className="btn btn--link btn--sm" type="button" onClick={forgetLocalToken}>Desconectar Discogs</button>}
          </form>
        </CuentaSheet>
      )}

      {sheet === 'install' && (
        <CuentaSheet title="Instalar en el celular" onClose={() => setSheet(null)}>
          <div className="row" style={{ color: 'var(--accent)' }}><PhoneIcon /> <span className="muted">Queda como una app más, con su ícono, y abre sin internet.</span></div>
          {isIOS() ? (
            <ol className="cu-steps">
              <li>Abre esta página en Safari.</li>
              <li>Toca el botón Compartir (el cuadrito con la flecha hacia arriba).</li>
              <li>Elige «Agregar a pantalla de inicio» y confirma.</li>
            </ol>
          ) : (
            <ol className="cu-steps">
              <li>Abre el menú del navegador (los tres puntos).</li>
              <li>Toca «Instalar app» o «Agregar a pantalla de inicio».</li>
              <li>Confirma, y busca el ícono de VinyList en tu inicio.</li>
            </ol>
          )}
          {canPrompt && <button className="btn btn--primary" onClick={install}>Instalar ahora</button>}
          <button className="btn btn--link btn--sm" onClick={() => setSheet(null)}>Cerrar</button>
        </CuentaSheet>
      )}
    </main>
  )
}
