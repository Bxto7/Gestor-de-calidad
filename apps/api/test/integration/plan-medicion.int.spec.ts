/**
 * Pruebas de integración del repositorio de planes de medición (§6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede: que el índice único
 * parcial deje convivir dos Borradores pero no dos Vigentes del mismo tipo; que
 * la meta sobreviva al viaje a `Decimal` y vuelva idéntica; que reemplazar los
 * periodos se lleve sus celdas por cascada; que reprogramar conserve las marcas
 * de realizada; y que la matriz de 50 × 15 se lea dentro del umbral de RNF04.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/infrastructure/persistence/plan-medicion.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const repo = new PlanMedicionRepositoryPrisma(prisma);

let planEstudiosId: string;
/** El usuario que marca una medición también llega como UUID sin FK. */
const ACTOR_ID = randomUUID();

let CMP1: string;
let CMP2: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.documentos_medicion, mejora_continua.programacion_medicion,
             mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.planes_estudio, plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  const pe = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  planEstudiosId = pe.id;
  // Las competencias viven en otro esquema y llegan como UUID sueltos, sin clave
  // foránea (§3.2). Para el repositorio son identificadores opacos, pero la
  // columna sigue siendo UUID y no acepta cualquier cadena.
  CMP1 = randomUUID();
  CMP2 = randomUUID();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Un plan con sus competencias y periodos declarados, listo para programar.
 *
 * Vive en el ambito del archivo y no dentro de un `describe` porque lo usan
 * tanto las pruebas de la matriz como las de copia.
 */
async function conMatriz(competencias: string[], etiquetas: string[]) {
  const p = await crear();
  await repo.declararCompetencias(p.id, competencias);
  const tras = await repo.declararPeriodos(
    p.id,
    etiquetas.map((etiqueta, i) => ({ etiqueta, orden: i + 1, fechaCierre: null })),
  );
  return { planId: p.id, periodos: tras.periodos };
}

async function crear(tipo: 'DIRECTA' | 'INDIRECTA' = 'DIRECTA', codigo = 'PM-1', meta = 0.7) {
  return repo.crear({
    planEstudiosId,
    tipo,
    codigo,
    meta,
    periodoInicio: { anio: 2024, mitad: 1 },
  });
}

describe('RF-PM-041 RN1 — un único Vigente por plan de estudios y tipo', () => {
  it('el índice parcial rechaza el segundo Vigente del mismo tipo', async () => {
    const a = await crear('DIRECTA', 'PM-1');
    const b = await crear('DIRECTA', 'PM-2');

    await repo.cambiarEstado(a.id, 'Vigente');

    await expect(repo.cambiarEstado(b.id, 'Vigente')).rejects.toThrow();
  });

  it('pero sí admite dos Borradores del mismo tipo', async () => {
    // Es justo lo que un `@@unique` habría impedido: preparar el relevo del
    // plan vigente exige tener dos borradores conviviendo.
    await crear('DIRECTA', 'PM-1');

    await expect(crear('DIRECTA', 'PM-2')).resolves.toBeDefined();
  });

  it('y un Vigente Directa junto a un Vigente Indirecta', async () => {
    const d = await crear('DIRECTA', 'PM-1');
    const i = await crear('INDIRECTA', 'PM-2');

    await repo.cambiarEstado(d.id, 'Vigente');

    await expect(repo.cambiarEstado(i.id, 'Vigente')).resolves.toBeDefined();
  });

  it('`vigenteDe` encuentra el que rige y distingue el tipo', async () => {
    const d = await crear('DIRECTA', 'PM-1');
    await repo.cambiarEstado(d.id, 'Vigente');

    expect((await repo.vigenteDe(planEstudiosId, 'DIRECTA'))?.codigo).toBe('PM-1');
    expect(await repo.vigenteDe(planEstudiosId, 'INDIRECTA')).toBeNull();
  });
});

