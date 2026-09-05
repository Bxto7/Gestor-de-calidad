/**
 * RF-PM-030 y RF-PM-034: las dos formas de copiar un plan de medición.
 *
 * Lo que se vigila aquí no es la copia en sí —de eso responde `copiarPlan`, en
 * dominio— sino las tres decisiones que este caso de uso toma sobre la
 * identidad del plan nuevo: si desciende de alguien, qué código lleva, y qué
 * rastro deja en la bitácora. Son distintas para cada operación, y esa es la
 * razón de que sean dos métodos y no uno con bandera.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  ContenidoCurricularPort,
  PlanBase,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { CopiaDelPlan } from '../../domain/services/copia-de-plan.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';
import { VersionarPlanesMedicion } from './versionar-planes-medicion.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function planBase(sobre: Partial<PlanBase> = {}): PlanBase {
  return {
    id: 'pe-1',
    codigo: 'PE-ISI-2026-v1',
    carreraId: 'car-1',
    carreraNombre: 'Sistemas',
    version: 1,
    elegible: true,
    duracionAnios: 5,
    ...sobre,
  };
}

function plan(sobre: Partial<DatosPlanMedicion> = {}): DatosPlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    tipo: 'DIRECTA',
    codigo: 'PM-PE-ISI-2026-v1-D-v1',
    version: 1,
    meta: 0.7,
    estado: 'Vigente',
    periodoInicio: { anio: 2026, mitad: 1 },
    competenciaIds: ['cmp-1'],
    periodos: [{ id: 'per-1', etiqueta: '2026-I', orden: 1, fechaCierre: null }],
    creadoEn: new Date('2026-01-01'),
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

/** Con una celda ya medida: es lo que distingue a la versión del duplicado. */
function contenido(): CopiaDelPlan {
  return {
    meta: 0.7,
    periodoInicio: { anio: 2026, mitad: 1 },
    competenciaIds: ['cmp-1'],
    periodos: [{ etiqueta: '2026-I', orden: 1, fechaCierre: null }],
    celdas: [
      {
        competenciaId: 'cmp-1',
        periodoEtiqueta: '2026-I',
        realizada: true,
        realizadaEn: new Date('2026-07-10'),
      },
    ],
  };
}

type DatosCopiar = Parameters<RepositorioPlanMedicionPort['copiar']>[0];

function montar(
  opciones: {
    estado?: DatosPlanMedicion['estado'];
    autorizacion?: AuthorizationPort;
    codigosUsados?: string[];
  } = {},
) {
  const vistos: DomainEvent[] = [];
  const copiados: DatosCopiar[] = [];

  const repo = {
    porId: async () => plan({ estado: opciones.estado ?? 'Vigente' }),
    contenidoDe: async () => contenido(),
    codigosDe: async () => opciones.codigosUsados ?? ['PM-PE-ISI-2026-v1-D-v1'],
    copiar: async (datos: DatosCopiar) => {
      copiados.push(datos);
      return plan({ id: 'pm-2', codigo: datos.codigo, version: datos.version, estado: 'Borrador' });
    },
  } as unknown as RepositorioPlanMedicionPort;

  const curricular = { planPorId: async () => planBase() } as unknown as ContenidoCurricularPort;

  const publicador: PublicadorDeEventos = {
    publicar: async (e) => {
      vistos.push(...e);
    },
  };

  const caso = new VersionarPlanesMedicion(
    repo,
    curricular,
    opciones.autorizacion ?? permitirTodo(),
    publicador,
  );
  return { caso, vistos, copiados };
}

describe('RF-PM-030 — nueva versión', () => {
  it('nace con vínculo al origen y el siguiente correlativo', async () => {
    const { caso, copiados } = montar();

    await caso.generarNuevaVersion(ACTOR, 'pm-1');

    expect(copiados[0]?.derivadoDeId).toBe('pm-1');
    expect(copiados[0]?.codigo).toBe('PM-PE-ISI-2026-v1-D-v2');
    expect(copiados[0]?.version).toBe(2);
  });

  it('conserva las marcas de realizada: son evidencia del mismo plan', async () => {
    const { caso, copiados } = montar();

    await caso.generarNuevaVersion(ACTOR, 'pm-1');

    expect(copiados[0]?.contenido.celdas.some((c) => c.realizada)).toBe(true);
  });

  it('un Borrador no se versiona: se edita', async () => {
    const { caso } = montar({ estado: 'Borrador' });

    await expect(caso.generarNuevaVersion(ACTOR, 'pm-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('el motivo dice qué hacer en su lugar, no solo que no se puede', async () => {
    const { caso } = montar({ estado: 'Borrador' });

    // RNF08: quien lo lea tiene que saber que un Borrador se edita directamente.
    await expect(caso.generarNuevaVersion(ACTOR, 'pm-1')).rejects.toThrow(/editar directamente/);
  });

  it('deja rastro en la bitácora con su propia acción', async () => {
    const { caso, vistos } = montar();

    await caso.generarNuevaVersion(ACTOR, 'pm-1');

    expect(vistos.map((e) => e.nombre)).toContain('medicion.version');
  });
});

describe('RF-PM-034 — duplicar', () => {
  it('no hereda el vínculo del original', async () => {
    const { caso, copiados } = montar();

    await caso.duplicarPlan(ACTOR, 'pm-1');

    expect(copiados[0]?.derivadoDeId).toBeNull();
  });

  it('descarta las marcas: no puede afirmar mediciones que no ocurrieron', async () => {
    const { caso, copiados } = montar();

    await caso.duplicarPlan(ACTOR, 'pm-1');

    expect(copiados[0]?.contenido.celdas.every((c) => !c.realizada)).toBe(true);
  });

  it('se puede duplicar un Borrador, a diferencia de versionar', async () => {
    const { caso } = montar({ estado: 'Borrador' });

    await expect(caso.duplicarPlan(ACTOR, 'pm-1')).resolves.toBeDefined();
  });

  it('su acción en la bitácora se distingue de la de versionar', async () => {
    const { caso, vistos } = montar();

    await caso.duplicarPlan(ACTOR, 'pm-1');

    expect(vistos.map((e) => e.nombre)).toContain('medicion.duplicado');
  });
});

describe('permisos', () => {
  it('las dos exigen poder crear planes: las dos crean uno', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.generarNuevaVersion(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.duplicarPlan(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
  });
});
