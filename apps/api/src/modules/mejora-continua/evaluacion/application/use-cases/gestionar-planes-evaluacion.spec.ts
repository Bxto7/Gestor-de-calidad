/**
 * Pruebas del alta, la herencia, el borrado y las transiciones del plan de
 * evaluación.
 *
 * Sigue el patrón de `gestionar-planes-medicion.spec.ts`: dobles de los
 * puertos, `permitirTodo()` / `denegarRegistrando()` para la autorización, y
 * un `montar()` que arma el caso de uso con esos dobles. El foco está en lo
 * que este caso de uso decide y que ninguna pieza suelta puede saber: si la
 * base es elegible, qué se hereda de ella sin copiarlo, y si la transición
 * pedida exige el permiso correcto —de `evaluacion.*`, nunca de
 * `medicion.*`—.
 *
 * La denegación de permisos siempre se prueba con `denegarRegistrando()`, que
 * anota qué permiso se pidió antes de negarlo: un doble que deniega sin mirar
 * el permiso dejaría en verde una prueba «exige `evaluacion.crear`» aunque el
 * caso de uso pidiera por error `evaluacion.editar`.
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
  CompetenciaConAtributos,
  ContenidoCurricularPort,
  PlanBase,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  FiltroPlanesMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import type {
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';
import { GestionarPlanesEvaluacion } from './gestionar-planes-evaluacion.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

/**
 * Deniega cualquier permiso, pero registra en `pedidos` cuál se pidió antes de
 * negarlo.
 *
 * Un doble que deniega sin mirar el permiso («denegar a secas») dejaría en
 * verde una prueba «exige `evaluacion.crear`» aunque el caso de uso pidiera
 * por error `evaluacion.editar`: lo único que comprobaría es que *algo* fue
 * rechazado. Registrar el permiso pedido deja afirmar la cadena exacta.
 */
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

function competencia(sobre: Partial<CompetenciaConAtributos> = {}): CompetenciaConAtributos {
  return {
    id: 'c-1',
    codigo: 'CPE-01',
    nombre: 'Diseña soluciones de ingeniería',
    activa: true,
    atributos: [{ id: 'ag-8', codigo: 'AG-I08', nombre: 'Aprendizaje autónomo' }],
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
    estado: 'Borrador',
    creadoEn: new Date('2026-02-01'),
    actualizadoEn: new Date('2026-02-01'),
    ...sobre,
  };
}

function contenido(sobre: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [planBase()],
    planPorId: async () => planBase(),
    competenciasDelPlan: async () => [competencia()],
    asignaturasDelPlan: async () => [],
    ...sobre,
  };
}

