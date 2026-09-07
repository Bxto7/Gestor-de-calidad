/** @vitest-environment jsdom */

/**
 * RF-PM-028 y RF-PM-029 en pantalla.
 *
 * Lo que se vigila es que los tres estados de un trabajo se distingan: uno en
 * curso, uno descargable y uno fallido con su motivo. Un fallo que se viera
 * igual que un éxito dejaría a alguien esperando un archivo que no va a llegar.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TrabajoDocumento } from '../domain/tipos';
import { DocumentosDelPlan } from './DocumentosDelPlan';

function trabajo(sobre: Partial<TrabajoDocumento> = {}): TrabajoDocumento {
  return {
    id: 't-1',
    tipo: 'PLAN_MEDICION_PDF',
    estado: 'Listo',
    nombreArchivo: 'PM-X-D-v1.pdf',
    bytes: 4096,
    error: null,
    solicitadoEn: '2026-09-04T10:00:00.000Z',
    ...sobre,
  };
}

function montar(trabajos: TrabajoDocumento[], generando = false) {
  const onGenerar = vi.fn();
  const onDescargar = vi.fn();
  render(
    <DocumentosDelPlan
      trabajos={trabajos}
      generando={generando}
      onGenerar={onGenerar}
      onDescargar={onDescargar}
    />,
  );
  return { onGenerar, onDescargar };
}

describe('los estados de un trabajo', () => {
  it('uno listo se puede descargar', () => {
    // Un botón y no un enlace: el token vive en `sessionStorage`, así que
    // navegar al endpoint llegaría sin autorización. Si esto vuelve a ser un
    // `<a href>`, la descarga da 401 y la prueba pasa igual — por eso se
    // afirma sobre la llamada, no sobre el marcado.
    const { onDescargar } = montar([trabajo()]);

    screen.getByRole('button', { name: /descargar/i }).click();

    expect(onDescargar).toHaveBeenCalledWith(expect.objectContaining({ id: 't-1' }));
  });

  it('uno en curso lo dice y no ofrece descarga', () => {
    montar([trabajo({ estado: 'Generando', nombreArchivo: null, bytes: null })]);

    expect(screen.getByText(/generando/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /descargar/i })).not.toBeInTheDocument();
  });

  it('uno fallido enseña su motivo', () => {
    // Sin el motivo, quien lo vea solo sabe que no funcionó, y volverá a
    // pulsar el botón esperando otro resultado.
    montar([trabajo({ estado: 'Fallido', error: 'El plan no tiene competencias.' })]);

    expect(screen.getByText('El plan no tiene competencias.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /descargar/i })).not.toBeInTheDocument();
  });

  it('el PDF y el Excel se distinguen entre sí', () => {
    // Dos filas que solo se diferencien por la extensión del archivo obligan a
    // leer el nombre entero para saber cuál es cuál.
    montar([
      trabajo({ id: 't-1', tipo: 'PLAN_MEDICION_PDF' }),
      trabajo({ id: 't-2', tipo: 'PLAN_MEDICION_EXCEL', nombreArchivo: 'PM-X-D-v1.xlsx' }),
    ]);

    const filas = screen.getAllByRole('listitem');
    expect(filas[0]).toHaveTextContent('PDF');
    expect(filas[1]).toHaveTextContent('Excel');
  });
});

describe('generar', () => {
  it('ofrece los dos formatos', () => {
    montar([]);

    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument();
  });

  it('cada botón pide su formato', () => {
    const { onGenerar } = montar([]);

    screen.getByRole('button', { name: /Excel/ }).click();

    expect(onGenerar).toHaveBeenCalledWith('PLAN_MEDICION_EXCEL');
  });

  it('mientras se pide, los botones no aceptan un segundo clic', () => {
    // Dos pulsaciones seguidas generarían el mismo documento dos veces.
    montar([], true);

    expect(screen.getByRole('button', { name: /PDF/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled();
  });

  it('sin documentos lo dice, en vez de dejar la zona en blanco', () => {
    montar([]);

    expect(screen.getByText(/todavía no se ha generado/i)).toBeInTheDocument();
  });
});
