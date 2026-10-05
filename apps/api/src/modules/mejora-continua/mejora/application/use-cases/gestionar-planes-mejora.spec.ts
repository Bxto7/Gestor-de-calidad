/**
 * Pruebas del alta, la definición, el borrado, las transiciones y el
 * seguimiento (implementación, evidencias, retroalimentación) del plan de
 * mejora, más los tres aspectos de 2c-J-B (RF-PJ-020 a RF-PJ-031).
 *
 * Sigue el patrón de `gestionar-planes-evaluacion.spec.ts`: dobles de los
 * puertos, `permitirTodo()` / `denegarRegistrando()` para la autorización, y
 * un `montar()` que arma el caso de uso con esos dobles. El núcleo de la
 * suite de 2c-J-A es la matriz de estados de §2b del diseño: los campos de
 * seguimiento se editan solo en Aprobado (RF-CH-044), y se bloquean en
 * Borrador y En revisión. El núcleo de 2c-J-B es la resolución real de
 * `carreraId` (ya no `null`, §2a del diseño) y la validación por aspecto.
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
  AcreditacionPort,
  DatosCriterioMejora,
} from '../../../../acreditacion/application/ports/acreditacion-cross-modulo.port.js';
import type {
  ContenidoCurricularPort,
  PlanBase,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosObjetivoMejora,
  ObjetivosCrossModuloPort,
} from '../../../../objetivos-educacionales/application/ports/objetivos-cross-modulo.port.js';
import type {
  ConfiguracionDelPlan,
  RepositorioConfiguracionEvaluacionPort,
} from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type {
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import type {
  DatosEvidencia,
  DatosParametroPlanMejora,
  DatosPlanMejora,
  RepositorioPlanMejoraPort,
} from '../ports/plan-mejora.port.js';
import { GestionarPlanesMejora } from './gestionar-planes-mejora.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const CARRERA = 'carrera-1';
const OTRA_CARRERA = 'carrera-2';

/** Lee solo `carreraId`; `null` es «lee solo su carrera y no tiene ninguna». */
function alcanceDeCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuario, carrera) => carreraId !== null && carrera === carreraId,
  };
}

const alcanceTotal: AlcanceDeLecturaPort = {
  alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
  puedeLeerCarrera: async () => true,
};

/** Concede solo estos permisos, y registra todo lo que se pide. */
function permitirSolo(permitidos: string[], pedidos: string[] = []): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return permitidos.includes(permiso)
        ? { permitido: true }
        : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}

function definicion() {
  return {
    nombre: 'Reforzar',
    causaRaiz: 'x',
    justificacion: 'x',
    input: null,
    plazo: new Date('2026-12-31'),
    recursos: 'x',
    metas: 'x',
    responsable: 'Coordinación',
  };
}

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}

function denegarRegistrando(pedidos: string[]): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}

function evidencia(sobre: Partial<DatosEvidencia> = {}): DatosEvidencia {
  return {
    id: 'evi-1',
    planMejoraId: 'pj-1',
    referencia: 'https://drive.example/informe.pdf',
    nombreArchivo: 'informe.pdf',
    subidoPor: 'u-1',
    subidoEn: new Date('2026-03-01'),
    ...sobre,
  };
}

function plan(sobre: Partial<DatosPlanMejora> = {}): DatosPlanMejora {
  return {
    id: 'pj-1',
    codigo: 'PJ-CRI-1',
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: CARRERA,
    criterioAcreditacionId: 'cri-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: null,
    estado: 'Borrador',
    estadoImplementacion: 'Pendiente',
    // RF-PJ-042: completo por defecto —nombre, causaRaiz, justificacion,
    // input, recursos, metas y responsable ya no nacen vacíos aquí— para que
    // los specs de `transicionar` que no son sobre completitud (permisos,
    // eventos, la máquina de estados en sí) no choquen con la validación
    // integral. Los que sí prueban la validación pasan sus propios campos
    // vacíos explícitamente.
    nombre: 'Reforzar la línea base',
    causaRaiz: 'Falta de seguimiento sistemático',
    justificacion: 'El criterio viene bajando dos periodos seguidos',
    input: 'Resultado del último ciclo de evaluación',
    plazo: new Date('2026-12-31'),
    recursos: 'Presupuesto asignado por la facultad',
    metas: 'Subir 10 puntos porcentuales',
    responsable: 'Coordinador académico',
    logroMeta: null,
    impacto: null,
    creadoEn: new Date('2026-03-01'),
    evidencias: [],
    version: 1,
    derivadoDeId: null,
    ...sobre,
  };
}

function parametros(sobre: Partial<DatosParametroPlanMejora> = {}): DatosParametroPlanMejora {
  return { minimoAccionesCriterio: 1, minimoAccionesObjetivo: 1, ...sobre };
}

function repoMejora(sobre: Partial<RepositorioPlanMejoraPort> = {}): RepositorioPlanMejoraPort {
  const noUsado = (metodo: string) => async () => {
    throw new Error(`${metodo} no se usa en este spec.`);
  };
  return {
    crear: async (d) =>
      plan({
        codigo: d.codigo,
        aspecto: d.aspecto,
        carreraId: d.carreraId,
        criterioAcreditacionId: d.criterioAcreditacionId,
        objetivoEducacionalId: d.objetivoEducacionalId,
        competenciaId: d.competenciaId,
        periodoId: d.periodoId,
        planEvaluacionId: d.planEvaluacionId,
      }),
    porId: async () => plan(),
    editarDefinicion: async (_id, datos) => plan({ ...datos }),
    eliminar: async () => ({ tipo: 'eliminado' }),
    cambiarEstado: async (_id, estado) => plan({ estado }),
    actualizarImplementacion: async (_id, estado) => plan({ estadoImplementacion: estado }),
    actualizarRetroalimentacion: async (_id, logroMeta, impacto) => plan({ logroMeta, impacto }),
    agregarEvidencia: noUsado('agregarEvidencia'),
    planDeEvidencia: async () => 'pj-1',
    eliminarEvidencia: async () => undefined,
    codigosDe: async () => [],
    parametros: async () => parametros(),
    registrarImpactoEnMedicion: async (_id, planMedicionAfectadoId) =>
      plan({ planMedicionAfectadoId }),
    listar: async () => [],
    listarDeCarrera: async () => [],
    planesPorIds: async () => [],
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    ...sobre,
  };
}

