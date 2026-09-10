/**
 * RF-PE-034: la nueva versión de un plan de evaluación, y RF-PE-042: quién la
 * aprobó (esa parte se cubre en `gestionar-planes-evaluacion.spec.ts`, porque
 * vive en `transicionar`, no aquí).
 *
 * A diferencia de `versionar-planes-medicion.spec.ts`, no hay un `montar()`
 * que arme un `caso` nuevo por prueba: `plan` se reasigna en cada
 * `beforeEach` y varias pruebas lo mutan directamente (`plan.estado = ...`),
 * así que las variables del doble —`planes`, `configuraciones`, `casos`— viven
 * en el cuerpo del `describe` y se reconstruyen ahí, no dentro de una fábrica.
 *
 * `configuraciones` aquí no es el doble de `RepositorioConfiguracionEvaluacionPort`
 * —ese es `configuracionPort`, y lo único que hace es servir `del()`—. Es una
 * cápsula que el doble de `planes.copiar` rellena con el `contenido` que
 * recibió, para poder inspeccionar qué se envió a copiar sin acoplar la
 * prueba a la forma interna del repositorio Prisma.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado } from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  ContenidoCurricularPort,
  PlanBase,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import type {
  ConfiguracionDelPlan,
  RepositorioConfiguracionEvaluacionPort,
} from '../ports/configuracion-evaluacion.port.js';
import type {
  ContenidoEvaluacionACopiar,
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';
import { VersionarPlanesEvaluacion } from './versionar-planes-evaluacion.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function denegarRegistrando(pedidos: string[]): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function planBase(sobre: Partial<PlanBase> = {}): PlanBase {
  return {
    id: 'pe-1',
    codigo: 'PE-ISI-2026-v2',
    carreraId: 'car-1',
    carreraNombre: 'Sistemas',
    version: 2,
    elegible: true,
    duracionAnios: 5,
    ...sobre,
  };
}

function planMedicion(sobre: Partial<DatosPlanMedicion> = {}): DatosPlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    tipo: 'DIRECTA',
    codigo: 'PM-PE-ISI-2026-v2-D-v1',
    version: 1,
    meta: 0.7,
    estado: 'Aprobado',
    periodoInicio: { anio: 2026, mitad: 1 },
    competenciaIds: ['c-1'],
    periodos: [
      { id: 'p-1', etiqueta: '2026-I', orden: 1, fechaCierre: new Date('2026-07-31') },
      { id: 'p-2', etiqueta: '2026-II', orden: 2, fechaCierre: new Date('2026-12-15') },
    ],
    creadoEn: new Date('2026-01-01'),
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function evaluacion(sobre: Partial<DatosPlanEvaluacion> = {}): DatosPlanEvaluacion {
  return {
    id: 'ev-1',
    planMedicionId: 'pm-1',
    codigo: 'EV-PE-ISI-2026-v2-D-v1',
    version: 1,
    estado: 'Aprobado',
    creadoEn: new Date('2026-02-01'),
    actualizadoEn: new Date('2026-02-01'),
    derivadoDeId: null,
    aprobadoPorId: 'u-2',
    aprobadoEn: new Date('2026-02-05'),
    ...sobre,
  };
}

/** Lo ya configurado en el plan origen: una competencia, un cruce, una indicación. */
function configuracionDelPlan(sobre: Partial<ConfiguracionDelPlan> = {}): ConfiguracionDelPlan {
  return {
    competencias: [
      { competenciaId: 'c-1', instrumento: 'Rúbrica', frecuencia: 'Semestral', responsableId: 'u-9' },
    ],
    mediciones: [
      {
        competenciaId: 'c-1',
        periodoId: 'p-1',
        porcentajeAlcanzado: 80,
        asignaturas: [
          {
            id: 'ae-1',
            asignaturaId: 'a-1',
            entregable: 'Proyecto',
            docenteId: 'd-1',
            evidencias: [{ id: 'evi-1', enlace: 'https://evidencia', descripcion: 'Informe final' }],
          },
        ],
      },
    ],
    indicaciones: [
      {
        id: 'ind-1',
        periodoId: 'p-1',
        grupoObjetivo: 'EGRESADOS',
        instruccion: 'Aplicar la encuesta',
        enlaceInstrumento: 'https://instrumento',
        enlaceResultados: 'https://resultados',
      },
    ],
    ...sobre,
  };
}

