import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../session'
import { Logo } from '../components/Logo'
import { BackIcon } from '../components/Icons'
import { LinkIcon } from '../components/CuentaIcons'
import { UploadLocalOffer } from '../components/UploadLocalOffer'
import { joinWithCode, localCounts, previewInvite, setActiveCollection, type InvitePreview } from '../cloud/collections'
import { parseInviteCode, savePendingCode } from '../lib/invite'
import '../styles/cuenta.css'

/**
 * Unirme (/unirme/:code): alguien de la familia mandó el enlace. Muestra a qué
 * colección invita y, según haya sesión o no, te une o te manda a entrar primero.
 */
const INVALID = 'Ese enlace ya no sirve. Pide uno nuevo a tu familia.'

/** Los errores de permisos o de red de la nube no se muestran crudos. */
function friendly(e: unknown): string {
  if (!(e instanceof Error)) return INVALID
  const code = (e as { code?: string }).code ?? ''
  if (code.includes('permission') || code.includes('unavailable') || /false for|Missing or insufficient/i.test(e.message)) return code.includes('unavailable') ? 'Sin conexión. Intenta cuando tengas internet.' : INVALID
  return e.message || INVALID
}

export function Join() {
  const nav = useNavigate()
  const { code: raw } = useParams()
  const code = parseInviteCode(raw)
  const { status, cloudAvailable, collection, memberships } = useSession()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [offer, setOffer] = useState<{ cid: string; albums: number; wishes: number } | null>(null)

  useEffect(() => {
    if (!cloudAvailable || status !== 'signed-in') return
    if (!code) {
      setError(INVALID)
      return
    }
    let alive = true
    previewInvite(code)
      .then((p) => { if (alive) setPreview(p) })
      .catch((e: unknown) => { if (alive) setError(friendly(e)) })
    return () => { alive = false }
  }, [code, cloudAvailable, status])

  const alreadyIn = Boolean(preview && (collection?.id === preview.collectionId || memberships.some((m) => m.id === preview.collectionId)))

  function goSignIn() {
    if (code) savePendingCode(code)
    nav('/cuenta')
  }

  async function join() {
    if (!code || !preview) return
    setBusy(true)
    setError(null)
    try {
      const cid = await joinWithCode(code)
      const counts = await localCounts()
      if (counts.albums + counts.wishes > 0) setOffer({ cid, ...counts })
      else nav('/', { replace: true })
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  async function open() {
    if (!preview) return
    setBusy(true)
    try {
      if (collection?.id !== preview.collectionId) await setActiveCollection(preview.collectionId)
    } finally {
      setBusy(false)
      nav('/', { replace: true })
    }
  }

  return (
    <main className="page">
      <div className="cu-nav">
        <button className="icon-btn icon-btn--ghost" onClick={() => nav('/')} aria-label="Ir a la colección"><BackIcon /></button>
      </div>
      <div className="cu-logo"><Logo size={48} /></div>

      {status === 'starting' && cloudAvailable && <p className="muted" style={{ textAlign: 'center' }}>Cargando…</p>}

      {!cloudAvailable && status !== 'starting' && (
        <section className="card stack">
          <h2>Invitación</h2>
          <p className="muted" style={{ margin: 0 }}>La nube familiar todavía no está activada en esta instalación, así que este enlace no se puede usar aquí.</p>
          <button className="btn" onClick={() => nav('/')}>Ir a mi colección</button>
        </section>
      )}

      {cloudAvailable && status !== 'starting' && error && (
        <section className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <h2>Este enlace no abre</h2>
          <div className="notice notice--error" role="alert">{error}</div>
          <button className="btn" onClick={() => nav('/')}>Ir a mi colección</button>
        </section>
      )}

      {cloudAvailable && status === 'signed-out' && code && (
        <section className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 14 }}>
          <span className="cu-option__icon" style={{ color: 'var(--accent)' }}><LinkIcon width={32} height={32} /></span>
          <h2>Te invitaron a una colección</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 320 }}>Primero entra con tu cuenta (o créala, es rápido). Al terminar, te unimos solo.</p>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={goSignIn}>Entrar o crear mi cuenta</button>
        </section>
      )}
      {cloudAvailable && status === 'signed-out' && !code && !error && (
        <section className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <h2>Este enlace no abre</h2>
          <div className="notice notice--error" role="alert">{INVALID}</div>
          <button className="btn" onClick={() => nav('/')}>Ir a mi colección</button>
        </section>
      )}

      {cloudAvailable && status === 'signed-in' && !error && !preview && <p className="muted" style={{ textAlign: 'center' }}>Buscando la invitación…</p>}

      {preview && offer && (
        <UploadLocalOffer cid={offer.cid} albums={offer.albums} wishes={offer.wishes} onDone={() => nav('/', { replace: true })} />
      )}

      {preview && !offer && !error && (
        <section className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 14 }}>
          <span className="cu-option__icon" style={{ color: 'var(--accent)' }}><LinkIcon width={32} height={32} /></span>
          <h2>Te invitaron a la colección «{preview.collectionName}»</h2>
          {status === 'signed-in' && alreadyIn && (
            <>
              <p className="muted" style={{ margin: 0 }}>Ya estás en esta colección.</p>
              <button className="btn btn--primary" style={{ width: '100%' }} onClick={open} disabled={busy}>Ver la colección</button>
            </>
          )}
          {status === 'signed-in' && !alreadyIn && (
            <>
              <p className="muted" style={{ margin: 0, maxWidth: 320 }}>Verás los mismos discos y deseos que tu familia, y lo que agregues lo verán todos.</p>
              <button className="btn btn--primary" style={{ width: '100%' }} onClick={join} disabled={busy}>{busy ? 'Entrando…' : `Unirme a ${preview.collectionName}`}</button>
              <button className="btn btn--link btn--sm" onClick={() => nav('/')}>Ahora no</button>
            </>
          )}
        </section>
      )}
    </main>
  )
}
