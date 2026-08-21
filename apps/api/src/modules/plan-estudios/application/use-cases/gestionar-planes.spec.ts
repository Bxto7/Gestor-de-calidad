/**
 * Pruebas del ciclo de vida del plan.
 *
 * Dos sitios concentran el riesgo: el alta —que no debe permitir dos planes
 * editables de la misma carrera— y el borrado, que es la única operación capaz
 * de hacer desaparecer un plan del histórico de una acreditación.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  FiltroPlanes,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';
import { GestionarPlanes } from './gestionar-planes.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de Sistemas' };
const ISI = 'car-isi';

function plan(estado: EstadoPlan, sobre: Partial<{ id: string; version: number }> = {}) {
  return PlanDeEstudios.desde({
    id: sobre.id ?? 'plan-1',
    carreraId: ISI,
    codigo: 'PE-ISI-2026-v1',
    version: sobre.version ?? 1,
    estado,
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function montar(
  opciones: {
    existente?: PlanDeEstudios | null;
    enCurso?: PlanDeEstudios | null;
    ultimaVersion?: number;
    carrera?: { id: string; codigo: string; duracionAnios: number } | null;
    permitido?: boolean;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const guardados: PlanDeEstudios[] = [];
  const eliminados: string[] = [];
  const objetivosAsociados: readonly string[][] = [];
  const competenciasAsociadas: readonly string[][] = [];
  const filtros: (FiltroPlanes | undefined)[] = [];

  const repo = {
    porId: async () => (opciones.existente === undefined ? plan('Borrador') : opciones.existente),
    listar: async (filtro?: FiltroPlanes) => {
      filtros.push(filtro);
      return [plan('Vigente')];
    },
    versionesDeCarrera: async () => [plan('Vigente', { version: 2 }), plan('Histórico')],
    vigenteDeCarrera: async () => null,
    enCursoDeCarrera: async () => opciones.enCurso ?? null,
    ultimaVersionDeCarrera: async () => opciones.ultimaVersion ?? 0,
    guardar: async (ps: readonly PlanDeEstudios[]) => void guardados.push(...ps),
    eliminar: async (id: string) => void eliminados.push(id),
    copiarContenido: async () => undefined,
    asociarObjetivos: async (_id: string, ids: readonly string[]) =>
      void (objetivosAsociados as string[][]).push([...ids]),
    asociarCompetencias: async (_id: string, ids: readonly string[]) =>
      void (competenciasAsociadas as string[][]).push([...ids]),
  } as unknown as RepositorioPlanPort;

  const contenido = {
    carreraPorId: async () =>
      opciones.carrera === undefined
        ? { id: ISI, codigo: 'ISI', duracionAnios: 5 }
        : opciones.carrera,
  } as unknown as RepositorioContenidoPort;

  const autorizacion: AuthorizationPort = {
    puede: async () =>
      opciones.permitido === false
        ? { permitido: false, motivo: 'No dirige la carrera.' }
        : { permitido: true },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  let n = 0;
  const caso = new GestionarPlanes(repo, contenido, autorizacion, eventos, {
    nuevo: () => `nuevo-${++n}`,
  });

  return {
    caso,
    publicados,
    guardados,
    eliminados,
    objetivosAsociados,
    competenciasAsociadas,
    filtros,
  };
}

describe('RF020 a RF022 — crear plan', () => {
  it('nace en Borrador', async () => {
    const { caso, guardados } = montar();
    const r = await caso.crear(ACTOR, ISI);
    expect(r.estado).toBe('Borrador');
    expect(guardados).toHaveLength(1);
  });

  it('RF022: el código se deriva de la carrera, el año y la versión', async () => {
    const { caso } = montar({ ultimaVersion: 2 });
    const r = await caso.crear(ACTOR, ISI);
    expect(r.codigo).toBe(`PE-ISI-${new Date().getFullYear()}-v3`);
    expect(r.version).toBe(3);
  });

  it('la duración se copia de la carrera', async () => {
    // Arrancarla desalineada obligaría a corregir un dato que el sistema ya
    // conoce.
    const { caso } = montar({ carrera: { id: ISI, codigo: 'ISI', duracionAnios: 4 } });
    expect((await caso.crear(ACTOR, ISI)).duracionAnios).toBe(4);
  });

  it('404 si la carrera no existe', async () => {
    const { caso } = montar({ carrera: null });
    await expect(caso.crear(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('RF014 RN1: sin ciclos definidos no se puede crear', async () => {
    const { caso, guardados } = montar({ carrera: { id: ISI, codigo: 'ISI', duracionAnios: 0 } });
    await expect(caso.crear(ACTOR, ISI)).rejects.toThrow(/no tiene ciclos definidos/);
    expect(guardados).toHaveLength(0);
  });

  it('RF075: rechaza un segundo plan editable para la misma carrera', async () => {
    // Con dos a la vez no se sabría cuál va a aprobarse.
    const { caso, guardados } = montar({ enCurso: plan('En revisión') });
    await expect(caso.crear(ACTOR, ISI)).rejects.toThrow(/ya tiene un plan en estado En revisión/);
    expect(guardados).toHaveLength(0);
  });

  it('el alta queda en la bitácora', async () => {
    const { caso, publicados } = montar();
    await caso.crear(ACTOR, ISI);
    expect(publicados[0]?.nombre).toBe('plan.creado');
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, guardados } = montar({ permitido: false });
    await expect(caso.crear(ACTOR, ISI)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(guardados).toHaveLength(0);
  });
});

describe('RF021 / RF023 — editar', () => {
  it('cambia la duración en Borrador', async () => {
    const { caso } = montar();
    expect((await caso.editar(ACTOR, 'plan-1', { duracionAnios: 4 })).duracionAnios).toBe(4);
  });

  it('RF027: la duración no se toca fuera de Borrador ni En revisión', async () => {
    const { caso, guardados } = montar({ existente: plan('Vigente') });
    await expect(caso.editar(ACTOR, 'plan-1', { duracionAnios: 4 })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    expect(guardados).toHaveLength(0);
  });

  it('RF023 RN1: la fecha de vigencia exige el plan Aprobado', async () => {
    const { caso } = montar({ existente: plan('Borrador') });
    await expect(
      caso.editar(ACTOR, 'plan-1', { fechaVigencia: new Date('2027-03-01') }),
    ).rejects.toThrow(/solo puede fijarse con el plan Aprobado/);
  });

  it('con el plan Aprobado sí se fija', async () => {
    const { caso } = montar({ existente: plan('Aprobado') });
    const r = await caso.editar(ACTOR, 'plan-1', { fechaVigencia: new Date('2027-03-01') });
    expect(r.fechaVigencia?.toISOString().slice(0, 10)).toBe('2027-03-01');
  });

  it('retirar la fecha se permite en cualquier estado', async () => {
    // Limpiar no es fijar: no crea un plan "vigente desde" una fecha sin aprobar.
    const { caso } = montar({ existente: plan('Borrador') });
    await expect(caso.editar(ACTOR, 'plan-1', { fechaVigencia: null })).resolves.toBeTruthy();
  });

  it('la bitácora nombra el cambio de duración', async () => {
    const { caso, publicados } = montar();
    await caso.editar(ACTOR, 'plan-1', { duracionAnios: 4 });
    expect(publicados[0]?.detalle).toContain('duración 5 → 4 año(s)');
  });

  it('guardar sin cambios lo dice', async () => {
    const { caso, publicados } = montar();
    await caso.editar(ACTOR, 'plan-1', {});
    expect(publicados[0]?.detalle).toContain('sin cambios');
  });

  it('404 si el plan no existe', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.editar(ACTOR, 'x', { duracionAnios: 4 })).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });
});

describe('RF028 / RF029 — asociar objetivos y competencias', () => {
  it('reemplaza el conjunto entero', async () => {
    const { caso, objetivosAsociados } = montar();
    await caso.asociar(ACTOR, 'plan-1', { objetivoIds: ['o-1', 'o-2'] });
    expect(objetivosAsociados[0]).toEqual(['o-1', 'o-2']);
  });

  it('una lista vacía desasocia todo', async () => {
    const { caso, objetivosAsociados } = montar();
    await caso.asociar(ACTOR, 'plan-1', { objetivoIds: [] });
    expect(objetivosAsociados[0]).toEqual([]);
  });

  it('descarta duplicados', async () => {
    const { caso, competenciasAsociadas } = montar();
    await caso.asociar(ACTOR, 'plan-1', { competenciaIds: ['c-1', 'c-1', 'c-2'] });
    expect(competenciasAsociadas[0]).toEqual(['c-1', 'c-2']);
  });

  it('lo que no se envía no se toca', async () => {
    // Enviar solo objetivos no debe vaciar las competencias del plan.
    const { caso, objetivosAsociados, competenciasAsociadas } = montar();
    await caso.asociar(ACTOR, 'plan-1', { objetivoIds: ['o-1'] });
    expect(objetivosAsociados).toHaveLength(1);
    expect(competenciasAsociadas).toHaveLength(0);
  });

  it('RF027: no se asocia nada con el plan congelado', async () => {
    const { caso, objetivosAsociados } = montar({ existente: plan('Aprobado') });
    await expect(caso.asociar(ACTOR, 'plan-1', { objetivoIds: ['o-1'] })).rejects.toThrow(
      /no admite cambios/,
    );
    expect(objetivosAsociados).toHaveLength(0);
  });

  it('la bitácora dice cuántos quedaron', async () => {
    const { caso, publicados } = montar();
    await caso.asociar(ACTOR, 'plan-1', { objetivoIds: ['o-1', 'o-2'], competenciaIds: ['c-1'] });
    expect(publicados[0]?.detalle).toContain('2 objetivo(s) y 1 competencia(s)');
  });

  it('sin cambios no ensucia la bitácora', async () => {
    const { caso, publicados } = montar();
    await caso.asociar(ACTOR, 'plan-1', {});
    expect(publicados).toHaveLength(0);
  });
});

describe('RF032 — eliminar', () => {
  it('un Borrador sí se elimina', async () => {
    const { caso, eliminados } = montar({ existente: plan('Borrador') });
    await caso.eliminar(ACTOR, 'plan-1');
    expect(eliminados).toEqual(['plan-1']);
  });

  it('rechaza eliminar en cualquier otro estado', async () => {
    // Un plan que llegó a Aprobado forma parte del histórico de la acreditación.
    for (const estado of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
      const { caso, eliminados } = montar({ existente: plan(estado) });
      await expect(caso.eliminar(ACTOR, 'plan-1'), estado).rejects.toThrow(/no puede eliminarse/);
      expect(eliminados, estado).toHaveLength(0);
    }
  });

  it('el borrado se audita antes de perder el registro', async () => {
    const { caso, publicados } = montar({ existente: plan('Borrador') });
    await caso.eliminar(ACTOR, 'plan-1');
    expect(publicados[0]?.nombre).toBe('plan.eliminado');
    expect(publicados[0]?.detalle).toContain('PE-ISI-2026-v1');
  });

  it('404 si no existe', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.eliminar(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('RF024 / RF030 / RF076 — consulta', () => {
  it('traslada los filtros al repositorio', async () => {
    const { caso, filtros } = montar();
    await caso.listar(ACTOR, { carreraId: ISI, estado: 'Vigente' });
    expect(filtros[0]).toEqual({ carreraId: ISI, estado: 'Vigente' });
  });

  it('devuelve el histórico de versiones de una carrera', async () => {
    const { caso } = montar();
    expect(await caso.versionesDe(ACTOR, ISI)).toHaveLength(2);
  });

  it('leer exige permiso', async () => {
    const { caso } = montar({ permitido: false });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
