/**
 * Pruebas de los atributos del graduado (RF120–RF123, RF128 y RF-CH-027/028).
 *
 * Dos focos. La unicidad del código **por carrera y marco**, de la que depende
 * RF120: si dos atributos de una carrera comparten código, la trazabilidad hacia
 * la acreditación deja de poder resolverse. Y el orden de comprobación: permiso de
 * lectura, existencia y alcance (404, nunca 403), permiso de gestión acotado a la
 * carrera, reglas de negocio.
 *
 * El Coordinador, el único que gestiona, tiene alcance de lectura `TODAS`
 * (`sinRestriccion`): lee otras carreras, pero no escribe en ellas. El 404 por
 * alcance es lo que ve quien lee solo su carrera (`soloCarrera`).
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
import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  DatosAtributoCompleto,
  FiltroAcreditacion,
  RepositorioAtributoPort,
} from '../ports/atributos.port.js';
import type {
  PlanParaAcreditacion,
  PlanParaAcreditacionPort,
} from '../ports/plan-para-acreditacion.port.js';
import { GestionarAtributos } from './gestionar-atributos.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const ISI = 'car-isi';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Quien lee solo una carrera (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

function atributo(sobre: Partial<DatosAtributoCompleto> = {}): DatosAtributoCompleto {
  return {
    id: 'atr-1',
    carreraId: ISI,
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

function plan(sobre: Partial<PlanParaAcreditacion> = {}): PlanParaAcreditacion {
  return { id: 'plan-1', carreraId: ISI, ...sobre };
}

function montarAtributos(
  opciones: {
    repo?: Partial<RepositorioAtributoPort>;
    plan?: PlanParaAcreditacion | null;
    carreraExiste?: boolean;
    /** `false` deniega todo; una función decide por permiso y carrera. */
    permitido?: boolean | ((permiso: string, carreraId: string | null) => boolean);
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const orden: string[] = [];
  const eliminados: string[] = [];
  const publicados: DomainEvent[] = [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];

  const repo: RepositorioAtributoPort = {
    listar: async () => [atributo()],
    porId: async () => atributo(),
    codigoExiste: async () => false,
    ultimoOrden: async () => 11,
    crear: async (carreraId, marco, codigo, nombre, orden) =>
      atributo({ carreraId, marco, codigo, nombre, orden }),
    actualizar: async (id, codigo, nombre) => atributo({ id, codigo, nombre }),
    cambiarEstado: async (id, activo) => atributo({ id, activo }),
    impactoDeInactivar: async () => ({ competenciasVinculadas: 0, planesVinculados: 0 }),
    delPlan: async () => [],
    declararEnPlan: async () => [],
    noUtilizablesEnCarrera: async () => [],
    eliminar: async (id) => {
      orden.push('eliminar');
      eliminados.push(id);
      return true;
    },
    ...opciones.repo,
  };

  const planes: PlanParaAcreditacionPort = {
    planPorId: async () => (opciones.plan === undefined ? plan() : opciones.plan),
  };

  const carreras: AcademicoCrossModuloPort = {
    carreraPorId: async (id) =>
      opciones.carreraExiste === false
        ? null
        : { id, nombre: 'Sistemas', codigo: 'ISI', activa: true },
    carrerasActivas: async () => [],
  };

  const permitido = opciones.permitido ?? true;
  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso, carreraId) => {
      autorizaciones.push({ permiso, carreraId: carreraId ?? null });
      const ok =
        typeof permitido === 'function' ? permitido(permiso, carreraId ?? null) : permitido;
      return ok ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = {
    publicar: async (e) => {
      orden.push('eventos');
      publicados.push(...e);
    },
  };

  const caso = new GestionarAtributos(
    repo,
    planes,
    carreras,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );
  return { caso, publicados, autorizaciones, orden, eliminados };
}

/** Un Coordinador de ISI: lee todo, solo gestiona lo de ISI. */
const SOLO_GESTIONA_ISI = (permiso: string, carreraId: string | null): boolean =>
  permiso === 'atributo.gestionar' ? carreraId === ISI : true;

