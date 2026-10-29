import { useSyncExternalStore } from 'react'
import type { Collection, Person } from './types'
import { getProfileName } from './lib/profile'

/**
 * Estado de sesión de toda la app: quién usa el celular, en qué colección está
 * y cómo va la sincronización. Sin cuenta, la persona es "local" y la colección
 * es 'local' (solo este celular). Es un almacén mínimo para useSyncExternalStore.
 */
export type SyncState = 'local' | 'synced' | 'pending' | 'offline' | 'error'

export interface SessionState {
  /** Hay configuración de nube en la app (firebase-config.json con datos). */
  cloudAvailable: boolean
  /** starting: aún no sabemos si hay sesión guardada. */
  status: 'starting' | 'signed-out' | 'signed-in'
  person: Person
  /** Colección activa en la nube; null = la local de este celular. */
  collection: Collection | null
  /** Colecciones a las que pertenece la persona (id y nombre). */
  memberships: { id: string; name: string }[]
  sync: { state: SyncState; at?: string; message?: string }
}

export const LOCAL_UID = 'local'
export const LOCAL_COLLECTION = 'local'
const ACTIVE_KEY = 'vinylist.coleccionActiva'

let state: SessionState = {
  cloudAvailable: false,
  status: 'signed-out',
  person: { uid: LOCAL_UID, name: getProfileName() },
  collection: null,
  memberships: [],
  sync: { state: 'local' },
}

const listeners = new Set<() => void>()

export function getSession(): SessionState {
  return state
}

export function setSession(patch: Partial<SessionState> | ((s: SessionState) => Partial<SessionState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSession, getSession)
}

/** Id de la colección en la que se trabaja ahora mismo. */
export function activeCollectionId(): string {
  return state.collection?.id ?? LOCAL_COLLECTION
}

export function isCloudActive(): boolean {
  return state.collection !== null && state.status === 'signed-in'
}

/** Cuál colección abrir al entrar (se recuerda por celular). */
export function rememberedCollectionId(): string | undefined {
  try {
    return localStorage.getItem(ACTIVE_KEY) || undefined
  } catch {
    return undefined
  }
}

export function rememberCollectionId(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Sin almacenamiento; se olvida al cerrar.
  }
}

/** Nombre para mostrar de una persona de la colección activa (o el local). */
export function personName(uid: string): string {
  if (uid === state.person.uid) return state.person.name
  return state.collection?.members[uid]?.name ?? 'Alguien de la familia'
}
