/**
 * Pruebas del caso de uso que valida y orquesta la configuración de un plan
 * de evaluación: instrumento y frecuencia por competencia, asignaturas por
 * cruce competencia×periodo, porcentaje alcanzado y evidencias.
 *
 * Sigue el patrón de `gestionar-planes-evaluacion.spec.ts`: dobles de los
 * puertos, `permitirTodo()` / `denegarRegistrando()` para la autorización, y
 * un `montar()` que arma el caso de uso con esos dobles.
 *
 * El foco está en la frontera de estados —qué se congela al aprobar un plan
 * (la definición) y qué sigue registrándose después (el seguimiento)— porque
 * es la única decisión de este caso de uso que ninguna pieza suelta puede
 * tomar por él. Por eso `repoEvaluacion.porId` respeta el id que recibe en vez
 * de devolver siempre el mismo plan: la prueba de «evidencias de otro plan»
 * depende de que un id desconocido resuelva a `null`, como haría el
 * repositorio real.
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
import type { DirectorioDeUsuariosPort } from '../../../../auth/application/ports/directorio-usuarios.port.js';
import type {
  AsignaturaBase,
  ContenidoCurricularPort,
  PlanBase,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../ports/configuracion-evaluacion.port.js';
import type {
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';
import { ConfigurarPlanEvaluacion } from './configurar-plan-evaluacion.use-case.js';

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
 * negarlo. Ver el comentario de la misma función en
 * `gestionar-planes-evaluacion.spec.ts`: sin registrar el permiso, una prueba
 * «exige `evaluacion.editar`» quedaría en verde aunque el caso de uso pidiera
 * por error otro permiso.
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

function asignatura(sobre: Partial<AsignaturaBase> = {}): AsignaturaBase {
  return {
    id: 'a-1',
    codigo: 'ASUC001',
    nombre: 'Cálculo I',
    cicloNumero: 1,
    activa: true,
    ...sobre,
  };
}

function planBase(sobre: Partial<PlanBase> = {}): PlanBase {
  return {
    id: 'pe-1',
    codigo: 'PE-ISI-2026-v2',
    carreraId: 'carrera-propia',
    carreraNombre: 'Sistemas',
    version: 2,
    elegible: true,
    duracionAnios: 5,
    ...sobre,
  };
}

function contenido(sobre: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [],
    // Con `carreraId`, no `null`: desde 2c-C, guardar cualquier configuración
    // resuelve la carrera del plan base para acotar el permiso (`carreraDe`),
    // así que el doble por defecto tiene que devolver un plan real.
    planPorId: async () => planBase(),
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [asignatura()],
    ...sobre,
  };
}

/** Doble completo de `RepositorioPlanMedicionPort`: solo lo usan `porId` y `matriz`. */
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
    contenidoDe: async () => null,
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

/** Doble completo de `RepositorioPlanEvaluacionPort`: solo lo usa `porId`. */
function repoEvaluacion(
  sobre: Partial<RepositorioPlanEvaluacionPort> = {},
): RepositorioPlanEvaluacionPort {
  return {
    listar: async () => [],
    porId: async () => evaluacion(),
    vigenteDe: async () => null,
    codigosDe: async () => [],
    crear: async (d) => evaluacion({ planMedicionId: d.planMedicionId, codigo: d.codigo }),
    cambiarEstado: async (_id, estado) => evaluacion({ estado }),
    eliminar: async () => undefined,
    ...sobre,
  };
}

function repoConfiguracion(
  sobre: Partial<RepositorioConfiguracionEvaluacionPort> = {},
): RepositorioConfiguracionEvaluacionPort {
  return {
    del: async () => ({ competencias: [], mediciones: [] }),
    guardarCompetencia: async () => undefined,
    reemplazarAsignaturas: async () => undefined,
    guardarPorcentaje: async () => undefined,
    reemplazarEvidencias: async () => undefined,
    planDeAsignaturaEvaluada: async () => 'ev-1',
    ...sobre,
  };
}

