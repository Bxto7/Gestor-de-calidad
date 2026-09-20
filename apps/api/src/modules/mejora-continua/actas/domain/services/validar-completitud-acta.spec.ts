/**
 * Pruebas de la validación integral de completitud del acta (RF-AC-016).
 */

import { describe, expect, it } from 'vitest';

import { validarCompletitudActa } from './validar-completitud-acta.js';

function datosCompletos() {
  return {
    convocadaPor: 'Dirección de Escuela',
    fechaReunion: new Date('2026-09-10'),
    lugarReunion: 'Sala de reuniones 301',
    lugarEmision: 'Huancayo',
    fechaEmision: new Date('2026-09-15'),
    asistentes: [{ id: '1' }],
    acciones: [{ incluida: true }],
  };
}

describe('RF-AC-016 — validación integral de completitud', () => {
  it('sin bloqueos cuando todo está completo', () => {
    expect(validarCompletitudActa(datosCompletos())).toEqual({
      tieneBloqueos: false,
      motivos: [],
    });
  });

  it('bloquea si la cabecera no se completó (RF-AC-003/004/006)', () => {
    const r1 = validarCompletitudActa({ ...datosCompletos(), convocadaPor: '' });
    expect(r1.tieneBloqueos).toBe(true);

    const r2 = validarCompletitudActa({ ...datosCompletos(), lugarReunion: '   ' });
    expect(r2.tieneBloqueos).toBe(true);

    const r3 = validarCompletitudActa({ ...datosCompletos(), fechaReunion: new Date(0) });
    expect(r3.tieneBloqueos).toBe(true);
  });

  it('bloquea sin asistentes registrados (RF-AC-005)', () => {
    const r = validarCompletitudActa({ ...datosCompletos(), asistentes: [] });
    expect(r.tieneBloqueos).toBe(true);
  });

  it('bloquea sin ninguna acción de mejora incluida (RF-AC-008)', () => {
    const r = validarCompletitudActa({
      ...datosCompletos(),
      acciones: [{ incluida: false }],
    });
    expect(r.tieneBloqueos).toBe(true);
  });

  it('bloquea sin lugar o fecha de emisión definidos', () => {
    const sinLugar = validarCompletitudActa({ ...datosCompletos(), lugarEmision: null });
    expect(sinLugar.tieneBloqueos).toBe(true);

    const sinFecha = validarCompletitudActa({ ...datosCompletos(), fechaEmision: null });
    expect(sinFecha.tieneBloqueos).toBe(true);
  });

  it('acumula todos los motivos a la vez, no se detiene en el primero', () => {
    const r = validarCompletitudActa({
      convocadaPor: '',
      fechaReunion: new Date(0),
      lugarReunion: '',
      lugarEmision: null,
      fechaEmision: null,
      asistentes: [],
      acciones: [],
    });
    expect(r.tieneBloqueos).toBe(true);
    expect(r.motivos.length).toBeGreaterThan(1);
  });
});
