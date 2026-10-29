import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Configuración de vitest SOLO para las pruebas de la nube (tests/nube), que
 * hablan con el emulador de Firebase. Se corre con `npm run test:nube`, que
 * levanta el emulador antes. Las pruebas normales (`npm test`) no entran aquí.
 */
const raiz = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  root: raiz,
  define: {
    // Hace que src/cloud/firebase.ts use el emulador con el proyecto de mentira demo-vinylist.
    'import.meta.env.VITE_FIREBASE_EMULATOR': '"1"',
    'import.meta.env.BASE_URL': '"/"',
  },
  test: {
    environment: 'node',
    include: ['tests/nube/**/*.test.ts'],
    setupFiles: ['tests/nube/setup.ts'],
    // Un solo emulador: los archivos corren uno tras otro para no pisarse los datos.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
