/**
 * `PlanParaObjetivosAdapter`: traduce `PlanDeEstudios` a lo poco que
 * `objetivos-educacionales` necesita saber de un plan (RF-CH-015, RF-CH-016).
 */

import { describe, expect, it } from 'vitest';

import { PlanDeEstudios } from '../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../domain/value-objects/estado-plan.js';
import type { RepositorioPlanPort } from '../application/ports/repositorios.port.js';
import { PlanParaObjetivosAdapter } from './plan-para-objetivos.adapter.js';

function repo(estado: EstadoPlan | null): RepositorioPlanPort {
  return {
    porId: async () =>
      estado === null
        ? null
        : PlanDeEstudios.desde({
            id: 'plan-1',
            carreraId: 'car-isi',
            codigo: 'PE-ISI-2026-v2',
            version: 2,
            estado,
            duracionAnios: 5,
            fechaVigencia: null,
            derivadoDeId: null,
          }),
  } as unknown as RepositorioPlanPort;
}

describe('PlanParaObjetivosAdapter', () => {
  it('un Borrador es editable y trae su carrera y su código', async () => {
    expect(await new PlanParaObjetivosAdapter(repo('Borrador')).planPorId('plan-1')).toEqual({
      id: 'plan-1',
      codigo: 'PE-ISI-2026-v2',
      carreraId: 'car-isi',
      estado: 'Borrador',
      editable: true,
    });
  });

  it('En revisión también es editable; Vigente no', async () => {
    expect(
      (await new PlanParaObjetivosAdapter(repo('En revisión')).planPorId('plan-1'))?.editable,
    ).toBe(true);
    expect(
      (await new PlanParaObjetivosAdapter(repo('Vigente')).planPorId('plan-1'))?.editable,
    ).toBe(false);
  });

  it('un plan inexistente da null', async () => {
    expect(await new PlanParaObjetivosAdapter(repo(null)).planPorId('x')).toBeNull();
  });
});
