import { describe, expect, it } from 'vitest';

import { candidatasParaCargar } from './candidatas-acciones-acta.js';

describe('candidatasParaCargar', () => {
  it('deja pasar una candidata que no está vinculada ni emitida en otra parte', () => {
    const resultado = candidatasParaCargar([{ id: 'p-1' }], new Set(), new Set());
    expect(resultado).toEqual([{ id: 'p-1' }]);
  });

  it('excluye una candidata ya vinculada a esta acta (RF-AC-007: carga idempotente)', () => {
    const resultado = candidatasParaCargar([{ id: 'p-1' }, { id: 'p-2' }], new Set(['p-1']), new Set());
    expect(resultado).toEqual([{ id: 'p-2' }]);
  });

  it('excluye una candidata ya incluida en un acta Emitida (nota §2 de 2c-AC-A, generalizada)', () => {
    const resultado = candidatasParaCargar([{ id: 'p-1' }, { id: 'p-2' }], new Set(), new Set(['p-2']));
    expect(resultado).toEqual([{ id: 'p-1' }]);
  });

  it('aplica ambas exclusiones a la vez', () => {
    const resultado = candidatasParaCargar(
      [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }],
      new Set(['p-1']),
      new Set(['p-2']),
    );
    expect(resultado).toEqual([{ id: 'p-3' }]);
  });
});