describe('estado y meta sobreviven al viaje a la base', () => {
  it('el estado vuelve en el vocabulario del dominio, no en el de la columna', async () => {
    const p = await crear();

    const enRevision = await repo.cambiarEstado(p.id, 'En revisión');

    expect(enRevision.estado).toBe('En revisión');
    expect((await repo.porId(p.id))?.estado).toBe('En revisión');
  });

  it('RF-PM-011 RN2: 0.705 se lee igual que se guardó', async () => {
    const p = await repo.crear({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-1',
      meta: 0.705,
      periodoInicio: null,
    });

    expect((await repo.porId(p.id))?.meta).toBe(0.705);
  });

  it('el periodo de inicio se conserva, y su ausencia también', async () => {
    const con = await crear();
    const sin = await repo.crear({
      planEstudiosId,
      tipo: 'INDIRECTA',
      codigo: 'PM-2',
      meta: 0.7,
      periodoInicio: null,
    });

    expect((await repo.porId(con.id))?.periodoInicio).toEqual({ anio: 2024, mitad: 1 });
    expect((await repo.porId(sin.id))?.periodoInicio).toBeNull();
  });

  it('el código es único en todo el sistema', async () => {
    await crear('DIRECTA', 'PM-1');

    await expect(crear('INDIRECTA', 'PM-1')).rejects.toThrow();
  });
});

describe('RF-PM-010 — consulta', () => {
  it('filtra por plan de estudios, tipo y estado', async () => {
    const a = await crear('DIRECTA', 'PM-1');
    await crear('INDIRECTA', 'PM-2');
    await repo.cambiarEstado(a.id, 'En revisión');

    expect(await repo.listar({ tipo: 'INDIRECTA' })).toHaveLength(1);
    expect(await repo.listar({ estado: 'En revisión' })).toHaveLength(1);
    expect(await repo.listar({ planEstudiosId })).toHaveLength(2);
  });

  it('RF-PM-004: `codigosDe` devuelve los ya usados de ese plan y tipo', async () => {
    await crear('DIRECTA', 'PM-D-1');
    await crear('DIRECTA', 'PM-D-2');
    await crear('INDIRECTA', 'PM-I-1');

    expect((await repo.codigosDe(planEstudiosId, 'DIRECTA')).sort()).toEqual(['PM-D-1', 'PM-D-2']);
  });
});

describe('RF-PM-018 — periodos sin duplicados y renumerados', () => {
  it('el índice único rechaza la etiqueta repetida', async () => {
    const p = await crear();

    await expect(
      repo.declararPeriodos(p.id, [
        { etiqueta: '2024-I', orden: 1, fechaCierre: null },
        { etiqueta: '2024-I', orden: 2, fechaCierre: null },
      ]),
    ).rejects.toThrow();
  });

  it('declarar reemplaza el conjunto completo', async () => {
    const p = await crear();
    await repo.declararPeriodos(p.id, [{ etiqueta: '2024-I', orden: 1, fechaCierre: null }]);

    const tras = await repo.declararPeriodos(p.id, [
      { etiqueta: '2025-I', orden: 1, fechaCierre: null },
    ]);

    expect(tras.periodos.map((x) => x.etiqueta)).toEqual(['2025-I']);
  });

  it('los periodos vuelven ordenados y con su fecha de cierre', async () => {
    const p = await crear();
    const cierre = new Date('2024-07-31');

    const tras = await repo.declararPeriodos(p.id, [
      { etiqueta: '2024-II', orden: 2, fechaCierre: null },
      { etiqueta: '2024-I', orden: 1, fechaCierre: cierre },
    ]);

    expect(tras.periodos.map((x) => x.etiqueta)).toEqual(['2024-I', '2024-II']);
    expect(tras.periodos[0]?.fechaCierre?.toISOString().slice(0, 10)).toBe('2024-07-31');
  });

  it('dos planes pueden usar la misma etiqueta de periodo', async () => {
    const a = await crear('DIRECTA', 'PM-1');
    const b = await crear('DIRECTA', 'PM-2');

    await repo.declararPeriodos(a.id, [{ etiqueta: '2024-I', orden: 1, fechaCierre: null }]);

    await expect(
      repo.declararPeriodos(b.id, [{ etiqueta: '2024-I', orden: 1, fechaCierre: null }]),
    ).resolves.toBeDefined();
  });
});

