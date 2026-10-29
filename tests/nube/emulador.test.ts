import { describe, expect, it } from 'vitest'
import { direccionEmulador, discoDePrueba } from './emulador'

describe('direccionEmulador', () => {
  it('sin valor usa 127.0.0.1 y el puerto por defecto', () => {
    expect(direccionEmulador(undefined, 8080)).toEqual({ host: '127.0.0.1', port: 8080 })
    expect(direccionEmulador('', 9099)).toEqual({ host: '127.0.0.1', port: 9099 })
    expect(direccionEmulador('   ', 9099)).toEqual({ host: '127.0.0.1', port: 9099 })
  })

  it('separa host y puerto', () => {
    expect(direccionEmulador('192.168.1.5:8081', 8080)).toEqual({ host: '192.168.1.5', port: 8081 })
    expect(direccionEmulador('mi-maquina:9000', 8080)).toEqual({ host: 'mi-maquina', port: 9000 })
  })

  it('cambia localhost por 127.0.0.1 (evita ::1 en Node)', () => {
    expect(direccionEmulador('localhost:8080', 1)).toEqual({ host: '127.0.0.1', port: 8080 })
    expect(direccionEmulador('http://localhost:9099', 1)).toEqual({ host: '127.0.0.1', port: 9099 })
  })

  it('si el puerto no es válido, usa el por defecto', () => {
    expect(direccionEmulador('localhost:abc', 8080)).toEqual({ host: '127.0.0.1', port: 8080 })
    expect(direccionEmulador('solo-host', 8080)).toEqual({ host: 'solo-host', port: 8080 })
  })
})

describe('discoDePrueba', () => {
  it('genera discos distintos y respeta los cambios pedidos', () => {
    const a = discoDePrueba()
    const b = discoDePrueba({ title: 'Abbey Road', rating: 9, collectionId: 'fam' })
    expect(a.id).not.toBe(b.id)
    expect(a.collectionId).toBe('local')
    expect(b.title).toBe('Abbey Road')
    expect(b.rating).toBe(9)
    expect(b.collectionId).toBe('fam')
    expect(Array.isArray(a.genres)).toBe(true)
    expect(a.tracklist.length).toBeGreaterThan(0)
  })
})
