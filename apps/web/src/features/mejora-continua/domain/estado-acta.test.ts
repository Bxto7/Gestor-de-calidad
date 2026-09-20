/**
 * Copia cliente de la máquina de estados del acta (RF-AC-013 a 016). El
 * backend es la autoridad — ver `transiciones-acta.ts` del backend, cuyas
 * pruebas son las mismas a propósito: si las dos copias divergen, una de
 * las dos suites lo dice.
 */

import { describe, expect, it } from 'vitest';

import {
  describirTransicion,
  permiteEdicion,
  transicionesDisponibles,
} from './estado-acta';

describe('RF-AC-013 — transiciones disponibles por estado', () => {
  it('lista las acciones posibles desde cada estado', () => {
    expect(transicionesDisponibles('Borrador')).toEqual(['enviar-a-revision']);
    expect([...transicionesDisponibles('En revisión')].sort()).toEqual(['aprobar', 'rechazar']);
    expect(transicionesDisponibles('Aprobada')).toEqual([]);
    expect(transicionesDisponibles('Emitida')).toEqual([]);
    expect(transicionesDisponibles('Histórica')).toEqual([]);
  });

  it('cada transición declara el permiso que exige', () => {
    expect(describirTransicion('enviar-a-revision').permiso).toBe('editar');
    expect(describirTransicion('aprobar').permiso).toBe('aprobar');
    expect(describirTransicion('rechazar').permiso).toBe('aprobar');
  });

  it('RF-AC-015 RN1: rechazar es la única que exige comentario', () => {
    expect(describirTransicion('rechazar').exigeComentario).toBe(true);
    expect(describirTransicion('aprobar').exigeComentario).toBe(false);
    expect(describirTransicion('enviar-a-revision').exigeComentario).toBe(false);
  });

  it('cada transición sabe a dónde lleva', () => {
    expect(describirTransicion('enviar-a-revision').hacia).toBe('En revisión');
    expect(describirTransicion('aprobar').hacia).toBe('Aprobada');
    expect(describirTransicion('rechazar').hacia).toBe('Borrador');
  });
});

describe('RF-AC-017 RN1 — la edición libre solo existe en Borrador', () => {
  it('cualquier otro estado la impide', () => {
    expect(permiteEdicion('Borrador')).toBe(true);
    for (const e of ['En revisión', 'Aprobada', 'Emitida', 'Histórica'] as const) {
      expect(permiteEdicion(e)).toBe(false);
    }
  });
});
