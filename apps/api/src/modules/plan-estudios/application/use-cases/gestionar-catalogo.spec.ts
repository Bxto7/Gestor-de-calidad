/**
 * Pruebas de competencias (RF040–RF046, RF-CH-017).
 *
 * Dos focos. La frontera entre inactivar y eliminar: borrar algo que un plan
 * histórico ya usaba lo dejaría describiendo una competencia que no existe. Y,
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
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  DatosCompetencia,
  FiltroCatalogo,
  RepositorioCompetenciaPort,
} from '../ports/catalogo.port.js';
import type { RepositorioPlanPort } from '../ports/repositorios.port.js';
import { GestionarCompetencias } from './gestionar-catalogo.use-case.js';

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

function competencia(sobre: Partial<DatosCompetencia> = {}): DatosCompetencia {
  return {
    id: 'cpe-1',
    codigo: 'CPE-01',
    nombre: 'Resolver problemas de ingeniería',
    activa: true,
    atributos: [],
    carreraId: ISI,
    planesVinculados: 0,
    asignaturasVinculadas: 0,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function plan(estado: EstadoPlan = 'Borrador', carreraId: string = ISI): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: 'plan-1',
    carreraId,
    codigo: 'PE-ISI-2026-v2',
    version: 2,
    estado,
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

/**
 * Atributos a partir de sus códigos.
 *
 * El doble usa el código también como identificador: en estas pruebas nunca se
 * resuelve contra una tabla real, y así la aserción se lee con los códigos que
 * salen en la bitácora en vez de con UUID opacos.
 */
function atributos(codigos: readonly string[]) {
  return codigos.map((codigo) => ({ id: codigo, marco: 'ICACIT', codigo, nombre: codigo }));
}

function montarCompetencias(
  opciones: {
    existente?: DatosCompetencia | null;
    plan?: PlanDeEstudios | null;
    nombreDuplicado?: boolean;
    codigos?: string[];
    /** `false` deniega todo; una función decide por permiso. */
    permitido?: boolean | ((permiso: string) => boolean);
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creadas: { planId: string; carreraId: string; codigo: string; nombre: string }[] = [];
  const eliminadas: string[] = [];
  const filtros: (FiltroCatalogo | undefined)[] = [];
  const coberturas: (string | undefined)[] = [];
  const nombresConsultados: { nombre: string; carreraId: string | null }[] = [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];

  const repo: RepositorioCompetenciaPort = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return [competencia()];
    },
    porId: async () => (opciones.existente === undefined ? competencia() : opciones.existente),
    codigos: async () => opciones.codigos ?? [],
    cobertura: async (_marco, planId) => {
      coberturas.push(planId);
      return [];
    },
    atributos: async () => [],
    crearEnPlan: async (planId, carreraId, codigo, nombre, atributoIds) => {
      creadas.push({ planId, carreraId, codigo, nombre });
      return competencia({
        codigo,
        nombre,
        carreraId,
        planesVinculados: 1,
        atributos: atributos(atributoIds),
      });
    },
    actualizar: async (_id, nombre, atributoIds) =>
      competencia({ nombre, atributos: atributos(atributoIds) }),
    cambiarEstado: async (_id, activa) => competencia({ activa }),
    eliminar: async (id) => void eliminadas.push(id),
    existeNombre: async (nombre, carreraId) => {
      nombresConsultados.push({ nombre, carreraId });
      return opciones.nombreDuplicado ?? false;
    },
  };

  const planes = {
    porId: async () => (opciones.plan === undefined ? plan() : opciones.plan),
  } as unknown as RepositorioPlanPort;

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
  const caso = new GestionarCompetencias(
    repo,
    planes,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );

  return {
    caso,
    publicados,
    creadas,
    eliminadas,
    filtros,
    coberturas,
    nombresConsultados,
    autorizaciones,
  };
}

