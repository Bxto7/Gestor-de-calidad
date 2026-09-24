/**
 * Pestañas para cambiar entre las vistas de inicio que le correspondan a
 * un usuario con más de uno de los tres roles con vista propia. Con 0 o 1
 * de esos roles no hay nada que cambiar, así que no renderiza nada — no es
 * un estado de carga ni un placeholder, es la ausencia intencional del
 * control quien no lo necesita.
 */

import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { cn } from '@/shared/lib/cn';

const ROLES_CON_VISTA_PROPIA = ['ADMIN_SISTEMA', 'DIRECTOR_CARRERA', 'DOCENTE'] as const;

const ETIQUETA: Record<(typeof ROLES_CON_VISTA_PROPIA)[number], string> = {
  ADMIN_SISTEMA: 'Administrador',
  DIRECTOR_CARRERA: 'Director de carrera',
  DOCENTE: 'Docente',
};

export function SelectorDeVista() {
  const { identidad, vistaActiva, cambiarVista } = useSesion();

  const disponibles = ROLES_CON_VISTA_PROPIA.filter((rol) => identidad?.roles.includes(rol));

  if (disponibles.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Cambiar vista"
      className="flex gap-1 rounded-lg bg-superficie-tenue p-1"
    >
      {disponibles.map((rol) => (
        <button
          key={rol}
          type="button"
          role="tab"
          aria-selected={vistaActiva === rol}
          onClick={() => cambiarVista(rol)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-semibold transition',
            vistaActiva === rol
              ? 'bg-superficie text-uc-primary shadow-sm'
              : 'text-tinta-suave hover:text-tinta',
          )}
        >
          {ETIQUETA[rol]}
        </button>
      ))}
    </div>
  );
}