function montar(
  opciones: {
    evaluacion?: DatosPlanEvaluacion;
    base?: DatosPlanMedicion;
    programadas?: readonly string[];
    asignaturas?: AsignaturaBase[];
    competenciasDelPlan?: readonly string[];
    planDeAsignaturaEvaluada?: string | null;
    contenido?: Partial<ContenidoCurricularPort>;
    autorizacion?: AuthorizationPort;
    registrarRolPedido?: (rol: string) => void;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const publicador: PublicadorDeEventos = {
    publicar: async (e) => {
      publicados.push(...e);
    },
  };

  const guardado: {
    competencia?: { instrumento: string | null; frecuencia: string | null };
    asignaturas?: readonly { asignaturaId: string; entregable: string; docenteId: string | null }[];
    porcentaje?: number | null;
    evidencias?: readonly { enlace: string; descripcion: string }[];
  } = {};

  const evaluacionActual = opciones.evaluacion ?? evaluacion();

  const celdas = (opciones.programadas ?? ['c-1|p-1']).map((clave) => {
    const [competenciaId = '', periodoId = ''] = clave.split('|');
    return { competenciaId, periodoId, realizada: false, realizadaEn: null };
  });

  const baseActual =
    opciones.base ?? planMedicion({ competenciaIds: opciones.competenciasDelPlan ?? ['c-1'] });

  const evaluaciones = repoEvaluacion({
    // Respeta el id pedido, como el repositorio real: un id que no es el del
    // plan montado no debe resolver al plan montado.
    porId: async (id) => (id === evaluacionActual.id ? evaluacionActual : null),
  });

  const mediciones = repoMedicion({
    porId: async () => baseActual,
    matriz: async () => celdas,
  });

  const curricular = contenido({
    asignaturasDelPlan: async () => opciones.asignaturas ?? [asignatura()],
    ...opciones.contenido,
  });

  const directorio: DirectorioDeUsuariosPort = {
    nombresDe: async () => new Map(),
    porRol: async (rol) => {
      opciones.registrarRolPedido?.(rol);
      return [{ id: 'doc-1', nombre: 'Docente Uno' }];
    },
  };

  const configuracion = repoConfiguracion({
    guardarCompetencia: async (datos) => {
      guardado.competencia = { instrumento: datos.instrumento, frecuencia: datos.frecuencia };
    },
    reemplazarAsignaturas: async (_planEvaluacionId, _competenciaId, _periodoId, asignaturas) => {
      guardado.asignaturas = asignaturas;
    },
    guardarPorcentaje: async (_planEvaluacionId, _competenciaId, _periodoId, porcentaje) => {
      guardado.porcentaje = porcentaje;
    },
    reemplazarEvidencias: async (_asignaturaEvaluadaId, evidencias) => {
      guardado.evidencias = evidencias;
    },
    planDeAsignaturaEvaluada: async () =>
      opciones.planDeAsignaturaEvaluada === undefined
        ? evaluacionActual.id
        : opciones.planDeAsignaturaEvaluada,
  });

  const caso = new ConfigurarPlanEvaluacion(
    evaluaciones,
    mediciones,
    curricular,
    configuracion,
    directorio,
    opciones.autorizacion ?? permitirTodo(),
    publicador,
  );

  return { caso, publicados, guardado };
}

describe('RF-PE-012 — solo donde la matriz base programó', () => {
  it('rechaza configurar un cruce que no está programado', async () => {
    // Sin esto, el plan de evaluación podría registrar medición donde el plan
    // de medición nunca dijo que se mediría.
    const { caso } = montar({ programadas: ['c-1|p-1'] });

    await expect(
      caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-2', [
        { asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null },
      ]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('acepta el que sí lo está', async () => {
    const { caso, guardado } = montar({ programadas: ['c-1|p-1'] });

    await caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', [
      { asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null },
    ]);

    expect(guardado.asignaturas).toHaveLength(1);
  });

  it('rechaza también el porcentaje de un cruce sin programar, nombrando los dos', async () => {
    // El repositorio guarda el porcentaje con `upsert`, así que un cruce
    // inventado no falla: **crea la fila**. Un porcentaje alcanzado colgado de
    // una competencia que el plan base no declara y de un periodo que no
    // existe no es un dato incompleto, es uno que ningún reporte podrá
    // cuadrar. §8 del diseño pide 409 «nombrando la competencia y el
    // periodo», y `ReglaDeNegocioViolada` es 409 en el filtro de errores.
    const { caso, guardado } = montar({ programadas: ['c-1|p-1'] });

    await expect(caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-2', 80)).rejects.toThrow(
      /no programó la competencia c-1 en el periodo p-2/,
    );
    expect(guardado.porcentaje).toBeUndefined();
  });

  it('y acepta el porcentaje del cruce que sí lo está', async () => {
    const { caso, guardado } = montar({ programadas: ['c-1|p-1'] });

    await caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 80);

    expect(guardado.porcentaje).toBe(80);
  });
});

