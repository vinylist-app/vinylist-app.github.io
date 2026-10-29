import { doc, documentId, collection as fsCollection, onSnapshot, query, where } from 'firebase/firestore'
import { cloudConfigured, getDb } from './firebase'
import { onAuth } from './auth'
import { startMirror } from './mirror'
import { makeCloudWrites } from './writes'
import { collectionFromDoc } from './collections'
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
      setSession({ status: 'signed-out', person: { uid: LOCAL_UID, name: getProfileName() }, collection: null, memberships: [], sync: { state: 'local' } })
      return
    }
    const uid = user.uid
    setSession({ status: 'signed-in', person: { uid, name: user.displayName || user.email?.split('@')[0] || 'Yo', email: user.email ?? undefined } })
    const fs = getDb()
    let currentCid: string | undefined
    stopUser = onSnapshot(doc(fs, 'users', uid), (snap) => {
      const d = snap.data() ?? {}
      const ids = ((d.collections as string[]) ?? []).filter(Boolean)
      if (typeof d.name === 'string' && d.name) setSession((s) => ({ person: { ...s.person, name: d.name as string } }))
      // Nombres de las colecciones para el selector (si hay más de una).
      stopNames?.()
      if (ids.length) {
        stopNames = onSnapshot(query(fsCollection(fs, 'collections'), where(documentId(), 'in', ids.slice(0, 10))), (qs) => {
          setSession({ memberships: qs.docs.map((c) => ({ id: c.id, name: (c.data().name as string) || 'Mi colección' })) })
        }, () => setSession({ memberships: ids.map((id) => ({ id, name: 'Colección' })) }))
      } else {
        setSession({ memberships: [] })
      }
      const wanted = rememberedCollectionId() ?? (d.activeCollection as string | undefined) ?? ids[0]
      const cid = wanted && ids.includes(wanted) ? wanted : ids[0]
      if (cid === currentCid) return
      currentCid = cid
      clearCollection()
      if (!cid) {
        rememberCollectionId(undefined)
        setSession({ collection: null, sync: { state: 'local' } })
        return
      }
      rememberCollectionId(cid)
      stopCollection = onSnapshot(doc(fs, 'collections', cid), (cs) => {
        if (!cs.exists()) {
          setSession({ collection: null, sync: { state: 'local' } })
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
      }, (err) => setSession({ sync: { state: 'error', message: err.message } }))
    }, (err) => setSession({ sync: { state: 'error', message: err.message } }))
  })
}
