/**
 * Pruebas de la matriz competencia × periodo.
 *
 * Dos cosas se vigilan aquí. Que la matriz se componga completa a partir de las
 * celdas programadas, que son las únicas que existen; y que la alerta de
 * RF-PM-046 se calcule en cada lectura, porque RN2 pide que desaparezca justo
 * cuando la medición se marque como realizada — una alerta almacenada quedaría
 * obsoleta en cuanto eso ocurriera.
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  ContenidoCurricularPort,
  PlanBase,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';
import { ProgramarMediciones } from './programar-mediciones.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

const AHORA = new Date('2026-06-15T12:00:00Z');
const AYER = new Date('2026-06-14T00:00:00Z');
const MANANA = new Date('2026-06-16T00:00:00Z');

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

function plan(sobre: Partial<DatosPlanMedicion> = {}): DatosPlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    tipo: 'DIRECTA',
    codigo: 'PM-1',
    version: 1,
    meta: 0.7,
    estado: 'Borrador',
    periodoInicio: { anio: 2024, mitad: 1 },
    competenciaIds: ['cmp-1'],
    periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: null }],
    creadoEn: new Date('2026-01-01'),
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
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

/** Solo lo usa `carreraDe`, para el alcance por carrera (2c-C). */
function contenido(sobre: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [planBase()],
    planPorId: async () => planBase(),
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    ...sobre,
  };
}

function repo(sobre: Partial<RepositorioPlanMedicionPort> = {}): RepositorioPlanMedicionPort {
  return {
    listar: async () => [plan()],
    porId: async () => plan(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: async () => plan(),
    actualizar: async () => plan(),
    cambiarEstado: async () => plan(),
    eliminar: async () => undefined,
    declararCompetencias: async () => plan(),
    declararPeriodos: async () => plan(),
    matriz: async () => [
      { competenciaId: 'cmp-1', periodoId: 'per-1', realizada: false, realizadaEn: null },
    ],
    programar: async () => [],
    contenidoDe: async () => ({
      meta: 0.7,
      periodoInicio: null,
      competenciaIds: [],
      periodos: [],
      celdas: [],
    }),
    copiar: async (d) => plan({ codigo: d.codigo, version: d.version }),
    linajeDe: async () => [plan()],
    marcarVigenteRelevando: async () => ({ plan: plan({ estado: 'Vigente' }), relevado: null }),
    marcarRealizada: async (_id, competenciaId, periodoId, realizada) => ({
      competenciaId,
      periodoId,
      realizada,
      realizadaEn: realizada ? AHORA : null,
    }),
    ...sobre,
  };
}

function montar(
  opciones: {
    repo?: Partial<RepositorioPlanMedicionPort>;
    contenido?: Partial<ContenidoCurricularPort>;
    autorizacion?: AuthorizationPort;
  } = {},
) {
  const vistos: DomainEvent[] = [];
  const publicador: PublicadorDeEventos = {
    publicar: async (e) => {
      vistos.push(...e);
    },
  };
  const caso = new ProgramarMediciones(
    repo(opciones.repo),
    contenido(opciones.contenido),
    opciones.autorizacion ?? permitirTodo(),
    publicador,
  );
  return { caso, vistos };
}

describe('RF-PM-024 — la matriz consolidada', () => {
  it('devuelve una fila por competencia y una columna por periodo', async () => {
    const { caso } = montar({
      repo: {
        porId: async () =>
          plan({
            competenciaIds: ['cmp-1', 'cmp-2'],
            periodos: [
              { id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
              { id: 'per-2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
            ],
          }),
      },
    });

    const vista = await caso.matriz(ACTOR, 'pm-1', AHORA);

    expect(vista.periodos).toHaveLength(2);
    expect(vista.filas).toHaveLength(2);
    expect(vista.filas[0]?.celdas).toHaveLength(2);
  });

  it('RN2: los periodos salen en orden cronológico', async () => {
    const { caso } = montar({
      repo: {
        porId: async () =>
          plan({
            periodos: [
              { id: 'per-2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
              { id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
            ],
          }),
      },
    });

    const vista = await caso.matriz(ACTOR, 'pm-1', AHORA);

    expect(vista.periodos.map((p) => p.etiqueta)).toEqual(['2024-I', '2024-II']);
  });

  it('RNF09: distingue los tres estados de celda', async () => {
    const { caso } = montar({
      repo: {
        porId: async () =>
          plan({
            competenciaIds: ['cmp-1'],
            periodos: [
              { id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: null },
              { id: 'per-2', etiqueta: '2024-II', orden: 2, fechaCierre: null },
              { id: 'per-3', etiqueta: '2025-I', orden: 3, fechaCierre: null },
            ],
          }),
        matriz: async () => [
          { competenciaId: 'cmp-1', periodoId: 'per-1', realizada: true, realizadaEn: AHORA },
          { competenciaId: 'cmp-1', periodoId: 'per-2', realizada: false, realizadaEn: null },
        ],
      },
    });

    const celdas = (await caso.matriz(ACTOR, 'pm-1', AHORA)).filas[0]?.celdas ?? [];

    expect(celdas.map((c) => c.estado)).toEqual(['realizada', 'pendiente', 'no-programada']);
  });

  it('un plan sin competencias devuelve la matriz vacía, no falla', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ competenciaIds: [] }) } });

    const vista = await caso.matriz(ACTOR, 'pm-1', AHORA);

    expect(vista.filas).toEqual([]);
  });

  it('consultar exige solo permiso de lectura', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.matriz(ACTOR, 'pm-1', AHORA)).rejects.toThrow(AccesoDenegado);
  });

  it('falla si el plan no existe', async () => {
    const { caso } = montar({ repo: { porId: async () => null } });

    await expect(caso.matriz(ACTOR, 'pm-9', AHORA)).rejects.toThrow(NoEncontrado);
  });
});

