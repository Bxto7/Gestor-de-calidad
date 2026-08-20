/**
 * Pruebas del caso de uso de cambio de estado.
 *
 * A diferencia de las del dominio, aquí lo que se verifica es la **orquestación**:
 * que se autorice antes de validar, que el archivado de la versión anterior y el
 * alta de la nueva vayan al repositorio en una sola llamada, y que los eventos se
 * publiquen después de persistir y no antes.
 *
 * Los dobles son manuales y no `vi.mock`: los puertos son interfaces pequeñas y
 * una implementación en memoria se lee mejor que una cadena de mocks, además de
 * permitir aserciones sobre el orden en que se llamó a cada cosa.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { Decision } from '../../../auth/domain/services/politica-de-autorizacion.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type {
  AsignaturaDelPlan,
  DatosCarrera,
  RepositorioAprobacionesPort,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';
import { CambiarEstadoPlan } from './cambiar-estado-plan.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Director de carrera' };
const ISI = 'car-isi';

/** Registra el orden de las llamadas, para poder afirmar sobre la secuencia. */
let traza: string[] = [];

function plan(estado: Parameters<typeof PlanDeEstudios.desde>[0]['estado'], id = 'plan-1') {
  return PlanDeEstudios.desde({
    id,
    carreraId: ISI,
    codigo: `PE-ISI-2026-v${id.slice(-1)}`,
    version: 1,
    estado,
    duracionAnios: 2,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function asignatura(sobre: Partial<AsignaturaDelPlan> = {}): AsignaturaDelPlan {
  return {
    id: 'a-1',
    codigo: 'ISI-101',
    nombre: 'Matemática',
    creditos: 4,
    competenciaIds: ['cpe-1'],
    cicloNumero: 1,
    activa: true,
    ...sobre,
  };
}

/** Plan sin inconsistencias: una asignatura por ciclo, con competencia. */
function contenidoSano(): RepositorioContenidoPort {
  const carrera: DatosCarrera = { id: ISI, codigo: 'ISI', duracionAnios: 2 };
  return {
    carreraDe: async () => carrera,
    carreraPorId: async () => carrera,
    asignaturasDe: async () => {
      traza.push('validar');
      return [1, 2, 3, 4].map((c) =>
        asignatura({ id: `a-${c}`, codigo: `ISI-10${c}`, nombre: `Curso ${c}`, cicloNumero: c }),
      );
    },
    objetivoIdsDe: async () => ['oe-1'],
    reglasJustificadasDe: async () => [],
  };
}

function autorizacion(decision: Decision): AuthorizationPort {
  return {
    puede: async () => {
      traza.push('autorizar');
      return decision;
    },
    permisosDe: async () => new Set<string>(),
    carreraACargoDe: async () => ISI,
  };
}

const PERMITE: Decision = { permitido: true };
const DENIEGA: Decision = { permitido: false, motivo: 'no dirige la carrera' };

function montar(opciones: {
  plan: PlanDeEstudios | null;
  vigenteAnterior?: PlanDeEstudios | null;
  decision?: Decision;
  contenido?: RepositorioContenidoPort;
}) {
  const guardados: PlanDeEstudios[][] = [];
  const aprobacionesRegistradas: { accion: string; comentario: string | null }[] = [];
  const publicados: DomainEvent[] = [];

  const planes: RepositorioPlanPort = {
    porId: async () => opciones.plan,
    vigenteDeCarrera: async () => opciones.vigenteAnterior ?? null,
    enCursoDeCarrera: async () => null,
    ultimaVersionDeCarrera: async () => 1,
    guardar: async (p) => {
      traza.push('guardar');
      guardados.push([...p]);
    },
    eliminar: async () => {},
    copiarContenido: async () => {},
  };

  const aprobaciones: RepositorioAprobacionesPort = {
    registrar: async (e) => {
      aprobacionesRegistradas.push({ accion: e.accion, comentario: e.comentario });
    },
  };

  const eventos: PublicadorDeEventos = {
    publicar: async (e) => {
      traza.push('publicar');
      publicados.push(...e);
    },
  };

  const caso = new CambiarEstadoPlan(
    planes,
    opciones.contenido ?? contenidoSano(),
    aprobaciones,
    autorizacion(opciones.decision ?? PERMITE),
    eventos,
  );

  return { caso, guardados, aprobacionesRegistradas, publicados };
}

beforeEach(() => {
  traza = [];
});

describe('Existencia y autorización', () => {
  it('404 si el plan no existe', async () => {
    const { caso } = montar({ plan: null });
    await expect(
      caso.ejecutar({ planId: 'inexistente', accion: 'enviar-a-revision', actor: ACTOR }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('deniega si la política dice que no', async () => {
    const { caso } = montar({ plan: plan('En revisión'), decision: DENIEGA });
    await expect(
      caso.ejecutar({ planId: 'plan-1', accion: 'aprobar', actor: ACTOR }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('autoriza ANTES de validar', async () => {
    // Validar primero filtraría información sobre planes ajenos a quien no
    // debería verlos, y gastaría consultas en peticiones que se van a denegar.
    const { caso } = montar({ plan: plan('En revisión'), decision: DENIEGA });
    await caso.ejecutar({ planId: 'plan-1', accion: 'aprobar', actor: ACTOR }).catch(() => null);

    expect(traza).toEqual(['autorizar']);
    expect(traza).not.toContain('validar');
  });

  it('no persiste nada cuando deniega', async () => {
    const { caso, guardados } = montar({ plan: plan('En revisión'), decision: DENIEGA });
    await caso.ejecutar({ planId: 'plan-1', accion: 'aprobar', actor: ACTOR }).catch(() => null);
    expect(guardados).toHaveLength(0);
  });
});

describe('RF085 / RF091 — bloqueo por inconsistencias', () => {
  function contenidoConBloqueo(): RepositorioContenidoPort {
    return {
      ...contenidoSano(),
      // RF095: sin objetivo educacional, la validación es bloqueante.
      objetivoIdsDe: async () => [],
    };
  }

  it('impide enviar a revisión con bloqueos', async () => {
    const { caso, guardados } = montar({
      plan: plan('Borrador'),
      contenido: contenidoConBloqueo(),
    });
    await expect(
      caso.ejecutar({ planId: 'plan-1', accion: 'enviar-a-revision', actor: ACTOR }),
    ).rejects.toThrow(/inconsistencias bloqueantes/);
    expect(guardados).toHaveLength(0);
  });

  it('impide aprobar con bloqueos', async () => {
    const { caso } = montar({ plan: plan('En revisión'), contenido: contenidoConBloqueo() });
    await expect(
      caso.ejecutar({ planId: 'plan-1', accion: 'aprobar', actor: ACTOR }),
    ).rejects.toThrow(/inconsistencias bloqueantes/);
  });

  it('permite observar aunque haya bloqueos', async () => {
    // Devolver el plan con observaciones es la salida cuando algo está mal;
    // exigirle un plan limpio dejaría el flujo atascado.
    const { caso } = montar({ plan: plan('En revisión'), contenido: contenidoConBloqueo() });
    const r = await caso.ejecutar({
      planId: 'plan-1',
      accion: 'observar',
      comentario: 'Falta el objetivo educacional.',
      actor: ACTOR,
    });
    expect(r.plan.estado).toBe('Borrador');
  });
});

describe('Flujo correcto', () => {
  it('transiciona y devuelve el resultado de la validación', async () => {
    const { caso } = montar({ plan: plan('Borrador') });
    const r = await caso.ejecutar({
      planId: 'plan-1',
      accion: 'enviar-a-revision',
      actor: ACTOR,
    });

    expect(r.plan.estado).toBe('En revisión');
    expect(r.validacion.tieneBloqueos).toBe(false);
    expect(r.archivado).toBeNull();
  });

  it('publica los eventos DESPUÉS de persistir', async () => {
    // Registrar en la bitácora un cambio que luego falló al guardarse sería
    // peor que no registrarlo: la bitácora es append-only y no se corrige.
    const { caso } = montar({ plan: plan('Borrador') });
    await caso.ejecutar({ planId: 'plan-1', accion: 'enviar-a-revision', actor: ACTOR });

    expect(traza.indexOf('guardar')).toBeLessThan(traza.indexOf('publicar'));
  });

  it('RF088/RF089 — registra la acción en el historial de aprobaciones', async () => {
    const { caso, aprobacionesRegistradas } = montar({ plan: plan('En revisión') });
    await caso.ejecutar({ planId: 'plan-1', accion: 'aprobar', actor: ACTOR });

    expect(aprobacionesRegistradas).toEqual([{ accion: 'Aprobado', comentario: null }]);
  });

  it('RF087 — la observación queda con su comentario', async () => {
    const { caso, aprobacionesRegistradas, publicados } = montar({ plan: plan('En revisión') });
    await caso.ejecutar({
      planId: 'plan-1',
      accion: 'observar',
      comentario: '  Revisar créditos del ciclo 3.  ',
      actor: ACTOR,
    });

    expect(aprobacionesRegistradas[0]?.comentario).toBe('Revisar créditos del ciclo 3.');
    expect(publicados[0]?.detalle).toContain('Revisar créditos del ciclo 3.');
  });

  it('archivar no genera entrada en el historial de aprobaciones', async () => {
    // Archivar es una consecuencia administrativa, no una decisión de
    // aprobación: mezclarlas ensuciaría la evidencia ante una auditoría.
    const { caso, aprobacionesRegistradas } = montar({ plan: plan('Vigente') });
    await caso.ejecutar({ planId: 'plan-1', accion: 'archivar', actor: ACTOR });
    expect(aprobacionesRegistradas).toHaveLength(0);
  });
});

describe('RF082 / RF090 — una sola versión vigente', () => {
  it('archiva la versión anterior al poner otra vigente', async () => {
    const anterior = plan('Vigente', 'plan-0');
    const { caso } = montar({ plan: plan('Aprobado'), vigenteAnterior: anterior });

    const r = await caso.ejecutar({ planId: 'plan-1', accion: 'marcar-vigente', actor: ACTOR });

    expect(r.plan.estado).toBe('Vigente');
    expect(r.archivado?.id).toBe('plan-0');
    expect(r.archivado?.estado).toBe('Histórico');
  });

  it('guarda ambos en UNA sola llamada al repositorio', async () => {
    // Es lo que garantiza que compartan transacción. Con dos llamadas habría un
    // instante con dos planes Vigentes, y el índice único parcial lo rechazaría.
    const { caso, guardados } = montar({
      plan: plan('Aprobado'),
      vigenteAnterior: plan('Vigente', 'plan-0'),
    });
    await caso.ejecutar({ planId: 'plan-1', accion: 'marcar-vigente', actor: ACTOR });

    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toHaveLength(2);
  });

  it('no archiva nada si la carrera no tenía versión vigente', async () => {
    const { caso, guardados } = montar({ plan: plan('Aprobado'), vigenteAnterior: null });
    const r = await caso.ejecutar({ planId: 'plan-1', accion: 'marcar-vigente', actor: ACTOR });

    expect(r.archivado).toBeNull();
    expect(guardados[0]).toHaveLength(1);
  });

  it('fija la fecha de vigencia al entrar en vigor (RF023)', async () => {
    const { caso } = montar({ plan: plan('Aprobado') });
    const r = await caso.ejecutar({ planId: 'plan-1', accion: 'marcar-vigente', actor: ACTOR });
    expect(r.plan.fechaVigencia).toBeInstanceOf(Date);
  });

  it('publica los eventos de ambos planes', async () => {
    const { caso, publicados } = montar({
      plan: plan('Aprobado'),
      vigenteAnterior: plan('Vigente', 'plan-0'),
    });
    await caso.ejecutar({ planId: 'plan-1', accion: 'marcar-vigente', actor: ACTOR });

    const nombres = publicados.map((e) => e.nombre);
    expect(nombres).toContain('plan.vigente');
    expect(nombres).toContain('plan.archivado');
  });
});

describe('RF026 — transiciones inválidas', () => {
  it('rechaza aprobar un plan que está en Borrador', async () => {
    const { caso, guardados } = montar({ plan: plan('Borrador') });
    await expect(
      caso.ejecutar({ planId: 'plan-1', accion: 'aprobar', actor: ACTOR }),
    ).rejects.toThrow(/solo aplica desde/);
    expect(guardados).toHaveLength(0);
  });

  it('rechaza observar sin comentario', async () => {
    const { caso } = montar({ plan: plan('En revisión') });
    await expect(
      caso.ejecutar({ planId: 'plan-1', accion: 'observar', actor: ACTOR }),
    ).rejects.toThrow(/observación/);
  });
});
