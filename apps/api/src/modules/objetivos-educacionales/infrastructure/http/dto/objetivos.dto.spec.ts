import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CrearObjetivoDto, FiltroObjetivoDto } from './objetivos.dto.js';

async function errores<T extends object>(clase: new () => T, datos: object): Promise<string[]> {
  const fallos = await validate(plainToInstance(clase, datos));
  return fallos.flatMap((f) => Object.values(f.constraints ?? {}));
}

const PLAN = '3f1c2b9a-7d4e-4c1a-9b2f-1e2d3c4b5a69';
const VALIDO = { nombre: 'Formar profesionales', descripcion: 'Descripción suficiente.' };

describe('CrearObjetivoDto (RF-CH-015)', () => {
  it('acepta nombre, descripción y plan', async () => {
    expect(await errores(CrearObjetivoDto, { ...VALIDO, planId: PLAN })).toEqual([]);
  });

  it('exige el plan', async () => {
    expect(await errores(CrearObjetivoDto, VALIDO)).toEqual([
      'El objetivo se crea dentro de un plan: falta su identificador.',
    ]);
  });
});

describe('FiltroObjetivoDto', () => {
  it('admite un planId opcional y rechaza uno que no es UUID', async () => {
    expect(await errores(FiltroObjetivoDto, { planId: PLAN })).toEqual([]);
    expect(await errores(FiltroObjetivoDto, { planId: 'p1' })).toHaveLength(1);
  });
});
