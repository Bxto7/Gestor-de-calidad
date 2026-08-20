/**
 * Primitivas de UI del sistema de diseño. Sin dominio: nada aquí sabe qué es un
 * plan de estudios. Los colores salen de los tokens de `styles/global.css`, que
 * a su vez vienen de la paleta institucional del prompt (§2).
 */

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/shared/lib/cn';

/* ── Badge de estado ──────────────────────────────────────────────────── */

/** Tonos del §2 "Estados": texto sobre fondo, ya emparejados. */
export type TonoBadge = 'activo' | 'progreso' | 'inactivo' | 'aprobado' | 'neutro';

const TONOS: Record<TonoBadge, string> = {
  activo: 'text-estado-activo-fg bg-estado-activo-bg',
  progreso: 'text-estado-progreso-fg bg-estado-progreso-bg',
  inactivo: 'text-estado-inactivo-fg bg-estado-inactivo-bg',
  aprobado: 'text-estado-aprobado-fg bg-estado-aprobado-bg',
  neutro: 'text-uc-primary bg-uc-lila-claro',
};

export function Badge({
  children,
  tono = 'neutro',
  className,
}: {
  children: ReactNode;
  tono?: TonoBadge;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Botón ────────────────────────────────────────────────────────────── */

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';

const VARIANTES: Record<VarianteBoton, string> = {
  primario:
    'bg-uc-primary text-white hover:brightness-110 shadow-[0_8px_20px_-8px_rgba(104,2,193,0.55)]',
  secundario: 'bg-white text-tinta border border-borde hover:border-uc-lila hover:text-uc-primary',
  fantasma: 'bg-transparent text-tinta-suave hover:bg-superficie-tenue',
  peligro: 'bg-white text-alerta-fg border border-alerta-borde hover:bg-alerta-bg',
};

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: 'sm' | 'md';
  children: ReactNode;
}

export function Boton({
  variante = 'secundario',
  tamano = 'md',
  className,
  children,
  ...props
}: BotonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:brightness-100',
        tamano === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        VARIANTES[variante],
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── Superficie / tarjeta ─────────────────────────────────────────────── */

export function Tarjeta({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('rounded-2xl border border-borde bg-superficie p-5', className)}>
      {children}
    </div>
  );
}

/* ── Campos de formulario ─────────────────────────────────────────────── */

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
  requerido,
}: {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: string;
  requerido?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string;
  }) => ReactNode;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  // El error desplaza a la ayuda: nunca se muestran los dos a la vez.
  const mensaje = error ?? ayuda;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-tinta">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-alerta-fg">*</span>}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': idAyuda })}
      {mensaje && (
        <p
          id={idAyuda}
          className={cn('text-xs', error ? 'font-medium text-alerta-fg' : 'text-tinta-suave')}
        >
          {mensaje}
        </p>
      )}
    </div>
  );
}

const CLASE_CONTROL =
  'w-full rounded-lg border border-borde bg-white px-3 text-sm text-tinta ' +
  'transition placeholder:text-tinta-tenue ' +
  'focus:border-uc-primary focus:outline-none focus:ring-2 focus:ring-uc-primary/15 ' +
  'aria-[invalid=true]:border-alerta-borde disabled:bg-superficie-tenue disabled:text-tinta-suave';

export function Entrada({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CLASE_CONTROL, 'h-10', className)} />;
}

export function AreaTexto({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CLASE_CONTROL, 'min-h-20 py-2', className)} />;
}

export function Selector({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CLASE_CONTROL, 'h-10 pr-8', className)} />;
}

/* ── Modal ────────────────────────────────────────────────────────────── */

const FOCALIZABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal con la gestión de foco centralizada aquí y no repartida por las
 * pantallas. Antes cada formulario ponía `autoFocus` en su primer campo, lo que
 * `jsx-a11y/no-autofocus` marca con razón: la decisión de dónde cae el foco es
 * del contenedor, no de cada campo suelto.
 *
 * Cubre las tres piezas que WCAG espera de un modal:
 *   - el foco entra al abrir (al primer control, o al diálogo si no hay ninguno)
 *   - el foco queda atrapado dentro mientras está abierto
 *   - el foco vuelve a donde estaba al cerrar
 */
export function Modal({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  pie,
  ancho = 'md',
}: {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!abierto) return;

    // Recordar el foco previo para devolverlo al cerrar.
    const previo = document.activeElement as HTMLElement | null;
    const dialogo = ref.current;

    // El primer elemento del DOM es el botón "Cerrar" del encabezado, pero en un
    // diálogo de formulario lo útil es caer en el primer campo. Se prioriza el
    // cuerpo; si no tiene controles (un diálogo de confirmación), vale el primer
    // focalizable, y si no hay ninguno, el diálogo mismo.
    const campo = dialogo?.querySelector<HTMLElement>(
      '[data-cuerpo] input:not([disabled]), [data-cuerpo] select:not([disabled]), [data-cuerpo] textarea:not([disabled])',
    );
    const primero = dialogo?.querySelector<HTMLElement>(FOCALIZABLES);
    (campo ?? primero ?? dialogo)?.focus();

    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCerrar();
        return;
      }
      if (e.key !== 'Tab' || !dialogo) return;

      // Trampa de foco: sin esto el tabulador se escapa al contenido de detrás,
      // que está oculto visualmente pero sigue siendo alcanzable.
      const focalizables = [...dialogo.querySelectorAll<HTMLElement>(FOCALIZABLES)];
      if (focalizables.length === 0) return;
      const inicio = focalizables[0];
      const fin = focalizables[focalizables.length - 1];
      if (!inicio || !fin) return;

      if (e.shiftKey && document.activeElement === inicio) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        inicio.focus();
      }
    };

    document.addEventListener('keydown', alPulsar);
    return () => {
      document.removeEventListener('keydown', alPulsar);
      previo?.focus();
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const anchos = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      {/*
        Fondo decorativo. Cerrar al hacer clic fuera es una comodidad de ratón:
        el teclado y los lectores de pantalla ya tienen Escape y el botón
        "Cerrar" del encabezado, así que esta interacción no es la única vía.
      */}
      <div
        className="absolute inset-0 bg-[rgba(20,0,50,0.35)]"
        aria-hidden="true"
        onMouseDown={onCerrar}
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(20,0,50,0.35)] focus:outline-none',
          anchos[ancho],
        )}
      >
        <header className="flex items-start gap-4 border-b border-borde px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="text-lg font-extrabold tracking-tight">
              {titulo}
            </h2>
            {descripcion && <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tinta-tenue transition hover:bg-superficie-tenue hover:text-tinta"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div data-cuerpo className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {children}
        </div>
        {pie && (
          <footer className="flex justify-end gap-2 border-t border-borde px-6 py-4">{pie}</footer>
        )}
      </div>
    </div>
  );
}

/* ── Estados vacíos y de carga ────────────────────────────────────────── */

export function EstadoVacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-borde bg-superficie px-6 py-12 text-center">
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      <p className="max-w-md text-sm text-tinta-suave">{detalle}</p>
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function Cargando({ etiqueta = 'Cargando…' }: { etiqueta?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-sm text-tinta-suave">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-uc-lila border-t-uc-primary"
        aria-hidden="true"
      />
      {etiqueta}
    </div>
  );
}

/* ── Cabecera de sección ──────────────────────────────────────────────── */

export function CabeceraSeccion({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}
