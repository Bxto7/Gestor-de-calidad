/**
 * El historial propio del acta (RF-AC-022, RF-CH-049) con los roles reales: el
 * Coordinador de otra carrera recibe 404 aunque tenga `auditoria.leer_entidad`, y el
 * Consultor —`actas.leer` sin permiso de auditoría— recibe 403: quién ve el
 * historial no cambia, solo se acota qué actas. La bitácora es append-only, así que
 * esta prueba no la vacía: cada acta nueva trae un UUID propio.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AccesoDenegado, NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import { ConsultarBitacora } from '../../src/modules/auditoria/application/use-cases/consultar-bitacora.use-case.js';
import { BitacoraRepositoryPrisma } from '../../src/modules/auditoria/infrastructure/persistence/bitacora.repository.js';
import { ConsultarHistorialDelActa } from '../../src/modules/mejora-continua/actas/application/use-cases/consultar-historial-del-acta.use-case.js';
import { HistorialDelActaAdapter } from '../../src/modules/mejora-continua/actas/infrastructure/historial-del-acta.adapter.js';
import { type Escenario, adaptador, prisma, repoActas, sembrar } from './fixtures-actas.js';

const historial = new ConsultarHistorialDelActa(
  repoActas,
  new HistorialDelActaAdapter(
    new ConsultarBitacora(new BitacoraRepositoryPrisma(prisma), adaptador),
  ),
  adaptador,
  adaptador,
);

let e: Escenario;

beforeEach(async () => {
  e = await sembrar();
  await prisma.eventoAuditoria.create({
    data: {
      entidad: 'ActaAprobacion',
      entidadId: e.actaA,
      accion: 'actas.creada',
      detalle: 'Acta de aprobación ACTA-A creada.',
      usuarioId: e.coordA.id,
      usuarioNombre: 'Coordinadora A',
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-AC-022 — historial propio', () => {
  it('el Coordinador de la carrera ve los movimientos de su acta', async () => {
    const movimientos = await historial.ejecutar(e.coordA, e.actaA);

    expect(movimientos.map((m) => m.detalle)).toEqual(['Acta de aprobación ACTA-A creada.']);
    expect(movimientos[0]?.usuarioNombre).toBe('Coordinadora A');
  });

  it('el Director de la carrera también (auditoria.leer)', async () => {
    expect(await historial.ejecutar(e.directorA, e.actaA)).toHaveLength(1);
  });

  it('el Coordinador de otra carrera recibe 404, aunque tenga auditoria.leer_entidad', async () => {
    const fallo = await historial.ejecutar(e.coordB, e.actaA).catch((x: unknown) => x);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
  });

  it('un Coordinador sin carrera recibe 404', async () => {
    await expect(historial.ejecutar(e.coordSinCarrera, e.actaA)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el Consultor lee el acta pero no tiene permiso de auditoría: 403, no 200', async () => {
    await expect(historial.ejecutar(e.consultor, e.actaA)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('un acta que no existe es 404', async () => {
    await expect(
      historial.ejecutar(e.coordA, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });
});
