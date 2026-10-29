import type { SVGProps } from 'react'

/** Íconos de las pantallas de cuenta, colección e invitación. Mismo trazo que Icons.tsx. */
const base: SVGProps<SVGSVGElement> = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

/** Enlace (invitar). */
export const LinkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11.5 4.4" /><path d="M14 11a5 5 0 0 0-7.1 0l-2.8 2.8a5 5 0 0 0 7.1 7.1l1.3-1.3" /></svg>
)
/** Más (crear). */
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
)
/** Persona. */
export const PersonIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
)
/** Nube (sincronización). */
export const CloudIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7z" /></svg>
)
/** Flecha pequeña a la derecha (ir a). */
export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M9 6l6 6-6 6" /></svg>
)
/** Descargar (exportar). */
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
)
/** Lápiz (editar). */
export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 6.5l3 3" /></svg>
)
/** Salir (cerrar sesión). */
export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M9 12h10" /></svg>
)
/** Ver contraseña. */
export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
)
/** Ocultar contraseña. */
export const EyeOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 13.4 13.4M6.5 6.6C3.8 8.3 2 12 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.7-1.1M9.5 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-2.6 3.3" /></svg>
)
/** Palomita (listo, copiado). */
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
/** Compartir (enlace que se manda). */
export const ShareIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
)
/** Abre en otra página (Discogs). */
export const ExternalIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
)
/** Celular (instalar). */
export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
)
