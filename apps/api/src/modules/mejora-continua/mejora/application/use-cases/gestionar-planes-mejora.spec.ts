/**
 * Pruebas del alta, la definición, el borrado, las transiciones y el
 * seguimiento (implementación, evidencias, retroalimentación) del plan de
 * mejora, más los tres aspectos de 2c-J-B (RF-PJ-020 a RF-PJ-031).
 *
 * Sigue el patrón de `gestionar-planes-evaluacion.spec.ts`: dobles de los
 * puertos, `permitirTodo()` / `denegarRegistrando()` para la autorización, y
 * un `montar()` que arma el caso de uso con esos dobles. El núcleo de la
 * suite de 2c-J-A es la matriz de estados de §2b del diseño: los campos de
 * seguimiento se editan en Borrador y Vigente, y se bloquean en los otros
 * tres estados documentales. El núcleo de 2c-J-B es la resolución real de
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
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  AcreditacionPort,
  DatosCriterioMejora,
  DatosObjetivoMejora,
} from '../../../../plan-estudios/application/ports/acreditacion-cross-modulo.port.js';
import type { ContenidoCurricularPort, PlanBase } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
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
    nombre: '',
    causaRaiz: '',
    justificacion: '',
    input: null,
    plazo: new Date('2026-12-31'),
    recursos: '',
    metas: '',
    responsable: '',
    logroMeta: null,
    impacto: null,
    creadoEn: new Date('2026-03-01'),
    evidencias: [],
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
    eliminar: async () => undefined,
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
    objetivosEducacionales: async () => [objetivoMejora()],
    objetivoPorId: async () => objetivoMejora(),
    ...sobre,
  };
}

function planEvaluacion(sobre: Partial<DatosPlanEvaluacion> = {}): DatosPlanEvaluacion {
  return {
    id: 'pe-1',
    planMedicionId: 'pm-1',
    codigo: 'EVD-1',
    version: 1,
    estado: 'Vigente',
    creadoEn: new Date('2026-01-01'),
    actualizadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function planMedicion(sobre: Partial<DatosPlanMedicion> = {}): DatosPlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'plan-1',
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
    eliminar: async () => undefined,
    ...sobre,
  };
}

function medicionesDouble(sobre: Partial<RepositorioPlanMedicionPort> = {}): RepositorioPlanMedicionPort {
  const noUsado = (metodo: string) => async () => {
    throw new Error(`${metodo} no se usa en este spec.`);
  };
  return {
    listar: async () => [],
    porId: async () => planMedicion(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: noUsado('crear') as never,
    actualizar: noUsado('actualizar') as never,
    cambiarEstado: noUsado('cambiarEstado') as never,
    contenidoDe: async () => null,
    copiar: noUsado('copiar') as never,
    linajeDe: async () => [],
    marcarVigenteRelevando: noUsado('marcarVigenteRelevando') as never,
    eliminar: async () => undefined,
    declararCompetencias: noUsado('declararCompetencias') as never,
    declararPeriodos: noUsado('declararPeriodos') as never,
    matriz: async () => [],
    programar: noUsado('programar') as never,
    marcarRealizada: noUsado('marcarRealizada') as never,
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
    guardarCompetencia: noUsado('guardarCompetencia') as never,
    reemplazarAsignaturas: noUsado('reemplazarAsignaturas') as never,
    guardarPorcentaje: noUsado('guardarPorcentaje') as never,
    reemplazarEvidencias: noUsado('reemplazarEvidencias') as never,
    planDeAsignaturaEvaluada: async () => null,
    reemplazarIndicaciones: noUsado('reemplazarIndicaciones') as never,
    guardarResultados: noUsado('guardarResultados') as never,
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
    ...sobre,
  };
}

function montar(
  opciones: {
    plan?: DatosPlanMejora;
    autorizacion?: AuthorizationPort;
    planes?: Partial<RepositorioPlanMejoraPort>;
    acreditacion?: Partial<AcreditacionPort>;
    evaluaciones?: Partial<RepositorioPlanEvaluacionPort>;
    mediciones?: Partial<RepositorioPlanMedicionPort>;
    configuraciones?: Partial<RepositorioConfiguracionEvaluacionPort>;
    curricular?: Partial<ContenidoCurricularPort>;
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
    evaluacionesDouble(opciones.evaluaciones),
    medicionesDouble(opciones.mediciones),
    configuracionesDouble(opciones.configuraciones),
    curricularDouble(opciones.curricular),
    opciones.autorizacion ?? permitirTodo(),
    publicador,
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
      autorizacion: { puede: async () => ({ permitido: true }), permisosDe: async () => new Set(), carreraACargoDe: async () => null },
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
      acreditacion: { criteriosActivosDe: async () => [criterioMejora({ id: 'cri-1', codigo: 'C-01' })] },
      planes: { codigosDe: async () => [], parametros: async () => parametros({ minimoAccionesCriterio: 2 }) },
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
      planes: { codigosDe: async () => ['PJ-CRI-1'], parametros: async () => parametros({ minimoAccionesCriterio: 1 }) },
    });

    expect(await caso.alertasMinimoCriterio(ACTOR, CARRERA)).toEqual([]);
  });
});

describe('RF-PJ-023 a RF-PJ-025 — el aspecto Objetivo educacional', () => {
  it('rechaza un objetivo que no existe', async () => {
    const { caso } = montar({ acreditacion: { objetivoPorId: async () => null } });

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
      acreditacion: { objetivosEducacionales: async () => [objetivoMejora({ id: 'obj-1', codigo: 'OE-01' })] },
      planes: { codigosDe: async () => [], parametros: async () => parametros({ minimoAccionesObjetivo: 3 }) },
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
    const { caso } = montar({ mediciones: { porId: async () => planMedicion({ tipo: 'INDIRECTA' }) } });

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
    const { caso } = montar({ evaluaciones: { porId: async () => planEvaluacion({ estado: 'Borrador' }) } });

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
    const { caso } = montar({ curricular: { planPorId: async () => planBase({ carreraId: 'otra-carrera' }) } });

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
    const { caso } = montar({ mediciones: { porId: async () => planMedicion({ competenciaIds: ['otra-competencia'] }) } });

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

      const resultado = await caso.porcentajeAnteriorDeCompetencia(ACTOR, 'pe-1', 'comp-1', 'per-1');

      expect(resultado).toBeNull();
    });

    it('null si el periodo anterior no tiene medición registrada', async () => {
      const { caso } = montar({
        configuraciones: { del: async () => configuracionDelPlan({ mediciones: [] }) },
      });

      const resultado = await caso.porcentajeAnteriorDeCompetencia(ACTOR, 'pe-1', 'comp-1', 'per-2');

      expect(resultado).toBeNull();
    });

    it('devuelve el porcentaje del periodo inmediatamente anterior', async () => {
      const { caso } = montar({
        configuraciones: {
          del: async () =>
            configuracionDelPlan({
              mediciones: [
                { competenciaId: 'comp-1', periodoId: 'per-1', porcentajeAlcanzado: 0.65, asignaturas: [] },
              ],
            }),
        },
      });

      const resultado = await caso.porcentajeAnteriorDeCompetencia(ACTOR, 'pe-1', 'comp-1', 'per-2');

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

  it.each(['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const)(
    'se bloquea en %s',
    async (estado) => {
      const { caso } = montar({ plan: plan({ estado }) });

      await expect(caso.editarDefinicion(ACTOR, 'pj-1', DATOS)).rejects.toThrow(
        ReglaDeNegocioViolada,
      );
    },
  );

  it('exige `mejora.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.editarDefinicion(ACTOR, 'pj-1', DATOS)).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.editar']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar();

    await caso.editarDefinicion(ACTOR, 'pj-1', DATOS);

    expect(publicados[0]?.nombre).toBe('mejora.definicion_editada');
  });
});

describe('RF-PJ-008 — el borrado', () => {
  it('solo en Borrador', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Vigente' }) });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige `mejora.eliminar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.eliminar(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.eliminar']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar();

    await caso.eliminar(ACTOR, 'pj-1');

    expect(publicados[0]?.nombre).toBe('mejora.eliminado');
  });
});

describe('RF-PJ-004 y RF-PJ-005 — las transiciones', () => {
  it('reusa la máquina de estados documental compartida', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Borrador' }) });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
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
      },
    });

    await caso.transicionar(ACTOR, 'pj-1', 'aprobar', {});

    expect(pedidos).toEqual(['mejora.aprobar']);
  });

  it('RF-PJ-042 no existe todavía: la transición nunca exige estar sin bloqueos', async () => {
    // Placeholder explícito, mismo movimiento que RF-PE-041/2c-D: hoy no hay
    // ningún dato que exija bloquear la transición por completitud.
    const { caso } = montar({ plan: plan({ estado: 'Borrador' }) });

    const resultado = await caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it('deja constancia del antes y el después', async () => {
    const { caso, publicados } = montar({ plan: plan({ estado: 'Borrador' }) });

    await caso.transicionar(ACTOR, 'pj-1', 'enviar-a-revision', {});

    expect(publicados[0]?.nombre).toBe('mejora.transicionado');
    expect(publicados[0]?.detalle).toContain('Borrador → En revisión');
  });
});

/**
 * §2b del diseño de 2c-J-A: la matriz de estados del seguimiento. Se recorre
 * una sola vez con `it.each` y se reutiliza para las cuatro operaciones de
 * seguimiento, porque la propiedad que se comprueba es la misma en las
 * cuatro: el guardián `permiteActualizarSeguimiento`.
 */
