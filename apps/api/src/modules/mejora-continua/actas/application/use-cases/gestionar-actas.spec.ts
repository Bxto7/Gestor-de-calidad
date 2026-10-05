/**
 * Pruebas de `GestionarActas` (2c-AC-A). Mismo patrón que
 * `gestionar-planes-mejora.spec.ts`: dobles de puerto,
 * `permitirTodo()`/`denegarRegistrando()` para la autorización, un
 * `montar()` que arma el caso de uso con esos dobles.
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
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  CarreraBase,
  ContenidoCurricularPort,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  AccionActaDato,
  DatosActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
import { GestionarActas } from './gestionar-actas.use-case.js';
import type {
  DatosPlanMejora,
  RepositorioPlanMejoraPort,
} from '../../../mejora/application/ports/plan-mejora.port.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const CARRERA = 'carrera-1';

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

const OTRA_CARRERA = 'carrera-2';

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

/**
 * Concede todo salvo lo que se le pide negar, y registra cada permiso consultado
 * (y la carrera sobre la que se consultó): sirve para comprobar el orden 403→404→403.
 */
function denegarSolo(
  pedidos: string[],
  denegados: readonly string[],
  carreras: (string | null)[] = [],
): AuthorizationPort {
  return {
    puede: async (_id, permiso, carreraId) => {
      pedidos.push(permiso);
      carreras.push(carreraId ?? null);
      return denegados.includes(permiso)
        ? { permitido: false, motivo: 'Falta el permiso.' }
        : { permitido: true };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}

function acta(sobre: Partial<DatosActa> = {}): DatosActa {
  return {
    id: 'acta-1',
    carreraId: CARRERA,
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2025-10',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    textoIntroduccion:
      'Se deja constancia de la revisión y deliberación de las siguientes acciones.',
    textoAcuerdoCierre: 'Se aprueban las acciones de mejora del programa para el periodo 2025-10.',
    convocadaPor: '',
    fechaReunion: new Date(0),
    lugarReunion: '',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    estado: 'Borrador',
    creadoEn: new Date('2026-03-01'),
    asistentes: [],
    ...sobre,
  };
}

function actaResumen(sobre: Partial<import('../ports/acta-aprobacion.port.js').ActaResumen> = {}) {
  return {
    id: 'acta-1',
    codigo: 'ACTA N° 001 – EAP-ISI',
    correlativo: 1,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    periodoAcademico: '2025-10',
    estado: 'Borrador' as const,
    carreraId: CARRERA,
    creadoEn: new Date('2026-03-01'),
    ...sobre,
  };
}

function repoActas(
  overrides: Partial<RepositorioActaAprobacionPort> = {},
): RepositorioActaAprobacionPort {
  return {
    crear: async () => acta(),
    porId: async () => acta(),
    listar: async () => [actaResumen()],
    editarCabecera: async () => acta(),
    reemplazarAsistentes: async () => acta(),
    eliminar: async () => {},
    correlativosDe: async () => [],
    accionesDe: async () => [],
    agregarAcciones: async () => {},
    actualizarSeleccion: async () => {},
    editarTextos: async (_id, datos) => acta(datos),
    planesYaEmitidos: async () => new Set(),
    cambiarEstado: async (_id, estado, opciones) =>
      acta({
        estado,
        ...(opciones?.aprobacion
          ? { aprobadoPorId: opciones.aprobacion.actorId, aprobadoEn: opciones.aprobacion.fecha }
          : {}),
      }),
    ...overrides,
  };
}

const noUsado = (metodo: string) => async () => {
  throw new Error(`${metodo} no se usa en este spec.`);
};

function planMejora(sobre: Partial<DatosPlanMejora> = {}): DatosPlanMejora {
  return {
    id: 'plan-1',
    codigo: 'CA-01',
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: CARRERA,
    criterioAcreditacionId: 'crit-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: null,
    estado: 'Aprobado',
    estadoImplementacion: 'Pendiente',
    nombre: 'Reforzar la bibliografía',
    causaRaiz: 'x',
    justificacion: 'x',
    input: null,
    plazo: new Date('2026-06-01'),
    recursos: 'x',
    metas: 'x',
    responsable: 'x',
    responsableId: null,
    logroMeta: null,
    impacto: null,
    creadoEn: new Date('2026-01-01'),
    evidencias: [],
    version: 1,
    derivadoDeId: null,
    ...sobre,
  };
}

function repoPlanesMejora(
  sobre: Partial<RepositorioPlanMejoraPort> = {},
): RepositorioPlanMejoraPort {
  return {
    crear: noUsado('crear'),
    porId: noUsado('porId'),
    editarDefinicion: noUsado('editarDefinicion'),
    eliminar: noUsado('eliminar'),
    cambiarEstado: noUsado('cambiarEstado'),
    actualizarImplementacion: noUsado('actualizarImplementacion'),
    actualizarRetroalimentacion: noUsado('actualizarRetroalimentacion'),
    agregarEvidencia: noUsado('agregarEvidencia'),
    planDeEvidencia: noUsado('planDeEvidencia'),
    eliminarEvidencia: noUsado('eliminarEvidencia'),
    codigosDe: noUsado('codigosDe'),
    parametros: noUsado('parametros'),
    registrarImpactoEnMedicion: noUsado('registrarImpactoEnMedicion'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    listar: async () => [],
    listarDeCarrera: async () => [],
    planesPorIds: async () => [],
    ...sobre,
  };
}

function repoEvaluaciones(
  sobre: Partial<RepositorioPlanEvaluacionPort> = {},
): RepositorioPlanEvaluacionPort {
  return {
    listar: noUsado('listar'),
    porId: noUsado('porId'),
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    cambiarEstado: noUsado('cambiarEstado'),
    eliminar: noUsado('eliminar'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    ...sobre,
  };
}

function repoMediciones(
  sobre: Partial<RepositorioPlanMedicionPort> = {},
): RepositorioPlanMedicionPort {
  return {
    listar: noUsado('listar'),
    porId: noUsado('porId'),
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    actualizar: noUsado('actualizar'),
    cambiarEstado: noUsado('cambiarEstado'),
    contenidoDe: noUsado('contenidoDe'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    marcarVigenteRelevando: noUsado('marcarVigenteRelevando'),
    eliminar: noUsado('eliminar'),
    declararCompetencias: noUsado('declararCompetencias'),
    declararPeriodos: noUsado('declararPeriodos'),
    matriz: noUsado('matriz'),
    programar: noUsado('programar'),
    marcarRealizada: noUsado('marcarRealizada'),
    ...sobre,
  };
}

function repoConfiguraciones(
  sobre: Partial<RepositorioConfiguracionEvaluacionPort> = {},
): RepositorioConfiguracionEvaluacionPort {
  return {
    del: noUsado('del'),
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

function carreraBase(sobre: Partial<CarreraBase> = {}): CarreraBase {
  return { id: CARRERA, codigo: 'EAP-ISI', nombre: 'Ingeniería de Software', ...sobre };
}

function curricular(overrides: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [],
    planPorId: async () => null,
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async () => carreraBase(),
    ...overrides,
  };
}

function capturarEventos(): { eventos: DomainEvent[]; publicador: PublicadorDeEventos } {
  const eventos: DomainEvent[] = [];
  return {
    eventos,
    publicador: {
      publicar: async (nuevos) => {
        eventos.push(...nuevos);
      },
    },
  };
}

function cabecera(sobre: Partial<import('../ports/acta-aprobacion.port.js').CabeceraActa> = {}) {
  return {
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    convocadaPor: 'Directora de Escuela',
    fechaReunion: new Date('2026-03-09'),
    lugarReunion: 'Sala de reuniones',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    ...sobre,
  };
}

function montar(
  opciones: {
    actas?: RepositorioActaAprobacionPort;
    planes?: RepositorioPlanMejoraPort;
    evaluaciones?: RepositorioPlanEvaluacionPort;
    mediciones?: RepositorioPlanMedicionPort;
    configuraciones?: RepositorioConfiguracionEvaluacionPort;
    curricular?: ContenidoCurricularPort;
    autorizacion?: AuthorizationPort;
    eventos?: PublicadorDeEventos;
    alcance?: AlcanceDeLecturaPort;
  } = {},
): GestionarActas {
  return new GestionarActas(
    opciones.actas ?? repoActas(),
    opciones.planes ?? repoPlanesMejora(),
    opciones.evaluaciones ?? repoEvaluaciones(),
    opciones.mediciones ?? repoMediciones(),
    opciones.configuraciones ?? repoConfiguraciones(),
    opciones.curricular ?? curricular(),
    opciones.autorizacion ?? permitirTodo(),
    opciones.eventos ?? { publicar: async () => {} },
    opciones.alcance ?? alcanceTotal,
  );
}

describe('crear', () => {
  it('resuelve la carrera del actor, genera correlativo/código y precarga título/objetivo', async () => {
    const actas = repoActas({
      correlativosDe: async () => [1, 2],
      crear: async (datos) => acta({ ...datos, id: 'acta-2' }),
    });
    const casos = montar({ actas });

    const creada = await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(creada.correlativo).toBe(3);
    expect(creada.codigo).toBe('ACTA N° 003 – EAP-ISI');
    expect(creada.titulo).toContain('2025-10');
    expect(creada.titulo).toContain('Ingeniería de Software');
    expect(creada.objetivo).toBe('Elaborar y aprobar el Plan de Mejora 2025-10');
  });

  it('rechaza si el usuario no dirige ninguna carrera', async () => {
    const autorizacion: AuthorizationPort = {
      puede: async () => ({ permitido: true }),
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
      rolesDe: async () => [],
    };
    const casos = montar({ autorizacion });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(
      AccesoDenegado,
    );
  });

  it('exige actas.crear acotado a la carrera del actor', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(
      AccesoDenegado,
    );
    expect(pedidos).toContain('actas.crear');
  });

  it('rechaza un periodo académico vacío (RF-AC-001)', async () => {
    const casos = montar();
    await expect(casos.crear(ACTOR, { periodoAcademico: '   ' })).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('publica ActaCreada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.nombre).toBe('actas.creada');
  });

  it('compone los textos institucionales de introducción y cierre (RF-AC-011)', async () => {
    const actas = repoActas({
      correlativosDe: async () => [],
      crear: async (datos) => acta({ ...datos, id: 'acta-2' }),
    });
    const casos = montar({ actas });

    const creada = await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(creada.textoIntroduccion).toContain('2025-10');
    expect(creada.textoAcuerdoCierre).toContain('2025-10');
  });
});

describe('editarCabecera', () => {
  it('edita cuando el acta está en Borrador', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      editarCabecera: async (_id, datos) => acta({ ...datos }),
    });
    const casos = montar({ actas });

    const editada = await casos.editarCabecera(ACTOR, 'acta-1', cabecera());

    expect(editada.convocadaPor).toBe('Directora de Escuela');
  });

  it('rechaza editar un acta que no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'En revisión' }) });
    const casos = montar({ actas });

    await expect(casos.editarCabecera(ACTOR, 'acta-1', cabecera())).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('exige actas.editar acotado a la carrera del acta', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarSolo(pedidos, ['actas.editar']) });

    await expect(casos.editarCabecera(ACTOR, 'acta-1', cabecera())).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.editar');
  });

  it('publica ActaCabeceraEditada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.editarCabecera(ACTOR, 'acta-1', cabecera());

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.cabecera_editada']);
  });
});

