/**
 * Pruebas de la configuración del plan de medición: qué se mide y cuándo.
 *
 * Lo que aquí se vigila es que el contenido del plan no pueda salirse de lo que
 * el plan de estudios base ofrece —ni una competencia ajena, ni un periodo
 * repetido— y que la agrupación por atributo del graduado no pierda nada por el
 * camino: ni las competencias sin mapear, ni las que responden a dos atributos.
 */

import { describe, expect, it } from 'vitest';

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
import { ConfigurarPlanMedicion } from './configurar-plan-medicion.use-case.js';

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
    periodos: [{ id: 'per-1', etiqueta: '2024-I', orden: 1, fechaCierre: null }],
    creadoEn: new Date('2026-01-01'),
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
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
    matriz: async () => [],
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
  const caso = new ConfigurarPlanMedicion(
    repo(opciones.repo),
    contenido(opciones.contenido),
    opciones.autorizacion ?? permitirTodo(),
    publicador,
  );
  return { caso, vistos };
}

describe('RF-PM-013 y RF-PM-014 — competencias agrupadas por atributo', () => {
  it('agrupa las competencias del plan por atributo del graduado', async () => {
    const { caso } = montar({
      contenido: {
        competenciasDelPlan: async () => [
          {
            id: 'cmp-1',
            codigo: 'CPE-01',
            nombre: 'Una',
            activa: true,
            atributos: [{ id: 'a1', codigo: 'AG-I01', nombre: 'Uno' }],
          },
          {
            id: 'cmp-2',
            codigo: 'CPE-02',
            nombre: 'Dos',
            activa: true,
            atributos: [{ id: 'a1', codigo: 'AG-I01', nombre: 'Uno' }],
          },
        ],
      },
    });

    const grupos = await caso.competenciasDisponibles(ACTOR, 'pm-1');

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.atributo?.codigo).toBe('AG-I01');
    expect(grupos[0]?.competencias).toHaveLength(2);
  });

  it('las competencias sin atributo salen en un grupo propio, no se pierden', async () => {
    const { caso } = montar();

    const grupos = await caso.competenciasDisponibles(ACTOR, 'pm-1');

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.atributo).toBeNull();
  });

  it('una competencia con dos atributos aparece en ambos grupos', async () => {
    // Es la matriz real: en el plan 2018 de ISI, «Aprendizaje autónomo»
    // responde a la vez a AG-I06 y a AG-I08. Quedarse con uno perdería la mitad
    // del mapeo.
    const { caso } = montar({
      contenido: {
        competenciasDelPlan: async () => [
          {
            id: 'cmp-1',
            codigo: 'CPE-01',
            nombre: 'Aprendizaje autónomo',
            activa: true,
            atributos: [
              { id: 'a1', codigo: 'AG-I06', nombre: 'Aprendizaje' },
              { id: 'a2', codigo: 'AG-I08', nombre: 'Análisis' },
            ],
          },
        ],
      },
    });

    const grupos = await caso.competenciasDisponibles(ACTOR, 'pm-1');

    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.competencias.length === 1)).toBe(true);
  });

  it('los grupos salen ordenados por código de atributo, y el sin mapear al final', async () => {
    const { caso } = montar({
      contenido: {
        competenciasDelPlan: async () => [
          {
            id: 'cmp-1',
            codigo: 'CPE-01',
            nombre: 'Sin mapear',
            activa: true,
            atributos: [],
          },
          {
            id: 'cmp-2',
            codigo: 'CPE-02',
            nombre: 'Dos',
            activa: true,
            atributos: [{ id: 'a2', codigo: 'AG-I02', nombre: 'Dos' }],
          },
          {
            id: 'cmp-3',
            codigo: 'CPE-03',
            nombre: 'Uno',
            activa: true,
            atributos: [{ id: 'a1', codigo: 'AG-I01', nombre: 'Uno' }],
          },
        ],
      },
    });

    const grupos = await caso.competenciasDisponibles(ACTOR, 'pm-1');

    expect(grupos.map((g) => g.atributo?.codigo ?? 'sin-mapear')).toEqual([
      'AG-I01',
      'AG-I02',
      'sin-mapear',
    ]);
  });

  it('consultar exige solo permiso de lectura', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.competenciasDisponibles(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
  });

  it('falla si el plan de medición no existe', async () => {
    const { caso } = montar({ repo: { porId: async () => null } });

    await expect(caso.competenciasDisponibles(ACTOR, 'pm-9')).rejects.toThrow(NoEncontrado);
  });
});