function criterioMejora(sobre: Partial<DatosCriterioMejora> = {}): DatosCriterioMejora {
  return { id: 'cri-1', carreraId: CARRERA, codigo: 'C-01', nombre: 'Estudiantes', ...sobre };
}

function objetivoMejora(sobre: Partial<DatosObjetivoMejora> = {}): DatosObjetivoMejora {
  return { id: 'obj-1', codigo: 'OE-01', nombre: 'Formar profesionales íntegros', ...sobre };
}

function acreditacionDouble(sobre: Partial<AcreditacionPort> = {}): AcreditacionPort {
  return {
    criteriosActivosDe: async () => [criterioMejora()],
    criterioPorId: async () => criterioMejora(),
    ...sobre,
  };
}

function objetivosDouble(sobre: Partial<ObjetivosCrossModuloPort> = {}): ObjetivosCrossModuloPort {
  return {
    objetivosEducacionales: async () => [objetivoMejora()],
    objetivoPorId: async () => objetivoMejora(),
    ...sobre,
  };
}

function planEvaluacion(sobre: Partial<DatosPlanEvaluacion> = {}): DatosPlanEvaluacion {
  return {
    id: 'pe-1',
    planMedicionId: 'pm-1',
    carreraId: CARRERA,
    codigo: 'EVD-1',
    version: 1,
    estado: 'Vigente',
    creadoEn: new Date('2026-01-01'),
    actualizadoEn: new Date('2026-01-01'),
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function planMedicion(sobre: Partial<DatosPlanMedicion> = {}): DatosPlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'plan-1',
    carreraId: CARRERA,
    tipo: 'DIRECTA',
    codigo: 'PMD-1',
    version: 1,
    meta: 0.7,
    estado: 'Vigente',
    periodoInicio: { anio: 2026, mitad: 1 },
    competenciaIds: ['comp-1'],
    periodos: [
      { id: 'per-1', etiqueta: '2026-I', orden: 1, fechaCierre: null },
      { id: 'per-2', etiqueta: '2026-II', orden: 2, fechaCierre: null },
    ],
    creadoEn: new Date('2026-01-01'),
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

function planBase(sobre: Partial<PlanBase> = {}): PlanBase {
  return {
    id: 'plan-1',
    codigo: 'PE-SIS',
    carreraId: CARRERA,
    carreraNombre: 'Ingeniería de Sistemas',
    version: 1,
    elegible: true,
    duracionAnios: 5,
    ...sobre,
  };
}

function configuracionDelPlan(sobre: Partial<ConfiguracionDelPlan> = {}): ConfiguracionDelPlan {
  return { competencias: [], mediciones: [], indicaciones: [], ...sobre };
}

function evaluacionesDouble(
  sobre: Partial<RepositorioPlanEvaluacionPort> = {},
): RepositorioPlanEvaluacionPort {
  return {
    listar: async () => [],
    porId: async () => planEvaluacion(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: async () => planEvaluacion(),
    cambiarEstado: async () => planEvaluacion(),
    eliminar: async () => ({ tipo: 'eliminado' }) as const,
    copiar: async () => planEvaluacion(),
    linajeDe: async () => [planEvaluacion()],
    ...sobre,
  };
}

function medicionesDouble(
  sobre: Partial<RepositorioPlanMedicionPort> = {},
): RepositorioPlanMedicionPort {
  const noUsado = (metodo: string) => async () => {
    throw new Error(`${metodo} no se usa en este spec.`);
  };
  return {
    listar: async () => [],
    porId: async () => planMedicion(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: noUsado('crear'),
    actualizar: noUsado('actualizar'),
    cambiarEstado: noUsado('cambiarEstado'),
    contenidoDe: async () => null,
    copiar: noUsado('copiar'),
    linajeDe: async () => [],
    marcarVigenteRelevando: noUsado('marcarVigenteRelevando'),
    eliminar: async () => ({ tipo: 'eliminado' }) as const,
    declararCompetencias: noUsado('declararCompetencias'),
    declararPeriodos: noUsado('declararPeriodos'),
    matriz: async () => [],
    programar: noUsado('programar'),
    marcarRealizada: noUsado('marcarRealizada'),
    ...sobre,
  };
}

function configuracionesDouble(
  sobre: Partial<RepositorioConfiguracionEvaluacionPort> = {},
): RepositorioConfiguracionEvaluacionPort {
  const noUsado = (metodo: string) => async () => {
    throw new Error(`${metodo} no se usa en este spec.`);
  };
  return {
    del: async () => configuracionDelPlan(),
    guardarCompetencia: noUsado('guardarCompetencia'),
    reemplazarAsignaturas: noUsado('reemplazarAsignaturas'),
    guardarPorcentaje: noUsado('guardarPorcentaje'),
    reemplazarEvidencias: noUsado('reemplazarEvidencias'),
    planDeAsignaturaEvaluada: async () => null,
    reemplazarIndicaciones: noUsado('reemplazarIndicaciones'),
    guardarResultados: noUsado('guardarResultados'),
    planDeIndicacion: async () => null,
    ...sobre,
  };
}

function curricularDouble(sobre: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [],
    planPorId: async () => planBase(),
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async () => null,
    ...sobre,
  };
}

function montar(
  opciones: {
    plan?: DatosPlanMejora;
    autorizacion?: AuthorizationPort;
    planes?: Partial<RepositorioPlanMejoraPort>;
    acreditacion?: Partial<AcreditacionPort>;
    objetivos?: Partial<ObjetivosCrossModuloPort>;
    evaluaciones?: Partial<RepositorioPlanEvaluacionPort>;
    mediciones?: Partial<RepositorioPlanMedicionPort>;
    configuraciones?: Partial<RepositorioConfiguracionEvaluacionPort>;
    curricular?: Partial<ContenidoCurricularPort>;
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const publicador: PublicadorDeEventos = {
    publicar: async (e) => {
      publicados.push(...e);
    },
  };

  const planActual = opciones.plan ?? plan();
  const planes = repoMejora({
    porId: async () => planActual,
    cambiarEstado: async (_id, estado) => ({ ...planActual, estado }),
    actualizarImplementacion: async (_id, estado) => ({
      ...planActual,
      estadoImplementacion: estado,
    }),
    ...opciones.planes,
  });

  const caso = new GestionarPlanesMejora(
    planes,
    acreditacionDouble(opciones.acreditacion),
    objetivosDouble(opciones.objetivos),
    evaluacionesDouble(opciones.evaluaciones),
    medicionesDouble(opciones.mediciones),
    configuracionesDouble(opciones.configuraciones),
    curricularDouble(opciones.curricular),
    opciones.autorizacion ?? permitirTodo(),
    publicador,
    opciones.alcance ?? alcanceDeCarrera(CARRERA),
  );

  return { caso, publicados, planes };
}

describe('la lectura', () => {
  it('devuelve el plan', async () => {
    const { caso } = montar();

    const encontrado = await caso.porId(ACTOR, 'pj-1');

    expect(encontrado.id).toBe('pj-1');
  });

  it('exige `mejora.leer`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.porId(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer']);
  });

  it('un plan inexistente es 404', async () => {
    const { caso } = montar({ planes: { porId: async () => null } });

    await expect(caso.porId(ACTOR, 'pj-inexistente')).rejects.toThrow(NoEncontrado);
  });
});

describe('el listado', () => {
  it('devuelve lo que el repositorio lista para esa carrera', async () => {
    const unPlan = plan({ id: 'pj-listado' });
    const { caso } = montar({ planes: { listar: async () => [unPlan] } });

    const listado = await caso.listar(ACTOR);

    expect(listado).toEqual([unPlan]);
  });

  it('exige `mejora.leer`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.listar(ACTOR)).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer']);
  });
});

