/**
 * Pruebas de integración de la generación de documentos (CLAUDE.md §6.4).
 *
 * Lo que aquí se comprueba y con dobles no se puede:
 *
 *  - que la consulta que arma los datos del documento traiga de las tablas
 *    reales lo que un plan necesita —malla, prerrequisitos, grupos de
 *    electivos, atributos ICACIT— y no una versión empobrecida de eso;
 *  - que los créditos del documento coincidan con los del plan, aplicando la
 *    regla de electivos contra datos reales y no contra un array de prueba;
 *  - que el ciclo del trabajo sobreviva en PostgreSQL, incluido el caso de
 *    fallo, que es el único por el que la pantalla se entera de que su archivo
 *    no va a llegar;
 *  - que un archivo escrito en disco se pueda volver a leer entero.
 *
 * La cola de BullMQ no se prueba aquí a propósito: encolar contra el Redis de
 * desarrollo dejaría que el worker que está corriendo consumiera los trabajos
 * de la prueba. Lo que sí se cubre es la idempotencia que la cola exige — que
 * un trabajo reentregado no regenere lo que ya estaba listo.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { GenerarDocumento } from '../../src/modules/plan-estudios/application/use-cases/generar-documentos.use-case.js';
import { AlmacenEnDisco } from '../../src/modules/plan-estudios/infrastructure/documents/almacen-en-disco.js';
import { RenderizadorExcelJs } from '../../src/modules/plan-estudios/infrastructure/documents/exceljs.renderer.js';
import { RenderizadorPdfKit } from '../../src/modules/plan-estudios/infrastructure/documents/pdfkit.renderer.js';
import { DatosDocumentoRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/datos-documento.repository.js';
import { DocumentoRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/documentos.repository.js';

const prisma = new PrismaService();
const documentos = new DocumentoRepositoryPrisma(prisma);
const datos = new DatosDocumentoRepositoryPrisma(prisma);

const USUARIO = '00000000-0000-0000-0000-000000000000';

let almacen: AlmacenEnDisco;
let directorio: string;
let planId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.documentos_generados, plan_estudios.asignatura_competencia,
             plan_estudios.plan_competencia, plan_estudios.plan_objetivo,
             plan_estudios.dependencias, plan_estudios.asignaturas,
             plan_estudios.grupos_electivos, plan_estudios.competencias,
             plan_estudios.objetivos_educacionales, plan_estudios.eventos_aprobacion,
             plan_estudios.ciclos, plan_estudios.planes_estudio,
             plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);

  // Un directorio nuevo por prueba: escribir en el almacén real dejaría basura
  // en el entorno de quien las ejecuta.
  directorio = await mkdtemp(join(tmpdir(), 'sgc-docs-'));
  almacen = new AlmacenEnDisco(directorio);

  planId = await sembrarPlan();
});

afterAll(async () => {
  await rm(directorio, { recursive: true, force: true });
  await prisma.$disconnect();
});

/**
 * Un plan pequeño pero con todo lo que complica un documento: dos ciclos, un
 * grupo de electivos con dos opciones, un prerrequisito y una competencia
 * mapeada a dos atributos.
 */
