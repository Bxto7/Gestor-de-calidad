/* eslint-disable @typescript-eslint/unbound-method -- los `vi.fn` se leen por su método para afirmar sobre las llamadas */
import { describe, expect, it, vi } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import { MAXIMO_EVIDENCIAS } from '../../domain/services/mis-evaluaciones.js';
import type {
  ContextoDeEvaluacion,
  ContextoDeEvidencia,
  RepositorioMisEvidenciasPort,
} from '../ports/mis-evidencias.port.js';
import { GestionarMisEvidencias } from './gestionar-mis-evidencias.use-case.js';

const ACTOR: Actor = { id: 'u-docente', nombre: 'Jorge Huamán' };
const CARRERA = 'carrera-isi';

const contexto = (c: Partial<ContextoDeEvaluacion> = {}): ContextoDeEvaluacion => ({
  asignaturaEvaluadaId: 'ae-1',
  docenteId: ACTOR.id,
  planEvaluacionId: 'pev-1',
  planCodigo: 'EV-1',
  estadoPlan: 'VIGENTE',
  planEstudiosId: 'pe-1',
  totalEvidencias: 0,
  ...c,
});

const contextoEvidencia = (c: Partial<ContextoDeEvidencia> = {}): ContextoDeEvidencia => ({
  ...contexto(),
  evidenciaId: 'ev-1',
  registradaPorId: ACTOR.id,
  ...c,
});

interface Opciones {
  permitido?: boolean;
  carreraACargo?: string | null;
  planVigente?: { id: string; codigo: string; version: number; fechaVigencia: Date | null } | null;
  contextoEvaluacion?: ContextoDeEvaluacion | null;
  contextoDeLaEvidencia?: ContextoDeEvidencia | null;
  carreraDelPlan?: string | null;
}

function montar(o: Opciones = {}) {
  const opciones = {
    permitido: true,
    carreraACargo: CARRERA as string | null,
    planVigente: { id: 'pe-1', codigo: 'PE-1', version: 1, fechaVigencia: null },
    contextoEvaluacion: contexto() as ContextoDeEvaluacion | null,
    contextoDeLaEvidencia: contextoEvidencia() as ContextoDeEvidencia | null,
    carreraDelPlan: CARRERA as string | null,
    ...o,
  };

  const autorizacion: AuthorizationPort = {
    puede: vi.fn(async () =>
      opciones.permitido
        ? { permitido: true as const }
        : { permitido: false as const, motivo: 'no' },
    ),
    permisosDe: vi.fn(async () => new Set<string>()),
    carreraACargoDe: vi.fn(async () => opciones.carreraACargo),
    rolesDe: vi.fn(async () => []),
  };
  const repositorio: RepositorioMisEvidenciasPort = {
    evaluacionesDelDocente: vi.fn(async () => []),
    contextoDeEvaluacion: vi.fn(async () => opciones.contextoEvaluacion),
    contextoDeEvidencia: vi.fn(async () => opciones.contextoDeLaEvidencia),
    agregarEvidencia: vi.fn(async () => ({ id: 'nueva' })),
    retirarEvidencia: vi.fn(async () => undefined),
  };
  const planVigente: PlanVigenteDeCarreraPort = {
    planVigenteDeCarrera: vi.fn(async () => opciones.planVigente),
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: vi.fn(async () => []),
    planPorId: vi.fn(async () =>
      opciones.carreraDelPlan
        ? {
            id: 'pe-1',
            codigo: 'PE-1',
            carreraId: opciones.carreraDelPlan,
            carreraNombre: 'Sistemas',
            version: 1,
            elegible: true,
            duracionAnios: 5,
          }
        : null,
    ),
    competenciasDelPlan: vi.fn(async () => []),
    asignaturasDelPlan: vi.fn(async () => []),
    carreraPorId: vi.fn(async () => null),
  };
  const eventos: PublicadorDeEventos = { publicar: vi.fn(async () => undefined) };

  const caso = new GestionarMisEvidencias(
    repositorio,
    planVigente,
    contenido,
    autorizacion,
    eventos,
  );
  return { caso, autorizacion, repositorio, planVigente, contenido, eventos };
}

const DATOS = { enlace: 'https://ejemplo.pe/acta', descripcion: 'Acta firmada' };

