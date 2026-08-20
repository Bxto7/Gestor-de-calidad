/**
 * Pruebas del catálogo institucional.
 *
 * El foco está en la frontera entre inactivar y eliminar, que es donde este
 * caso de uso puede hacer daño: borrar algo que un plan histórico ya usaba
 * dejaría ese plan describiendo un objetivo que no existe.
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
  DatosCompetencia,
  DatosObjetivo,
  FiltroCatalogo,
  RepositorioCompetenciaPort,
  RepositorioObjetivoPort,
} from '../ports/catalogo.port.js';
import { GestionarCompetencias, GestionarObjetivos } from './gestionar-catalogo.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

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

/* ── Objetivos educacionales ──────────────────────────────────────────── */

function objetivo(sobre: Partial<DatosObjetivo> = {}): DatosObjetivo {
  return {
    id: 'obj-1',
    codigo: 'OE-01',
    nombre: 'Formar profesionales íntegros',
    descripcion: 'Descripción sintética del objetivo educacional.',
    activo: true,
    planesVinculados: 0,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function montarObjetivos(
  opciones: {
    existente?: DatosObjetivo | null;
    nombreDuplicado?: boolean;
    codigos?: string[];
    autorizacion?: AuthorizationPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creados: { codigo: string; nombre: string }[] = [];
  const eliminados: string[] = [];
  const filtros: (FiltroCatalogo | undefined)[] = [];
  const exclusiones: (string | undefined)[] = [];

  const repo: RepositorioObjetivoPort = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return [objetivo()];
    },
    porId: async () => (opciones.existente === undefined ? objetivo() : opciones.existente),
    codigos: async () => opciones.codigos ?? [],
    crear: async (codigo, nombre, descripcion) => {
      creados.push({ codigo, nombre });
      return objetivo({ codigo, nombre, descripcion });
    },
    actualizar: async (_id, nombre, descripcion) => objetivo({ nombre, descripcion }),
    cambiarEstado: async (_id, activo) => objetivo({ activo }),
    eliminar: async (id) => void eliminados.push(id),
    existeNombre: async (_nombre, idIgnorado) => {
      exclusiones.push(idIgnorado);
      return opciones.nombreDuplicado ?? false;
    },
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarObjetivos(repo, opciones.autorizacion ?? permitirTodo(), eventos);

  return { caso, publicados, creados, eliminados, filtros, exclusiones };
}

describe('RF033 / RF034 — registrar objetivo', () => {
  it('genera el primer código correlativo', async () => {
    const { caso, creados } = montarObjetivos({ codigos: [] });
    await caso.crear(ACTOR, 'Formar profesionales íntegros', 'Descripción suficiente.');
    expect(creados[0]?.codigo).toBe('OE-01');
  });

  it('continúa el correlativo', async () => {
    const { caso, creados } = montarObjetivos({ codigos: ['OE-01', 'OE-02'] });
    await caso.crear(ACTOR, 'Otro objetivo', 'Descripción suficiente.');
    expect(creados[0]?.codigo).toBe('OE-03');
  });

  it('RN1: exige nombre y descripción', async () => {
    const { caso } = montarObjetivos();
    await expect(caso.crear(ACTOR, '   ', 'Descripción.')).rejects.toThrow(/nombre .* obligatorio/);
    await expect(caso.crear(ACTOR, 'Objetivo', '  ')).rejects.toThrow(/descripción .* obligatoria/);
  });

  it('colapsa los espacios internos del nombre', async () => {
    const { caso, creados } = montarObjetivos();
    await caso.crear(ACTOR, 'Formar   profesionales', 'Descripción suficiente.');
    expect(creados[0]?.nombre).toBe('Formar profesionales');
  });

  it('rechaza un nombre repetido', async () => {
    const { caso, creados } = montarObjetivos({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'Repetido', 'Descripción.')).rejects.toThrow(/Ya existe otro/);
    expect(creados).toHaveLength(0);
  });

  it('el alta queda en la bitácora', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.crear(ACTOR, 'Formar profesionales', 'Descripción suficiente.');
    expect(publicados[0]?.nombre).toBe('catalogo.creado');
    expect(publicados[0]?.entidad).toBe('Objetivo');
    expect(publicados[0]?.detalle).toContain('Objetivo educacional OE-01');
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, creados } = montarObjetivos({ autorizacion: denegar() });
    await expect(caso.crear(ACTOR, 'Objetivo', 'Descripción.')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(creados).toHaveLength(0);
  });
});

describe('RF036 — editar objetivo', () => {
  it('404 si no existe', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.editar(ACTOR, 'x', 'Nombre', 'Descripción.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('se excluye a sí mismo de la comprobación de nombre', async () => {
    const { caso, exclusiones } = montarObjetivos();
    await caso.editar(ACTOR, 'obj-1', 'Formar profesionales íntegros', 'Descripción.');
    expect(exclusiones).toEqual(['obj-1']);
  });

  it('la bitácora conserva el nombre anterior', async () => {
    const { caso, publicados } = montarObjetivos({ existente: objetivo({ nombre: 'Antiguo' }) });
    await caso.editar(ACTOR, 'obj-1', 'Nuevo nombre', 'Descripción suficiente.');
    expect(publicados[0]?.detalle).toContain('«Antiguo» → «Nuevo nombre»');
  });

  it('registra el cambio de descripción sin volcar el texto', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.editar(
      ACTOR,
      'obj-1',
      'Formar profesionales íntegros',
      'Una descripción completamente distinta.',
    );
    expect(publicados[0]?.detalle).toContain('se actualizó la descripción');
    expect(publicados[0]?.detalle).not.toContain('completamente distinta');
  });

  it('guardar sin cambios lo dice', async () => {
    const { caso, publicados } = montarObjetivos();
    const actual = objetivo();
    await caso.editar(ACTOR, 'obj-1', actual.nombre, actual.descripcion);
    expect(publicados[0]?.detalle).toContain('sin cambios');
  });
});

