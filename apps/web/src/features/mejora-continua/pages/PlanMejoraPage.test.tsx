/** @vitest-environment jsdom */

/**
 * RF-PJ-032 a RF-PJ-037 (2c-J-C): `PlanMejoraPage` gana pestañas ARIA cuando
 * Documentos y Versiones ya existen — mismo patrón que `PlanEvaluacionPage`.
 * Bloque 6b (RF-CH-042 a RF-CH-045): ciclo propio de tres estados, «Eliminar»,
 * responsable elegido entre los docentes de la carrera y 404 por alcance.
 *
 * La accesibilidad WCAG 2.1 AA de estas pestañas se verifica en E2E con
 * `@axe-core/playwright` (`tests/e2e/specs/accesibilidad.spec.ts`), no aquí:
 * no hay `jest-axe` en este repo y ningún `*.test.tsx` del módulo hace esa
 * aserción a nivel de componente.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { montarPagina } from '@/features/plan-estudios/pruebas/montar-pagina';
import { ErrorDeNegocio } from '@/shared/api/cliente';

import type { PlanMejora } from '../domain/tipos';

// Sin datos reales de Objetivo/Competencia: `nombreElemento` los usa detrás de
// un `?.find`, así que un `data: []` basta y evita que la pantalla golpee la
// red real en jsdom.
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
// que lo que usa el factory nace dentro de `vi.hoisted`.
const { planBase, api } = vi.hoisted(() => ({
  planBase: {
    id: 'pj-1',
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
    responsableId: null,
    logroMeta: null,
    impacto: null,
    creadoEn: '2026-01-01T00:00:00.000Z',
    evidencias: [],
  } satisfies PlanMejora,
  api: {
    obtenerPlanMejora: vi.fn(),
    docentesDelPlanMejora: vi.fn(),
    editarDefinicionMejora: vi.fn(),
  },
}));

vi.mock('../api/mejora.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/mejora.api')>()),
  ...api,
  historialDeMejora: vi.fn().mockResolvedValue([]),
  versionesDeMejora: vi.fn().mockResolvedValue([]),
  documentosDeMejora: vi.fn().mockResolvedValue([]),
}));

import { PlanMejoraPage } from './PlanMejoraPage';

const TODOS = ['mejora.leer', 'mejora.editar', 'mejora.aprobar', 'mejora.crear', 'mejora.eliminar'];

function planDevuelto(cambios: Partial<PlanMejora> = {}) {
  api.obtenerPlanMejora.mockResolvedValue({ ...planBase, ...cambios });
}

function docentesDelPlan(docentes: { id: string; nombre: string }[]) {
  api.docentesDelPlanMejora.mockResolvedValue(docentes);
}

function renderizar(permisos: string[] = TODOS) {
  return montarPagina(<PlanMejoraPage />, {
    permisos,
    carreraACargo: 'carrera-1',
    ruta: '/mejora-continua/mejora/pj-1',
    patron: '/mejora-continua/mejora/:id',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  planDevuelto();
  docentesDelPlan([]);
  api.editarDefinicionMejora.mockResolvedValue(planBase);
});

describe('pestañas ARIA', () => {
  it('cinco pestañas: Definición, Seguimiento, Documentos, Versiones, Historial', async () => {
    renderizar();

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
    renderizar();
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

describe('RF-CH-043 y RF-CH-044 — el detalle con el ciclo propio', () => {
  it('Borrador ofrece «Enviar a revisión»; nunca «Marcar como vigente» ni «Archivar»', async () => {
    planDevuelto({ estado: 'Borrador' });
    renderizar();

    expect(await screen.findByRole('button', { name: 'Enviar a revisión' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vigente|archivar/i })).not.toBeInTheDocument();
  });

  it('En revisión ofrece Aprobar y Observar', async () => {
    planDevuelto({ estado: 'En revisión' });
    renderizar();

    expect(await screen.findByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Observar' })).toBeInTheDocument();
  });

  it('Aprobado no ofrece ninguna transición', async () => {
    planDevuelto({ estado: 'Aprobado' });
    renderizar();

    await screen.findByRole('heading', { name: 'PJ-E2E-001' });
    expect(
      screen.queryByRole('button', { name: /Aprobar|Observar|Enviar/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['Borrador', false],
    ['En revisión', false],
    ['Aprobado', true],
  ] as const)('el seguimiento en %s es editable: %s', async (estado, editable) => {
    planDevuelto({ estado });
    renderizar(['mejora.leer', 'mejora.editar']);

    await userEvent.click(await screen.findByRole('tab', { name: 'Seguimiento' }));
    const selector = screen.getByRole('combobox', { name: /Estado de implementación/ });

    expect(selector).toHaveProperty('disabled', !editable);
  });

  it('«nueva versión» solo desde Aprobado', async () => {
    planDevuelto({ estado: 'Aprobado' });
    renderizar(['mejora.leer', 'mejora.crear']);

    await userEvent.click(await screen.findByRole('tab', { name: 'Versiones' }));

    expect(screen.getByRole('button', { name: /Generar nueva versión/ })).toBeEnabled();
  });

  it('en Borrador «nueva versión» no se habilita', async () => {
    planDevuelto({ estado: 'Borrador' });
    renderizar(['mejora.leer', 'mejora.crear']);

    await userEvent.click(await screen.findByRole('tab', { name: 'Versiones' }));

    expect(screen.queryByRole('button', { name: /Generar nueva versión/ })).not.toBeInTheDocument();
  });
});

describe('RF-CH-042 — «Eliminar» en el detalle', () => {
  it.each(['Borrador', 'En revisión'] as const)(
    'en %s hay «Eliminar PJ-E2E-001»',
    async (estado) => {
      planDevuelto({ estado });
      renderizar();

      expect(
        await screen.findByRole('button', { name: 'Eliminar PJ-E2E-001' }),
      ).toBeInTheDocument();
    },
  );

  it('en Aprobado no se ofrece', async () => {
    planDevuelto({ estado: 'Aprobado' });
    renderizar();

    await screen.findByRole('heading', { name: 'PJ-E2E-001' });
    expect(screen.queryByRole('button', { name: 'Eliminar PJ-E2E-001' })).not.toBeInTheDocument();
  });
});

describe('RF-CH-045 — el responsable es un selector de docentes de la carrera', () => {
  it('lista los docentes del plan y guarda `responsableId`, no texto', async () => {
    planDevuelto({ estado: 'Borrador', responsable: '', responsableId: null });
    docentesDelPlan([{ id: 'doc-1', nombre: 'Ana Docente' }]);
    renderizar(['mejora.leer', 'mejora.editar']);

    await screen.findByRole('option', { name: 'Ana Docente' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Responsable' }), 'doc-1');

    expect(api.editarDefinicionMejora).toHaveBeenCalledWith(
      'pj-1',
      expect.objectContaining({ responsableId: 'doc-1' }),
    );
    expect(api.editarDefinicionMejora.mock.calls[0]?.[1]).not.toHaveProperty('responsable');
  });

  it('sin docentes en la carrera: aviso «registrar primero docentes en Plan de Estudios»', async () => {
    planDevuelto({ estado: 'Borrador' });
    docentesDelPlan([]);
    renderizar(['mejora.leer', 'mejora.editar']);

    expect(await screen.findByText(/registrar primero docentes/i)).toBeInTheDocument();
  });

  it('un plan heredado (texto libre, sin id) muestra su responsable como opción «sin vincular» y no lo pierde', async () => {
    planDevuelto({
      estado: 'Borrador',
      responsable: 'Coordinación académica',
      responsableId: null,
    });
    docentesDelPlan([{ id: 'doc-1', nombre: 'Ana Docente' }]);
    renderizar(['mejora.leer', 'mejora.editar']);

    expect(
      await screen.findByRole('option', { name: 'Coordinación académica (sin vincular)' }),
    ).toBeInTheDocument();
  });

  it('si el docente guardado no está entre los activos, se sigue mostrando su nombre', async () => {
    planDevuelto({ estado: 'Aprobado', responsable: 'Beatriz Baja', responsableId: 'doc-baja' });
    docentesDelPlan([{ id: 'doc-1', nombre: 'Ana Docente' }]);
    renderizar(['mejora.leer']);

    const selector = await screen.findByRole<HTMLSelectElement>('combobox', {
      name: 'Responsable',
    });
    await screen.findByRole('option', { name: 'Ana Docente' });
    expect(selector.value).toBe('doc-baja');
    expect(selector.selectedOptions[0]?.textContent).toBe('Beatriz Baja');
  });

  it('mientras los docentes cargan (o fallan) el responsable guardado ya se ve', async () => {
    planDevuelto({ estado: 'Aprobado', responsable: 'Beatriz Baja', responsableId: 'doc-baja' });
    api.docentesDelPlanMejora.mockRejectedValue(new ErrorDeNegocio('Sin permiso', 403));
    renderizar(['mejora.leer']);

    const selector = await screen.findByRole<HTMLSelectElement>('combobox', {
      name: 'Responsable',
    });
    expect(selector.selectedOptions[0]?.textContent).toBe('Beatriz Baja');
  });

  it('plan heredado: dejar la opción heredada no envía nada, y editar otro campo no manda responsable ni responsableId', async () => {
    planDevuelto({
      estado: 'Borrador',
      responsable: 'Coordinación académica',
      responsableId: null,
    });
    docentesDelPlan([{ id: 'doc-1', nombre: 'Ana Docente' }]);
    renderizar(['mejora.leer', 'mejora.editar']);

    const selector = await screen.findByRole('combobox', { name: 'Responsable' });
    await screen.findByRole('option', { name: 'Ana Docente' });
    await userEvent.selectOptions(selector, '');
    expect(api.editarDefinicionMejora).not.toHaveBeenCalled();

    const metas = screen.getByRole('textbox', { name: 'Metas' });
    await userEvent.clear(metas);
    await userEvent.type(metas, 'Otras metas');
    await userEvent.tab();

    expect(api.editarDefinicionMejora).toHaveBeenCalledTimes(1);
    const datos = api.editarDefinicionMejora.mock.calls[0]?.[1] as
      Record<string, unknown> | undefined;
    expect(datos).not.toHaveProperty('responsable');
    expect(datos?.responsableId).toBeUndefined();
  });

  it('el aviso de «sin docentes» no sale a quien no puede editar', async () => {
    planDevuelto({ estado: 'Aprobado' });
    docentesDelPlan([]);
    renderizar(['mejora.leer']);

    await screen.findByRole('combobox', { name: 'Responsable' });
    await waitFor(() => expect(api.docentesDelPlanMejora).toHaveBeenCalled());
    expect(screen.queryByText(/registrar primero docentes/i)).not.toBeInTheDocument();
  });

  it('a quien puede editar se le avisa y el aviso queda asociado al selector', async () => {
    planDevuelto({ estado: 'Borrador' });
    docentesDelPlan([]);
    renderizar(['mejora.leer', 'mejora.editar']);

    const aviso = await screen.findByText(/registrar primero docentes/i);
    expect(screen.getByRole('combobox', { name: 'Responsable' })).toHaveAccessibleDescription(
      aviso.textContent ?? '',
    );
  });

  it('un cambio de otro campo reenvía el `responsableId` vigente y nunca el texto', async () => {
    planDevuelto({ estado: 'Borrador', responsable: 'Ana Docente', responsableId: 'doc-1' });
    docentesDelPlan([{ id: 'doc-1', nombre: 'Ana Docente' }]);
    renderizar(['mejora.leer', 'mejora.editar']);

    const metas = await screen.findByRole('textbox', { name: 'Metas' });
    await userEvent.clear(metas);
    await userEvent.type(metas, 'Otras metas');
    await userEvent.tab();

    expect(api.editarDefinicionMejora).toHaveBeenCalledWith(
      'pj-1',
      expect.objectContaining({ metas: 'Otras metas', responsableId: 'doc-1' }),
    );
    expect(api.editarDefinicionMejora.mock.calls[0]?.[1]).not.toHaveProperty('responsable');
  });
});

describe('RF-CH-034 RN1 — plan de otra carrera', () => {
  it('un 404 dice «Plan de mejora no encontrado» y no se queda cargando', async () => {
    api.obtenerPlanMejora.mockRejectedValue(
      new ErrorDeNegocio('El plan de mejora x no existe.', 404),
    );
    renderizar(['mejora.leer']);

    expect(await screen.findByText('Plan de mejora no encontrado')).toBeInTheDocument();
  });
});