describe('listar', () => {
  it('sin el permiso evaluacion.leer lanza AccesoDenegado y no lee nada', async () => {
    const { caso, autorizacion, repositorio } = montar({ permitido: false });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizacion.puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.leer', null);
    expect(autorizacion.carreraACargoDe).not.toHaveBeenCalled();
    expect(repositorio.evaluacionesDelDocente).not.toHaveBeenCalled();
  });

  it('sin carrera a cargo lanza el 409 con el mensaje esperado', async () => {
    const { caso } = montar({ carreraACargo: null });
    const fallo = await caso.listar(ACTOR).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta vista necesita una carrera asignada.');
  });

  it('sin plan de estudios vigente devuelve una lista vacía y no consulta evaluaciones', async () => {
    const { caso, repositorio } = montar({ planVigente: null });
    expect(await caso.listar(ACTOR)).toEqual({ evaluaciones: [] });
    expect(repositorio.evaluacionesDelDocente).not.toHaveBeenCalled();
  });

  it('lee las evaluaciones del propio actor en el plan vigente de su carrera y resuelve nombres', async () => {
    const { caso, repositorio, planVigente, contenido } = montar();
    vi.mocked(repositorio.evaluacionesDelDocente).mockResolvedValue([
      {
        id: 'ae-1',
        asignaturaId: 'a1',
        competenciaId: 'k1',
        entregable: 'Proyecto final',
        periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: new Date(Date.UTC(2026, 6, 15)) },
        planEvaluacion: { id: 'pev-1', codigo: 'EV-1' },
        evidencias: [
          { id: 'x1', enlace: 'https://a', descripcion: 'a', registradaPorId: ACTOR.id },
        ],
      },
    ]);
    vi.mocked(contenido.asignaturasDelPlan).mockResolvedValue([
      { id: 'a1', codigo: 'BD', nombre: 'Base de Datos', cicloNumero: 5, activa: true },
    ]);
    vi.mocked(contenido.competenciasDelPlan).mockResolvedValue([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Diseño de soluciones', activa: true, atributos: [] },
    ]);

    const r = await caso.listar(ACTOR);

    expect(planVigente.planVigenteDeCarrera).toHaveBeenCalledWith(CARRERA);
    expect(repositorio.evaluacionesDelDocente).toHaveBeenCalledWith(ACTOR.id, 'pe-1');
    expect(r.evaluaciones[0]).toMatchObject({
      id: 'ae-1',
      asignatura: { codigo: 'BD', nombre: 'Base de Datos' },
      competencia: { codigo: 'CPE-01' },
      puedeAgregar: true,
    });
    expect(r.evaluaciones[0]?.evidencias[0]?.propia).toBe(true);
  });

  it('no filtra a la respuesta los campos extra de asignatura ni de competencia', async () => {
    const { caso, repositorio, contenido } = montar();
    vi.mocked(repositorio.evaluacionesDelDocente).mockResolvedValue([
      {
        id: 'ae-1',
        asignaturaId: 'a1',
        competenciaId: 'k1',
        entregable: 'Proyecto final',
        periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: new Date(Date.UTC(2026, 6, 15)) },
        planEvaluacion: { id: 'pev-1', codigo: 'EV-1' },
        evidencias: [],
      },
    ]);
    vi.mocked(contenido.asignaturasDelPlan).mockResolvedValue([
      { id: 'a1', codigo: 'BD', nombre: 'Base de Datos', cicloNumero: 5, activa: true },
    ]);
    vi.mocked(contenido.competenciasDelPlan).mockResolvedValue([
      {
        id: 'k1',
        codigo: 'CPE-01',
        nombre: 'Diseño de soluciones',
        activa: true,
        atributos: [{ id: 'at1', codigo: 'AT1', nombre: 'Atributo' }],
      },
    ]);

    const r = await caso.listar(ACTOR);

    const evaluacion = r.evaluaciones[0];
    expect(Object.keys(evaluacion?.asignatura ?? {}).sort()).toEqual(['codigo', 'id', 'nombre']);
    expect(Object.keys(evaluacion?.competencia ?? {}).sort()).toEqual(['codigo', 'id', 'nombre']);
  });
});

