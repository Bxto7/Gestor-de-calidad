/**
 * Pruebas de la consulta de sesión.
 *
 * Poco código, pero es el que decide qué botones ve cada rol. Lo que se fija
 * aquí es que no invente ni omita: la interfaz confía en esta respuesta para
 * ofrecer solo lo que el backend va a permitir.
 */

import { describe, expect, it } from 'vitest';

import type { AuthorizationPort } from '../ports/authorization.port.js';
import { ConsultarSesion } from './consultar-sesion.use-case.js';

function montar(permisos: string[], carreraACargo: string | null = null) {
  const consultas: string[] = [];

  const autorizacion: AuthorizationPort = {
    puede: async () => ({ permitido: true }),
    permisosDe: async (usuarioId) => {
      consultas.push(usuarioId);
      return new Set(permisos);
    },
    carreraACargoDe: async () => carreraACargo,
  };

  return { caso: new ConsultarSesion(autorizacion), consultas };
}

describe('Identidad y permisos', () => {
  it('devuelve el identificador y el nombre que vienen del token', async () => {
    // No se releen de la base: el token ya los trae verificados y volver a
    // consultarlos sería una petición de más en cada arranque.
    const { caso } = montar([]);
    const sesion = await caso.ejecutar('u-1', 'Directora de Sistemas');

    expect(sesion.id).toBe('u-1');
    expect(sesion.nombre).toBe('Directora de Sistemas');
  });

  it('los permisos se piden para ese usuario, no para otro', async () => {
    const { caso, consultas } = montar(['plan.leer']);
    await caso.ejecutar('u-7', 'Alguien');
    expect(consultas).toEqual(['u-7']);
  });

  it('devuelve los permisos ordenados', async () => {
    // Estable entre llamadas: facilita comparar y cachear en el cliente.
    const { caso } = montar(['plan.leer', 'asignatura.gestionar', 'facultad.crear']);
    const sesion = await caso.ejecutar('u-1', 'Alguien');

    expect(sesion.permisos).toEqual(['asignatura.gestionar', 'facultad.crear', 'plan.leer']);
  });

  it('un usuario sin permisos devuelve lista vacía, no null', async () => {
    // La interfaz hace `permisos.includes(...)`: un null la rompería en vez de
    // limitarse a no mostrar nada.
    const { caso } = montar([]);
    expect((await caso.ejecutar('u-1', 'Alguien')).permisos).toEqual([]);
  });

  it('incluye la carrera que dirige cuando el rol está acotado a una', async () => {
    const { caso } = montar(['plan.aprobar'], 'car-isi');
    expect((await caso.ejecutar('u-1', 'Directora')).carreraACargo).toBe('car-isi');
  });

  it('null cuando no dirige ninguna', async () => {
    // Distinto de "las dirige todas": quien no tiene carrera asignada no manda
    // en ninguna, y la interfaz debe tratarlo así.
    const { caso } = montar(['facultad.crear']);
    expect((await caso.ejecutar('u-1', 'Administrador')).carreraACargo).toBeNull();
  });
});