describe('RF-PJ-001 a RF-PJ-003 y §2a del diseño de 2c-J-B — el alta', () => {
  it('nace en Borrador con estado de implementación Pendiente, y con la carrera real del actor', async () => {
    const { caso } = montar();

    const creado = await caso.crear(ACTOR, {
      aspecto: 'CRITERIO_ACREDITACION',
      elementoId: 'cri-1',
    });

    expect(creado.estado).toBe('Borrador');
    expect(creado.estadoImplementacion).toBe('Pendiente');
    expect(creado.carreraId).toBe(CARRERA);
  });

  it('sin carrera a cargo, se deniega antes de tocar cualquier otra cosa (fail-closed)', async () => {
    const { caso } = montar({
      autorizacion: {
        puede: async () => ({ permitido: true }),
        permisosDe: async () => new Set(),
        carreraACargoDe: async () => null,
        rolesDe: async () => [],
      },
    });

    await expect(
      caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-1' }),
    ).rejects.toThrow(AccesoDenegado);
  });

  it('RN1: guarda la tripleta consistente con el aspecto — solo un campo lleno', async () => {
    const { caso, planes } = montar();
    const crear = vi.spyOn(planes, 'crear');

    await caso.crear(ACTOR, { aspecto: 'OBJETIVO_EDUCACIONAL', elementoId: 'obj-1' });

    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        aspecto: 'OBJETIVO_EDUCACIONAL',
        carreraId: CARRERA,
        objetivoEducacionalId: 'obj-1',
        criterioAcreditacionId: null,
        competenciaId: null,
      }),
    );
  });

  it('exige `mejora.crear`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(
      caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-1' }),
    ).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.crear']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar();

    await caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-1' });

    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.nombre).toBe('mejora.creado');
  });
});

describe('RF-PJ-020 a RF-PJ-022 — el aspecto Criterio de acreditación', () => {
  it('rechaza un criterio que no existe', async () => {
    const { caso } = montar({ acreditacion: { criterioPorId: async () => null } });

    await expect(
      caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'inexistente' }),
    ).rejects.toThrow(NoEncontrado);
  });

  it('rechaza un criterio de otra carrera — no es RBAC, es consistencia de negocio (§2a/§2b del diseño)', async () => {
    const { caso } = montar({
      acreditacion: { criterioPorId: async () => criterioMejora({ carreraId: 'otra-carrera' }) },
    });

    await expect(
      caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-ajeno' }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RF-PJ-022: alerta cuando el criterio no alcanza el mínimo de acciones', async () => {
    const { caso } = montar({
      acreditacion: {
        criteriosActivosDe: async () => [criterioMejora({ id: 'cri-1', codigo: 'C-01' })],
      },
      planes: {
        codigosDe: async () => [],
        parametros: async () => parametros({ minimoAccionesCriterio: 2 }),
      },
    });

    const alertas = await caso.alertasMinimoCriterio(ACTOR, CARRERA);

    expect(alertas).toEqual([
      {
        elementoId: 'cri-1',
        codigo: 'C-01',
        nombre: 'Estudiantes',
        cantidadActual: 0,
        minimoRequerido: 2,
        faltante: 2,
      },
    ]);
  });

  it('RF-PJ-022 RN1: sin alerta cuando el mínimo ya se cumple', async () => {
    const { caso } = montar({
      acreditacion: { criteriosActivosDe: async () => [criterioMejora()] },
      planes: {
        codigosDe: async () => ['PJ-CRI-1'],
        parametros: async () => parametros({ minimoAccionesCriterio: 1 }),
      },
    });

    expect(await caso.alertasMinimoCriterio(ACTOR, CARRERA)).toEqual([]);
  });
});

describe('RF-PJ-023 a RF-PJ-025 — el aspecto Objetivo educacional', () => {
  it('rechaza un objetivo que no existe', async () => {
    const { caso } = montar({ objetivos: { objetivoPorId: async () => null } });

    await expect(
      caso.crear(ACTOR, { aspecto: 'OBJETIVO_EDUCACIONAL', elementoId: 'inexistente' }),
    ).rejects.toThrow(NoEncontrado);
  });

  it('RF-PJ-023 RN1: sin chequeo de carrera — es catálogo institucional', async () => {
    // Ninguna carrera se consulta para este aspecto: si el doble no expone
    // ninguna noción de carrera y aun así el alta funciona, la ausencia del
    // chequeo queda demostrada por construcción.
    const { caso } = montar();

    await expect(
      caso.crear(ACTOR, { aspecto: 'OBJETIVO_EDUCACIONAL', elementoId: 'obj-1' }),
    ).resolves.toBeDefined();
  });

  it('RF-PJ-025: alerta cuando el objetivo no alcanza el mínimo de acciones', async () => {
    const { caso } = montar({
      objetivos: {
        objetivosEducacionales: async () => [objetivoMejora({ id: 'obj-1', codigo: 'OE-01' })],
      },
      planes: {
        codigosDe: async () => [],
        parametros: async () => parametros({ minimoAccionesObjetivo: 3 }),
      },
    });

    const alertas = await caso.alertasMinimoObjetivo(ACTOR);

    expect(alertas).toEqual([
      {
        elementoId: 'obj-1',
        codigo: 'OE-01',
        nombre: 'Formar profesionales íntegros',
        cantidadActual: 0,
        minimoRequerido: 3,
        faltante: 3,
      },
    ]);
  });
});

