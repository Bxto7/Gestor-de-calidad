import { describe, expect, it, vi } from 'vitest';

import { cliente } from '@/shared/api/cliente';

import { obtenerEstructuraInstitucional } from './estructura.api';

describe('obtenerEstructuraInstitucional', () => {
  it('pide GET /estructura-institucional y devuelve el cuerpo tal cual', async () => {
    const cuerpo = { kpis: {}, facultades: [] };
    const get = vi.spyOn(cliente, 'get').mockResolvedValue(cuerpo);

    await expect(obtenerEstructuraInstitucional()).resolves.toBe(cuerpo);
    expect(get).toHaveBeenCalledWith('/estructura-institucional');
  });
});
