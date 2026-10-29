/**
 * Apariencia: como el celular, clara u oscura. Se guarda por celular.
 * index.html aplica la clase `oscuro` antes de pintar (sin destello); aquí se
 * cambia en caliente y se sigue el ajuste del sistema cuando toca.
 */
export type Theme = 'system' | 'light' | 'dark'
const KEY = 'vinylist.tema'
const LIGHT = '#F4F2ED'
const DARK = '#0E1A1B'

export const THEME_LABELS: Record<Theme, string> = { system: 'Como el celular', light: 'Clara', dark: 'Oscura' }

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function isDark(theme = getTheme()): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(theme = getTheme()): void {
  const dark = isDark(theme)
  document.documentElement.classList.toggle('oscuro', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = dark ? DARK : LIGHT
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Sin almacenamiento: solo esta sesión.
  }
  applyTheme(theme)
}

/** Sigue el cambio claro/oscuro del celular mientras la apariencia sea "como el celular". */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia === 'undefined') return () => {}
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const on = () => { if (getTheme() === 'system') applyTheme('system') }
  mq.addEventListener('change', on)
  return () => mq.removeEventListener('change', on)
}
