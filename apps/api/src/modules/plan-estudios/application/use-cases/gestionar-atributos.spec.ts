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

describe('RF123 — inactivar atributo del graduado', () => {
  it('el impacto se consulta antes de escribir y queda en el evento', async () => {
    const { publicador, vistos } = capturarEventos();
    const orden: string[] = [];
    const caso = new GestionarAtributos(
      repo({
        impactoDeInactivar: async () => {
          orden.push('impacto');
          return { competenciasVinculadas: 3, planesVinculados: 1 };
        },
        cambiarEstado: async (id, activo) => {
          orden.push('escritura');
          return atributo({ id, activo });
        },
      }),
      permitirTodo(),
      publicador,
    );

    await caso.cambiarEstado(ACTOR, 'atr-1', false);

    expect(orden).toEqual(['impacto', 'escritura']);
    expect(vistos[0]?.detalle).toContain('3 competencias');
  });

  it('reactivar no consulta impacto', async () => {
    let consultado = false;
    const caso = new GestionarAtributos(
      repo({
        porId: async () => atributo({ activo: false }),
        impactoDeInactivar: async () => {
          consultado = true;
          return { competenciasVinculadas: 0, planesVinculados: 0 };
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.cambiarEstado(ACTOR, 'atr-1', true);

    expect(consultado).toBe(false);
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const caso = new GestionarAtributos(
      repo({ porId: async () => atributo({ activo: false }) }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.cambiarEstado(ACTOR, 'atr-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('consultar el impacto exige solo permiso de lectura', async () => {
    // Consultar qué se rompería no rompe nada: pedir aquí el permiso de gestión
    // dejaría sin el aviso a quien puede ver la pantalla.
    let permisoPedido = '';
    const autorizacion: AuthorizationPort = {
      puede: async (_id, permiso) => {
        permisoPedido = permiso;
        return { permitido: true };
      },
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
    };
    const caso = new GestionarAtributos(repo(), autorizacion, capturarEventos().publicador);

    await caso.impactoDeInactivar(ACTOR, 'atr-1');

    expect(permisoPedido).toBe('atributo.leer');
  });
});

describe('RF122 — atributos declarados por un plan', () => {
  it('reemplaza el conjunto completo y audita el antes y el después', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(
      repo({
        delPlan: async () => [atributo({ codigo: 'AG-I01' })],
        declararEnPlan: async () => [atributo({ codigo: 'AG-I02' })],
      }),
      permitirTodo(),
      publicador,
    );

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-2']);

    expect(vistos[0]?.detalle).toContain('AG-I01');
    expect(vistos[0]?.detalle).toContain('AG-I02');
  });

  it('rechaza declarar un atributo inexistente o inactivo', async () => {
    const caso = new GestionarAtributos(
      repo({ inexistentesOInactivos: async () => ['atr-9'] }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', ['atr-9'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('un identificador repetido no llega dos veces al repositorio', async () => {
    let recibidos: readonly string[] = [];
    const caso = new GestionarAtributos(
      repo({
        declararEnPlan: async (_planId, ids) => {
          recibidos = ids;
          return [];
        },
      }),
      permitirTodo(),
      capturarEventos().publicador,
    );

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-1', 'atr-1']);

    expect(recibidos).toEqual(['atr-1']);
  });

  it('declarar la lista vacía deja el plan sin atributos', async () => {
    const { publicador, vistos } = capturarEventos();
    const caso = new GestionarAtributos(
      repo({ delPlan: async () => [atributo({ codigo: 'AG-I01' })], declararEnPlan: async () => [] }),
      permitirTodo(),
      publicador,
    );

    await caso.declararEnPlan(ACTOR, 'plan-1', []);

    // «ninguno» y no un hueco: retirar el último atributo es un cambio que la
    // bitácora tiene que poder contar.
    expect(vistos[0]?.detalle).toContain('ninguno');
  });
});
