import { describe, expect, it } from 'vitest';

import { carreraDeTrabajo } from './carrera-de-trabajo';

describe('carreraDeTrabajo', () => {
  it('con carrera asignada trabaja con la suya, sin selector, aunque haya una elegida o una primera', () => {
    expect(carreraDeTrabajo('c1', 'c2', 'c3')).toEqual({ carreraId: 'c1', conSelector: false });
  });

  it('sin carrera asignada elige: la elegida, o la primera mientras no haya elegido', () => {
    expect(carreraDeTrabajo(null, 'c2', 'c3')).toEqual({ carreraId: 'c2', conSelector: true });
    expect(carreraDeTrabajo(null, '', 'c3')).toEqual({ carreraId: 'c3', conSelector: true });
    expect(carreraDeTrabajo(undefined, '', '')).toEqual({ carreraId: '', conSelector: true });
  });
});
