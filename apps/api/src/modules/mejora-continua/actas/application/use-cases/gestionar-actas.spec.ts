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
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  CarreraBase,
  ContenidoCurricularPort,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { DatosActa, RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';
import { GestionarActas } from './gestionar-actas.use-case.js';
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
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
    textoIntroduccion: 'Se deja constancia de la revisión y deliberación de las siguientes acciones.',
    textoAcuerdoCierre: 'Se aprueban las acciones de mejora del programa para el periodo 2025-10.',
    convocadaPor: '',
    fechaReunion: new Date(0),
    lugarReunion: '',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    estado: 'Borrador',
    creadoEn: new Date('2026-03-01'),
    asistentes: [],
    ...sobre,
  };
}

function repoActas(overrides: Partial<RepositorioActaAprobacionPort> = {}): RepositorioActaAprobacionPort {
  return {
    crear: async () => acta(),
    porId: async () => acta(),
    editarCabecera: async () => acta(),
    reemplazarAsistentes: async () => acta(),
    eliminar: async () => {},
    correlativosDe: async () => [],
    accionesDe: async () => [],
    agregarAcciones: async () => {},
    actualizarSeleccion: async () => {},
    editarTextos: async (_id, datos) => acta(datos),
    planesYaEmitidos: async () => new Set(),
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
    logroMeta: null,
    impacto: null,
    creadoEn: new Date('2026-01-01'),
    evidencias: [],
    version: 1,
    derivadoDeId: null,
    ...sobre,
  };
}

function repoPlanesMejora(sobre: Partial<RepositorioPlanMejoraPort> = {}): RepositorioPlanMejoraPort {
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
    listarDeCarrera: async () => [],
    planesPorIds: async () => [],
    ...sobre,
  };
}

function repoEvaluaciones(sobre: Partial<RepositorioPlanEvaluacionPort> = {}): RepositorioPlanEvaluacionPort {
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

function repoMediciones(sobre: Partial<RepositorioPlanMedicionPort> = {}): RepositorioPlanMedicionPort {
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

function montar(opciones: {
  actas?: RepositorioActaAprobacionPort;
  planes?: RepositorioPlanMejoraPort;
  evaluaciones?: RepositorioPlanEvaluacionPort;
  mediciones?: RepositorioPlanMedicionPort;
  configuraciones?: RepositorioConfiguracionEvaluacionPort;
  curricular?: ContenidoCurricularPort;
  autorizacion?: AuthorizationPort;
  eventos?: PublicadorDeEventos;
} = {}): GestionarActas {
  return new GestionarActas(
    opciones.actas ?? repoActas(),
    opciones.planes ?? repoPlanesMejora(),
    opciones.evaluaciones ?? repoEvaluaciones(),
    opciones.mediciones ?? repoMediciones(),
    opciones.configuraciones ?? repoConfiguraciones(),
    opciones.curricular ?? curricular(),
    opciones.autorizacion ?? permitirTodo(),
    opciones.eventos ?? { publicar: async () => {} },
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
    };
    const casos = montar({ autorizacion });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(AccesoDenegado);
  });

  it('exige actas.crear acotado a la carrera del actor', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(AccesoDenegado);
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
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

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
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.eliminar');
  });

  it('publica ActaEliminada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador, actas: repoActas({ porId: async () => acta({ estado: 'Borrador' }) }) });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.eliminada']);
  });
});

describe('cargarAccionesDelPeriodo', () => {
  it('carga candidatas Aprobado/Vigente de Criterio y Objetivo sin filtrar por periodo', async () => {
    const filtrosRecibidos: unknown[] = [];
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) => {
        filtrosRecibidos.push(filtro);
        if (filtro?.aspecto === 'CRITERIO_ACREDITACION') return [planMejora({ id: 'plan-crit' })];
        if (filtro?.aspecto === 'OBJETIVO_EDUCACIONAL') {
          return [planMejora({ id: 'plan-obj', aspecto: 'OBJETIVO_EDUCACIONAL', criterioAcreditacionId: null, objetivoEducacionalId: 'obj-1' })];
        }
        return [];
      },
    });
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }) });
    const casos = montar({ actas, planes });

    const cantidad = await casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1');

    expect(cantidad).toBe(2);
    expect(filtrosRecibidos).toEqual([
      { aspecto: 'CRITERIO_ACREDITACION', estado: ['Aprobado', 'Vigente'] },
      { aspecto: 'OBJETIVO_EDUCACIONAL', estado: ['Aprobado', 'Vigente'] },
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
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador', periodoMedicionId: null }) });
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
    const evaluaciones = repoEvaluaciones({ porId: async () => ({ id: 'eval-1', planMedicionId: 'medicion-1' }) as never });
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
        mediciones: [{ competenciaId: 'comp-1', periodoId: 'periodo-1', porcentajeAlcanzado: 65, asignaturas: [] }],
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

    expect(agregadas).toEqual([{ planMejoraId: 'plan-comp', aspecto: 'COMPETENCIA', porcentajeMedicionCompetencia: 65, orden: 0 }]);
  });

  it('excluye candidatas ya vinculadas o ya emitidas', async () => {
    const planes = repoPlanesMejora({
      listarDeCarrera: async (_carreraId, filtro) =>
        filtro?.aspecto === 'CRITERIO_ACREDITACION'
          ? [planMejora({ id: 'ya-vinculado' }), planMejora({ id: 'ya-emitido' }), planMejora({ id: 'nuevo' })]
          : [],
    });
    let agregadas: { planMejoraId: string }[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'ya-vinculado', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
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

    await expect(casos.cargarAccionesDelPeriodo(ACTOR, 'acta-1')).rejects.toThrow(ReglaDeNegocioViolada);
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
        { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
      ],
      actualizarSeleccion: async (_id, cambios) => {
        recibido = cambios;
      },
    });
    const casos = montar({ actas });

    await casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'plan-1', incluida: false }]);

    expect(recibido).toEqual([{ planMejoraId: 'plan-1', incluida: false }]);
  });

  it('rechaza togglear un planMejoraId sin AccionActa previa', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [],
    });
    const casos = montar({ actas });

    await expect(
      casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'sin-cargar', incluida: true }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });
    const casos = montar({ actas });

    await expect(
      casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'plan-1', incluida: true }]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('publica ActaSeleccionDeAccionesActualizada', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
      ],
    });
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ actas, eventos: publicador });

    await casos.actualizarSeleccionDeAcciones(ACTOR, 'acta-1', [{ planMejoraId: 'plan-1', incluida: false }]);

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
        { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0 },
      ],
    });
    const planes = repoPlanesMejora({ planesPorIds: async () => [planMejora({ id: 'plan-1', nombre: 'Reforzar bibliografía' })] });
    const casos = montar({ actas, planes });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toHaveLength(1);
    expect(contenido.acciones[0]?.incluida).toBe(true);
    expect(contenido.acciones[0]?.plan.nombre).toBe('Reforzar bibliografía');
  });

  it('acta sin acciones cargadas devuelve la lista vacía', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Borrador' }), accionesDe: async () => [] });
    const casos = montar({ actas });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toEqual([]);
  });
});
