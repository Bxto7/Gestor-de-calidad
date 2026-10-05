import { afterEach, describe, expect, it, vi } from 'vitest';

import { cliente } from '@/shared/api/cliente';

import { historialDeActa } from './actas.api';

afterEach(() => vi.restoreAllMocks());

describe('cliente de actas', () => {
  it('el historial se pide al endpoint propio del acta, no a /auditoria', async () => {
    const espia = vi.spyOn(cliente, 'get').mockResolvedValue([]);

    await historialDeActa('acta-1');

    expect(espia).toHaveBeenCalledWith('/actas/acta-1/historial');
  });
});
