/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/plan-estudios.api';
import { HistorialModal } from './HistorialModal';

/** Una entrada de 500 caracteres sin un solo espacio: el peor caso para el ajuste. */
const LARGO = 'x'.repeat(500);

function montar(titulo = 'ISI-101 · Álgebra Lineal') {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <HistorialModal
        abierto
        onCerrar={() => undefined}
        entidad="Asignatura"
        entidadId="a1"
        titulo={titulo}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('HistorialModal — textos largos (RF-CH-025)', () => {
  it('una entrada de 500 caracteres sin espacios hace salto de línea y no se trunca', async () => {
    vi.spyOn(api, 'listarAuditoria').mockResolvedValue([
      {
        id: 'e1',
        entidad: 'Asignatura',
        entidadId: 'a1',
        accion: 'asignatura.editada',
        detalle: LARGO,
        usuario: 'Ana Quispe',
        fecha: '2026-09-30T10:00:00.000Z',
      },
    ]);
    montar();

    const detalle = await screen.findByText(LARGO);
    expect(detalle).toHaveClass('wrap-break-word');
    // RN1: nada se esconde, ni recortado ni con puntos suspensivos.
    expect(detalle).not.toHaveClass('truncate');
    expect(detalle.className).not.toMatch(/line-clamp/);
    expect(detalle.textContent).toHaveLength(500);
  });

  it('el cuerpo del modal corta el desborde horizontal y conserva el vertical', async () => {
    vi.spyOn(api, 'listarAuditoria').mockResolvedValue([]);
    montar();

    await screen.findByText('No hay cambios registrados posteriores a la creación.');
    const cuerpo = screen.getByRole('dialog').querySelector('[data-cuerpo]');
    expect(cuerpo).toHaveClass('overflow-x-hidden', 'overflow-y-auto');
  });

  it('una descripción larga en el encabezado también hace salto de línea', async () => {
    vi.spyOn(api, 'listarAuditoria').mockResolvedValue([]);
    montar(LARGO);

    expect(await screen.findByText(LARGO)).toHaveClass('wrap-break-word');
  });
});
