/** @vitest-environment jsdom */

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/plan-estudios.api';
import type { Asignatura, Carrera, PlanEstudios } from '../domain/tipos';
import { montarPagina } from '../pruebas/montar-pagina';
import { MallaCurricularPage } from './MallaCurricularPage';

const PLAN: PlanEstudios = {
  id: 'p1',
  carreraId: 'c1',
  codigo: 'PE-ISI-2026-v1',
  version: 1,
  estado: 'Borrador',
  duracionAnios: 2,
  fechaVigencia: null,
  objetivoIds: ['oe-1'],
  competenciaIds: ['cp-1'],
  derivadoDe: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
};

const CARRERA: Carrera = {
  id: 'c1',
  facultadId: 'f1',
  nombre: 'Ingeniería de Sistemas',
  codigo: 'ISI',
  duracionAnios: 2,
  estado: 'Activo',
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function asignatura(sobre: Partial<Asignatura> = {}): Asignatura {
  return {
    id: 'a1',
    planId: 'p1',
    codigo: 'ISI-101',
    nombre: 'Álgebra Lineal',
    descripcion: 'Sumilla.',
    tipo: 'General',
    condicion: 'Obligatoria',
    creditos: 4,
    competenciaIds: ['cp-1'],
    cicloNumero: 1,
    orden: 0,
    grupoElectivo: null,
    estado: 'Activo',
    ...sobre,
  };
}

function montar(asignaturas: Asignatura[]) {
  vi.spyOn(api, 'obtenerPlan').mockResolvedValue(PLAN);
  vi.spyOn(api, 'listarCarreras').mockResolvedValue([CARRERA]);
  vi.spyOn(api, 'listarAsignaturas').mockResolvedValue(asignaturas);
  return montarPagina(<MallaCurricularPage />, {
    permisos: ['plan.leer', 'asignatura.leer', 'malla.editar'],
    ruta: '/plan-estudios/planes/p1/malla',
    patron: '/plan-estudios/planes/:planId/malla',
  });
}

afterEach(() => vi.restoreAllMocks());

describe('MallaCurricularPage — electivas sin ciclo (RF-CH-022)', () => {
  it('una electiva sin ciclo no dispara la alerta bloqueante', async () => {
    montar([asignatura({ condicion: 'Electiva', cicloNumero: null })]);

    expect(await screen.findByRole('heading', { name: 'Malla Curricular' })).toBeInTheDocument();
    expect(screen.queryByText(/obligatoria\(s\) sin ciclo asignado/)).not.toBeInTheDocument();
  });

  it('una obligatoria sin ciclo sigue disparándola', async () => {
    montar([
      asignatura({ cicloNumero: null }),
      asignatura({ id: 'a2', codigo: 'ISI-190', condicion: 'Electiva', cicloNumero: null }),
    ]);

    expect(
      await screen.findByText('1 asignatura(s) obligatoria(s) sin ciclo asignado.'),
    ).toBeInTheDocument();
  });
});
