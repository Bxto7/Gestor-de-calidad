/**
 * Pruebas de integración del catálogo institucional (CLAUDE.md §6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede:
 *
 *  - que los recuentos de vínculos que sostienen RF038 y RF045 se calculen bien
 *    contra las tablas reales, incluyendo el caso de una competencia usada por
 *    un plan y por una asignatura a la vez;
 *  - que el `onDelete: Restrict` del esquema respalde la comprobación de la
 *    aplicación, de forma que un borrado que se colara igual fallara;
 *  - que la unicidad de código sea global y no por plan.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { sembrarAtributosIcacit } from '../../src/modules/acreditacion/infrastructure/persistence/sembrar-atributos-icacit.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { CompetenciaRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.js';
import { ObjetivoRepositoryPrisma } from '../../src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';

const prisma = new PrismaService();
const objetivos = new ObjetivoRepositoryPrisma(prisma);
const competencias = new CompetenciaRepositoryPrisma(prisma);

let planId: string;
let otroPlanId: string;
let carreraId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignatura_competencia, plan_estudios.plan_competencia,
             plan_estudios.plan_objetivo, plan_estudios.dependencias,
             plan_estudios.asignaturas, plan_estudios.competencias,
             objetivos_educacionales.objetivos_educacionales, academico.ciclos,
             plan_estudios.planes_estudio, academico.carreras,
             academico.facultades
    RESTART IDENTITY CASCADE`);

  // Los atributos de ICACIT los siembra el propio `beforeEach` en la carrera de
  // la prueba (el `TRUNCATE` de `carreras` los vacía en cascada). Sí se limpian
  // los marcos desechables que alguna prueba haya creado.
  await prisma.atributoGraduado.deleteMany({ where: { marco: { not: 'ICACIT' } } });

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 2 },
  });
  carreraId = carrera.id;
  await sembrarAtributosIcacit(prisma, carrera.id);

  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  planId = plan.id;

  const otro = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2027-v2',
      version: 2,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  otroPlanId = otro.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea una asignatura mínima para poder colgarle competencias. */
async function asignatura(codigo: string, competenciaIds: string[] = []): Promise<string> {
  const a = await prisma.asignatura.create({
    data: {
      planId,
      codigo,
      nombre: `Asignatura ${codigo}`,
      descripcion: 'Sumilla sintética.',
      tipo: 'GENERAL',
      condicion: 'OBLIGATORIA',
      creditos: 3,
      competencias: { create: competenciaIds.map((competenciaId) => ({ competenciaId })) },
    },
  });
  return a.id;
}

/**
 * Una competencia creada directamente, sin plan ni carrera. El repositorio ya
 * no tiene alta suelta (RF-CH-017 crea siempre dentro de un plan), y estas
 * pruebas miden recuentos y búsquedas que no dependen de dónde se creó.
 */
async function competenciaSuelta(
  codigo: string,
  nombre: string,
  atributoIds: readonly string[] = [],
) {
  const fila = await prisma.competencia.create({
    data: {
      codigo,
      nombre,
      atributos: { create: atributoIds.map((atributoId) => ({ atributoId })) },
    },
  });
  const datos = await competencias.porId(fila.id);
  if (!datos) throw new Error(`No se pudo releer la competencia ${codigo}.`);
  return datos;
}

/** Un objetivo creado directamente, sin plan ni carrera (ver `competenciaSuelta`). */
async function objetivoSuelto(codigo: string, nombre: string, descripcion: string) {
  const fila = await prisma.objetivoEducacional.create({ data: { codigo, nombre, descripcion } });
  const datos = await objetivos.porId(fila.id);
  if (!datos) throw new Error(`No se pudo releer el objetivo ${codigo}.`);
  return datos;
}

/** Una carrera más, con un plan en Borrador. */
async function otraCarreraConPlan(): Promise<{ carrera: string; plan: string }> {
  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería Civil' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'CIV', duracionAnios: 2 },
  });
  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-CIV-2026-v1',
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  return { carrera: carrera.id, plan: plan.id };
}