describe('RF120 — registrar atributo del graduado', () => {
  it('crea el atributo y lo coloca al final de la carrera', async () => {
    const { caso, publicados } = montarAtributos();

    const creado = await caso.crear(ACTOR, ISI, 'AG-I12', 'Pensamiento sistémico');

    expect(creado.codigo).toBe('AG-I12');
    expect(creado.orden).toBe(12);
    expect(creado.carreraId).toBe(ISI);
    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.nombre).toBe('acreditacion.atributo_creado');
  });

  it('el código y el orden se calculan dentro de la carrera, no del marco entero', async () => {
    const vistos: { operacion: string; carreraId: string; marco: string }[] = [];
    const { caso } = montarAtributos({
      repo: {
        codigoExiste: async (carreraId, marco) => {
          vistos.push({ operacion: 'codigoExiste', carreraId, marco });
          return false;
        },
        ultimoOrden: async (carreraId, marco) => {
          vistos.push({ operacion: 'ultimoOrden', carreraId, marco });
          return 3;
        },
        crear: async (carreraId, marco, codigo, nombre, orden) => {
          vistos.push({ operacion: 'crear', carreraId, marco });
          return atributo({ carreraId, marco, codigo, nombre, orden });
        },
      },
    });

    const creado = await caso.crear(ACTOR, IIN, 'AG-I12', 'Pensamiento sistémico');

    expect(creado.orden).toBe(4);
    expect(vistos).toEqual([
      { operacion: 'codigoExiste', carreraId: IIN, marco: 'ICACIT' },
      { operacion: 'ultimoOrden', carreraId: IIN, marco: 'ICACIT' },
      { operacion: 'crear', carreraId: IIN, marco: 'ICACIT' },
    ]);
  });

  it('rechaza un código repetido dentro de la carrera, sin publicar nada', async () => {
    const { caso, publicados } = montarAtributos({ repo: { codigoExiste: async () => true } });

    await expect(caso.crear(ACTOR, ISI, 'AG-I01', 'Duplicado')).rejects.toThrow(
      'Ya existe un atributo del graduado con el código AG-I01 en la carrera',
    );
    expect(publicados).toHaveLength(0);
  });

  it('rechaza un nombre en blanco', async () => {
    const { caso } = montarAtributos();

    await expect(caso.crear(ACTOR, ISI, 'AG-I12', '   ')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('autoriza la gestión contra la carrera donde se crea', async () => {
    const { caso, autorizaciones } = montarAtributos();

    await caso.crear(ACTOR, ISI, 'AG-I12', 'Pensamiento sistémico');

    expect(autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: ISI });
  });
});

describe('Orden de comprobación al crear y al listar (RF-CH-027, RF-CH-028)', () => {
  it('(1) sin permiso de lectura: AccesoDenegado, antes de mirar la carrera', async () => {
    const { caso, autorizaciones } = montarAtributos({
      permitido: false,
      carreraExiste: false,
    });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizaciones).toEqual([{ permiso: 'atributo.leer', carreraId: null }]);
  });

  it('(2) una carrera inexistente es NoEncontrado, también para quien no gestiona', async () => {
    const { caso, autorizaciones } = montarAtributos({
      carreraExiste: false,
      permitido: (permiso) => permiso === 'atributo.leer',
    });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, ISI, 'AG-I12', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'atributo.gestionar')).toBe(false);
  });

  it('(2) quien lee solo su carrera y pide otra recibe NoEncontrado, nunca AccesoDenegado', async () => {
    const { caso, autorizaciones } = montarAtributos({
      alcance: soloCarrera(ISI),
      // Aunque tampoco pudiera gestionar: el 404 va antes que el 403.
      permitido: (permiso) => permiso === 'atributo.leer',
    });

    await expect(caso.listar(ACTOR, IIN)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, IIN, 'AG-I12', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'atributo.gestionar')).toBe(false);
  });

  it('(2) quien lee solo su carrera y no tiene ninguna asignada no ve ninguna', async () => {
    const { caso } = montarAtributos({ alcance: soloCarrera(null) });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('(3) el Coordinador lee otra carrera (alcance TODAS) pero no escribe en ella: AccesoDenegado', async () => {
    const { caso } = montarAtributos({ permitido: SOLO_GESTIONA_ISI });

    // DEJA CONSTANCIA: el alcance de lectura del Coordinador no lo limita a su
    // carrera (la marca `lectura.solo_su_carrera` es solo del Director).
    await expect(caso.listar(ACTOR, IIN)).resolves.toHaveLength(1);
    await expect(caso.crear(ACTOR, IIN, 'AG-I12', 'Nuevo')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('(3) antes del 409: sin permiso de gestión no se llega a mirar el código repetido', async () => {
    let comprobo = false;
    const { caso } = montarAtributos({
      permitido: SOLO_GESTIONA_ISI,
      repo: {
        codigoExiste: async () => {
          comprobo = true;
          return true;
        },
      },
    });

    await expect(caso.crear(ACTOR, IIN, 'AG-I01', 'Duplicado')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(comprobo).toBe(false);
  });
});

describe('RF121 — editar atributo del graduado', () => {
  it('actualiza código y nombre y lo audita', async () => {
    const { caso, publicados } = montarAtributos();

    const editado = await caso.editar(
      ACTOR,
      'atr-1',
      'AG-I02',
      'Diseño y desarrollo de soluciones',
    );

    expect(editado.nombre).toBe('Diseño y desarrollo de soluciones');
    expect(publicados).toHaveLength(1);
  });

  it('falla si el atributo no existe', async () => {
    const { caso } = montarAtributos({ repo: { porId: async () => null } });

    await expect(caso.editar(ACTOR, 'atr-9', 'AG-I02', 'Nombre')).rejects.toThrow(NoEncontrado);
  });

  it('el código propio no cuenta como duplicado, y se revalida en la carrera del atributo', async () => {
    // `codigoExiste` recibe `exceptoId`; si el caso de uso no lo pasa, guardar
    // sin cambiar el código fallaría contra el propio registro.
    let recibido: { carreraId: string; exceptoId: string | undefined } | null = null;
    const { caso } = montarAtributos({
      repo: {
        porId: async () => atributo({ carreraId: IIN }),
        codigoExiste: async (carreraId, _marco, _codigo, exceptoId) => {
          recibido = { carreraId, exceptoId };
          return false;
        },
      },
    });

    await caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Conocimientos de ingeniería');

    expect(recibido).toEqual({ carreraId: IIN, exceptoId: 'atr-1' });
  });

  it('autoriza la gestión contra la carrera del atributo, no contra una que llegue de fuera', async () => {
    const { caso, autorizaciones } = montarAtributos({
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Nombre');

    expect(autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: IIN });
  });

  it('el atributo de otra carrera, para quien lee solo la suya, es NoEncontrado y no se escribe', async () => {
    let escribio = false;
    const { caso } = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: {
        porId: async () => atributo({ carreraId: IIN }),
        actualizar: async (id, codigo, nombre) => {
          escribio = true;
          return atributo({ id, codigo, nombre });
        },
      },
    });

    await expect(caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Nombre')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(escribio).toBe(false);
  });

  it('el Coordinador de otra carrera recibe AccesoDenegado al editar', async () => {
    const { caso } = montarAtributos({
      permitido: SOLO_GESTIONA_ISI,
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await expect(caso.editar(ACTOR, 'atr-1', 'AG-I01', 'Nombre')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });
});

describe('RF122 y RF128 — listar y buscar', () => {
  it('pide los atributos de la carrera indicada y propaga el filtro de texto', async () => {
    let recibido: { carreraId: string; filtro: FiltroAcreditacion | undefined } | null = null;
    const { caso } = montarAtributos({
      repo: {
        listar: async (carreraId, _marco, filtro) => {
          recibido = { carreraId, filtro };
          return [];
        },
      },
    });

    await caso.listar(ACTOR, IIN, { texto: 'ingeniería' });

    expect(recibido).toEqual({ carreraId: IIN, filtro: { texto: 'ingeniería' } });
  });

  it('una carrera sin atributos devuelve la lista vacía, no un error (flujo alterno de RF-CH-028)', async () => {
    const { caso } = montarAtributos({ repo: { listar: async () => [] } });

    expect(await caso.listar(ACTOR, ISI)).toEqual([]);
  });

  it('porId: el atributo de otra carrera, para quien lee solo la suya, es NoEncontrado', async () => {
    const { caso } = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await expect(caso.porId(ACTOR, 'atr-1')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('RF123 — inactivar atributo del graduado', () => {
  it('el impacto se consulta antes de escribir y queda en el evento', async () => {
    const orden: string[] = [];
    const { caso, publicados } = montarAtributos({
      repo: {
        impactoDeInactivar: async () => {
          orden.push('impacto');
          return { competenciasVinculadas: 3, planesVinculados: 1 };
        },
        cambiarEstado: async (id, activo) => {
          orden.push('escritura');
          return atributo({ id, activo });
        },
      },
    });

    await caso.cambiarEstado(ACTOR, 'atr-1', false);

    expect(orden).toEqual(['impacto', 'escritura']);
    expect(publicados[0]?.detalle).toContain('3 competencias');
  });

  it('reactivar no consulta impacto', async () => {
    let consultado = false;
    const { caso } = montarAtributos({
      repo: {
        porId: async () => atributo({ activo: false }),
        impactoDeInactivar: async () => {
          consultado = true;
          return { competenciasVinculadas: 0, planesVinculados: 0 };
        },
      },
    });

    await caso.cambiarEstado(ACTOR, 'atr-1', true);

    expect(consultado).toBe(false);
  });

  it('no permite inactivar lo que ya está inactivo', async () => {
    const { caso } = montarAtributos({ repo: { porId: async () => atributo({ activo: false }) } });

    await expect(caso.cambiarEstado(ACTOR, 'atr-1', false)).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('consultar el impacto exige solo permiso de lectura, nunca el de gestión', async () => {
    // Consultar qué se rompería no rompe nada: pedir aquí el permiso de gestión
    // dejaría sin el aviso a quien puede ver la pantalla.
    const { caso, autorizaciones } = montarAtributos();

    await caso.impactoDeInactivar(ACTOR, 'atr-1');

    expect(autorizaciones.map((a) => a.permiso)).toEqual(['atributo.leer']);
  });

  it('el impacto de un atributo de otra carrera, para quien lee solo la suya, es NoEncontrado', async () => {
    const { caso } = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: { porId: async () => atributo({ carreraId: IIN }) },
    });

    await expect(caso.impactoDeInactivar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('RF122 — atributos declarados por un plan', () => {
  it('delPlan: un plan inexistente o de otra carrera (para quien lee solo la suya) es NoEncontrado', async () => {
    const inexistente = montarAtributos({ plan: null });
    await expect(inexistente.caso.delPlan(ACTOR, 'plan-9')).rejects.toBeInstanceOf(NoEncontrado);

    const ajeno = montarAtributos({ plan: plan({ carreraId: IIN }), alcance: soloCarrera(ISI) });
    await expect(ajeno.caso.delPlan(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('reemplaza el conjunto completo y audita el antes y el después', async () => {
    const { caso, publicados } = montarAtributos({
      repo: {
        delPlan: async () => [atributo({ codigo: 'AG-I01' })],
        declararEnPlan: async () => [atributo({ codigo: 'AG-I02' })],
      },
    });

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-2']);

    expect(publicados[0]?.detalle).toContain('AG-I01');
    expect(publicados[0]?.detalle).toContain('AG-I02');
  });

  it('valida los atributos contra la carrera del plan: los de otra carrera, inexistentes o inactivos dan 409', async () => {
    let consultada: { carreraId: string; ids: readonly string[] } | null = null;
    let escribio = false;
    const { caso, publicados } = montarAtributos({
      plan: plan({ carreraId: ISI }),
      repo: {
        noUtilizablesEnCarrera: async (carreraId, ids) => {
          consultada = { carreraId, ids };
          return ['atr-ajeno'];
        },
        declararEnPlan: async () => {
          escribio = true;
          return [];
        },
      },
    });

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', ['atr-ajeno', 'atr-1'])).rejects.toThrow(
      'Estos atributos del graduado no existen, están inactivos o no son de la carrera del plan: atr-ajeno.',
    );
    expect(consultada).toEqual({ carreraId: ISI, ids: ['atr-ajeno', 'atr-1'] });
    expect(escribio).toBe(false);
    expect(publicados).toHaveLength(0);
  });

  it('autoriza la gestión contra la carrera del plan, y sin permiso no valida ni escribe', async () => {
    let validó = false;
    const { caso, autorizaciones } = montarAtributos({
      plan: plan({ carreraId: IIN }),
      permitido: SOLO_GESTIONA_ISI,
      repo: {
        noUtilizablesEnCarrera: async () => {
          validó = true;
          return [];
        },
      },
    });

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', ['atr-1'])).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: IIN });
    expect(validó).toBe(false);
  });

  it('un plan fuera del alcance de lectura es NoEncontrado antes de pedir el permiso de gestión', async () => {
    const { caso, autorizaciones } = montarAtributos({
      plan: plan({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });

    await expect(caso.declararEnPlan(ACTOR, 'plan-1', [])).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'atributo.gestionar')).toBe(false);
  });

  it('un identificador repetido no llega dos veces al repositorio', async () => {
    let recibidos: readonly string[] = [];
    const { caso } = montarAtributos({
      repo: {
        declararEnPlan: async (_planId, ids) => {
          recibidos = ids;
          return [];
        },
      },
    });

    await caso.declararEnPlan(ACTOR, 'plan-1', ['atr-1', 'atr-1']);

    expect(recibidos).toEqual(['atr-1']);
  });

  it('declarar la lista vacía deja el plan sin atributos y se audita como «ninguno»', async () => {
    const { caso, publicados } = montarAtributos({
      repo: {
        delPlan: async () => [atributo({ codigo: 'AG-I01' })],
        declararEnPlan: async () => [],
      },
    });

    await caso.declararEnPlan(ACTOR, 'plan-1', []);

    // «ninguno» y no un hueco: retirar el último atributo es un cambio que la
    // bitácora tiene que poder contar.
    expect(publicados[0]?.detalle).toContain('ninguno');
  });
});

describe('RF-CH-029 — eliminar atributo del graduado', () => {
  it('elimina el atributo libre y publica el evento después de borrar', async () => {
    const { caso, publicados, orden, eliminados } = montarAtributos({
      repo: { porId: async () => atributo({ id: 'atr-9', codigo: 'AG-I09', nombre: 'Diseño' }) },
    });

    await caso.eliminar(ACTOR, 'atr-9');

    expect(eliminados).toEqual(['atr-9']);
    // Después de borrar: la bitácora es append-only y no puede contar un borrado que no ocurrió.
    expect(orden).toEqual(['eliminar', 'eventos']);
    expect(publicados[0]?.nombre).toBe('acreditacion.atributo_eliminado');
    expect(publicados[0]?.detalle).toBe('Atributo del graduado AG-I09 «Diseño» eliminado.');
  });

  it.each([
    [{ competenciasVinculadas: 3, planesVinculados: 0 }, '3 competencias'],
    [{ competenciasVinculadas: 1, planesVinculados: 0 }, '1 competencia'],
    [{ competenciasVinculadas: 0, planesVinculados: 2 }, '2 planes de estudio'],
    [{ competenciasVinculadas: 0, planesVinculados: 1 }, '1 plan de estudio'],
    [{ competenciasVinculadas: 4, planesVinculados: 2 }, '4 competencias, 2 planes de estudio'],
  ])(
    'en uso (%j): 409 con el motivo y la sugerencia de inactivar, sin tocar nada',
    async (uso, motivo) => {
      const { caso, publicados, eliminados } = montarAtributos({
        repo: { impactoDeInactivar: async () => uso },
      });

      await expect(caso.eliminar(ACTOR, 'atr-1')).rejects.toThrow(
        `No se puede eliminar el atributo AG-I01: está en uso (${motivo}). Inactívalo si ya no debe usarse.`,
      );
      expect(eliminados).toEqual([]);
      expect(publicados).toHaveLength(0);
    },
  );

  it('un atributo inactivo en uso tampoco se elimina: inactivar no libera', async () => {
    const { caso, eliminados } = montarAtributos({
      repo: {
        porId: async () => atributo({ activo: false }),
        impactoDeInactivar: async () => ({ competenciasVinculadas: 1, planesVinculados: 0 }),
      },
    });

    await expect(caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(eliminados).toEqual([]);
  });

  it('(1)(2)(3) el orden de comprobación: sin lectura, 403; fuera de alcance, 404; sin gestión, 403; y nunca se cuenta el uso antes', async () => {
    let contó = 0;
    const contar = {
      impactoDeInactivar: async () => {
        contó += 1;
        return { competenciasVinculadas: 0, planesVinculados: 0 };
      },
    };

    const sinLectura = montarAtributos({ permitido: false, repo: contar });
    await expect(sinLectura.caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(AccesoDenegado);

    const fuera = montarAtributos({
      alcance: soloCarrera(ISI),
      repo: { ...contar, porId: async () => atributo({ carreraId: IIN }) },
      permitido: (permiso) => permiso === 'atributo.leer',
    });
    await expect(fuera.caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(NoEncontrado);

    const ajeno = montarAtributos({
      permitido: SOLO_GESTIONA_ISI,
      repo: { ...contar, porId: async () => atributo({ carreraId: IIN }) },
    });
    await expect(ajeno.caso.eliminar(ACTOR, 'atr-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(ajeno.autorizaciones).toContainEqual({ permiso: 'atributo.gestionar', carreraId: IIN });

    expect(contó).toBe(0);
    expect(sinLectura.eliminados.length + fuera.eliminados.length + ajeno.eliminados.length).toBe(
      0,
    );
  });

  it('carrera crítica: si en la transacción el atributo ya está en uso, 409 y nada se borra', async () => {
    const { caso, publicados } = montarAtributos({ repo: { eliminar: async () => false } });

    await expect(caso.eliminar(ACTOR, 'atr-1')).rejects.toThrow(
      'El atributo AG-I01 cambió mientras se eliminaba: ahora está en uso o ya no existe. No se borró nada.',
    );
    // Un borrado que no ocurrió no deja evento.
    expect(publicados).toHaveLength(0);
  });
});
