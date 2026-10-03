/**
 * Pruebas de objetivos educacionales (RF033–RF039, RF-CH-015).
 *
 * Dos focos. La frontera entre inactivar y eliminar: borrar algo que un plan
 * histórico ya usaba lo dejaría describiendo un objetivo que no existe. Y,
 * desde el Bloque 4b, el alcance: contra qué carrera se autoriza cada escritura
 * y qué ve quien solo lee su carrera.
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
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  DatosObjetivo,
  FiltroObjetivo,
  RepositorioObjetivoPort,
} from '../ports/objetivos.port.js';
import type {
  PlanParaObjetivos,
  PlanParaObjetivosPort,
} from '../ports/plan-para-objetivos.port.js';
import { GestionarObjetivos } from './gestionar-objetivos.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de carrera' };
const ISI = 'car-isi';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Un Director: solo lee la carrera indicada (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

function objetivo(sobre: Partial<DatosObjetivo> = {}): DatosObjetivo {
  return {
    id: 'obj-1',
    codigo: 'OE-01',
    nombre: 'Formar profesionales íntegros',
    descripcion: 'Descripción sintética del objetivo educacional.',
    activo: true,
    carreraId: ISI,
    planesVinculados: 0,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function plan(sobre: Partial<PlanParaObjetivos> = {}): PlanParaObjetivos {
  return {
    id: 'plan-1',
    codigo: 'PE-ISI-2026-v2',
    carreraId: ISI,
    estado: 'Borrador',
    editable: true,
    ...sobre,
  };
}

function montarObjetivos(
  opciones: {
    existente?: DatosObjetivo | null;
    plan?: PlanParaObjetivos | null;
    nombreDuplicado?: boolean;
    codigos?: string[];
    /** `false` deniega todo; una función decide por permiso. */
    permitido?: boolean | ((permiso: string) => boolean);
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creados: { planId: string; carreraId: string; codigo: string; nombre: string }[] = [];
  const eliminados: string[] = [];
  const filtros: (FiltroObjetivo | undefined)[] = [];
  const nombresConsultados: { nombre: string; carreraId: string | null; idIgnorado?: string }[] =
    [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];

  const repo: RepositorioObjetivoPort = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return [objetivo()];
    },
    porId: async () => (opciones.existente === undefined ? objetivo() : opciones.existente),
    codigos: async () => opciones.codigos ?? [],
    crearEnPlan: async (planId, carreraId, codigo, nombre, descripcion) => {
      creados.push({ planId, carreraId, codigo, nombre });
      return objetivo({ codigo, nombre, descripcion, carreraId, planesVinculados: 1 });
    },
    actualizar: async (_id, nombre, descripcion) => objetivo({ nombre, descripcion }),
    cambiarEstado: async (_id, activo) => objetivo({ activo }),
    eliminar: async (id) => void eliminados.push(id),
    existeNombre: async (nombre, carreraId, idIgnorado) => {
      nombresConsultados.push({ nombre, carreraId, idIgnorado });
      return opciones.nombreDuplicado ?? false;
    },
  };

  const planes: PlanParaObjetivosPort = {
    planPorId: async () => (opciones.plan === undefined ? plan() : opciones.plan),
  };

  const permitido = opciones.permitido ?? true;
  const autorizacion: AuthorizationPort = {
    puede: async (_usuarioId, permiso, carreraId) => {
      autorizaciones.push({ permiso, carreraId: carreraId ?? null });
      const ok = typeof permitido === 'function' ? permitido(permiso) : permitido;
      return ok ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
    rolesDe: async () => [],
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarObjetivos(
    repo,
    planes,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );

  return { caso, publicados, creados, eliminados, filtros, nombresConsultados, autorizaciones };
}

describe('RF033 / RF034 / RF-CH-015 — registrar objetivo dentro del plan', () => {
  it('genera el primer código correlativo', async () => {
    const { caso, creados } = montarObjetivos({ codigos: [] });
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales íntegros', 'Descripción suficiente.');
    expect(creados[0]?.codigo).toBe('OE-01');
  });

  it('continúa el correlativo', async () => {
    const { caso, creados } = montarObjetivos({ codigos: ['OE-01', 'OE-02'] });
    await caso.crear(ACTOR, 'plan-1', 'Otro objetivo', 'Descripción suficiente.');
    expect(creados[0]?.codigo).toBe('OE-03');
  });

  it('lo crea con la carrera del plan y vinculado a él', async () => {
    const { caso, creados } = montarObjetivos({ plan: plan({ carreraId: IIN }) });
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales', 'Descripción suficiente.');
    expect(creados[0]).toMatchObject({ planId: 'plan-1', carreraId: IIN });
  });

  it('RN1: exige nombre y descripción', async () => {
    const { caso } = montarObjetivos();
    await expect(caso.crear(ACTOR, 'plan-1', '   ', 'Descripción.')).rejects.toThrow(
      /nombre .* obligatorio/,
    );
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', '  ')).rejects.toThrow(
      /descripción .* obligatoria/,
    );
  });

  it('colapsa los espacios internos del nombre', async () => {
    const { caso, creados } = montarObjetivos();
    await caso.crear(ACTOR, 'plan-1', 'Formar   profesionales', 'Descripción suficiente.');
    expect(creados[0]?.nombre).toBe('Formar profesionales');
  });

  it('rechaza un nombre repetido dentro de la carrera del plan', async () => {
    const { caso, creados, nombresConsultados } = montarObjetivos({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'plan-1', 'Repetido', 'Descripción.')).rejects.toThrow(
      /Ya existe otro/,
    );
    expect(creados).toHaveLength(0);
    expect(nombresConsultados[0]).toMatchObject({ nombre: 'Repetido', carreraId: ISI });
  });

  it('el alta queda en la bitácora con el plan', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales', 'Descripción suficiente.');
    expect(publicados[0]?.nombre).toBe('objetivo.creado');
    expect(publicados[0]?.detalle).toContain('Objetivo educacional OE-01');
    expect(publicados[0]?.detalle).toContain('PE-ISI-2026-v2');
  });

  it('autoriza objetivo.gestionar contra la carrera del plan', async () => {
    const { caso, autorizaciones } = montarObjetivos({ plan: plan({ carreraId: IIN }) });
    await caso.crear(ACTOR, 'plan-1', 'Formar profesionales', 'Descripción suficiente.');
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: IIN });
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, creados } = montarObjetivos({ permitido: false });
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', 'Descripción.')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(creados).toHaveLength(0);
  });

  it('con el plan Vigente no se crea nada', async () => {
    const { caso, creados } = montarObjetivos({
      plan: plan({ estado: 'Vigente', editable: false }),
    });
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', 'Descripción.')).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios. Genera una nueva versión para modificarlo.',
    );
    expect(creados).toHaveLength(0);
  });

  it('un plan inexistente da NoEncontrado', async () => {
    const { caso } = montarObjetivos({ plan: null });
    await expect(caso.crear(ACTOR, 'plan-x', 'Objetivo', 'Descripción.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('un plan de otra carrera, para quien solo lee la suya, da NoEncontrado y no crea nada', async () => {
    const { caso, creados, autorizaciones } = montarObjetivos({
      plan: plan({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.crear(ACTOR, 'plan-1', 'Objetivo', 'Descripción.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(creados).toHaveLength(0);
    expect(autorizaciones.map((a) => a.permiso)).toEqual(['objetivo.leer']);
  });
});

describe('RF035 / RF039 / RF-CH-015 / RF-CH-009 — consulta de objetivos', () => {
  it('con planId pide solo los del plan', async () => {
    const { caso, filtros } = montarObjetivos();
    await caso.listar(ACTOR, { planId: 'plan-1', texto: 'íntegros' });
    expect(filtros[0]).toMatchObject({ planId: 'plan-1', texto: 'íntegros' });
    expect(filtros[0]?.carreraId).toBeUndefined();
  });

  it('con planId de otra carrera responde NoEncontrado sin consultar el catálogo', async () => {
    const { caso, filtros } = montarObjetivos({
      plan: plan({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.listar(ACTOR, { planId: 'plan-1' })).rejects.toBeInstanceOf(NoEncontrado);
    expect(filtros).toHaveLength(0);
  });

  it('sin planId, quien lee solo su carrera recibe los de su carrera', async () => {
    const { caso, filtros } = montarObjetivos({ alcance: soloCarrera(ISI) });
    await caso.listar(ACTOR);
    expect(filtros[0]).toMatchObject({ carreraId: ISI });
  });

  it('sin planId y sin carrera asignada no recibe ninguno', async () => {
    const { caso, filtros } = montarObjetivos({ alcance: soloCarrera(null) });
    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(filtros).toHaveLength(0);
  });

  it('sin planId y sin restricción recibe el catálogo entero, como Mejora Continua', async () => {
    const { caso, filtros } = montarObjetivos();
    await caso.listar(ACTOR, { texto: 'íntegros', activo: true });
    expect(filtros[0]?.texto).toBe('íntegros');
    expect(filtros[0]?.activo).toBe(true);
    expect(filtros[0]?.carreraId).toBeUndefined();
    expect(filtros[0]?.planId).toBeUndefined();
  });

  it('leer exige permiso', async () => {
    const { caso } = montarObjetivos({ permitido: false });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('el detalle da 404 en vez de null', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.porId(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el detalle de un objetivo de otra carrera responde NoEncontrado', async () => {
    const { caso } = montarObjetivos({
      existente: objetivo({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.porId(ACTOR, 'obj-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('un objetivo sin carrera no lo ve quien solo lee la suya, y sí quien no tiene restricción', async () => {
    const sinCarrera = objetivo({ carreraId: null });
    await expect(
      montarObjetivos({ existente: sinCarrera, alcance: soloCarrera(ISI) }).caso.porId(
        ACTOR,
        'obj-1',
      ),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      montarObjetivos({ existente: sinCarrera }).caso.porId(ACTOR, 'obj-1'),
    ).resolves.toMatchObject({ id: 'obj-1' });
  });
});

describe('RF036 — editar objetivo', () => {
  it('404 si no existe', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.editar(ACTOR, 'x', 'Nombre', 'Descripción.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('se excluye a sí mismo y busca el nombre en la carrera de la fila', async () => {
    const { caso, nombresConsultados, autorizaciones } = montarObjetivos({
      existente: objetivo({ carreraId: IIN }),
    });
    await caso.editar(ACTOR, 'obj-1', 'Formar profesionales íntegros', 'Descripción.');
    expect(nombresConsultados).toEqual([
      { nombre: 'Formar profesionales íntegros', carreraId: IIN, idIgnorado: 'obj-1' },
    ]);
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: IIN });
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

  it('editar, inactivar o borrar uno de otra carrera, para quien solo lee la suya, da NoEncontrado', async () => {
    for (const intento of [
      (c: GestionarObjetivos) => c.editar(ACTOR, 'obj-1', 'Otro nombre', 'Descripción.'),
      (c: GestionarObjetivos) => c.cambiarEstado(ACTOR, 'obj-1', false),
      (c: GestionarObjetivos) => c.eliminar(ACTOR, 'obj-1'),
    ]) {
      const { caso, eliminados } = montarObjetivos({
        existente: objetivo({ carreraId: IIN }),
        alcance: soloCarrera(ISI),
      });
      await expect(intento(caso)).rejects.toBeInstanceOf(NoEncontrado);
      expect(eliminados).toHaveLength(0);
    }
  });

  it('una fila sin carrera se autoriza con carrera null, que la política deniega', async () => {
    const { caso, autorizaciones } = montarObjetivos({ existente: objetivo({ carreraId: null }) });
    await caso.cambiarEstado(ACTOR, 'obj-1', false);
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: null });
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

  it('RF038: eliminar uno sin vínculos sí se permite y se autoriza contra su carrera', async () => {
    const { caso, eliminados, autorizaciones } = montarObjetivos({
      existente: objetivo({ planesVinculados: 0, carreraId: IIN }),
    });
    await caso.eliminar(ACTOR, 'obj-1');
    expect(eliminados).toEqual(['obj-1']);
    expect(autorizaciones).toContainEqual({ permiso: 'objetivo.gestionar', carreraId: IIN });
  });

  it('RF038 RN1: eliminar uno vinculado se rechaza', async () => {
    const { caso, eliminados } = montarObjetivos({ existente: objetivo({ planesVinculados: 2 }) });
    await expect(caso.eliminar(ACTOR, 'obj-1')).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(eliminados).toHaveLength(0);
  });

  it('el rechazo propone inactivar como alternativa', async () => {
    const { caso } = montarObjetivos({ existente: objetivo({ planesVinculados: 2 }) });
    await expect(caso.eliminar(ACTOR, 'obj-1')).rejects.toThrow(/Inactívalo/);
  });

  it('el borrado se audita antes de perder el registro', async () => {
    const { caso, publicados } = montarObjetivos();
    await caso.eliminar(ACTOR, 'obj-1');
    expect(publicados[0]?.nombre).toBe('objetivo.eliminado');
    expect(publicados[0]?.detalle).toContain('OE-01');
    expect(publicados[0]?.detalle).toContain('Formar profesionales íntegros');
  });

  it('404 al eliminar algo que no existe', async () => {
    const { caso } = montarObjetivos({ existente: null });
    await expect(caso.eliminar(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});
