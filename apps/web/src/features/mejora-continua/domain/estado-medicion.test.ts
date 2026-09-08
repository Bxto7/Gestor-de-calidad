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
  permiteEdicionDefinicionEvaluacion,
  permiteEdicionSeguimientoEvaluacion,
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
    expect(describirTransicion('aprobar').permiso).toBe('aprobar');
    expect(describirTransicion('observar').permiso).toBe('aprobar');
    expect(describirTransicion('marcar-vigente').permiso).toBe('aprobar');
    expect(describirTransicion('archivar').permiso).toBe('aprobar');
    // Quien configura el plan es quien lo da por listo; no hay permiso aparte.
    expect(describirTransicion('enviar-a-revision').permiso).toBe('editar');
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

describe('RF-PE-006 — la definición y el seguimiento de una evaluación exigen permiso', () => {
  // Regresión: `PlanEvaluacionPage` calculaba `editable`/`seguimientoEditable`
  // solo a partir del estado, sin el permiso `evaluacion.editar`. Un docente
  // con solo `evaluacion.leer` veía todos los campos habilitados y solo se
  // enteraba de que no podía guardar al recibir el 403 del backend — trabajo
  // perdido, no un agujero de seguridad, porque el backend ya lo rechazaba
  // igual (`ConfigurarPlanEvaluacion.exigir`). `PlanMedicionPage` ya hacía
  // esta comprobación para su propio permiso; aquí faltaba la mitad.
  describe('permiteEdicionDefinicionEvaluacion', () => {
    it('en Borrador, depende exclusivamente del permiso', () => {
      expect(permiteEdicionDefinicionEvaluacion('Borrador', true)).toBe(true);
      expect(permiteEdicionDefinicionEvaluacion('Borrador', false)).toBe(false);
    });

    it('fuera de Borrador es siempre falso, tenga o no el permiso', () => {
      for (const estado of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
        expect(permiteEdicionDefinicionEvaluacion(estado, true)).toBe(false);
        expect(permiteEdicionDefinicionEvaluacion(estado, false)).toBe(false);
      }
    });
  });

  describe('permiteEdicionSeguimientoEvaluacion', () => {
    it('RN2: también Vigente, no solo Borrador, siempre que haya permiso', () => {
      expect(permiteEdicionSeguimientoEvaluacion('Borrador', true)).toBe(true);
      expect(permiteEdicionSeguimientoEvaluacion('Vigente', true)).toBe(true);
    });

    it('sin el permiso, ni Borrador ni Vigente lo admiten', () => {
      expect(permiteEdicionSeguimientoEvaluacion('Borrador', false)).toBe(false);
      expect(permiteEdicionSeguimientoEvaluacion('Vigente', false)).toBe(false);
    });

    it('Aprobado e Histórico quedan fuera aunque haya permiso', () => {
      expect(permiteEdicionSeguimientoEvaluacion('Aprobado', true)).toBe(false);
      expect(permiteEdicionSeguimientoEvaluacion('Histórico', true)).toBe(false);
    });
  });
});
