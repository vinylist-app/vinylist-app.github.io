import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { cloudConfigured } from './cloud/config'
import { setSession } from './session'
import './styles.css'
import App from './App'

registerSW({ immediate: true })
applyTheme()
watchSystemTheme()
// Firebase pesa: solo se carga si la app tiene nube configurada.
if (cloudConfigured()) {
  setSession({ cloudAvailable: true, status: 'starting' })
  void import('./cloud').then((m) => m.startCloud())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
