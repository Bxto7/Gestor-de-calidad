/**
 * Bloque 6c (RF-CH-048, RF-CH-049) contra la base real y con los roles reales del
 * seed: quién lee qué acta, el 404 en lugar del 403 y el cierre del ítem I1.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AccesoDenegado, NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import {
  type Escenario,
  bitacora,
  gestionarActas,
  planDeMejora,
  prisma,
  sembrar,
} from './fixtures-actas.js';

let e: Escenario;
const casos = gestionarActas();

beforeEach(async () => {
  e = await sembrar();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-049 — lectura', () => {
  it('el Coordinador lista solo las actas de su carrera', async () => {
    const lista = await casos.listar(e.coordA);

    expect(lista.map((a) => a.codigo)).toEqual(['ACTA-A']);
  });

  it('el Coordinador sin carrera lista vacío y no abre ni la de ninguna carrera', async () => {
    expect(await casos.listar(e.coordSinCarrera)).toEqual([]);
    await expect(casos.porId(e.coordSinCarrera, e.actaA)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Consultor lista todas', async () => {
    const lista = await casos.listar(e.consultor);

    expect(lista.map((a) => a.codigo).sort()).toEqual(['ACTA-A', 'ACTA-B']);
  });

  it('el Director lista solo la de su carrera', async () => {
    expect((await casos.listar(e.directorA)).map((a) => a.codigo)).toEqual(['ACTA-A']);
  });

  it('la URL directa a un acta de otra carrera es 404, no 403 (porId y contenido)', async () => {
    await expect(casos.porId(e.coordA, e.actaB)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(casos.obtenerContenido(e.coordA, e.actaB)).rejects.toBeInstanceOf(NoEncontrado);
    expect((await casos.porId(e.coordA, e.actaA)).codigo).toBe('ACTA-A');
  });

  it('el Consultor abre el acta de cualquier carrera', async () => {
    expect((await casos.porId(e.consultor, e.actaB)).codigo).toBe('ACTA-B');
  });
});

describe('RF-CH-049 — escrituras: 404 antes que 403', () => {
  it('el Coordinador de otra carrera, con permiso de escritura, recibe 404 en todas', async () => {
    const intentos = [
      () =>
        casos.editarCabecera(e.coordA, e.actaB, {
          titulo: 't',
          objetivo: 'o',
          convocadaPor: 'c',
          fechaReunion: new Date('2026-05-01'),
          lugarReunion: 'l',
          comentario: null,
          lugarEmision: null,
          fechaEmision: null,
        }),
      () => casos.reemplazarAsistentes(e.coordA, e.actaB, ['Ana']),
      () => casos.cargarAccionesDelPeriodo(e.coordA, e.actaB),
      () => casos.actualizarSeleccionDeAcciones(e.coordA, e.actaB, []),
      () => casos.editarTextosInstitucionales(e.coordA, e.actaB, { textoIntroduccion: 'x' }),
      () => casos.transicionar(e.coordA, e.actaB, 'enviar-a-revision', {}),
      () => casos.eliminar(e.coordA, e.actaB),
    ];

    for (const intento of intentos) {
      const fallo = await intento().catch((x: unknown) => x);
      expect(fallo).toBeInstanceOf(NoEncontrado);
      expect(fallo).not.toBeInstanceOf(AccesoDenegado);
    }
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaB } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('el Consultor lee el acta pero no puede escribirla: 403 sobre un acta que sí ve', async () => {
    await expect(casos.eliminar(e.consultor, e.actaB)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(
      casos.editarTextosInstitucionales(e.consultor, e.actaA, { textoIntroduccion: 'x' }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('RF-CH-048 — el alta usa la carrera de la sesión', () => {
  it('el acta nace en la carrera del Coordinador', async () => {
    const creada = await casos.crear(e.coordA, { periodoAcademico: '2026-2' });

    expect(creada.carreraId).toBe(e.carreraA);
    expect(creada.estado).toBe('Borrador');
  });

  it('un Coordinador sin carrera no crea: 403 con el motivo', async () => {
    await expect(casos.crear(e.coordSinCarrera, { periodoAcademico: '2026-2' })).rejects.toThrow(
      'No tienes una carrera asignada: pide que te asignen una para crear actas de aprobación.',
    );
    expect(bitacora).toEqual([]);
  });
});

describe('I1 — un plan de otra carrera vinculado al acta no se muestra', () => {
  it('el contenido en vivo omite la fila del plan ajeno y conserva la propia', async () => {
    const propio = await planDeMejora(e.carreraA, 'PJ-A');
    const ajeno = await planDeMejora(e.carreraB, 'PJ-B');
    for (const [orden, p] of [propio, ajeno].entries()) {
      await prisma.accionActa.create({
        data: { actaId: e.actaA, planMejoraId: p.id, aspecto: 'CRITERIO_ACREDITACION', orden },
      });
    }

    const contenido = await casos.obtenerContenido(e.coordA, e.actaA);

    expect(contenido.acciones.map((a) => a.plan.codigo)).toEqual(['PJ-A']);
  });
});
