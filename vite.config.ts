import { configDefaults, defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// En GitHub Pages la app vive bajo /vinylist/ (VITE_BASE); en otros hospedajes, en la raíz.
export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, '.', 'VITE_').VITE_BASE || '/'
  return {
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-maskable.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'VinyList · Tu colección de vinilos',
        short_name: 'VinyList',
        description: 'Tu colección de vinilos, en familia y sin membresías.',
        lang: 'es',
        theme_color: '#F4F2ED',
        background_color: '#F4F2ED',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Portadas de Discogs y Cover Art Archive se guardan para verlas sin internet.
            urlPattern: /^https:\/\/(i\.discogs\.com|coverartarchive\.org|archive\.org)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'portadas',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Las fuentes también, para que la app se vea igual sin internet: la hoja de estilos se refresca al fondo…
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fuentes-css', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // …y los archivos de fuente, que no cambian, se guardan de una vez.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'fuentes', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    // Las pruebas de la nube necesitan el emulador de Firebase: corren aparte con `npm run test:nube`.
    exclude: [...configDefaults.exclude, 'tests/nube/**'],
  },
  }
})