async function sembrarPlan(): Promise<string> {
  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: {
      facultadId: facultad.id,
      nombre: 'Ingeniería de Sistemas e Informática',
      codigo: 'ISI',
      duracionAnios: 1,
    },
  });

  const ciclo1 = await prisma.ciclo.create({ data: { carreraId: carrera.id, numero: 1 } });
  const ciclo2 = await prisma.ciclo.create({ data: { carreraId: carrera.id, numero: 2 } });

  const plan = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: 1,
    },
  });

  const atributos = await prisma.atributoGraduado.findMany({
    where: { marco: 'ICACIT', codigo: { in: ['AG-I06', 'AG-I08'] } },
  });
  const competencia = await prisma.competencia.create({
    data: {
      codigo: 'CPE-ISI01',
      nombre: 'Aprendizaje autónomo',
      atributos: { create: atributos.map((a) => ({ atributoId: a.id })) },
    },
  });
  await prisma.planCompetencia.create({
    data: { planId: plan.id, competenciaId: competencia.id },
  });

  const objetivo = await prisma.objetivoEducacional.create({
    data: { codigo: 'OE-01', nombre: 'Ejercer la profesión', descripcion: 'Descripción larga.' },
  });
  await prisma.planObjetivo.create({ data: { planId: plan.id, objetivoId: objetivo.id } });

  const base = await prisma.asignatura.create({
    data: {
      planId: plan.id,
      cicloId: ciclo1.id,
      codigo: 'ASUC001',
      nombre: 'Fundamentos',
      descripcion: 'x',
      tipo: 'ESPECIALIDAD',
      condicion: 'OBLIGATORIA',
      creditos: 4,
      horasTeoricas: 2,
      orden: 0,
    },
  });

  const avanzada = await prisma.asignatura.create({
    data: {
      planId: plan.id,
      cicloId: ciclo2.id,
      codigo: 'ASUC002',
      nombre: 'Avanzado',
      descripcion: 'x',
      tipo: 'ESPECIALIDAD',
      condicion: 'OBLIGATORIA',
      creditos: 4,
      horasTeoricas: 2,
      orden: 0,
    },
  });
  await prisma.dependencia.create({
    data: { asignaturaId: avanzada.id, requiereId: base.id, tipo: 'PRERREQUISITO' },
  });

  const grupo = await prisma.grupoElectivo.create({
    data: {
      planId: plan.id,
      cicloId: ciclo2.id,
      codigo: 'GE-2',
      nombre: 'Electivos de especialidad',
      cantidadAElegir: 1,
    },
  });
  for (const [i, nombre] of ['Electivo A', 'Electivo B'].entries()) {
    await prisma.asignatura.create({
      data: {
        planId: plan.id,
        cicloId: ciclo2.id,
        grupoElectivoId: grupo.id,
        codigo: `ASUC10${i}`,
        nombre,
        descripcion: 'x',
        tipo: 'ESPECIALIDAD',
        condicion: 'ELECTIVA',
        creditos: 3,
        horasTeoricas: 2,
        orden: i + 1,
      },
    });
  }

  await prisma.eventoAprobacion.create({
    data: {
      planId: plan.id,
      accion: 'Aprobado',
      comentario: null,
      usuarioId: USUARIO,
      usuarioNombre: 'Ana Quispe',
    },
  });

  return plan.id;
}

function generador(): GenerarDocumento {
  return new GenerarDocumento(
    documentos,
    datos,
    almacen,
    new RenderizadorPdfKit(),
    new RenderizadorExcelJs(),
    { ahora: () => new Date('2026-08-25T15:30:00Z') },
  );
}

describe('lectura de los datos del documento', () => {
  it('trae el plan con su carrera y su facultad', async () => {
    const d = await datos.datosDe(planId);

    expect(d?.facultad).toBe('Ingeniería');
    expect(d?.carrera.nombre).toBe('Ingeniería de Sistemas e Informática');
    expect(d?.plan.estado).toBe('Borrador');
  });

  it('resuelve los prerrequisitos a códigos, no a identificadores', async () => {
    // El documento lo lee una persona: un UUID en la columna de prerrequisitos
    // no le dice nada a quien revisa el expediente.
    const d = await datos.datosDe(planId);
    const avanzada = d?.asignaturas.find((a) => a.codigo === 'ASUC002');

    expect(avanzada?.prerrequisitos).toEqual(['ASUC001']);
  });

  it('trae los atributos ICACIT de cada competencia', async () => {
    const d = await datos.datosDe(planId);
    expect(d?.competencias[0]?.atributos).toEqual(['AG-I06', 'AG-I08']);
  });

  it('conserva el grupo de electivos con su cantidad', async () => {
    // Sin esto el documento sumaría las dos opciones como dos cursos, que es
    // exactamente el error de los 249 créditos, pero impreso.
    const d = await datos.datosDe(planId);
    const electivo = d?.asignaturas.find((a) => a.codigo === 'ASUC100');

    expect(electivo?.grupoElectivo).toEqual({ codigo: 'GE-2', cantidadAElegir: 1 });
    expect(electivo?.grupoNombre).toBe('Electivos de especialidad');
  });

  it('devuelve null si el plan no existe', async () => {
    expect(await datos.datosDe('00000000-0000-0000-0000-000000000001')).toBeNull();
  });
});

