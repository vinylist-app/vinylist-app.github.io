import { doc, collection as fsCollection, getDocFromServer, onSnapshot, query, where, waitForPendingWrites } from 'firebase/firestore'
import { cloudConfigured, getDb } from './firebase'
import { onAuth } from './auth'
import { startMirror } from './mirror'
import { makeCloudWrites } from './writes'
import { collectionFromDoc, forgetCollection, isPermissionDenied } from './collections'
import { registerCloudWrites } from './bridge'
import { getSession, LOCAL_UID, rememberCollectionId, rememberedCollectionId, setSession } from '../session'
import { getProfileName } from '../lib/profile'

/**
 * Arranque de la nube: escucha la sesión, el perfil (sus colecciones) y la
 * colección activa; con eso enciende el espejo local y las escrituras a la nube.
 * Si no hay configuración, no hace nada y la app sigue solo en el celular.
 */
let stopUser: (() => void) | undefined
let stopCollection: (() => void) | undefined
let stopNames: (() => void) | undefined
let stopMirror: (() => void) | undefined

function clearCollection() {
  stopCollection?.(); stopCollection = undefined
  stopMirror?.(); stopMirror = undefined
  registerCloudWrites(null)
}

function clearAll() {
  stopUser?.(); stopUser = undefined
  stopNames?.(); stopNames = undefined
  clearCollection()
}

export function startCloud(): void {
  if (!cloudConfigured()) {
    setSession({ cloudAvailable: false, status: 'signed-out' })
    return
  }
  setSession({ cloudAvailable: true, status: 'starting' })
  onAuth((user) => {
    clearAll()
    if (!user) {
      // Sin sesión no hay colección que recordar: así el próximo arranque no consulta la de otra cuenta.
      rememberCollectionId(undefined)
      setSession({ status: 'signed-out', person: { uid: LOCAL_UID, name: getProfileName() }, collection: null, memberships: [], sync: { state: 'local' } })
      return
    }
    const uid = user.uid
    setSession({ status: 'signed-in', person: { uid, name: user.displayName || capitalize(user.email?.split('@')[0]) || 'Yo', email: user.email ?? undefined } })
    const fs = getDb()
    let currentCid: string | undefined
    // Cuántas veces se volvió a escuchar la colección activa tras un rechazo pasajero.
    let relistens = 0

    // Nombres de las colecciones de las que soy miembro, para el selector (si hay más de una).
    // La consulta filtra por mi entrada en `members`: es la única forma que las reglas aceptan.
    stopNames = onSnapshot(query(fsCollection(fs, 'collections'), where(`members.${uid}`, '!=', null)), (qs) => {
      setSession({ memberships: qs.docs.map((c) => ({ id: c.id, name: (c.data().name as string) || 'Mi colección' })) })
    }, () => setSession({ memberships: [] }))

    /**
     * La colección ya no es mía (me sacaron, o ya no existe): se apaga todo lo suyo y se
     * limpia del perfil. El perfil vuelve a avisar y la app pasa a otra colección o a ninguna.
     */
    function dropCollection(cid: string) {
      if (currentCid === cid) {
        currentCid = undefined
        clearCollection()
        setSession((s) => ({ collection: s.collection?.id === cid ? null : s.collection, sync: { state: 'local' } }))
      }
      setSession((s) => ({ memberships: s.memberships.filter((m) => m.id !== cid) }))
      forgetCollection(cid).catch((e) => console.warn('nube:', e))
    }

    stopUser = onSnapshot(doc(fs, 'users', uid), (snap) => {
      const d = snap.data() ?? {}
      const ids = ((d.collections as string[]) ?? []).filter(Boolean)
      if (typeof d.name === 'string' && d.name) setSession((s) => ({ person: { ...s.person, name: d.name as string } }))
      const wanted = rememberedCollectionId() ?? (d.activeCollection as string | undefined) ?? ids[0]
      const cid = wanted && ids.includes(wanted) ? wanted : ids[0]
      if (cid === currentCid) return
      currentCid = cid
      relistens = 0
      clearCollection()
      if (!cid) {
        rememberCollectionId(undefined)
        setSession({ collection: null, sync: { state: 'local' } })
        return
      }
      rememberCollectionId(cid)
      listenCollection(cid)
    }, (err) => setSession({ sync: { state: 'error', message: err.message } }))

    /** Escucha la colección activa: con cada cambio actualiza la sesión y, la primera vez, enciende espejo y escrituras. */
    function listenCollection(cid: string) {
      stopCollection = onSnapshot(doc(fs, 'collections', cid), (cs) => {
        if (!cs.exists()) {
          if (cs.metadata.fromCache) {
            // Sin internet y sin copia en este celular: colección provisional, para que lo
            // que se agregue quede en cola bajo su id y suba cuando vuelva la señal.
            if (getSession().collection?.id !== cid) {
              const name = getSession().memberships.find((m) => m.id === cid)?.name ?? 'Mi colección'
              setSession({ collection: { id: cid, name, ownerUid: '', members: {}, createdAt: '' } })
              stopMirror?.()
              stopMirror = startMirror(cid, uid)
              registerCloudWrites(makeCloudWrites(cid, uid))
            }
            setSession({ sync: { state: 'offline' } })
            return
          }
          // La nube dice que no existe: se confirma antes de olvidarla.
          void recheck(cid)
          return
        }
        const col = collectionFromDoc(cs.id, cs.data())
        const wasActive = getSession().collection?.id === col.id
        setSession({ collection: col })
        if (!wasActive) {
          stopMirror?.()
          stopMirror = startMirror(cid, uid)
          registerCloudWrites(makeCloudWrites(cid, uid))
          setSession((s) => ({ sync: s.sync.state === 'local' ? { state: 'pending' } : s.sync }))
        }
      }, (err) => {
        // Sin permiso de leerla: lo normal es que ya no sea miembro, pero se confirma primero.
        if (isPermissionDenied(err)) void recheck(cid)
        else setSession({ sync: { state: 'error', message: err.message } })
      })
    }

    /**
     * La nube negó la colección (o dijo que no existe). Puede ser pasajero: al crearla, el
     * perfil avisa en el celular antes de que el lote llegue al servidor, y la escucha puede
     * adelantarse. Se espera a que lleguen las escrituras y se pregunta al servidor: si la
     * colección se puede leer, se vuelve a escuchar; si no, ya no es mía y se olvida.
     */
    async function recheck(cid: string) {
      try {
        await waitForPendingWrites(fs)
      } catch {
        // Sin conexión no hay nada que confirmar; se decide con lo que diga el servidor.
      }
      if (currentCid !== cid) return
      try {
        const snap = await getDocFromServer(doc(fs, 'collections', cid))
        if (!snap.exists()) {
          dropCollection(cid)
          return
        }
        if (relistens >= 3) {
          setSession({ sync: { state: 'error', message: 'No se pudo abrir la colección. Cierra la app y vuelve a entrar.' } })
          return
        }
        relistens += 1
        stopCollection?.()
        listenCollection(cid)
      } catch (e) {
        if (isPermissionDenied(e)) dropCollection(cid)
        else setSession({ sync: { state: 'error', message: e instanceof Error ? e.message : String(e) } })
      }
    }
  })
}

/** 'santiago' → 'Santiago', para cuando el perfil todavía no trae nombre. */
function capitalize(s: string | undefined): string | undefined {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
