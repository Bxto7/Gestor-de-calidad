/**
 * El frontend mantiene una copia de la máquina de estados para poder anticipar
 * qué acciones ofrecer sin preguntar al servidor en cada render. La autoridad
 * sigue siendo el backend: aquí solo se decide qué botones se pintan.
 *
 * Estas pruebas son las mismas que las del backend, a propósito. Si las dos
 * copias divergen, una de las dos suites lo dice.
 */

import { describe, expect, it } from 'vitest';

import {
  describirTransicion,
  permiteEdicion,
  permiteEliminacion,
  permiteVersionado,
  transicionesDisponibles,
} from './estado-medicion';

describe('RF-PM-006 — transiciones disponibles por estado', () => {
  it('lista las acciones posibles desde cada estado', () => {
    expect(transicionesDisponibles('Borrador')).toEqual(['enviar-a-revision']);
    expect([...transicionesDisponibles('En revisión')].sort()).toEqual(['aprobar', 'observar']);
    expect(transicionesDisponibles('Aprobado')).toEqual(['marcar-vigente']);
    expect(transicionesDisponibles('Vigente')).toEqual(['archivar']);
    expect(transicionesDisponibles('Histórico')).toEqual([]);
  });

  it('cada transición declara el permiso que exige', () => {
    expect(describirTransicion('aprobar').permiso).toBe('medicion.aprobar');
    expect(describirTransicion('observar').permiso).toBe('medicion.aprobar');
    expect(describirTransicion('marcar-vigente').permiso).toBe('medicion.aprobar');
    expect(describirTransicion('archivar').permiso).toBe('medicion.aprobar');
    // Quien configura el plan es quien lo da por listo; no hay permiso aparte.
    expect(describirTransicion('enviar-a-revision').permiso).toBe('medicion.editar');
  });

  it('RF-PM-037 RN1: observar es la única que exige comentario', () => {
    expect(describirTransicion('observar').exigeComentario).toBe(true);
    expect(describirTransicion('aprobar').exigeComentario).toBe(false);
    expect(describirTransicion('enviar-a-revision').exigeComentario).toBe(false);
  });

  it('cada transición sabe a dónde lleva, para poder anunciarlo', () => {
    expect(describirTransicion('enviar-a-revision').hacia).toBe('En revisión');
    expect(describirTransicion('observar').hacia).toBe('Borrador');
    expect(describirTransicion('archivar').hacia).toBe('Histórico');
  });
});

describe('RF-PM-007 RN1 — la edición libre solo existe en Borrador', () => {
  it('difiere del plan de estudios, que también admite En revisión', () => {
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

describe('RF-PM-030 — desde qué estados se versiona', () => {
  it('lo que ya no se puede editar sí; lo editable no hace falta versionarlo', () => {
    // Las mismas que en el backend, a propósito: si las dos copias divergen,
    // una de las dos suites lo dice.
    expect(permiteVersionado('Aprobado')).toBe(true);
    expect(permiteVersionado('Vigente')).toBe(true);
    expect(permiteVersionado('Histórico')).toBe(true);
    expect(permiteVersionado('Borrador')).toBe(false);
    expect(permiteVersionado('En revisión')).toBe(false);
  });
});
