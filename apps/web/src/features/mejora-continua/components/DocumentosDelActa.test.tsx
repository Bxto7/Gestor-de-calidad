/** @vitest-environment jsdom */

/**
 * RF-AC-018/019 en pantalla — gemela de `DocumentosDelPlanMejora.test.tsx`.
 *
 * Los cuatro estados de un trabajo se distinguen, solo lo «Listo» se descarga,
 * un fallido enseña su motivo y los cambios de estado se anuncian.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TipoDocumentoActa, TrabajoDocumento } from '../domain/tipos';
import { DocumentosDelActa, type DocumentosDelActaProps } from './DocumentosDelActa';

type Trabajo = TrabajoDocumento<TipoDocumentoActa>;

const LISTO: Trabajo = {
  id: 't-1',
  tipo: 'ACTA_PDF',
  estado: 'Listo',
  nombreArchivo: 'ACTA_001.pdf',
  bytes: 4096,
  error: null,
  solicitadoEn: '2026-09-24T10:00:00.000Z',
};
const EN_COLA: Trabajo = { ...LISTO, id: 't-2', estado: 'En cola', nombreArchivo: null };
const GENERANDO: Trabajo = { ...LISTO, id: 't-4', estado: 'Generando', nombreArchivo: null };
const FALLIDO: Trabajo = {
  ...LISTO,
  id: 't-3',
  tipo: 'ACTA_EXCEL',
  estado: 'Fallido',
  nombreArchivo: null,
  error: 'No se pudo generar el acta en Excel: sin espacio.',
};

function montar(sobre: Partial<DocumentosDelActaProps> = {}) {
  const onGenerar = vi.fn();
  const onDescargar = vi.fn();
  render(
    <DocumentosDelActa
      documentos={[]}
      generando={false}
      onGenerar={onGenerar}
      onDescargar={onDescargar}
      {...sobre}
    />,
  );
  return { onGenerar, onDescargar };
}

describe('DocumentosDelActa', () => {
  it('ofrece Exportar PDF y Exportar Excel y avisa del tipo pulsado', async () => {
    const { onGenerar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    expect(onGenerar).toHaveBeenNthCalledWith(1, 'ACTA_PDF');
    expect(onGenerar).toHaveBeenNthCalledWith(2, 'ACTA_EXCEL');
  });

  it('sin onGenerar no pinta los botones de exportar', () => {
    montar({ onGenerar: undefined });
    expect(screen.queryByRole('button', { name: /exportar/i })).not.toBeInTheDocument();
  });

  it('con una petición en vuelo los botones no aceptan otro clic', () => {
    montar({ generando: true });
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeDisabled();
  });

  it('distingue En cola, Generando, Listo y Fallido, y solo Listo se descarga', async () => {
    const { onDescargar } = montar({ documentos: [EN_COLA, GENERANDO, LISTO, FALLIDO] });

    expect(screen.getByText('En cola')).toBeVisible();
    expect(screen.getByText('Generando')).toBeVisible();
    expect(screen.getByText('Listo')).toBeVisible();
    expect(screen.getByText('Fallido')).toBeVisible();
    expect(screen.getByText(/sin espacio/i)).toBeVisible();

    const descargas = screen.getAllByRole('button', { name: /descargar/i });
    expect(descargas).toHaveLength(1);
    await userEvent.click(descargas[0]!);
    expect(onDescargar).toHaveBeenCalledWith('t-1');
  });

  it('anuncia el estado de la generación en una región viva', () => {
    montar({ documentos: [GENERANDO] });
    expect(screen.getByRole('status')).toHaveTextContent(/generando/i);
  });

  it('sin documentos muestra el estado vacío', () => {
    montar();
    expect(screen.getByText(/todavía no se ha exportado/i)).toBeVisible();
  });
});
