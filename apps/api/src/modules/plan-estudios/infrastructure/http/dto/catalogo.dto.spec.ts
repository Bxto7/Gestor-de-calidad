import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CoberturaDto, CrearCompetenciaDto, FiltroCatalogoDto } from './catalogo.dto.js';

async function errores<T extends object>(clase: new () => T, datos: object): Promise<string[]> {
  const fallos = await validate(plainToInstance(clase, datos));
  return fallos.flatMap((f) => Object.values(f.constraints ?? {}));
}

const PLAN = '3f1c2b9a-7d4e-4c1a-9b2f-1e2d3c4b5a69';

describe('CrearCompetenciaDto (RF-CH-017)', () => {
  it('acepta nombre, atributos y plan', async () => {
    expect(
      await errores(CrearCompetenciaDto, { nombre: 'Resolver problemas', planId: PLAN }),
    ).toEqual([]);
  });

  it('exige el plan', async () => {
    expect(await errores(CrearCompetenciaDto, { nombre: 'Resolver problemas' })).toEqual([
      'La competencia se crea dentro de un plan: falta su identificador.',
    ]);
  });
});

describe('FiltroCatalogoDto y CoberturaDto', () => {
  it('admiten un planId opcional', async () => {
    expect(await errores(FiltroCatalogoDto, { planId: PLAN })).toEqual([]);
    expect(await errores(CoberturaDto, {})).toEqual([]);
  });

  it('rechazan un planId que no es UUID', async () => {
    expect(await errores(FiltroCatalogoDto, { planId: 'p1' })).toHaveLength(1);
    expect(await errores(CoberturaDto, { planId: 'p1' })).toHaveLength(1);
  });
});