describe('RF040 / RF041 / RF-CH-017 — registrar competencia dentro del plan', () => {
  it('genera el código correlativo con su propio prefijo', async () => {
    const { caso, creadas } = montarCompetencias({ codigos: ['CPE-01'] });
    await caso.crear(ACTOR, 'plan-1', 'Diseñar sistemas de software');
    expect(creadas[0]?.codigo).toBe('CPE-02');
  });

  it('la crea con la carrera del plan y vinculada a él', async () => {
    const { caso, creadas } = montarCompetencias({ plan: plan('Borrador', IIN) });
    await caso.crear(ACTOR, 'plan-1', 'Diseñar sistemas de software');
    expect(creadas[0]).toMatchObject({ planId: 'plan-1', carreraId: IIN });
  });

  it('RN1: el nombre es obligatorio', async () => {
    const { caso } = montarCompetencias();
    await expect(caso.crear(ACTOR, 'plan-1', '   ')).rejects.toThrow(/nombre .* obligatorio/);
  });

  it('rechaza un nombre repetido dentro de la carrera del plan', async () => {
    const { caso, creadas, nombresConsultados } = montarCompetencias({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'plan-1', 'Repetida')).rejects.toThrow(/Ya existe otra/);
    expect(creadas).toHaveLength(0);
    expect(nombresConsultados).toEqual([{ nombre: 'Repetida', carreraId: ISI }]);
  });

  it('el evento la identifica como Competencia y nombra el plan', async () => {
    const { caso, publicados } = montarCompetencias();
    await caso.crear(ACTOR, 'plan-1', 'Resolver problemas');
    expect(publicados[0]?.entidad).toBe('Competencia');
    expect(publicados[0]?.detalle).toContain('Competencia CPE-01');
    expect(publicados[0]?.detalle).toContain('PE-ISI-2026-v2');
  });

  it('autoriza competencia.gestionar contra la carrera del plan', async () => {
    const { caso, autorizaciones } = montarCompetencias({ plan: plan('Borrador', IIN) });
    await caso.crear(ACTOR, 'plan-1', 'Resolver problemas');
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, creadas } = montarCompetencias({ permitido: false });
    await expect(caso.crear(ACTOR, 'plan-1', 'Resolver problemas')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(creadas).toHaveLength(0);
  });

  it('con el plan Vigente no se crea nada', async () => {
    const { caso, creadas } = montarCompetencias({ plan: plan('Vigente') });
    await expect(caso.crear(ACTOR, 'plan-1', 'Resolver problemas')).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios. Genera una nueva versión para modificarlo.',
    );
    expect(creadas).toHaveLength(0);
  });

  it('un plan inexistente da NoEncontrado', async () => {
    const { caso } = montarCompetencias({ plan: null });
    await expect(caso.crear(ACTOR, 'plan-x', 'Resolver problemas')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('un plan de otra carrera, para quien solo lee la suya, da NoEncontrado y no crea nada', async () => {
    const { caso, creadas, autorizaciones } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.crear(ACTOR, 'plan-1', 'Resolver problemas')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(creadas).toHaveLength(0);
    // El alcance va antes que el permiso de gestión: ni se llega a preguntar.
    expect(autorizaciones.map((a) => a.permiso)).toEqual(['competencia.leer']);
  });
});

describe('RF-CH-017 / RF-CH-009 — listar y leer', () => {
  it('con planId pide solo las del plan', async () => {
    const { caso, filtros } = montarCompetencias();
    await caso.listar(ACTOR, { planId: 'plan-1', texto: 'software' });
    expect(filtros[0]).toMatchObject({ planId: 'plan-1', texto: 'software' });
    expect(filtros[0]?.carreraId).toBeUndefined();
  });

  it('con planId de otra carrera responde NoEncontrado sin consultar el catálogo', async () => {
    const { caso, filtros } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.listar(ACTOR, { planId: 'plan-1' })).rejects.toBeInstanceOf(NoEncontrado);
    expect(filtros).toHaveLength(0);
  });

  it('con planId inexistente responde NoEncontrado', async () => {
    const { caso } = montarCompetencias({ plan: null });
    await expect(caso.listar(ACTOR, { planId: 'plan-x' })).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin planId, quien lee solo su carrera recibe las de su carrera', async () => {
    const { caso, filtros } = montarCompetencias({ alcance: soloCarrera(ISI) });
    await caso.listar(ACTOR, { texto: 'x' });
    expect(filtros[0]).toMatchObject({ carreraId: ISI, texto: 'x' });
  });

  it('sin planId y sin carrera asignada no recibe ninguna', async () => {
    const { caso, filtros } = montarCompetencias({ alcance: soloCarrera(null) });
    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(filtros).toHaveLength(0);
  });

  it('sin planId y sin restricción recibe el catálogo entero, como Mejora Continua', async () => {
    const { caso, filtros } = montarCompetencias();
    await caso.listar(ACTOR, { texto: 'íntegra', activo: true });
    expect(filtros[0]?.texto).toBe('íntegra');
    expect(filtros[0]?.activo).toBe(true);
    expect(filtros[0]?.carreraId).toBeUndefined();
    expect(filtros[0]?.planId).toBeUndefined();
  });

  it('porId de una competencia de otra carrera responde NoEncontrado', async () => {
    const { caso } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.porId(ACTOR, 'cpe-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('una competencia sin carrera no la ve quien solo lee la suya, y sí quien no tiene restricción', async () => {
    const sinCarrera = competencia({ carreraId: null });
    await expect(
      montarCompetencias({ existente: sinCarrera, alcance: soloCarrera(ISI) }).caso.porId(
        ACTOR,
        'cpe-1',
      ),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(
      montarCompetencias({ existente: sinCarrera }).caso.porId(ACTOR, 'cpe-1'),
    ).resolves.toMatchObject({ id: 'cpe-1' });
  });

  it('leer exige permiso', async () => {
    const { caso } = montarCompetencias({ permitido: false });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('la cobertura con planId se acota al plan', async () => {
    const { caso, coberturas } = montarCompetencias();
    await caso.cobertura(ACTOR, 'plan-1');
    expect(coberturas).toEqual(['plan-1']);
  });

  it('la cobertura con planId de otra carrera responde NoEncontrado', async () => {
    const { caso, coberturas } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.cobertura(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(coberturas).toHaveLength(0);
  });
});

describe('RF043 / RF044 / RF045 — escrituras sobre la fila, contra su carrera', () => {
  it('editar autoriza contra la carrera de la competencia y busca el nombre en ella', async () => {
    const { caso, autorizaciones, nombresConsultados } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Nombre nuevo');
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
    expect(nombresConsultados).toEqual([{ nombre: 'Nombre nuevo', carreraId: IIN }]);
  });

  it('inactivar también', async () => {
    const { caso, autorizaciones } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
    });
    await caso.cambiarEstado(ACTOR, 'cpe-1', false);
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
  });

  it('el borrado raíz también', async () => {
    const { caso, autorizaciones } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
    });
    await caso.eliminar(ACTOR, 'cpe-1');
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
  });

  it('una fila sin carrera se autoriza con carrera null, que la política deniega', async () => {
    const { caso, autorizaciones } = montarCompetencias({
      existente: competencia({ carreraId: null }),
    });
    await caso.cambiarEstado(ACTOR, 'cpe-1', false);
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: null });
  });

  it('editar, inactivar o borrar una de otra carrera, para quien solo lee la suya, da NoEncontrado', async () => {
    for (const intento of [
      (c: GestionarCompetencias) => c.editar(ACTOR, 'cpe-1', 'Otro nombre'),
      (c: GestionarCompetencias) => c.cambiarEstado(ACTOR, 'cpe-1', false),
      (c: GestionarCompetencias) => c.eliminar(ACTOR, 'cpe-1'),
    ]) {
      const { caso, eliminadas } = montarCompetencias({
        existente: competencia({ carreraId: IIN }),
        alcance: soloCarrera(ISI),
      });
      await expect(intento(caso)).rejects.toBeInstanceOf(NoEncontrado);
      expect(eliminadas).toHaveLength(0);
    }
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

describe('RF043 / RF042 — edición de competencias', () => {
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

  it('la bitácora registra el cambio de atributos ICACIT', async () => {
    // Es la traza que responde a «¿desde cuándo dejó de cubrir ese atributo?».
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I06']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', ['AG-I06', 'AG-I08']);
    expect(publicados[0]?.detalle).toContain('atributos ICACIT: AG-I06 → AG-I06, AG-I08');
  });

  it('retirar el último atributo se audita como «ninguno», no como un hueco', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I08']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', []);
    expect(publicados[0]?.detalle).toContain('atributos ICACIT: AG-I08 → ninguno');
  });

  it('reordenar los mismos atributos no es un cambio', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I08', 'AG-I06']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', ['AG-I06', 'AG-I08']);
    expect(publicados[0]?.detalle).toContain('sin cambios');
  });

  it('un atributo repetido en la petición no llega dos veces al repositorio', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: [] }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas de ingeniería', ['AG-I06', 'AG-I06']);
    expect(publicados[0]?.detalle).toContain('atributos ICACIT: ninguno → AG-I06.');
  });
});

describe('RF124–RF126 — regresión tras introducir PlanAtributo', () => {
  it('la competencia conserva sus atributos, que no dependen de ningún plan', async () => {
    const { caso } = montarCompetencias({ existente: competencia({ atributos: [] }) });
    const editada = await caso.editar(ACTOR, 'cpe-1', 'Aprendizaje autónomo', ['AG-I06', 'AG-I08']);
    expect(editada.atributos.map((a) => a.codigo)).toEqual(['AG-I06', 'AG-I08']);
  });

  it('retirar todos los atributos de una competencia se sigue auditando como «ninguno»', async () => {
    const { caso, publicados } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I06']) }),
    });
    await caso.editar(ACTOR, 'cpe-1', 'Aprendizaje autónomo', []);
    expect(publicados[0]?.detalle).toContain('AG-I06 → ninguno');
  });
});
