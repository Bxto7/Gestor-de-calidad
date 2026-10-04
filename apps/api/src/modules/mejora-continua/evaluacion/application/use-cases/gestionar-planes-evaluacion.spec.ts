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
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
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
  ConfiguracionDelPlan,
  RepositorioConfiguracionEvaluacionPort,
} from '../ports/configuracion-evaluacion.port.js';
import type {
  DatosPlanEvaluacion,
  FiltroPlanesEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';
import { GestionarPlanesEvaluacion } from './gestionar-planes-evaluacion.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => 'car-1',
    rolesDe: async () => [],
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
    carreraACargoDe: async () => 'car-1',
    rolesDe: async () => [],
  };
}

/** Sin restricción de lectura, como el Consultor. */
function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Quien lee solo una carrera (o ninguna si es `null`): el Coordinador desde el Bloque 6a. */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
  };
}

/**
 * Como la política real: concede toda lectura y la escritura solo sobre
 * `carreraPropia`. Anota cada permiso pedido; `sinPermisos` los niega aunque la
 * carrera sea la suya.
 */
function autorizarEn(
  carreraPropia: string | null,
  pedidos: string[] = [],
  sinPermisos: readonly string[] = [],
): AuthorizationPort {
  return {
    puede: async (_id, permiso, carreraId) => {
      pedidos.push(permiso);
      if (sinPermisos.includes(permiso)) {
        return { permitido: false, motivo: `Falta el permiso ${permiso}.` };
      }
      if (permiso.endsWith('.leer')) return { permitido: true };
      if (carreraPropia === null) {
        return { permitido: false, motivo: 'El usuario no tiene ninguna carrera asignada.' };
      }
      return carreraId === carreraPropia
        ? { permitido: true }
        : {
            permitido: false,
            motivo: 'El usuario no dirige la carrera a la que pertenece este plan.',
          };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => carreraPropia,
    rolesDe: async () => [],
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
    carreraId: 'car-1',
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
    carreraId: 'car-1',
    codigo: 'EV-PE-ISI-2026-v2-D-v1',
    version: 1,
    estado: 'Borrador',
    creadoEn: new Date('2026-02-01'),
    actualizadoEn: new Date('2026-02-01'),
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
    competenciasDelPlan: async () => [competencia()],
    asignaturasDelPlan: async () => [],
    carreraPorId: async () => null,
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
    eliminar: async () => ({ tipo: 'eliminado' }) as const,
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
    cambiarEstado: async (_id, estado, aprobacion) =>
      evaluacion({
        estado,
        ...(aprobacion ? { aprobadoPorId: aprobacion.actorId, aprobadoEn: aprobacion.fecha } : {}),
      }),
    eliminar: async () => ({ tipo: 'eliminado' }) as const,
    copiar: async (d) =>
      evaluacion({ planMedicionId: d.planMedicionId, codigo: d.codigo, version: d.version }),
    linajeDe: async () => [evaluacion()],
    ...sobre,
  };
}

/**
 * Doble de `RepositorioConfiguracionEvaluacionPort`: `transicionar` solo usa
 * `del`. El resto lanza si algo lo invoca por error, para que una prueba que
 * dependiera de un método de escritura no pasara en silencio con un `noop`.
 */
function repoConfiguraciones(
  sobre: Partial<RepositorioConfiguracionEvaluacionPort> = {},
): RepositorioConfiguracionEvaluacionPort {
  const noUsado = (metodo: string) => async () => {
    throw new Error(`${metodo} no se usa en este spec.`);
  };
  return {
    del: async () => ({ competencias: [], mediciones: [], indicaciones: [] }),
    guardarCompetencia: noUsado('guardarCompetencia'),
    reemplazarAsignaturas: noUsado('reemplazarAsignaturas'),
    guardarPorcentaje: noUsado('guardarPorcentaje'),
    reemplazarEvidencias: noUsado('reemplazarEvidencias'),
    planDeAsignaturaEvaluada: noUsado('planDeAsignaturaEvaluada'),
    reemplazarIndicaciones: noUsado('reemplazarIndicaciones'),
    guardarResultados: noUsado('guardarResultados'),
    planDeIndicacion: noUsado('planDeIndicacion'),
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
    configuraciones?: Partial<RepositorioConfiguracionEvaluacionPort>;
    autorizacion?: AuthorizationPort;
    alcance?: AlcanceDeLecturaPort;
    planes?: Partial<RepositorioPlanEvaluacionPort>;
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
  // `let` y no `const`: `transicionar` puede invocarse dos veces seguidas
  // sobre el mismo `caso` (p. ej. aprobar y luego marcar vigente), y la
  // segunda debe ver el estado que dejó la primera.
  let evaluacionActual = opciones.evaluacion ?? evaluacion();

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
    cambiarEstado: async (_id, estado, aprobacion) => {
      evaluacionActual = {
        ...evaluacionActual,
        estado,
        ...(aprobacion ? { aprobadoPorId: aprobacion.actorId, aprobadoEn: aprobacion.fecha } : {}),
      };
      return evaluacionActual;
    },
    ...opciones.planes,
  });

  const curricular = contenido({
    competenciasDelPlan: async () => opciones.competencias ?? [competencia()],
    ...opciones.contenido,
  });

  const configuraciones = repoConfiguraciones(opciones.configuraciones);

  const caso = new GestionarPlanesEvaluacion(
    evaluaciones,
    mediciones,
    curricular,
    configuraciones,
    opciones.autorizacion ?? permitirTodo(),
    publicador,
    opciones.alcance ?? sinRestriccion(),
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

  it('exige `evaluacion.leer` y luego `evaluacion.crear`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: autorizarEn('car-1', pedidos, ['evaluacion.crear']) });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer', 'evaluacion.crear']);
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
  it.each(['Borrador', 'En revisión'] as const)(
    'RF-CH-039: elimina un plan en %s y deja constancia después de borrar',
    async (estado) => {
      let eventosAlBorrar = -1;
      const montado = montar({
        evaluacion: evaluacion({ estado }),
        planes: {
          eliminar: async () => {
            eventosAlBorrar = montado.publicados.length;
            return { tipo: 'eliminado' };
          },
        },
      });

      await montado.caso.eliminar(ACTOR, 'ev-1');

      expect(eventosAlBorrar).toBe(0);
      expect(montado.publicados[0]?.nombre).toBe('evaluacion.eliminado');
      expect(montado.publicados[0]?.detalle).toBe(
        `Plan de evaluación EV-PE-ISI-2026-v2-D-v1 eliminado en ${estado}.`,
      );
    },
  );

  it.each(['Aprobado', 'Vigente', 'Histórico'] as const)(
    'un plan %s no se elimina: 409 que nombra su estado, sin llegar al repositorio ni publicar',
    async (estado) => {
      let borrados = 0;
      const { caso, publicados } = montar({
        evaluacion: evaluacion({ estado }),
        planes: {
          eliminar: async () => {
            borrados++;
            return { tipo: 'eliminado' };
          },
        },
      });

      await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(
        new ReglaDeNegocioViolada(
          `No se puede eliminar el plan de evaluación EV-PE-ISI-2026-v2-D-v1: está en ${estado}. Solo se eliminan planes en Borrador o En revisión.`,
        ),
      );
      expect(borrados).toBe(0);
      expect(publicados).toHaveLength(0);
    },
  );

  it.each([
    [1, '1 plan de mejora asociado'],
    [3, '3 planes de mejora asociados'],
  ] as const)(
    'con %i planes de mejora asociados: 409 con el motivo y sin evento',
    async (n, texto) => {
      const { caso, publicados } = montar({
        planes: { eliminar: async () => ({ tipo: 'en-uso', asociados: n }) },
      });

      await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(
        new ReglaDeNegocioViolada(
          `No se puede eliminar el plan de evaluación EV-PE-ISI-2026-v2-D-v1: tiene ${texto}.`,
        ),
      );
      expect(publicados).toHaveLength(0);
    },
  );

  it('si otro lo eliminó antes: NoEncontrado y sin evento', async () => {
    const { caso, publicados } = montar({
      planes: { eliminar: async () => ({ tipo: 'no-existe' }) },
    });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(publicados).toHaveLength(0);
  });

  it('exige `evaluacion.leer` y luego `evaluacion.eliminar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({
      autorizacion: autorizarEn('car-1', pedidos, ['evaluacion.eliminar']),
    });

    await expect(caso.eliminar(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer', 'evaluacion.eliminar']);
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
        rolesDe: async () => [],
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

describe('RF-PE-042 — quién aprobó y cuándo', () => {
  it('aprobar registra quién y cuándo', async () => {
    const antes = Date.now();
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'En revisión' }) });

    const plan = await caso.transicionar(ACTOR, 'ev-1', 'aprobar', {});

    expect(plan.aprobadoPorId).toBe(ACTOR.id);
    expect(plan.aprobadoEn!.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('las demás transiciones no tocan el responsable de aprobación', async () => {
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'En revisión' }) });

    await caso.transicionar(ACTOR, 'ev-1', 'aprobar', {});
    const vigente = await caso.transicionar(ACTOR, 'ev-1', 'marcar-vigente', {});

    expect(vigente.aprobadoPorId).toBe(ACTOR.id);
  });
});

