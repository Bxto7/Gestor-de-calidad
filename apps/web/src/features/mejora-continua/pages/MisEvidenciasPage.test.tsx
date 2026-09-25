/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import * as api from '../api/mis-evidencias.api';
import type { EvaluacionAsignada, MisEvaluaciones } from '../api/mis-evidencias.api';
import { MisEvidenciasPage } from './MisEvidenciasPage';

const evaluacion = (id: string, asignatura: string, evidencias = 0): EvaluacionAsignada => ({
  id,
  asignatura: {
    id: `a-${asignatura}`,
    codigo: asignatura.slice(0, 2).toUpperCase(),
    nombre: asignatura,
  },
  competencia: { id: 'k1', codigo: 'CPE-01', nombre: 'Diseño de soluciones' },
  entregable: 'Proyecto',
  periodo: { id: 'p1', etiqueta: '2026-I', fechaCierre: '2026-07-15' },
  planEvaluacion: { id: 'pev', codigo: 'EV-1' },
  evidencias: Array.from({ length: evidencias }, (_, i) => ({
    id: `x${id}${i}`,
    enlace: `https://ejemplo.pe/${id}${i}`,
    descripcion: `Evidencia ${id}${i}`,
    propia: true,
  })),
  puedeAgregar: true,
});

const dos: MisEvaluaciones = {
  evaluaciones: [
    evaluacion('e1', 'Base de Datos', 1),
    evaluacion('e2', 'Base de Datos'),
    evaluacion('e3', 'Redes'),
  ],
};

const sesion = (carreraACargo: string | null): ValorSesion => ({
  identidad: {
    id: 'u1',
    nombre: 'Jorge Huamán',
    permisos: ['evidencia.registrar'],
    roles: ['DOCENTE'],
    carreraACargo,
  },
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: ['DOCENTE'],
  vistaActiva: 'DOCENTE',
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
});

function montar(
  carreraACargo: string | null = 'c1',
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const publicar = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar }}>
          <ContextoSesion.Provider value={sesion(carreraACargo)}>
            <MisEvidenciasPage />
          </ContextoSesion.Provider>
        </CtxEncabezado.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { publicar };
}

afterEach(() => vi.restoreAllMocks());

