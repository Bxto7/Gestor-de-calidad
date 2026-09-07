/**
 * Las claves de React Query de los listados filtrados.
 *
 * Si la clave no cambia cuando cambia el filtro, `useQuery` no vuelve a
 * consultar: el usuario mueve el selector y la lista se queda igual, sin
 * ningún error visible que lo delate. Estas pruebas no ejercitan el hook (eso
 * exigiría montar React Query completo) — afirman lo mínimo que hace fallar
 * ese síntoma: que dos filtros distintos por cualquier campo que la pantalla
 * envía producen claves distintas. Si alguien vuelve a omitir un campo al
 * construir la clave, la prueba correspondiente se pone roja.
 */

import { describe, expect, it } from 'vitest';

import { claves, clavesEval } from './queries';

describe('claves.planes — Planes de Medición', () => {
  it('cambia con el tipo, aunque el resto del filtro sea igual', () => {
    const directa = claves.planes({ tipo: 'DIRECTA' });
    const indirecta = claves.planes({ tipo: 'INDIRECTA' });

    expect(directa).not.toEqual(indirecta);
  });

  it('cambia con el texto, aunque el resto del filtro sea igual', () => {
    const sinTexto = claves.planes({ texto: '' });
    const conTexto = claves.planes({ texto: 'ingeniería' });

    expect(sinTexto).not.toEqual(conTexto);
  });
});

describe('clavesEval.lista — Planes de Evaluación', () => {
  it('cambia con el tipo, aunque el resto del filtro sea igual', () => {
    const directa = clavesEval.lista({ tipo: 'DIRECTA' });
    const indirecta = clavesEval.lista({ tipo: 'INDIRECTA' });

    expect(directa).not.toEqual(indirecta);
  });

  it('cambia con el texto, aunque el resto del filtro sea igual', () => {
    const sinTexto = clavesEval.lista({ texto: '' });
    const conTexto = clavesEval.lista({ texto: 'ingeniería' });

    expect(sinTexto).not.toEqual(conTexto);
  });
});
