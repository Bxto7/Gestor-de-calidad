import { describe, expect, it } from 'vitest';

import { PlanesController } from './planes.controller.js';

describe('PlanesController — Bloque 4b', () => {
  it('ya no expone PUT /planes/:id/asociaciones: objetivos y competencias se crean y quitan dentro del plan', () => {
    // Reemplazaba el conjunto entero sin comprobar la carrera de cada elemento
    // ni si alguna asignatura los usaba (§3.9 de la especificación).
    expect(Object.getOwnPropertyNames(PlanesController.prototype)).not.toContain('asociar');
  });
});
