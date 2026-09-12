/** @vitest-environment jsdom */

/**
 * El modal de alta de Plan de Mejora — RF-PJ-001/002 (aspecto y elemento) y
 * RF-PJ-026/027/029 (base de competencias, periodo, competencia).
 *
 * El caso que de verdad importa: cambiar de aspecto después de elegir un
 * elemento. Si el `elementoId` seleccionado sobrevive al cambio, el modal
 * podría enviar, por ejemplo, un `elementoId` de un criterio bajo
 * `aspecto: 'COMPETENCIA'` — el backend lo rechazaría, pero el usuario vería
 * un 404/400 sin entender por qué, en vez de que el propio selector ya
 * estuviera vacío.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/acreditacion/api/queries', () => ({
  useCriterios: () => ({
    data: [{ id: 'cri-1', carreraId: 'carrera-1', codigo: 'C-01', nombre: 'Estudiantes', activo: true, creadoEn: '' }],
  }),
}));
vi.mock('@/features/plan-estudios/api/queries', () => ({
  useObjetivos: () => ({
    data: [{ id: 'obj-1', codigo: 'OE-01', nombre: 'Formar profesionales', descripcion: '', estado: 'activo' }],
  }),
}));

import { ModalNuevoPlanMejora } from './ModalNuevoPlanMejora';

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ModalNuevoPlanMejora carreraId="carrera-1" onCerrar={() => {}} onCreado={() => {}} />
    </QueryClientProvider>,
  );
}

describe('ModalNuevoPlanMejora', () => {
  it('limpia el elemento elegido al cambiar de aspecto', async () => {
    const usuario = userEvent.setup();
    renderizar();

    // Selecciona un criterio en CRITERIO_ACREDITACION
    await usuario.selectOptions(screen.getByLabelText('Aspecto'), 'CRITERIO_ACREDITACION');
    await usuario.selectOptions(screen.getByLabelText('Elemento'), 'cri-1');
    expect(screen.getByLabelText<HTMLSelectElement>('Elemento').value).toBe('cri-1');

    // Cambia a OBJETIVO_EDUCACIONAL — el selector de Elemento ahora lista objetivos, no criterios
    await usuario.selectOptions(screen.getByLabelText('Aspecto'), 'OBJETIVO_EDUCACIONAL');
    await waitFor(() => {
      // El selector nuevo (de objetivos) debe estar vacío, no guardar el cri-1 anterior
      expect(screen.getByLabelText<HTMLSelectElement>('Elemento').value).toBe('');
    });

    // Vuelve a CRITERIO_ACREDITACION — el criterio cri-1 vuelve a ser una opción válida.
    // Si el estado no se limpió al cambiar, la controladora mostraría cri-1 de nuevo.
    // Este es el test que atrapa la ausencia del guardián.
    await usuario.selectOptions(screen.getByLabelText('Aspecto'), 'CRITERIO_ACREDITACION');
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLSelectElement>('Elemento').value).toBe('');
    });
  });

  it('el aspecto Competencia no muestra el selector de Elemento genérico, sino el de plan base', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.selectOptions(screen.getByLabelText('Aspecto'), 'COMPETENCIA');

    expect(screen.queryByLabelText('Elemento')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Plan de evaluación base')).toBeInTheDocument();
  });
});
