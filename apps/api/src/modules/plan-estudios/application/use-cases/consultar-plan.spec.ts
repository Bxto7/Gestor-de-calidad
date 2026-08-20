/**
 * Pruebas del caso de uso de consulta.
 *
 * Lo que se verifica es `accionesDisponibles`: el servidor le dice a la UI qué
 * puede hacer el actor y por qué no puede lo demás. Sin esto, el navegador
 * tendría que replicar la máquina de estados, el motor de validaciones y la
 * regla de alcance por carrera — tres copias que se desincronizan y ninguna con
 * autoridad.
 */

import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  AsignaturaDelPlan,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';
import { ConsultarPlan } from './consultar-plan.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Director de carrera' };
const ISI = 'car-isi';

function plan(estado: EstadoPlan): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: 'plan-1',
    carreraId: ISI,
    codigo: 'PE-ISI-2026-v1',
    version: 1,
    estado,
    duracionAnios: 1,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function asignatura(ciclo: number, competencias: string[] = ['cpe-1']): AsignaturaDelPlan {
  return {
    id: `a-${ciclo}`,
    codigo: `ISI-10${ciclo}`,
    nombre: `Curso ${ciclo}`,
    creditos: 4,
    competenciaIds: competencias,
    cicloNumero: ciclo,
    activa: true,
  };
}

function montar(opciones: {
  plan: PlanDeEstudios | null;
  asignaturas?: AsignaturaDelPlan[];
  objetivos?: string[];
  /** Permisos que la política concede. Ausente = concede todo. */
  permisos?: string[];
}) {
  const planes: RepositorioPlanPort = {
    porId: async () => opciones.plan,
    vigenteDeCarrera: async () => null,
    enCursoDeCarrera: async () => null,
    ultimaVersionDeCarrera: async () => 1,
    guardar: async () => {},
    eliminar: async () => {},
    copiarContenido: async () => {},
  };

  const contenido: RepositorioContenidoPort = {
    carreraDe: async () => ({ id: ISI, codigo: 'ISI', duracionAnios: 1 }),
    carreraPorId: async () => ({ id: ISI, codigo: 'ISI', duracionAnios: 1 }),
    asignaturasDe: async () => opciones.asignaturas ?? [asignatura(1), asignatura(2)],
    objetivoIdsDe: async () => opciones.objetivos ?? ['oe-1'],
    reglasJustificadasDe: async () => [],
  };

  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso) =>
      !opciones.permisos || opciones.permisos.includes(permiso)
        ? { permitido: true }
        : { permitido: false, motivo: `Falta el permiso ${permiso}.` },
    permisosDe: async () => new Set(opciones.permisos ?? []),
    carreraACargoDe: async () => ISI,
  };

  return new ConsultarPlan(planes, contenido, autorizacion);
}

describe('Precondiciones', () => {
  it('404 si el plan no existe', async () => {
    await expect(montar({ plan: null }).ejecutar('x', ACTOR)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('403 sin permiso de lectura', async () => {
    const caso = montar({ plan: plan('Borrador'), permisos: [] });
    await expect(caso.ejecutar('plan-1', ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('Validación incluida en la respuesta', () => {
  it('devuelve el total de créditos y si hay bloqueos', async () => {
    const detalle = await montar({ plan: plan('Borrador') }).ejecutar('plan-1', ACTOR);
    expect(detalle.validacion.totalCreditos).toBe(8);
    expect(detalle.validacion.tieneBloqueos).toBe(false);
  });

  it('reporta los bloqueos que impiden avanzar', async () => {
    // RF095: sin objetivo educacional la validación es bloqueante.
    const detalle = await montar({ plan: plan('Borrador'), objetivos: [] }).ejecutar(
      'plan-1',
      ACTOR,
    );
    expect(detalle.validacion.tieneBloqueos).toBe(true);
    expect(detalle.validacion.bloqueantes.map((h) => h.codigo)).toContain('PLAN_SIN_OBJETIVO');
  });
});

describe('Acciones disponibles', () => {
  it('ofrece la transición que procede desde el estado actual', async () => {
    const detalle = await montar({ plan: plan('Borrador') }).ejecutar('plan-1', ACTOR);
    expect(detalle.accionesDisponibles.map((a) => a.accion)).toEqual(['enviar-a-revision']);
    expect(detalle.accionesDisponibles[0]?.habilitada).toBe(true);
  });

  it('en revisión ofrece aprobar y observar', async () => {
    const detalle = await montar({ plan: plan('En revisión') }).ejecutar('plan-1', ACTOR);
    expect(detalle.accionesDisponibles.map((a) => a.accion).sort()).toEqual([
      'aprobar',
      'observar',
    ]);
  });

  it('un plan Histórico no ofrece ninguna acción', async () => {
    const detalle = await montar({ plan: plan('Histórico') }).ejecutar('plan-1', ACTOR);
    expect(detalle.accionesDisponibles).toEqual([]);
  });

  it('la deshabilita con su motivo cuando hay bloqueos, en vez de ocultarla', async () => {
    // Ocultarla dejaría al usuario preguntándose por qué no puede enviar; verla
    // gris con el motivo le dice qué corregir.
    const detalle = await montar({ plan: plan('Borrador'), objetivos: [] }).ejecutar(
      'plan-1',
      ACTOR,
    );
    const enviar = detalle.accionesDisponibles[0];

    expect(enviar?.habilitada).toBe(false);
    expect(enviar?.motivo).toContain('bloqueantes');
  });

  it('la deshabilita con su motivo cuando falta el permiso', async () => {
    // El Coordinador ve el botón de aprobar en gris con "falta el permiso", que
    // es más honesto que hacerlo desaparecer sin explicación.
    const caso = montar({ plan: plan('En revisión'), permisos: ['plan.leer', 'plan.observar'] });
    const detalle = await caso.ejecutar('plan-1', ACTOR);
    const aprobar = detalle.accionesDisponibles.find((a) => a.accion === 'aprobar');

    expect(aprobar?.habilitada).toBe(false);
    expect(aprobar?.motivo).toContain('plan.aprobar');
  });

  it('observar sigue habilitada aunque haya bloqueos', async () => {
    // Devolver el plan con observaciones es la salida cuando algo está mal.
    const detalle = await montar({ plan: plan('En revisión'), objetivos: [] }).ejecutar(
      'plan-1',
      ACTOR,
    );
    const observar = detalle.accionesDisponibles.find((a) => a.accion === 'observar');
    const aprobar = detalle.accionesDisponibles.find((a) => a.accion === 'aprobar');

    expect(observar?.habilitada).toBe(true);
    expect(aprobar?.habilitada).toBe(false);
  });

  it('cada acción trae su etiqueta legible', async () => {
    const detalle = await montar({ plan: plan('Borrador') }).ejecutar('plan-1', ACTOR);
    expect(detalle.accionesDisponibles[0]?.etiqueta).toBe('Enviar a revisión');
  });
});