describe('reemplazarAsistentes', () => {
  it('recorta espacios y descarta nombres vacíos', async () => {
    let recibidos: readonly string[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      reemplazarAsistentes: async (_id, nombres) => {
        recibidos = nombres;
        return acta({ asistentes: nombres.map((n, i) => ({ id: `a-${i}`, nombre: n })) });
      },
    });
    const casos = montar({ actas });

    await casos.reemplazarAsistentes(ACTOR, 'acta-1', ['  Ana Pérez  ', '', 'Luis Gómez']);

    expect(recibidos).toEqual(['Ana Pérez', 'Luis Gómez']);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });
    const casos = montar({ actas });

    await expect(casos.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('publica ActaAsistentesReemplazados', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez']);

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.asistentes_reemplazados']);
  });
});

describe('eliminar', () => {
  it('elimina un acta en Borrador', async () => {
    let eliminado = false;
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      eliminar: async () => {
        eliminado = true;
      },
    });
    const casos = montar({ actas });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eliminado).toBe(true);
  });

  it('rechaza eliminar un acta que no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Emitida' }) });
    const casos = montar({ actas });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige actas.eliminar acotado a la carrera del acta', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarSolo(pedidos, ['actas.eliminar']) });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.eliminar');
  });

  it('publica ActaEliminada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({
      eventos: publicador,
      actas: repoActas({ porId: async () => acta({ estado: 'Borrador' }) }),
    });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.eliminada']);
  });
});