describe('agregar', () => {
  it('camino feliz: agrega con la autoría del actor y deja constancia', async () => {
    const { caso, repositorio, eventos } = montar();

    const r = await caso.agregar(ACTOR, 'ae-1', DATOS);

    expect(r).toEqual({ id: 'nueva' });
    expect(repositorio.agregarEvidencia).toHaveBeenCalledWith('ae-1', {
      ...DATOS,
      registradaPorId: ACTOR.id,
    });
    expect(eventos.publicar).toHaveBeenCalledTimes(1);
    const [evento] = vi.mocked(eventos.publicar).mock.calls[0]![0];
    expect(evento).toMatchObject({
      nombre: 'evaluacion.configurada',
      entidadId: 'pev-1',
      detalle: 'Plan de evaluación EV-1: evidencia registrada por el docente.',
    });
  });

  it('una evaluación inexistente es AccesoDenegado, no «no encontrado»', async () => {
    const { caso, repositorio } = montar({ contextoEvaluacion: null });
    await expect(caso.agregar(ACTOR, 'ae-x', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('sin el permiso evidencia.registrar sobre la carrera del plan es AccesoDenegado', async () => {
    const { caso, autorizacion, repositorio } = montar({ permitido: false });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizacion.puede).toHaveBeenCalledWith(ACTOR.id, 'evidencia.registrar', CARRERA);
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('una evaluación de otro docente es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({ contextoEvaluacion: contexto({ docenteId: 'otro' }) });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('una evaluación sin docente asignado es AccesoDenegado', async () => {
    const { caso } = montar({ contextoEvaluacion: contexto({ docenteId: null }) });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it.each(['BORRADOR', 'EN_REVISION', 'APROBADO', 'HISTORICO'] as const)(
    'con el plan en %s responde 409 con el mensaje de plan no vigente',
    async (estadoPlan) => {
      const { caso, repositorio } = montar({ contextoEvaluacion: contexto({ estadoPlan }) });
      const fallo = await caso.agregar(ACTOR, 'ae-1', DATOS).catch((e: unknown) => e);
      expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
      expect((fallo as Error).message).toBe(
        'El plan de evaluación EV-1 no está vigente; ya no admite evidencias.',
      );
      expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
    },
  );

  it('con el tope alcanzado responde 409 con el mensaje del tope', async () => {
    const { caso, repositorio } = montar({
      contextoEvaluacion: contexto({ totalEvidencias: MAXIMO_EVIDENCIAS }),
    });
    const fallo = await caso.agregar(ACTOR, 'ae-1', DATOS).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta evaluación ya tiene 20 evidencias.');
    expect(repositorio.agregarEvidencia).not.toHaveBeenCalled();
  });

  it('con una menos que el tope todavía agrega', async () => {
    const { caso, repositorio } = montar({
      contextoEvaluacion: contexto({ totalEvidencias: MAXIMO_EVIDENCIAS - 1 }),
    });
    await caso.agregar(ACTOR, 'ae-1', DATOS);
    expect(repositorio.agregarEvidencia).toHaveBeenCalled();
  });

  it('si el plan de estudios ya no existe es AccesoDenegado', async () => {
    const { caso } = montar({ carreraDelPlan: null });
    await expect(caso.agregar(ACTOR, 'ae-1', DATOS)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('retirar', () => {
  it('camino feliz: retira la evidencia propia y deja constancia', async () => {
    const { caso, repositorio, eventos } = montar();

    await caso.retirar(ACTOR, 'ev-1');

    expect(repositorio.retirarEvidencia).toHaveBeenCalledWith('ev-1');
    const [evento] = vi.mocked(eventos.publicar).mock.calls[0]![0];
    expect(evento).toMatchObject({
      detalle: 'Plan de evaluación EV-1: evidencia retirada por el docente.',
    });
  });

  it('una evidencia inexistente es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({ contextoDeLaEvidencia: null });
    await expect(caso.retirar(ACTOR, 'ev-x')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('una evidencia registrada por otra persona es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ registradaPorId: 'otra-persona' }),
    });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('una evidencia sin autoría (la registró un coordinador) es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ registradaPorId: null }),
    });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('una evidencia propia en una evaluación que ya no es del actor es AccesoDenegado', async () => {
    const { caso } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ docenteId: 'otro' }),
    });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('sin el permiso evidencia.registrar es AccesoDenegado', async () => {
    const { caso, repositorio } = montar({ permitido: false });
    await expect(caso.retirar(ACTOR, 'ev-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('con el plan que dejó de estar vigente responde 409', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ estadoPlan: 'HISTORICO' }),
    });
    const fallo = await caso.retirar(ACTOR, 'ev-1').catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect(repositorio.retirarEvidencia).not.toHaveBeenCalled();
  });

  it('retirar no aplica el tope de evidencias', async () => {
    const { caso, repositorio } = montar({
      contextoDeLaEvidencia: contextoEvidencia({ totalEvidencias: MAXIMO_EVIDENCIAS }),
    });
    await caso.retirar(ACTOR, 'ev-1');
    expect(repositorio.retirarEvidencia).toHaveBeenCalled();
  });
});
