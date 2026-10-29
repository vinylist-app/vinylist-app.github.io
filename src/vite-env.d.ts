/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DISCOGS_TOKEN?: string
  readonly VITE_BASE?: string
  readonly VITE_FIREBASE_EMULATOR?: string
}

declare const __APP_VERSION__: string
