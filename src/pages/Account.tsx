import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession, useSession } from '../session'
import { Logo } from '../components/Logo'
import { BackIcon } from '../components/Icons'
import { ChevronIcon, EyeIcon, EyeOffIcon, LinkIcon, LogoutIcon, PlusIcon } from '../components/CuentaIcons'
import { UploadLocalOffer } from '../components/UploadLocalOffer'
import { sendReset, signIn, signOut, signUp } from '../cloud/auth'
import { cloudErrorMessage, createCollection, joinWithCode, localCounts, previewInvite, setActiveCollection } from '../cloud/collections'
import { clearPendingCode, initials, parseInviteCode, peopleLabel, readPendingCode } from '../lib/invite'
import '../styles/cuenta.css'

/**
 * Tu cuenta (pantalla 2): entrar o crear la cuenta, y después elegir si creas
 * tu colección o te unes a la de tu familia con un enlace. Si este celular ya
 * tenía discos sin cuenta, ofrece subirlos.
 */
type Mode = 'enter' | 'create'
type Step = 'choose' | 'create-collection' | 'join'
interface UploadOffer { cid: string; albums: number; wishes: number }

const JOIN_FAILED = 'No se pudo entrar a esa colección. Pide un enlace nuevo a tu familia.'

export function Account() {
  const nav = useNavigate()
  const session = useSession()
  const { status, cloudAvailable, person, collection, memberships } = session

  // Formulario de entrada
  const [mode, setMode] = useState<Mode>('enter')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Ya dentro, sin colección
  const [step, setStep] = useState<Step>('choose')
  // null = la persona no lo ha editado; se muestra el sugerido con su nombre (que puede llegar un instante después de crear la cuenta).
  const [editedName, setEditedName] = useState<string | null>(null)
  const collectionName = editedName ?? (person.name ? `Familia de ${person.name}` : '')
  const [pasted, setPasted] = useState('')
  const [offer, setOffer] = useState<UploadOffer | null>(null)
  const autoJoined = useRef(false)

  const hasCollections = memberships.length > 0 || collection !== null
  const signedIn = status === 'signed-in'

  /** Al quedar en una colección: ofrecer subir lo local o ir a la colección. */
  async function afterJoin(cid: string) {
    const counts = await localCounts()
    if (counts.albums + counts.wishes > 0) setOffer({ cid, ...counts })
    else nav('/', { replace: true })
  }

  // Si venía de un enlace de invitación (Unirme guardó el código), se une solo al entrar.
  useEffect(() => {
    if (!signedIn || autoJoined.current) return
    const code = readPendingCode()
    if (!code) return
    autoJoined.current = true
    clearPendingCode()
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        const preview = await previewInvite(code)
        // El perfil puede llegar después de entrar: se mira la sesión de ahora, no la del render.
        // Y si aun así ya se era miembro, joinWithCode solo deja esa colección como la activa.
        const s = getSession()
        if (s.memberships.some((m) => m.id === preview.collectionId) || s.collection?.id === preview.collectionId) {
          await setActiveCollection(preview.collectionId)
          nav('/', { replace: true })
          return
        }
        const cid = await joinWithCode(code)
        await afterJoin(cid)
      } catch (e) {
        setError(cloudErrorMessage(e, JOIN_FAILED))
      } finally {
        setBusy(false)
      }
    })()
    // Solo al entrar; memberships puede llegar después y no debe repetir la unión.
  }, [signedIn])


  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'create') await signUp(name, email, password)
      else await signIn(email, password)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setError(null)
    setInfo(null)
    if (!email.trim()) {
      setError('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".')
      return
    }
    setBusy(true)
    try {
      await sendReset(email)
      setInfo('Te mandé un correo para cambiarla. Revisa también la carpeta de no deseados.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo mandar el correo.')
    } finally {
      setBusy(false)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const cid = await createCollection(collectionName)
      await afterJoin(cid)
    } catch (err) {
      setError(cloudErrorMessage(err, 'No se pudo crear la colección. Intenta de nuevo.'))
    } finally {
      setBusy(false)
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const code = parseInviteCode(pasted)
    if (!code) {
      setError('Ese enlace o código no se ve bien. Son 6 letras y números, como K7M2QX.')
      return
    }
    setBusy(true)
    try {
      const cid = await joinWithCode(code)
      await afterJoin(cid)
    } catch (err) {
      setError(cloudErrorMessage(err, JOIN_FAILED))
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    setBusy(true)
    try {
      await signOut()
      setInfo('Cerraste tu sesión. Tus discos siguen en la nube; este celular se queda con lo que tenía sin cuenta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <div className="cu-nav">
        <button className="icon-btn icon-btn--ghost" onClick={() => nav(-1)} aria-label="Volver"><BackIcon /></button>
      </div>
      <div className="cu-logo"><Logo size={48} /></div>

      {status === 'starting' && <p className="muted" style={{ textAlign: 'center' }}>Cargando…</p>}

      {status !== 'starting' && !cloudAvailable && (
        <section className="card stack">
          <h2>Tu cuenta</h2>
          <p className="muted" style={{ margin: 0 }}>La nube familiar todavía no está activada en esta instalación. Mientras tanto, tu colección vive en este celular y puedes respaldarla desde Ajustes.</p>
        </section>
      )}

      {status === 'signed-out' && cloudAvailable && (
        <>
          <div className="cu-head">
            <h2>Tu cuenta</h2>
            <p className="muted">Cada persona entra con la suya. Así tu colección es tuya, y la de un amigo es de él.</p>
          </div>
          <form className="cu-form" onSubmit={submit}>
            {mode === 'create' && (
              <label className="field">
                <span>Tu nombre</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required placeholder="Como te dice tu familia" />
              </label>
            )}
            <label className="field">
              <span>Tu correo</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
            </label>
            <label className="field">
              <span>Tu contraseña</span>
              <span className="cu-pass">
                <input className="input" type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} minLength={mode === 'create' ? 6 : undefined} required aria-describedby={mode === 'create' ? 'pass-ayuda' : undefined} />
                <button type="button" className="cu-pass__toggle" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Ocultar la contraseña' : 'Ver la contraseña'} aria-pressed={showPass}>{showPass ? <EyeOffIcon /> : <EyeIcon />}</button>
              </span>
              {mode === 'create' && <span id="pass-ayuda" className="cu-hint">Mínimo 6 caracteres</span>}
            </label>
            {error && <div className="notice notice--error" role="alert">{error}</div>}
            {info && <div className="notice" role="status">{info}</div>}
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? (mode === 'create' ? 'Creando…' : 'Entrando…') : mode === 'create' ? 'Crear mi cuenta' : 'Entrar'}
            </button>
          </form>
          <div className="cu-links">
            {mode === 'enter' ? (
              <button className="btn btn--link btn--sm" type="button" onClick={() => { setMode('create'); setError(null) }}>¿Primera vez? Crear mi cuenta</button>
            ) : (
              <button className="btn btn--link btn--sm" type="button" onClick={() => { setMode('enter'); setError(null) }}>Ya tengo cuenta. Entrar</button>
            )}
            <button className="btn btn--link btn--sm" type="button" onClick={reset} disabled={busy}>Olvidé mi contraseña</button>
          </div>
        </>
      )}

      {signedIn && offer && (
        <UploadLocalOffer cid={offer.cid} albums={offer.albums} wishes={offer.wishes} onDone={() => nav('/', { replace: true })} />
      )}

      {signedIn && !offer && !hasCollections && (
        <>
          <div className="cu-head">
            <h2>Hola, {person.name}</h2>
            <p className="muted">Ya estás dentro. Ahora dinos dónde van tus discos.</p>
          </div>
          <span className="eyebrow">Tu colección</span>
          {step === 'choose' && (
            <div className="cu-options">
              <button className="cu-option" onClick={() => setStep('create-collection')} disabled={busy}>
                <span className="cu-option__icon"><PlusIcon /></span>
                <span className="grow">
                  <span className="cu-option__title">Crear mi colección</span>
                  <span className="cu-option__desc" style={{ display: 'block' }}>Empiezas de cero y luego invitas a tu familia.</span>
                </span>
                <ChevronIcon className="cu-option__chev" />
              </button>
              <button className="cu-option" onClick={() => setStep('join')} disabled={busy}>
                <span className="cu-option__icon"><LinkIcon /></span>
                <span className="grow">
                  <span className="cu-option__title">Unirme con un enlace</span>
                  <span className="cu-option__desc" style={{ display: 'block' }}>Si alguien de tu familia ya la tiene, entras a la suya.</span>
                </span>
                <ChevronIcon className="cu-option__chev" />
              </button>
            </div>
          )}
          {step === 'create-collection' && (
            <form className="card cu-form" onSubmit={create}>
              <label className="field">
                <span>Nombre de la colección</span>
                <input className="input" value={collectionName} onChange={(e) => setEditedName(e.target.value)} autoFocus required />
              </label>
              <span className="cu-hint">Lo ven todos los que invites. Lo puedes cambiar después.</span>
              <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear mi colección'}</button>
              <button className="btn btn--link btn--sm" type="button" onClick={() => setStep('choose')} disabled={busy}>Volver</button>
            </form>
          )}
          {step === 'join' && (
            <form className="card cu-form" onSubmit={join}>
              <label className="field">
                <span>Pega el enlace o el código</span>
                <input className="input" value={pasted} onChange={(e) => setPasted(e.target.value)} autoFocus required placeholder="K7M2QX o https://…/unirme/K7M2QX" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
              </label>
              <span className="cu-hint">Te lo manda alguien de tu familia desde su app, en Tu colección.</span>
              <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Unirme'}</button>
              <button className="btn btn--link btn--sm" type="button" onClick={() => setStep('choose')} disabled={busy}>Volver</button>
            </form>
          )}
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          {busy && step === 'choose' && <p className="muted" style={{ textAlign: 'center' }}>Completando tu invitación…</p>}
          <p className="cu-foot">Si le pasas la app a un amigo, él crea la suya y mete a su gente. Su colección y la tuya nunca se mezclan.</p>
        </>
      )}

      {signedIn && !offer && hasCollections && (
        <>
          <div className="cu-head">
            <h2>Tu cuenta</h2>
          </div>
          <section className="card stack" style={{ gap: 12 }}>
            <div className="cu-summary">
              <span className="cu-medal cu-medal--me cu-medal--lg" aria-hidden>{initials(person.name)}</span>
              <div className="grow">
                <div className="cu-summary__name">{person.name}</div>
                {person.email && <div className="cu-summary__mail">{person.email}</div>}
              </div>
            </div>
            {collection ? (
              <button className="cu-link-row" onClick={() => nav('/coleccion')}>
                <span className="eyebrow" style={{ flex: 'none' }}>Tu colección</span>
                <span className="grow" style={{ textAlign: 'right' }}>{collection.name} · {peopleLabel(Object.keys(collection.members).length)}</span>
                <ChevronIcon className="cu-chev" />
              </button>
            ) : (
              <span className="muted">Cargando tu colección…</span>
            )}
          </section>
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          {info && <div className="notice" role="status">{info}</div>}
          <button className="btn" onClick={leave} disabled={busy}><LogoutIcon /> Cerrar sesión</button>
          <p className="cu-foot">Tus discos siguen guardados en la nube. Este celular se queda con lo que tuviera sin cuenta, y al volver a entrar ves todo otra vez.</p>
        </>
      )}
    </main>
  )
}
