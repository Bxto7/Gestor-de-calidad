import type { TonoBadge } from '@/shared/components/ui';
import type { EstadoPlan } from '../domain/tipos';

/** Mapea el estado del plan al tono de badge del §2 del prompt. */
export function tonoDeEstado(estado: EstadoPlan): TonoBadge {
  switch (estado) {
    case 'Borrador':
      return 'inactivo' as const;
    case 'En revisión':
      return 'progreso' as const;
    case 'Aprobado':
      return 'aprobado' as const;
    case 'Vigente':
      return 'activo' as const;
    case 'Histórico':
      return 'inactivo' as const;
  }
}