describe('RF037 / RF038 — inactivar frente a eliminar', () => {
  it('inactivar funciona aunque haya planes usándolo', async () => {
    // Es justamente para eso: retirarlo de uso futuro sin tocar el histórico.
    const { caso } = montarObjetivos({ existente: objetivo({ planesVinculados: 3 }) });
    const r = await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(r.activo).toBe(false);
  });

  it('la bitácora anota cuántos vínculos tenía al inactivarse', async () => {
    const { caso, publicados } = montarObjetivos({ existente: objetivo({ planesVinculados: 3 }) });
    await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(publicados[0]?.detalle).toContain('3 vínculo(s)');
  });

  it('sin vínculos no añade ruido al detalle', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(publicados[0]?.detalle).not.toContain('vínculo');
  });

  it('RF038: eliminar uno sin vínculos sí se permite', async () => {
    const { caso, eliminados } = montarObjetivos({ existente: objetivo({ planesVinculados: 0 }) });
    await caso.eliminar(ACTOR, 'obj-1');
    expect(eliminados).toEqual(['obj-1']);
  });

  it('RF038 RN1: eliminar uno vinculado se rechaza', async () => {
    // Borrarlo dejaría a un plan histórico describiendo un objetivo inexistente.
    const { caso, eliminados } = montarObjetivos({ existente: objetivo({ planesVinculados: 2 }) });
    await expect(caso.eliminar(ACTOR, 'obj-1')).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(eliminados).toHaveLength(0);
  });

  it('el rechazo propone inactivar como alternativa', async () => {
    const { caso } = montarObjetivos({ existente: objetivo({ planesVinculados: 2 }) });
    await expect(caso.eliminar(ACTOR, 'obj-1')).rejects.toThrow(/Inactívalo/);
  });

  it('el borrado se audita antes de perder el registro', async () => {
    // Después de borrar, el código y el nombre ya no existen en ninguna parte:
    // el evento es lo único que quedará de ese objetivo.
    const { caso, publicados } = montarObjetivos();
    await caso.eliminar(ACTOR, 'obj-1');
    expect(publicados[0]?.nombre).toBe('catalogo.eliminado');
    expect(publicados[0]?.detalle).toContain('OE-01');
    expect(publicados[0]?.detalle).toContain('Formar profesionales íntegros');
  });

  it('404 al eliminar algo que no existe', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.eliminar(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('RF035 / RF039 — consulta de objetivos', () => {
  it('traslada el filtro al repositorio', async () => {
    const { caso, filtros } = montarObjetivos();
    await caso.listar(ACTOR, { texto: 'íntegros', activo: true });
    expect(filtros[0]).toEqual({ texto: 'íntegros', activo: true });
  });

  it('leer exige permiso', async () => {
    const { caso } = montarObjetivos({ autorizacion: denegar() });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('el detalle da 404 en vez de null', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.porId(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

/* ── Competencias ─────────────────────────────────────────────────────── */

function competencia(sobre: Partial<DatosCompetencia> = {}): DatosCompetencia {
  return {
    id: 'cpe-1',
    codigo: 'CPE-01',
    nombre: 'Resolver problemas de ingeniería',
    activa: true,
    planesVinculados: 0,
    asignaturasVinculadas: 0,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function montarCompetencias(
  opciones: {
    existente?: DatosCompetencia | null;
    nombreDuplicado?: boolean;
    codigos?: string[];
    autorizacion?: AuthorizationPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creadas: { codigo: string; nombre: string }[] = [];
  const eliminadas: string[] = [];

  const repo: RepositorioCompetenciaPort = {
    listar: async () => [competencia()],
    porId: async () => (opciones.existente === undefined ? competencia() : opciones.existente),
    codigos: async () => opciones.codigos ?? [],
    crear: async (codigo, nombre) => {
      creadas.push({ codigo, nombre });
      return competencia({ codigo, nombre });
    },
    actualizar: async (_id, nombre) => competencia({ nombre }),
    cambiarEstado: async (_id, activa) => competencia({ activa }),
    eliminar: async (id) => void eliminadas.push(id),
    existeNombre: async () => opciones.nombreDuplicado ?? false,
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarCompetencias(repo, opciones.autorizacion ?? permitirTodo(), eventos);

  return { caso, publicados, creadas, eliminadas };
}

describe('RF040 / RF041 — registrar competencia', () => {
  it('genera el código correlativo con su propio prefijo', async () => {
    const { caso, creadas } = montarCompetencias({ codigos: ['CPE-01'] });
    await caso.crear(ACTOR, 'Diseñar sistemas de software');
    expect(creadas[0]?.codigo).toBe('CPE-02');
  });

  it('RN1: el nombre es obligatorio', async () => {
    const { caso } = montarCompetencias();
    await expect(caso.crear(ACTOR, '   ')).rejects.toThrow(/nombre .* obligatorio/);
  });

  it('rechaza un nombre repetido', async () => {
    const { caso, creadas } = montarCompetencias({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'Repetida')).rejects.toThrow(/Ya existe otra/);
    expect(creadas).toHaveLength(0);
  });

  it('el evento la identifica como Competencia', async () => {
    const { caso, publicados } = montarCompetencias();
    await caso.crear(ACTOR, 'Resolver problemas');
    expect(publicados[0]?.entidad).toBe('Competencia');
    expect(publicados[0]?.detalle).toContain('Competencia CPE-01');
  });
});

describe('RF044 / RF045 — inactivar frente a eliminar', () => {
  it('suma los dos tipos de vínculo al auditar la inactivación', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 1, asignaturasVinculadas: 4 }),
    });
    await caso.cambiarEstado(ACTOR, 'cpe-1', false);
    expect(publicados[0]?.detalle).toContain('5 vínculo(s)');
  });

  it('RF045: eliminar una sin usar se permite', async () => {
    const { caso, eliminadas } = montarCompetencias();
    await caso.eliminar(ACTOR, 'cpe-1');
    expect(eliminadas).toEqual(['cpe-1']);
  });

  it('el rechazo dice de dónde vienen los vínculos', async () => {
    // "Está en uso" obligaría a buscar a ciegas dónde.
    const { caso } = montarCompetencias({
      existente: competencia({ asignaturasVinculadas: 4, planesVinculados: 1 }),
    });
    await expect(caso.eliminar(ACTOR, 'cpe-1')).rejects.toThrow(/4 asignatura\(s\) y 1 plan\(es\)/);
  });

  it('menciona solo el tipo de vínculo que existe', async () => {
    const { caso } = montarCompetencias({
      existente: competencia({ asignaturasVinculadas: 2, planesVinculados: 0 }),
    });
    await expect(caso.eliminar(ACTOR, 'cpe-1')).rejects.toThrow(/2 asignatura\(s\)\./);
  });

  it('un solo vínculo en un plan también bloquea', async () => {
    const { caso, eliminadas } = montarCompetencias({
      existente: competencia({ planesVinculados: 1 }),
    });
    await expect(caso.eliminar(ACTOR, 'cpe-1')).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(eliminadas).toHaveLength(0);
  });

  it('el borrado deja constancia de lo que desaparece', async () => {
    const { caso, publicados } = montarCompetencias();
    await caso.eliminar(ACTOR, 'cpe-1');
    expect(publicados[0]?.detalle).toContain('CPE-01');
    expect(publicados[0]?.detalle).toContain('Resolver problemas de ingeniería');
  });
});

describe('RF043 / RF042 — edición y consulta de competencias', () => {
  it('404 al editar una inexistente', async () => {
    const { caso } = montarCompetencias({ existente: null });
    await expect(caso.editar(ACTOR, 'x', 'Nombre')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('la bitácora conserva el nombre anterior', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ nombre: 'Nombre antiguo' }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Nombre nuevo');
    expect(publicados[0]?.detalle).toContain('«Nombre antiguo» → «Nombre nuevo»');
  });

  it('leer exige permiso', async () => {
    const { caso } = montarCompetencias({ autorizacion: denegar() });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