describe('RF-PM-022 — la matriz', () => {
  it('programar reemplaza el conjunto completo', async () => {
    const { planId, periodos } = await conMatriz([CMP1, CMP2], ['2024-I']);
    const periodoId = periodos[0]!.id;

    await repo.programar(planId, [{ competenciaId: CMP1, periodoId }]);
    expect(await repo.matriz(planId)).toHaveLength(1);

    await repo.programar(planId, [
      { competenciaId: CMP1, periodoId },
      { competenciaId: CMP2, periodoId },
    ]);
    expect(await repo.matriz(planId)).toHaveLength(2);
  });

  it('reprogramar conserva la marca de realizada de las celdas que siguen', async () => {
    // Quitar y volver a poner una competencia no puede borrar la constancia de
    // que su medición ya ocurrió.
    const { planId, periodos } = await conMatriz([CMP1, CMP2], ['2024-I']);
    const periodoId = periodos[0]!.id;
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId }]);
    await repo.marcarRealizada(planId, CMP1, periodoId, true, ACTOR_ID);

    await repo.programar(planId, [
      { competenciaId: CMP1, periodoId },
      { competenciaId: CMP2, periodoId },
    ]);

    const celda = (await repo.matriz(planId)).find((c) => c.competenciaId === CMP1);
    expect(celda?.realizada).toBe(true);
    expect(celda?.realizadaEn).not.toBeNull();
  });

  it('RF-PM-026 RN2: marcar deja constancia de cuándo', async () => {
    const { planId, periodos } = await conMatriz([CMP1], ['2024-I']);
    const periodoId = periodos[0]!.id;
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId }]);

    const marcada = await repo.marcarRealizada(planId, CMP1, periodoId, true, ACTOR_ID);

    expect(marcada.realizada).toBe(true);
    expect(marcada.realizadaEn).not.toBeNull();
  });

  it('desmarcar limpia la fecha', async () => {
    const { planId, periodos } = await conMatriz([CMP1], ['2024-I']);
    const periodoId = periodos[0]!.id;
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId }]);
    await repo.marcarRealizada(planId, CMP1, periodoId, true, ACTOR_ID);

    const desmarcada = await repo.marcarRealizada(planId, CMP1, periodoId, false, ACTOR_ID);

    expect(desmarcada.realizada).toBe(false);
    expect(desmarcada.realizadaEn).toBeNull();
  });

  it('quitar un periodo se lleva sus celdas por cascada', async () => {
    const { planId, periodos } = await conMatriz([CMP1], ['2024-I']);
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId: periodos[0]!.id }]);

    await repo.declararPeriodos(planId, [{ etiqueta: '2025-I', orden: 1, fechaCierre: null }]);

    expect(await repo.matriz(planId)).toEqual([]);
  });

  /**
   * Fijar la fecha de cierre obliga a reenviar todos los periodos, y RF-PM-017
   * la exige para aprobar: si eso borrara la matriz, todo plan la perdería
   * justo antes de aprobarse. El periodo que sigue ahí conserva sus celdas; el
   * que desaparece se las lleva, como comprueba la prueba anterior.
   */
  it('fijar la fecha de cierre no borra la programación de los periodos que siguen', async () => {
    const { planId, periodos } = await conMatriz([CMP1, CMP2], ['2024-I', '2024-II']);
    await repo.programar(planId, [
      { competenciaId: CMP1, periodoId: periodos[0]!.id },
      { competenciaId: CMP2, periodoId: periodos[1]!.id },
    ]);
    await repo.marcarRealizada(planId, CMP1, periodos[0]!.id, true, ACTOR_ID);

    const tras = await repo.declararPeriodos(planId, [
      { etiqueta: '2024-I', orden: 1, fechaCierre: new Date('2024-07-15') },
      { etiqueta: '2024-II', orden: 2, fechaCierre: new Date('2024-12-20') },
    ]);

    const porEtiqueta = new Map(tras.periodos.map((p) => [p.etiqueta, p.id]));
    const matriz = await repo.matriz(planId);

    expect(matriz).toHaveLength(2);
    expect(matriz).toContainEqual(
      expect.objectContaining({
        competenciaId: CMP2,
        periodoId: porEtiqueta.get('2024-II'),
        realizada: false,
      }),
    );
    // La constancia de que la medición ocurrió tampoco se pierde.
    expect(matriz).toContainEqual(
      expect.objectContaining({
        competenciaId: CMP1,
        periodoId: porEtiqueta.get('2024-I'),
        realizada: true,
      }),
    );
  });

  it('eliminar el plan se lleva periodos, competencias y matriz', async () => {
    const { planId, periodos } = await conMatriz([CMP1], ['2024-I']);
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId: periodos[0]!.id }]);

    await repo.eliminar(planId);

    expect(await repo.porId(planId)).toBeNull();
    expect(await prisma.programacion.count({ where: { planMedicionId: planId } })).toBe(0);
  });
});

