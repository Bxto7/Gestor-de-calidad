/**
 * «Facultades» para el Administrador (RF-CH-007 y 008) y alcance de lectura del
 * Director (RF-CH-009), contra la API real.
 *
 * El alcance se prueba con una segunda carrera que el Administrador crea por API:
 * la base de esta suite solo trae la carrera E2E. No hay endpoint para borrar
 * carreras (solo inactivarlas), así que cada corrida deja una carrera y una
 * facultad con nombre único; es el precio de probar «una carrera que no es la
 * tuya» sin depender de datos sembrados aparte.
 *
 * El nombre empieza por «Zz» a propósito: los selectores de carrera de las demás
 * pantallas preseleccionan la primera por orden alfabético, y las demás specs
 * esperan que sea la carrera E2E. Una carrera ajena que ordenara antes les
 * quitaría el botón «Nuevo plan de mejora» y compañía.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

function cabeceras(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

/** Una carrera ajena a la del Director, creada por el Administrador. */
async function crearCarreraAjena(request: APIRequestContext): Promise<string> {
  const h = cabeceras(await tokenDe('admin'));
  const sufijo = Date.now().toString().slice(-7);

  const facultad = await request.post(`${API}/facultades`, {
    headers: h,
    data: { nombre: `Facultad ajena ${sufijo}` },
  });
  expect(facultad.ok()).toBe(true);
  const { id: facultadId } = (await facultad.json()) as { id: string };

  const carrera = await request.post(`${API}/facultades/${facultadId}/carreras`, {
    headers: h,
    data: {
      nombre: `Zz carrera ajena ${sufijo}`,
      codigo: `AJ${sufijo.slice(-6)}`,
      duracionAnios: 5,
    },
  });
  expect(carrera.ok()).toBe(true);
  return ((await carrera.json()) as { id: string }).id;
}

async function idDelPlanE2E(request: APIRequestContext): Promise<string> {
  const respuesta = await request.get(`${API}/planes`, {
    headers: cabeceras(await tokenDe('director')),
  });
  expect(respuesta.ok()).toBe(true);
  const plan = ((await respuesta.json()) as { id: string; codigo: string }[]).find((p) =>
    p.codigo.startsWith('PE-E2E'),
  );
  expect(plan, 'No hay plan de estudios E2E: falta `npm run e2e:preparar`.').toBeDefined();
  return plan!.id;
}

test.describe('el Director solo lee su carrera (API)', () => {
  test('GET /carreras devuelve solo la suya y el detalle de una ajena es 404', async ({
    request,
  }) => {
    const ajena = await crearCarreraAjena(request);
    const h = cabeceras(await tokenDe('director'));

    const listado = await request.get(`${API}/carreras`, { headers: h });
    expect(listado.ok()).toBe(true);
    const carreras = (await listado.json()) as { id: string; codigo: string }[];
    expect(carreras).toHaveLength(1);
    expect(carreras[0]?.codigo).toBe('E2E');
    expect(carreras.map((c) => c.id)).not.toContain(ajena);

    const detalle = await request.get(`${API}/carreras/${ajena}`, { headers: h });
    expect(detalle.status()).toBe(404);
  });

  test('GET /planes fuerza su carrera aunque se pida la ajena, y el reporte del panel se le niega', async ({
    request,
  }) => {
    const ajena = await crearCarreraAjena(request);
    const h = cabeceras(await tokenDe('director'));

    const planes = await request.get(`${API}/planes`, { headers: h, params: { carreraId: ajena } });
    expect(planes.ok()).toBe(true);
    const filas = (await planes.json()) as { carreraId?: string; codigo: string }[];
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((p) => p.codigo.startsWith('PE-E2E'))).toBe(true);

    const versiones = await request.get(`${API}/carreras/${ajena}/versiones`, { headers: h });
    expect(versiones.status()).toBe(404);

    const panel = await request.get(`${API}/reportes/panel`, { headers: h });
    expect(panel.status()).toBe(403);
  });

  test('el Administrador sigue viendo todas las carreras', async ({ request }) => {
    const ajena = await crearCarreraAjena(request);
    const listado = await request.get(`${API}/carreras`, {
      headers: cabeceras(await tokenDe('admin')),
    });
    const ids = ((await listado.json()) as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(ajena);
    expect(ids.length).toBeGreaterThan(1);
  });
});

test.describe('con la cuenta de administrador', () => {
  test.use({ rol: 'admin' });

  test('el módulo se llama «Facultades» y el plan de una carrera no se abre', async ({
    page,
    request,
  }) => {
    const planId = await idDelPlanE2E(request);

    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('link', { name: 'Facultades' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Plan de Estudios' })).toHaveCount(0);

    await page.goto(`/plan-estudios/planes/${planId}`);
    await expect(page).toHaveURL(/\/plan-estudios$/);
    await expect(page.getByRole('heading', { name: 'Facultades', level: 1 })).toBeVisible();
  });
});

test.describe('con la cuenta de director', () => {
  test.use({ rol: 'director' });

  test('Plan de Estudios muestra una sola tarjeta, la de su carrera', async ({ page, request }) => {
    await crearCarreraAjena(request);

    await page.goto('/plan-estudios');
    await expect(page.getByRole('heading', { name: 'Mi carrera', level: 1 })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('E2E');
    await expect(page.getByLabel('Buscar carrera')).toHaveCount(0);
  });

  test('Reportes abre en la búsqueda y no ofrece el panel general', async ({ page }) => {
    await page.goto('/reportes');
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();
    await expect(page.getByText('Panel general')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Búsqueda de planes' })).toBeVisible();
  });
});
