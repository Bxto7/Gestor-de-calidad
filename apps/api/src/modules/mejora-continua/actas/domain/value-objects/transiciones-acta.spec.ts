/**
 * Pruebas de la máquina de transición del acta de aprobación (RF-AC-013 a 016).
 *
 * Solo tres transiciones: hasta Aprobada. Emitida/Histórica se diseñan junto
 * con la exportación (RF-AC-018/019) — ver diseño de 2c-AC-C.
 */

import { describe, expect, it } from 'vitest';

import {
  describirTransicion,
  intentarTransicion,
  transicionesDisponibles,
} from './transiciones-acta.js';

describe('RF-AC-013 — transiciones válidas', () => {
  const sin = { tieneBloqueos: false };

  it('recorre el camino hasta Aprobada', () => {
    expect(intentarTransicion('Borrador', 'enviar-a-revision', sin)).toEqual({
      ok: true,
      nuevoEstado: 'En revisión',
    });
    expect(intentarTransicion('En revisión', 'aprobar', sin)).toEqual({
      ok: true,
      nuevoEstado: 'Aprobada',
    });
  });

  it('RF-AC-015 RN1: rechazar exige comentario y devuelve a Borrador', () => {
    const sinComentario = intentarTransicion('En revisión', 'rechazar', sin);
    expect(sinComentario.ok).toBe(false);

    const enBlanco = intentarTransicion('En revisión', 'rechazar', {
      tieneBloqueos: false,
      comentario: '   ',
    });
    expect(enBlanco.ok).toBe(false);

    expect(
      intentarTransicion('En revisión', 'rechazar', {
        tieneBloqueos: false,
        comentario: 'Falta el lugar de emisión.',
      }),
    ).toEqual({ ok: true, nuevoEstado: 'Borrador' });
  });

  it('RN1: no se permiten saltos fuera de la secuencia', () => {
    const r = intentarTransicion('Borrador', 'aprobar', sin);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('En revisión');
  });

  it('desde Aprobada no queda ninguna transición de este ciclo', () => {
    expect(transicionesDisponibles('Aprobada')).toEqual([]);
  });

  it('RF-AC-016: enviar a revisión y aprobar exigen que no haya bloqueos', () => {
    expect(intentarTransicion('Borrador', 'enviar-a-revision', { tieneBloqueos: true }).ok).toBe(
      false,
    );
    expect(intentarTransicion('En revisión', 'aprobar', { tieneBloqueos: true }).ok).toBe(false);
  });

  it('rechazar no exige completitud', () => {
    // Devolver un acta con problemas es justamente lo que se hace cuando los
    // tiene; exigir que esté limpia para rechazarla sería contradictorio.
    expect(
      intentarTransicion('En revisión', 'rechazar', {
        tieneBloqueos: true,
        comentario: 'Corrige la cabecera.',
      }).ok,
    ).toBe(true);
  });

  it('cada transición declara el permiso que exige', () => {
    expect(describirTransicion('enviar-a-revision').permiso).toBe('editar');
    expect(describirTransicion('aprobar').permiso).toBe('aprobar');
    expect(describirTransicion('rechazar').permiso).toBe('aprobar');
  });

  it('lista las acciones posibles desde cada estado', () => {
    expect(transicionesDisponibles('Borrador')).toEqual(['enviar-a-revision']);
    expect([...transicionesDisponibles('En revisión')].sort()).toEqual(['aprobar', 'rechazar']);
    expect(transicionesDisponibles('Emitida')).toEqual([]);
    expect(transicionesDisponibles('Histórica')).toEqual([]);
  });
});
