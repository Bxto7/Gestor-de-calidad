import { describe, expect, it } from 'vitest';

import { NoEncontrado } from '../../../../../shared-kernel/errors/errores.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../../../evaluacion/application/ports/configuracion-evaluacion.port.js';
import type { RepositorioPlanEvaluacionPort } from '../../../evaluacion/application/ports/plan-evaluacion.port.js';
import type { RepositorioPlanMedicionPort } from '../../../medicion/application/ports/plan-medicion.port.js';
import { calcularPorcentajeMedicionAnterior } from './porcentaje-periodo-anterior.js';

const noUsado = (metodo: string) => async () => {
  throw new Error(`${metodo} no se usa en este spec.`);
};

function evaluaciones(planMedicionId = 'medicion-1'): RepositorioPlanEvaluacionPort {
  return {
    listar: async () => [],
    porId: async () => ({ id: 'eval-1', planMedicionId }) as never,
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    cambiarEstado: noUsado('cambiarEstado'),
    eliminar: noUsado('eliminar'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
  };
}

function mediciones(periodos: { id: string; orden: number }[]): RepositorioPlanMedicionPort {
  return {
    listar: noUsado('listar'),
    porId: async () =>
      ({ periodos: periodos.map((p) => ({ ...p, etiqueta: p.id, fechaCierre: null })) }) as never,
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    actualizar: noUsado('actualizar'),
    cambiarEstado: noUsado('cambiarEstado'),
    contenidoDe: noUsado('contenidoDe'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    marcarVigenteRelevando: noUsado('marcarVigenteRelevando'),
    eliminar: noUsado('eliminar'),
    declararCompetencias: noUsado('declararCompetencias'),
    declararPeriodos: noUsado('declararPeriodos'),
    matriz: noUsado('matriz'),
    programar: noUsado('programar'),
    marcarRealizada: noUsado('marcarRealizada'),
  };
}

function configuraciones(
  medicionesGuardadas: { competenciaId: string; periodoId: string; porcentajeAlcanzado: number | null }[],
): RepositorioConfiguracionEvaluacionPort {
  return {
    del: async () => ({
      competencias: [],
      mediciones: medicionesGuardadas.map((m) => ({ ...m, asignaturas: [] })),
      indicaciones: [],
    }),
    guardarCompetencia: noUsado('guardarCompetencia'),
    reemplazarAsignaturas: noUsado('reemplazarAsignaturas'),
    guardarPorcentaje: noUsado('guardarPorcentaje'),
    reemplazarEvidencias: noUsado('reemplazarEvidencias'),
    planDeAsignaturaEvaluada: noUsado('planDeAsignaturaEvaluada'),
    reemplazarIndicaciones: noUsado('reemplazarIndicaciones'),
    guardarResultados: noUsado('guardarResultados'),
    planDeIndicacion: noUsado('planDeIndicacion'),
  };
}

describe('calcularPorcentajeMedicionAnterior', () => {
  it('devuelve el porcentaje del periodo inmediatamente anterior', async () => {
    const resultado = await calcularPorcentajeMedicionAnterior(
      {
        evaluaciones: evaluaciones(),
        mediciones: mediciones([
          { id: 'p1', orden: 1 },
          { id: 'p2', orden: 2 },
        ]),
        configuraciones: configuraciones([{ competenciaId: 'c-1', periodoId: 'p1', porcentajeAlcanzado: 70 }]),
      },
      'eval-1',
      'c-1',
      'p2',
    );

    expect(resultado).toBe(70);
  });

  it('devuelve null si el periodo es el primero (RF-PJ-028 RN3)', async () => {
    const resultado = await calcularPorcentajeMedicionAnterior(
      {
        evaluaciones: evaluaciones(),
        mediciones: mediciones([{ id: 'p1', orden: 1 }]),
        configuraciones: configuraciones([]),
      },
      'eval-1',
      'c-1',
      'p1',
    );

    expect(resultado).toBeNull();
  });

  it('lanza NoEncontrado si el plan de evaluación no existe', async () => {
    await expect(
      calcularPorcentajeMedicionAnterior(
        {
          evaluaciones: { ...evaluaciones(), porId: async () => null },
          mediciones: mediciones([]),
          configuraciones: configuraciones([]),
        },
        'eval-x',
        'c-1',
        'p1',
      ),
    ).rejects.toThrow(NoEncontrado);
  });
});
