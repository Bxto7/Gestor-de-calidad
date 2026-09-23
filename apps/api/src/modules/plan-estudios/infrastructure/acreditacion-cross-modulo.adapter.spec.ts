/**
 * Pruebas del `AcreditacionAdapter` (2c-J-B, §4 del diseño): traduce forma
 * sobre `RepositorioCriterioPort`, con dobles.
 */

import { describe, expect, it } from 'vitest';

import type {
  DatosCriterio,
  RepositorioCriterioPort,
} from '../application/ports/acreditacion.port.js';
import { AcreditacionAdapter } from './acreditacion-cross-modulo.adapter.js';

function criterio(sobre: Partial<DatosCriterio> = {}): DatosCriterio {
  return {
    id: 'cri-1',
    carreraId: 'carrera-1',
    codigo: 'C-01',
    nombre: 'Estudiantes',
    activo: true,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function repoCriterio(sobre: Partial<RepositorioCriterioPort> = {}): RepositorioCriterioPort {
  return {
    listar: async () => [criterio()],
    porId: async () => criterio(),
    codigoExiste: async () => false,
    crear: async () => criterio(),
    actualizar: async () => criterio(),
    cambiarEstado: async () => criterio(),
    impactoDeInactivar: async () => ({ planesMejoraVinculados: 0 }),
    ...sobre,
  };
}

describe('criteriosActivosDe', () => {
  it('RF-PJ-020 RN1: filtra por activo=true', async () => {
    let filtroVisto: unknown;
    const adapter = new AcreditacionAdapter(
      repoCriterio({
        listar: async (_carreraId, filtro) => {
          filtroVisto = filtro;
          return [criterio()];
        },
      }),
    );

    const resultado = await adapter.criteriosActivosDe('carrera-1');

    expect(filtroVisto).toEqual({ activo: true });
    expect(resultado).toEqual([
      { id: 'cri-1', carreraId: 'carrera-1', codigo: 'C-01', nombre: 'Estudiantes' },
    ]);
  });
});

describe('criterioPorId', () => {
  it('traduce la forma, sin el campo activo', async () => {
    const adapter = new AcreditacionAdapter(repoCriterio());

    const resultado = await adapter.criterioPorId('cri-1');

    expect(resultado).toEqual({
      id: 'cri-1',
      carreraId: 'carrera-1',
      codigo: 'C-01',
      nombre: 'Estudiantes',
    });
  });

  it('null cuando no existe', async () => {
    const adapter = new AcreditacionAdapter(repoCriterio({ porId: async () => null }));

    expect(await adapter.criterioPorId('inexistente')).toBeNull();
  });
});
