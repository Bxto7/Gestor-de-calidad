import { describe, expect, it } from 'vitest';

import { siguienteCodigoMejora } from './codigo-mejora.js';

describe('RF-PJ-003 — el código único del plan de mejora', () => {
  it('el primero de un ámbito vacío es 1', () => {
    expect(siguienteCodigoMejora('PJ-CRI-001-', [])).toBe('PJ-CRI-001-1');
  });

  it('sigue al mayor correlativo usado, no a la cantidad', () => {
    // Si se eliminó el 2, reutilizar su número haría que dos planes distintos
    // compartieran código en la bitácora.
    const yaUsados = ['PJ-CRI-001-1', 'PJ-CRI-001-3'];
    expect(siguienteCodigoMejora('PJ-CRI-001-', yaUsados)).toBe('PJ-CRI-001-4');
  });

  it('ignora códigos de otro ámbito, aunque compartan parte del texto', () => {
    const yaUsados = ['PJ-CRI-001-1', 'PJ-CRI-001-2', 'PJ-CRI-010-1'];
    expect(siguienteCodigoMejora('PJ-CRI-001-', yaUsados)).toBe('PJ-CRI-001-3');
  });

  it('RN1: el código no se compone a partir de un prefijo genérico ajeno', () => {
    // La función recibe el prefijo ya armado por quien la llama —no lo
    // construye ella misma a partir de tipo/aspecto—: un prefijo que llegara
    // de fuera sin control es cómo se acaba generando un código en el ámbito
    // equivocado.
    const yaUsados = ['PJ-OBJ-002-1'];
    expect(siguienteCodigoMejora('PJ-CRI-001-', yaUsados)).toBe('PJ-CRI-001-1');
  });
});
