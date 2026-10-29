import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'

/**
 * Hoja que sube desde abajo: velo + panel (clases .sheet y .sheet__panel de styles.css).
 * Es la base de RateSheet, CuentaSheet y de cualquier otra hoja modal de la app.
 *
 * API
 *   <Sheet onClose={() => setOpen(false)} label="Apariencia">…</Sheet>
 *   <Sheet onClose={cerrar} labelledBy="vista-sheet-h" className="mi-hoja">
 *     <h2 id="vista-sheet-h">¿Cuál edición tienes en la mano?</h2>
 *     …
 *   </Sheet>
 *
 *   onClose     Se llama al tocar el velo, con Escape y nunca por sí sola: quien
 *               la abre decide si deja de renderizarla.
 *   label       Nombre accesible del diálogo (aria-label). Úsalo cuando el
 *               título no está en pantalla.
 *   labelledBy  id del encabezado visible que nombra la hoja (aria-labelledby).
 *               Si se da, tiene prioridad sobre `label`.
 *   className   Clases extra para el panel (se suman a .sheet__panel).
 *   children    El contenido. El asa (.sheet__handle) ya la pinta la hoja.
 *
 * Qué hace sola, para que ninguna hoja lo repita:
 *   - role="dialog" aria-modal="true" en el panel.
 *   - Al abrir enfoca el panel (tabIndex -1, sin anillo) y, al cerrar, devuelve
 *     el foco al elemento que la abrió.
 *   - Tab y Shift+Tab se quedan dentro del panel.
 *   - Escape cierra; tocar el velo cierra (solo si el gesto empezó y terminó en
 *     el velo, para que soltar un arrastre fuera del panel no la cierre).
 *   - Mientras está abierta, el documento no se desplaza (overflow hidden en
 *     html y body); el CSS de .sheet/.sheet__panel evita que el arrastre llegue
 *     a la página de fondo.
 *
 * Para migrar una hoja escrita a mano: sustituir el par
 *   <div className="sheet" onClick={cerrar}><div className="sheet__panel" role="dialog" …><div className="sheet__handle" />…</div></div>
 * por <Sheet onClose={cerrar} labelledBy=…>…</Sheet>, quitando el asa y los
 * stopPropagation; el aspecto no cambia.
 */
export function Sheet({ onClose, label, labelledBy, className, children }: {
  onClose: () => void
  label?: string
  labelledBy?: string
  className?: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  /** Siempre la última `onClose`, para que los efectos no se rearmen en cada render. */
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  /** Si el puntero bajó sobre el velo (y no sobre el panel). */
  const downOnVeil = useRef(false)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus({ preventScroll: true })

    const html = document.documentElement
    const prevHtml = html.style.overflow
    const prevBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        close.current()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      html.style.overflow = prevHtml
      document.body.style.overflow = prevBody
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  /** Tab y Shift+Tab dan la vuelta dentro del panel en vez de salir detrás del velo. */
  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !panel.current) return
    const items = focusablesIn(panel.current)
    if (items.length === 0) { e.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function onVeilPointerDown(e: PointerEvent<HTMLDivElement>) {
    downOnVeil.current = e.target === e.currentTarget
  }

  function onVeilClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && downOnVeil.current) onClose()
    downOnVeil.current = false
  }

  return (
    <div className="sheet" role="presentation" onPointerDown={onVeilPointerDown} onClick={onVeilClick}>
      <div
        ref={panel}
        className={className ? `sheet__panel ${className}` : 'sheet__panel'}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <div className="sheet__handle" />
        {children}
      </div>
    </div>
  )
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

/** Elementos del panel que reciben el foco con Tab, en orden del documento. */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
    el.tabIndex >= 0 && !el.hasAttribute('disabled') && !el.hidden && el.getAttribute('aria-hidden') !== 'true',
  )
}