describe('RF-PE-016 — solo asignaturas del plan de estudios base', () => {
  it('rechaza una asignatura ajena, nombrándola', async () => {
    const { caso } = montar({ asignaturas: [asignatura({ id: 'a-1', codigo: 'ASUC001' })] });

    await expect(
      caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', [
        { asignaturaId: 'a-ajena', entregable: 'Proyecto', docenteId: null },
      ]),
    ).rejects.toThrow(/a-ajena/);
  });
});

describe('RF-PE-013 — la competencia tiene que estar declarada', () => {
  it('rechaza configurar una competencia que el plan base no mide', async () => {
    const { caso } = montar({ competenciasDelPlan: ['c-1'] });

    await expect(
      caso.guardarCompetencia(ACTOR, 'ev-1', 'c-ajena', {
        instrumento: 'Rúbrica',
        frecuencia: 'Semestral',
      }),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF-PE-006 y RF-PE-007 — la frontera de estados', () => {
  it('la definición solo se toca en Borrador', async () => {
    for (const estado of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
      const { caso } = montar({ evaluacion: evaluacion({ estado }) });

      await expect(
        caso.guardarCompetencia(ACTOR, 'ev-1', 'c-1', { instrumento: 'R', frecuencia: 'S' }),
      ).rejects.toThrow(ReglaDeNegocioViolada);
      await expect(caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', [])).rejects.toThrow(
        ReglaDeNegocioViolada,
      );
    }
  });

  it('el porcentaje se registra en Borrador y en Vigente', async () => {
    // RF-PE-006 RN2: el registro progresivo de mediciones es la excepción. Sin
    // ella, el porcentaje alcanzado de 2026-I no podría registrarse nunca,
    // porque no se conoce mientras el plan sigue en Borrador.
    for (const estado of ['Borrador', 'Vigente'] as const) {
      const { caso, guardado } = montar({ evaluacion: evaluacion({ estado }) });

      await caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 80);

      expect(guardado.porcentaje).toBe(80);
    }
  });

  it('pero no en Aprobado ni en Histórico', async () => {
    // RN2 nombra solo Vigente. Un plan Aprobado todavía no rige: registrar en
    // él lo ocurrido sería seguimiento de un plan que no ha entrado en vigor.
    for (const estado of ['Aprobado', 'Histórico', 'En revisión'] as const) {
      const { caso } = montar({ evaluacion: evaluacion({ estado }) });

      await expect(caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 80)).rejects.toThrow(
        ReglaDeNegocioViolada,
      );
    }
  });

  it('las evidencias siguen la misma regla que el porcentaje', async () => {
    const { caso, guardado } = montar({ evaluacion: evaluacion({ estado: 'Vigente' }) });

    await caso.guardarEvidencias(ACTOR, 'ae-1', [{ enlace: 'https://x', descripcion: 'Rúbrica' }]);

    expect(guardado.evidencias).toHaveLength(1);
  });
});

describe('el plan de unas evidencias sale de la asignatura evaluada', () => {
  it('si de ahí no sale ningún plan, no se escribe nada', async () => {
    // Lo que esta resolución cierra es que la frontera de estados se aplique
    // al plan que de verdad contiene la asignatura evaluada: no hay
    // `planEvaluacionId` en la ruta que pueda contradecirla, así que nadie
    // escribe sobre una asignatura de un plan Histórico apoyándose en un
    // Borrador propio.
    //
    // El alcance por carrera es una decisión aparte —y ya está cerrada, ver
    // el describe «el alcance por carrera (2c-C)» más abajo—: aquí no hay
    // ninguna carrera que resolver, porque `configuraciones.planDeAsignaturaEvaluada`
    // no encuentra ningún plan del que colgar una.
    const { caso, guardado } = montar({ planDeAsignaturaEvaluada: 'ev-OTRO' });

    await expect(
      caso.guardarEvidencias(ACTOR, 'ae-1', [{ enlace: 'https://x', descripcion: 'R' }]),
    ).rejects.toThrow(NoEncontrado);
    expect(guardado.evidencias).toBeUndefined();
  });
});

describe('permisos y bitácora', () => {
  it('escribir exige `evaluacion.editar`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(
      caso.guardarCompetencia(ACTOR, 'ev-1', 'c-1', { instrumento: 'R', frecuencia: 'S' }),
    ).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.editar']);
  });

  it('leer exige `evaluacion.leer`', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(caso.configuracion(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toEqual(['evaluacion.leer']);
  });

  /**
   * Los cuatro guardados, uno por uno.
   *
   * Antes solo estaba el del porcentaje, y quitar las otras tres llamadas a
   * `dejarConstancia` dejaba la suite entera en verde. CLAUDE.md §2 llama a la
   * auditoría «no opcional» y §6.6 exige el evento «emitido **y cubierto por
   * una prueba»**: cubierto quiere decir uno por guardado, porque una sola
   * prueba no puede caerse por tres motivos distintos.
   *
   * Cada una afirma también el `detalle`, no solo que se publicó algo: una
   * bitácora que registra cuatro cambios indistinguibles no sirve para
   * reconstruir qué pasó, que es para lo que existe.
   */
  it('guardar instrumento y frecuencia deja constancia', async () => {
    const { caso, publicados } = montar();

    await caso.guardarCompetencia(ACTOR, 'ev-1', 'c-1', {
      instrumento: 'Rúbrica',
      frecuencia: 'Semestral',
    });

    expect(publicados[0]?.nombre).toBe('evaluacion.configurada');
    expect(publicados[0]?.detalle).toMatch(/instrumento y frecuencia/i);
  });

  it('guardar las asignaturas de un cruce deja constancia', async () => {
    const { caso, publicados } = montar();

    await caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', [
      { asignaturaId: 'a-1', entregable: 'Proyecto', docenteId: null },
    ]);

    expect(publicados[0]?.nombre).toBe('evaluacion.configurada');
    expect(publicados[0]?.detalle).toMatch(/asignaturas/i);
  });

  it('guardar el porcentaje deja constancia', async () => {
    const { caso, publicados } = montar();

    await caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 80);

    expect(publicados[0]?.nombre).toBe('evaluacion.configurada');
    expect(publicados[0]?.detalle).toMatch(/porcentaje/i);
  });

  it('guardar las evidencias deja constancia', async () => {
    const { caso, publicados } = montar();

    await caso.guardarEvidencias(ACTOR, 'ae-1', [
      { enlace: 'https://x', descripcion: 'Rúbrica firmada' },
    ]);

    expect(publicados[0]?.nombre).toBe('evaluacion.configurada');
    expect(publicados[0]?.detalle).toMatch(/evidencias/i);
  });
});

