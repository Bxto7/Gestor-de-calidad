/** @vitest-environment jsdom */

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeConexion, ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/medicion.api';
import { PlanMedicionPage } from './PlanMedicionPage';

function montar(fallo: Error) {
  vi.spyOn(api, 'obtenerPlan').mockRejectedValue(fallo);
  montarPagina(<PlanMedicionPage />, {
    permisos: ['medicion.leer'],
    ruta: '/mejora-continua/medicion/pm-1',
    patron: '/mejora-continua/medicion/:id',
  });
}

afterEach(() => vi.restoreAllMocks());

describe('PlanMedicionPage — cuando el plan no se carga (RF-CH-034)', () => {
  it('un 404 dice «no encontrado»', async () => {
    montar(new ErrorDeNegocio('No existe', 404));

    expect(await screen.findByText('Plan de medición no encontrado')).toBeInTheDocument();
  });

  it('un 500 no se disfraza de «no encontrado»: mensaje genérico y «Reintentar»', async () => {
    montar(new ErrorDeConexion('Falló'));

    expect(await screen.findByText('No se pudo cargar el plan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Plan de medición no encontrado')).not.toBeInTheDocument();
  });
});