describe('Unicidad de código', () => {
  it('el código del objetivo es único en todo el sistema', async () => {
    await objetivoSuelto('OE-01', 'Primero', 'Descripción.');
    await expect(objetivoSuelto('OE-01', 'Segundo', 'Descripción.')).rejects.toThrow();
  });

  it('el de la competencia también', async () => {
    await competenciaSuelta('CPE-01', 'Primera', []);
    await expect(competenciaSuelta('CPE-01', 'Segunda', [])).rejects.toThrow();
  });

  it('objetivo y competencia no comparten espacio de códigos', async () => {
    // Prefijos distintos, tablas distintas: no hay colisión posible.
    await objetivoSuelto('OE-01', 'Objetivo', 'Descripción.');
    await expect(competenciaSuelta('CPE-01', 'Competencia', [])).resolves.toBeTruthy();
  });
});

describe('RF038 — recuento de vínculos del objetivo', () => {
  it('nace sin vínculos', async () => {
    const creado = await objetivoSuelto('OE-01', 'Objetivo', 'Descripción.');
    expect(creado.planesVinculados).toBe(0);
  });

  it('cuenta los planes que lo usan', async () => {
    const creado = await objetivoSuelto('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.createMany({
      data: [
        { planId, objetivoId: creado.id },
        { planId: otroPlanId, objetivoId: creado.id },
      ],
    });

    expect((await objetivos.porId(creado.id))?.planesVinculados).toBe(2);
  });

  it('el listado también trae el recuento', async () => {
    // La UI lo necesita para avisar antes de que el usuario pulse eliminar.
    const creado = await objetivoSuelto('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.create({ data: { planId, objetivoId: creado.id } });

    const [fila] = await objetivos.listar();
    expect(fila?.planesVinculados).toBe(1);
  });

  it('la base impide borrar uno vinculado, aunque la aplicación fallara', async () => {
    // `onDelete: Restrict` es la garantía; la comprobación del caso de uso solo
    // aporta el mensaje legible.
    const creado = await objetivoSuelto('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.create({ data: { planId, objetivoId: creado.id } });

    await expect(objetivos.eliminar(creado.id)).rejects.toThrow();
  });

  it('borrar uno sin vínculos funciona y desaparece del listado', async () => {
    const creado = await objetivoSuelto('OE-01', 'Objetivo', 'Descripción.');
    await objetivos.eliminar(creado.id);

    expect(await objetivos.porId(creado.id)).toBeNull();
    expect(await objetivos.listar()).toHaveLength(0);
  });

  it('inactivar conserva el registro y su vínculo', async () => {
    const creado = await objetivoSuelto('OE-01', 'Objetivo', 'Descripción.');
    await prisma.planObjetivo.create({ data: { planId, objetivoId: creado.id } });

    const inactivo = await objetivos.cambiarEstado(creado.id, false);
    expect(inactivo.activo).toBe(false);
    expect(inactivo.planesVinculados).toBe(1);
  });
});

describe('RF045 — recuento de vínculos de la competencia', () => {
  it('separa planes de asignaturas', async () => {
    const creada = await competenciaSuelta('CPE-01', 'Competencia', []);
    await prisma.planCompetencia.create({ data: { planId, competenciaId: creada.id } });
    await asignatura('ISI-101', [creada.id]);
    await asignatura('ISI-102', [creada.id]);

    const fila = await competencias.porId(creada.id);
    expect(fila?.planesVinculados).toBe(1);
    expect(fila?.asignaturasVinculadas).toBe(2);
  });

  it('la base impide borrar una usada por una asignatura', async () => {
    const creada = await competenciaSuelta('CPE-01', 'Competencia', []);
    await asignatura('ISI-101', [creada.id]);

    await expect(competencias.eliminar(creada.id)).rejects.toThrow();
  });

  it('la base impide borrar una usada por un plan', async () => {
    const creada = await competenciaSuelta('CPE-01', 'Competencia', []);
    await prisma.planCompetencia.create({ data: { planId, competenciaId: creada.id } });

    await expect(competencias.eliminar(creada.id)).rejects.toThrow();
  });

  it('borrar una sin usar funciona', async () => {
    const creada = await competenciaSuelta('CPE-01', 'Competencia', []);
    await competencias.eliminar(creada.id);
    expect(await competencias.porId(creada.id)).toBeNull();
  });

  it('RF044: inactivarla no la retira de las asignaturas que ya la tenían', async () => {
    // Retirar el vínculo reescribiría planes ya cerrados. Lo que impide
    // inactivarla es vincularla a asignaturas NUEVAS, y eso lo filtra
    // `competenciasValidas` del repositorio de asignaturas.
    const creada = await competenciaSuelta('CPE-01', 'Competencia', []);
    const asigId = await asignatura('ISI-101', [creada.id]);

    await competencias.cambiarEstado(creada.id, false);

    const vinculos = await prisma.asignaturaCompetencia.count({
      where: { asignaturaId: asigId, competenciaId: creada.id },
    });
    expect(vinculos).toBe(1);
    expect((await competencias.porId(creada.id))?.asignaturasVinculadas).toBe(1);
  });
});

describe('RF039 / RF046 — búsqueda', () => {
  beforeEach(async () => {
    await competenciaSuelta('CPE-01', 'Resolver problemas de ingeniería', []);
    await competenciaSuelta('CPE-02', 'Diseñar sistemas de software', []);
    await competenciaSuelta('CPE-03', 'Comunicarse con eficacia', []);
  });

  it('RN1: busca por nombre', async () => {
    const r = await competencias.listar({ texto: 'software' });
    expect(r.map((c) => c.codigo)).toEqual(['CPE-02']);
  });

  it('RN1: busca también por código', async () => {
    const r = await competencias.listar({ texto: 'CPE-03' });
    expect(r.map((c) => c.nombre)).toEqual(['Comunicarse con eficacia']);
  });

  it('no distingue mayúsculas', async () => {
    expect(await competencias.listar({ texto: 'RESOLVER' })).toHaveLength(1);
  });

  it('DEJA CONSTANCIA: sí distingue acentos', async () => {
    // Misma limitación que en asignaturas: `mode: 'insensitive'` de Prisma no
    // ignora diacríticos. Resolverlo pide `unaccent` en la base, que es una
    // migración, no un cambio de consulta.
    await competenciaSuelta('CPE-04', 'Aplicar métodos numéricos', []);
    expect(await competencias.listar({ texto: 'métodos' })).toHaveLength(1);
    expect(await competencias.listar({ texto: 'metodos' })).toHaveLength(0);
  });

  it('filtra por estado', async () => {
    const [primera] = await competencias.listar();
    await competencias.cambiarEstado(primera!.id, false);

    expect(await competencias.listar({ activo: true })).toHaveLength(2);
    expect(await competencias.listar({ activo: false })).toHaveLength(1);
  });

  it('el listado va ordenado por código', async () => {
    const r = await competencias.listar();
    expect(r.map((c) => c.codigo)).toEqual(['CPE-01', 'CPE-02', 'CPE-03']);
  });

  it('sin coincidencias devuelve lista vacía, no error', async () => {
    expect(await competencias.listar({ texto: 'no existe nada así' })).toEqual([]);
  });
});

describe('Unicidad de nombre', () => {
  it('detecta el repetido sin distinguir mayúsculas', async () => {
    await objetivoSuelto('OE-01', 'Formar profesionales íntegros', 'Descripción.');
    expect(await objetivos.existeNombre('FORMAR PROFESIONALES ÍNTEGROS', null)).toBe(true);
  });

  it('se excluye a sí mismo al editar', async () => {
    const creado = await objetivoSuelto('OE-01', 'Formar profesionales', 'Descripción.');
    expect(await objetivos.existeNombre('Formar profesionales', null, creado.id)).toBe(false);
  });

  it('objetivo y competencia no compiten por el mismo nombre', async () => {
    // Son catálogos distintos: que un objetivo y una competencia se llamen
    // parecido es normal y no debe bloquearse.
    await objetivoSuelto('OE-01', 'Resolver problemas', 'Descripción.');
    await expect(competenciaSuelta('CPE-01', 'Resolver problemas', [])).resolves.toBeTruthy();
  });
});

describe('Trazabilidad con el marco de acreditación (§6.2)', () => {
  /** Los once atributos los siembra el `beforeEach`; aquí solo se leen. */
  async function atributo(codigo: string): Promise<string> {
    const a = await prisma.atributoGraduado.findFirstOrThrow({
      where: { marco: 'ICACIT', codigo },
    });
    return a.id;
  }

  it('la carrera de la prueba tiene los once atributos de ICACIT', async () => {
    expect(await competencias.atributos('ICACIT')).toHaveLength(11);
  });

  it('van en el orden del marco, no alfabético', async () => {
    const codigos = (await competencias.atributos('ICACIT')).map((a) => a.codigo);
    expect(codigos[0]).toBe('AG-I01');
    expect(codigos[10]).toBe('AG-I11');
  });

  it('una competencia mapeada devuelve su atributo', async () => {
    const creada = await competenciaSuelta('CPE-01', 'Resolver problemas', [
      await atributo('AG-I08'),
    ]);
    expect((await competencias.porId(creada.id))?.atributos).toMatchObject([
      { codigo: 'AG-I08', nombre: 'Análisis de Problema' },
    ]);
  });

  it('una competencia puede desarrollar varios atributos a la vez', async () => {
    // No es un caso hipotético: en la matriz del plan 2018, «Aprendizaje
    // autónomo» responde a AG-I06 y AG-I08 juntos.
    const creada = await competenciaSuelta('CPE-01', 'Aprendizaje autónomo', [
      await atributo('AG-I06'),
      await atributo('AG-I08'),
    ]);
    const codigos = (await competencias.porId(creada.id))?.atributos.map((a) => a.codigo);
    expect(codigos?.sort()).toEqual(['AG-I06', 'AG-I08']);
  });

  it('una competencia sin mapear devuelve lista vacía, no un error', async () => {
    const creada = await competenciaSuelta('CPE-01', 'Sin mapear', []);
    expect((await competencias.porId(creada.id))?.atributos).toEqual([]);
  });

  it('editar puede retirar el mapeo', async () => {
    const creada = await competenciaSuelta('CPE-01', 'Con mapeo', [await atributo('AG-I08')]);
    const editada = await competencias.actualizar(creada.id, 'Con mapeo', []);
    expect(editada.atributos).toEqual([]);
  });

  it('editar reemplaza el conjunto entero, no lo acumula', async () => {
    // Si `actualizar` añadiera en vez de reemplazar, quitar un atributo sería
    // imposible desde la interfaz y el mapeo solo podría crecer.
    const creada = await competenciaSuelta('CPE-01', 'Cambia de atributo', [
      await atributo('AG-I06'),
      await atributo('AG-I08'),
    ]);
    const editada = await competencias.actualizar(creada.id, 'Cambia de atributo', [
      await atributo('AG-I02'),
    ]);
    expect(editada.atributos.map((a) => a.codigo)).toEqual(['AG-I02']);
  });

  describe('cobertura', () => {
    it('devuelve los once aunque no haya ninguna competencia', async () => {
      // Es la razón de existir de la tabla: sin ella no habría forma de saber
      // qué falta, porque lo que falta no está escrito en ninguna parte.
      const cobertura = await competencias.cobertura('ICACIT');
      expect(cobertura).toHaveLength(11);
      expect(cobertura.every((a) => a.competencias.length === 0)).toBe(true);
    });

    it('agrupa varias competencias bajo un mismo atributo', async () => {
      // En el plan 2018 pasa tres veces: AG-I01, AG-I05 y AG-I06 los cubren dos
      // competencias cada uno.
      const ag = await atributo('AG-I06');
      await competenciaSuelta('CPE-01', 'Aprendizaje autónomo', [ag]);
      await competenciaSuelta('CPE-05', 'Gestión de TIC', [ag]);

      const fila = (await competencias.cobertura('ICACIT')).find((a) => a.codigo === 'AG-I06');
      expect(fila?.competencias.map((c) => c.codigo)).toEqual(['CPE-01', 'CPE-05']);
    });

    it('deja vacíos los atributos que nadie cubre', async () => {
      await competenciaSuelta('CPE-01', 'Solo uno', [await atributo('AG-I08')]);

      const sinCubrir = (await competencias.cobertura('ICACIT'))
        .filter((a) => a.competencias.length === 0)
        .map((a) => a.codigo);

      expect(sinCubrir).toHaveLength(10);
      expect(sinCubrir).not.toContain('AG-I08');
    });

    it('una competencia inactiva deja de cubrir su atributo', async () => {
      // Cubrir un atributo con una competencia retirada sería declarar una
      // cobertura que el plan ya no ofrece.
      const creada = await competenciaSuelta('CPE-01', 'Se inactivará', [await atributo('AG-I08')]);
      await competencias.cambiarEstado(creada.id, false);

      const fila = (await competencias.cobertura('ICACIT')).find((a) => a.codigo === 'AG-I08');
      expect(fila?.competencias).toEqual([]);
    });

    it('borrar un atributo deja la competencia sin ese mapeo, no la borra', async () => {
      // El `onDelete: Cascade` de la tabla puente borra el vínculo, no la
      // competencia: el marco de acreditación puede cambiar sin llevarse por
      // delante el catálogo de competencias de la universidad.
      //
      // Se usa un marco desechable en vez de uno de ICACIT: borrar AG-I08 lo
      // dejaría ausente para el resto de la ejecución, porque el `beforeEach`
      // no vacía ni resiembra los atributos —son del seed, no de la prueba—.
      const efimero = await prisma.atributoGraduado.create({
        data: {
          carreraId,
          marco: 'PRUEBA',
          codigo: 'X-01',
          nombre: 'Atributo desechable',
          orden: 1,
        },
      });
      const creada = await competenciaSuelta('CPE-01', 'Competencia', [efimero.id]);

      await prisma.atributoGraduado.delete({ where: { id: efimero.id } });

      const despues = await competencias.porId(creada.id);
      expect(despues).not.toBeNull();
      expect(despues?.atributos).toEqual([]);
    });

    it('la cobertura no mezcla marcos', async () => {
      await prisma.atributoGraduado.create({
        data: { carreraId, marco: 'OTRO', codigo: 'Z-01', nombre: 'De otro marco', orden: 1 },
      });
      expect(await competencias.cobertura('ICACIT')).toHaveLength(11);
    });
  });
});

describe('RF-CH-017 — competencias del plan y de la carrera', () => {
  it('crearEnPlan fija la carrera y vincula al plan en la misma escritura', async () => {
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver', []);
    expect(creada.carreraId).toBe(carreraId);
    expect(creada.planesVinculados).toBe(1);
    expect(
      await prisma.planCompetencia.count({ where: { planId, competenciaId: creada.id } }),
    ).toBe(1);
  });

  it('listar con planId devuelve solo las vinculadas a ese plan', async () => {
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Del plan', []);
    await competencias.crearEnPlan(otroPlanId, carreraId, 'CPE-02', 'De otro plan', []);
    expect((await competencias.listar({ planId })).map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('listar con carreraId devuelve solo las de esa carrera', async () => {
    const civ = await otraCarreraConPlan();
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'De Sistemas', []);
    await competenciaSuelta('CPE-02', 'Sin carrera');
    await competencias.crearEnPlan(civ.plan, civ.carrera, 'CPE-03', 'De Civil', []);
    expect((await competencias.listar({ carreraId })).map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('la cobertura con planId solo cuenta las del plan', async () => {
    const ag = (
      await prisma.atributoGraduado.findFirstOrThrow({
        where: { marco: 'ICACIT', codigo: 'AG-I08' },
      })
    ).id;
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Del plan', [ag]);
    await competencias.crearEnPlan(otroPlanId, carreraId, 'CPE-02', 'De otro plan', [ag]);

    const delPlan = (await competencias.cobertura('ICACIT', planId)).find(
      (a) => a.codigo === 'AG-I08',
    );
    const todas = (await competencias.cobertura('ICACIT')).find((a) => a.codigo === 'AG-I08');
    expect(delPlan?.competencias.map((c) => c.codigo)).toEqual(['CPE-01']);
    expect(todas?.competencias.map((c) => c.codigo)).toEqual(['CPE-01', 'CPE-02']);
  });
});

describe('RF-CH-017 — nombre único por carrera', () => {
  it('existeNombre busca solo dentro de la carrera, sin distinguir mayúsculas', async () => {
    const civ = await otraCarreraConPlan();
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver problemas', []);
    expect(await competencias.existeNombre('RESOLVER PROBLEMAS', carreraId)).toBe(true);
    expect(await competencias.existeNombre('Resolver problemas', civ.carrera)).toBe(false);
  });

  it('la base rechaza el mismo nombre dos veces en la misma carrera', async () => {
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver problemas', []);
    await expect(
      competencias.crearEnPlan(otroPlanId, carreraId, 'CPE-02', 'resolver problemas', []),
    ).rejects.toThrow();
  });

  it('el mismo nombre en dos carreras distintas sí se permite', async () => {
    const civ = await otraCarreraConPlan();
    await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Resolver problemas', []);
    await expect(
      competencias.crearEnPlan(civ.plan, civ.carrera, 'CPE-02', 'Resolver problemas', []),
    ).resolves.toBeTruthy();
  });
});

describe('RF-CH-018 — quitar del plan', () => {
  it('quitar el último vínculo con borrarRegistro borra la competencia y sus atributos', async () => {
    const ag = (
      await prisma.atributoGraduado.findFirstOrThrow({
        where: { marco: 'ICACIT', codigo: 'AG-I08' },
      })
    ).id;
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Única', [ag]);

    await competencias.quitarDelPlan(planId, creada.id, true);

    expect(await competencias.porId(creada.id)).toBeNull();
    expect(await prisma.competenciaAtributo.count({ where: { competenciaId: creada.id } })).toBe(0);
  });

  it('sin borrarRegistro solo quita el vínculo de este plan: el otro plan la conserva', async () => {
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Compartida', []);
    await prisma.planCompetencia.create({ data: { planId: otroPlanId, competenciaId: creada.id } });

    await competencias.quitarDelPlan(planId, creada.id, false);

    expect(await competencias.vinculadaAlPlan(planId, creada.id)).toBe(false);
    expect(await competencias.vinculadaAlPlan(otroPlanId, creada.id)).toBe(true);
    expect((await competencias.porId(creada.id))?.planesVinculados).toBe(1);
  });

  it('si otro plan la vincula, pedir el borrado falla y no quita nada', async () => {
    // El `Restrict` de `plan_competencia` es la última línea si el caso de uso
    // calculara mal, o si otro plan la vinculara entre la consulta y el borrado.
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Compartida', []);
    await prisma.planCompetencia.create({ data: { planId: otroPlanId, competenciaId: creada.id } });

    await expect(competencias.quitarDelPlan(planId, creada.id, true)).rejects.toThrow();
    expect(await competencias.vinculadaAlPlan(planId, creada.id)).toBe(true);
  });

  it('asignaturasDelPlanQueLaUsan devuelve solo las de ese plan, ordenadas', async () => {
    const creada = await competencias.crearEnPlan(planId, carreraId, 'CPE-01', 'Usada', []);
    await asignatura('ISI-102', [creada.id]);
    await asignatura('ISI-101', [creada.id]);
    await prisma.asignatura.create({
      data: {
        planId: otroPlanId,
        codigo: 'ISI-901',
        nombre: 'De otro plan',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 3,
        competencias: { create: { competenciaId: creada.id } },
      },
    });

    expect(await competencias.asignaturasDelPlanQueLaUsan(planId, creada.id)).toEqual([
      'ISI-101',
      'ISI-102',
    ]);
  });
});
