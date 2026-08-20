/**
 * Traducción entre el vocabulario del dominio y el de la base de datos.
 *
 * El dominio dice `'En revisión'`; PostgreSQL guarda `EN_REVISION`. Son dos
 * vocabularios legítimos: el primero se muestra al usuario y aparece en los
 * requisitos, el segundo tiene que ser un identificador SQL válido.
 *
 * La traducción vive aquí y en ningún otro sitio. Si estuviera repartida por
 * los repositorios, bastaría con que uno olvidara una tilde para que un plan
 * quedara en un estado que la máquina de estados no reconoce.
 */

import type { EstadoPlan as EstadoDominio } from '../../domain/value-objects/estado-plan.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type {
  EstadoPlan as EstadoPrisma,
  PlanEstudios as FilaPlan,
} from '../../../../platform/database/generated/client.js';

const A_PRISMA: Readonly<Record<EstadoDominio, EstadoPrisma>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
  Vigente: 'VIGENTE',
  Histórico: 'HISTORICO',
};

const A_DOMINIO: Readonly<Record<EstadoPrisma, EstadoDominio>> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  VIGENTE: 'Vigente',
  HISTORICO: 'Histórico',
};

export function estadoADominio(estado: EstadoPrisma): EstadoDominio {
  return A_DOMINIO[estado];
}

export function estadoAPrisma(estado: EstadoDominio): EstadoPrisma {
  return A_PRISMA[estado];
}

/** Reconstituye el agregado desde una fila. No emite eventos: no es un cambio. */
export function planADominio(fila: FilaPlan): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: fila.id,
    carreraId: fila.carreraId,
    codigo: fila.codigo,
    version: fila.version,
    estado: estadoADominio(fila.estado),
    duracionAnios: fila.duracionAnios,
    fechaVigencia: fila.fechaVigencia,
    derivadoDeId: fila.derivadoDeId,
  });
}
