import { describe, expect, it } from 'vitest';

import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import {
  ESTADOS_IMPLEMENTACION,
  esEstadoImplementacionValido,
  permiteActualizarSeguimiento,
} from './estado-implementacion.js';

describe('RF-PJ-014 RN1 — el estado de implementación es un enum fijo', () => {
  it('tiene exactamente los tres valores del diseño, en ese orden', () => {
    expect(ESTADOS_IMPLEMENTACION).toEqual(['Pendiente', 'En proceso', 'Completado']);
  });

  it.each(['Pendiente', 'En proceso', 'Completado'] as const)('%s es válido', (valor) => {
    expect(esEstadoImplementacionValido(valor)).toBe(true);
  });

  it('un valor fuera del enum no es válido — no es texto libre', () => {
    expect(esEstadoImplementacionValido('En pausa')).toBe(false);
    expect(esEstadoImplementacionValido('')).toBe(false);
  });
});

describe('§2b del diseño — el guardián de los campos de seguimiento', () => {
  // La asimetría deliberada: la RN de RF-PJ-006 solo exceptúa "Vigente", así
  // que En revisión y Aprobado también bloquean el seguimiento, no solo la
  // definición.
  it.each([
    ['Borrador', true],
    ['En revisión', false],
    ['Aprobado', false],
    ['Vigente', true],
    ['Histórico', false],
  ] satisfies [EstadoMedicion, boolean][])(
    'en %s, permiteActualizarSeguimiento = %s',
    (estado, esperado) => {
      expect(permiteActualizarSeguimiento(estado)).toBe(esperado);
    },
  );
});