describe('cargarAccionesDelPeriodo', () => {
  it('de un linaje con varias versiones aprobadas ofrece solo la última (RF-CH-043)', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'CRITERIO_ACREDITACION'
          ? [
              planMejora({ id: 'v1', derivadoDeId: null, estado: 'Aprobado' }),
              planMejora({ id: 'v2', derivadoDeId: 'v1', estado: 'Aprobado' }),
            ]
          : [],
    });
    let agregadas: { planMejoraId: string }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }),
      agregarAcciones: async (_id, nuevas) => {
        agregadas = [...nuevas];
      },
    });
    const casos = montar({ actas, planes });

    const cantidad = await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(cantidad).toBe(1);
    expect(agregadas.map((a) => a.planMejoraId)).toEqual(['v2']);
  });

  it('una rama (dos hijos aprobados del mismo origen) ofrece las dos puntas y no el origen', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'OBJETIVO_EDUCACIONAL'
          ? [
              planMejora({
                id: 'v1',
                aspecto: 'OBJETIVO_EDUCACIONAL',
                derivadoDeId: null,
                estado: 'Aprobado',
              }),
              planMejora({
                id: 'v2a',
                aspecto: 'OBJETIVO_EDUCACIONAL',
                derivadoDeId: 'v1',
                estado: 'Aprobado',
              }),
              planMejora({
                id: 'v2b',
                aspecto: 'OBJETIVO_EDUCACIONAL',
                derivadoDeId: 'v1',
                estado: 'Aprobado',
              }),
            ]
          : [],
    });
    let agregadas: { planMejoraId: string }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }),
      agregarAcciones: async (_id, nuevas) => {
        agregadas = [...nuevas];
      },
    });

    await montar({ actas, planes }).cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(agregadas.map((a) => a.planMejoraId).sort()).toEqual(['v2a', 'v2b']);
  });

  it('carga candidatas Aprobadas de Criterio y Objetivo sin filtrar por periodo', async () => {
    const filtrosRecibidos: unknown[] = [];
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) => {
        filtrosRecibidos.push(filtro);
        if (filtro?.aspecto === 'CRITERIO_ACREDITACION') return [planMejora({ id: 'plan-crit' })];
        if (filtro?.aspecto === 'OBJETIVO_EDUCACIONAL') {
          return [
            planMejora({
              id: 'plan-obj',
              aspecto: 'OBJETIVO_EDUCACIONAL',
              criterioAcreditacionId: null,
              objetivoEducacionalId: 'obj-1',
            }),
          ];
        }
        return [];
      },
    });
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }),
    });
    const casos = montar({ actas, planes });

    const cantidad = await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(cantidad).toBe(2);
    expect(filtrosRecibidos).toEqual([
      { aspecto: 'CRITERIO_ACREDITACION', estado: 'Aprobado' },
      { aspecto: 'OBJETIVO_EDUCACIONAL', estado: 'Aprobado' },
    ]);
  });

  it('no consulta Competencia si el acta no tiene periodoMedicionId', async () => {
    let seConsultoCompetencia = false;
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) => {
        if (filtro?.aspecto === 'COMPETENCIA') seConsultoCompetencia = true;
        return [];
      },
    });
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }),
    });
    const casos = montar({ actas, planes });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(seConsultoCompetencia).toBe(false);
  });

  it('filtra Competencia por periodoMedicionId del acta y snapshotea el % de RF-PJ-028', async () => {
    const planCompetencia = planMejora({
      id: 'plan-comp',
      aspecto: 'COMPETENCIA',
      criterioAcreditacionId: null,
      competenciaId: 'comp-1',
      planEvaluacionId: 'eval-1',
      periodoId: 'periodo-2',
    });
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'COMPETENCIA' ? [planCompetencia] : [],
    });
    const evaluaciones = repoEvaluaciones({
      porId: async () => ({ id: 'eval-1', planMedicionId: 'medicion-1' }) as never,
    });
    const mediciones = repoMediciones({
      porId: async () =>
        ({
          periodos: [
            { id: 'periodo-1', orden: 1, etiqueta: '2025-05', fechaCierre: null },
            { id: 'periodo-2', orden: 2, etiqueta: '2025-10', fechaCierre: null },
          ],
        }) as never,
    });
    const configuraciones = repoConfiguraciones({
      del: async () => ({
        competencias: [],
        indicaciones: [],
        mediciones: [
          {
            competenciaId: 'comp-1',
            periodoId: 'periodo-1',
            porcentajeAlcanzado: 65,
            asignaturas: [],
          },
        ],
      }),
    });
    let agregadas: { porcentajeMedicionCompetencia: number | null }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador', periodoMedicionId: 'periodo-2' }),
      agregarAcciones: async (_id, nuevas) => {
        agregadas = [...nuevas];
      },
    });
    const casos = montar({ actas, planes, evaluaciones, mediciones, configuraciones });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(agregadas).toEqual([
      {
        planMejoraId: 'plan-comp',
        aspecto: 'COMPETENCIA',
        porcentajeMedicionCompetencia: 65,
        orden: 0,
      },
    ]);
  });

  it('excluye candidatas ya vinculadas o ya emitidas', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'CRITERIO_ACREDITACION'
          ? [
              planMejora({ id: 'ya-vinculado' }),
              planMejora({ id: 'ya-emitido' }),
              planMejora({ id: 'nuevo' }),
            ]
          : [],
    });
    let agregadas: { planMejoraId: string }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'ya-vinculado',
          aspecto: 'CRITERIO_ACREDITACION',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
      planesYaEmitidos: async () => new Set(['ya-emitido']),
      agregarAcciones: async (_id, nuevas) => {
        agregadas = [...nuevas];
      },
    });
    const casos = montar({ actas, planes });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(agregadas.map((a) => a.planMejoraId)).toEqual(['nuevo']);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'En revisión' }) });
    const casos = montar({ actas });

    await expect(casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1')).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('publica ActaAccionesCargadas con la cantidad agregada', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'CRITERIO_ACREDITACION' ? [planMejora({ id: 'plan-1' })] : [],
    });
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador' }) });
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ actas, planes, eventos: publicador });

    await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.acciones_cargadas']);
  });
});

