import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../auth/application/ports/authorization.port.js';
import { carreraDeLaSesion, carreraImpuesta, exigirPlanLegible } from './alcance-de-planes.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora' };

function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
  };
}

const TODAS: AlcanceDeLecturaPort = {
  alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
  puedeLeerCarrera: async () => true,
};

function conCarrera(carreraId: string | null): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => carreraId,
    rolesDe: async () => [],
  };
}

describe('carreraImpuesta', () => {
  it('sin restricción no impone ninguna', async () => {
    expect(await carreraImpuesta(TODAS, ACTOR)).toBeUndefined();
  });

  it('quien lee solo su carrera la recibe', async () => {
    expect(await carreraImpuesta(soloCarrera('car-1'), ACTOR)).toBe('car-1');
  });

  it('quien lee solo su carrera y no tiene ninguna recibe null, no «todas»', async () => {
    expect(await carreraImpuesta(soloCarrera(null), ACTOR)).toBeNull();
  });
});

describe('exigirPlanLegible', () => {
  it('devuelve el plan legible', async () => {
    const plan = { carreraId: 'car-1' };
    expect(await exigirPlanLegible(soloCarrera('car-1'), ACTOR, plan, 'el plan', 'p-1')).toBe(plan);
  });

  it('el de otra carrera es NoEncontrado, igual que uno que no existe', async () => {
    await expect(
      exigirPlanLegible(soloCarrera('car-1'), ACTOR, { carreraId: 'car-2' }, 'el plan', 'p-1'),
    ).rejects.toBeInstanceOf(NoEncontrado);
    await expect(exigirPlanLegible(TODAS, ACTOR, null, 'el plan', 'p-1')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });
});

describe('carreraDeLaSesion', () => {
  it('devuelve la carrera a cargo', async () => {
    expect(await carreraDeLaSesion(conCarrera('car-1'), ACTOR, 'planes de medición')).toBe('car-1');
  });

  it('sin carrera asignada: AccesoDenegado, y el mensaje lo dice', async () => {
    await expect(carreraDeLaSesion(conCarrera(null), ACTOR, 'planes de medición')).rejects.toThrow(
      new AccesoDenegado(
        'No tienes una carrera asignada: pide que te asignen una para crear planes de medición.',
      ),
    );
  });
});
