import rawConfig from './firebase-config.json'

/**
 * ¿Hay nube configurada? Se lee sin cargar Firebase, para que la app sin cuenta
 * no descargue nada de más. Con VITE_FIREBASE_EMULATOR=1 (pruebas) siempre hay.
 */
const cfg = rawConfig as { apiKey?: string; projectId?: string }

export function cloudConfigured(): boolean {
  return import.meta.env.VITE_FIREBASE_EMULATOR === '1' || Boolean(cfg.apiKey && cfg.projectId)
}