/** Mutable a propósito: varias pruebas hacen `plan.estado = '...'` directamente. */
type PlanEvaluacionMutable = { -readonly [K in keyof DatosPlanEvaluacion]: DatosPlanEvaluacion[K] };

describe('RF-PE-034 — nueva versión del plan de evaluación', () => {
  let plan: PlanEvaluacionMutable;
  let configuraciones: { copiado?: ContenidoEvaluacionACopiar };
  let publicados: DomainEvent[];
  let planes: RepositorioPlanEvaluacionPort;
  let mediciones: RepositorioPlanMedicionPort;
  let curricular: ContenidoCurricularPort;
  let configuracionPort: RepositorioConfiguracionEvaluacionPort;
  let casos: VersionarPlanesEvaluacion;

  beforeEach(() => {
    plan = evaluacion();
    configuraciones = {};
    publicados = [];

    const publicador: PublicadorDeEventos = {
      publicar: async (e) => {
        publicados.push(...e);
      },
    };

    planes = {
      listar: async () => [plan],
      porId: async (id) => (id === 'ev-1' ? plan : null),
      vigenteDe: async () => null,
      codigosDe: async () => [plan.codigo],
      crear: async (d) => evaluacion({ planMedicionId: d.planMedicionId, codigo: d.codigo }),
      cambiarEstado: async (_id, estado) => evaluacion({ estado }),
      eliminar: async () => undefined,
      copiar: async (d) => {
        configuraciones.copiado = d.contenido;
        return evaluacion({
          id: 'ev-2',
          planMedicionId: d.planMedicionId,
          codigo: d.codigo,
          version: d.version,
          estado: 'Borrador',
          derivadoDeId: d.derivadoDeId,
          aprobadoPorId: null,
          aprobadoEn: null,
        });
      },
      linajeDe: async () => [
        evaluacion({ id: 'ev-3', version: 3 }),
        evaluacion({ id: 'ev-2', version: 2 }),
        evaluacion({ id: 'ev-1', version: 1 }),
      ],
    };

    mediciones = {
      listar: async () => [planMedicion()],
      porId: async () => planMedicion(),
      vigenteDe: async () => null,
      codigosDe: async () => [],
      crear: async () => planMedicion(),
      actualizar: async () => planMedicion(),
      cambiarEstado: async () => planMedicion(),
      eliminar: async () => undefined,
      declararCompetencias: async () => planMedicion(),
      declararPeriodos: async () => planMedicion(),
      // RF-PE-012: la rejilla que se copia sale de aquí, no de lo que el
      // origen llegó a configurar — un cruce programado y nunca tocado
      // también necesita su fila vacía en la versión nueva.
      matriz: async () => [
        { competenciaId: 'c-1', periodoId: 'p-1', realizada: true, realizadaEn: new Date('2026-07-01') },
      ],
      programar: async () => [],
      contenidoDe: async () => null,
      copiar: async () => planMedicion(),
      linajeDe: async () => [planMedicion()],
      marcarVigenteRelevando: async () => ({ plan: planMedicion(), relevado: null }),
      marcarRealizada: async () => ({
        competenciaId: 'c-1',
        periodoId: 'p-1',
        realizada: true,
        realizadaEn: new Date(),
      }),
    };

    curricular = {
      planesElegibles: async () => [planBase()],
      planPorId: async () => planBase(),
      competenciasDelPlan: async () => [],
      asignaturasDelPlan: async () => [],
    };

    configuracionPort = {
      del: async () => configuracionDelPlan(),
      guardarCompetencia: async () => undefined,
      reemplazarAsignaturas: async () => undefined,
      guardarPorcentaje: async () => undefined,
      reemplazarEvidencias: async () => undefined,
      planDeAsignaturaEvaluada: async () => null,
      reemplazarIndicaciones: async () => undefined,
      guardarResultados: async () => undefined,
      planDeIndicacion: async () => null,
    };

    casos = new VersionarPlanesEvaluacion(
      planes,
      mediciones,
      curricular,
      configuracionPort,
      permitirTodo(),
      publicador,
    );
  });

  it('la versión nueva nace en Borrador, con el código siguiente y el vínculo al origen', async () => {
    const v2 = await casos.generarNuevaVersion(ACTOR, 'ev-1');
    expect(v2.estado).toBe('Borrador');
    expect(v2.version).toBe(2);
    expect(v2.derivadoDeId).toBe('ev-1');
  });

  it('copia la definición: instrumento, frecuencia, responsable, asignaturas e indicaciones', async () => {
    await casos.generarNuevaVersion(ACTOR, 'ev-1');
    const copiado = configuraciones.copiado!;
    expect(copiado.competencias[0]).toMatchObject({
      instrumento: 'Rúbrica',
      frecuencia: 'Semestral',
      responsableId: 'u-9',
    });
    expect(copiado.asignaturas[0]).toMatchObject({ entregable: 'Proyecto', docenteId: 'd-1' });
    expect(copiado.indicaciones[0]).toMatchObject({ grupoObjetivo: 'EGRESADOS' });
  });

  it('NO copia el seguimiento: ni porcentaje, ni evidencias, ni enlace a resultados', async () => {
    // La decisión de fondo del ciclo. El seguimiento es lo que ocurrió en un
    // periodo concreto; copiarlo inventaría mediciones que nadie tomó.
    await casos.generarNuevaVersion(ACTOR, 'ev-1');
    const copiado = configuraciones.copiado!;
    expect(copiado.mediciones.every((m) => m.porcentajeAlcanzado === null)).toBe(true);
    expect(copiado.asignaturas.every((a) => a.evidencias.length === 0)).toBe(true);
    expect(copiado.indicaciones.every((i) => i.enlaceResultados === null)).toBe(true);
  });

  it('pero sí crea las filas de medición vacías, que son la rejilla', async () => {
    await casos.generarNuevaVersion(ACTOR, 'ev-1');
    expect(configuraciones.copiado!.mediciones).toHaveLength(1);
  });

  it('la versión original no se toca', async () => {
    const antes = { ...(await planes.porId('ev-1'))! };
    await casos.generarNuevaVersion(ACTOR, 'ev-1');
    expect(await planes.porId('ev-1')).toEqual(antes);
  });

  it('la versión nueva no hereda la aprobación de su antecesora', async () => {
    const v2 = await casos.generarNuevaVersion(ACTOR, 'ev-1');
    expect(v2.aprobadoPorId).toBeNull();
    expect(v2.aprobadoEn).toBeNull();
  });

  it('un Borrador no se versiona, y el error dice por qué', async () => {
    plan.estado = 'Borrador';
    await expect(casos.generarNuevaVersion(ACTOR, 'ev-1')).rejects.toThrow(
      /se puede editar directamente/,
    );
  });

  it('se versiona desde aprobado, vigente e histórico', async () => {
    for (const estado of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      plan.estado = estado;
      await expect(casos.generarNuevaVersion(ACTOR, 'ev-1')).resolves.toBeDefined();
    }
  });

  it('las versiones se listan de la más reciente a la más antigua', async () => {
    const lista = await casos.versionesDe(ACTOR, 'ev-1');
    expect(lista.map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it('deja rastro en la bitácora con su propia acción', async () => {
    await casos.generarNuevaVersion(ACTOR, 'ev-1');
    expect(publicados.map((e) => e.nombre)).toContain('evaluacion.version');
  });

  it('exige `evaluacion.crear`', async () => {
    const pedidos: string[] = [];
    casos = new VersionarPlanesEvaluacion(
      planes,
      mediciones,
      curricular,
      configuracionPort,
      denegarRegistrando(pedidos),
      { publicar: async () => undefined },
    );

    await expect(casos.generarNuevaVersion(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.crear']);
  });

  /**
   * El alcance por carrera (2c-C): la carrera sale de la cadena evaluación →
   * medición → plan de estudios, la misma que usa `GestionarPlanesEvaluacion`.
   */
  it('versionar el plan de otra carrera se deniega', async () => {
    curricular = { ...curricular, planPorId: async () => planBase({ carreraId: 'carrera-ajena' }) };
    const puede = vi.fn(async (_id: string, _permiso: string, carreraId: string | null) =>
      carreraId === 'carrera-propia'
        ? ({ permitido: true } as const)
        : ({ permitido: false, motivo: 'No dirige esa carrera.' } as const),
    );
    casos = new VersionarPlanesEvaluacion(
      planes,
      mediciones,
      curricular,
      configuracionPort,
      { puede, permisosDe: async () => new Set(), carreraACargoDe: async () => null },
      { publicar: async () => undefined },
    );

    await expect(casos.generarNuevaVersion(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    expect(puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.crear', 'carrera-ajena');
  });
});
