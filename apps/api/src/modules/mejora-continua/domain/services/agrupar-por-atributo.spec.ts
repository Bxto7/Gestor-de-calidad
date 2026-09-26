import { describe, expect, it } from 'vitest';

import { competenciasSinAtributo, type CompetenciaAgrupable } from './agrupar-por-atributo.js';

const ATRIBUTO = { id: 'a1', codigo: 'AG-I01', nombre: 'Uno' };

function competencia(id: string, conAtributo: boolean): CompetenciaAgrupable {
  return {
    id,
    codigo: `CPE-${id}`,
    nombre: `Competencia ${id}`,
    atributos: conAtributo ? [ATRIBUTO] : [],
  };
}

describe('RF127 — competenciasSinAtributo', () => {
  it('devuelve solo las pedidas que no tienen ningún atributo', () => {
    const todas = [competencia('1', true), competencia('2', false), competencia('3', false)];

    expect(competenciasSinAtributo(todas, ['1', '2']).map((c) => c.id)).toEqual(['2']);
  });

  it('una competencia sin atributo que no se pidió no cuenta', () => {
    const todas = [competencia('1', true), competencia('2', false)];

    expect(competenciasSinAtributo(todas, ['1'])).toEqual([]);
  });

  it('con dos atributos sigue siendo válida: basta con tener uno', () => {
    const doble: CompetenciaAgrupable = {
      ...competencia('1', true),
      atributos: [ATRIBUTO, { id: 'a2', codigo: 'AG-I02', nombre: 'Dos' }],
    };

    expect(competenciasSinAtributo([doble], ['1'])).toEqual([]);
  });

  it('respeta el orden del plan de estudios, no el de la petición', () => {
    const todas = [competencia('1', false), competencia('2', false), competencia('3', false)];

    expect(competenciasSinAtributo(todas, ['3', '1']).map((c) => c.id)).toEqual(['1', '3']);
  });

  it('sin nada pedido no hay nada que rechazar', () => {
    expect(competenciasSinAtributo([competencia('1', false)], [])).toEqual([]);
  });

  it('un identificador que no está en el plan lo ignora: de eso se ocupa otra regla', () => {
    expect(competenciasSinAtributo([competencia('1', true)], ['ajena'])).toEqual([]);
  });
});
