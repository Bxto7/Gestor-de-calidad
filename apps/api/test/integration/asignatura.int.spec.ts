/**
 * Pruebas de integración de asignaturas (CLAUDE.md §6.4).
 *
 * Aquí se comprueba lo que los dobles no alcanzan:
 *
 *  - que el reemplazo de competencias al editar sea atómico y no deje la
 *    asignatura sin ninguna a mitad de camino;
 *  - que los enumerados de tipo y condición viajen de ida y vuelta sin perderse
 *    entre el vocabulario del dominio y el de PostgreSQL;
 *  - que el CHECK de créditos y horas rechace lo que el dominio ya rechaza, para
 *    que la base sea la última línea y no la única;
 *  - que el orden del listado ponga al final las asignaturas sin ciclo.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';
import type { DatosAsignaturaEntrada } from '../../src/modules/plan-estudios/application/ports/asignatura.port.js';
import { AsignaturaRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.js';

const prisma = new PrismaService();
const repo = new AsignaturaRepositoryPrisma(prisma);

let planId: string;
let carreraId: string;
const cicloIds = new Map<number, string>();
const competencias = new Map<string, string>();

const ENTRADA: DatosAsignaturaEntrada = {
  nombre: 'Álgebra Lineal',
  descripcion: 'Sumilla sintética del curso.',
  tipo: 'General',
  condicion: 'Obligatoria',
  creditos: 4,
  horasTeoricas: 3,
  competenciaIds: [],
};

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignatura_competencia, plan_estudios.dependencias,
             plan_estudios.asignaturas, plan_estudios.competencias,
             plan_estudios.ciclos, plan_estudios.planes_estudio,
             plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 2 },
  });
  carreraId = carrera.id;

  cicloIds.clear();
  for (const numero of [1, 2, 3, 4]) {
    const ciclo = await prisma.ciclo.create({ data: { carreraId, numero } });
    cicloIds.set(numero, ciclo.id);
  }

  const plan = await prisma.planEstudios.create({
    data: {
      carreraId,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: 2,
    },
  });
  planId = plan.id;

  // Las competencias se siembran directamente: su CRUD aún no existe, pero el
  // vínculo de RF049 sí y necesita competencias reales contra las que probarse.
  competencias.clear();
  for (const [codigo, nombre] of [
    ['CPE-01', 'Resolver problemas de ingeniería'],
    ['CPE-02', 'Diseñar sistemas de software'],
    ['CPE-03', 'Comunicarse con eficacia'],
  ]) {
    const c = await prisma.competencia.create({ data: { codigo: codigo!, nombre: nombre! } });
    competencias.set(codigo!, c.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

const idDe = (codigo: string): string => competencias.get(codigo)!;

describe('Ida y vuelta de los enumerados', () => {
  it('los tres tipos sobreviven al viaje a PostgreSQL', async () => {
    for (const tipo of ['General', 'Transversal', 'Especialidad'] as const) {
      const creada = await repo.crear(planId, `ISI-10${TIPOS_INDICE[tipo]}`, {
        ...ENTRADA,
        nombre: `Curso ${tipo}`,
        tipo,
      });
      expect(creada.tipo, tipo).toBe(tipo);
      expect((await repo.porId(creada.id))?.tipo, tipo).toBe(tipo);
    }
  });

  it('las dos condiciones también', async () => {
    for (const [i, condicion] of (['Obligatoria', 'Electiva'] as const).entries()) {
      const creada = await repo.crear(planId, `ISI-20${i}`, {
        ...ENTRADA,
        nombre: `Curso ${condicion}`,
        condicion,
      });
      expect(creada.condicion, condicion).toBe(condicion);
    }
  });

  it('una asignatura nace activa y sin ciclo', async () => {
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    expect(creada.activa).toBe(true);
    expect(creada.cicloNumero).toBeNull();
  });
});

describe('RF049 — vínculo con competencias', () => {
  it('las guarda al crear', async () => {
    const creada = await repo.crear(planId, 'ISI-101', {
      ...ENTRADA,
      competenciaIds: [idDe('CPE-01'), idDe('CPE-02')],
    });
    expect(creada.competencias.map((c) => c.codigo).sort()).toEqual(['CPE-01', 'CPE-02']);
  });

  it('el reemplazo al editar es completo', async () => {
    const creada = await repo.crear(planId, 'ISI-101', {
      ...ENTRADA,
      competenciaIds: [idDe('CPE-01'), idDe('CPE-02')],
    });

    const editada = await repo.actualizar(creada.id, {
      ...ENTRADA,
      competenciaIds: [idDe('CPE-03')],
    });

    expect(editada.competencias.map((c) => c.codigo)).toEqual(['CPE-03']);
    // Y no quedan filas huérfanas en la tabla intermedia.
    expect(await prisma.asignaturaCompetencia.count({ where: { asignaturaId: creada.id } })).toBe(
      1,
    );
  });

  it('quitar todas las competencias es posible', async () => {
    const creada = await repo.crear(planId, 'ISI-101', {
      ...ENTRADA,
      competenciaIds: [idDe('CPE-01')],
    });
    const editada = await repo.actualizar(creada.id, { ...ENTRADA, competenciaIds: [] });
    expect(editada.competencias).toEqual([]);
  });

  it('competenciasValidas ignora las inactivas', async () => {
    await prisma.competencia.update({
      where: { id: idDe('CPE-02') },
      data: { estado: 'INACTIVO' },
    });

    const validas = await repo.competenciasValidas([idDe('CPE-01'), idDe('CPE-02')]);
    expect(validas).toEqual([idDe('CPE-01')]);
  });

  it('competenciasValidas descarta identificadores inexistentes', async () => {
    const validas = await repo.competenciasValidas([
      idDe('CPE-01'),
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(validas).toEqual([idDe('CPE-01')]);
  });

  it('vincular una competencia inexistente lo rechaza la clave foránea', async () => {
    // Por eso el caso de uso valida antes: aquí el mensaje sería de PostgreSQL.
    await expect(
      repo.crear(planId, 'ISI-101', {
        ...ENTRADA,
        competenciaIds: ['00000000-0000-0000-0000-000000000000'],
      }),
    ).rejects.toThrow();
  });
});

describe('Los CHECK de la base son la última línea', () => {
  it('RF054: rechaza créditos en cero', async () => {
    await expect(repo.crear(planId, 'ISI-101', { ...ENTRADA, creditos: 0 })).rejects.toThrow();
  });

  it('RF055: rechaza horas negativas', async () => {
    await expect(
      repo.crear(planId, 'ISI-101', { ...ENTRADA, horasTeoricas: -1 }),
    ).rejects.toThrow();
  });

  it('el código no se repite dentro del plan', async () => {
    await repo.crear(planId, 'ISI-101', ENTRADA);
    await expect(repo.crear(planId, 'ISI-101', { ...ENTRADA, nombre: 'Otra' })).rejects.toThrow();
  });
});

describe('RF047 — unicidad de nombre dentro del plan', () => {
  it('detecta el nombre repetido sin distinguir mayúsculas', async () => {
    await repo.crear(planId, 'ISI-101', ENTRADA);
    expect(await repo.existeNombreEnPlan(planId, 'álgebra lineal')).toBe(true);
  });

  it('se excluye a sí misma al editar', async () => {
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    expect(await repo.existeNombreEnPlan(planId, ENTRADA.nombre, creada.id)).toBe(false);
  });

  it('el mismo nombre en otro plan no choca', async () => {
    // Cada plan es un catálogo propio: dos versiones de una carrera comparten
    // los nombres de sus cursos por definición.
    await repo.crear(planId, 'ISI-101', ENTRADA);
    const otro = await prisma.planEstudios.create({
      data: {
        carreraId,
        codigo: 'PE-ISI-2027-v2',
        version: 2,
        estado: 'BORRADOR',
        duracionAnios: 2,
      },
    });
    expect(await repo.existeNombreEnPlan(otro.id, ENTRADA.nombre)).toBe(false);
  });
});

describe('RF053 — códigos ocupados', () => {
  it('incluye los de las asignaturas inactivas', async () => {
    // Su código sigue ocupado: reutilizarlo rompería la unicidad y confundiría
    // el histórico de la acreditación.
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    await repo.cambiarEstado(creada.id, false);
    expect(await repo.codigosDe(planId)).toEqual(['ISI-101']);
  });
});

describe('RF051 / RF057 — listado y filtros', () => {
  beforeEach(async () => {
    await repo.crear(planId, 'ISI-101', { ...ENTRADA, nombre: 'Álgebra', tipo: 'General' });
    await repo.crear(planId, 'ISI-102', {
      ...ENTRADA,
      nombre: 'Bases de Datos',
      tipo: 'Especialidad',
      condicion: 'Electiva',
    });
    await repo.crear(planId, 'ISI-103', {
      ...ENTRADA,
      nombre: 'Ética Profesional',
      tipo: 'Transversal',
    });
  });

  it('sin filtro devuelve todas', async () => {
    expect(await repo.listar(planId)).toHaveLength(3);
  });

  it('filtra por tipo', async () => {
    const r = await repo.listar(planId, { tipo: 'Especialidad' });
    expect(r.map((a) => a.codigo)).toEqual(['ISI-102']);
  });

  it('RN1: los filtros se combinan', async () => {
    expect(await repo.listar(planId, { tipo: 'General', condicion: 'Electiva' })).toHaveLength(0);
    expect(await repo.listar(planId, { tipo: 'Especialidad', condicion: 'Electiva' })).toHaveLength(
      1,
    );
  });

  it('busca por nombre sin distinguir mayúsculas', async () => {
    const r = await repo.listar(planId, { texto: 'bases' });
    expect(r.map((a) => a.codigo)).toEqual(['ISI-102']);
  });

  it('DEJA CONSTANCIA: la búsqueda sí distingue acentos', async () => {
    // `mode: 'insensitive'` de Prisma solo ignora mayúsculas, no diacríticos.
    // Quien busque "etica" no encontrará "Ética Profesional", que es justo lo
    // que hará un usuario que escribe rápido. Se documenta aquí en vez de
    // dejarlo como sorpresa: resolverlo pide `unaccent` o `citext` en la base,
    // y eso es una migración, no un cambio de esta consulta.
    expect(await repo.listar(planId, { texto: 'Ética' })).toHaveLength(1);
    expect(await repo.listar(planId, { texto: 'etica' })).toHaveLength(0);
  });

  it('busca también por código', async () => {
    const r = await repo.listar(planId, { texto: 'ISI-103' });
    expect(r.map((a) => a.nombre)).toEqual(['Ética Profesional']);
  });

  it('filtra por estado', async () => {
    const [primera] = await repo.listar(planId);
    await repo.cambiarEstado(primera!.id, false);

    expect(await repo.listar(planId, { activa: true })).toHaveLength(2);
    expect(await repo.listar(planId, { activa: false })).toHaveLength(1);
  });
});

describe('RF058 / orden del listado', () => {
  it('las asignaturas sin ciclo van al final', async () => {
    const a = await repo.crear(planId, 'ISI-101', { ...ENTRADA, nombre: 'Sin ciclo' });
    const b = await repo.crear(planId, 'ISI-102', { ...ENTRADA, nombre: 'Ciclo 2' });
    const c = await repo.crear(planId, 'ISI-103', { ...ENTRADA, nombre: 'Ciclo 1' });

    await prisma.asignatura.update({
      where: { id: b.id },
      data: { cicloId: cicloIds.get(2)! },
    });
    await prisma.asignatura.update({
      where: { id: c.id },
      data: { cicloId: cicloIds.get(1)! },
    });

    const orden = (await repo.listar(planId)).map((x) => x.nombre);
    expect(orden).toEqual(['Ciclo 1', 'Ciclo 2', 'Sin ciclo']);
    expect(orden[2]).toBe('Sin ciclo');
    expect(a.cicloNumero).toBeNull();
  });

  it('sinCiclo devuelve solo las pendientes de ubicar', async () => {
    const a = await repo.crear(planId, 'ISI-101', { ...ENTRADA, nombre: 'Ubicada' });
    await repo.crear(planId, 'ISI-102', { ...ENTRADA, nombre: 'Pendiente' });
    await prisma.asignatura.update({
      where: { id: a.id },
      data: { cicloId: cicloIds.get(1)! },
    });

    const r = await repo.listar(planId, { sinCiclo: true });
    expect(r.map((x) => x.nombre)).toEqual(['Pendiente']);
  });
});

describe('RF052 — inactivar', () => {
  it('la retira de la malla', async () => {
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    await prisma.asignatura.update({
      where: { id: creada.id },
      data: { cicloId: cicloIds.get(1)! },
    });

    const inactivada = await repo.cambiarEstado(creada.id, false);
    expect(inactivada.activa).toBe(false);
    expect(inactivada.cicloNumero).toBeNull();
  });

  it('RN1: el registro sigue existiendo', async () => {
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    await repo.cambiarEstado(creada.id, false);
    expect(await prisma.asignatura.count({ where: { planId } })).toBe(1);
  });

  it('reactivar no la devuelve sola a la malla', async () => {
    // La malla cambió mientras no estaba: hay que ubicarla otra vez a mano.
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    await prisma.asignatura.update({
      where: { id: creada.id },
      data: { cicloId: cicloIds.get(1)! },
    });
    await repo.cambiarEstado(creada.id, false);

    const reactivada = await repo.cambiarEstado(creada.id, true);
    expect(reactivada.activa).toBe(true);
    expect(reactivada.cicloNumero).toBeNull();
  });

  it('conserva sus competencias al inactivarse', async () => {
    const creada = await repo.crear(planId, 'ISI-101', {
      ...ENTRADA,
      competenciaIds: [idDe('CPE-01')],
    });
    const inactivada = await repo.cambiarEstado(creada.id, false);
    expect(inactivada.competencias.map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('el impacto nombra a quienes la requieren', async () => {
    const base = await repo.crear(planId, 'ISI-101', { ...ENTRADA, nombre: 'Álgebra' });
    const avanzada = await repo.crear(planId, 'ISI-201', { ...ENTRADA, nombre: 'Cálculo' });
    const otra = await repo.crear(planId, 'ISI-301', { ...ENTRADA, nombre: 'Métodos' });

    await prisma.dependencia.createMany({
      data: [
        { asignaturaId: avanzada.id, requiereId: base.id },
        { asignaturaId: otra.id, requiereId: base.id },
      ],
    });

    const impacto = await repo.impactoDeInactivar(base.id);
    expect(impacto.dependientes).toEqual(['ISI-201', 'ISI-301']);
  });

  it('sin dependientes, el impacto viene vacío', async () => {
    const creada = await repo.crear(planId, 'ISI-101', ENTRADA);
    expect((await repo.impactoDeInactivar(creada.id)).dependientes).toEqual([]);
  });
});

/** Sufijo por tipo, solo para no repetir códigos en el bucle de la prueba. */
const TIPOS_INDICE: Record<string, number> = { General: 1, Transversal: 2, Especialidad: 3 };
