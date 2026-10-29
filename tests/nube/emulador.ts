/// <reference types="node" />
/**
 * Ayudas para hablar con el emulador de Firebase desde las pruebas.
 * Lo que es lógica pura (direcciones, fábricas de datos) se prueba en emulador.test.ts.
 */
import type { Album } from '../../src/types'

export const PROYECTO = 'demo-vinylist'

export interface Direccion {
  host: string
  port: number
}

/**
 * Convierte el valor de una variable como FIRESTORE_EMULATOR_HOST ("host:puerto")
 * en host y puerto. Si no hay valor, usa 127.0.0.1 y el puerto dado.
 * "localhost" se cambia por 127.0.0.1: en Node 17+ "localhost" puede resolver a ::1
 * y el emulador solo escucha en IPv4 en algunas máquinas.
 */
export function direccionEmulador(valor: string | undefined, puertoPorDefecto: number): Direccion {
  const limpio = (valor ?? '').trim()
  if (!limpio) return { host: '127.0.0.1', port: puertoPorDefecto }
  const sinEsquema = limpio.replace(/^https?:\/\//, '')
  const idx = sinEsquema.lastIndexOf(':')
  const hostCrudo = idx > 0 ? sinEsquema.slice(0, idx) : sinEsquema
  const puerto = idx > 0 ? Number(sinEsquema.slice(idx + 1)) : NaN
  const host = hostCrudo === 'localhost' || hostCrudo === '' ? '127.0.0.1' : hostCrudo
  return { host, port: Number.isInteger(puerto) && puerto > 0 ? puerto : puertoPorDefecto }
}

export function firestoreEmulador(): Direccion {
  return direccionEmulador(process.env.FIRESTORE_EMULATOR_HOST, 8080)
}

export function authEmulador(): Direccion {
  return direccionEmulador(process.env.FIREBASE_AUTH_EMULATOR_HOST, 9099)
}

/** Lanza un error claro si el emulador no está arriba, en vez de esperar sin fin. */
export async function exigirEmulador(): Promise<void> {
  const fs = firestoreEmulador()
  const auth = authEmulador()
  const vivo = async (url: string) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) })
      return r.ok
    } catch {
      return false
    }
  }
  const okFs = await vivo(`http://${fs.host}:${fs.port}/`)
  const okAuth = await vivo(`http://${auth.host}:${auth.port}/`)
  if (!okFs || !okAuth) {
    throw new Error(
      `No encuentro el emulador de Firebase (Firestore ${okFs ? 'sí' : 'no'} en ${fs.host}:${fs.port}, Auth ${okAuth ? 'sí' : 'no'} en ${auth.host}:${auth.port}). ` +
        'Corre las pruebas con `npm run test:nube`, que lo levanta solo (necesita Java y firebase-tools).',
    )
  }
}

/** Borra todos los documentos y todas las cuentas del proyecto de mentira. */
export async function limpiarEmulador(): Promise<void> {
  const fs = firestoreEmulador()
  const auth = authEmulador()
  await fetch(`http://${fs.host}:${fs.port}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' })
  await fetch(`http://${auth.host}:${auth.port}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' })
}

/**
 * Espera a que `cond` devuelva algo distinto de undefined/false, reintentando.
 * Para comprobar lo que llega por los escuchadores (onSnapshot → Dexie).
 */
export async function esperarA<T>(
  cond: () => Promise<T | undefined | false> | T | undefined | false,
  opts: { timeoutMs?: number; cadaMs?: number; que?: string } = {},
): Promise<T> {
  const { timeoutMs = 15_000, cadaMs = 50, que = 'la condición' } = opts
  const fin = Date.now() + timeoutMs
  let ultimo: unknown
  while (Date.now() < fin) {
    try {
      const v = await cond()
      if (v !== undefined && v !== false) return v as T
      ultimo = v
    } catch (e) {
      ultimo = e
    }
    await new Promise((r) => setTimeout(r, cadaMs))
  }
  throw new Error(`Se acabó el tiempo esperando ${que} (último valor: ${String(ultimo)})`)
}

let contador = 0

/** Un disco completo de prueba, con lo mínimo que exige el tipo Album. */
export function discoDePrueba(cambios: Partial<Album> = {}): Album {
  contador += 1
  const ahora = new Date().toISOString()
  return {
    id: `disco-${contador}-${Math.random().toString(36).slice(2, 8)}`,
    collectionId: 'local',
    title: `Disco de prueba ${contador}`,
    artist: 'Artista de prueba',
    year: 1970 + (contador % 50),
    genres: ['Rock'],
    styles: [],
    tracklist: [{ position: 'A1', title: 'Pista 1' }],
    addedAt: ahora,
    updatedAt: ahora,
    ...cambios,
  }
}