describe('actualizarSeleccionDeAcciones', () => {
  it('togglea incluida sobre acciones ya vinculadas', async () => {
    let recibido: readonly { planMejoraId: string; incluida: boolean }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-1',
          aspecto: 'CRITERIO_ACREDITACION',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
      actualizarSeleccion: async (_id, cambios) => {
        recibido = cambios;
      },
    });
    const casos = montar({ actas });

    await casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [
      { planMejoraId: 'plan-1', incluida: false },
    ]);

    expect(recibido).toEqual([{ planMejoraId: 'plan-1', incluida: false }]);
  });

  it('rechaza togglear un planMejoraId sin AccionActa previa', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [],
    });
    const casos = montar({ actas });

    await expect(
      casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [
        { planMejoraId: 'sin-cargar', incluida: true },
      ]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });
    const casos = montar({ actas });

    await expect(
      casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [
        { planMejoraId: 'plan-1', incluida: true },
      ]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('publica ActaSeleccionDeAccionesActualizada', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-1',
          aspecto: 'CRITERIO_ACREDITACION',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
    });
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ actas, eventos: publicador });

    await casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [
      { planMejoraId: 'plan-1', incluida: false },
    ]);

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.seleccion_actualizada']);
  });
});

describe('editarTextosInstitucionales', () => {
  it('reemplaza los textos enviados y deja el resto igual', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      editarTextos: async (_id, datos) => acta({ ...datos }),
    });
    const casos = montar({ actas });

    const editada = await casos.editarTextosInstitucionales(ACTOR, 'acta-1', {
      textoIntroduccion: 'nueva intro',
      textoAcuerdoCierre: 'nuevo cierre',
    });

    expect(editada.textoIntroduccion).toBe('nueva intro');
    expect(editada.textoAcuerdoCierre).toBe('nuevo cierre');
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Emitida' }) });
    const casos = montar({ actas });

    await expect(
      casos.editarTextosInstitucionales(ACTOR, 'acta-1', {
        textoIntroduccion: 'x',
        textoAcuerdoCierre: 'y',
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('publica ActaTextosEditados', async () => {
    const { eventos, publicador } = capturarEventos();
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador' }) });
    const casos = montar({ actas, eventos: publicador });

    await casos.editarTextosInstitucionales(ACTOR, 'acta-1', {
      textoIntroduccion: 'x',
      textoAcuerdoCierre: 'y',
    });

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.textos_editados']);
  });
});

describe('obtenerContenido', () => {
  it('combina las AccionActa con los datos en vivo de PlanMejora', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-1',
          aspecto: 'CRITERIO_ACREDITACION',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
    });
    const planes = repoPlanesMejora({
      planesPorIds: async () => [planMejora({ id: 'plan-1', nombre: 'Reforzar bibliografía' })],
    });
    const casos = montar({ actas, planes });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toHaveLength(1);
    expect(contenido.acciones[0]?.incluida).toBe(true);
    expect(contenido.acciones[0]?.plan.nombre).toBe('Reforzar bibliografía');
  });

  it('acta sin acciones cargadas devuelve la lista vacía', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [],
    });
    const casos = montar({ actas });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toEqual([]);
  });

  it('omite silenciosamente las filas cuyo PlanMejora fue eliminado después de vincularse', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-vigente',
          aspecto: 'CRITERIO_ACREDITACION',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
        {
          id: 'aa-2',
          planMejoraId: 'plan-eliminado',
          aspecto: 'OBJETIVO_EDUCACIONAL',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 1,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
    });
    const planes = repoPlanesMejora({
      planesPorIds: async () => [planMejora({ id: 'plan-vigente', nombre: 'Plan actual' })],
    });
    const casos = montar({ actas, planes });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toHaveLength(1);
    expect(contenido.acciones[0]?.id).toBe('aa-1');
    expect(contenido.acciones[0]?.plan.id).toBe('plan-vigente');
  });

  it('RNF24: un acta Aprobada lee del snapshot, no de PlanMejora en vivo', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Aprobada' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-1',
          aspecto: 'CRITERIO_ACREDITACION',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: 'CA-01',
          nombreSnapshot: 'Nombre congelado',
          plazoSnapshot: new Date('2026-12-01'),
          recursosSnapshot: 'recursos congelados',
          metasSnapshot: 'metas congeladas',
          responsableSnapshot: 'resp congelado',
          metaCompetenciaSnapshot: null,
        },
      ],
    });
    // `planesPorIds` no se llama en absoluto para un acta Aprobada — si el
    // caso de uso todavía leyera en vivo, este doble lo delataría.
    const planes = repoPlanesMejora({
      planesPorIds: noUsado('planesPorIds') as unknown as RepositorioPlanMejoraPort['planesPorIds'],
    });
    const casos = montar({ actas, planes });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones[0]?.plan.nombre).toBe('Nombre congelado');
    expect(contenido.acciones[0]?.plan.codigo).toBe('CA-01');
    expect(contenido.acciones[0]?.plan.responsable).toBe('resp congelado');
  });

  it('RNF24: una fila Aprobada sin snapshot completo se omite (no debería ocurrir, pero no debe reventar)', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Aprobada' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-1',
          aspecto: 'CRITERIO_ACREDITACION',
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          metasSnapshot: null,
          responsableSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
    });
    const casos = montar({ actas });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toEqual([]);
  });
});

