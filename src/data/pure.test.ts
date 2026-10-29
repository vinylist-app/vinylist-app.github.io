import { describe, expect, it } from 'vitest'
import { adoptWish, normalizeLocalWish, queryCollectionId } from './pure'
import type { WishlistItem } from '../types'

const base = { id: 'w1', title: 'Rumours', artist: 'Fleetwood Mac', addedAt: '2025-01-01T00:00:00.000Z' }
// Un deseo tal como lo guardaba v0.1: sin colección ni nombres, el nombre del perfil en wantedBy.
const v01 = { ...base, wantedBy: 'Ana' } as unknown as WishlistItem
// El mismo deseo tras la migración 3 original: nombre copiado, uid sin corregir.
const v3Roto: WishlistItem = { ...base, collectionId: 'local', wantedBy: 'Ana', wantedByName: 'Ana' }

describe('normalizeLocalWish', () => {
  it('un deseo de v0.1 pasa a ser de la persona local y conserva el nombre', () => {
    const n = normalizeLocalWish(v01)
    expect(n).toMatchObject({ collectionId: 'local', wantedBy: 'local', wantedByName: 'Ana' })
    expect(v01.wantedBy).toBe('Ana') // no toca el original
  })
  it('un deseo ya migrado con uid = nombre también pasa a local (versión 4)', () => {
    expect(normalizeLocalWish(v3Roto)).toMatchObject({ wantedBy: 'local', wantedByName: 'Ana' })
  })
  it('un deseo local de v0.2 queda igual', () => {
    const ok: WishlistItem = { ...base, collectionId: 'local', wantedBy: 'local', wantedByName: 'Ana' }
    expect(normalizeLocalWish(ok)).toEqual(ok)
  })
  it('los deseos de la nube no se tocan aunque algo coincida', () => {
    const nube: WishlistItem = { ...base, collectionId: 'c1', wantedBy: 'uidA', wantedByName: 'uidA', reservedBy: 'uidB', reservedByName: 'uidB' }
    expect(normalizeLocalWish(nube)).toEqual(nube)
  })
  it('un apartado de v0.1 (perfil renombrado) se reconoce como propio y se descarta: sin cuenta solo hay una persona', () => {
    const reservado = { ...base, wantedBy: 'Yo', reservedBy: 'Ana' } as unknown as WishlistItem
    const n = normalizeLocalWish(reservado)
    expect(n.wantedBy).toBe('local')
    expect(n.reservedBy).toBeUndefined()
    expect(n.reservedByName).toBeUndefined()
  })
  it('un apartado hecho con la migración rota (reservedBy ya era local) también se descarta', () => {
    const n = normalizeLocalWish({ ...v3Roto, reservedBy: 'local', reservedByName: 'Ana' })
    expect(n).toMatchObject({ wantedBy: 'local' })
    expect(n.reservedBy).toBeUndefined()
  })
})

describe('adoptWish', () => {
  const yo = { uid: 'uid1', name: 'Santiago' }
  it('un deseo local del respaldo pasa a ser de quien restaura, con su mismo id', () => {
    const a = adoptWish({ ...base, collectionId: 'local', wantedBy: 'local', wantedByName: 'Yo' }, yo, 'c1')
    expect(a).toMatchObject({ id: 'w1', collectionId: 'c1', wantedBy: 'uid1', wantedByName: 'Santiago' })
  })
  it('también si el respaldo venía de v0.1 o de la migración rota', () => {
    expect(adoptWish(v01, yo, 'c1')).toMatchObject({ wantedBy: 'uid1', wantedByName: 'Santiago' })
    expect(adoptWish(v3Roto, yo, 'c1')).toMatchObject({ wantedBy: 'uid1', wantedByName: 'Santiago' })
  })
  it('un deseo que ya era de alguien con cuenta se respeta', () => {
    const otro: WishlistItem = { ...base, collectionId: 'c0', wantedBy: 'uid9', wantedByName: 'Mamá', reservedBy: 'uid8', reservedByName: 'Papá' }
    expect(adoptWish(otro, yo, 'c1')).toEqual({ ...otro, collectionId: 'c1' })
  })
})

describe('queryCollectionId', () => {
  it('con colección activa, esa', () => {
    expect(queryCollectionId({ id: 'c1' }, 'signed-in', 'c2')).toBe('c1')
    expect(queryCollectionId({ id: 'c1' }, 'starting', undefined)).toBe('c1')
  })
  it('mientras arranca, la recordada; si no hay, aún no se sabe', () => {
    expect(queryCollectionId(null, 'starting', 'c2')).toBe('c2')
    expect(queryCollectionId(null, 'starting', undefined)).toBeUndefined()
  })
  it('sin cuenta, la de este celular', () => {
    expect(queryCollectionId(null, 'signed-out', 'c2')).toBe('local')
    expect(queryCollectionId(null, 'signed-in', undefined)).toBe('local')
  })
})