/** Doble completo de `RepositorioPlanMedicionPort`: solo lo usan `listar`, `porId` y `matriz`. */
function repoMedicion(
  sobre: Partial<RepositorioPlanMedicionPort> = {},
): RepositorioPlanMedicionPort {
  return {
    listar: async () => [planMedicion()],
    porId: async () => planMedicion(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: async (d) => planMedicion({ codigo: d.codigo, tipo: d.tipo, meta: d.meta }),
    actualizar: async (_id, d) => planMedicion({ meta: d.meta ?? 0.7 }),
    cambiarEstado: async (_id, estado) => planMedicion({ estado }),
    eliminar: async () => undefined,
    declararCompetencias: async () => planMedicion(),
    declararPeriodos: async () => planMedicion(),
    matriz: async () => [
      { competenciaId: 'c-1', periodoId: 'p-1', realizada: false, realizadaEn: null },
    ],
    programar: async () => [],
    contenidoDe: async () => ({
      meta: 0.7,
      periodoInicio: null,
      competenciaIds: [],
      periodos: [],
      celdas: [],
    }),
    copiar: async (d) => planMedicion({ codigo: d.codigo, version: d.version }),
    linajeDe: async () => [planMedicion()],
    marcarVigenteRelevando: async () => ({
      plan: planMedicion({ estado: 'Vigente' }),
      relevado: null,
    }),
    marcarRealizada: async () => ({
      competenciaId: 'c-1',
      periodoId: 'p-1',
      realizada: true,
      realizadaEn: new Date(),
    }),
    ...sobre,
  };
}

function repoEvaluacion(
  sobre: Partial<RepositorioPlanEvaluacionPort> = {},
): RepositorioPlanEvaluacionPort {
  return {
    listar: async () => [evaluacion()],
    porId: async () => evaluacion(),
    vigenteDe: async () => evaluacion({ estado: 'Vigente' }),
    codigosDe: async () => [],
    crear: async (d) => evaluacion({ planMedicionId: d.planMedicionId, codigo: d.codigo }),
    cambiarEstado: async (_id, estado) => evaluacion({ estado }),
    eliminar: async () => undefined,
    ...sobre,
  };
}

function montar(
  opciones: {
    base?: DatosPlanMedicion | null;
    listado?: DatosPlanMedicion[];
    competencias?: CompetenciaConAtributos[];
    evaluacion?: DatosPlanEvaluacion;
    vigente?: DatosPlanEvaluacion | null;
    contenido?: Partial<ContenidoCurricularPort>;
    autorizacion?: AuthorizationPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const publicador: PublicadorDeEventos = {
    publicar: async (e) => {
      publicados.push(...e);
    },
  };

  const pedidos: { filtros: (FiltroPlanesMedicion | undefined)[] } = { filtros: [] };
  const fuenteListado = opciones.listado ?? [planMedicion()];
  const baseActual = opciones.base === undefined ? planMedicion() : opciones.base;
  const evaluacionActual = opciones.evaluacion ?? evaluacion();

  const mediciones = repoMedicion({
    porId: async () => baseActual,
    listar: async (filtro) => {
      pedidos.filtros.push(filtro);
      // Filtra por estado como lo haría la consulta real: la prueba de
      // `basesElegibles` depende de que cada llamada devuelva solo lo suyo.
      return fuenteListado.filter((p) => !filtro?.estado || p.estado === filtro.estado);
    },
  });

  const evaluaciones = repoEvaluacion({
    porId: async () => evaluacionActual,
    vigenteDe: async () =>
      opciones.vigente === undefined ? evaluacion({ estado: 'Vigente' }) : opciones.vigente,
    cambiarEstado: async (_id, estado) => ({ ...evaluacionActual, estado }),
  });

  const curricular = contenido({
    competenciasDelPlan: async () => opciones.competencias ?? [competencia()],
    ...opciones.contenido,
  });

  const caso = new GestionarPlanesEvaluacion(
    evaluaciones,
    mediciones,
    curricular,
    opciones.autorizacion ?? permitirTodo(),
    publicador,
  );

  return { caso, publicados, pedidos };
}

describe('RF-PE-001 y RF-PE-002 — el alta', () => {
  it('nace en Borrador con su código EV-', async () => {
    const { caso } = montar();

    const creado = await caso.crear(ACTOR, 'pm-1');

    expect(creado.estado).toBe('Borrador');
    expect(creado.codigo).toBe('EV-PE-ISI-2026-v2-D-v1');
  });

  it('RN3: una base que no está Aprobado ni Vigente se rechaza', async () => {
    // Crear la evaluación de un plan que aún se edita dejaría un plan de
    // evaluación cuyas competencias y periodos pueden cambiar bajo los pies.
    const { caso } = montar({ base: planMedicion({ estado: 'Borrador' }) });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RN2: el tipo no se elige, lo determina la base', async () => {
    const { caso } = montar({ base: planMedicion({ tipo: 'INDIRECTA' }) });

    const creado = await caso.crear(ACTOR, 'pm-1');

    expect(creado.codigo).toContain('-I-v');
  });

  it('una base que no existe es 404', async () => {
    const { caso } = montar({ base: null });

    await expect(caso.crear(ACTOR, 'pm-desconocido')).rejects.toThrow(NoEncontrado);
  });

  it('exige `evaluacion.crear`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.crear']);
  });

  it('deja constancia en la bitácora, nombrando la base', async () => {
    const { caso, publicados } = montar();

    await caso.crear(ACTOR, 'pm-1');

    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.nombre).toBe('evaluacion.creado');
    expect(publicados[0]?.detalle).toContain('PM-PE-ISI-2026-v2-D-v1');
  });
});

describe('RF-PE-001 RN3 — las bases elegibles', () => {
  it('solo ofrece planes de medición Aprobado o Vigente', async () => {
    // Ofrecer un Borrador llevaría a un 409 al crear. La lista que se enseña y
    // la regla que se aplica tienen que decir lo mismo.
    const { caso, pedidos } = montar({
      listado: [
        planMedicion({ id: 'pm-1', estado: 'Vigente' }),
        planMedicion({ id: 'pm-2', estado: 'Aprobado' }),
      ],
    });

    const bases = await caso.basesElegibles(ACTOR);

    expect(bases.map((b) => b.id)).toEqual(['pm-1', 'pm-2']);
    // Se filtra en la consulta, no en memoria: traer todos para descartar la
    // mayoría es trabajo que la base ya sabe hacer.
    expect(pedidos.filtros).toContainEqual({ estado: 'Vigente' });
  });

  it('exige `evaluacion.leer`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.basesElegibles(ACTOR)).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer']);
  });
});