describe('los catálogos', () => {
  it('las asignaturas elegibles salen del plan de estudios de la base', async () => {
    const { caso } = montar({ asignaturas: [asignatura({ codigo: 'ASUC001' })] });

    expect((await caso.asignaturasElegibles(ACTOR, 'ev-1')).map((a) => a.codigo)).toEqual([
      'ASUC001',
    ]);
  });

  it('los docentes son los usuarios con rol DOCENTE', async () => {
    const pedidos: string[] = [];
    const { caso } = montar({ registrarRolPedido: (r) => pedidos.push(r) });

    await caso.docentes(ACTOR);

    expect(pedidos).toEqual(['DOCENTE']);
  });
});

/**
 * El alcance por carrera (2c-C): `mejora-continua` no comprobaba la carrera en
 * ninguno de sus casos de uso, así que alguien con permiso de edición en una
 * carrera podía escribir en el plan de otra. Estas pruebas cierran justo eso,
 * y por la propiedad de `puede()` que lo hace seguro —un permiso acotado con
 * `carreraId === null` se deniega— cualquiera de los cuatro guardados que
 * llegara a pedir el permiso sin la carrera resuelta caería aquí.
 */
describe('el alcance por carrera (2c-C)', () => {
  it('un editor de otra carrera no puede tocar la configuración', async () => {
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
      caso.guardarCompetencia(ACTOR, 'ev-1', 'c-1', { instrumento: 'Rúbrica', frecuencia: null }),
    ).rejects.toThrow(AccesoDenegado);

    // Y la carrera que se pasó es la del plan, no una inventada.
    expect(puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.editar', 'carrera-ajena');
  });

  /**
   * Los cuatro guardados, uno por uno: la propiedad que se comprueba es la
   * misma en los cuatro —que la carrera que llega a `puede()` es la del plan
   * sobre el que se opera, y no `null`— y una tabla evita que una prueba que
   * solo cubre `guardarCompetencia` deje a las otras tres sin cubrir.
   */
  it.each([
    [
      'guardarCompetencia',
      (caso: ConfigurarPlanEvaluacion) =>
        caso.guardarCompetencia(ACTOR, 'ev-1', 'c-1', { instrumento: 'R', frecuencia: null }),
    ],
    [
      'guardarAsignaturas',
      (caso: ConfigurarPlanEvaluacion) => caso.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', []),
    ],
    [
      'guardarPorcentaje',
      (caso: ConfigurarPlanEvaluacion) => caso.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 50),
    ],
    [
      'guardarEvidencias',
      (caso: ConfigurarPlanEvaluacion) => caso.guardarEvidencias(ACTOR, 'ae-1', []),
    ],
  ] as const)('%s pasa la carrera del plan, no null', async (_nombre, ejecutar) => {
    const puede = vi.fn(async () => ({ permitido: true }) as const);
    const { caso } = montar({
      contenido: { planPorId: async () => planBase({ carreraId: 'carrera-ajena' }) },
      autorizacion: { puede, permisosDe: async () => new Set(), carreraACargoDe: async () => null },
    });

    // No importa si la operación en sí falla más adelante (p. ej. porque el
    // cruce no está programado): lo único que esta prueba vigila es con qué
    // carrera se llamó a `puede`.
    await ejecutar(caso).catch(() => undefined);

    expect(puede).toHaveBeenCalledWith(ACTOR.id, expect.any(String), 'carrera-ajena');
  });
});

describe('NoEncontrado', () => {
  it('un plan de evaluación inexistente es 404', async () => {
    const { caso } = montar();

    await expect(
      caso.guardarCompetencia(ACTOR, 'ev-desconocido', 'c-1', {
        instrumento: 'R',
        frecuencia: 'S',
      }),
    ).rejects.toThrow(NoEncontrado);
  });
});