describe('listar', () => {
  it('exige actas.leer sin acotar a carrera', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.listar(ACTOR)).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.leer');
  });

  it('acota al alcance: la carrera del actor viaja al repositorio junto con el filtro', async () => {
    let recibido: unknown[] = [];
    const actas = repoActas({
      listar: async (...args) => {
        recibido = args;
        return [actaResumen()];
      },
    });
    const casos = montar({ actas, alcance: alcanceDeCarrera(CARRERA) });

    const filtro = {
      periodoAcademico: '2025-10',
      estado: 'Aprobada' as const,
      texto: 'ingeniería',
    };
    const resultado = await casos.listar(ACTOR, filtro);

    expect(recibido).toEqual([CARRERA, filtro]);
    expect(resultado).toEqual([actaResumen()]);
  });

  it('quien lee todo (Consultor) consulta sin restricción de carrera', async () => {
    let recibido: unknown[] = ['no-llamado'];
    const actas = repoActas({
      listar: async (...args) => {
        recibido = args;
        return [];
      },
    });
    const casos = montar({ actas, alcance: alcanceTotal });

    await casos.listar(ACTOR);

    expect(recibido).toEqual([undefined, undefined]);
  });

  it('sin carrera asignada la lista es vacía y ni siquiera se consulta el repositorio', async () => {
    let consultado = false;
    const actas = repoActas({
      listar: async () => {
        consultado = true;
        return [actaResumen()];
      },
    });
    const casos = montar({ actas, alcance: alcanceDeCarrera(null) });

    expect(await casos.listar(ACTOR)).toEqual([]);
    expect(consultado).toBe(false);
  });
});

