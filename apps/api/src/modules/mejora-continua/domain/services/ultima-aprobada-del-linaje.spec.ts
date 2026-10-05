import { describe, expect, it } from 'vitest';

import { ultimasAprobadasDelLinaje } from './ultima-aprobada-del-linaje.js';

interface P {
  id: string;
  derivadoDeId: string | null;
  estado: 'Borrador' | 'En revisión' | 'Aprobado';
}

const aprobado = (p: P) => p.estado === 'Aprobado';
const p = (id: string, derivadoDeId: string | null, estado: P['estado']): P => ({
  id,
  derivadoDeId,
  estado,
});
const ids = (ps: readonly P[]) => ps.map((x) => x.id).sort();

describe('RF-CH-043 — la última aprobada del linaje', () => {
  it('una aprobada sin derivadas es la vigente de su linaje', () => {
    expect(ids(ultimasAprobadasDelLinaje([p('v1', null, 'Aprobado')], aprobado))).toEqual(['v1']);
  });

  it('con v1 y v2 aprobadas, solo cuenta v2', () => {
    const linaje = [p('v1', null, 'Aprobado'), p('v2', 'v1', 'Aprobado')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v2']);
  });

  it('una versión derivada que sigue en Borrador no desplaza a la aprobada', () => {
    const linaje = [p('v1', null, 'Aprobado'), p('v2', 'v1', 'Borrador')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v1']);
  });

  it('una cadena de tres aprobadas deja solo la última, aunque lleguen desordenadas', () => {
    const linaje = [
      p('v3', 'v2', 'Aprobado'),
      p('v1', null, 'Aprobado'),
      p('v2', 'v1', 'Aprobado'),
    ];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v3']);
  });

  it('una rama (dos hijos aprobados del mismo origen) deja las dos puntas y no el origen', () => {
    const linaje = [
      p('v1', null, 'Aprobado'),
      p('v2a', 'v1', 'Aprobado'),
      p('v2b', 'v1', 'Aprobado'),
    ];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['v2a', 'v2b']);
  });

  it('un plan sin derivadoDeId es su propio linaje', () => {
    const linaje = [p('a', null, 'Aprobado'), p('b', null, 'Aprobado')];
    expect(ids(ultimasAprobadasDelLinaje(linaje, aprobado))).toEqual(['a', 'b']);
  });

  it('un ancestro que no vino en la lista igual se da por superado y no cuenta', () => {
    expect(ids(ultimasAprobadasDelLinaje([p('v2', 'v1-ausente', 'Aprobado')], aprobado))).toEqual([
      'v2',
    ]);
  });

  it('un ciclo corrupto en derivadoDeId no cuelga la función', () => {
    const linaje = [p('a', 'b', 'Aprobado'), p('b', 'a', 'Aprobado')];
    expect(() => ultimasAprobadasDelLinaje(linaje, aprobado)).not.toThrow();
  });

  it('lista vacía, resultado vacío', () => {
    expect(ultimasAprobadasDelLinaje([], aprobado)).toEqual([]);
  });
});
