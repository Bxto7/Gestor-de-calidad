import { describe, expect, it } from 'vitest';

import {
  ESTADOS_MEJORA,
  describirTransicionMejora,
  permiteEdicionDefinicionMejora,
  permiteEdicionSeguimientoMejora,
  permiteEliminacionMejora,
  permiteVersionadoMejora,
  transicionesDisponiblesMejora,
} from './estado-mejora';

describe('el ciclo propio de Mejora (RF-CH-043, RF-CH-044), copia de la del backend', () => {
  it('tiene tres estados y ninguna acción de vigencia', () => {
    expect([...ESTADOS_MEJORA]).toEqual(['Borrador', 'En revisión', 'Aprobado']);
    expect(transicionesDisponiblesMejora('Aprobado')).toEqual([]);
  });

  it.each([
    ['Borrador', ['enviar-a-revision']],
    ['En revisión', ['aprobar', 'observar']],
  ] as const)('desde %s: %j', (estado, acciones) => {
    expect(transicionesDisponiblesMejora(estado)).toEqual([...acciones]);
  });

  it('observar pide comentario y lo decide `mejora.aprobar`', () => {
    expect(describirTransicionMejora('observar')).toMatchObject({
      exigeComentario: true,
      permiso: 'aprobar',
    });
  });

  it('el seguimiento se edita solo en Aprobado y con `mejora.editar`', () => {
    expect(permiteEdicionSeguimientoMejora('Aprobado', true)).toBe(true);
    expect(permiteEdicionSeguimientoMejora('Aprobado', false)).toBe(false);
    expect(permiteEdicionSeguimientoMejora('Borrador', true)).toBe(false);
    expect(permiteEdicionSeguimientoMejora('En revisión', true)).toBe(false);
  });

  it('la definición se edita solo en Borrador y con `mejora.editar`', () => {
    expect(permiteEdicionDefinicionMejora('Borrador', true)).toBe(true);
    expect(permiteEdicionDefinicionMejora('En revisión', true)).toBe(false);
    expect(permiteEdicionDefinicionMejora('Borrador', false)).toBe(false);
  });

  it('se elimina en Borrador y En revisión; se versiona solo desde Aprobado', () => {
    expect(
      ['Borrador', 'En revisión', 'Aprobado'].map((e) => permiteEliminacionMejora(e as never)),
    ).toEqual([true, true, false]);
    expect(
      ['Borrador', 'En revisión', 'Aprobado'].map((e) => permiteVersionadoMejora(e as never)),
    ).toEqual([false, false, true]);
  });
});
