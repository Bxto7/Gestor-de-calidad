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
import type { AcademicoCrossModuloPort } from '../../../academico/application/ports/academico-cross-modulo.port.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { CriterioEnUsoPort } from '../ports/criterio-en-uso.port.js';
import type { DatosCriterio, RepositorioCriterioPort } from '../ports/criterios.port.js';
import { GestionarCriterios } from './gestionar-criterios.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

const ISI = 'car-1';
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

/** Un Coordinador de ISI: lee todo, solo gestiona lo de ISI. */
const SOLO_GESTIONA_ISI = (permiso: string, carreraId: string | null): boolean =>
  permiso === 'criterio.gestionar' ? carreraId === ISI : true;

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
    /** `false` deniega todo; una función decide por permiso y carrera. */
    permitido?: boolean | ((permiso: string, carreraId: string | null) => boolean);
    /** Lo que responde Mejora Continua. */
    planesDeMejora?: number;
    carreraExiste?: boolean;
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const orden: string[] = [];
  const eliminados: string[] = [];
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
    eliminar: async (id) => {
      orden.push('eliminar');
      eliminados.push(id);
    },
    ...opciones.repo,
  };

  const enUso: CriterioEnUsoPort = {
    contarPlanesDeMejora: async (id) => {
      consultasEnUso.push(id);
      return opciones.planesDeMejora ?? 0;
    },
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
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = {
    publicar: async (e) => {
      orden.push('eventos');
      publicados.push(...e);
    },
  };

  const caso = new GestionarCriterios(
    repo,
    carreras,
    enUso,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );
  return { caso, publicados, autorizaciones, consultasEnUso, orden, eliminados };
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

describe('Orden de comprobación (RF-CH-030, RF-CH-031)', () => {
  it('(1) sin permiso de lectura: AccesoDenegado, antes de mirar la carrera', async () => {
    const { caso, autorizaciones } = montarCriterios({ permitido: false, carreraExiste: false });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(autorizaciones).toEqual([{ permiso: 'criterio.leer', carreraId: null }]);
  });

  it('(2) una carrera inexistente es NoEncontrado al listar y al crear', async () => {
    const { caso, autorizaciones } = montarCriterios({
      carreraExiste: false,
      permitido: (permiso) => permiso === 'criterio.leer',
    });

    await expect(caso.listar(ACTOR, ISI)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, ISI, 'C-02', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'criterio.gestionar')).toBe(false);
  });

  it('(2) quien lee solo su carrera y pide otra recibe NoEncontrado, nunca AccesoDenegado', async () => {
    const { caso, autorizaciones } = montarCriterios({
      alcance: soloCarrera(ISI),
      permitido: (permiso) => permiso === 'criterio.leer',
    });

    await expect(caso.listar(ACTOR, IIN)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.crear(ACTOR, IIN, 'C-02', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
    expect(autorizaciones.some((a) => a.permiso === 'criterio.gestionar')).toBe(false);
  });

  it('(3) el Coordinador lee otra carrera (alcance TODAS) pero no escribe en ella: AccesoDenegado', async () => {
    const { caso } = montarCriterios({ permitido: SOLO_GESTIONA_ISI });

    // DEJA CONSTANCIA: el alcance de lectura del Coordinador no lo limita a su carrera.
    await expect(caso.listar(ACTOR, IIN)).resolves.toHaveLength(1);
    await expect(caso.crear(ACTOR, IIN, 'C-02', 'Nuevo')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('(3) antes del 409: sin permiso de gestión no se llega a mirar el código repetido', async () => {
    let comprobo = false;
    const { caso } = montarCriterios({
      permitido: SOLO_GESTIONA_ISI,
      repo: {
        codigoExiste: async () => {
          comprobo = true;
          return true;
        },
      },
    });

    await expect(caso.crear(ACTOR, IIN, 'C-01', 'Duplicado')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(comprobo).toBe(false);
  });

  it('una carrera sin criterios devuelve la lista vacía, no un error (flujo alterno de RF-CH-031)', async () => {
    const { caso } = montarCriterios({ repo: { listar: async () => [] } });

    expect(await caso.listar(ACTOR, ISI)).toEqual([]);
  });
});

describe('Operaciones por id: alcance de la fila y gestión contra su carrera', () => {
  const deOtraCarrera = { porId: async () => criterio({ carreraId: IIN }) };

  it('porId: el criterio de otra carrera, para quien lee solo la suya, es NoEncontrado', async () => {
    const { caso } = montarCriterios({ alcance: soloCarrera(ISI), repo: deOtraCarrera });

    await expect(caso.porId(ACTOR, 'cri-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('editar y cambiar el estado: fuera de alcance es NoEncontrado y no se escribe nada', async () => {
    let escribio = false;
    const { caso, publicados } = montarCriterios({
      alcance: soloCarrera(ISI),
      repo: {
        ...deOtraCarrera,
        actualizar: async (id, codigo, nombre) => {
          escribio = true;
          return criterio({ id, codigo, nombre });
        },
        cambiarEstado: async (id, activo) => {
          escribio = true;
          return criterio({ id, activo });
        },
      },
    });

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', 'Nombre')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toBeInstanceOf(NoEncontrado);
    expect(escribio).toBe(false);
    expect(publicados).toHaveLength(0);
  });

  it('el Coordinador de otra carrera recibe AccesoDenegado al editar y al cambiar el estado', async () => {
    const { caso, autorizaciones } = montarCriterios({
      permitido: SOLO_GESTIONA_ISI,
      repo: deOtraCarrera,
    });

    await expect(caso.editar(ACTOR, 'cri-1', 'C-01', 'Nombre')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    await expect(caso.cambiarEstado(ACTOR, 'cri-1', false)).rejects.toBeInstanceOf(AccesoDenegado);
    // Se autoriza contra la carrera de la fila, no contra una que llegue de fuera.
    expect(autorizaciones).toContainEqual({ permiso: 'criterio.gestionar', carreraId: IIN });
  });

  it('el impacto de un criterio de otra carrera, para quien lee solo la suya, es NoEncontrado y no pregunta a Mejora Continua', async () => {
    const { caso, consultasEnUso } = montarCriterios({
      alcance: soloCarrera(ISI),
      repo: deOtraCarrera,
    });

    await expect(caso.impactoDeInactivar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(consultasEnUso).toEqual([]);
  });

  it('el impacto exige solo permiso de lectura, nunca el de gestión', async () => {
    const { caso, autorizaciones } = montarCriterios();

    await caso.impactoDeInactivar(ACTOR, 'cri-1');

    expect(autorizaciones.map((a) => a.permiso)).toEqual(['criterio.leer']);
  });
});

describe('RF-CH-032 — eliminar criterio de acreditación', () => {
  it('elimina el criterio sin planes de mejora y publica el evento antes de borrar', async () => {
    const { caso, publicados, orden, eliminados, consultasEnUso } = montarCriterios({
      repo: { porId: async () => criterio({ id: 'cri-9', codigo: 'C-09', nombre: 'Gestión' }) },
    });

    await caso.eliminar(ACTOR, 'cri-9');

    expect(consultasEnUso).toEqual(['cri-9']);
    expect(eliminados).toEqual(['cri-9']);
    expect(orden).toEqual(['eventos', 'eliminar']);
    expect(publicados[0]?.nombre).toBe('acreditacion.criterio_eliminado');
    expect(publicados[0]?.detalle).toBe('Criterio de acreditación C-09 «Gestión» eliminado.');
  });

  it.each([
    [1, '1 plan de mejora'],
    [2, '2 planes de mejora'],
  ])(
    'con %i plan(es) de mejora: 409 con el motivo y la sugerencia de inactivar, sin tocar nada',
    async (n, motivo) => {
      const { caso, publicados, eliminados } = montarCriterios({ planesDeMejora: n });

      await expect(caso.eliminar(ACTOR, 'cri-1')).rejects.toThrow(
        `No se puede eliminar el criterio C-01: está en uso (${motivo}). Inactívalo si ya no debe usarse.`,
      );
      expect(eliminados).toEqual([]);
      expect(publicados).toHaveLength(0);
    },
  );

  it('(1)(2)(3) el orden de comprobación, y Mejora Continua solo se consulta al final', async () => {
    const sinLectura = montarCriterios({ permitido: false });
    await expect(sinLectura.caso.eliminar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(AccesoDenegado);

    const fuera = montarCriterios({
      alcance: soloCarrera(ISI),
      repo: { porId: async () => criterio({ carreraId: IIN }) },
      permitido: (permiso) => permiso === 'criterio.leer',
    });
    await expect(fuera.caso.eliminar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(NoEncontrado);

    const ajeno = montarCriterios({
      permitido: SOLO_GESTIONA_ISI,
      repo: { porId: async () => criterio({ carreraId: IIN }) },
    });
    await expect(ajeno.caso.eliminar(ACTOR, 'cri-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(ajeno.autorizaciones).toContainEqual({ permiso: 'criterio.gestionar', carreraId: IIN });

    for (const r of [sinLectura, fuera, ajeno]) {
      expect(r.consultasEnUso).toEqual([]);
      expect(r.eliminados).toEqual([]);
    }
  });

  it('un criterio inexistente es NoEncontrado', async () => {
    const { caso } = montarCriterios({ repo: { porId: async () => null } });

    await expect(caso.eliminar(ACTOR, 'cri-9')).rejects.toBeInstanceOf(NoEncontrado);
  });
});