describe('RF-PM-030 RN1 — el linaje', () => {
  it('borrar un plan intermedio no rompe el vínculo de sus descendientes', async () => {
    // `SetNull` y no `Cascade`: el descendiente sobrevive a su origen. Con
    // `Cascade` se borraría en silencio, y RF-PM-031 dejaría de poder mostrar
    // la cadena que ese requerimiento existe para mostrar.
    const v1 = await repo.crear({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-LINAJE-D-v1',
      meta: 0.7,
      periodoInicio: null,
    });
    const v2 = await prisma.planMedicion.create({
      data: {
        planEstudiosId,
        tipo: 'DIRECTA',
        codigo: 'PM-LINAJE-D-v2',
        version: 2,
        meta: 0.7,
        derivadoDeId: v1.id,
      },
    });

    await repo.eliminar(v1.id);

    const tras = await prisma.planMedicion.findUnique({ where: { id: v2.id } });
    expect(tras).not.toBeNull();
    expect(tras?.derivadoDeId).toBeNull();
  });
});

describe('RF-PM-030 y RF-PM-034 — copiar un plan', () => {
  it('la copia lleva competencias, periodos con fecha y celdas programadas', async () => {
    const { planId, periodos } = await conMatriz([CMP1, CMP2], ['2026-I', '2026-II']);
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId: periodos[0]!.id }]);
    const contenido = await repo.contenidoDe(planId);
    expect(contenido).not.toBeNull();

    const copia = await repo.copiar({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-COPIA-D-v9',
      version: 9,
      derivadoDeId: planId,
      contenido: contenido!,
    });

    expect(copia.competenciaIds).toHaveLength(2);
    expect(copia.periodos.map((p) => p.etiqueta)).toEqual(['2026-I', '2026-II']);

    // Las celdas se resolvieron contra los periodos NUEVOS, no los del origen:
    // el id del periodo de partida no existe en la copia.
    const matriz = await repo.matriz(copia.id);
    const idsNuevos = new Set(copia.periodos.map((p) => p.id));
    expect(matriz).toHaveLength(1);
    expect(idsNuevos.has(matriz[0]!.periodoId)).toBe(true);
  });

  it('el origen no se toca (RF-PM-030 RN2)', async () => {
    const { planId, periodos } = await conMatriz([CMP1], ['2026-I']);
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId: periodos[0]!.id }]);
    const contenido = await repo.contenidoDe(planId);

    await repo.copiar({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-INTACTO-D-v9',
      version: 9,
      derivadoDeId: planId,
      contenido: contenido!,
    });

    const original = await repo.porId(planId);
    expect(original?.estado).toBe('Borrador');
    expect(await repo.matriz(planId)).toHaveLength(1);
  });
});

describe('RF-PM-041 RN1 — el relevo al entrar en vigor', () => {
  it('marcar vigente archiva al anterior y deja exactamente uno', async () => {
    const v1 = await crear('DIRECTA', 'PM-RELEVO-D-v1');
    await repo.cambiarEstado(v1.id, 'Vigente');
    const v2 = await crear('DIRECTA', 'PM-RELEVO-D-v2');

    const r = await repo.marcarVigenteRelevando(v2.id);

    expect(r.plan.estado).toBe('Vigente');
    expect(r.relevado?.codigo).toBe('PM-RELEVO-D-v1');
    expect((await repo.porId(v1.id))?.estado).toBe('Histórico');

    const vigentes = await prisma.planMedicion.count({
      where: { planEstudiosId, tipo: 'DIRECTA', estado: 'VIGENTE' },
    });
    expect(vigentes).toBe(1);
  });

  it('sin anterior vigente, no releva a nadie', async () => {
    const solo = await crear('INDIRECTA', 'PM-SOLO-I-v1');

    const r = await repo.marcarVigenteRelevando(solo.id);

    expect(r.plan.estado).toBe('Vigente');
    expect(r.relevado).toBeNull();
  });

  it('no releva al vigente del otro tipo', async () => {
    const i = await crear('INDIRECTA', 'PM-OTRO-I-v1');
    await repo.cambiarEstado(i.id, 'Vigente');
    const d = await crear('DIRECTA', 'PM-OTRO-D-v1');

    const r = await repo.marcarVigenteRelevando(d.id);

    expect(r.relevado).toBeNull();
    expect((await repo.porId(i.id))?.estado).toBe('Vigente');
  });
});

