/**
 * `PlanParaAcreditacionAdapter`: traduce `PlanDeEstudios` a lo poco que
 * `acreditacion` necesita saber de un plan (RF122, Bloque 5): su id y su carrera.
 */

import { describe, expect, it } from 'vitest';

import type { RepositorioPlanPort } from '../application/ports/repositorios.port.js';
import { PlanDeEstudios } from '../domain/entities/plan-de-estudios.js';
import { PlanParaAcreditacionAdapter } from './plan-para-acreditacion.adapter.js';

function repo(existe: boolean): RepositorioPlanPort {
  return {
    porId: async () =>
      existe
        ? PlanDeEstudios.desde({
            id: 'plan-1',
            carreraId: 'car-isi',
            codigo: 'PE-ISI-2026-v2',
            version: 2,
            estado: 'Vigente',
            duracionAnios: 5,
            fechaVigencia: null,
            derivadoDeId: null,
          })
        : null,
  } as unknown as RepositorioPlanPort;
}

describe('PlanParaAcreditacionAdapter', () => {
  it('trae el id y la carrera del plan, sin importar su estado', async () => {
    expect(await new PlanParaAcreditacionAdapter(repo(true)).planPorId('plan-1')).toEqual({
      id: 'plan-1',
      carreraId: 'car-isi',
    });
  });

  it('un plan inexistente da null', async () => {
    expect(await new PlanParaAcreditacionAdapter(repo(false)).planPorId('x')).toBeNull();
  });
});
