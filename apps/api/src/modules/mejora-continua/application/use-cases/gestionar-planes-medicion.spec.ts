/**
 * Pruebas del alta, edición, baja y ciclo de vida del plan de medición.
 *
 * Aquí se junta por primera vez todo lo anterior: la máquina de estados, la
 * meta, el motor de consistencia y el puerto hacia el Plan de Estudios. El foco
 * está en lo que este caso de uso decide y las piezas sueltas no pueden saber:
 * si el plan base sirve, si ya hay un Vigente de ese tipo, y si la transición
 * pedida puede ejecutarse.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  ContenidoCurricularPort,
  PlanBase,
} from '../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../ports/plan-medicion.port.js';
import { GestionarPlanesMedicion } from './gestionar-planes-medicion.use-case.js';

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
    estado: 'Borrador',
    periodoInicio: { anio: 2024, mitad: 1 },
    competenciaIds: ['cmp-1'],
    periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: new Date('2024-07-31') }],
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function contenido(sobre: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [planBase()],
    planPorId: async () => planBase(),
    competenciasDelPlan: async () => [
      { id: 'cmp-1', codigo: 'CPE-01', nombre: 'Una', activa: true, atributos: [] },
    ],
    ...sobre,
  };
}

function repo(sobre: Partial<RepositorioPlanMedicionPort> = {}): RepositorioPlanMedicionPort {
  return {
    listar: async () => [plan()],
    porId: async () => plan(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: async (d) => plan({ codigo: d.codigo, tipo: d.tipo, meta: d.meta }),
    actualizar: async (_id, d) => plan({ meta: d.meta ?? 0.7 }),
    cambiarEstado: async (_id, estado) => plan({ estado }),
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
    marcarRealizada: async () => ({
      competenciaId: 'cmp-1',
      periodoId: 'per-1',
      realizada: true,
      realizadaEn: new Date(),
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
  const caso = new GestionarPlanesMedicion(
    repo(opciones.repo),
    contenido(opciones.contenido),
    opciones.autorizacion ?? permitirTodo(),
    publicador,
  );
  return { caso, vistos };
}

describe('RF-PM-001 a RF-PM-004 — crear', () => {
  it('crea en Borrador con código generado y meta en fracción', async () => {
    const { caso, vistos } = montar();

    const creado = await caso.crear(ACTOR, {
      planEstudiosId: 'pe-1',
      tipo: 'DIRECTA',
      metaPorcentaje: 70,
      periodoInicio: { anio: 2024, mitad: 1 },
    });

    expect(creado.estado).toBe('Borrador');
    expect(creado.meta).toBe(0.7);
    expect(creado.codigo).toContain('PE-ISI-2026-v1');
    expect(vistos).toHaveLength(1);
  });

  it('RF-PM-004: el correlativo continúa desde el mayor ya usado', async () => {
    let generado = '';
    const { caso } = montar({
      repo: {
        codigosDe: async () => ['PM-PE-ISI-2026-v1-D-v1', 'PM-PE-ISI-2026-v1-D-v2'],
        crear: async (d) => {
          generado = d.codigo;
          return plan({ codigo: d.codigo });
        },
      },
    });

    await caso.crear(ACTOR, {
      planEstudiosId: 'pe-1',
      tipo: 'DIRECTA',
      metaPorcentaje: 70,
      periodoInicio: null,
    });

    expect(generado).toBe('PM-PE-ISI-2026-v1-D-v3');
  });

  it('RN2: rechaza un plan de estudios que no está Aprobado ni Vigente', async () => {
    const { caso } = montar({
      contenido: { planPorId: async () => planBase({ elegible: false }) },
    });

    await expect(
      caso.crear(ACTOR, {
        planEstudiosId: 'pe-1',
        tipo: 'DIRECTA',
        metaPorcentaje: 70,
        periodoInicio: null,
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza un plan de estudios inexistente', async () => {
    const { caso } = montar({ contenido: { planPorId: async () => null } });

    await expect(
      caso.crear(ACTOR, {
        planEstudiosId: 'pe-9',
        tipo: 'DIRECTA',
        metaPorcentaje: 70,
        periodoInicio: null,
      }),
    ).rejects.toThrow(NoEncontrado);
  });

  it('excepción de RF-PM-001: un plan sin competencias no puede medirse', async () => {
    const { caso } = montar({ contenido: { competenciasDelPlan: async () => [] } });

    await expect(
      caso.crear(ACTOR, {
        planEstudiosId: 'pe-1',
        tipo: 'DIRECTA',
        metaPorcentaje: 70,
        periodoInicio: null,
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RF-PM-002 RN2 y RF-PM-041 RN1: no admite un segundo Vigente del mismo tipo', async () => {
    const { caso } = montar({ repo: { vigenteDe: async () => plan({ estado: 'Vigente' }) } });

    await expect(
      caso.crear(ACTOR, {
        planEstudiosId: 'pe-1',
        tipo: 'DIRECTA',
        metaPorcentaje: 70,
        periodoInicio: null,
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('un Vigente Directa no impide crear el Indirecta', async () => {
    // RF-PM-002 RN2 los cuenta por separado: son dos planes distintos sobre el
    // mismo plan de estudios, no dos versiones del mismo.
    let tipoConsultado = '';
    const { caso } = montar({
      repo: {
        vigenteDe: async (_id, tipo) => {
          tipoConsultado = tipo;
          return null;
        },
      },
    });

    await caso.crear(ACTOR, {
      planEstudiosId: 'pe-1',
      tipo: 'INDIRECTA',
      metaPorcentaje: 70,
      periodoInicio: null,
    });

    expect(tipoConsultado).toBe('INDIRECTA');
  });

  it('RF-PM-012: la meta fuera de rango se rechaza', async () => {
    const { caso } = montar();

    await expect(
      caso.crear(ACTOR, {
        planEstudiosId: 'pe-1',
        tipo: 'DIRECTA',
        metaPorcentaje: 120,
        periodoInicio: null,
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige el permiso de creación', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(
      caso.crear(ACTOR, {
        planEstudiosId: 'pe-1',
        tipo: 'DIRECTA',
        metaPorcentaje: 70,
        periodoInicio: null,
      }),
    ).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-PM-007 y RF-PM-008 — editar solo en Borrador', () => {
  it('cambia la meta de un Borrador y lo audita con el antes y el después', async () => {
    const { caso, vistos } = montar();

    const editado = await caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 80 });

    expect(editado.meta).toBe(0.8);
    expect(vistos[0]?.detalle).toContain('70 % → 80 %');
  });

  it('RN1: un plan En revisión ya no se edita', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'En revisión' }) } });

    await expect(caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 80 })).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('guardar la misma meta se audita como «sin cambios»', async () => {
    const { caso, vistos } = montar();

    await caso.editar(ACTOR, 'pm-1', { metaPorcentaje: 70 });

    expect(vistos[0]?.detalle).toContain('sin cambios');
  });
});

describe('RF-PM-009 — eliminar solo en Borrador', () => {
  it('elimina un Borrador y lo audita', async () => {
    const { caso, vistos } = montar();

    await caso.eliminar(ACTOR, 'pm-1');

    expect(vistos).toHaveLength(1);
  });

  it('un plan Vigente no se elimina', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(caso.eliminar(ACTOR, 'pm-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF-PM-006 y RF-PM-038 — transiciones', () => {
  it('envía a revisión un plan consistente', async () => {
    const { caso, vistos } = montar();

    const r = await caso.transicionar(ACTOR, 'pm-1', 'enviar-a-revision', {});

    expect(r.estado).toBe('En revisión');
    expect(vistos).toHaveLength(1);
  });

  it('RF-PM-038 RN1: con bloqueos no se puede enviar a revisión', async () => {
    // Matriz vacía: la competencia del plan queda sin ningún periodo programado.
    const { caso } = montar({ repo: { matriz: async () => [] } });

    await expect(caso.transicionar(ACTOR, 'pm-1', 'enviar-a-revision', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('archivar no consulta la consistencia', async () => {
    // Un plan vigente ya pasó por la validación; volver a exigirla al archivarlo
    // dejaría planes antiguos atrapados por reglas que cambiaron después.
    let consultada = false;
    const { caso } = montar({
      repo: {
        porId: async () => plan({ estado: 'Vigente' }),
        matriz: async () => {
          consultada = true;
          return [];
        },
      },
    });

    await caso.transicionar(ACTOR, 'pm-1', 'archivar', {});

    expect(consultada).toBe(false);
  });

  it('observar sin comentario se rechaza', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'En revisión' }) } });

    await expect(caso.transicionar(ACTOR, 'pm-1', 'observar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('la observación queda en la bitácora', async () => {
    const { caso, vistos } = montar({
      repo: { porId: async () => plan({ estado: 'En revisión' }) },
    });

    await caso.transicionar(ACTOR, 'pm-1', 'observar', { comentario: 'Faltan periodos.' });

    expect(vistos[0]?.detalle).toContain('Faltan periodos.');
  });

  it('cada transición exige su propio permiso', async () => {
    let pedido = '';
    const autorizacion: AuthorizationPort = {
      puede: async (_id, permiso) => {
        pedido = permiso;
        return { permitido: true };
      },
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
    };
    const { caso } = montar({
      repo: { porId: async () => plan({ estado: 'En revisión' }) },
      autorizacion,
    });

    await caso.transicionar(ACTOR, 'pm-1', 'aprobar', {});

    expect(pedido).toBe('medicion.aprobar');
  });

  it('RF-PM-006 RN1: un salto fuera de la secuencia se rechaza', async () => {
    const { caso } = montar();

    await expect(caso.transicionar(ACTOR, 'pm-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });
});

describe('RF-PM-010 y RF-PM-038 — consulta', () => {
  it('listar exige solo permiso de lectura', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.listar(ACTOR)).rejects.toThrow(AccesoDenegado);
  });

  it('la consistencia se puede consultar sin transicionar', async () => {
    const { caso, vistos } = montar({ repo: { matriz: async () => [] } });

    const r = await caso.consistencia(ACTOR, 'pm-1');

    expect(r.tieneBloqueos).toBe(true);
    // Consultar no muta: no debe dejar rastro en la bitácora.
    expect(vistos).toHaveLength(0);
  });

  it('nombra las competencias del hallazgo por su código, no por su id', async () => {
    const { caso } = montar({ repo: { matriz: async () => [] } });

    const r = await caso.consistencia(ACTOR, 'pm-1');
    const hallazgo = r.bloqueantes.find((h) => h.rf === 'RF-PM-025');

    expect(hallazgo?.afectados).toEqual(['CPE-01 · Una']);
  });

  it('una competencia retirada del plan de estudios se explica en vez de callarse', async () => {
    // El plan de medición la declaró y el de estudios ya no la tiene: no hay
    // código que resolver. Sigue siendo una competencia sin programar, así que
    // desaparecer del hallazgo sería peor que aparecer sin nombre.
    const { caso } = montar({
      repo: { matriz: async () => [] },
      contenido: { competenciasDelPlan: async () => [] },
    });

    const r = await caso.consistencia(ACTOR, 'pm-1');
    const hallazgo = r.bloqueantes.find((h) => h.rf === 'RF-PM-025');

    expect(hallazgo?.afectados).toEqual(['cmp-1 · ya no está en el plan de estudios']);
  });
});