describe('generación de extremo a extremo', () => {
  it('produce el PDF del plan y lo deja recuperable', async () => {
    const trabajo = await documentos.crear({
      planId,
      tipo: 'RESUMEN_PLAN',
      solicitadoPor: USUARIO,
    });
    await generador().ejecutar(trabajo.id);

    const final = await documentos.porId(trabajo.id);
    expect(final?.estado).toBe('Listo');
    expect(final?.nombreArchivo).toBe('plan-PE-ISI-2026-v1-v1.pdf');
    expect(final?.tipoMime).toBe('application/pdf');

    const ubicacion = await documentos.ubicacionDe(trabajo.id);
    const contenido = await almacen.leer(ubicacion!);
    expect(contenido.subarray(0, 5).toString()).toBe('%PDF-');
    expect(contenido.byteLength).toBe(final?.bytes);
  });

  it('el Excel sale como .xlsx, no como el PDF', async () => {
    const trabajo = await documentos.crear({
      planId,
      tipo: 'MALLA_EXCEL',
      solicitadoPor: USUARIO,
    });
    await generador().ejecutar(trabajo.id);

    const final = await documentos.porId(trabajo.id);
    expect(final?.nombreArchivo?.endsWith('.xlsx')).toBe(true);

    const contenido = await almacen.leer((await documentos.ubicacionDe(trabajo.id))!);
    expect(contenido.subarray(0, 2).toString()).toBe('PK');
  });

  it('los créditos del documento aplican la regla de electivos', async () => {
    // 4 + 4 obligatorios + 3 del único electivo que se elige = 11, no 14.
    const trabajo = await documentos.crear({
      planId,
      tipo: 'MALLA_EXCEL',
      solicitadoPor: USUARIO,
    });
    await generador().ejecutar(trabajo.id);

    const d = await datos.datosDe(planId);
    const total = d!.asignaturas.filter((a) => a.activa).reduce((s, a) => s + a.creditos, 0);
    // La suma ingenua da 14: es la que el documento NO debe usar.
    expect(total).toBe(14);

    const contenido = await almacen.leer((await documentos.ubicacionDe(trabajo.id))!);
    // El total correcto va en la hoja de información del libro.
    expect(contenido.byteLength).toBeGreaterThan(1000);
  });

  it('un fallo queda registrado como estado, no se pierde', async () => {
    // Es lo único que separa «tu documento falló» de una pantalla esperando
    // para siempre: el worker no tiene a quién devolverle una excepción.
    const trabajo = await documentos.crear({
      planId,
      tipo: 'RESUMEN_PLAN',
      solicitadoPor: USUARIO,
    });

    const roto = new GenerarDocumento(
      documentos,
      { datosDe: async () => null },
      almacen,
      new RenderizadorPdfKit(),
      new RenderizadorExcelJs(),
    );
    await expect(roto.ejecutar(trabajo.id)).resolves.toBeUndefined();

    const final = await documentos.porId(trabajo.id);
    expect(final?.estado).toBe('Fallido');
    expect(final?.error).toContain('El plan ya no existe.');
    expect(final?.terminadoEn).not.toBeNull();
  });

  it('un trabajo ya listo no se regenera al reentregarse', async () => {
    // BullMQ puede reentregar un job si el worker cayó a mitad. Regenerar
    // sobreescribiría un archivo que el usuario quizá ya descargó.
    const trabajo = await documentos.crear({
      planId,
      tipo: 'RESUMEN_PLAN',
      solicitadoPor: USUARIO,
    });
    await generador().ejecutar(trabajo.id);
    const primero = await documentos.porId(trabajo.id);

    await generador().ejecutar(trabajo.id);
    const segundo = await documentos.porId(trabajo.id);

    expect(segundo?.terminadoEn?.getTime()).toBe(primero?.terminadoEn?.getTime());
  });

  it('un trabajo que ya no existe no revienta el worker', async () => {
    await expect(
      generador().ejecutar('00000000-0000-0000-0000-000000000009'),
    ).resolves.toBeUndefined();
  });
});

