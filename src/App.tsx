import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Collection } from './pages/Collection'
import { Search } from './pages/Search'
import { AlbumPage } from './pages/AlbumPage'
import { Wishlist } from './pages/Wishlist'
import { Settings } from './pages/Settings'
import { ForYou } from './pages/ForYou'
import { Preview } from './pages/Preview'
import { TabBar } from './components/TabBar'

// El lector de códigos pesa bastante; se carga solo al abrir el escáner.
const Scan = lazy(() => import('./pages/Scan').then((m) => ({ default: m.Scan })))
// Las pantallas de cuenta y colección traen Firebase; se cargan al entrar a ellas.
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })))
const Family = lazy(() => import('./pages/Family').then((m) => ({ default: m.Family })))
const Join = lazy(() => import('./pages/Join').then((m) => ({ default: m.Join })))

const Loading = () => <main className="page"><p className="muted">Cargando…</p></main>

/** Rutas a pantalla completa, sin la barra de pestañas. */
const FULLSCREEN = ['/album/', '/escanear', '/vista/', '/cuenta', '/unirme/']

function Shell() {
  const { pathname } = useLocation()
  const hideTabs = FULLSCREEN.some((p) => pathname.startsWith(p))
  return (
    <>
      <Routes>
        <Route path="/" element={<Collection />} />
        <Route path="/buscar" element={<Search />} />
        <Route path="/escanear" element={<Suspense fallback={<main className="page"><p className="muted">Abriendo la cámara…</p></main>}><Scan /></Suspense>} />
        <Route path="/vista/:source/:sourceId" element={<Preview />} />
        <Route path="/album/:id" element={<AlbumPage />} />
        <Route path="/para-ti" element={<ForYou />} />
        <Route path="/deseos" element={<Wishlist />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="/cuenta" element={<Suspense fallback={<Loading />}><Account /></Suspense>} />
        <Route path="/coleccion" element={<Suspense fallback={<Loading />}><Family /></Suspense>} />
        <Route path="/unirme/:code" element={<Suspense fallback={<Loading />}><Join /></Suspense>} />
      </Routes>
      {!hideTabs && <TabBar />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Shell />
    </BrowserRouter>
  )
}