describe('RF-PM-046 — alerta por medición no realizada', () => {
  function conCierre(fechaCierre: Date | null, realizada: boolean, tipo: 'DIRECTA' | 'INDIRECTA') {
    return montar({
      repo: {
        porId: async () =>
          plan({
            tipo,
            competenciaIds: ['cmp-1'],
            periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre }],
          }),
        matriz: async () => [
          { competenciaId: 'cmp-1', periodoId: 'per-1', realizada, realizadaEn: null },
        ],
      },
    });
  }

  it('alerta cuando la fecha de cierre pasó y la celda sigue pendiente', async () => {
    const { caso } = conCierre(AYER, false, 'DIRECTA');

    const vista = await caso.matriz(ACTOR, 'pm-1', AHORA);

    expect(vista.filas[0]?.celdas[0]?.alerta).toBe(true);
    expect(vista.alertas).toBe(1);
  });

  it('RN2: la alerta desaparece al marcarla como realizada', async () => {
    const { caso } = conCierre(AYER, true, 'DIRECTA');

    expect((await caso.matriz(ACTOR, 'pm-1', AHORA)).alertas).toBe(0);
  });

  it('una fecha futura no alerta', async () => {
    const { caso } = conCierre(MANANA, false, 'DIRECTA');

    expect((await caso.matriz(ACTOR, 'pm-1', AHORA)).alertas).toBe(0);
  });

  it('un periodo sin fecha de cierre no alerta', async () => {
    const { caso } = conCierre(null, false, 'DIRECTA');

    expect((await caso.matriz(ACTOR, 'pm-1', AHORA)).alertas).toBe(0);
  });

  it('RN3: la Indirecta no tiene fecha de cierre y nunca alerta', async () => {
    const { caso } = conCierre(null, false, 'INDIRECTA');

    expect((await caso.matriz(ACTOR, 'pm-1', AHORA)).alertas).toBe(0);
  });

  it('una celda no programada nunca alerta, aunque el periodo haya vencido', async () => {
    const { caso } = montar({
      repo: {
        porId: async () =>
          plan({
            competenciaIds: ['cmp-1'],
            periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: AYER }],
          }),
        matriz: async () => [],
      },
    });

    expect((await caso.matriz(ACTOR, 'pm-1', AHORA)).alertas).toBe(0);
  });
});