describe('RF-PJ-026 a RF-PJ-031 — el aspecto Competencia', () => {
  it('RF-PJ-026: exige el plan de evaluación base', async () => {
    const { caso } = montar();

    await expect(
      caso.crear(ACTOR, { aspecto: 'COMPETENCIA', elementoId: 'comp-1', periodoId: 'per-1' }),
    ).rejects.toThrow(/plan de evaluación base/);
  });

  it('RF-PJ-003 RN2: una competencia sin periodo se rechaza — no hay ámbito para el código', async () => {
    const { caso } = montar();

    await expect(
      caso.crear(ACTOR, {
        aspecto: 'COMPETENCIA',
        elementoId: 'comp-1',
        planEvaluacionId: 'pe-1',
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('RF-PJ-026 RN1: rechaza un plan de evaluación de tipo Indirecta', async () => {
    const { caso } = montar({
      mediciones: { porId: async () => planMedicion({ tipo: 'INDIRECTA' }) },
    });

    await expect(
      caso.crear(ACTOR, {
        aspecto: 'COMPETENCIA',
        elementoId: 'comp-1',
        periodoId: 'per-1',
        planEvaluacionId: 'pe-1',
      }),
    ).rejects.toThrow(/Directa/);
  });

  it('rechaza un plan de evaluación que no está Aprobado ni Vigente', async () => {
    const { caso } = montar({
      evaluaciones: { porId: async () => planEvaluacion({ estado: 'Borrador' }) },
    });

    await expect(
      caso.crear(ACTOR, {
        aspecto: 'COMPETENCIA',
        elementoId: 'comp-1',
        periodoId: 'per-1',
        planEvaluacionId: 'pe-1',
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza un plan de evaluación de otra carrera', async () => {
    const { caso } = montar({
      curricular: { planPorId: async () => planBase({ carreraId: 'otra-carrera' }) },
    });

    await expect(
      caso.crear(ACTOR, {
        aspecto: 'COMPETENCIA',
        elementoId: 'comp-1',
        periodoId: 'per-1',
        planEvaluacionId: 'pe-1',
      }),
    ).rejects.toThrow(/no pertenece a la carrera/);
  });

  it('RF-PJ-029: rechaza una competencia que no fue evaluada en la base', async () => {
    const { caso } = montar({
      mediciones: { porId: async () => planMedicion({ competenciaIds: ['otra-competencia'] }) },
    });

    await expect(
      caso.crear(ACTOR, {
        aspecto: 'COMPETENCIA',
        elementoId: 'comp-1',
        periodoId: 'per-1',
        planEvaluacionId: 'pe-1',
      }),
    ).rejects.toThrow(/no fue evaluada/);
  });

  it('RF-PJ-027: rechaza un periodo que no pertenece a la base', async () => {
    const { caso } = montar();

    await expect(
      caso.crear(ACTOR, {
        aspecto: 'COMPETENCIA',
        elementoId: 'comp-1',
        periodoId: 'periodo-ajeno',
        planEvaluacionId: 'pe-1',
      }),
    ).rejects.toThrow(/no pertenece al plan de evaluación/);
  });

  it('crea guardando `planEvaluacionId` junto con `competenciaId` y `periodoId` (§2g del diseño)', async () => {
    const { caso, planes } = montar();
    const crear = vi.spyOn(planes, 'crear');

    await caso.crear(ACTOR, {
      aspecto: 'COMPETENCIA',
      elementoId: 'comp-1',
      periodoId: 'per-1',
      planEvaluacionId: 'pe-1',
    });

    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        aspecto: 'COMPETENCIA',
        competenciaId: 'comp-1',
        periodoId: 'per-1',
        planEvaluacionId: 'pe-1',
        criterioAcreditacionId: null,
        objetivoEducacionalId: null,
      }),
    );
  });

  describe('RF-PJ-027/028 — porcentajeAnteriorDeCompetencia', () => {
    it('null en el primer periodo (RN3)', async () => {
      const { caso } = montar();

      const resultado = await caso.porcentajeAnteriorDeCompetencia(
        ACTOR,
        'pe-1',
        'comp-1',
        'per-1',
      );

      expect(resultado).toBeNull();
    });

    it('null si el periodo anterior no tiene medición registrada', async () => {
      const { caso } = montar({
        configuraciones: { del: async () => configuracionDelPlan({ mediciones: [] }) },
      });

      const resultado = await caso.porcentajeAnteriorDeCompetencia(
        ACTOR,
        'pe-1',
        'comp-1',
        'per-2',
      );

      expect(resultado).toBeNull();
    });

    it('devuelve el porcentaje del periodo inmediatamente anterior', async () => {
      const { caso } = montar({
        configuraciones: {
          del: async () =>
            configuracionDelPlan({
              mediciones: [
                {
                  competenciaId: 'comp-1',
                  periodoId: 'per-1',
                  porcentajeAlcanzado: 0.65,
                  asignaturas: [],
                },
              ],
            }),
        },
      });

      const resultado = await caso.porcentajeAnteriorDeCompetencia(
        ACTOR,
        'pe-1',
        'comp-1',
        'per-2',
      );

      expect(resultado).toBe(0.65);
    });

    it('exige `mejora.leer`', async () => {
      const pedidos: string[] = [];
      const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

      await expect(
        caso.porcentajeAnteriorDeCompetencia(ACTOR, 'pe-1', 'comp-1', 'per-2'),
      ).rejects.toThrow(AccesoDenegado);
      expect(pedidos).toEqual(['mejora.leer']);
    });
  });

  describe('RF-PJ-031 — la trazabilidad hacia el plan de medición afectado', () => {
    it('registra la referencia', async () => {
      const { caso } = montar({ plan: plan({ aspecto: 'COMPETENCIA' }) });

      const actualizado = await caso.registrarImpactoEnMedicion(ACTOR, 'pj-1', 'pm-afectado');

      expect(actualizado.planMedicionAfectadoId).toBe('pm-afectado');
    });

    it('RN1: rechaza aplicarlo a un plan que no es de Competencia', async () => {
      const { caso } = montar({ plan: plan({ aspecto: 'CRITERIO_ACREDITACION' }) });

      await expect(caso.registrarImpactoEnMedicion(ACTOR, 'pj-1', 'pm-afectado')).rejects.toThrow(
        ReglaDeNegocioViolada,
      );
    });

    it('deja constancia en la bitácora', async () => {
      const { caso, publicados } = montar({ plan: plan({ aspecto: 'COMPETENCIA' }) });

      await caso.registrarImpactoEnMedicion(ACTOR, 'pj-1', 'pm-afectado');

      expect(publicados[0]?.nombre).toBe('mejora.impacto_en_medicion_registrado');
    });
  });
});

describe('RF-PJ-006 y RF-PJ-007 — la definición', () => {
  const DATOS = {
    nombre: 'Reforzar tutoría',
    causaRaiz: 'Baja tasa de aprobación',
    justificacion: 'Mejora sostenida en dos periodos previos',
    input: 'Resultados de la reunión con constituyentes',
    plazo: new Date('2026-12-31'),
    recursos: 'Dos tutores adicionales',
    metas: 'Elevar la tasa 10 puntos',
    responsable: 'Coordinación académica',
  };

  it('se edita en Borrador', async () => {
    const { caso } = montar();

    const actualizado = await caso.editarDefinicion(ACTOR, 'pj-1', DATOS);

    expect(actualizado.nombre).toBe('Reforzar tutoría');
  });

  it.each(['En revisión', 'Aprobado'] as const)('se bloquea en %s', async (estado) => {
    const { caso } = montar({ plan: plan({ estado }) });

    await expect(caso.editarDefinicion(ACTOR, 'pj-1', DATOS)).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('exige `mejora.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: permitirSolo(['mejora.leer'], pedidos) });

    await expect(caso.editarDefinicion(ACTOR, 'pj-1', DATOS)).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer', 'mejora.editar']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar();

    await caso.editarDefinicion(ACTOR, 'pj-1', DATOS);

    expect(publicados[0]?.nombre).toBe('mejora.definicion_editada');
  });
});

describe('RF-CH-042 — el borrado', () => {
  it.each([['Borrador'], ['En revisión']] as const)('se elimina en %s', async (estado) => {
    const { caso, publicados } = montar({ plan: plan({ estado }) });

    await caso.eliminar(ACTOR, 'pj-1');

    expect(publicados[0]?.detalle).toBe(`Plan de mejora PJ-CRI-1 eliminado en ${estado}.`);
  });

  it('Aprobado: 409 con el texto completo y no llega al repositorio', async () => {
    let llamadas = 0;
    const { caso, publicados } = montar({
      plan: plan({ estado: 'Aprobado' }),
      planes: { eliminar: async () => (llamadas++, { tipo: 'eliminado' }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de mejora PJ-CRI-1: está en Aprobado. Solo se eliminan planes en Borrador o En revisión.',
      ),
    );
    expect(llamadas).toBe(0);
    expect(publicados).toEqual([]);
  });

  it('el estado cambió entre la lectura y el bloqueo de la fila: 409 con el estado real y sin evento', async () => {
    const { caso, publicados } = montar({
      plan: plan({ estado: 'En revisión' }),
      planes: { eliminar: async () => ({ tipo: 'estado-no-permite', estado: 'Aprobado' }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(/está en Aprobado/);
    expect(publicados).toEqual([]);
  });

  it.each([
    [1, 'está incluido en 1 acta'],
    [2, 'está incluido en 2 actas'],
  ] as const)('en %i acta(s): 409 con el motivo y sin evento', async (cantidad, texto) => {
    const { caso, publicados } = montar({
      planes: { eliminar: async () => ({ tipo: 'en-uso', motivo: 'acta', cantidad }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(`No se puede eliminar el plan de mejora PJ-CRI-1: ${texto}.`),
    );
    expect(publicados).toEqual([]);
  });

  it.each([
    [1, 'tiene 1 versión derivada'],
    [3, 'tiene 3 versiones derivadas'],
  ] as const)('con %i versión(es) derivada(s): 409 con el motivo', async (cantidad, texto) => {
    const { caso } = montar({
      planes: { eliminar: async () => ({ tipo: 'en-uso', motivo: 'versiones', cantidad }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(
      new ReglaDeNegocioViolada(`No se puede eliminar el plan de mejora PJ-CRI-1: ${texto}.`),
    );
  });

  it('el plan ya no existe cuando se bloquea la fila: 404 y sin evento (la bitácora no registra un borrado que no ocurrió)', async () => {
    const { caso, publicados } = montar({
      planes: { eliminar: async () => ({ tipo: 'no-existe' }) },
    });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(NoEncontrado);
    expect(publicados).toEqual([]);
  });

  it('el evento se publica DESPUÉS de borrar', async () => {
    const orden: string[] = [];
    const { caso } = montar({
      planes: { eliminar: async () => (orden.push('borrado'), { tipo: 'eliminado' }) },
    });
    // `publicados` no ordena contra el repositorio: se envuelve el publicador.
    const eventos = (caso as unknown as { eventos: PublicadorDeEventos }).eventos;
    const original = eventos.publicar.bind(eventos);
    eventos.publicar = async (e) => (orden.push('evento'), original(e));

    await caso.eliminar(ACTOR, 'pj-1');

    expect(orden).toEqual(['borrado', 'evento']);
  });

  it('exige `mejora.eliminar` sobre la carrera del plan', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: permitirSolo(['mejora.leer'], pedidos) });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer', 'mejora.eliminar']);
  });
});

describe('RF-PJ-004 y RF-PJ-005 — las transiciones', () => {
  it('usa la máquina propia de Mejora: Borrador → En revisión', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Borrador' }) });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it('observar devuelve a Borrador y pide comentario', async () => {
    const { caso } = montar({ plan: plan({ estado: 'En revisión' }) });

    await expect(caso.transicionar(ACTOR, 'pj-1', 'observar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'observar', {
      comentario: 'Falta justificar',
    });
    expect(resultado.estado).toBe('Borrador');
  });

  it('aprobar es el final: un plan Aprobado no tiene más transiciones', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Aprobado' }) });

    for (const accion of ['enviar-a-revision', 'aprobar', 'observar'] as const) {
      await expect(caso.transicionar(ACTOR, 'pj-1', accion, { comentario: 'x' })).rejects.toThrow(
        ReglaDeNegocioViolada,
      );
    }
  });

  it('una transición imposible se rechaza', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Borrador' }) });

    await expect(caso.transicionar(ACTOR, 'pj-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('aprobar exige `mejora.aprobar`, enviar a revisión exige `mejora.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({
      plan: plan({ estado: 'En revisión' }),
      autorizacion: {
        puede: async (_id, permiso) => {
          pedidos.push(permiso);
          return { permitido: true };
        },
        permisosDe: async () => new Set(),
        carreraACargoDe: async () => CARRERA,
        rolesDe: async () => [],
      },
    });

    await caso.transicionar(ACTOR, 'pj-1', 'aprobar', {});

    expect(pedidos).toEqual(['mejora.leer', 'mejora.aprobar']);
  });

  it('deja constancia del antes y el después', async () => {
    const { caso, publicados } = montar({ plan: plan({ estado: 'Borrador' }) });

    await caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {});

    expect(publicados[0]?.nombre).toBe('mejora.transicionado');
    expect(publicados[0]?.detalle).toContain('Borrador → En revisión');
  });
});

describe('RF-PJ-042 — la validación integral antes de enviar a revisión o aprobar', () => {
  it('enviar a revisión se bloquea si el plan está incompleto, con el reporte consolidado en el mensaje', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Borrador', nombre: '' }) });

    await expect(caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {})).rejects.toThrow(
      /definición del plan de mejora está incompleta/,
    );
  });

  it('aprobar se bloquea si el plan está incompleto', async () => {
    const { caso } = montar({ plan: plan({ estado: 'En revisión', responsable: '' }) });

    await expect(caso.transicionar(ACTOR, 'pj-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('enviar a revisión se permite si el plan está completo', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Borrador' }) });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it('aprobar se permite si el plan está completo', async () => {
    const { caso } = montar({ plan: plan({ estado: 'En revisión' }) });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'aprobar', {});

    expect(resultado.estado).toBe('Aprobado');
  });

  it('observar (rechazar) nunca se bloquea por esta validación, sin importar qué tan incompleto esté el plan', async () => {
    // `observar` tiene `exigeSinBloqueos: false` en estado-plan-mejora.ts: devolver
    // un plan con problemas es justamente lo que se hace cuando los tiene —
    // exigirle estar limpio para eso sería contradictorio.
    const { caso } = montar({
      plan: plan({ estado: 'En revisión', nombre: '', causaRaiz: '', responsable: '' }),
    });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'observar', {
      comentario: 'Falta completar la definición.',
    });

    expect(resultado.estado).toBe('Borrador');
  });

  it('RF-PJ-028: un plan de Competencia sin input SÍ puede enviarse a revisión — ese campo no le aplica', async () => {
    const { caso } = montar({
      plan: plan({ estado: 'Borrador', aspecto: 'COMPETENCIA', input: null }),
    });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it('un plan con estadoImplementacion distinto de Completado se puede aprobar aunque no tenga retroalimentación', async () => {
    const { caso } = montar({
      plan: plan({
        estado: 'En revisión',
        estadoImplementacion: 'En proceso',
        logroMeta: null,
        impacto: null,
      }),
    });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'aprobar', {});

    expect(resultado.estado).toBe('Aprobado');
  });
});

/**
 * §2b del diseño de 2c-J-A: la matriz de estados del seguimiento. Se recorre
 * una sola vez con `it.each` y se reutiliza para las cuatro operaciones de
 * seguimiento, porque la propiedad que se comprueba es la misma en las
 * cuatro: el guardián `permiteSeguimientoMejora`.
 */
const MATRIZ_SEGUIMIENTO = [
  ['Borrador', false],
  ['En revisión', false],
  ['Aprobado', true],
] as const;

describe('RF-PJ-014 — el estado de implementación', () => {
  it.each(MATRIZ_SEGUIMIENTO)('en %s, permitido = %s', async (estado, permitido) => {
    const { caso } = montar({ plan: plan({ estado }) });
    const ejecutar = caso.actualizarImplementacion(ACTOR, 'pj-1', 'En proceso');

    if (permitido) {
      await expect(ejecutar).resolves.toBeDefined();
    } else {
      await expect(ejecutar).rejects.toThrow(ReglaDeNegocioViolada);
    }
  });

  it('exige `mejora.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: permitirSolo(['mejora.leer'], pedidos) });

    await expect(caso.actualizarImplementacion(ACTOR, 'pj-1', 'En proceso')).rejects.toThrow(
      AccesoDenegado,
    );
    expect(pedidos).toEqual(['mejora.leer', 'mejora.editar']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar({ plan: plan({ estado: 'Aprobado' }) });

    await caso.actualizarImplementacion(ACTOR, 'pj-1', 'En proceso');

    expect(publicados[0]?.nombre).toBe('mejora.implementacion_actualizada');
  });
});

describe('RF-PJ-016 y RF-PJ-017 — evidencias', () => {
  it.each(MATRIZ_SEGUIMIENTO)('cargar en %s, permitido = %s', async (estado, permitido) => {
    const { caso } = montar({
      plan: plan({ estado }),
      planes: { agregarEvidencia: async (id, e) => evidencia({ planMejoraId: id, ...e }) },
    });
    const ejecutar = caso.cargarEvidencia(ACTOR, 'pj-1', {
      referencia: 'https://drive.example/x.pdf',
      nombreArchivo: 'x.pdf',
      subidoPor: ACTOR.id,
    });

    if (permitido) {
      await expect(ejecutar).resolves.toBeDefined();
    } else {
      await expect(ejecutar).rejects.toThrow(ReglaDeNegocioViolada);
    }
  });

  it.each(MATRIZ_SEGUIMIENTO)('eliminar en %s, permitido = %s', async (estado, permitido) => {
    const { caso } = montar({ plan: plan({ estado }) });
    const ejecutar = caso.eliminarEvidencia(ACTOR, 'evi-1');

    if (permitido) {
      await expect(ejecutar).resolves.toBeUndefined();
    } else {
      await expect(ejecutar).rejects.toThrow(ReglaDeNegocioViolada);
    }
  });

  it('una evidencia sin plan es 404', async () => {
    const { caso } = montar({ planes: { planDeEvidencia: async () => null } });

    await expect(caso.eliminarEvidencia(ACTOR, 'evi-inexistente')).rejects.toThrow(NoEncontrado);
  });

  it('cargar exige `mejora.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: permitirSolo(['mejora.leer'], pedidos) });

    await expect(
      caso.cargarEvidencia(ACTOR, 'pj-1', {
        referencia: 'https://drive.example/x.pdf',
        nombreArchivo: null,
        subidoPor: ACTOR.id,
      }),
    ).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer', 'mejora.editar']);
  });

  it('cargar deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar({
      plan: plan({ estado: 'Aprobado' }),
      planes: { agregarEvidencia: async (id, e) => evidencia({ planMejoraId: id, ...e }) },
    });

    await caso.cargarEvidencia(ACTOR, 'pj-1', {
      referencia: 'https://drive.example/x.pdf',
      nombreArchivo: null,
      subidoPor: ACTOR.id,
    });

    expect(publicados[0]?.nombre).toBe('mejora.evidencia_cargada');
  });

  it('eliminar deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar({ plan: plan({ estado: 'Aprobado' }) });

    await caso.eliminarEvidencia(ACTOR, 'evi-1');

    expect(publicados[0]?.nombre).toBe('mejora.evidencia_eliminada');
  });
});

describe('RF-PJ-018 — la retroalimentación', () => {
  it.each(MATRIZ_SEGUIMIENTO)('en %s, permitido = %s', async (estado, permitido) => {
    const { caso } = montar({ plan: plan({ estado }) });
    const ejecutar = caso.actualizarRetroalimentacion(
      ACTOR,
      'pj-1',
      'Se logró la meta',
      'Impacto alto',
    );

    if (permitido) {
      await expect(ejecutar).resolves.toBeDefined();
    } else {
      await expect(ejecutar).rejects.toThrow(ReglaDeNegocioViolada);
    }
  });

  it('exige `mejora.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: permitirSolo(['mejora.leer'], pedidos) });

    await expect(
      caso.actualizarRetroalimentacion(ACTOR, 'pj-1', 'logro', 'impacto'),
    ).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.leer', 'mejora.editar']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar({ plan: plan({ estado: 'Aprobado' }) });

    await caso.actualizarRetroalimentacion(ACTOR, 'pj-1', 'logro', 'impacto');

    expect(publicados[0]?.nombre).toBe('mejora.retroalimentacion_registrada');
  });
});

describe('el aspecto no es editable una vez creado (RF-PJ-001 RN1)', () => {
  it('editarDefinicion no acepta ni recibe el aspecto', async () => {
    // La firma de `DefinicionAccionMejora` no lleva `aspecto`: es una
    // propiedad estructural, no una regla que haya que probar en runtime.
    const { caso } = montar();
    const actualizado = await caso.editarDefinicion(ACTOR, 'pj-1', {
      nombre: 'x',
      causaRaiz: 'x',
      justificacion: 'x',
      input: null,
      plazo: new Date(),
      recursos: 'x',
      metas: 'x',
      responsable: 'x',
    });

    expect(actualizado.aspecto).toBe('CRITERIO_ACREDITACION');
  });
});

describe('RepositorioPlanMejoraPort — contrato ampliado (2c-AC-B)', () => {
  it('el doble de este spec ya expone listarDeCarrera con estado como arreglo y planesPorIds', () => {
    // Este test es de compilación: si el tipo de `RepositorioPlanMejoraPort`
    // no acepta `estado` como arreglo, o si `planesPorIds` no existe, el
    // archivo entero deja de tipar y ningún test de este spec corre.
    const _firmaEstadoArreglo: Parameters<
      import('../ports/plan-mejora.port.js').RepositorioPlanMejoraPort['listarDeCarrera']
    >[1] = { estado: ['Aprobado'] };
    const _firmaPlanesPorIds: ReturnType<
      import('../ports/plan-mejora.port.js').RepositorioPlanMejoraPort['planesPorIds']
    > = Promise.resolve([]);
    expect(_firmaEstadoArreglo.estado).toEqual(['Aprobado']);
    void _firmaPlanesPorIds;
  });
});

describe('RF-CH-040 y RF-CH-041 — el alcance por carrera', () => {
  describe('el orden: lectura 403 → existencia y alcance 404 → escritura 403 → reglas 409', () => {
    it('sin `mejora.leer`, un plan de otra carrera es 403 y no 404', async () => {
      const { caso } = montar({
        plan: plan({ carreraId: OTRA_CARRERA }),
        autorizacion: permitirSolo([]),
      });

      await expect(caso.porId(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
    });

    it('un plan de otra carrera es 404, aunque tampoco haya permiso de escritura', async () => {
      const { caso } = montar({
        plan: plan({ carreraId: OTRA_CARRERA }),
        autorizacion: permitirSolo(['mejora.leer']),
      });

      await expect(caso.editarDefinicion(ACTOR, 'pj-1', definicion())).rejects.toThrow(
        NoEncontrado,
      );
      await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(NoEncontrado);
      await expect(caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {})).rejects.toThrow(
        NoEncontrado,
      );
      await expect(caso.actualizarImplementacion(ACTOR, 'pj-1', 'En proceso')).rejects.toThrow(
        NoEncontrado,
      );
      await expect(caso.actualizarRetroalimentacion(ACTOR, 'pj-1', 'a', 'b')).rejects.toThrow(
        NoEncontrado,
      );
      await expect(caso.registrarImpactoEnMedicion(ACTOR, 'pj-1', null)).rejects.toThrow(
        NoEncontrado,
      );
      await expect(
        caso.cargarEvidencia(ACTOR, 'pj-1', {
          referencia: 'x',
          nombreArchivo: null,
          subidoPor: 'u-1',
        }),
      ).rejects.toThrow(NoEncontrado);
    });

    it('en su carrera, sin permiso de escritura, es 403', async () => {
      const { caso } = montar({ plan: plan(), autorizacion: permitirSolo(['mejora.leer']) });

      await expect(caso.editarDefinicion(ACTOR, 'pj-1', definicion())).rejects.toThrow(
        AccesoDenegado,
      );
    });

    it('el permiso de escritura se pide sobre la carrera del plan', async () => {
      const pedidos: [string, string | null][] = [];
      const { caso } = montar({
        plan: plan({ carreraId: CARRERA }),
        autorizacion: {
          puede: async (_id, permiso, carreraId) => {
            pedidos.push([permiso, carreraId ?? null]);
            return { permitido: true };
          },
          permisosDe: async () => new Set(),
          carreraACargoDe: async () => CARRERA,
          rolesDe: async () => [],
        },
      });

      await caso.eliminar(ACTOR, 'pj-1');

      expect(pedidos).toEqual([
        ['mejora.leer', null],
        ['mejora.eliminar', CARRERA],
      ]);
    });

    it('la evidencia de un plan de otra carrera es 404', async () => {
      const { caso } = montar({
        plan: plan({ carreraId: OTRA_CARRERA }),
        autorizacion: permitirSolo(['mejora.leer']),
      });

      await expect(caso.eliminarEvidencia(ACTOR, 'evi-1')).rejects.toThrow(NoEncontrado);
    });

    it('una evidencia inexistente sin `mejora.leer` es 403 y no 404', async () => {
      const { caso } = montar({
        planes: { planDeEvidencia: async () => null },
        autorizacion: permitirSolo([]),
      });

      await expect(caso.eliminarEvidencia(ACTOR, 'evi-x')).rejects.toThrow(AccesoDenegado);
    });
  });

  describe('el listado', () => {
    it('lo acota el servidor a la carrera del alcance', async () => {
      const recibidas: (string | undefined)[] = [];
      const { caso } = montar({
        alcance: alcanceDeCarrera(CARRERA),
        planes: { listar: async (carreraId) => (recibidas.push(carreraId), []) },
      });

      await caso.listar(ACTOR, { texto: 'refuerzo' });

      expect(recibidas).toEqual([CARRERA]);
    });

    it('quien lee solo su carrera y no tiene ninguna ve una lista vacía y no consulta nada', async () => {
      let consultas = 0;
      const { caso } = montar({
        alcance: alcanceDeCarrera(null),
        planes: { listar: async () => (consultas++, []) },
      });

      expect(await caso.listar(ACTOR)).toEqual([]);
      expect(consultas).toBe(0);
    });

    it('quien lee todas las carreras no lleva filtro de carrera', async () => {
      const recibidas: (string | undefined)[] = [];
      const { caso } = montar({
        alcance: alcanceTotal,
        planes: { listar: async (carreraId) => (recibidas.push(carreraId), []) },
      });

      await caso.listar(ACTOR);

      expect(recibidas).toEqual([undefined]);
    });

    it('exige `mejora.leer`', async () => {
      const { caso } = montar({ autorizacion: permitirSolo([]) });

      await expect(caso.listar(ACTOR)).rejects.toThrow(AccesoDenegado);
    });
  });

  describe('el alta (RF-CH-040)', () => {
    it('toma la carrera de la sesión: la que viaja al repositorio es esa', async () => {
      let guardada = '';
      const { caso } = montar({
        planes: {
          crear: async (d) => ((guardada = d.carreraId), plan({ carreraId: d.carreraId })),
        },
      });

      await caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-1' });

      expect(guardada).toBe(CARRERA);
    });

    it('sin carrera asignada, AccesoDenegado con el motivo, antes de mirar nada más', async () => {
      let criteriosConsultados = 0;
      const { caso } = montar({
        autorizacion: { ...permitirTodo(), carreraACargoDe: async () => null },
        acreditacion: { criterioPorId: async () => (criteriosConsultados++, criterioMejora()) },
      });

      await expect(
        caso.crear(ACTOR, { aspecto: 'CRITERIO_ACREDITACION', elementoId: 'cri-1' }),
      ).rejects.toThrow(
        new AccesoDenegado(
          'No tienes una carrera asignada: pide que te asignen una para crear planes de mejora.',
        ),
      );
      expect(criteriosConsultados).toBe(0);
    });

    it('con un plan de evaluación base de otra carrera que sí puede leer: 409 y no se crea nada', async () => {
      let creados = 0;
      const { caso } = montar({
        alcance: alcanceTotal,
        evaluaciones: { porId: async () => planEvaluacion({ carreraId: OTRA_CARRERA }) },
        planes: { crear: async () => (creados++, plan()) },
      });

      await expect(
        caso.crear(ACTOR, {
          aspecto: 'COMPETENCIA',
          elementoId: 'comp-1',
          periodoId: 'per-1',
          planEvaluacionId: 'pe-1',
        }),
      ).rejects.toThrow(
        new ReglaDeNegocioViolada(
          'El plan de evaluación base no es de tu carrera: un plan de mejora de competencias se construye sobre un plan de evaluación de la carrera con la que trabajas.',
        ),
      );
      expect(creados).toBe(0);
    });

    it('con un plan de evaluación base de otra carrera que NO puede leer: 404 (hueco del 6a)', async () => {
      const { caso } = montar({
        alcance: alcanceDeCarrera(CARRERA),
        evaluaciones: { porId: async () => planEvaluacion({ carreraId: OTRA_CARRERA }) },
      });

      await expect(
        caso.crear(ACTOR, {
          aspecto: 'COMPETENCIA',
          elementoId: 'comp-1',
          periodoId: 'per-1',
          planEvaluacionId: 'pe-1',
        }),
      ).rejects.toThrow(NoEncontrado);
    });
  });

  describe('el porcentaje del periodo anterior (hueco del 6a)', () => {
    it('con un plan de evaluación de otra carrera es 404 y no calcula nada', async () => {
      let lecturas = 0;
      const { caso } = montar({
        alcance: alcanceDeCarrera(CARRERA),
        evaluaciones: {
          porId: async () => (lecturas++, planEvaluacion({ carreraId: OTRA_CARRERA })),
        },
        mediciones: { porId: async () => (lecturas++, planMedicion()) },
      });

      await expect(
        caso.porcentajeAnteriorDeCompetencia(ACTOR, 'pe-1', 'comp-1', 'per-2'),
      ).rejects.toThrow(NoEncontrado);
      expect(lecturas).toBe(1); // solo la lectura que decide el alcance
    });
  });

  describe('las alertas de mínimo por criterio', () => {
    it('de una carrera que no puede leer, 404', async () => {
      const { caso } = montar({ alcance: alcanceDeCarrera(CARRERA) });

      await expect(caso.alertasMinimoCriterio(ACTOR, OTRA_CARRERA)).rejects.toThrow(NoEncontrado);
    });
  });
});
