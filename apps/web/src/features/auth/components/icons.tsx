/**
 * Iconografía del portal de acceso.
 *
 * Todos los íconos heredan `currentColor` y comparten grosor de trazo 1.75 para que
 * el conjunto lea como un sistema y no como piezas sueltas de distintas librerías.
 *
 * Marca: `LogotipoUC` e `IsotipoUC` usan los PNG de `assets/marca/`. Son raster, no
 * vectores; cuando llegue el kit en SVG oficial hay que cambiar solo estos dos imports.
 * Ver `assets/marca/README.md`.
 */

import logoUC from '../../../assets/marca/logo-uc-negro.png';
import isotipoUC from '../../../assets/marca/isotipo-uc-negro.png';

interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false' as const,
});

/* ── Marca ──────────────────────────────────────────────────────────────── */

/**
 * Lockup horizontal para el panel morado. Altura fija 34px.
 * El archivo es negro; `--blanco` lo pasa a blanco por filtro CSS.
 */
export function LogotipoUC() {
  return (
    <img className="uc-logo-img uc-logo-img--blanco" src={logoUC} alt="Universidad Continental" />
  );
}

/**
 * Isotipo del panel de acceso: cuadro morado de 44×44 con el símbolo en blanco.
 * Decorativo — el nombre de la institución ya aparece como texto en la pantalla,
 * así que el alt va vacío para no duplicarlo en el lector de pantalla.
 */
export function IsotipoUC() {
  return (
    <div className="uc-isotipo">
      <img className="uc-isotipo__img" src={isotipoUC} alt="" />
    </div>
  );
}

/* ── Formulario ─────────────────────────────────────────────────────────── */

export function IconoOjo({ size = 19 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function IconoOjoTachado({ size = 19 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.8" />
      <path d="M6.4 7.6A17.3 17.3 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.9-.85" />
      <path d="M10.1 10.1a2.75 2.75 0 0 0 3.8 3.8" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  );
}

/* ── Ciclo de mejora continua (PDCA) ────────────────────────────────────── */

/** Planificar — tablero con lista de verificación. */
export function IconoPlanificar({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M16 6h1.5A1.5 1.5 0 0 1 19 7.5v11A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H8" />
      <path d="M8.75 11.5l1.25 1.25 2.25-2.25" />
      <path d="M14.75 16h-6" />
    </svg>
  );
}

/** Ejecutar — puesta en marcha. */
export function IconoEjecutar({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M10.5 9.4l4.4 2.6-4.4 2.6V9.4Z" />
    </svg>
  );
}

/** Verificar — inspección y evidencia. */
export function IconoVerificar({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M8.6 10.9l1.6 1.6 3-3.2" />
      <path d="M15.4 15.4L20 20" />
    </svg>
  );
}

/** Mejorar — tendencia al alza sostenida. */
export function IconoMejorar({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 16.5l4.75-4.75 3 3L20 6.5" />
      <path d="M15 6.5h5v5" />
    </svg>
  );
}

/** Conector direccional entre etapas del ciclo. */
export function FlechaConector() {
  return (
    <svg
      width="18"
      height="12"
      viewBox="0 0 18 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1 6h14" />
      <path d="M12 2.5L15.5 6 12 9.5" />
    </svg>
  );
}

/* ── Pie institucional ──────────────────────────────────────────────────── */

export function IconoEscudo({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3.25l6.5 2.4v5.1c0 4-2.7 7.4-6.5 8.75-3.8-1.35-6.5-4.75-6.5-8.75v-5.1L12 3.25Z" />
    </svg>
  );
}
