import { describe, expect, it } from 'vitest'
import { agoLabel, discsLabel, initials, isValidInviteCode, joinedLabel, parseInviteCode, peopleLabel, wishesLabel } from './invite'

describe('código de invitación', () => {
  it('acepta el código solo, en minúsculas o con guiones', () => {
    expect(parseInviteCode('K7M2QX')).toBe('K7M2QX')
    expect(parseInviteCode('k7m2qx')).toBe('K7M2QX')
    expect(parseInviteCode('  k7m-2qx ')).toBe('K7M2QX')
    expect(parseInviteCode('K7M 2QX')).toBe('K7M2QX')
  })
  it('saca el código de un enlace completo', () => {
    expect(parseInviteCode('https://santiago.github.io/vinylist/unirme/K7M2QX')).toBe('K7M2QX')
    expect(parseInviteCode('https://vinylist.app/unirme/k7m2qx?x=1#y')).toBe('K7M2QX')
    expect(parseInviteCode('vinylist.app/unirme/K7M2QX/')).toBe('K7M2QX')
    expect(parseInviteCode('Únete: https://vinylist.app/unirme/K7M2QX ¡te esperamos!')).toBe('K7M2QX')
  })
  it('rechaza lo que no es un código', () => {
    expect(parseInviteCode('')).toBeUndefined()
    expect(parseInviteCode(undefined)).toBeUndefined()
    expect(parseInviteCode('K7M2Q')).toBeUndefined()
    expect(parseInviteCode('K7M2QXZ')).toBeUndefined()
    expect(parseInviteCode('K0M2QX')).toBeUndefined() // cero
    expect(parseInviteCode('KOM2QX')).toBeUndefined() // o
    expect(parseInviteCode('K1M2QX')).toBeUndefined() // uno
    expect(parseInviteCode('KIM2QX')).toBeUndefined() // i
    expect(parseInviteCode('https://vinylist.app/album/K7M2QX')).toBeUndefined()
  })
  it('valida solo mayúsculas del alfabeto', () => {
    expect(isValidInviteCode('K7M2QX')).toBe(true)
    expect(isValidInviteCode('k7m2qx')).toBe(false)
    expect(isValidInviteCode('ABCDEF')).toBe(true)
    expect(isValidInviteCode('ABCDE1')).toBe(false)
  })
})

describe('mes de alta', () => {
  const hoy = new Date('2026-10-29T12:00:00Z')
  it('dice el mes en español', () => {
    expect(joinedLabel('2026-03-14T10:00:00Z', hoy)).toBe('Se unió en marzo')
    expect(joinedLabel('2026-10-01T10:00:00Z', hoy)).toBe('Se unió en octubre')
  })
  it('agrega el año si fue otro', () => {
    expect(joinedLabel('2024-12-25T10:00:00Z', hoy)).toBe('Se unió en diciembre de 2024')
  })
  it('no se cae con fechas raras', () => {
    expect(joinedLabel(undefined, hoy)).toBe('Se unió')
    expect(joinedLabel('ayer', hoy)).toBe('Se unió')
  })
})

describe('iniciales', () => {
  it('una letra para un nombre, dos para nombre y apellido', () => {
    expect(initials('santiago')).toBe('S')
    expect(initials('Ana María')).toBe('AM')
    expect(initials('Luis Fernando Pérez')).toBe('LP')
  })
  it('usa la parte antes de la arroba y aguanta vacíos', () => {
    expect(initials('luis@correo.mx')).toBe('L')
    expect(initials('')).toBe('?')
    expect(initials(undefined)).toBe('?')
    expect(initials('  ')).toBe('?')
  })
  it('respeta acentos', () => {
    expect(initials('Ángela')).toBe('Á')
  })
})

describe('textos de conteo y tiempo', () => {
  it('singular y plural', () => {
    expect(peopleLabel(1)).toBe('1 persona')
    expect(peopleLabel(3)).toBe('3 personas')
    expect(discsLabel(1)).toBe('1 disco')
    expect(discsLabel(12)).toBe('12 discos')
    expect(wishesLabel(0)).toBe('0 deseos')
    expect(wishesLabel(1)).toBe('1 deseo')
  })
  it('hace cuánto', () => {
    const ahora = new Date('2026-10-29T12:00:00Z')
    expect(agoLabel('2026-10-29T11:59:50Z', ahora)).toBe('Hace un momento')
    expect(agoLabel('2026-10-29T11:58:00Z', ahora)).toBe('Hace 2 minutos')
    expect(agoLabel('2026-10-29T11:59:00Z', ahora)).toBe('Hace 1 minuto')
    expect(agoLabel('2026-10-29T09:00:00Z', ahora)).toBe('Hace 3 horas')
    expect(agoLabel('2026-10-27T12:00:00Z', ahora)).toBe('Hace 2 días')
    expect(agoLabel(undefined, ahora)).toBe('Hace un momento')
  })
})
