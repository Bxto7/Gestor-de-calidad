/** @vitest-environment jsdom */

/**
 * RF-PE-032 a RF-PE-034 en pantalla — gemela de `DocumentosDelPlan.test.tsx`
 * (medición).
 *
 * Lo que se vigila es lo mismo que en medición: los tres estados de un
 * trabajo se distinguen, solo lo «Listo» se puede descargar, un fallido
 * enseña su motivo y la descarga pide el archivo por sesión, no por enlace.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TipoDocumentoEvaluacion, TrabajoDocumento } from '../domain/tipos';
import {
  DocumentosDelPlanEvaluacion,
  type DocumentosDelPlanEvaluacionProps,
} from './DocumentosDelPlanEvaluacion';

type Trabajo = TrabajoDocumento<TipoDocumentoEvaluacion>;

const LISTO: Trabajo = {
  id: 't-1',
  tipo: 'PLAN_EVALUACION_PDF',
  estado: 'Listo',
  nombreArchivo: 'plan.pdf',
  bytes: 4096,
  error: null,
  solicitadoEn: '2026-09-09T10:00:00.000Z',
};
const EN_CURSO: Trabajo = { ...LISTO, id: 't-2', estado: 'Generando', nombreArchivo: null };
const FALLIDO: Trabajo = {
  ...LISTO,
  id: 't-3',
  estado: 'Fallido',
  nombreArchivo: null,
  error: 'El plan no tiene competencias.',
};

function montar(sobre: Partial<DocumentosDelPlanEvaluacionProps> = {}) {
  const onGenerar = vi.fn();
  const onDescargar = vi.fn();
  render(
    <DocumentosDelPlanEvaluacion
      documentos={[]}
      generando={false}
      onGenerar={onGenerar}
      onDescargar={onDescargar}
      {...sobre}
    />,
  );
  return { onGenerar, onDescargar };
}

describe('los estados de un trabajo', () => {
  it('un trabajo fallido enseña su motivo, no un estado mudo', () => {
    montar({ documentos: [FALLIDO] });

    expect(screen.getByText('Fallido')).toBeVisible();
    expect(screen.getByText('El plan no tiene competencias.')).toBeVisible();
  });

  it('solo se puede descargar lo que está listo', () => {
    montar({ documentos: [LISTO, EN_CURSO] });

    const botones = screen.getAllByRole('button', { name: 'Descargar' });
    expect(botones).toHaveLength(1);
  });

  it('descargar pide el archivo con la sesión, no con un enlace', async () => {
    // El token vive en `sessionStorage`: un `<a href>` iría sin cabecera de
    // autorización y daría 401. Si esta prueba encuentra un enlace, el fallo
    // ya está cometido.
    const p = montar({ documentos: [LISTO] });
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));

    expect(p.onDescargar).toHaveBeenCalledWith('t-1');
    expect(screen.queryByRole('link', { name: 'Descargar' })).not.toBeInTheDocument();
  });
});

describe('generar', () => {
  it('sin permiso para exportar, los botones de generar no se pintan', () => {
    // `GenerarDocumentoEvaluacion.encolar` exige `evaluacion.editar`: quien la
    // usa pasa `onGenerar` como `undefined` sin ese permiso, y el componente
    // no debe ofrecer un botón que terminaría en un 403.
    montar({ onGenerar: undefined });

    expect(screen.queryByRole('button', { name: 'Generar PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar Excel' })).not.toBeInTheDocument();
  });

  it('generar encola el tipo que se pulsó', async () => {
    const p = montar({ documentos: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Generar Excel' }));

    expect(p.onGenerar).toHaveBeenCalledWith('PLAN_EVALUACION_EXCEL');
  });

  it('mientras se pide, los botones no aceptan un segundo clic', () => {
    montar({ documentos: [], generando: true });

    expect(screen.getByRole('button', { name: 'Generar PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generar Excel' })).toBeDisabled();
  });

  it('sin ningún documento lo dice, en vez de una lista muda', () => {
    montar({ documentos: [] });

    expect(screen.getByText(/todavía no se ha generado/i)).toBeVisible();
  });
});
