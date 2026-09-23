/**
 * Pruebas de los casos de uso de facultades.
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
import type { DatosFacultad, RepositorioFacultadPort } from '../ports/academico.port.js';
import { GestionarFacultades } from './gestionar-facultades.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Administrador del sistema' };

function facultad(sobre: Partial<DatosFacultad> = {}): DatosFacultad {
  return {
    id: 'fac-1',
    nombre: 'Ingeniería',
    activa: true,
    creadoEn: new Date('2026-01-01'),
    totalCarreras: 2,
    ...sobre,
  };
}

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };
}

function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };
}

/* ── Facultades ───────────────────────────────────────────────────────── */

function montarFacultades(opciones: {
  existente?: DatosFacultad | null;
  nombreDuplicado?: boolean;
  autorizacion?: AuthorizationPort;
}) {
  const publicados: DomainEvent[] = [];
  const creados: string[] = [];
  const exclusiones: (string | undefined)[] = [];
  const filtros: unknown[] = [];

  const repo: RepositorioFacultadPort = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return [facultad()];
    },
    porId: async () => opciones.existente ?? null,
    crear: async (nombre) => {
      creados.push(nombre);
      return facultad({ nombre, totalCarreras: 0 });
    },
    renombrar: async (_id, nombre) => facultad({ nombre }),
    cambiarEstado: async (_id, activa) => facultad({ activa }),
    existeNombre: async (_nombre, idIgnorado) => {
      exclusiones.push(idIgnorado);
      return opciones.nombreDuplicado ?? false;
    },
    impactoDeInactivar: async () => ({ carreras: 2, planesVigentes: 1 }),
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarFacultades(repo, opciones.autorizacion ?? permitirTodo(), eventos);
  return { caso, publicados, creados, exclusiones, filtros };
}

describe('RF001 — registrar facultad', () => {
  it('recorta espacios antes de guardar', async () => {
    const { caso, creados } = montarFacultades({});
    await caso.crear(ACTOR, '  Ingeniería  ');
    expect(creados).toEqual(['Ingeniería']);
  });

  it('colapsa los espacios internos antes de guardar', async () => {
    // La unicidad ya los ignora: si se guardara "Ciencias   de la Salud" tal
    // cual, la grafía correcta chocaría contra su propio duplicado y nadie
    // podría volver a escribirla bien.
    const { caso, creados } = montarFacultades({});
    await caso.crear(ACTOR, 'Ciencias   de la Salud');
    expect(creados).toEqual(['Ciencias de la Salud']);
  });

  it('rechaza un nombre vacío o solo con espacios', async () => {
    const { caso } = montarFacultades({});
    for (const nombre of ['', '   ']) {
      await expect(caso.crear(ACTOR, nombre)).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    }
  });

  it('RF006: rechaza un nombre duplicado', async () => {
    const { caso, creados } = montarFacultades({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'Ingeniería')).rejects.toThrow(/Ya existe una facultad/);
    expect(creados).toHaveLength(0);
  });

  it('emite el evento de creación para la bitácora', async () => {
    const { caso, publicados } = montarFacultades({});
    await caso.crear(ACTOR, 'Humanidades');
    expect(publicados[0]?.nombre).toBe('facultad.creada');
    expect(publicados[0]?.usuarioNombre).toBe('Administrador del sistema');
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, creados } = montarFacultades({ autorizacion: denegar() });
    await expect(caso.crear(ACTOR, 'Ingeniería')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(creados).toHaveLength(0);
  });
});

describe('RF002 — editar facultad', () => {
  it('404 si no existe', async () => {
    const { caso } = montarFacultades({ existente: null });
    await expect(caso.renombrar(ACTOR, 'x', 'Nuevo')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('RN1: no permite dejar el nombre vacío', async () => {
    const { caso } = montarFacultades({ existente: facultad() });
    await expect(caso.renombrar(ACTOR, 'fac-1', '   ')).rejects.toThrow(/vacío/);
  });

  it('RN2: el evento conserva el nombre anterior', async () => {
    // Un histórico que solo diga "se editó" no permite reconstruir el cambio.
    const { caso, publicados } = montarFacultades({ existente: facultad({ nombre: 'Ingeniera' }) });
    await caso.renombrar(ACTOR, 'fac-1', 'Ingeniería');
    expect(publicados[0]?.detalle).toContain('Ingeniera');
    expect(publicados[0]?.detalle).toContain('Ingeniería');
  });
});

describe('RF005 — inactivar facultad', () => {
  it('informa del impacto antes de confirmar', async () => {
    const { caso } = montarFacultades({ existente: facultad() });
    const impacto = await caso.impactoDeInactivar(ACTOR, 'fac-1');
    expect(impacto).toEqual({ carreras: 2, planesVigentes: 1 });
  });

  it('cambia el estado y lo registra', async () => {
    const { caso, publicados } = montarFacultades({ existente: facultad() });
    const r = await caso.cambiarEstado(ACTOR, 'fac-1', false);
    expect(r.activa).toBe(false);
    expect(publicados[0]?.detalle).toContain('inactivada');
  });

  it('reactivar también queda registrado', async () => {
    const { caso, publicados } = montarFacultades({ existente: facultad({ activa: false }) });
    await caso.cambiarEstado(ACTOR, 'fac-1', true);
    expect(publicados[0]?.detalle).toContain('reactivada');
  });
});

describe('RF002 — renombrar facultad', () => {
  it('RF006 también aplica al renombrar', async () => {
    const { caso } = montarFacultades({ existente: facultad(), nombreDuplicado: true });
    await expect(caso.renombrar(ACTOR, 'fac-1', 'Ciencias')).rejects.toThrow(/Ya existe otra/);
  });

  it('se excluye a sí misma de esa comprobación', async () => {
    // Sin el `idIgnorado`, reescribir el nombre corrigiendo un acento se
    // rechazaría a sí mismo: la facultad chocaría con su propio registro.
    const { caso, exclusiones } = montarFacultades({ existente: facultad() });
    await caso.renombrar(ACTOR, 'fac-1', 'Ingeniería');
    expect(exclusiones).toEqual(['fac-1']);
  });

  it('al crear no se excluye nada: no hay registro previo', async () => {
    const { caso, exclusiones } = montarFacultades({});
    await caso.crear(ACTOR, 'Ciencias');
    expect(exclusiones).toEqual([undefined]);
  });
});

describe('RF003 / RF007 — consulta de facultades', () => {
  it('traslada el filtro al repositorio', async () => {
    const { caso, filtros } = montarFacultades({});
    await caso.listar(ACTOR, { texto: 'inge', activa: true });
    expect(filtros).toEqual([{ texto: 'inge', activa: true }]);
  });

  it('leer también exige permiso', async () => {
    // Un plan de estudios no es público: hasta el listado pasa por RBAC.
    const { caso } = montarFacultades({ autorizacion: denegar() });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
