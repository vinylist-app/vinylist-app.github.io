/**
 * Lógica pura de invitaciones y de la pantalla de familia: leer un código o un
 * enlace pegado, validarlo, y los textos pequeños (mes de alta, iniciales,
 * "3 personas", "Hace 2 minutos"). Sin DOM ni red, para poder probarla sola.
 */

/** Letras y números del código: sin 0/O ni 1/I, que se confunden al dictarlos. */
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const INVITE_LENGTH = 6
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/

/** Donde Unirme deja el código mientras la persona entra con su cuenta. */
export const PENDING_CODE_KEY = 'vinylist.codigoPendiente'

/** ¿Es un código de invitación bien formado (ya en mayúsculas)? */
export function isValidInviteCode(code: string): boolean {
  return CODE_RE.test(code)
}

/**
 * Saca el código de lo que la persona pegó: el código solo ("k7m2qx", "K7M2-QX")
 * o el enlace completo ("https://…/unirme/K7M2QX", con o sin cosas detrás).
 * Devuelve el código en mayúsculas, o undefined si no hay nada que sirva.
 */
export function parseInviteCode(input: string | undefined | null): string | undefined {
  if (!input) return undefined
  let text = input.trim()
  if (!text) return undefined
  // Si es un enlace, nos quedamos con lo que viene después de /unirme/.
  const m = /unirme\/+([^/?#\s]+)/i.exec(text)
  if (m) text = m[1]
  try {
    text = decodeURIComponent(text)
  } catch {
    // Texto que no era un enlace codificado; se usa tal cual.
  }
  const clean = text.replace(/[\s\-_.]/g, '').toUpperCase()
  return isValidInviteCode(clean) ? clean : undefined
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * "Se unió en marzo" (o "Se unió en marzo de 2024" si fue otro año).
 * Si la fecha no se entiende, solo "Se unió".
 */
export function joinedLabel(joinedAt: string | undefined, now: Date = new Date()): string {
  if (!joinedAt) return 'Se unió'
  const d = new Date(joinedAt)
  if (Number.isNaN(d.getTime())) return 'Se unió'
  const month = MONTHS[d.getUTCMonth()]
  return d.getUTCFullYear() === now.getUTCFullYear() ? `Se unió en ${month}` : `Se unió en ${month} de ${d.getUTCFullYear()}`
}

/**
 * Iniciales para el medallón: "santiago" → "S", "Ana María" → "AM", "luis@x.mx" → "L".
 * Nunca más de dos letras; sin nombre devuelve "?".
 */
export function initials(name: string | undefined | null): string {
  const base = (name ?? '').split('@')[0].trim()
  const words = base.split(/[\s\-_.]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = [...words[0]][0]
  const last = words.length > 1 ? [...words[words.length - 1]][0] : ''
  return (first + last).toUpperCase()
}

/** "1 persona", "3 personas". */
export function peopleLabel(n: number): string {
  return `${n} ${n === 1 ? 'persona' : 'personas'}`
}

/** "1 disco", "12 discos". */
export function discsLabel(n: number): string {
  return `${n} ${n === 1 ? 'disco' : 'discos'}`
}

/** "1 deseo", "3 deseos". */
export function wishesLabel(n: number): string {
  return `${n} ${n === 1 ? 'deseo' : 'deseos'}`
}

/** "Hace un momento", "Hace 2 minutos", "Hace 3 horas", "Hace 2 días". */
export function agoLabel(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return 'Hace un momento'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'Hace un momento'
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000))
  if (s < 60) return 'Hace un momento'
  const m = Math.floor(s / 60)
  if (m < 60) return m === 1 ? 'Hace 1 minuto' : `Hace ${m} minutos`
  const h = Math.floor(m / 60)
  if (h < 24) return h === 1 ? 'Hace 1 hora' : `Hace ${h} horas`
  const d = Math.floor(h / 24)
  return d === 1 ? 'Hace 1 día' : `Hace ${d} días`
}

// ---------- Código pendiente (sessionStorage, con cuidado de que no exista) ----------

export function readPendingCode(): string | undefined {
  try {
    return parseInviteCode(sessionStorage.getItem(PENDING_CODE_KEY))
  } catch {
    return undefined
  }
}

export function savePendingCode(code: string): void {
  try {
    sessionStorage.setItem(PENDING_CODE_KEY, code)
  } catch {
    // Sin almacenamiento: la persona pegará el enlace a mano.
  }
}

export function clearPendingCode(): void {
  try {
    sessionStorage.removeItem(PENDING_CODE_KEY)
  } catch {
    // Nada que borrar.
  }
}
