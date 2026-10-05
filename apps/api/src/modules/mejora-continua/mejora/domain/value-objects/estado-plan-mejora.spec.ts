import { describe, expect, it } from 'vitest';

import {
  ESTADOS_MEJORA,
  describirTransicionMejora,
  intentarTransicionMejora,
  permiteEdicionMejora,
  permiteEliminacionMejora,
  permiteSeguimientoMejora,
  permiteVersionadoMejora,
  transicionesDisponiblesMejora,
} from './estado-plan-mejora.js';

describe('RF-CH-043 — el ciclo propio de Mejora', () => {
  it('tiene tres estados, sin Vigente ni Histórico', () => {
    expect([...ESTADOS_MEJORA]).toEqual(['Borrador', 'En revisión', 'Aprobado']);
  });

  it.each([
    ['Borrador', ['enviar-a-revision']],
    ['En revisión', ['aprobar', 'observar']],
    ['Aprobado', []],
  ] as const)('desde %s se puede: %j', (estado, acciones) => {
    expect(transicionesDisponiblesMejora(estado)).toEqual([...acciones]);
  });

  it('enviar a revisión y aprobar exigen la validación integral; observar no, pero sí comentario', () => {
    expect(describirTransicionMejora('enviar-a-revision')).toMatchObject({
      exigeSinBloqueos: true,
      permiso: 'editar',
    });
    expect(describirTransicionMejora('aprobar')).toMatchObject({
      exigeSinBloqueos: true,
      permiso: 'aprobar',
    });
    expect(describirTransicionMejora('observar')).toMatchObject({
      exigeSinBloqueos: false,
      exigeComentario: true,
      permiso: 'aprobar',
    });
  });

  it('observar devuelve a Borrador', () => {
    expect(
      intentarTransicionMejora('En revisión', 'observar', {
        tieneBloqueos: false,
        comentario: 'Falta la causa raíz',
      }),
    ).toEqual({ ok: true, nuevoEstado: 'Borrador' });
  });

  it('observar sin comentario se rechaza', () => {
    expect(
      intentarTransicionMejora('En revisión', 'observar', {
        tieneBloqueos: false,
        comentario: '  ',
      }),
    ).toEqual({
      ok: false,
      motivo: 'Registra una observación antes de devolver el plan de mejora.',
    });
  });

  it('no hay saltos: aprobar desde Borrador se rechaza con el estado actual en el motivo', () => {
    expect(intentarTransicionMejora('Borrador', 'aprobar', { tieneBloqueos: false })).toEqual({
      ok: false,
      motivo: '"Aprobar" solo aplica desde En revisión; el plan de mejora está en Borrador.',
    });
  });

  it('con bloqueos no se envía a revisión ni se aprueba', () => {
    expect(
      intentarTransicionMejora('Borrador', 'enviar-a-revision', { tieneBloqueos: true }),
    ).toEqual({
      ok: false,
      motivo: 'Hay inconsistencias bloqueantes sin resolver. Corrígelas para continuar.',
    });
  });
});

describe('RF-CH-044 — qué se puede hacer en cada estado', () => {
  it.each([
    ['Borrador', true],
    ['En revisión', false],
    ['Aprobado', false],
  ] as const)('la definición se edita en %s: %s', (estado, esperado) => {
    expect(permiteEdicionMejora(estado)).toBe(esperado);
  });

  it.each([
    ['Borrador', false],
    ['En revisión', false],
    ['Aprobado', true],
  ] as const)('el seguimiento se edita en %s: %s', (estado, esperado) => {
    expect(permiteSeguimientoMejora(estado)).toBe(esperado);
  });

  it.each([
    ['Borrador', true],
    ['En revisión', true],
    ['Aprobado', false],
  ] as const)('se elimina en %s: %s', (estado, esperado) => {
    expect(permiteEliminacionMejora(estado)).toBe(esperado);
  });

  it.each([
    ['Borrador', false],
    ['En revisión', false],
    ['Aprobado', true],
  ] as const)('se versiona en %s: %s', (estado, esperado) => {
    expect(permiteVersionadoMejora(estado)).toBe(esperado);
  });
});