describe('RF-PE-041 — la validación integral antes de transicionar', () => {
  it('enviar a revisión con una competencia configurada e incompleta se rechaza y la nombra', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'Borrador' }),
      configuraciones: {
        del: async () =>
          ({
            competencias: [
              {
                competenciaId: 'c-1',
                instrumento: null,
                frecuencia: 'Semestral',
                responsableId: null,
              },
            ],
            mediciones: [],
            indicaciones: [],
          }) satisfies ConfiguracionDelPlan,
      },
    });

    await expect(caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {})).rejects.toThrow(
      /instrumento/i,
    );
  });

  it('aprobar con una asignatura sin docente se rechaza', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'En revisión' }),
      configuraciones: {
        del: async () =>
          ({
            competencias: [],
            mediciones: [
              {
                competenciaId: 'c-1',
                periodoId: 'p-1',
                porcentajeAlcanzado: null,
                asignaturas: [
                  {
                    id: 'ae-1',
                    asignaturaId: 'a-1',
                    entregable: 'Informe',
                    docenteId: null,
                    evidencias: [],
                  },
                ],
              },
            ],
            indicaciones: [],
          }) satisfies ConfiguracionDelPlan,
      },
    });

    await expect(caso.transicionar(ACTOR, 'ev-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('el mensaje nombra el código de la competencia, no su UUID', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'Borrador' }),
      configuraciones: {
        del: async () =>
          ({
            competencias: [
              { competenciaId: 'c-1', instrumento: null, frecuencia: null, responsableId: null },
            ],
            mediciones: [],
            indicaciones: [],
          }) satisfies ConfiguracionDelPlan,
      },
    });

    await expect(caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {})).rejects.toThrow(
      /CPE-01/,
    );
  });

  it('sin nada configurado, la transición procede igual (RN2)', async () => {
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'Borrador' }) });
    // El doble por defecto de `configuraciones` ya devuelve las tres listas
    // vacías: RN2 dice que eso no es una inconsistencia.

    const resultado = await caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it('con todo completo, la transición procede', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'Borrador' }),
      configuraciones: {
        del: async () =>
          ({
            competencias: [
              {
                competenciaId: 'c-1',
                instrumento: 'Rúbrica',
                frecuencia: 'Semestral',
                responsableId: null,
              },
            ],
            mediciones: [],
            indicaciones: [],
          }) satisfies ConfiguracionDelPlan,
      },
    });

    const resultado = await caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it.each(['observar', 'marcar-vigente'] as const)(
    '%s no dispara el motor: la transición no exige estar sin bloqueos',
    async (accion) => {
      const del = vi.fn(async () => ({ competencias: [], mediciones: [], indicaciones: [] }));
      const estadoDesde = accion === 'observar' ? 'En revisión' : 'Aprobado';
      const { caso } = montar({
        evaluacion: evaluacion({ estado: estadoDesde }),
        configuraciones: { del },
      });

      await caso.transicionar(ACTOR, 'ev-1', accion, { comentario: 'motivo' });

      expect(del).not.toHaveBeenCalled();
    },
  );
});

