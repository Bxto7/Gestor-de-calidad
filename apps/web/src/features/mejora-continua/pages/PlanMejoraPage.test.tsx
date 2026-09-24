/** @vitest-environment jsdom */

/**
 * RF-PJ-032 a RF-PJ-037 (2c-J-C): `PlanMejoraPage` gana pestañas ARIA cuando
 * Documentos y Versiones ya existen — mismo patrón que `PlanEvaluacionPage`.
 *
 * La accesibilidad WCAG 2.1 AA de estas pestañas se verifica en E2E con
 * `@axe-core/playwright` (`tests/e2e/specs/accesibilidad.spec.ts`), no aquí:
 * no hay `jest-axe` en este repo y ningún `*.test.tsx` del módulo hace esa
 * aserción a nivel de componente.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CtxEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import type { PlanMejora } from '../domain/tipos';

// Sin datos reales de Objetivo/Competencia: `nombreElemento` los usa detrás de
// un `?.find`, así que un `data: []` basta y evita que la pantalla golpee la
// red real en jsdom (mismo motivo que `PlanesMejoraPage.test.tsx` mockea
// `useCarreras`).
vi.mock('@/features/plan-estudios/api/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/plan-estudios/api/queries')>()),
  useObjetivos: () => ({ data: [] }),
  useCompetencias: () => ({ data: [] }),
}));

vi.mock('@/features/acreditacion/api/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/acreditacion/api/queries')>()),
  useCriterios: () => ({ data: [] }),
}));

// `vi.mock` se eleva por encima de las declaraciones `const` del módulo, así
// que `planDePrueba` tiene que nacer dentro de `vi.hoisted` — de otro modo el
// factory de abajo intenta leerla antes de que exista.
const { planDePrueba } = vi.hoisted(() => ({
  planDePrueba: {
    id: 'plan-1',
    codigo: 'PJ-E2E-001',
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: 'carrera-1',
    criterioAcreditacionId: 'criterio-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: null,
    estado: 'Borrador',
    estadoImplementacion: 'Pendiente',
    nombre: 'Reforzar el syllabus',
    causaRaiz: 'Causa raíz de prueba',
    justificacion: 'Justificación de prueba',
    input: 'Input de prueba',
    plazo: '2026-12-31T00:00:00.000Z',
    recursos: 'Recursos de prueba',
    metas: 'Metas de prueba',
    responsable: 'Responsable de prueba',
    logroMeta: null,
    impacto: null,
    creadoEn: '2026-01-01T00:00:00.000Z',
    evidencias: [],
  } satisfies PlanMejora,
}));

vi.mock('../api/mejora.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/mejora.api')>()),
  obtenerPlanMejora: vi.fn().mockResolvedValue(planDePrueba),
  historialDeMejora: vi.fn().mockResolvedValue([]),
  versionesDeMejora: vi.fn().mockResolvedValue([]),
  documentosDeMejora: vi.fn().mockResolvedValue([]),
}));

import { PlanMejoraPage } from './PlanMejoraPage';

const sesionDePrueba: ValorSesion = {
  identidad: null,
  cargando: false,
  puede: () => true,
  dirigeCarrera: () => true,
  puedeEn: () => true,
  roles: [],
  vistaActiva: null,
  cambiarVista: () => undefined,
  entrar: () => undefined,
  salir: () => Promise.resolve(),
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/mejora-continua/mejora/plan-1']}>
        <ContextoSesion.Provider value={sesionDePrueba}>
          <CtxEncabezado.Provider value={{ migas: [], acciones: null, publicar: () => undefined }}>
            <Routes>
              <Route path="/mejora-continua/mejora/:id" element={<PlanMejoraPage />} />
            </Routes>
          </CtxEncabezado.Provider>
        </ContextoSesion.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('pestañas ARIA', () => {
  it('cinco pestañas: Definición, Seguimiento, Documentos, Versiones, Historial', async () => {
    montar();

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Definición',
      'Seguimiento',
      'Documentos',
      'Versiones',
      'Historial de cambios',
    ]);
  });

  it('cambiar de pestaña mueve aria-selected y oculta el panel anterior', async () => {
    montar();
    await screen.findAllByRole('tab');

    await userEvent.click(screen.getByRole('tab', { name: /documentos/i }));

    expect(screen.getByRole('tab', { name: /documentos/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /definición/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
