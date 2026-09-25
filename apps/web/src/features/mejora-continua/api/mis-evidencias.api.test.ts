import { afterEach, describe, expect, it, vi } from 'vitest';

import { cliente } from '@/shared/api/cliente';

import { agregarEvidencia, listarMisEvaluaciones, retirarEvidencia } from './mis-evidencias.api';

afterEach(() => vi.restoreAllMocks());

describe('cliente de mis evidencias', () => {
  it('listar pide GET /mejora-continua/mis-evaluaciones', async () => {
    const espia = vi.spyOn(cliente, 'get').mockResolvedValue({ evaluaciones: [] });
    await expect(listarMisEvaluaciones()).resolves.toEqual({ evaluaciones: [] });
    expect(espia).toHaveBeenCalledWith('/mejora-continua/mis-evaluaciones');
  });

  it('agregar hace POST con el enlace y la descripción a la evaluación indicada', async () => {
    const espia = vi.spyOn(cliente, 'post').mockResolvedValue({ id: 'nueva' });
    const r = await agregarEvidencia('ae-1', { enlace: 'https://a', descripcion: 'A' });
    expect(r).toEqual({ id: 'nueva' });
    expect(espia).toHaveBeenCalledWith('/mejora-continua/mis-evaluaciones/ae-1/evidencias', {
      enlace: 'https://a',
      descripcion: 'A',
    });
  });

  it('retirar hace DELETE de esa evidencia', async () => {
    const espia = vi.spyOn(cliente, 'delete').mockResolvedValue(undefined);
    await retirarEvidencia('ev-1');
    expect(espia).toHaveBeenCalledWith('/mejora-continua/mis-evaluaciones/evidencias/ev-1');
  });
});
