/**
 * Bloque 6a contra la aplicación entera: planes de Medición y de Evaluación por
 * carrera (RF-CH-033 a RF-CH-039) con el Coordinador (`editor`, carrera E2E) y el
 * Consultor (`lector`, sin carrera).
 *
 * Cada prueba elimina lo que crea —por la pantalla, que es lo que prueba, y en un
 * `finally` por API si falló a medias—: otras suites toman «el plan más reciente»
 * del listado con `.first()`, y un Borrador olvidado sería ese. Se crean planes
 * Indirectos para no desplazar el «Directo más reciente» del que dependen
 * `configuracion-evaluacion` y `documentos-evaluacion`.
 *
 * El bloqueo «tiene planes asociados» no se alcanza por la aplicación (la base
 * de un plan de evaluación tiene que estar Aprobada, y desde ahí ya no se elimina):
 * lo cubren las pruebas de integración. Aquí se prueba el bloqueo por estado.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { cabeceras } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

interface PlanApi {
  id: string;
  codigo: string;
  estado: string;
  carreraId: string;
}

const FANTASMA = '00000000-0000-4000-8000-000000000000';

async function carreraE2E(request: APIRequestContext): Promise<string> {
  const r = await request.get(`${API}/carreras`, { headers: cabeceras(await tokenDe('editor')) });
  expect(r.ok()).toBe(true);
  const carrera = ((await r.json()) as { id: string; codigo: string }[]).find(
    (c) => c.codigo === 'E2E',
  );
  expect(carrera, 'Falta la carrera E2E: `npm run e2e:preparar`.').toBeDefined();
  return carrera!.id;
}

async function listar(
  request: APIRequestContext,
  recurso: 'planes-medicion' | 'planes-evaluacion',
): Promise<PlanApi[]> {
  const r = await request.get(`${API}/${recurso}`, { headers: cabeceras(await tokenDe('editor')) });
  expect(r.ok()).toBe(true);
  return (await r.json()) as PlanApi[];
}

async function borrarSiQueda(
  request: APIRequestContext,
  recurso: 'planes-medicion' | 'planes-evaluacion',
  id: string | undefined,
): Promise<void> {
  if (!id) return;
  await request.delete(`${API}/${recurso}/${id}`, { headers: cabeceras(await tokenDe('editor')) });
}

/** Un plan de evaluación nuevo sobre la base Indirecta Aprobada de la semilla. */
async function evaluacionNueva(request: APIRequestContext): Promise<PlanApi> {
  const h = cabeceras(await tokenDe('editor'));
  const bases = (await (
    await request.get(`${API}/planes-evaluacion/bases-elegibles`, { headers: h })
  ).json()) as PlanApi[];
  const base = bases.find((b) => b.codigo === 'PM-PE-E2E-v1-I-v1');
  expect(base, 'Falta la base Indirecta: `npm run e2e:preparar`.').toBeDefined();
  const r = await request.post(`${API}/planes-evaluacion`, {
    headers: h,
    data: { planMedicionId: base!.id },
  });
  expect(r.ok()).toBe(true);
  return (await r.json()) as PlanApi;
}

test('crear y eliminar un plan de medición sin elegir carrera (RF-CH-033, RF-CH-035)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const previos = new Set((await listar(request, 'planes-medicion')).map((p) => p.id));
  let creado: PlanApi | undefined;
  try {
    await page.goto('/mejora-continua/medicion');
    await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo plan de medición' });
    // RF-CH-033: no hay carrera que elegir.
    await expect(modal.getByLabel(/Carrera/)).toHaveCount(0);
    await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
    await modal.getByLabel('Tipo de medición*').selectOption('INDIRECTA');
    await modal.getByRole('spinbutton', { name: 'Meta (%)*' }).fill('70');
    await modal.getByRole('button', { name: 'Crear' }).click();
    await expect(modal).toBeHidden();

    creado = (await listar(request, 'planes-medicion')).find((p) => !previos.has(p.id));
    expect(creado, 'El plan nuevo no aparece en el listado.').toBeDefined();
    // Quedó en la carrera del usuario, que nadie eligió.
    expect(creado!.carreraId).toBe(e2e);

    const fila = page.getByRole('row').filter({ hasText: creado!.codigo });
    await fila.getByRole('button', { name: `Eliminar ${creado!.codigo}` }).click();
    const confirmar = page.getByRole('dialog', { name: 'Eliminar plan de medición' });
    await confirmar.getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toHaveCount(0);

    const tras = await request.get(`${API}/planes-medicion/${creado!.id}`, {
      headers: cabeceras(await tokenDe('editor')),
    });
    expect(tras.status()).toBe(404);
  } finally {
    await borrarSiQueda(request, 'planes-medicion', creado?.id);
  }
});

