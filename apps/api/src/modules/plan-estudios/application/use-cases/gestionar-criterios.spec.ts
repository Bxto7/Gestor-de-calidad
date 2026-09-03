/**
 * Pruebas de los criterios de acreditación.
 *
 * Lo que aquí importa y no en los atributos: la unicidad es **por carrera**.
 * Dos programas pueden llamar «C-01» a criterios distintos, y confundir ese
 * alcance haría que registrar un criterio en una carrera bloqueara a la otra.
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
import type { DatosCriterio, RepositorioCriterioPort } from '../ports/acreditacion.port.js';
import { GestionarCriterios } from './gestionar-criterios.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function criterio(sobre: Partial<DatosCriterio> = {}): DatosCriterio {
  return {
    id: 'cri-1',
    carreraId: 'car-1',
    codigo: 'C-01',
    nombre: 'Estudiantes',
    activo: true,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function repo(sobre: Partial<RepositorioCriterioPort> = {}): RepositorioCriterioPort {
  return {
    listar: async () => [criterio()],
    porId: async () => criterio(),
    codigoExiste: async () => false,
    crear: async (carreraId, codigo, nombre) => criterio({ carreraId, codigo, nombre }),
    actualizar: async (id, codigo, nombre) => criterio({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => criterio({ id, activo }),
    impactoDeInactivar: async () => ({ planesMejoraVinculados: 0 }),
    ...sobre,
  };
}

function capturarEventos(): { publicador: PublicadorDeEventos; vistos: DomainEvent[] } {
  const vistos: DomainEvent[] = [];
  return {
    publicador: {
      publicar: async (e) => {
        vistos.push(...e);
      },
    },
    vistos,
  };
}

describe('RF129 — registrar criterio de acreditación', () => {
  it('crea el criterio en la carrera indicada', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarCriterios(repo(), permitirTodo(), publicador);

    const creado = await caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos educacionales');

    expect(creado.codigo).toBe('C-02');
    expect(creado.carreraId).toBe('car-1');
    expect(vistos).toHaveLength(1);
  });

  it('rechaza un código repetido dentro de la misma carrera', async () => {
    const caso = new GestionarCriterios(
      repo({ codigoExiste: async () => true }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.crear(ACTOR, 'car-1', 'C-01', 'Duplicado')).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('la unicidad se comprueba contra la carrera del criterio, no globalmente', async () => {
    let carreraConsultada = '';
    const caso = new GestionarCriterios(
      repo({
        codigoExiste: async (carreraId) => {
          carreraConsultada = carreraId;
          return false;
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.crear(ACTOR, 'car-7', 'C-01', 'Estudiantes');

    expect(carreraConsultada).toBe('car-7');
  });

  it('exige el permiso de gestión', async () => {
    const caso = new GestionarCriterios(repo(), denegar(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos')).rejects.toThrow(AccesoDenegado);
  });

  it('la autorización se pide con el alcance de la carrera', async () => {
    // El Director gestiona «su carrera»: ese alcance lo aporta el tercer
    // argumento. Pasar null aquí le daría acceso a los criterios de todas.
    let alcance: string | null | undefined = 'no-invocado';
    const autorizacion: AuthorizationPort = {
      puede: async (_id, _permiso, carreraId) => {
        alcance = carreraId;
        return { permitido: true };
      },
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
    };
    const caso = new GestionarCriterios(repo(), autorizacion, capturarEventos().publicador);

    await caso.crear(ACTOR, 'car-7', 'C-01', 'Estudiantes');

    expect(alcance).toBe('car-7');
  });
});

describe('RF130 — editar criterio', () => {
  it('RN1: no permite dejar el nombre vacío', async () => {
    const caso = new GestionarCriterios(repo(), permitirTodo(), capturarEventos().publicador);

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('el código propio no cuenta como duplicado', async () => {
    let recibido: string | undefined = 'no-invocado';
    const caso = new GestionarCriterios(
      repo({
        codigoExiste: async (_carreraId, _codigo, exceptoId) => {
          recibido = exceptoId;
          return false;
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.editar(ACTOR, 'cri-1', 'C-01', 'Estudiantes');

    expect(recibido).toBe('cri-1');
  });

  it('falla si el criterio no existe', async () => {
    const caso = new GestionarCriterios(
      repo({ porId: async () => null }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.editar(ACTOR, 'cri-9', 'C-01', 'Estudiantes')).rejects.toThrow(NoEncontrado);
  });

  it('RN2: el cambio queda registrado', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarCriterios(repo(), permitirTodo(), publicador);

    await caso.editar(ACTOR, 'cri-1', 'C-01', 'Estudiantes y su progreso');

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.detalle).toContain('Estudiantes y su progreso');
  });
});

describe('RF132 — inactivar criterio', () => {
  it('RN1: cambia el estado sin borrar', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarCriterios(repo(), permitirTodo(), publicador);

    const cambiado = await caso.cambiarEstado(ACTOR, 'cri-1', false);

    expect(cambiado.activo).toBe(false);
    expect(vistos[0]?.detalle).toContain('inactivado');
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const caso = new GestionarCriterios(
      repo({ porId: async () => criterio({ activo: false }) }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF131 — listar por carrera', () => {
  it('pasa la carrera al repositorio', async () => {
    let recibida = '';
    const caso = new GestionarCriterios(
      repo({
        listar: async (carreraId) => {
          recibida = carreraId;
          return [];
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.listar(ACTOR, 'car-7');

    expect(recibida).toBe('car-7');
  });
});
