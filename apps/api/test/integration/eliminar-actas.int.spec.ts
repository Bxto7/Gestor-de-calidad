/**
 * Eliminar actas (RF-CH-050) contra la base real: el estado, la cascada, que un
 * borrado rechazado no toca nada, el doble borrado y las carreras de concurrencia.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import {
  type Escenario,
  bitacora,
  gestionarActas,
  planDeMejora,
  prisma,
  repoActas,
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

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADA' | 'EMITIDA';

async function enEstado(id: string, estado: Estado): Promise<void> {
  await prisma.actaAprobacion.update({ where: { id }, data: { estado } });
}

describe('RF-CH-050 — eliminar un acta', () => {
  it.each(['BORRADOR', 'EN_REVISION'] as const)(
    'en %s se borra con sus asistentes y acciones, y queda en la bitácora',
    async (estado) => {
      await enEstado(e.actaA, estado);
      await repoActas.reemplazarAsistentes(e.actaA, ['Ana Pérez']);
      const plan = await planDeMejora(e.carreraA, 'PJ-A');
      await prisma.accionActa.create({
        data: {
          actaId: e.actaA,
          planMejoraId: plan.id,
          aspecto: 'CRITERIO_ACREDITACION',
          orden: 0,
        },
      });

      await casos.eliminar(e.coordA, e.actaA);

      expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(0);
      expect(await prisma.asistenteActa.count({ where: { actaId: e.actaA } })).toBe(0);
      expect(await prisma.accionActa.count({ where: { actaId: e.actaA } })).toBe(0);
      // El plan de mejora queda libre para otra acta: no se borra con ella.
      expect(await prisma.planMejora.count({ where: { id: plan.id } })).toBe(1);
      expect(bitacora).toEqual(['Acta de aprobación ACTA-A eliminada.']);
    },
  );

  it.each(['APROBADA', 'EMITIDA'] as const)(
    '%s: 409 con el texto completo y el acta queda',
    async (estado) => {
      await enEstado(e.actaA, estado);
      await repoActas.reemplazarAsistentes(e.actaA, ['Ana Pérez']);
      const nombre = estado === 'APROBADA' ? 'Aprobada' : 'Emitida';

      await expect(casos.eliminar(e.coordA, e.actaA)).rejects.toThrow(
        new ReglaDeNegocioViolada(
          `No se puede eliminar el acta ACTA-A: está ${nombre}. Solo se eliminan actas en Borrador o En revisión.`,
        ),
      );
      expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(1);
      expect(await prisma.asistenteActa.count({ where: { actaId: e.actaA } })).toBe(1);
      expect(bitacora).toEqual([]);
    },
  );

  it('el repositorio: eliminado, y la segunda vez no-existe, sin lanzar', async () => {
    expect(await repoActas.eliminar(e.actaA)).toEqual({ tipo: 'eliminado' });
    expect(await repoActas.eliminar(e.actaA)).toEqual({ tipo: 'no-existe' });
  });

  it('el estado se vuelve a comprobar con la fila bloqueada: un acta Aprobada no se borra', async () => {
    await enEstado(e.actaA, 'APROBADA');

    expect(await repoActas.eliminar(e.actaA)).toEqual({
      tipo: 'estado-no-permite',
      estado: 'Aprobada',
    });
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(1);
  });

  it('un acta que ya no existe es NoEncontrado y no deja evento', async () => {
    await expect(casos.eliminar(e.coordA, randomUUID())).rejects.toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual([]);
  });

  it('el Director elimina un acta de su carrera; la de otra es 404 y queda', async () => {
    await casos.eliminar(e.directorA, e.actaA);
    await expect(casos.eliminar(e.directorA, e.actaB)).rejects.toBeInstanceOf(NoEncontrado);

    expect(await prisma.actaAprobacion.count({ where: { id: e.actaB } })).toBe(1);
  });

  it('concurrencia: un acta aprobada por otra transacción justo antes del borrado no se borra', async () => {
    await enEstado(e.actaA, 'EN_REVISION');
    let confirmar!: () => void;
    const puedeConfirmar = new Promise<void>((r) => (confirmar = r));
    let aprobada!: () => void;
    const yaAprobada = new Promise<void>((r) => (aprobada = r));

    const abierta = prisma.$transaction(async (tx) => {
      await tx.actaAprobacion.update({ where: { id: e.actaA }, data: { estado: 'APROBADA' } });
      aprobada();
      await puedeConfirmar;
    });
    await yaAprobada;

    let terminado = false;
    const borrado = repoActas.eliminar(e.actaA).finally(() => (terminado = true));
    await new Promise((r) => setTimeout(r, 400));
    // Con FOR UPDATE el borrado espera a la transacción; sin él ya habría terminado.
    expect(terminado).toBe(false);

    confirmar();
    await abierta;

    expect(await borrado).toEqual({ tipo: 'estado-no-permite', estado: 'Aprobada' });
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(1);
  });

  it('concurrencia: dos borrados a la vez del mismo acta: uno elimina y el otro no-existe', async () => {
    const resultados = await Promise.all([
      repoActas.eliminar(e.actaA),
      repoActas.eliminar(e.actaA),
    ]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['eliminado', 'no-existe']);
    expect(await prisma.actaAprobacion.count({ where: { id: e.actaA } })).toBe(0);
  });

  it('dos borrados a la vez por el caso de uso: uno elimina, el otro es 404, y queda UN solo evento', async () => {
    const r = await Promise.allSettled([
      casos.eliminar(e.coordA, e.actaA),
      casos.eliminar(e.coordA, e.actaA),
    ]);

    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazado = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rechazado.reason).toBeInstanceOf(NoEncontrado);
    expect(bitacora).toEqual(['Acta de aprobación ACTA-A eliminada.']);
  });
});