describe('RF-PE-010 a RF-PE-012 — lo que se hereda', () => {
  it('las competencias salen agrupadas por atributo del graduado', async () => {
    const { caso } = montar();

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.grupos[0]?.atributo?.codigo).toBe('AG-I08');
    expect(vista.grupos[0]?.competencias.map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('solo las competencias que el plan de medición declaró, no el catálogo entero', async () => {
    // El plan base tiene dos competencias en su plan de estudios pero solo
    // declaró una a medir. La evaluación evalúa lo que se mide.
    const { caso } = montar({
      base: planMedicion({ competenciaIds: ['c-1'] }),
      competencias: [
        competencia({ id: 'c-1', codigo: 'CPE-01' }),
        competencia({ id: 'c-2', codigo: 'CPE-02' }),
      ],
    });

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.grupos.flatMap((g) => g.competencias).map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('los periodos son los del plan base, en su orden', async () => {
    const { caso } = montar();

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.periodos.map((p) => p.etiqueta)).toEqual(['2026-I', '2026-II']);
  });

  it('RF-PE-012: dice qué combinaciones están programadas', async () => {
    const { caso } = montar();

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.programadas).toEqual(['c-1|p-1']);
  });

  it('el tipo y la meta salen de la base, no de la evaluación', async () => {
    // No se copian al crear: si se copiaran, un cambio en la base los dejaría
    // mintiendo. No pueden cambiar, pero la única forma de garantizarlo es no
    // tener una segunda copia.
    const { caso } = montar({ base: planMedicion({ tipo: 'INDIRECTA', meta: 0.85 }) });

    const vista = await caso.porId(ACTOR, 'ev-1');

    expect(vista.base.tipo).toBe('INDIRECTA');
    expect(vista.base.metaPorcentaje).toBe(85);
  });
});

describe('RF-PE-008 — el borrado', () => {
  it('solo en Borrador', async () => {
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'Vigente' }) });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige `evaluacion.eliminar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.eliminar']);
  });

  it('deja constancia en la bitácora, nombrando el plan', async () => {
    const { caso, publicados } = montar();

    await caso.eliminar(ACTOR, 'ev-1');

    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.nombre).toBe('evaluacion.eliminado');
    expect(publicados[0]?.detalle).toContain('EV-PE-ISI-2026-v2-D-v1');
  });
});

describe('RF-PE-005 — las transiciones', () => {
  it('aprobar exige `evaluacion.aprobar`, no `medicion.aprobar`', async () => {
    // Con el permiso escrito entero en la máquina de estados compartida, quien
    // pudiera aprobar mediciones aprobaría también evaluaciones.
    const pedidos: string[] = [];
    const { caso } = montar({
      autorizacion: {
        puede: async (_id, permiso) => {
          pedidos.push(permiso);
          return { permitido: true };
        },
        permisosDe: async () => new Set(),
        carreraACargoDe: async () => null,
      },
      evaluacion: evaluacion({ estado: 'En revisión' }),
    });

    await caso.transicionar(ACTOR, 'ev-1', 'aprobar', {});

    expect(pedidos).toContain('evaluacion.aprobar');
    expect(pedidos).not.toContain('medicion.aprobar');
  });

  it('una transición imposible se rechaza con el motivo', async () => {
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'Borrador' }) });

    await expect(caso.transicionar(ACTOR, 'ev-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('deja constancia del antes y el después', async () => {
    const { caso, publicados } = montar({ evaluacion: evaluacion({ estado: 'Borrador' }) });

    await caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {});

    expect(publicados[0]?.nombre).toBe('evaluacion.transicionado');
    expect(publicados[0]?.detalle).toContain('Borrador → En revisión');
  });
});

describe('RF-PE-044 — el vigente', () => {
  it('devuelve null si no hay ninguno', async () => {
    const { caso } = montar({ vigente: null });

    expect(await caso.vigenteDe(ACTOR, 'pm-1')).toBeNull();
  });
});

/**
 * El alcance por carrera (2c-C): `mejora-continua` no comprobaba la carrera en
 * ninguno de sus casos de uso. `crear` la saca del plan de medición base que
 * llega en la petición; `eliminar` y `transicionar` la sacan del propio plan
 * de evaluación, saltando por su base.
 */
describe('el alcance por carrera (2c-C)', () => {
  it('crear un plan de evaluación en la carrera de otro se deniega', async () => {
    const puede = vi.fn(async (_id: string, _permiso: string, carreraId: string | null) =>
      carreraId === 'carrera-propia'
        ? ({ permitido: true } as const)
        : ({ permitido: false, motivo: 'No dirige esa carrera.' } as const),
    );
    const { caso } = montar({
      contenido: { planPorId: async () => planBase({ carreraId: 'carrera-ajena' }) },
      autorizacion: { puede, permisosDe: async () => new Set(), carreraACargoDe: async () => null },
    });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
    expect(puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.crear', 'carrera-ajena');
  });

  /**
   * Las tres operaciones que escriben, una por una: la propiedad que se
   * comprueba es la misma en las tres —que la carrera que llega a `puede()`
   * es la del plan, y no `null`—.
   */
  it.each([
    ['crear', (caso: GestionarPlanesEvaluacion) => caso.crear(ACTOR, 'pm-1')],
    ['eliminar', (caso: GestionarPlanesEvaluacion) => caso.eliminar(ACTOR, 'ev-1')],
    [
      'transicionar',
      (caso: GestionarPlanesEvaluacion) =>
        caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {}),
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