describe('transicionar', () => {
  /** Cabecera + emisión completas y ≥1 asistente: sin bloqueos de RF-AC-016. */
  function actaCompleta(sobre: Partial<DatosActa> = {}): DatosActa {
    return acta({
      convocadaPor: 'Directora de Escuela',
      fechaReunion: new Date('2026-03-09'),
      lugarReunion: 'Sala de reuniones',
      lugarEmision: 'Huancayo',
      fechaEmision: new Date('2026-03-20'),
      asistentes: [{ id: 'as-1', nombre: 'Ana Pérez' }],
      ...sobre,
    });
  }

  const unaAccionIncluida = [
    {
      id: 'aa-1',
      planMejoraId: 'plan-1',
      aspecto: 'CRITERIO_ACREDITACION' as const,
      incluida: true,
      porcentajeMedicionCompetencia: null,
      orden: 0,
      codigoSnapshot: null,
      nombreSnapshot: null,
      plazoSnapshot: null,
      recursosSnapshot: null,
      responsableSnapshot: null,
      metasSnapshot: null,
      metaCompetenciaSnapshot: null,
    },
  ];

  it('enviar-a-revision: Borrador → En revisión', async () => {
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'Borrador' }),
      accionesDe: async () => unaAccionIncluida,
    });
    const casos = montar({ actas });

    const resultado = await casos.transicionar(ACTOR, 'acta-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it('aprobar: En revisión → Aprobada, fija aprobadoPorId/aprobadoEn', async () => {
    let aprobacionRecibida: { actorId: string; fecha: Date } | undefined;
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => unaAccionIncluida,
      cambiarEstado: async (_id, estado, opciones) => {
        aprobacionRecibida = opciones?.aprobacion;
        return actaCompleta({
          estado,
          aprobadoPorId: opciones?.aprobacion?.actorId ?? null,
          aprobadoEn: opciones?.aprobacion?.fecha ?? null,
        });
      },
    });
    const casos = montar({ actas });

    const resultado = await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(resultado.estado).toBe('Aprobada');
    expect(resultado.aprobadoPorId).toBe(ACTOR.id);
    expect(aprobacionRecibida?.actorId).toBe(ACTOR.id);
  });

  it('aprobar: congela nombre/plazo/recursos/metas/responsable de cada acción incluida', async () => {
    let snapshotsRecibidos: readonly { accionActaId: string; codigo: string; nombre: string }[] =
      [];
    const dosAcciones = [
      {
        id: 'aa-1',
        planMejoraId: 'plan-1',
        aspecto: 'CRITERIO_ACREDITACION' as const,
        incluida: true,
        porcentajeMedicionCompetencia: null,
        orden: 0,
        codigoSnapshot: null,
        nombreSnapshot: null,
        plazoSnapshot: null,
        recursosSnapshot: null,
        responsableSnapshot: null,
        metasSnapshot: null,
        metaCompetenciaSnapshot: null,
      },
      {
        id: 'aa-2',
        planMejoraId: 'plan-2',
        aspecto: 'OBJETIVO_EDUCACIONAL' as const,
        incluida: true,
        porcentajeMedicionCompetencia: null,
        orden: 1,
        codigoSnapshot: null,
        nombreSnapshot: null,
        plazoSnapshot: null,
        recursosSnapshot: null,
        responsableSnapshot: null,
        metasSnapshot: null,
        metaCompetenciaSnapshot: null,
      },
    ];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => dosAcciones,
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({
      planesPorIds: async () => [
        planMejora({
          id: 'plan-1',
          codigo: 'CA-01',
          nombre: 'Reforzar bibliografía',
          plazo: new Date('2026-12-01'),
          recursos: 'r1',
          metas: 'm1',
          responsable: 'resp-1',
        }),
        planMejora({
          id: 'plan-2',
          aspecto: 'OBJETIVO_EDUCACIONAL',
          codigo: 'OE-01',
          nombre: 'Ajustar el syllabus',
          plazo: new Date('2026-11-01'),
          recursos: 'r2',
          metas: 'm2',
          responsable: 'resp-2',
        }),
      ],
    });
    const casos = montar({ actas, planes });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshotsRecibidos).toHaveLength(2);
    expect(snapshotsRecibidos.find((s) => s.accionActaId === 'aa-1')).toMatchObject({
      codigo: 'CA-01',
      nombre: 'Reforzar bibliografía',
    });
    expect(snapshotsRecibidos.find((s) => s.accionActaId === 'aa-2')).toMatchObject({
      codigo: 'OE-01',
      nombre: 'Ajustar el syllabus',
    });
  });

  it('aprobar: no congela las acciones descartadas (incluida: false)', async () => {
    let snapshotsRecibidos: readonly { accionActaId: string }[] = [];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-1',
          aspecto: 'CRITERIO_ACREDITACION' as const,
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
        {
          id: 'aa-2',
          planMejoraId: 'plan-2',
          aspecto: 'CRITERIO_ACREDITACION' as const,
          incluida: false,
          porcentajeMedicionCompetencia: null,
          orden: 1,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({ planesPorIds: async () => [planMejora({ id: 'plan-1' })] });
    const casos = montar({ actas, planes });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshotsRecibidos).toEqual([expect.objectContaining({ accionActaId: 'aa-1' })]);
  });

  it('aprobar: congela la meta de Competencia resuelta en ese momento (0-100)', async () => {
    let snapshotsRecibidos: readonly { metaCompetenciaSnapshot: number | null }[] = [];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-comp',
          aspecto: 'COMPETENCIA' as const,
          incluida: true,
          porcentajeMedicionCompetencia: 65,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({
      planesPorIds: async () => [
        planMejora({ id: 'plan-comp', aspecto: 'COMPETENCIA', planEvaluacionId: 'pe-1' }),
      ],
    });
    const evaluaciones = repoEvaluaciones({
      porId: async () =>
        ({
          id: 'pe-1',
          planMedicionId: 'pm-1',
        }) as Awaited<ReturnType<RepositorioPlanEvaluacionPort['porId']>>,
    });
    const mediciones = repoMediciones({
      porId: async () =>
        ({ id: 'pm-1', meta: 0.7 }) as Awaited<ReturnType<RepositorioPlanMedicionPort['porId']>>,
    });
    const casos = montar({ actas, planes, evaluaciones, mediciones });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshotsRecibidos[0]?.metaCompetenciaSnapshot).toBe(70);
  });

  it('aprobar: una acción cuyo plan de mejora ya no existe se omite del snapshot sin bloquear la aprobación', async () => {
    let snapshotsRecibidos: readonly { accionActaId: string }[] = [];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => [
        {
          id: 'aa-1',
          planMejoraId: 'plan-borrado',
          aspecto: 'CRITERIO_ACREDITACION' as const,
          incluida: true,
          porcentajeMedicionCompetencia: null,
          orden: 0,
          codigoSnapshot: null,
          nombreSnapshot: null,
          plazoSnapshot: null,
          recursosSnapshot: null,
          responsableSnapshot: null,
          metasSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({ planesPorIds: async () => [] });
    const casos = montar({ actas, planes });

    const resultado = await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(resultado.estado).toBe('Aprobada');
    expect(snapshotsRecibidos).toEqual([]);
  });

  it('rechazar: En revisión → Borrador, no toca aprobadoPorId/aprobadoEn', async () => {
    let aprobacionRecibida: unknown = 'sin-invocar';
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => unaAccionIncluida,
      cambiarEstado: async (_id, estado, opciones) => {
        aprobacionRecibida = opciones?.aprobacion;
        return actaCompleta({ estado });
      },
    });
    const casos = montar({ actas });

    const resultado = await casos.transicionar(ACTOR, 'acta-1', 'rechazar', {
      comentario: 'Falta el lugar de emisión.',
    });

    expect(resultado.estado).toBe('Borrador');
    expect(aprobacionRecibida).toBeUndefined();
  });

  it('rechaza rechazar sin comentario (RF-AC-015 RN1)', async () => {
    const actas = repoActas({ porId: async () => actaCompleta({ estado: 'En revisión' }) });
    const casos = montar({ actas });

    await expect(casos.transicionar(ACTOR, 'acta-1', 'rechazar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('rechaza una transición fuera de secuencia', async () => {
    const actas = repoActas({ porId: async () => actaCompleta({ estado: 'Borrador' }) });
    const casos = montar({ actas });

    await expect(casos.transicionar(ACTOR, 'acta-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('RF-AC-016: enviar-a-revision bloqueada por completitud (sin asistentes)', async () => {
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'Borrador', asistentes: [] }),
      accionesDe: async () => unaAccionIncluida,
    });
    const casos = montar({ actas });

    await expect(casos.transicionar(ACTOR, 'acta-1', 'enviar-a-revision', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('RF-AC-016: aprobar bloqueada por completitud (sin acciones incluidas)', async () => {
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => [],
    });
    const casos = montar({ actas });

    await expect(casos.transicionar(ACTOR, 'acta-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('rechazar no exige completitud, aunque el acta tenga bloqueos', async () => {
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión', asistentes: [] }),
      accionesDe: async () => [],
    });
    const casos = montar({ actas });

    const resultado = await casos.transicionar(ACTOR, 'acta-1', 'rechazar', {
      comentario: 'Corrige la cabecera.',
    });

    expect(resultado.estado).toBe('Borrador');
  });

  it('exige actas.editar para enviar-a-revision y actas.aprobar para aprobar/rechazar', async () => {
    const pedidos: string[] = [];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'Borrador' }),
      accionesDe: async () => unaAccionIncluida,
    });
    const casos = montar({ actas, autorizacion: denegarSolo(pedidos, ['actas.editar']) });

    await expect(casos.transicionar(ACTOR, 'acta-1', 'enviar-a-revision', {})).rejects.toThrow(
      AccesoDenegado,
    );
    expect(pedidos).toContain('actas.editar');

    const actasEnRevision = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => unaAccionIncluida,
    });
    const casosAprobar = montar({
      actas: actasEnRevision,
      autorizacion: denegarSolo(pedidos, ['actas.aprobar']),
    });
    await expect(casosAprobar.transicionar(ACTOR, 'acta-1', 'aprobar', {})).rejects.toThrow(
      AccesoDenegado,
    );
    expect(pedidos).toContain('actas.aprobar');
  });

  it('publica ActaTransicionada', async () => {
    const { eventos, publicador } = capturarEventos();
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'Borrador' }),
      accionesDe: async () => unaAccionIncluida,
    });
    const casos = montar({ actas, eventos: publicador });

    await casos.transicionar(ACTOR, 'acta-1', 'enviar-a-revision', {});

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.transicion']);
  });
});

