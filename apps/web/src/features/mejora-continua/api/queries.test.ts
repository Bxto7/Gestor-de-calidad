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

import { claves, clavesEval, clavesMejora } from './queries';

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

describe('clavesMejora.lista — Planes de Mejora', () => {
  it('cambia con la carrera', () => {
    const a = clavesMejora.lista({ carreraId: 'carrera-a' });
    const b = clavesMejora.lista({ carreraId: 'carrera-b' });

    expect(a).not.toEqual(b);
  });

  it('clavesMejora.lista distingue por filtro, como clavesEval', () => {
    const sinFiltro = clavesMejora.lista({ carreraId: 'c1' });
    const conTexto = clavesMejora.lista({ carreraId: 'c1', texto: 'renovar' });

    expect(sinFiltro).not.toEqual(conTexto);
  });
});

describe('clavesMejora.plan — jerarquía con versiones y documentos', () => {
  it('es prefijo de versiones y documentos, para que invalidar el plan las alcance también', () => {
    // Regresión: `plan` solía ser `['mejora', 'plan', id]`, una rama hermana
    // de `['mejora', id, 'versiones']`/`['mejora', id, 'documentos']` — no un
    // prefijo. `invalidateQueries({ queryKey: clavesMejora.plan(id) })` nunca
    // llegaba a esas dos, así que editar el plan dejaba las pestañas de
    // Versiones/Documentos con datos viejos. Ver `useMutacionDePlanMejora`.
    const id = 'plan-1';
    const plan = clavesMejora.plan(id);
    const versiones = clavesMejora.versiones(id);
    const documentos = clavesMejora.documentos(id);

    expect(versiones.slice(0, plan.length)).toEqual(plan);
    expect(documentos.slice(0, plan.length)).toEqual(plan);
  });
});
