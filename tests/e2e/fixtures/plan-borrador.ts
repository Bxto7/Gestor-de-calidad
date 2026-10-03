/**
 * Un Borrador del plan E2E, para las pruebas que escriben en Plan de Estudios.
 *
 * El plan E2E está Vigente y no admite cambios, así que se trabaja sobre una
 * versión nueva que la propia prueba genera y **borra al terminar**, pase lo
 * que pase: otras suites toman «el primer plan PE-E2E» del listado, y un
 * Borrador olvidado podría ser ese. Si una corrida anterior se interrumpió y
 * dejó uno, se borra antes de empezar (RF075 impide generar otra versión
 * mientras exista). Desde el Bloque 4b la versión nueva trae las competencias
 * del Vigente (RF-CH-017).
 */

import { expect, type APIRequestContext } from '@playwright/test';

import { API } from '../global-setup';
import { tokenDe } from './api';

export function cabeceras(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

export interface PlanResumen {
  id: string;
  codigo: string;
  estado: string;
}

/** Borra cualquier Borrador del plan E2E y genera uno limpio desde el Vigente. */
export async function borradorNuevo(request: APIRequestContext): Promise<string> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/planes`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  const planes = ((await respuesta.json()) as PlanResumen[]).filter((p) =>
    p.codigo.startsWith('PE-E2E'),
  );

  for (const viejo of planes.filter((p) => p.estado === 'Borrador')) {
    const borrado = await request.delete(`${API}/planes/${viejo.id}`, { headers: h });
    expect(borrado.ok()).toBe(true);
  }

  const vigente = planes.find((p) => p.estado === 'Vigente');
  expect(
    vigente,
    'No hay plan de estudios E2E Vigente: falta `npm run e2e:preparar`.',
  ).toBeDefined();

  const creado = await request.post(`${API}/planes/${vigente!.id}/versiones`, { headers: h });
  expect(creado.ok()).toBe(true);
  return ((await creado.json()) as { id: string }).id;
}

export async function borrarPlan(request: APIRequestContext, planId: string): Promise<void> {
  const h = cabeceras(await tokenDe('director'));
  await request.delete(`${API}/planes/${planId}`, { headers: h });
}

/** El id de una competencia sembrada, buscada como la ve el Director. */
export async function idDeCompetencia(request: APIRequestContext, codigo: string): Promise<string> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/competencias`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  const competencia = ((await respuesta.json()) as { id: string; codigo: string }[]).find(
    (c) => c.codigo === codigo,
  );
  expect(competencia, `No existe ${codigo}: falta \`npm run e2e:preparar\`.`).toBeDefined();
  return competencia!.id;
}