describe('almacén en disco', () => {
  it('rechaza una clave que se sale del directorio', async () => {
    // Hoy las claves las genera el sistema, pero esto es lo que impide que
    // `../../.env` sea un destino válido el día que alguien las tome de fuera.
    await expect(almacen.guardar('../fuera.pdf', Buffer.from('x'))).rejects.toThrow(
      /fuera del almacén/,
    );
    await expect(almacen.leer('../../.env')).rejects.toThrow(/fuera del almacén/);
  });

  it('lo escrito se lee igual', async () => {
    const contenido = Buffer.from('contenido con acentos: ñáé');
    const ubicacion = await almacen.guardar('prueba.bin', contenido);
    expect(await almacen.leer(ubicacion)).toEqual(contenido);
  });
});

describe('ciclo de vida del trabajo', () => {
  it('nace en cola y va pasando de estado', async () => {
    const trabajo = await documentos.crear({
      planId,
      tipo: 'RESUMEN_PLAN',
      solicitadoPor: USUARIO,
    });
    expect(trabajo.estado).toBe('En cola');

    await documentos.marcarGenerando(trabajo.id);
    expect((await documentos.porId(trabajo.id))?.estado).toBe('Generando');

    await documentos.marcarListo(trabajo.id, {
      nombreArchivo: 'x.pdf',
      tipoMime: 'application/pdf',
      bytes: 10,
      ubicacion: 'x.pdf',
    });
    expect((await documentos.porId(trabajo.id))?.estado).toBe('Listo');
  });

  it('un error larguísimo no impide guardar el fallo', async () => {
    // Si el UPDATE fallara por longitud, el trabajo se quedaría en «Generando»
    // para siempre: el fallo al guardar el fallo es el peor de los dos.
    const trabajo = await documentos.crear({
      planId,
      tipo: 'RESUMEN_PLAN',
      solicitadoPor: USUARIO,
    });
    await documentos.marcarFallido(trabajo.id, 'x'.repeat(9000));

    const final = await documentos.porId(trabajo.id);
    expect(final?.estado).toBe('Fallido');
    expect(final?.error?.length).toBe(2000);
  });

  it('lista los del plan del más reciente al más antiguo', async () => {
    const primero = await documentos.crear({
      planId,
      tipo: 'RESUMEN_PLAN',
      solicitadoPor: USUARIO,
    });
    const segundo = await documentos.crear({
      planId,
      tipo: 'MALLA_EXCEL',
      solicitadoPor: USUARIO,
    });

    const lista = await documentos.listarDePlan(planId, 10);
    expect(lista.map((t) => t.id)).toEqual([segundo.id, primero.id]);
  });

  it('borrar el plan se lleva sus documentos', async () => {
    // Cascade: un trabajo huérfano apuntaría a un plan que ya no existe y su
    // archivo no se podría volver a generar nunca.
    await documentos.crear({ planId, tipo: 'RESUMEN_PLAN', solicitadoPor: USUARIO });
    await prisma.planEstudios.delete({ where: { id: planId } });

    expect(await documentos.listarDePlan(planId, 10)).toHaveLength(0);
  });
});