describe('RF-PE-044 — el vigente', () => {
  it('devuelve null si no hay ninguno', async () => {
    const { caso } = montar({ vigente: null });

    expect(await caso.vigenteDe(ACTOR, 'pm-1')).toBeNull();
  });
});

describe('RF-CH-037 — el alta en la carrera de la sesión', () => {
  it('el plan se guarda con la carrera de la sesión, que el cliente no envía', async () => {
    let recibida = '';
    const { caso } = montar({
      autorizacion: autorizarEn('car-1'),
      planes: {
        crear: async (d) => {
          recibida = d.carreraId;
          return evaluacion({ carreraId: d.carreraId, codigo: d.codigo });
        },
      },
    });

    await caso.crear(ACTOR, 'pm-1');

    expect(recibida).toBe('car-1');
  });

  it('un plan de medición base de otra carrera es 409 y no se crea nada', async () => {
    let creados = 0;
    const { caso, publicados } = montar({
      autorizacion: autorizarEn('car-1'),
      base: planMedicion({ carreraId: 'car-2' }),
      planes: {
        crear: async (d) => {
          creados++;
          return evaluacion({ codigo: d.codigo });
        },
      },
    });

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'El plan de medición base no es de tu carrera: un plan de evaluación se construye sobre un plan de medición de la carrera con la que trabajas.',
      ),
    );
    expect(creados).toBe(0);
    expect(publicados).toHaveLength(0);
  });

  it('sin carrera asignada: AccesoDenegado con el motivo, antes de mirar la base', async () => {
    let consultada = false;
    const { caso } = montar({ autorizacion: autorizarEn(null) });
    const mediciones = caso['mediciones'];
    const porIdOriginal = mediciones.porId.bind(mediciones);
    mediciones.porId = async (id) => {
      consultada = true;
      return porIdOriginal(id);
    };

    await expect(caso.crear(ACTOR, 'pm-1')).rejects.toThrow('No tienes una carrera asignada');
    expect(consultada).toBe(false);
  });
});

