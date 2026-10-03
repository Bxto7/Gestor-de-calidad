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
import type { CriterioEnUsoPort } from '../ports/criterio-en-uso.port.js';
import type { DatosCriterio, RepositorioCriterioPort } from '../ports/criterios.port.js';
import { GestionarCriterios } from './gestionar-criterios.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

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

function montarCriterios(
  opciones: {
    repo?: Partial<RepositorioCriterioPort>;
    /** `false` deniega todo; una función decide por permiso. */
    permitido?: boolean | ((permiso: string) => boolean);
    /** Lo que responde Mejora Continua. */
    planesDeMejora?: number;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];
  const consultasEnUso: string[] = [];

  const repo: RepositorioCriterioPort = {
    listar: async () => [criterio()],
    porId: async () => criterio(),
    codigoExiste: async () => false,
    crear: async (carreraId, codigo, nombre) => criterio({ carreraId, codigo, nombre }),
    actualizar: async (id, codigo, nombre) => criterio({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => criterio({ id, activo }),
    ...opciones.repo,
  };

  const enUso: CriterioEnUsoPort = {
    contarPlanesDeMejora: async (id) => {
      consultasEnUso.push(id);
      return opciones.planesDeMejora ?? 0;
    },
  };

  const permitido = opciones.permitido ?? true;
  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso, carreraId) => {
      autorizaciones.push({ permiso, carreraId: carreraId ?? null });
      const ok = typeof permitido === 'function' ? permitido(permiso) : permitido;
      return ok ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };

  const caso = new GestionarCriterios(repo, enUso, autorizacion, eventos);
  return { caso, publicados, autorizaciones, consultasEnUso };
}

describe('RF129 — registrar criterio de acreditación', () => {
  it('crea el criterio en la carrera indicada', async () => {
    const { caso, publicados } = montarCriterios();

    const creado = await caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos educacionales');

    expect(creado.codigo).toBe('C-02');
    expect(creado.carreraId).toBe('car-1');
    expect(publicados).toHaveLength(1);
  });

  it('rechaza un código repetido dentro de la misma carrera', async () => {
    const { caso, publicados } = montarCriterios({ repo: { codigoExiste: async () => true } });

    await expect(caso.crear(ACTOR, 'car-1', 'C-01', 'Duplicado')).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
    expect(publicados).toHaveLength(0);
  });

  it('la unicidad se comprueba contra la carrera del criterio, no globalmente', async () => {
    let carreraConsultada = '';
    const { caso } = montarCriterios({
      repo: {
        codigoExiste: async (carreraId) => {
          carreraConsultada = carreraId;
          return false;
        },
      },
    });

    await caso.crear(ACTOR, 'car-7', 'C-01', 'Estudiantes');

    expect(carreraConsultada).toBe('car-7');
  });

  it('exige el permiso de gestión', async () => {
    const { caso } = montarCriterios({ permitido: false });

    await expect(caso.crear(ACTOR, 'car-1', 'C-02', 'Objetivos')).rejects.toThrow(AccesoDenegado);
  });

  it('la autorización se pide con el alcance de la carrera', async () => {
    // El Coordinador gestiona «su carrera»: ese alcance lo aporta el tercer
    // argumento. Pasar null aquí le daría acceso a los criterios de todas.
    const { caso, autorizaciones } = montarCriterios();

    await caso.crear(ACTOR, 'car-7', 'C-01', 'Estudiantes');

    expect(autorizaciones).toContainEqual({ permiso: 'criterio.gestionar', carreraId: 'car-7' });
  });
});

describe('RF130 — editar criterio', () => {
  it('RN1: no permite dejar el nombre vacío', async () => {
    const { caso } = montarCriterios();

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('el código propio no cuenta como duplicado', async () => {
    let recibido: string | undefined = 'no-invocado';
    const { caso } = montarCriterios({
      repo: {
        codigoExiste: async (_carreraId, _codigo, exceptoId) => {
          recibido = exceptoId;
          return false;
        },
      },
    });

    await caso.editar(ACTOR, 'cri-1', 'C-01', 'Estudiantes');

    expect(recibido).toBe('cri-1');
  });

  it('falla si el criterio no existe', async () => {
    const { caso } = montarCriterios({ repo: { porId: async () => null } });

    await expect(caso.editar(ACTOR, 'cri-9', 'C-01', 'Estudiantes')).rejects.toThrow(NoEncontrado);
  });

  it('RN2: el cambio queda registrado', async () => {
    const { caso, publicados } = montarCriterios();

    await caso.editar(ACTOR, 'cri-1', 'C-01', 'Estudiantes y su progreso');

    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.detalle).toContain('Estudiantes y su progreso');
  });
});

describe('RF132 — inactivar criterio', () => {
  it('RN1: cambia el estado sin borrar', async () => {
    const { caso, publicados } = montarCriterios();

    const cambiado = await caso.cambiarEstado(ACTOR, 'cri-1', false);

    expect(cambiado.activo).toBe(false);
    expect(publicados[0]?.detalle).toContain('inactivado');
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const { caso } = montarCriterios({ repo: { porId: async () => criterio({ activo: false }) } });

    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('el impacto es el recuento de planes de mejora que da el puerto de uso', async () => {
    const { caso, consultasEnUso } = montarCriterios({ planesDeMejora: 2 });

    expect(await caso.impactoDeInactivar(ACTOR, 'cri-1')).toEqual({ planesMejoraVinculados: 2 });
    expect(consultasEnUso).toEqual(['cri-1']);
  });

  it('el impacto de un criterio inexistente es NoEncontrado y no pregunta a Mejora Continua', async () => {
    const { caso, consultasEnUso } = montarCriterios({ repo: { porId: async () => null } });

    await expect(caso.impactoDeInactivar(ACTOR, 'cri-9')).rejects.toThrow(NoEncontrado);
    expect(consultasEnUso).toEqual([]);
  });
});

describe('RF131 — listar por carrera', () => {
  it('pasa la carrera al repositorio', async () => {
    let recibida = '';
    const { caso } = montarCriterios({
      repo: {
        listar: async (carreraId) => {
          recibida = carreraId;
          return [];
        },
      },
    });

    await caso.listar(ACTOR, 'car-7');

    expect(recibida).toBe('car-7');
  });
});
