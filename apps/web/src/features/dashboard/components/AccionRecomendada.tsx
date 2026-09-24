/**
 * La acción más útil ahora mismo en la vista del Administrador: asignar director
 * a las carreras que no lo tienen. Compone la `TarjetaDeAccion` compartida.
 */

import { TarjetaDeAccion } from '@/shared/components/ui';

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
    <TarjetaDeAccion
      etiqueta="Acción recomendada"
      titulo={`${plural(carreras.length, 'carrera', 'carreras')} sin director asignado`}
      descripcion={nombresDe(carreras)}
      boton={{ texto: 'Asignar responsables', href: '/usuarios' }}
    />
  );
}
