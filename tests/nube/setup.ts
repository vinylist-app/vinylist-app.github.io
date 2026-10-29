/// <reference types="node" />
/**
 * Preparación común de las pruebas de la nube. Corre antes de cada archivo.
 * - IndexedDB falsa en memoria, para que Dexie (src/db.ts) funcione en Node.
 *   Debe importarse ANTES que cualquier módulo que importe Dexie.
 * - `crypto` global, por si la versión de Node no lo trae (randomUUID, getRandomValues).
 */
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'

if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}