test('un plan de evaluación En revisión se elimina desde su detalle (RF-CH-037, RF-CH-039)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const h = cabeceras(await tokenDe('editor'));
  const plan = await evaluacionNueva(request);
  try {
    expect(plan.carreraId).toBe(e2e);
    const envio = await request.post(`${API}/planes-evaluacion/${plan.id}/transiciones`, {
      headers: h,
      data: { accion: 'enviar-a-revision' },
    });
    expect(envio.ok()).toBe(true);

    await page.goto(`/mejora-continua/evaluacion/${plan.id}`);
    await expect(page.getByRole('heading', { name: plan.codigo })).toBeVisible();
    await page.getByRole('button', { name: `Eliminar ${plan.codigo}` }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar plan de evaluación' })
      .getByRole('button', { name: 'Eliminar' })
      .click();

    await expect(page).toHaveURL(/\/mejora-continua\/evaluacion$/);
    expect(
      (await request.get(`${API}/planes-evaluacion/${plan.id}`, { headers: h })).status(),
    ).toBe(404);
  } finally {
    await borrarSiQueda(request, 'planes-evaluacion', plan.id);
  }
});

test('un plan aprobado o posterior no ofrece «Eliminar» y la API responde 409 con su estado', async ({
  page,
  request,
}) => {
  const h = cabeceras(await tokenDe('editor'));
  const cerrado = (await listar(request, 'planes-medicion')).find(
    (p) => p.estado !== 'Borrador' && p.estado !== 'En revisión',
  );
  expect(cerrado, 'Falta un plan cerrado: `npm run e2e:preparar`.').toBeDefined();

  const r = await request.delete(`${API}/planes-medicion/${cerrado!.id}`, { headers: h });
  expect(r.status()).toBe(409);
  expect(((await r.json()) as { message: string }).message).toContain(`está en ${cerrado!.estado}`);

  await page.goto(`/mejora-continua/medicion/${cerrado!.id}`);
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Eliminar ${cerrado!.codigo}` })).toHaveCount(0);
});

test('el Coordinador lista solo planes de su carrera; un plan que no puede ver dice «no encontrado» (RF-CH-034, RF-CH-038)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const h = cabeceras(await tokenDe('editor'));

  for (const recurso of ['planes-medicion', 'planes-evaluacion'] as const) {
    const planes = await listar(request, recurso);
    expect(planes.length).toBeGreaterThan(0);
    expect(planes.every((p) => p.carreraId === e2e)).toBe(true);
    expect((await request.get(`${API}/${recurso}/${FANTASMA}`, { headers: h })).status()).toBe(404);
  }

  // Un `carreraId` en la query no se acepta: el filtro lo impone el servidor.
  const conCarrera = await request.get(`${API}/planes-medicion?carreraId=${FANTASMA}`, {
    headers: h,
  });
  expect(conCarrera.status()).toBe(400);

  await page.goto(`/mejora-continua/medicion/${FANTASMA}`);
  await expect(page.getByText('Plan de medición no encontrado')).toBeVisible();
  await page.goto(`/mejora-continua/evaluacion/${FANTASMA}`);
  await expect(page.getByText('Plan de evaluación no encontrado')).toBeVisible();
});

test.describe('el Consultor', () => {
  test.use({ rol: 'lector' });

  test('lee los planes de medición y de evaluación sin «Nuevo» ni «Eliminar»', async ({ page }) => {
    await page.goto('/mejora-continua/medicion');
    await expect(page.getByRole('link', { name: /^PM-/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo plan de medición' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Eliminar/ })).toHaveCount(0);

    await page.goto('/mejora-continua/evaluacion');
    await expect(page.getByRole('heading', { name: 'Planes de evaluación' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Eliminar/ })).toHaveCount(0);
  });
});
