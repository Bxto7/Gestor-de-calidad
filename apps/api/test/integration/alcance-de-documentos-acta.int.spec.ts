/**
 * RF-CH-049 en la exportación contra la base real: encolar, estado, listado y
 * descarga de los documentos de un acta de otra carrera responden 404, y el trabajo
 * se resuelve desde su acta, no desde su id.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import {
  ConsultarDocumentoActa,
  GenerarDocumentoActa,
} from '../../src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.js';
import { DocumentoActaRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import {
  type Escenario,
  adaptador,
  prisma,
  publicador,
  repoActas,
  sembrar,
} from './fixtures-actas.js';

const documentos = new DocumentoActaRepositoryPrisma(prisma);
const almacen = { guardar: async () => '/x', leer: async () => Buffer.from('contenido') };
const generar = new GenerarDocumentoActa(
  documentos,
  repoActas,
  new PlanMejoraRepositoryPrisma(prisma),
  { encolar: async () => {} },
  almacen,
  { render: async () => Buffer.from('pdf') },
  { render: async () => Buffer.from('xlsx') },
  adaptador,
  publicador,
  adaptador,
);
const consultar = new ConsultarDocumentoActa(documentos, almacen, adaptador, repoActas, adaptador);

let e: Escenario;
let trabajoA: string;

beforeEach(async () => {
  e = await sembrar();
  const t = await documentos.crear({
    actaId: e.actaA,
    tipo: 'ACTA_PDF',
    solicitadoPor: e.coordA.id,
  });
  await documentos.marcarListo(t.id, {
    nombreArchivo: 'a.pdf',
    tipoMime: 'application/pdf',
    bytes: 8,
    ubicacion: '/a.pdf',
  });
  trabajoA = t.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-049 — exportación', () => {
  it('encolar sobre un acta de otra carrera es 404 y no crea ningún trabajo', async () => {
    const antes = await prisma.documentoActa.count();

    await expect(generar.encolar(e.coordB, e.actaA, 'ACTA_PDF')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(await prisma.documentoActa.count()).toBe(antes);
  });

  it('el Coordinador de la carrera exporta, consulta, lista y descarga lo suyo', async () => {
    const nuevo = await generar.encolar(e.coordA, e.actaA, 'ACTA_EXCEL');

    expect((await consultar.estado(e.coordA, nuevo.id)).tipo).toBe('ACTA_EXCEL');
    expect((await consultar.listarDeActa(e.coordA, e.actaA)).length).toBe(2);
    expect((await consultar.descargar(e.coordA, trabajoA)).nombreArchivo).toBe('a.pdf');
  });

  it('el de otra carrera recibe 404 en estado, listado y descarga, aunque el trabajo esté Listo', async () => {
    await expect(consultar.estado(e.coordB, trabajoA)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(consultar.listarDeActa(e.coordB, e.actaA)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(consultar.descargar(e.coordB, trabajoA)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Consultor descarga el de cualquier carrera', async () => {
    expect((await consultar.descargar(e.consultor, trabajoA)).nombreArchivo).toBe('a.pdf');
  });
});