const MATRIZ_SEGUIMIENTO: readonly [EstadoMedicion, boolean][] = [
  ['Borrador', true],
  ['En revisión', false],
  ['Aprobado', false],
  ['Vigente', true],
  ['Histórico', false],
];

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
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.actualizarImplementacion(ACTOR, 'pj-1', 'En proceso')).rejects.toThrow(
      AccesoDenegado,
    );
    expect(pedidos).toEqual(['mejora.editar']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar();

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

  it('RF-PJ-017: eliminar en Histórico lleva el mensaje específico del requisito', async () => {
    const { caso } = montar({ plan: plan({ estado: 'Histórico' }) });

    await expect(caso.eliminarEvidencia(ACTOR, 'evi-1')).rejects.toThrow(/Histórico/);
  });

  it('una evidencia sin plan es 404', async () => {
    const { caso } = montar({ planes: { planDeEvidencia: async () => null } });

    await expect(caso.eliminarEvidencia(ACTOR, 'evi-inexistente')).rejects.toThrow(NoEncontrado);
  });

  it('cargar exige `mejora.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(
      caso.cargarEvidencia(ACTOR, 'pj-1', {
        referencia: 'https://drive.example/x.pdf',
        nombreArchivo: null,
        subidoPor: ACTOR.id,
      }),
    ).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.editar']);
  });

  it('cargar deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar({
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
    const { caso, publicados } = montar();

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
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(
      caso.actualizarRetroalimentacion(ACTOR, 'pj-1', 'logro', 'impacto'),
    ).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['mejora.editar']);
  });

  it('deja constancia en la bitácora', async () => {
    const { caso, publicados } = montar();

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