describe('RF-PM-039 — responsable y fecha de aprobación', () => {
  it('se guardan junto al plan al aprobar', async () => {
    const p = await crear('DIRECTA', 'PM-APROB-D-v1');
    const cuando = new Date('2026-09-04T10:00:00Z');

    await repo.cambiarEstado(p.id, 'Aprobado', { actorId: ACTOR_ID, fecha: cuando });

    const fila = await prisma.planMedicion.findUnique({ where: { id: p.id } });
    expect(fila?.aprobadoPorId).toBe(ACTOR_ID);
    expect(fila?.aprobadoEn).toEqual(cuando);
  });

  it('una transición posterior no los pisa', async () => {
    const p = await crear('DIRECTA', 'PM-APROB2-D-v1');
    const cuando = new Date('2026-09-04T10:00:00Z');
    await repo.cambiarEstado(p.id, 'Aprobado', { actorId: ACTOR_ID, fecha: cuando });

    await repo.cambiarEstado(p.id, 'Vigente');

    const fila = await prisma.planMedicion.findUnique({ where: { id: p.id } });
    expect(fila?.aprobadoPorId).toBe(ACTOR_ID);
    expect(fila?.aprobadoEn).toEqual(cuando);
  });
});

describe('RF-PM-031 — el linaje', () => {
  it('devuelve la cadena de más reciente a más antigua, desde cualquier punto', async () => {
    const v1 = await crear('DIRECTA', 'PM-CADENA-D-v1');
    const contenido = await repo.contenidoDe(v1.id);
    const v2 = await repo.copiar({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-CADENA-D-v2',
      version: 2,
      derivadoDeId: v1.id,
      contenido: contenido!,
    });
    const v3 = await repo.copiar({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-CADENA-D-v3',
      version: 3,
      derivadoDeId: v2.id,
      contenido: contenido!,
    });

    for (const desde of [v1.id, v2.id, v3.id]) {
      expect((await repo.linajeDe(desde)).map((p) => p.codigo)).toEqual([
        'PM-CADENA-D-v3',
        'PM-CADENA-D-v2',
        'PM-CADENA-D-v1',
      ]);
    }
  });

  it('un plan sin linaje se devuelve solo a sí mismo', async () => {
    const solo = await crear('DIRECTA', 'PM-HUERFANO-D-v1');

    expect((await repo.linajeDe(solo.id)).map((p) => p.codigo)).toEqual(['PM-HUERFANO-D-v1']);
  });
});

describe('RF-PM-027 — los documentos del plan', () => {
  it('borrar el plan se lleva sus documentos', async () => {
    // `Cascade` y no `SetNull`: un documento sin plan no le sirve a nadie, y
    // dejaría archivos en disco que ninguna pantalla puede volver a pedir.
    const p = await crear('DIRECTA', 'PM-DOCS-D-v1');
    await prisma.documentoMedicion.create({
      data: {
        planMedicionId: p.id,
        tipo: 'PLAN_MEDICION_PDF',
        solicitadoPor: ACTOR_ID,
      },
    });

    await repo.eliminar(p.id);

    expect(await prisma.documentoMedicion.count({ where: { planMedicionId: p.id } })).toBe(0);
  });
});

describe('RNF04 — la matriz de 50 × 15', () => {
  it('se lee en menos de tres segundos', async () => {
    const p = await crear();
    const competencias = Array.from({ length: 50 }, () => randomUUID());
    await repo.declararCompetencias(p.id, competencias);
    const tras = await repo.declararPeriodos(
      p.id,
      Array.from({ length: 15 }, (_, i) => ({
        etiqueta: `P-${i}`,
        orden: i + 1,
        fechaCierre: null,
      })),
    );
    const celdas = competencias.flatMap((competenciaId) =>
      tras.periodos.map((per) => ({ competenciaId, periodoId: per.id })),
    );
    await repo.programar(p.id, celdas);

    const inicio = Date.now();
    const leida = await repo.matriz(p.id);
    const ms = Date.now() - inicio;

    expect(leida).toHaveLength(750);
    expect(ms).toBeLessThan(3000);
  });
});
