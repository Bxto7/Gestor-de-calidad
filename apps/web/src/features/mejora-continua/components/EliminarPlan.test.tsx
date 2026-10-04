/** @vitest-environment jsdom */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import type { EstadoMedicion } from '../domain/tipos';
import { EliminarPlan } from './EliminarPlan';

function montar(
  opciones: {
    estado?: EstadoMedicion;
    carreraId?: string;
    permisos?: string[];
    eliminar?: (id: string) => Promise<void>;
    onEliminado?: () => void;
  } = {},
) {
  const eliminar = opciones.eliminar ?? vi.fn(() => Promise.resolve());
  montarPagina(
    <EliminarPlan
      permiso="medicion.eliminar"
      plan={{
        id: 'pm-1',
        codigo: 'PM-PE-ISI-2026-v1-D-v1',
        estado: opciones.estado ?? 'Borrador',
        carreraId: opciones.carreraId ?? 'c1',
      }}
      titulo="Eliminar plan de medición"
      eliminar={eliminar}
      onEliminado={opciones.onEliminado}
    />,
    { permisos: opciones.permisos ?? ['medicion.eliminar'], carreraACargo: 'c1' },
  );
  return { eliminar };
}

const BOTON = { name: 'Eliminar PM-PE-ISI-2026-v1-D-v1' };

describe('EliminarPlan — cuándo se ofrece', () => {
  it.each(['Borrador', 'En revisión'] as const)(
    'en %s, con permiso en su carrera, se ofrece',
    (estado) => {
      montar({ estado });

      expect(screen.getByRole('button', BOTON)).toBeInTheDocument();
    },
  );

  it.each(['Aprobado', 'Vigente', 'Histórico'] as const)('en %s no se ofrece', (estado) => {
    montar({ estado });

    expect(screen.queryByRole('button', BOTON)).not.toBeInTheDocument();
  });

  it('sin el permiso, o en otra carrera, no se ofrece', () => {
    montar({ permisos: ['medicion.leer'] });
    expect(screen.queryByRole('button', BOTON)).not.toBeInTheDocument();
  });

  it('en un plan de otra carrera no se ofrece', () => {
    montar({ carreraId: 'c2' });
    expect(screen.queryByRole('button', BOTON)).not.toBeInTheDocument();
  });
});

describe('EliminarPlan — la confirmación', () => {
  it('pide confirmación, elimina por id y avisa', async () => {
    const onEliminado = vi.fn();
    const { eliminar } = montar({ onEliminado });

    await userEvent.click(screen.getByRole('button', BOTON));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de medición' });
    expect(within(dialogo).getByText('PM-PE-ISI-2026-v1-D-v1')).toBeInTheDocument();
    expect(eliminar).not.toHaveBeenCalled();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(eliminar).toHaveBeenCalledWith('pm-1'));
    expect(onEliminado).toHaveBeenCalled();
  });

  it('el motivo del 409 se muestra sin cerrar el diálogo', async () => {
    const motivo =
      'No se puede eliminar el plan de medición PM-PE-ISI-2026-v1-D-v1: tiene 1 plan de evaluación asociado.';
    montar({ eliminar: vi.fn(async () => Promise.reject(new ErrorDeNegocio(motivo, 409))) });

    await userEvent.click(screen.getByRole('button', BOTON));
    const dialogo = await screen.findByRole('dialog', { name: 'Eliminar plan de medición' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(motivo);
    expect(screen.getByRole('dialog', { name: 'Eliminar plan de medición' })).toBeInTheDocument();
  });
});
