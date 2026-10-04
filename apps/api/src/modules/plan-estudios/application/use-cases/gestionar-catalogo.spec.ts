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
import type { UsoDeElemento } from '../ports/elemento-curricular-en-uso.port.js';
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
  return codigos.map((codigo) => ({
    id: codigo,
    carreraId: ISI,
    marco: 'ICACIT',
    codigo,
    nombre: codigo,
  }));
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
    /** RF-CH-018: si la competencia está vinculada al plan (por defecto sí). */
    vinculada?: boolean;
    /** Códigos de las asignaturas del plan que la usan. */
    usadaPor?: string[];
    /** Lo que responde Mejora Continua. */
    enUso?: UsoDeElemento;
    /** Ids que el repositorio dice que no son de la carrera. */
    fueraDeCarrera?: string[];
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creadas: { planId: string; carreraId: string; codigo: string; nombre: string }[] = [];
  const eliminadas: string[] = [];
  const filtros: (FiltroCatalogo | undefined)[] = [];
  const coberturas: (string | undefined)[] = [];
  const coberturasPorCarrera: (string | undefined)[] = [];
  const nombresConsultados: { nombre: string; carreraId: string | null }[] = [];
  const autorizaciones: { permiso: string; carreraId: string | null }[] = [];
  const quitadas: { planId: string; id: string; borrarRegistro: boolean }[] = [];
  const consultasEnUso: string[] = [];
  const orden: string[] = [];
  const atributosPedidos: (string | undefined)[] = [];
  const consultasDeAtributos: { carreraId: string; ids: readonly string[] }[] = [];

  const repo: RepositorioCompetenciaPort = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return [competencia()];
    },
    porId: async () => (opciones.existente === undefined ? competencia() : opciones.existente),
    codigos: async () => opciones.codigos ?? [],
    cobertura: async (_marco, planId, carreraId) => {
      coberturas.push(planId);
      coberturasPorCarrera.push(carreraId);
      return [];
    },
    atributos: async (_marco, carreraId) => {
      atributosPedidos.push(carreraId);
      return [];
    },
    atributosFueraDeCarrera: async (carreraId, ids) => {
      consultasDeAtributos.push({ carreraId, ids });
      return opciones.fueraDeCarrera ?? [];
    },
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
    vinculadaAlPlan: async () => opciones.vinculada ?? true,
    asignaturasDelPlanQueLaUsan: async () => opciones.usadaPor ?? [],
    quitarDelPlan: async (planId, id, borrarRegistro) => {
      orden.push('quitar');
      quitadas.push({ planId, id, borrarRegistro });
    },
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

  const enUso = {
    competenciaEnUso: async (id: string) => {
      consultasEnUso.push(id);
      return opciones.enUso ?? { enUso: false, motivos: [] };
    },
    asignaturaEnUso: async () => ({ enUso: false, motivos: [] }),
  };

  const eventos: PublicadorDeEventos = {
    publicar: async (e) => {
      orden.push('eventos');
      publicados.push(...e);
    },
  };
  const caso = new GestionarCompetencias(
    repo,
    planes,
    enUso,
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
    coberturasPorCarrera,
    nombresConsultados,
    autorizaciones,
    quitadas,
    consultasEnUso,
    orden,
    atributosPedidos,
    consultasDeAtributos,
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

  it('la cobertura sin planId, para quien lee solo su carrera, se acota a ella', async () => {
    const { caso, coberturasPorCarrera } = montarCompetencias({ alcance: soloCarrera(ISI) });
    await caso.cobertura(ACTOR);
    expect(coberturasPorCarrera).toEqual([ISI]);
  });

  it('la cobertura sin planId y sin carrera asignada es vacía: no se ven los atributos de ninguna carrera', async () => {
    const { caso, coberturas, atributosPedidos } = montarCompetencias({
      alcance: soloCarrera(null),
    });
    const r = await caso.cobertura(ACTOR);
    expect(r).toEqual([]);
    expect(coberturas).toHaveLength(0);
    expect(atributosPedidos).toHaveLength(0);
  });

  it('la cobertura sin planId y sin restricción es la del catálogo entero', async () => {
    const { caso, coberturas, coberturasPorCarrera } = montarCompetencias();
    await caso.cobertura(ACTOR);
    expect(coberturas).toEqual([undefined]);
    expect(coberturasPorCarrera).toEqual([undefined]);
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

describe('RF-CH-018 — quitar una competencia del plan', () => {
  it('con otro plan que la vincula, solo quita el vínculo y no consulta a Mejora Continua', async () => {
    const { caso, quitadas, consultasEnUso, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 2 }),
      enUso: { enUso: true, motivos: ['está en 1 plan(es) de medición'] },
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');

    expect(quitadas).toEqual([{ planId: 'plan-1', id: 'cpe-1', borrarRegistro: false }]);
    expect(consultasEnUso).toEqual([]);
    expect(publicados.map((e) => e.nombre)).toEqual(['catalogo.quitada_del_plan']);
    expect(publicados[0]?.detalle).toBe('Competencia CPE-01 quitada del plan PE-ISI-2026-v2.');
  });

  it('con asignaturas de otro plan que la usan, tampoco se borra', async () => {
    const { caso, quitadas, consultasEnUso } = montarCompetencias({
      existente: competencia({ planesVinculados: 1, asignaturasVinculadas: 3 }),
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');

    expect(quitadas[0]?.borrarRegistro).toBe(false);
    expect(consultasEnUso).toEqual([]);
  });

  it('como último vínculo consulta a Mejora Continua y, si no la usa, borra el registro', async () => {
    const { caso, quitadas, consultasEnUso, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 1 }),
    });

    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');

    expect(consultasEnUso).toEqual(['cpe-1']);
    expect(quitadas).toEqual([{ planId: 'plan-1', id: 'cpe-1', borrarRegistro: true }]);
    expect(publicados.map((e) => e.nombre)).toEqual([
      'catalogo.quitada_del_plan',
      'catalogo.eliminado',
    ]);
  });

  it('como último vínculo y en uso en Mejora Continua, se bloquea con sus motivos', async () => {
    const { caso, quitadas, publicados } = montarCompetencias({
      existente: competencia({ planesVinculados: 1 }),
      enUso: { enUso: true, motivos: ['está en 1 plan(es) de medición'] },
    });

    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toThrow(
      'No se puede quitar CPE-01: ningún otro plan la usa y borrarla dejaría sin referencia a ' +
        'Mejora Continua (está en 1 plan(es) de medición).',
    );
    expect(quitadas).toHaveLength(0);
    expect(publicados).toHaveLength(0);
  });

  it('usada por asignaturas de este plan, se bloquea con sus códigos', async () => {
    const { caso, quitadas } = montarCompetencias({ usadaPor: ['ASUC01110', 'ASUC01112'] });

    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toThrow(
      'La usan ASUC01110, ASUC01112. Quítala de esas asignaturas primero.',
    );
    expect(quitadas).toHaveLength(0);
  });

  it('los eventos se publican antes de quitar: después el registro puede no existir', async () => {
    const { caso, orden } = montarCompetencias({ existente: competencia({ planesVinculados: 1 }) });
    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');
    expect(orden).toEqual(['eventos', 'quitar']);
  });

  it('con el plan Vigente se rechaza sin tocar nada', async () => {
    const { caso, quitadas } = montarCompetencias({ plan: plan('Vigente') });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios. Genera una nueva versión para modificarlo.',
    );
    expect(quitadas).toHaveLength(0);
  });

  it('también En revisión se puede quitar', async () => {
    const { caso, quitadas } = montarCompetencias({
      plan: plan('En revisión'),
      existente: competencia({ planesVinculados: 2 }),
    });
    await caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1');
    expect(quitadas).toHaveLength(1);
  });

  it('una competencia que no está en el plan da NoEncontrado', async () => {
    const { caso, quitadas } = montarCompetencias({ vinculada: false });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(quitadas).toHaveLength(0);
  });

  it('un plan de otra carrera, para quien solo lee la suya, da NoEncontrado y no quita nada', async () => {
    const { caso, quitadas } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(quitadas).toHaveLength(0);
  });

  it('autoriza la gestión contra la carrera del plan y sin ella da AccesoDenegado', async () => {
    const { caso, quitadas, autorizaciones } = montarCompetencias({
      plan: plan('Borrador', IIN),
      permitido: (p) => p !== 'competencia.gestionar',
    });
    await expect(caso.quitarDelPlan(ACTOR, 'plan-1', 'cpe-1')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(autorizaciones).toContainEqual({ permiso: 'competencia.gestionar', carreraId: IIN });
    expect(quitadas).toHaveLength(0);
  });
});

describe('Bloque 5 — los atributos que se ofrecen son los de la carrera', () => {
  it('atributos con planId: los de la carrera del plan', async () => {
    const { caso, atributosPedidos } = montarCompetencias({ plan: plan('Borrador', IIN) });

    await caso.atributos(ACTOR, 'plan-1');

    expect(atributosPedidos).toEqual([IIN]);
  });

  it('atributos con planId de otra carrera, para quien lee solo la suya: NoEncontrado y no consulta', async () => {
    const { caso, atributosPedidos } = montarCompetencias({
      plan: plan('Borrador', IIN),
      alcance: soloCarrera(ISI),
    });

    await expect(caso.atributos(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(atributosPedidos).toHaveLength(0);
  });

  it('atributos sin planId: quien lee solo su carrera recibe los suyos; sin carrera asignada, ninguno', async () => {
    const propio = montarCompetencias({ alcance: soloCarrera(ISI) });
    await propio.caso.atributos(ACTOR);
    expect(propio.atributosPedidos).toEqual([ISI]);

    const sinCarrera = montarCompetencias({ alcance: soloCarrera(null) });
    expect(await sinCarrera.caso.atributos(ACTOR)).toEqual([]);
    expect(sinCarrera.atributosPedidos).toHaveLength(0);
  });

  it('atributos sin planId y con alcance TODAS: los de todas las carreras', async () => {
    const { caso, atributosPedidos } = montarCompetencias();

    await caso.atributos(ACTOR);

    expect(atributosPedidos).toEqual([undefined]);
  });

  it('la cobertura con planId pide los atributos de la carrera del plan y las competencias del plan', async () => {
    const { caso, coberturas, coberturasPorCarrera } = montarCompetencias({
      plan: plan('Borrador', IIN),
    });

    await caso.cobertura(ACTOR, 'plan-1');

    expect(coberturas).toEqual(['plan-1']);
    expect(coberturasPorCarrera).toEqual([IIN]);
  });

  it('crear valida los atributos contra la carrera del plan y rechaza los ajenos sin crear nada', async () => {
    const { caso, creadas, consultasDeAtributos, publicados } = montarCompetencias({
      plan: plan('Borrador', IIN),
      fueraDeCarrera: ['AG-I06'],
    });

    await expect(
      caso.crear(ACTOR, 'plan-1', 'Nueva competencia', ['AG-I06', 'AG-I08']),
    ).rejects.toThrow(
      'Estos atributos del graduado no existen o no son de la carrera de la competencia: AG-I06.',
    );
    expect(consultasDeAtributos).toEqual([{ carreraId: IIN, ids: ['AG-I06', 'AG-I08'] }]);
    expect(creadas).toHaveLength(0);
    expect(publicados).toHaveLength(0);
  });

  it('crear sin atributos no consulta nada; y el estado del plan se rechaza antes que los atributos', async () => {
    const sin = montarCompetencias();
    await sin.caso.crear(ACTOR, 'plan-1', 'Sin atributos', []);
    expect(sin.consultasDeAtributos).toHaveLength(0);

    const vigente = montarCompetencias({ plan: plan('Vigente'), fueraDeCarrera: ['AG-I06'] });
    await expect(vigente.caso.crear(ACTOR, 'plan-1', 'Nueva', ['AG-I06'])).rejects.toThrow(
      'El plan está en estado Vigente y no admite cambios.',
    );
    expect(vigente.consultasDeAtributos).toHaveLength(0);
  });

  it('editar valida los atributos contra la carrera de la competencia, no contra otra', async () => {
    const { caso, consultasDeAtributos } = montarCompetencias({
      existente: competencia({ carreraId: IIN }),
      fueraDeCarrera: ['AG-I06'],
    });

    await expect(
      caso.editar(ACTOR, 'cpe-1', 'Resolver problemas', ['AG-I06']),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(consultasDeAtributos).toEqual([{ carreraId: IIN, ids: ['AG-I06'] }]);
  });

  it('editar con una lista vacía de atributos no consulta y permite retirar todos', async () => {
    const { caso, consultasDeAtributos } = montarCompetencias({
      existente: competencia({ atributos: atributos(['AG-I06']) }),
    });

    await caso.editar(ACTOR, 'cpe-1', 'Resolver problemas', []);

    expect(consultasDeAtributos).toHaveLength(0);
  });

  it('una competencia sin carrera no se puede mapear a ningún atributo', async () => {
    const { caso } = montarCompetencias({ existente: competencia({ carreraId: null }) });

    await expect(caso.editar(ACTOR, 'cpe-1', 'Heredada', ['AG-I06'])).rejects.toThrow(
      'no tiene carrera',
    );
  });
});
