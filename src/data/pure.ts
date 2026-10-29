import { LOCAL_COLLECTION, LOCAL_UID, type SessionState } from '../session'
import type { Person, WishlistItem } from '../types'

/**
 * Funciones puras sobre los datos locales: migración de deseos viejos, adopción
 * de un respaldo y qué colección consultar. Sin base de datos, para probarlas fácil.
 */

/**
 * Deja un deseo guardado sin cuenta en el formato de v0.2, donde la persona de
 * este celular es LOCAL_UID. En v0.1 `wantedBy`/`reservedBy` llevaban el nombre
 * del perfil; la primera migración copió ese nombre a `*Name` pero dejó el uid
 * con el nombre, así que la app ya no reconocía esos deseos como propios.
 * Regla: un deseo de la colección local cuyo uid coincide con su nombre (o que
 * viene de v0.1, sin colección) es de la persona local. Los deseos de la nube
 * no se tocan. Devuelve una copia; el original queda igual.
 */
export function normalizeLocalWish(w: WishlistItem): WishlistItem {
  const fromV01 = !w.collectionId
  const out: WishlistItem = { ...w, collectionId: w.collectionId || LOCAL_COLLECTION }
  if (!out.wantedByName) out.wantedByName = out.wantedBy
  if (out.reservedBy && !out.reservedByName) out.reservedByName = out.reservedBy
  if (out.collectionId !== LOCAL_COLLECTION) return out
  if (fromV01 || out.wantedBy === out.wantedByName) out.wantedBy = LOCAL_UID
  if (out.reservedBy && (fromV01 || out.reservedBy === out.reservedByName)) out.reservedBy = LOCAL_UID
  // Sin cuenta solo hay una persona: apartarse a sí misma su propio deseo no significa nada.
  if (out.reservedBy === LOCAL_UID && out.wantedBy === LOCAL_UID) {
    out.reservedBy = undefined
    out.reservedByName = undefined
  }
  return out
}

/**
 * Un deseo de un respaldo, listo para entrar en la colección `collectionId` de
 * `person`: conserva su id (restaurar dos veces no duplica) y, si en el respaldo
 * era de la persona local del celular, ahora es de quien restaura. Los deseos
 * que ya tenían dueño con cuenta se respetan.
 */
export function adoptWish(w: WishlistItem, person: Pick<Person, 'uid' | 'name'>, collectionId: string): WishlistItem {
  const n = normalizeLocalWish(w)
  const out: WishlistItem = { ...n, collectionId }
  if (n.wantedBy === LOCAL_UID) {
    out.wantedBy = person.uid
    out.wantedByName = person.name
  }
  if (n.reservedBy === LOCAL_UID) {
    out.reservedBy = person.uid
    out.reservedByName = person.name
  }
  return out
}

/**
 * Qué colección consultar en la base local: la activa; mientras la sesión
 * arranca, la que se recordó la última vez (sus discos ya están en el celular);
 * undefined cuando aún no se sabe. Sin cuenta, la de este celular.
 */
export function queryCollectionId(collection: { id: string } | null, status: SessionState['status'], remembered: string | undefined): string | undefined {
  if (collection) return collection.id
  if (status === 'starting') return remembered
  return LOCAL_COLLECTION
}