describe('RF-PM-013 RN1 y RF-PM-015 — declarar competencias', () => {
  it('reemplaza el conjunto completo y audita el antes y el después', async () => {
    const { caso, vistos } = montar();

    await caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-1']);

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.detalle).toContain('1 → 1');
  });

  it('RN1: un identificador repetido no llega dos veces al repositorio', async () => {
    let recibidos: readonly string[] = [];
    const { caso } = montar({
      repo: {
        declararCompetencias: async (_id, ids) => {
          recibidos = ids;
          return plan();
        },
      },
    });

    await caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-1', 'cmp-1']);

    expect(recibidos).toEqual(['cmp-1']);
  });

  it('rechaza una competencia que no pertenece al plan de estudios base', async () => {
    const { caso } = montar();

    await expect(caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-ajena'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('RF-PM-007: no se pueden declarar competencias fuera de Borrador', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await expect(caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-1'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('declarar exige permiso de edición', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.declararCompetencias(ACTOR, 'pm-1', ['cmp-1'])).rejects.toThrow(
      AccesoDenegado,
    );
  });
});

describe('RF-PM-016 — propuesta de periodos', () => {
  it('propone dos por año a partir del inicio del plan', async () => {
    const { caso } = montar();

    const propuestos = await caso.periodosPropuestos(ACTOR, 'pm-1');

    // duracionAnios 5 → 10 periodos.
    expect(propuestos).toHaveLength(10);
    expect(propuestos[0]?.etiqueta).toBe('2024-I');
    expect(propuestos[9]?.etiqueta).toBe('2028-II');
  });

  it('la Indirecta no propone nada: sus años los elige el usuario', async () => {
    // El plan de estudios no dice nada sobre el horizonte de una encuesta a
    // egresados, así que no hay de dónde sacar la propuesta.
    const { caso } = montar({
      repo: { porId: async () => plan({ tipo: 'INDIRECTA', periodoInicio: null }) },
    });

    expect(await caso.periodosPropuestos(ACTOR, 'pm-1')).toEqual([]);
  });

  it('una Directa sin periodo de inicio tampoco propone', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ periodoInicio: null }) } });

    expect(await caso.periodosPropuestos(ACTOR, 'pm-1')).toEqual([]);
  });
});

describe('RF-PM-018 a RF-PM-021 — declarar periodos', () => {
  it('renumera el orden y audita el cambio con las etiquetas', async () => {
    let recibidos: readonly { etiqueta: string; orden: number }[] = [];
    const { caso, vistos } = montar({
      repo: {
        declararPeriodos: async (_id, periodos) => {
          recibidos = periodos;
          return plan();
        },
      },
    });

    await caso.declararPeriodos(ACTOR, 'pm-1', [
      { etiqueta: '2024-II', orden: 7, fechaCierre: null },
      { etiqueta: '2024-I', orden: 3, fechaCierre: null },
    ]);

    expect(recibidos.map((p) => p.etiqueta)).toEqual(['2024-I', '2024-II']);
    expect(recibidos.map((p) => p.orden)).toEqual([1, 2]);
    expect(vistos[0]?.detalle).toContain('2024-I, 2024-II');
  });

  it('RF-PM-018 y RF-PM-021: rechaza etiquetas duplicadas, nombrando la repetida', async () => {
    const { caso } = montar();

    await expect(
      caso.declararPeriodos(ACTOR, 'pm-1', [
        { etiqueta: '2024-I', orden: 1, fechaCierre: null },
        { etiqueta: '2024-I', orden: 2, fechaCierre: null },
      ]),
    ).rejects.toThrow(/2024-I/);
  });

  it('la etiqueta se recorta antes de comparar', async () => {
    // «2024-I» y « 2024-I » son el mismo periodo; dejarlos pasar reventaría
    // después contra el índice único con un error que no dice nada.
    const { caso } = montar();

    await expect(
      caso.declararPeriodos(ACTOR, 'pm-1', [
        { etiqueta: '2024-I', orden: 1, fechaCierre: null },
        { etiqueta: '  2024-I  ', orden: 2, fechaCierre: null },
      ]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('la lista vacía se rechaza: RF-PM-016 RN3 exige al menos un periodo', async () => {
    const { caso } = montar();

    await expect(caso.declararPeriodos(ACTOR, 'pm-1', [])).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RF-PM-007: no se declaran periodos fuera de Borrador', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Aprobado' }) } });

    await expect(
      caso.declararPeriodos(ACTOR, 'pm-1', [{ etiqueta: '2024-I', orden: 1, fechaCierre: null }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('conserva la fecha de cierre de cada periodo', async () => {
    const cierre = new Date('2024-07-31');
    let recibidos: readonly { fechaCierre: Date | null }[] = [];
    const { caso } = montar({
      repo: {
        declararPeriodos: async (_id, periodos) => {
          recibidos = periodos;
          return plan();
        },
      },
    });

    await caso.declararPeriodos(ACTOR, 'pm-1', [
      { etiqueta: '2024-I', orden: 1, fechaCierre: cierre },
    ]);

    expect(recibidos[0]?.fechaCierre).toBe(cierre);
  });
});
