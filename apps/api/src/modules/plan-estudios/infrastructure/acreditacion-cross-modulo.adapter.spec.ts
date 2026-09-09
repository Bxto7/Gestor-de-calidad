/**
 * Pruebas del `AcreditacionAdapter` (2c-J-B, §4 del diseño): traduce forma
 * sobre `RepositorioCriterioPort`/`RepositorioObjetivoPort`, con dobles.
 */

import { describe, expect, it } from 'vitest';

import type { DatosCriterio, RepositorioCriterioPort } from '../application/ports/acreditacion.port.js';
import type { DatosObjetivo, RepositorioObjetivoPort } from '../application/ports/catalogo.port.js';
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

function objetivo(sobre: Partial<DatosObjetivo> = {}): DatosObjetivo {
  return {
    id: 'obj-1',
    codigo: 'OE-01',
    nombre: 'Formar profesionales íntegros',
    descripcion: 'Descripción del objetivo',
    activo: true,
    planesVinculados: 0,
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

function repoObjetivo(sobre: Partial<RepositorioObjetivoPort> = {}): RepositorioObjetivoPort {
  return {
    listar: async () => [objetivo()],
    porId: async () => objetivo(),
    codigos: async () => [],
    crear: async () => objetivo(),
    actualizar: async () => objetivo(),
    cambiarEstado: async () => objetivo(),
    eliminar: async () => undefined,
    existeNombre: async () => false,
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
      repoObjetivo(),
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
    const adapter = new AcreditacionAdapter(repoCriterio(), repoObjetivo());

    const resultado = await adapter.criterioPorId('cri-1');

    expect(resultado).toEqual({
      id: 'cri-1',
      carreraId: 'carrera-1',
      codigo: 'C-01',
      nombre: 'Estudiantes',
    });
  });

  it('null cuando no existe', async () => {
    const adapter = new AcreditacionAdapter(repoCriterio({ porId: async () => null }), repoObjetivo());

    expect(await adapter.criterioPorId('inexistente')).toBeNull();
  });
});

describe('objetivosEducacionales', () => {
  it('RF-PJ-023 RN1: sin filtro de estado', async () => {
    let filtroVisto: unknown = 'no-llamado';
    const adapter = new AcreditacionAdapter(
      repoCriterio(),
      repoObjetivo({
        listar: async (filtro) => {
          filtroVisto = filtro;
          return [objetivo()];
        },
      }),
    );

    const resultado = await adapter.objetivosEducacionales();

    expect(filtroVisto).toBeUndefined();
    expect(resultado).toEqual([{ id: 'obj-1', codigo: 'OE-01', nombre: 'Formar profesionales íntegros' }]);
  });
});

describe('objetivoPorId', () => {
  it('traduce la forma', async () => {
    const adapter = new AcreditacionAdapter(repoCriterio(), repoObjetivo());

    expect(await adapter.objetivoPorId('obj-1')).toEqual({
      id: 'obj-1',
      codigo: 'OE-01',
      nombre: 'Formar profesionales íntegros',
    });
  });

  it('null cuando no existe', async () => {
    const adapter = new AcreditacionAdapter(repoCriterio(), repoObjetivo({ porId: async () => null }));

    expect(await adapter.objetivoPorId('inexistente')).toBeNull();
  });
});