describe('MisEvidenciasPage', () => {
  it('con evaluaciones muestra el título, las agrupa por asignatura y publica su migaja', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue(dos);
    const { publicar } = montar();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis evidencias' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Base de Datos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Redes' })).toBeInTheDocument();
    // Dos evaluaciones de la misma asignatura comparten un solo encabezado.
    expect(screen.getAllByRole('heading', { level: 2, name: 'Base de Datos' })).toHaveLength(1);
    // Una región por evaluación (su nombre lleva la competencia); las secciones por
    // asignatura son regiones con otro nombre y no cuentan aquí.
    expect(screen.getAllByRole('region', { name: /CPE-01/ })).toHaveLength(3);
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({ migas: [{ etiqueta: 'Mis evidencias' }] }),
    );
  });

  it('sin evaluaciones muestra el estado vacío', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({ evaluaciones: [] });
    montar();

    expect(
      await screen.findByText('No tienes evaluaciones asignadas en el plan vigente.'),
    ).toBeInTheDocument();
  });

  it('sin carrera a cargo no llama al endpoint y lo dice', () => {
    const espia = vi.spyOn(api, 'listarMisEvaluaciones');
    montar(null);

    expect(screen.getByText('Esta vista necesita una carrera asignada.')).toBeInTheDocument();
    expect(espia).not.toHaveBeenCalled();
  });

  it('un 409 del servidor muestra el mismo mensaje y no ofrece reintentar', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockRejectedValue(
      new ErrorDeNegocio('Esta vista necesita una carrera asignada.', 409),
    );
    montar();

    expect(
      await screen.findByText('Esta vista necesita una carrera asignada.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('muestra un esqueleto mientras carga', () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockReturnValue(new Promise(() => undefined));
    montar();

    expect(screen.getByRole('status', { name: 'Cargando tus evaluaciones' })).toBeInTheDocument();
  });

  it('ante un fallo de red muestra el error con reintento, y reintentar vuelve a pedir', async () => {
    const espia = vi
      .spyOn(api, 'listarMisEvaluaciones')
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce(dos);
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar tus evaluaciones.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(espia).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mis evidencias' }),
    ).toBeInTheDocument();
  });

  it('agregar llama al cliente con la evaluación correcta y vuelve a pedir la lista', async () => {
    const listar = vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({
      evaluaciones: [evaluacion('e1', 'Base de Datos')],
    });
    const agregar = vi.spyOn(api, 'agregarEvidencia').mockResolvedValue({ id: 'nueva' });
    montar();

    await userEvent.type(
      await screen.findByLabelText('Enlace de la evidencia'),
      'https://ejemplo.pe/nueva',
    );
    await userEvent.type(screen.getByLabelText('Descripción'), 'Informe');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    await waitFor(() =>
      expect(agregar).toHaveBeenCalledWith('e1', {
        enlace: 'https://ejemplo.pe/nueva',
        descripcion: 'Informe',
      }),
    );
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });

  it('retirar llama al cliente con la evidencia correcta y vuelve a pedir la lista', async () => {
    const listar = vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({
      evaluaciones: [evaluacion('e1', 'Base de Datos', 1)],
    });
    const retirar = vi.spyOn(api, 'retirarEvidencia').mockResolvedValue(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Retirar Evidencia e10' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(retirar).toHaveBeenCalledWith('xe10'));
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });

  it('si el alta falla por un estado que cambió, recarga la lista para no quedarse con datos viejos', async () => {
    const listar = vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({
      evaluaciones: [evaluacion('e1', 'Base de Datos')],
    });
    vi.spyOn(api, 'agregarEvidencia').mockRejectedValue(
      new ErrorDeNegocio(
        'El plan de evaluación EV-1 no está vigente; ya no admite evidencias.',
        409,
      ),
    );
    montar();

    await userEvent.type(
      await screen.findByLabelText('Enlace de la evidencia'),
      'https://ejemplo.pe/x',
    );
    await userEvent.type(screen.getByLabelText('Descripción'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    // El aviso de la página y el de la tarjeta conviven: hay más de una alerta.
    const alertas = await screen.findAllByRole('alert');
    expect(alertas[0]).toHaveTextContent('no está vigente');
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
  });

  it('el mensaje del servidor sigue visible aunque la lista recargada ya no traiga la evaluación', async () => {
    const mensaje = 'El plan de evaluación EV-1 no está vigente; ya no admite evidencias.';
    const listar = vi
      .spyOn(api, 'listarMisEvaluaciones')
      .mockResolvedValueOnce({ evaluaciones: [evaluacion('e1', 'Base de Datos')] })
      .mockResolvedValue({ evaluaciones: [] });
    vi.spyOn(api, 'agregarEvidencia').mockRejectedValue(new ErrorDeNegocio(mensaje, 409));
    montar();

    await userEvent.type(
      await screen.findByLabelText('Enlace de la evidencia'),
      'https://ejemplo.pe/x',
    );
    await userEvent.type(screen.getByLabelText('Descripción'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    // La tarjeta desaparece con la recarga; solo el aviso de la página conserva el motivo.
    await waitFor(() => expect(listar).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('No tienes evaluaciones asignadas en el plan vigente.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Enlace de la evidencia')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(mensaje);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el aviso se limpia con el siguiente intento que sale bien', async () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockResolvedValue({
      evaluaciones: [evaluacion('e1', 'Base de Datos', 1)],
    });
    vi.spyOn(api, 'retirarEvidencia')
      .mockRejectedValueOnce(new ErrorDeNegocio('No puedes retirar esta evidencia.', 403))
      .mockResolvedValueOnce(undefined);
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Retirar Evidencia e10' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
      'No puedes retirar esta evidencia.',
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Retirar Evidencia e10' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('la lista en caché de otro usuario no se muestra al nuevo mientras carga la suya', () => {
    vi.spyOn(api, 'listarMisEvaluaciones').mockReturnValue(new Promise(() => undefined));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['mis-evaluaciones', 'otro-usuario', 'c1'], dos);
    montar('c1', qc);

    expect(screen.getByRole('status', { name: 'Cargando tus evaluaciones' })).toBeInTheDocument();
    expect(screen.queryByText('Base de Datos')).not.toBeInTheDocument();
  });
});
