// apps/web/src/features/mejora-continua/pages/ActaPage.test.tsx

/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import type { Acta, ContenidoActa } from '../domain/tipos';

const { actaDePrueba } = vi.hoisted(() => ({
  actaDePrueba: {
    id: 'acta-1',
    carreraId: 'carrera-1',
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2026-1',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Sistemas — 2026-1',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2026-1',
    textoIntroduccion: 'Texto de introducción de prueba.',
    textoAcuerdoCierre: 'Texto de cierre de prueba.',
    convocadaPor: '',
    fechaReunion: new Date(0).toISOString(),
    lugarReunion: '',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    estado: 'Borrador',
    creadoEn: '2026-09-19T00:00:00.000Z',
    asistentes: [],
    aprobadoPorId: null,
    aprobadoEn: null,
  } satisfies Acta,
}));

vi.mock('../api/actas.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/actas.api')>()),
  obtenerActa: vi.fn().mockResolvedValue(actaDePrueba),
  obtenerContenidoActa: vi
    .fn()
    .mockResolvedValue({ ...actaDePrueba, acciones: [] } satisfies ContenidoActa),
}));

import * as actasApi from '../api/actas.api';
import { ActaPage } from './ActaPage';

const sesionDePrueba: ValorSesion = {
  identidad: null,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/mejora-continua/actas/acta-1']}>
        <ContextoSesion.Provider value={sesionDePrueba}>
          <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
            <Routes>
              <Route path="/mejora-continua/actas/:id" element={<ActaPage />} />
            </Routes>
          </CtxEncabezado.Provider>
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RF-AC-003/004/006 — cabecera del acta', () => {
  it('muestra el título y el código del acta', async () => {
    montar();
    expect(await screen.findByText(actaDePrueba.codigo)).toBeInTheDocument();
    expect(screen.getByDisplayValue(actaDePrueba.titulo)).toBeInTheDocument();
  });

  it('editar la cabecera llama a editarCabeceraActa', async () => {
    const editar = vi.spyOn(actasApi, 'editarCabeceraActa').mockResolvedValue(actaDePrueba);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.clear(screen.getByLabelText(/convocada por/i));
    await userEvent.type(screen.getByLabelText(/convocada por/i), 'Director de carrera');
    await userEvent.click(screen.getByRole('button', { name: /guardar cabecera/i }));

    await waitFor(() => {
      expect(editar).toHaveBeenCalledWith(
        'acta-1',
        expect.objectContaining({ convocadaPor: 'Director de carrera' }),
      );
    });
  });
});

describe('RF-AC-005 — asistentes', () => {
  it('reemplazar asistentes llama a reemplazarAsistentesActa con la lista completa', async () => {
    const reemplazar = vi.spyOn(actasApi, 'reemplazarAsistentesActa').mockResolvedValue(actaDePrueba);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /agregar asistente/i }));
    await userEvent.type(screen.getByLabelText(/asistente 1/i), 'Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: /guardar asistentes/i }));

    await waitFor(() => {
      expect(reemplazar).toHaveBeenCalledWith('acta-1', ['Ana Pérez']);
    });
  });
});

describe('RF-AC-007/008 — acciones del periodo', () => {
  it('cargar acciones llama a cargarAccionesActa', async () => {
    const cargar = vi.spyOn(actasApi, 'cargarAccionesActa').mockResolvedValue({ cantidadCargada: 2 });
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(screen.getByRole('button', { name: /cargar acciones del periodo/i }));

    await waitFor(() => expect(cargar).toHaveBeenCalledWith('acta-1'));
  });

  it('togglear la inclusión de una acción llama a actualizarSeleccionActa', async () => {
    vi.spyOn(actasApi, 'obtenerContenidoActa').mockResolvedValue({
      ...actaDePrueba,
      acciones: [
        {
          id: 'accion-1',
          incluida: true,
          orden: 0,
          porcentajeMedicionCompetencia: null,
          plan: {
            id: 'plan-1',
            codigo: 'PJ-001',
            aspecto: 'CRITERIO_ACREDITACION',
            carreraId: 'carrera-1',
            criterioAcreditacionId: 'criterio-1',
            objetivoEducacionalId: null,
            competenciaId: null,
            periodoId: null,
            planEvaluacionId: null,
            planMedicionAfectadoId: null,
            estado: 'Aprobado',
            estadoImplementacion: 'Pendiente',
            nombre: 'Reforzar el syllabus',
            causaRaiz: 'Causa de prueba',
            justificacion: 'Justificación de prueba',
            input: null,
            plazo: '2026-12-31T00:00:00.000Z',
            recursos: 'Recursos de prueba',
            metas: 'Metas de prueba',
            responsable: 'Responsable de prueba',
            logroMeta: null,
            impacto: null,
            creadoEn: '2026-01-01T00:00:00.000Z',
            evidencias: [],
          },
        },
      ],
    });
    const actualizar = vi.spyOn(actasApi, 'actualizarSeleccionActa').mockResolvedValue(undefined);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.click(await screen.findByRole('checkbox', { name: /reforzar el syllabus/i }));

    await waitFor(() => {
      expect(actualizar).toHaveBeenCalledWith('acta-1', [{ planMejoraId: 'plan-1', incluida: false }]);
    });
  });
});

describe('RF-AC-011 — textos institucionales', () => {
  it('editar los textos llama a editarTextosActa', async () => {
    const editar = vi.spyOn(actasApi, 'editarTextosActa').mockResolvedValue(actaDePrueba);
    montar();
    await screen.findByDisplayValue(actaDePrueba.titulo);

    await userEvent.clear(screen.getByLabelText(/introducción/i));
    await userEvent.type(screen.getByLabelText(/introducción/i), 'Nuevo texto de introducción');
    await userEvent.click(screen.getByRole('button', { name: /guardar textos/i }));

    await waitFor(() => {
      expect(editar).toHaveBeenCalledWith('acta-1', {
        textoIntroduccion: 'Nuevo texto de introducción',
        textoAcuerdoCierre: actaDePrueba.textoAcuerdoCierre,
      });
    });
  });
});
