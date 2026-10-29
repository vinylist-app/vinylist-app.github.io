import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../session'
import { useAlbums, useWishlist } from '../data/hooks'
import { Logo } from '../components/Logo'
import { ChevronIcon, CloudIcon, ExternalIcon, LinkIcon, PersonIcon } from '../components/CuentaIcons'
import { CuentaSheet } from '../components/CuentaSheet'
import { checkToken } from '../api/discogs'
import { inviteLink, leaveCollection, regenerateInvite, removeMember, renameCollection, setActiveCollection, setDiscogsToken } from '../cloud/collections'
import { agoLabel, discsLabel, initials, joinedLabel, peopleLabel, wishesLabel } from '../lib/invite'
import type { Member } from '../types'
import '../styles/cuenta.css'

/**
 * Tu colección (pantalla 16): quiénes están, cómo va la nube, invitar con un
 * enlace y, para quien administra, renombrar, conectar Discogs y renovar el enlace.
 */
const DISCOGS_DEVELOPERS = 'https://www.discogs.com/settings/developers'

export function Family() {
  const nav = useNavigate()
  const { status, cloudAvailable, person, collection, memberships, sync } = useSession()
  const albums = useAlbums() ?? []
  const wishes = useWishlist() ?? []

  const [sheet, setSheet] = useState<'invite' | 'member' | 'regenerate' | 'leave' | null>(null)
  const [picked, setPicked] = useState<{ uid: string; member: Member } | null>(null)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [token, setToken] = useState('')
  const [discogsUser, setDiscogsUser] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const isAdmin = Boolean(collection && collection.ownerUid === person.uid)
  const members = useMemo(() => {
    if (!collection) return []
    return Object.entries(collection.members)
      .map(([uid, m]) => ({ uid, member: m }))
      .sort((a, b) => (a.member.role === 'owner' ? -1 : b.member.role === 'owner' ? 1 : a.member.joinedAt.localeCompare(b.member.joinedAt)))
  }, [collection])

  // "Hace N minutos" se refresca solo cada medio minuto.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const collectionName = collection?.name
  useEffect(() => { if (collectionName) setNewName(collectionName) }, [collectionName])

  // Quién es el dueño del token de Discogs guardado (solo para mostrarlo).
  const savedToken = collection?.discogsToken
  useEffect(() => {
    if (!savedToken || !isAdmin) { setDiscogsUser(null); return }
    let alive = true
    checkToken(savedToken).then((u) => { if (alive) setDiscogsUser(u) }).catch(() => { if (alive) setDiscogsUser(null) })
    return () => { alive = false }
  }, [savedToken, isAdmin])

  if (status === 'starting') return <main className="page"><p className="muted">Cargando…</p></main>

  if (!collection) {
    return (
      <main className="page">
        <Logo />
        <h1>Tu colección</h1>
        <section className="card stack" style={{ gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Ahora mismo tus discos viven solo en este celular. Con una cuenta, tu colección se guarda en la nube y tu familia la ve en su celular, con los mismos discos y deseos.
          </p>
          {cloudAvailable ? (
            <button className="btn btn--primary" onClick={() => nav('/cuenta')}>Entra con tu cuenta para compartirla con tu familia</button>
          ) : (
            <span className="muted">La nube familiar todavía no está activada en esta instalación.</span>
          )}
        </section>
      </main>
    )
  }

  const code = collection.inviteCode
  const link = code ? inviteLink(code) : ''
  const count = members.length

  function detailOf(uid: string, m: Member): string {
    if (m.role === 'owner') return `Administra la familia · ${discsLabel(albums.filter((a) => a.addedBy === uid).length)} agregados`
    const parts = [joinedLabel(m.joinedAt, now), wishesLabel(wishes.filter((w) => w.wantedBy === uid).length)]
    // Lo que apartó para regalar; no se cuenta lo que apartó para quien está mirando (sería un spoiler).
    const reserved = wishes.filter((w) => w.reservedBy === uid && w.wantedBy !== person.uid).length
    if (reserved > 0) parts.push(`${reserved} ${reserved === 1 ? 'regalo apartado' : 'regalos apartados'}`)
    return parts.join(' · ')
  }

  async function invite() {
    if (!collection) return
    let c = code
    if (!c && isAdmin) {
      try {
        c = await regenerateInvite(collection.id)
      } catch (e) {
        setMsg({ text: e instanceof Error ? e.message : 'No se pudo crear el enlace.', error: true })
        return
      }
    }
    if (!c) { setMsg({ text: 'Esta colección aún no tiene enlace. Pídele a quien la administra que lo cree.', error: true }); return }
    const url = inviteLink(c)
    const text = `Te invito a nuestra colección de vinilos «${collection.name}» en VinyList. Abre el enlace y entra con tu cuenta.`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'VinyList', text, url })
        return
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
      }
    }
    await copy(url)
    setSheet('invite')
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault()
    if (!collection || !newName.trim() || newName.trim() === collection.name) return
    setBusy(true)
    try {
      await renameCollection(collection.id, newName)
      setMsg({ text: 'Listo, la colección cambió de nombre.' })
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo cambiar el nombre.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function saveToken(e: FormEvent) {
    e.preventDefault()
    if (!collection) return
    setBusy(true)
    setMsg(null)
    try {
      const user = await checkToken(token)
      await setDiscogsToken(collection.id, token)
      setDiscogsUser(user)
      setToken('')
      setMsg({ text: `Discogs conectado como ${user}. Ya salen portadas, géneros y canciones.` })
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo conectar con Discogs.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function disconnectDiscogs() {
    if (!collection) return
    setBusy(true)
    try {
      await setDiscogsToken(collection.id, '')
      setDiscogsUser(null)
      setMsg({ text: 'Discogs desconectado. La app sigue con MusicBrainz.' })
    } finally {
      setBusy(false)
    }
  }

  async function regenerate() {
    if (!collection) return
    setBusy(true)
    try {
      await regenerateInvite(collection.id)
      setMsg({ text: 'Hay un enlace nuevo. El anterior ya no sirve.' })
      setSheet(null)
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo crear el enlace nuevo.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!collection || !picked) return
    setBusy(true)
    try {
      await removeMember(collection.id, picked.uid)
      setMsg({ text: `${picked.member.name} ya no está en la colección. Hay un enlace de invitación nuevo; el anterior ya no sirve.` })
      setSheet(null)
      setPicked(null)
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo quitar.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    if (!collection) return
    setBusy(true)
    try {
      await leaveCollection(collection.id)
      nav('/', { replace: true })
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'No se pudo salir.', error: true })
      setBusy(false)
    }
  }

  const statusCard = (() => {
    switch (sync.state) {
      case 'synced': return { title: 'Todo sincronizado', detail: `${agoLabel(sync.at, now)} · funciona sin internet y se pone al día después` }
      case 'pending': return { title: 'Guardando cambios…', detail: 'En cuanto termine, tu familia los ve en su celular.' }
      case 'offline': return { title: 'Sin internet', detail: 'Tus cambios se guardan aquí y se suben al volver la señal' }
      case 'error': return { title: 'Hubo un problema con la nube', detail: sync.message ?? 'Intenta más tarde.', error: true }
      default: return { title: 'Conectando con la nube…', detail: 'Un momento.' }
    }
  })()

  return (
    <main className="page cu-page--fixed">
      <div className="stack" style={{ gap: 8 }}>
        <Logo />
        <div className="title-row">
          <h1>Tu colección</h1>
          <span className="badge">{peopleLabel(count)}</span>
        </div>
        <span className="muted">Es la de tu familia: cada quien entra con su cuenta y ve lo mismo en su celular. Los cambios se sincronizan solos.</span>
      </div>

      {memberships.length > 1 && (
        <label className="row" style={{ gap: 10 }}>
          <span className="eyebrow">Viendo</span>
          <select className="chip chip--select" value={collection.id} aria-label="Cambiar de colección" onChange={(e) => void setActiveCollection(e.target.value)}>
            {memberships.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}

      <section className="cu-people" aria-label="Personas de la colección">
        {members.map(({ uid, member }) => {
          const me = uid === person.uid
          const canTap = isAdmin && !me
          const inner = (
            <>
              <span className={`cu-medal ${me ? 'cu-medal--me' : ''}`} aria-hidden>{initials(member.name)}</span>
              <span className="grow">
                <span className="cu-person__name" style={{ display: 'block' }}>{member.name}{me ? ' (tú)' : ''}</span>
                <span className="cu-person__detail" style={{ display: 'block' }}>{detailOf(uid, member)}</span>
              </span>
              {canTap && <ChevronIcon className="cu-chev" style={{ color: 'var(--text-2)' }} />}
            </>
          )
          return canTap ? (
            <button key={uid} className="cu-person" onClick={() => { setPicked({ uid, member }); setSheet('member') }} aria-label={`Opciones de ${member.name}`}>{inner}</button>
          ) : (
            <div key={uid} className="cu-person">{inner}</div>
          )
        })}
      </section>

      <section className={`card cu-status ${statusCard.error ? 'cu-status--error' : ''}`} role="status" aria-live="polite">
        <CloudIcon className="cu-status__icon" />
        <div className="grow">
          <div className="cu-status__title">{statusCard.title}</div>
          <div className="cu-status__detail">{statusCard.detail}</div>
        </div>
      </section>

      <div className="cu-dashed">
        <PersonIcon width={18} height={18} />
        <span>Otras personas con la app tienen su propia colección, aparte de esta. Tu amigo crea la suya y mete a su esposa; nada se mezcla.</span>
      </div>

      {msg && <div className={`notice ${msg.error ? 'notice--error' : ''}`} role="status">{msg.text}</div>}

      {isAdmin && (
        <section className="cu-admin">
          <span className="eyebrow">Administrar</span>
          <form className="card stack" style={{ gap: 10 }} onSubmit={rename}>
            <span className="eyebrow">Nombre de la colección</span>
            <div className="cu-inline">
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nombre de la colección" />
              <button className="btn btn--sm" type="submit" disabled={busy || !newName.trim() || newName.trim() === collection.name}>Guardar</button>
            </div>
          </form>

          <form className="card stack" style={{ gap: 10 }} onSubmit={saveToken}>
            <span className="eyebrow">Discogs</span>
            <div style={{ fontWeight: 600 }}>
              {savedToken ? <>Conectado{discogsUser ? ` como ${discogsUser}` : ''}<i className="dot" /></> : <>Sin conectar<i className="dot dot--off" /></>}
            </div>
            <span className="muted">Con Discogs salen las portadas, los géneros y las canciones de cada disco, para toda la familia. Es gratis: en Discogs, Settings → Developers → Generate new token.</span>
            <a className="cu-ext" href={DISCOGS_DEVELOPERS} target="_blank" rel="noopener noreferrer">Abrir Discogs <ExternalIcon width={18} height={18} /></a>
            <div className="cu-inline">
              <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pega aquí el token" aria-label="Token de Discogs" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <button className="btn btn--sm" type="submit" disabled={busy || !token.trim()}>{busy ? 'Revisando…' : 'Conectar'}</button>
            </div>
            {savedToken && <button className="btn btn--link btn--sm" type="button" onClick={disconnectDiscogs} disabled={busy}>Desconectar Discogs</button>}
          </form>

          <div className="card stack" style={{ gap: 10 }}>
            <span className="eyebrow">Enlace de invitación</span>
            {code ? <div className="cu-code" aria-label={`Código ${code.split('').join(' ')}`}>{code}</div> : <span className="muted">Aún no hay enlace.</span>}
            <span className="muted">Si lo mandaste a quien no debías, crea uno nuevo: el anterior deja de servir.</span>
            <button className="btn btn--sm" type="button" onClick={() => setSheet('regenerate')} disabled={busy}>Nuevo enlace de invitación</button>
          </div>
        </section>
      )}

      {!isAdmin && (
        <button className="btn btn--link" onClick={() => setSheet('leave')} disabled={busy}>Salir de la colección</button>
      )}

      <div className="cu-fixed">
        <button className="btn btn--primary" onClick={invite} disabled={busy}><LinkIcon width={20} height={20} /> Invitar a mi familia con un enlace</button>
      </div>

      {sheet === 'invite' && (
        <CuentaSheet title="Comparte este enlace" onClose={() => setSheet(null)}>
          <p className="muted" style={{ margin: 0 }}>Quien lo abra entra con su cuenta y queda en «{collection.name}». También puede escribir el código a mano.</p>
          {code && <div className="cu-code">{code}</div>}
          <div className="cu-url">{link}</div>
          <button className="btn btn--primary" onClick={() => copy(link)}>{copied ? 'Copiado' : 'Copiar'}</button>
          <button className="btn btn--link btn--sm" onClick={() => setSheet(null)}>Cerrar</button>
        </CuentaSheet>
      )}

      {sheet === 'member' && picked && (
        <CuentaSheet title={picked.member.name} onClose={() => { setSheet(null); setPicked(null) }}>
          <p className="muted" style={{ margin: 0 }}>{detailOf(picked.uid, picked.member)}</p>
          <p className="muted" style={{ margin: 0 }}>Si la quitas, deja de ver la colección y el enlace de invitación se renueva (el que tenía ya no sirve). Los discos que agregó se quedan.</p>
          <button className="cu-choice cu-choice--danger" onClick={remove} disabled={busy}>{busy ? 'Quitando…' : 'Quitar de la colección'}</button>
          <button className="btn btn--link btn--sm" onClick={() => { setSheet(null); setPicked(null) }}>Cancelar</button>
        </CuentaSheet>
      )}

      {sheet === 'regenerate' && (
        <CuentaSheet title="¿Nuevo enlace de invitación?" onClose={() => setSheet(null)}>
          <p className="muted" style={{ margin: 0 }}>El enlace anterior deja de servir. Quienes ya están dentro se quedan.</p>
          <button className="btn btn--primary" onClick={regenerate} disabled={busy}>{busy ? 'Creando…' : 'Sí, crear uno nuevo'}</button>
          <button className="btn btn--link btn--sm" onClick={() => setSheet(null)}>Cancelar</button>
        </CuentaSheet>
      )}

      {sheet === 'leave' && (
        <CuentaSheet title="¿Salir de la colección?" onClose={() => setSheet(null)}>
          <p className="muted" style={{ margin: 0 }}>Dejas de ver «{collection.name}» en este celular. Para volver necesitas que te manden el enlace otra vez.</p>
          <button className="cu-choice cu-choice--danger" onClick={leave} disabled={busy}>{busy ? 'Saliendo…' : 'Salir de la colección'}</button>
          <button className="btn btn--link btn--sm" onClick={() => setSheet(null)}>Cancelar</button>
        </CuentaSheet>
      )}
    </main>
  )
}
