/** @vitest-environment jsdom */

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeConexion, ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/evaluacion.api';
import { PlanEvaluacionPage } from './PlanEvaluacionPage';

function montar(fallo: Error) {
  vi.spyOn(api, 'obtenerEvaluacion').mockRejectedValue(fallo);
  montarPagina(<PlanEvaluacionPage />, {
    permisos: ['evaluacion.leer'],
    ruta: '/mejora-continua/evaluacion/ev-1',
    patron: '/mejora-continua/evaluacion/:id',
  });
}

afterEach(() => vi.restoreAllMocks());

describe('PlanEvaluacionPage — cuando el plan no se carga (RF-CH-038)', () => {
  it('un 404 dice «no encontrado»', async () => {
    montar(new ErrorDeNegocio('No existe', 404));

    expect(await screen.findByText('Plan de evaluación no encontrado')).toBeInTheDocument();
  });

  it('un 500 no se disfraza de «no encontrado»: mensaje genérico y «Reintentar»', async () => {
    montar(new ErrorDeConexion('Falló'));

    expect(await screen.findByText('No se pudo cargar el plan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Plan de evaluación no encontrado')).not.toBeInTheDocument();
  });
});