describe('RF-CH-049 — lectura acotada a la carrera del usuario', () => {
  const deOtraCarrera = repoActas({ porId: async () => acta({ carreraId: OTRA_CARRERA }) });

  it('porId de un acta de otra carrera es NoEncontrado, nunca AccesoDenegado', async () => {
    const casos = montar({ actas: deOtraCarrera, alcance: alcanceDeCarrera(CARRERA) });

    const fallo = await casos.porId(ACTOR, 'acta-1').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
  });

  it('porId de un acta que no existe es NoEncontrado', async () => {
    const casos = montar({ actas: repoActas({ porId: async () => null }) });

    await expect(casos.porId(ACTOR, 'acta-x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin carrera asignada, ni la propia acta se lee: NoEncontrado', async () => {
    const casos = montar({ alcance: alcanceDeCarrera(null) });

    await expect(casos.porId(ACTOR, 'acta-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('obtenerContenido de un acta de otra carrera es NoEncontrado y no lee sus acciones', async () => {
    let leyoAcciones = false;
    const actas = repoActas({
      porId: async () => acta({ carreraId: OTRA_CARRERA }),
      accionesDe: async () => {
        leyoAcciones = true;
        return [];
      },
    });
    const casos = montar({ actas, alcance: alcanceDeCarrera(CARRERA) });

    await expect(casos.obtenerContenido(ACTOR, 'acta-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(leyoAcciones).toBe(false);
  });

  it('el Consultor (lee todas) sí abre un acta de otra carrera', async () => {
    const casos = montar({ actas: deOtraCarrera, alcance: alcanceTotal });

    expect((await casos.porId(ACTOR, 'acta-1')).carreraId).toBe(OTRA_CARRERA);
  });

  it('sin actas.leer es 403 antes de mirar si el acta existe', async () => {
    const pedidos: string[] = [];
    let leyo = false;
    const actas = repoActas({
      porId: async () => {
        leyo = true;
        return null;
      },
    });
    const casos = montar({ actas, autorizacion: denegarSolo(pedidos, ['actas.leer']) });

    await expect(casos.porId(ACTOR, 'acta-x')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(leyo).toBe(false);
  });
});

describe('RF-CH-048 — el alta usa la carrera de la sesión', () => {
  it('sin carrera asignada: AccesoDenegado con el motivo, como en Mejora', async () => {
    const autorizacion: AuthorizationPort = {
      ...permitirTodo(),
      carreraACargoDe: async () => null,
    };
    const casos = montar({ autorizacion });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(
      new AccesoDenegado(
        'No tienes una carrera asignada: pide que te asignen una para crear actas de aprobación.',
      ),
    );
  });

  it('crea con la carrera de la sesión y pide actas.crear sobre ella, antes de validar nada más', async () => {
    const pedidos: string[] = [];
    const carreras: (string | null)[] = [];
    let recibida: string | undefined;
    const actas = repoActas({
      crear: async (datos) => {
        recibida = datos.carreraId;
        return acta({ ...datos });
      },
    });
    const casos = montar({ actas, autorizacion: denegarSolo(pedidos, [], carreras) });

    await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(recibida).toBe(CARRERA);
    expect(pedidos).toEqual(['actas.crear']);
    expect(carreras).toEqual([CARRERA]);
  });
});

const ESCRITURAS: readonly {
  nombre: string;
  permiso: string;
  llamar: (casos: GestionarActas) => Promise<unknown>;
}[] = [
  {
    nombre: 'editarCabecera',
    permiso: 'actas.editar',
    llamar: (c) => c.editarCabecera(ACTOR, 'acta-1', cabecera()),
  },
  {
    nombre: 'reemplazarAsistentes',
    permiso: 'actas.editar',
    llamar: (c) => c.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez']),
  },
  {
    nombre: 'cargarAccionesDelPeriodo',
    permiso: 'actas.editar',
    llamar: (c) => c.cargarAccionesDelPeriodo(ACTOR, 'acta-1'),
  },
  {
    nombre: 'actualizarSeleccionDeAcciones',
    permiso: 'actas.editar',
    llamar: (c) =>
      c.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [
        { planMejoraId: 'plan-1', incluida: false },
      ]),
  },
  {
    nombre: 'editarTextosInstitucionales',
    permiso: 'actas.editar',
    llamar: (c) => c.editarTextosInstitucionales(ACTOR, 'acta-1', { textoIntroduccion: 'Nuevo' }),
  },
  {
    nombre: 'transicionar (enviar-a-revision)',
    permiso: 'actas.editar',
    llamar: (c) => c.transicionar(ACTOR, 'acta-1', 'enviar-a-revision', {}),
  },
  {
    nombre: 'transicionar (aprobar)',
    permiso: 'actas.aprobar',
    llamar: (c) => c.transicionar(ACTOR, 'acta-1', 'aprobar', {}),
  },
  {
    nombre: 'eliminar',
    permiso: 'actas.eliminar',
    llamar: (c) => c.eliminar(ACTOR, 'acta-1'),
  },
];

describe.each(ESCRITURAS)('orden 403 → 404 → 403 → 409 en $nombre', ({ permiso, llamar }) => {
  it('(1) sin actas.leer es 403 y no toca el repositorio', async () => {
    const pedidos: string[] = [];
    let leyo = false;
    const actas = repoActas({
      porId: async () => {
        leyo = true;
        return acta();
      },
    });

    await expect(
      llamar(montar({ actas, autorizacion: denegarSolo(pedidos, ['actas.leer']) })),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['actas.leer']);
    expect(leyo).toBe(false);
  });

  it('(2) un acta de otra carrera es 404 aunque tenga el permiso de escritura, y ni se le pregunta', async () => {
    const pedidos: string[] = [];
    const actas = repoActas({ porId: async () => acta({ carreraId: OTRA_CARRERA }) });
    const casos = montar({
      actas,
      alcance: alcanceDeCarrera(CARRERA),
      autorizacion: denegarSolo(pedidos, []),
    });

    const fallo = await llamar(casos).catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['actas.leer']);
  });

  it('(2) un acta que no existe es 404', async () => {
    const casos = montar({ actas: repoActas({ porId: async () => null }) });

    await expect(llamar(casos)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('(3) un acta legible sin el permiso de escritura es 403, acotado a la carrera DEL ACTA', async () => {
    const pedidos: string[] = [];
    const carreras: (string | null)[] = [];
    const actas = repoActas({ porId: async () => acta({ carreraId: 'carrera-9' }) });
    const casos = montar({
      actas,
      alcance: alcanceTotal,
      autorizacion: denegarSolo(pedidos, [permiso], carreras),
    });

    await expect(llamar(casos)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pedidos).toEqual(['actas.leer', permiso]);
    expect(carreras).toEqual([null, 'carrera-9']);
  });

  it('(4) con todo concedido pero un acta Aprobada es 409', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });

    await expect(llamar(montar({ actas }))).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
  });
});

describe('editarTextosInstitucionales — la fusión de textos vive en el caso de uso', () => {
  it('completa con los textos actuales el que no viene', async () => {
    let recibido: { textoIntroduccion: string; textoAcuerdoCierre: string } | undefined;
    const actas = repoActas({
      porId: async () =>
        acta({ textoIntroduccion: 'Intro vigente', textoAcuerdoCierre: 'Cierre vigente' }),
      editarTextos: async (_id, datos) => {
        recibido = datos;
        return acta(datos);
      },
    });
    const casos = montar({ actas });

    await casos.editarTextosInstitucionales(ACTOR, 'acta-1', { textoIntroduccion: 'Intro nueva' });

    expect(recibido).toEqual({
      textoIntroduccion: 'Intro nueva',
      textoAcuerdoCierre: 'Cierre vigente',
    });
  });
});

describe('I1 — un plan de otra carrera vinculado al acta no se lee ni se congela', () => {
  const vinculo = (planMejoraId: string, orden: number): AccionActaDato => ({
    id: `aa-${orden}`,
    planMejoraId,
    aspecto: 'CRITERIO_ACREDITACION',
    incluida: true,
    porcentajeMedicionCompetencia: null,
    orden,
    codigoSnapshot: null,
    nombreSnapshot: null,
    plazoSnapshot: null,
    recursosSnapshot: null,
    metasSnapshot: null,
    responsableSnapshot: null,
    metaCompetenciaSnapshot: null,
  });
  const planes = () =>
    repoPlanesMejora({
      planesPorIds: async () => [
        planMejora({ id: 'plan-propio' }),
        planMejora({ id: 'plan-ajeno', carreraId: OTRA_CARRERA, nombre: 'Plan de otra carrera' }),
      ],
    });

  it('obtenerContenido en vivo omite la fila del plan ajeno', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [vinculo('plan-propio', 0), vinculo('plan-ajeno', 1)],
    });
    const casos = montar({ actas, planes: planes() });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones.map((a) => a.plan.id)).toEqual(['plan-propio']);
  });

  it('aprobar no congela el plan ajeno', async () => {
    let snapshots: readonly { accionActaId: string }[] | undefined;
    const actas = repoActas({
      porId: async () =>
        acta({
          estado: 'En revisión',
          convocadaPor: 'Directora de Escuela',
          fechaReunion: new Date('2026-03-09'),
          lugarReunion: 'Sala de reuniones',
          lugarEmision: 'Huancayo',
          fechaEmision: new Date('2026-03-20'),
          asistentes: [{ id: 'as-1', nombre: 'Ana Pérez' }],
        }),
      accionesDe: async () => [vinculo('plan-propio', 0), vinculo('plan-ajeno', 1)],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshots = opciones?.snapshots;
        return acta({ estado });
      },
    });
    const casos = montar({ actas, planes: planes() });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshots?.map((s) => s.accionActaId)).toEqual(['aa-0']);
  });
});