describe('RF-CH-038 — listados según el alcance de lectura', () => {
  it('el listado de quien lee solo su carrera se acota a la suya aunque pida otra', async () => {
    const filtros: (FiltroPlanesEvaluacion | undefined)[] = [];
    const { caso } = montar({
      alcance: soloCarrera('car-1'),
      planes: {
        listar: async (f) => {
          filtros.push(f);
          return [];
        },
      },
    });

    await caso.listar(ACTOR, { carreraId: 'car-2', estado: 'Borrador' });

    expect(filtros).toEqual([{ carreraId: 'car-1', estado: 'Borrador' }]);
  });

  it('las bases elegibles también se acotan a su carrera', async () => {
    const { caso, pedidos } = montar({ alcance: soloCarrera('car-1') });

    await caso.basesElegibles(ACTOR);

    expect(pedidos.filtros).toEqual([
      { estado: 'Vigente', carreraId: 'car-1' },
      { estado: 'Aprobado', carreraId: 'car-1' },
    ]);
  });

  it('sin carrera legible: listado y bases vacíos, sin consultar', async () => {
    const { caso, pedidos } = montar({ alcance: soloCarrera(null) });

    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(await caso.basesElegibles(ACTOR)).toEqual([]);
    expect(pedidos.filtros).toEqual([]);
  });
});

type OperacionEv = (caso: GestionarPlanesEvaluacion) => Promise<unknown>;

const SOBRE_UNA_EVALUACION: readonly (readonly [string, OperacionEv])[] = [
  ['porId', (caso) => caso.porId(ACTOR, 'ev-1')],
  ['eliminar', (caso) => caso.eliminar(ACTOR, 'ev-1')],
  ['transicionar', (caso) => caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {})],
];

describe('Orden de comprobación sobre un plan existente (RF-CH-038)', () => {
  it('(1) sin evaluacion.leer: AccesoDenegado, aunque el plan sea de otra carrera', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({
      autorizacion: autorizarEn('car-1', pedidos, ['evaluacion.leer']),
      alcance: soloCarrera('car-2'),
    });

    await expect(caso.porId(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer']);
  });

  it.each(SOBRE_UNA_EVALUACION)(
    '(2) %s sobre un plan de otra carrera es NoEncontrado y no pide escritura',
    async (_nombre, ejecutar) => {
      const pedidos: string[] = [];
      const { caso, publicados } = montar({
        autorizacion: autorizarEn('car-2', pedidos),
        alcance: soloCarrera('car-2'),
      });

      await expect(ejecutar(caso)).rejects.toBeInstanceOf(NoEncontrado);
      expect(pedidos.every((p) => p === 'evaluacion.leer')).toBe(true);
      expect(publicados).toHaveLength(0);
    },
  );

  it('(2) la evaluación vigente de un plan de medición de otra carrera es NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-2') });

    await expect(caso.vigenteDe(ACTOR, 'pm-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('(3) el permiso de escritura se pide con la carrera del propio plan de evaluación', async () => {
    const carreras: (string | null)[] = [];
    const { caso } = montar({
      evaluacion: evaluacion({ carreraId: 'car-1' }),
      autorizacion: {
        puede: async (_id, permiso, carreraId) => {
          if (permiso === 'evaluacion.eliminar') carreras.push(carreraId ?? null);
          return { permitido: true };
        },
        permisosDe: async () => new Set(),
        carreraACargoDe: async () => 'car-1',
        rolesDe: async () => [],
      },
    });

    await caso.eliminar(ACTOR, 'ev-1');

    expect(carreras).toEqual(['car-1']);
  });
});
