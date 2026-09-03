/**
 * Pruebas de los atributos del graduado.
 *
 * El foco está en la unicidad del código dentro del marco, que es la garantía
 * de la que depende RF120: si dos atributos comparten código, la trazabilidad
 * hacia la acreditación deja de poder resolverse.
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
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  RepositorioAtributoPort,
} from '../ports/acreditacion.port.js';
import { GestionarAtributos } from './gestionar-atributos.use-case.js';

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

function atributo(sobre: Partial<DatosAtributoCompleto> = {}): DatosAtributoCompleto {
  return {
    id: 'atr-1',
    marco: 'ICACIT',
    codigo: 'AG-I01',
    nombre: 'Conocimientos de ingeniería',
    orden: 1,
    activo: true,
    competenciasVinculadas: 0,
    planesVinculados: 0,
    ...sobre,
  };
}

function repo(sobre: Partial<RepositorioAtributoPort> = {}): RepositorioAtributoPort {
  return {
    listar: async () => [atributo()],
    porId: async () => atributo(),
    codigoExiste: async () => false,
    ultimoOrden: async () => 11,
    crear: async (marco, codigo, nombre, orden) => atributo({ marco, codigo, nombre, orden }),
    actualizar: async (id, codigo, nombre) => atributo({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => atributo({ id, activo }),
    impactoDeInactivar: async () => ({ competenciasVinculadas: 0, planesVinculados: 0 }),
    delPlan: async () => [],
    declararEnPlan: async () => [],
    inexistentesOInactivos: async () => [],
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

describe('RF120 — registrar atributo del graduado', () => {
  it('crea el atributo y lo coloca al final del marco', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(repo(), permitirTodo(), publicador);

    const creado = await caso.crear(ACTOR, 'AG-I12', 'Pensamiento sistémico');

    expect(creado.codigo).toBe('AG-I12');
    expect(creado.orden).toBe(12);
    expect(vistos).toHaveLength(1);
  });

  it('rechaza un código repetido dentro del marco', async () => {
    const caso = new GestionarAtributos(
      repo({ codigoExiste: async () => true }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.crear(ACTOR, 'AG-I01', 'Duplicado')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige el permiso de gestión', async () => {
    const caso = new GestionarAtributos(repo(), denegar(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'AG-I12', 'Pensamiento sistémico')).rejects.toThrow(
      AccesoDenegado,
    );
  });

  it('rechaza un nombre en blanco', async () => {
    const caso = new GestionarAtributos(repo(), permitirTodo(), capturarEventos().publicador);

    await expect(caso.crear(ACTOR, 'AG-I12', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('no publica ningún evento si la creación se rechaza', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(
      repo({ codigoExiste: async () => true }),
      permitirTodo(),
      publicador,
    );

    await expect(caso.crear(ACTOR, 'AG-I01', 'Duplicado')).rejects.toThrow();

    expect(vistos).toHaveLength(0);
  });
});

describe('RF121 — editar atributo del graduado', () => {
  it('actualiza código y nombre', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(repo(), permitirTodo(), publicador);

    const editado = await caso.editar(ACTOR, 'atr-1', 'AG-I02', 'Diseño y desarrollo de soluciones');

    expect(editado.nombre).toBe('Diseño y desarrollo de soluciones');
    expect(vistos).toHaveLength(1);
  });

  it('falla si el atributo no existe', async () => {
    const caso = new GestionarAtributos(
      repo({ porId: async () => null }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.editar(ACTOR, 'atr-9', 'AG-I02', 'Nombre')).rejects.toThrow(NoEncontrado);
  });

  it('el código propio no cuenta como duplicado', async () => {
    // `codigoExiste` recibe `exceptoId`; si el caso de uso no lo pasa, guardar
    // sin cambiar el código fallaría contra el propio registro.
    let recibido: string | undefined = 'no-invocado';
    const caso = new GestionarAtributos(
      repo({
        codigoExiste: async (_marco, _codigo, exceptoId) => {
          recibido = exceptoId;
          return false;
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Conocimientos de ingeniería');

    expect(recibido).toBe('atr-1');
  });
});

describe('RF122 y RF128 — listar y buscar', () => {
  it('propaga el filtro de texto al repositorio', async () => {
    let filtro: FiltroAcreditacion | undefined;
    const caso = new GestionarAtributos(
      repo({
        listar: async (_marco, f) => {
          filtro = f;
          return [];
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.listar(ACTOR, { texto: 'ingeniería' });

    expect(filtro?.texto).toBe('ingeniería');
  });

  it('listar exige permiso de lectura', async () => {
    const caso = new GestionarAtributos(repo(), denegar(), capturarEventos().publicador);

    await expect(caso.listar(ACTOR)).rejects.toThrow(AccesoDenegado);
  });
});
