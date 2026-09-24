/**
 * Tarjeta de la acción más útil ahora mismo en la vista del Administrador:
 * asignar director a las carreras que no lo tienen.
 *
 * Propia de esta vista y no del catálogo compartido: nada más la usa. Los
 * colores son los mismos tokens del degradado de `ResumenGenerico`.
 */

import { Link } from 'react-router-dom';

import { plural } from '../domain/vista-admin';

interface Props {
  readonly carreras: readonly { id: string; nombre: string }[];
}

const NOMBRADAS = 2;

function nombresDe(carreras: Props['carreras']): string {
  const nombres = carreras
    .slice(0, NOMBRADAS)
    .map((c) => c.nombre)
    .join(', ');
  const resto = carreras.length - NOMBRADAS;
  return resto > 0 ? `${nombres} y ${resto} más` : nombres;
}

export function AccionRecomendada({ carreras }: Props) {
  if (carreras.length === 0) return null;

  return (
    <section
      aria-label="Acción recomendada"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-uc-primary via-uc-v1 to-uc-dark p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-uc-v2 opacity-30"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">Acción recomendada</p>
          <p className="mt-1 text-lg font-semibold">
            {plural(carreras.length, 'carrera', 'carreras')} sin director asignado
          </p>
          <p className="text-sm">{nombresDe(carreras)}</p>
        </div>
        <Link
          to="/usuarios"
          className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-uc-primary transition hover:brightness-95"
        >
          Asignar responsables
        </Link>
      </div>
    </section>
  );
}
