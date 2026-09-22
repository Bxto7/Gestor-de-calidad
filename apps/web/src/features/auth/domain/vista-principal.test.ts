import { describe, expect, it } from 'vitest';

import { vistaPrincipalDe } from './vista-principal';

describe('vistaPrincipalDe', () => {
  it('con un solo rol, devuelve ese rol', () => {
    expect(vistaPrincipalDe(['DOCENTE'])).toBe('DOCENTE');
  });

  it('con varios roles, gana el de mayor prioridad', () => {
    expect(vistaPrincipalDe(['DOCENTE', 'DIRECTOR_CARRERA'])).toBe('DIRECTOR_CARRERA');
    expect(vistaPrincipalDe(['USUARIO_CONSULTOR', 'COORDINADOR_ACADEMICO'])).toBe(
      'COORDINADOR_ACADEMICO',
    );
  });

  it('ADMIN_SISTEMA gana sobre cualquier combinación', () => {
    expect(
      vistaPrincipalDe(['DOCENTE', 'DIRECTOR_CARRERA', 'COORDINADOR_ACADEMICO', 'ADMIN_SISTEMA']),
    ).toBe('ADMIN_SISTEMA');
  });

  it('un rol desconocido se ignora, no rompe', () => {
    expect(vistaPrincipalDe(['ROL_INVENTADO'])).toBeNull();
    expect(vistaPrincipalDe(['ROL_INVENTADO', 'DOCENTE'])).toBe('DOCENTE');
  });

  it('un array vacío devuelve null', () => {
    expect(vistaPrincipalDe([])).toBeNull();
  });
});