describe('RF-PM-022 y RF-PM-023 — programar', () => {
  it('reemplaza la programación completa y la audita', async () => {
    const { caso, vistos } = montar();

    await caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-1' }]);

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.detalle).toContain('celdas');
  });

  it('rechaza una celda cuya competencia no está en el plan', async () => {
    const { caso } = montar();

    await expect(
      caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-ajena', periodoId: 'per-1' }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza una celda cuyo periodo no pertenece al plan', async () => {
    const { caso } = montar();

    await expect(
      caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-ajeno' }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('una celda repetida no llega dos veces al repositorio', async () => {
    // La clave primaria es compuesta: repetirla reventaría el INSERT.
    let recibidas: readonly { competenciaId: string; periodoId: string }[] = [];
    const { caso } = montar({
      repo: {
        programar: async (_id, celdas) => {
          recibidas = celdas;
          return [];
        },
      },
    });

    await caso.programar(ACTOR, 'pm-1', [
      { competenciaId: 'cmp-1', periodoId: 'per-1' },
      { competenciaId: 'cmp-1', periodoId: 'per-1' },
    ]);

    expect(recibidas).toHaveLength(1);
  });

  it('la lista vacía es válida: desprograma todo', async () => {
    // RF-PM-025 exige que cada competencia tenga un periodo, pero eso lo valida
    // el motor antes de aprobar. Mientras se configura, vaciar es legítimo.
    const { caso } = montar();

    await expect(caso.programar(ACTOR, 'pm-1', [])).resolves.toBeDefined();
  });

  it('RF-PM-007: no se programa fuera de Borrador', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(
      caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-1' }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF-PM-026 — marcar como realizada', () => {
  it('RN1: solo una celda programada puede marcarse', async () => {
    const { caso } = montar({ repo: { matriz: async () => [] } });

    await expect(caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true)).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('RN2: queda registrado con el usuario que la marcó', async () => {
    let actorRecibido = '';
    const { caso, vistos } = montar({
      repo: {
        marcarRealizada: async (_id, competenciaId, periodoId, realizada, actorId) => {
          actorRecibido = actorId;
          return { competenciaId, periodoId, realizada, realizadaEn: AHORA };
        },
      },
    });

    await caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true);

    expect(actorRecibido).toBe('u-1');
    expect(vistos).toHaveLength(1);
  });

  it('el evento nombra el periodo por su etiqueta, no por su identificador', async () => {
    const { caso, vistos } = montar();

    await caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true);

    expect(vistos[0]?.detalle).toContain('2024-I');
  });

  it('marcar se permite en Vigente: es seguimiento, no edición del plan', async () => {
    // RF-PM-026 registra que la medición ocurrió, y ocurre justamente mientras
    // el plan está vigente. Exigir Borrador haría el requisito inaplicable.
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(
      caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true),
    ).resolves.toBeDefined();
  });

  it('desmarcar también se audita', async () => {
    const { caso, vistos } = montar();

    await caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', false);

    expect(vistos[0]?.detalle).toContain('pendiente');
  });
});

/**
 * El alcance por carrera (2c-C): este caso de uso no traía el puerto
 * curricular —todo lo que valida sale del propio plan de medición— y ahora lo
 * necesita solo para esto: `carreraDe` resuelve de qué carrera es el plan de
 * estudios base, un dato que el plan de medición no guarda.
 */
describe('el alcance por carrera (2c-C)', () => {
  it('programar en la carrera de otro se deniega', async () => {
    const puede = vi.fn(async (_id: string, _permiso: string, carreraId: string | null) =>
      carreraId === 'carrera-propia'
        ? ({ permitido: true } as const)
        : ({ permitido: false, motivo: 'No dirige esa carrera.' } as const),
    );
    const { caso } = montar({
      contenido: { planPorId: async () => planBase({ carreraId: 'carrera-ajena' }) },
      autorizacion: { puede, permisosDe: async () => new Set(), carreraACargoDe: async () => null },
    });

    await expect(
      caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-1' }]),
    ).rejects.toThrow(AccesoDenegado);
    expect(puede).toHaveBeenCalledWith(ACTOR.id, 'medicion.editar', 'carrera-ajena');
  });

  it.each([
    [
      'programar',
      (caso: ProgramarMediciones) =>
        caso.programar(ACTOR, 'pm-1', [{ competenciaId: 'cmp-1', periodoId: 'per-1' }]),
    ],
    [
      'marcarRealizada',
      (caso: ProgramarMediciones) => caso.marcarRealizada(ACTOR, 'pm-1', 'cmp-1', 'per-1', true),
    ],
  ] as const)('%s pasa la carrera del plan, no null', async (_nombre, ejecutar) => {
    const puede = vi.fn(async () => ({ permitido: true }) as const);
    const { caso } = montar({
      contenido: { planPorId: async () => planBase({ carreraId: 'carrera-ajena' }) },
      autorizacion: { puede, permisosDe: async () => new Set(), carreraACargoDe: async () => null },
    });

    await ejecutar(caso).catch(() => undefined);

    expect(puede).toHaveBeenCalledWith(ACTOR.id, expect.any(String), 'carrera-ajena');
  });
});
