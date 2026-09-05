/**
 * Pruebas de la máquina de estados del plan de medición.
 *
 * El caso que justifica que esta máquina sea propia y no la del Plan de
 * Estudios está abajo, en RF-PM-007: aquí la edición libre existe solo en
 * Borrador, mientras que allí también se puede editar En revisión. Comparten
 * los cinco nombres y no las reglas.
 */

import { describe, expect, it } from 'vitest';

import {
  ESTADOS_MEDICION,
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
  transicionesDisponibles,
} from './estado-plan.js';

describe('RF-PM-005 — los cinco estados', () => {
  it('declara la secuencia del ciclo de vida', () => {
    expect(ESTADOS_MEDICION).toEqual([
      'Borrador',
      'En revisión',
      'Aprobado',
      'Vigente',
      'Histórico',
    ]);
  });
});

describe('RF-PM-006 — transiciones válidas', () => {
  const sin = { tieneBloqueos: false };

  it('recorre el camino completo', () => {
    expect(intentarTransicion('Borrador', 'enviar-a-revision', sin)).toEqual({
      ok: true,
      nuevoEstado: 'En revisión',
    });
    expect(intentarTransicion('En revisión', 'aprobar', sin)).toEqual({
      ok: true,
      nuevoEstado: 'Aprobado',
    });
    expect(intentarTransicion('Aprobado', 'marcar-vigente', sin)).toEqual({
      ok: true,
      nuevoEstado: 'Vigente',
    });
    expect(intentarTransicion('Vigente', 'archivar', sin)).toEqual({
      ok: true,
      nuevoEstado: 'Histórico',
    });
  });

  it('RF-PM-037 RN1: observar exige comentario y devuelve a Borrador', () => {
    const sinComentario = intentarTransicion('En revisión', 'observar', sin);
    expect(sinComentario.ok).toBe(false);

    const enBlanco = intentarTransicion('En revisión', 'observar', {
      tieneBloqueos: false,
      comentario: '   ',
    });
    expect(enBlanco.ok).toBe(false);

    expect(
      intentarTransicion('En revisión', 'observar', {
        tieneBloqueos: false,
        comentario: 'Faltan periodos por programar.',
      }),
    ).toEqual({ ok: true, nuevoEstado: 'Borrador' });
  });

  it('RN1: no se permiten saltos fuera de la secuencia', () => {
    const r = intentarTransicion('Borrador', 'aprobar', sin);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('En revisión');
  });

  it('desde Histórico no queda ninguna transición', () => {
    expect(transicionesDisponibles('Histórico')).toEqual([]);
  });

  it('RF-PM-038: enviar a revisión y aprobar exigen que no haya bloqueos', () => {
    expect(intentarTransicion('Borrador', 'enviar-a-revision', { tieneBloqueos: true }).ok).toBe(
      false,
    );
    expect(intentarTransicion('En revisión', 'aprobar', { tieneBloqueos: true }).ok).toBe(false);
  });

  it('observar y archivar no exigen consistencia', () => {
    // Devolver un plan con problemas es justamente lo que se hace cuando los
    // tiene; exigir que esté limpio para observarlo sería contradictorio.
    expect(
      intentarTransicion('En revisión', 'observar', {
        tieneBloqueos: true,
        comentario: 'Corrige la programación.',
      }).ok,
    ).toBe(true);
    expect(intentarTransicion('Vigente', 'archivar', { tieneBloqueos: true }).ok).toBe(true);
  });

  it('cada transición declara el permiso que exige', () => {
    expect(describirTransicion('aprobar').permiso).toBe('aprobar');
    expect(describirTransicion('observar').permiso).toBe('aprobar');
    expect(describirTransicion('marcar-vigente').permiso).toBe('aprobar');
    expect(describirTransicion('archivar').permiso).toBe('aprobar');
    // Quien configura el plan es quien lo da por listo; no hay permiso aparte.
    expect(describirTransicion('enviar-a-revision').permiso).toBe('editar');
  });

  it('lista las acciones posibles desde cada estado', () => {
    expect(transicionesDisponibles('Borrador')).toEqual(['enviar-a-revision']);
    expect([...transicionesDisponibles('En revisión')].sort()).toEqual(['aprobar', 'observar']);
    expect(transicionesDisponibles('Aprobado')).toEqual(['marcar-vigente']);
    expect(transicionesDisponibles('Vigente')).toEqual(['archivar']);
  });
});

describe('el permiso es un sufijo, no un permiso entero', () => {
  it('no trae módulo: lo pone quien lo consume', () => {
    // La misma máquina la usan Planes de Medición y Planes de Evaluación. Si
    // aquí volviera a escribirse `medicion.aprobar`, aprobar un plan de
    // evaluación exigiría el permiso del submódulo equivocado — y quien tuviera
    // `medicion.aprobar` podría aprobar evaluaciones sin `evaluacion.aprobar`.
    for (const accion of [
      'enviar-a-revision',
      'aprobar',
      'observar',
      'marcar-vigente',
      'archivar',
    ] as const) {
      expect(describirTransicion(accion).permiso).not.toContain('.');
    }
  });

  it('enviar a revisión lo puede quien edita; el resto, quien aprueba', () => {
    expect(describirTransicion('enviar-a-revision').permiso).toBe('editar');
    expect(describirTransicion('aprobar').permiso).toBe('aprobar');
    expect(describirTransicion('observar').permiso).toBe('aprobar');
    expect(describirTransicion('marcar-vigente').permiso).toBe('aprobar');
    expect(describirTransicion('archivar').permiso).toBe('aprobar');
  });
});

describe('RF-PM-007 RN1 — la edición libre solo existe en Borrador', () => {
  it('difiere del Plan de Estudios, que también admite En revisión', () => {
    expect(permiteEdicion('Borrador')).toBe(true);
    expect(permiteEdicion('En revisión')).toBe(false);
    expect(permiteEdicion('Aprobado')).toBe(false);
    expect(permiteEdicion('Vigente')).toBe(false);
    expect(permiteEdicion('Histórico')).toBe(false);
  });
});

describe('RF-PM-009 — solo un Borrador puede eliminarse', () => {
  it('cualquier otro estado lo impide', () => {
    expect(permiteEliminacion('Borrador')).toBe(true);
    for (const e of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
      expect(permiteEliminacion(e)).toBe(false);
    }
  });
});
