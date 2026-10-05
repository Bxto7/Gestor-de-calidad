import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { DatosActa, RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';
import type { HistorialDelActaPort, MovimientoDelActa } from '../ports/historial-del-acta.port.js';
import { ConsultarHistorialDelActa } from './consultar-historial-del-acta.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora' };
const CARRERA = 'carrera-1';

const movimiento: MovimientoDelActa = {
  id: 'ev-1',
  accion: 'actas.creada',
  detalle: 'Acta de aprobación ACTA-A creada.',
  usuarioId: 'u-1',
  usuarioNombre: 'Coordinadora',
  fecha: new Date('2026-09-19T14:00:00Z'),
};

function autorizacionSin(denegados: readonly string[], pedidos: string[] = []): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return denegados.includes(permiso)
        ? { permitido: false, motivo: 'Falta el permiso.' }
        : { permitido: true };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
    rolesDe: async () => [],
  };
}

const alcanceDeCarrera = (carreraId: string | null): AlcanceDeLecturaPort => ({
  alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
  puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
});

function montar(
  opciones: {
    acta?: Partial<DatosActa> | null;
    autorizacion?: AuthorizationPort;
    alcance?: AlcanceDeLecturaPort;
    historial?: HistorialDelActaPort['de'];
  } = {},
) {
  const actas = {
    porId: async () =>
      opciones.acta === null
        ? null
        : ({ id: 'acta-1', carreraId: CARRERA, ...opciones.acta } as DatosActa),
  } as unknown as RepositorioActaAprobacionPort;
  return new ConsultarHistorialDelActa(
    actas,
    { de: opciones.historial ?? (async () => [movimiento]) },
    opciones.autorizacion ?? autorizacionSin([]),
    opciones.alcance ?? alcanceDeCarrera(CARRERA),
  );
}

describe('RF-AC-022 — el historial propio del acta', () => {
  it('devuelve los movimientos de esa acta, con el tope de 50', async () => {
    let pedido: unknown[] = [];
    const caso = montar({
      historial: async (...args) => {
        pedido = args;
        return [movimiento];
      },
    });

    expect(await caso.ejecutar(ACTOR, 'acta-1')).toEqual([movimiento]);
    expect(pedido).toEqual([ACTOR, 'acta-1', 50]);
  });

  it('sin actas.leer es 403 y no mira el acta ni la bitácora', async () => {
    let pidioHistorial = false;
    const caso = montar({
      autorizacion: autorizacionSin(['actas.leer']),
      historial: async () => ((pidioHistorial = true), []),
    });

    await expect(caso.ejecutar(ACTOR, 'acta-1')).rejects.toBeInstanceOf(AccesoDenegado);
    expect(pidioHistorial).toBe(false);
  });

  it('un acta de otra carrera es 404 y no se pide la bitácora', async () => {
    let pidioHistorial = false;
    const caso = montar({
      acta: { carreraId: 'carrera-2' },
      historial: async () => ((pidioHistorial = true), []),
    });

    const fallo = await caso.ejecutar(ACTOR, 'acta-1').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(pidioHistorial).toBe(false);
  });

  it('un acta que no existe es 404', async () => {
    await expect(montar({ acta: null }).ejecutar(ACTOR, 'acta-x')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el permiso de auditoría lo comprueba la bitácora y su 403 se propaga: quién ve el historial no cambia', async () => {
    const caso = montar({
      historial: async () => {
        throw new AccesoDenegado('Falta el permiso.');
      },
    });

    await expect(caso.ejecutar(ACTOR, 'acta-1')).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
