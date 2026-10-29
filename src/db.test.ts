import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

/**
 * Migraciones de la base local: se siembra la base como la dejaba una versión
 * anterior y se abre con la app para ver cómo quedan los deseos.
 */
describe('migración de deseos viejos', () => {
  it('de v0.1 (versión 2) y de la versión 3 rota, los deseos locales pasan a ser de la persona local', async () => {
    const vieja = new Dexie('vinylist')
    // Versión 3 tal como la aplicó la app antes del arreglo: colección puesta, nombre copiado, uid sin corregir.
    vieja.version(3).stores({ albums: 'id, collectionId', wishlist: 'id, collectionId, wantedBy, addedAt', tasteCache: 'key, fetchedAt' })
    await vieja.table('wishlist').bulkAdd([
      { id: 'w1', collectionId: 'local', title: 'Rumours', artist: 'Fleetwood Mac', wantedBy: 'Ana', wantedByName: 'Ana', addedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'w2', collectionId: 'local', title: 'Abbey Road', artist: 'The Beatles', wantedBy: 'Yo', wantedByName: 'Yo', reservedBy: 'local', reservedByName: 'Ana', addedAt: '2025-01-02T00:00:00.000Z' },
      { id: 'w3', collectionId: 'local', title: 'Kind of Blue', artist: 'Miles Davis', wantedBy: 'local', wantedByName: 'Ana', addedAt: '2025-01-03T00:00:00.000Z' },
      { id: 'w4', collectionId: 'c1', title: 'Blue', artist: 'Joni Mitchell', wantedBy: 'uidA', wantedByName: 'Mamá', reservedBy: 'uidB', reservedByName: 'Papá', addedAt: '2025-01-04T00:00:00.000Z' },
    ])
    vieja.close()

    const { db } = await import('./db')
    const rows = await db.wishlist.orderBy('id').toArray()
    expect(rows.map((w) => [w.id, w.wantedBy, w.wantedByName])).toEqual([
      ['w1', 'local', 'Ana'],
      ['w2', 'local', 'Yo'],
      ['w3', 'local', 'Ana'],
      ['w4', 'uidA', 'Mamá'],
    ])
    expect(rows[1].reservedBy).toBeUndefined()
    expect(rows[3]).toMatchObject({ reservedBy: 'uidB', reservedByName: 'Papá' })
    db.close()
  })

  it('directo desde v0.1 (versión 2): sin colección ni nombres', async () => {
    await Dexie.delete('vinylist')
    const vieja = new Dexie('vinylist')
    vieja.version(2).stores({ albums: 'id, artist, title, addedAt', wishlist: 'id, wantedBy, addedAt', tasteCache: 'key, fetchedAt' })
    await vieja.table('wishlist').add({ id: 'w1', title: 'Rumours', artist: 'Fleetwood Mac', wantedBy: 'Ana', addedAt: '2025-01-01T00:00:00.000Z' })
    await vieja.table('albums').add({ id: 'a1', title: 'Rumours', artist: 'Fleetwood Mac', genres: [], styles: [], tracklist: [], addedAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' })
    vieja.close()

    const { db } = await import('./db')
    await db.open()
    expect(await db.wishlist.get('w1')).toMatchObject({ collectionId: 'local', wantedBy: 'local', wantedByName: 'Ana' })
    expect(await db.albums.get('a1')).toMatchObject({ collectionId: 'local' })
    db.close()
  })
})
