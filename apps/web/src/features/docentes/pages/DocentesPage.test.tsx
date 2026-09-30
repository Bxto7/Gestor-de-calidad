/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/docentes.api';
import type { Docente } from '../api/docentes.api';
import { DocentesPage } from './DocentesPage';

const luis: Docente = {
  id: 'd1',
  email: 'luis@sgc.local',
  nombreCompleto: 'Luis Ramos',
  activo: true,
  creadoEn: '2026-09-01T10:00:00.000Z',
};

const marta: Docente = {
  id: 'd2',
  email: 'marta@sgc.local',
  nombreCompleto: 'Marta Solís',
  activo: false,
  creadoEn: '2026-09-02T10:00:00.000Z',
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/plan-estudios/planes/p1/docentes']}>
        <Routes>
          <Route path="/plan-estudios/planes/:planId/docentes" element={<DocentesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('DocentesPage', () => {
  it('lista los docentes con su usuario y su estado', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis, marta]);
    montar();

    const filaLuis = await screen.findByRole('row', { name: /Luis Ramos/ });
    expect(filaLuis).toHaveTextContent('luis@sgc.local');
    expect(filaLuis).toHaveTextContent('Activo');
    expect(screen.getByRole('row', { name: /Marta Solís/ })).toHaveTextContent('Inactivo');
  });

  it('sin docentes muestra el vacío y deja crear uno', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([]);
    montar();

    expect(await screen.findByText(/Aún no hay docentes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo docente' })).toBeInTheDocument();
  });

  it('el alta pide nombre, usuario y contraseña, y no ofrece elegir carrera', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([]);
    const crear = vi.spyOn(api, 'crearDocente').mockResolvedValue(luis);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo docente' }));
    const modal = screen.getByRole('dialog', { name: 'Nuevo docente' });

    expect(within(modal).queryByLabelText(/Carrera/)).not.toBeInTheDocument();
    await userEvent.type(within(modal).getByLabelText(/Nombre completo/), 'Luis Ramos');
    await userEvent.type(within(modal).getByLabelText(/Usuario/), 'luis@sgc.local');
    await userEvent.type(within(modal).getByLabelText(/Contraseña/), 'Clave.Docente.1');
    await userEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));

    expect(crear).toHaveBeenCalledWith({
      nombreCompleto: 'Luis Ramos',
      email: 'luis@sgc.local',
      password: 'Clave.Docente.1',
    });
  });

  it('el alta muestra el motivo si el servidor la rechaza', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([]);
    vi.spyOn(api, 'crearDocente').mockRejectedValue(
      new ErrorDeNegocio('Ya existe una cuenta con el usuario luis@sgc.local.', 409),
    );
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo docente' }));
    const modal = screen.getByRole('dialog', { name: 'Nuevo docente' });
    await userEvent.type(within(modal).getByLabelText(/Nombre completo/), 'Luis Ramos');
    await userEvent.type(within(modal).getByLabelText(/Usuario/), 'luis@sgc.local');
    await userEvent.type(within(modal).getByLabelText(/Contraseña/), 'Clave.Docente.1');
    await userEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));

    expect(await within(modal).findByRole('alert')).toHaveTextContent(/Ya existe una cuenta/);
  });

  it('editar contraseña envía solo la nueva contraseña', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    const cambiar = vi.spyOn(api, 'cambiarPasswordDocente').mockResolvedValue();
    montar();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar contraseña de Luis Ramos' }),
    );
    const modal = screen.getByRole('dialog', { name: 'Editar contraseña' });
    await userEvent.type(within(modal).getByLabelText(/Nueva contraseña/), 'Otra.Clave.Docente.2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));

    expect(cambiar).toHaveBeenCalledWith('d1', 'Otra.Clave.Docente.2');
  });

  it('inactivar pide confirmación y luego inactiva', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    const estado = vi
      .spyOn(api, 'cambiarEstadoDocente')
      .mockResolvedValue({ ...luis, activo: false });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar a Luis Ramos' }));
    expect(estado).not.toHaveBeenCalled();
    const modal = screen.getByRole('dialog', { name: 'Inactivar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Inactivar' }));

    expect(estado).toHaveBeenCalledWith('d1', false);
  });

  it('un docente inactivo se reactiva', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([marta]);
    const estado = vi
      .spyOn(api, 'cambiarEstadoDocente')
      .mockResolvedValue({ ...marta, activo: true });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar a Marta Solís' }));
    const modal = screen.getByRole('dialog', { name: 'Reactivar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Reactivar' }));

    expect(estado).toHaveBeenCalledWith('d2', true);
  });

  it('eliminar pide confirmación y luego elimina', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    const eliminar = vi.spyOn(api, 'eliminarDocente').mockResolvedValue();
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar a Luis Ramos' }));
    expect(eliminar).not.toHaveBeenCalled();
    const modal = screen.getByRole('dialog', { name: 'Eliminar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Eliminar' }));

    expect(eliminar).toHaveBeenCalledWith('d1');
  });

  it('si el docente está en uso, enseña el motivo y ofrece inactivarlo en su lugar', async () => {
    vi.spyOn(api, 'listarDocentes').mockResolvedValue([luis]);
    vi.spyOn(api, 'eliminarDocente').mockRejectedValue(
      new ErrorDeNegocio(
        'No se puede eliminar a Luis Ramos: tiene 2 evidencia(s) registrada(s). Inactívalo en su lugar.',
        409,
      ),
    );
    const estado = vi
      .spyOn(api, 'cambiarEstadoDocente')
      .mockResolvedValue({ ...luis, activo: false });
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar a Luis Ramos' }));
    const modal = screen.getByRole('dialog', { name: 'Eliminar docente' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Eliminar' }));

    expect(await within(modal).findByRole('alert')).toHaveTextContent(/2 evidencia\(s\)/);
    await userEvent.click(within(modal).getByRole('button', { name: 'Inactivar en su lugar' }));

    expect(estado).toHaveBeenCalledWith('d1', false);
  });
});
