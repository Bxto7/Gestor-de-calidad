/**
 * Bloque 5 contra la aplicación entera: atributos y criterios por carrera
 * (RF-CH-027 a RF-CH-032) con el Coordinador (`editor`, carrera E2E) y el
 * Consultor (`lector`, sin carrera).
 *
 * Lo que cada prueba crea lo elimina la propia pantalla antes de terminar, y un
 * `finally` lo repara por API si la prueba falló a medias: esta suite comparte
 * base con las demás, y un atributo o criterio huérfano («AG-X…», «C-X…») se
 * acumularía entre corridas.
 *
 * El alcance se prueba con una segunda carrera que el Administrador crea por API,
 * como `alcance-de-lectura.spec.ts`: no hay endpoint para borrar carreras, así que
 * cada corrida deja una con nombre único. Empieza por «Zz» por la misma razón que
 * allí: los selectores de otras pantallas preseleccionan la primera por orden
 * alfabético y esperan la carrera E2E.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { cabeceras } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

interface Fila {
  id: string;
  codigo: string;
  carreraId: string;
}

type Recurso = 'atributos' | 'criterios';

const sufijo = () => Date.now().toString().slice(-6);

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
  recurso: Recurso,
  carreraId: string,
): Promise<Fila[]> {
  const r = await request.get(`${API}/carreras/${carreraId}/${recurso}`, {
    headers: cabeceras(await tokenDe('editor')),
  });
  expect(r.ok()).toBe(true);
  return (await r.json()) as Fila[];
}

async function repararPorApi(
  request: APIRequestContext,
  recurso: Recurso,
  carreraId: string,
  codigo: string,
): Promise<void> {
  const resto = (await listar(request, recurso, carreraId)).find((f) => f.codigo === codigo);
  if (resto) {
    await request.delete(`${API}/${recurso}/${resto.id}`, {
      headers: cabeceras(await tokenDe('editor')),
    });
  }
}

/** Una carrera ajena a la del Coordinador, creada por el Administrador. */
async function crearCarreraAjena(request: APIRequestContext): Promise<string> {
  const h = cabeceras(await tokenDe('admin'));
  const s = sufijo();

  const facultad = await request.post(`${API}/facultades`, {
    headers: h,
    data: { nombre: `Facultad ajena ${s}` },
  });
  expect(facultad.ok()).toBe(true);
  const { id: facultadId } = (await facultad.json()) as { id: string };

  const carrera = await request.post(`${API}/facultades/${facultadId}/carreras`, {
    headers: h,
    data: { nombre: `Zz carrera ajena ${s}`, codigo: `AJ${s}`, duracionAnios: 5 },
  });
  expect(carrera.ok()).toBe(true);
  return ((await carrera.json()) as { id: string }).id;
}

test('crear, listar y eliminar un atributo sin elegir carrera (RF-CH-027, RF-CH-028, RF-CH-029)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const codigo = `AG-X${sufijo()}`;
  try {
    await page.goto('/acreditacion/atributos');
    await expect(page.getByRole('heading', { name: 'Atributos del Graduado' })).toBeVisible();
    // El Coordinador tiene carrera: la pantalla no le pide que la elija.
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Nuevo atributo' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo atributo del graduado' });
    await modal.getByLabel('Código').fill(codigo);
    await modal.getByLabel('Nombre').fill('Atributo creado por la suite E2E');
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: codigo });
    await expect(fila).toBeVisible();
    // Quedó en la carrera del usuario, que nadie eligió.
    const creado = (await listar(request, 'atributos', e2e)).find((a) => a.codigo === codigo);
    expect(creado?.carreraId).toBe(e2e);

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    const confirmar = page.getByRole('dialog', { name: 'Eliminar atributo' });
    await confirmar.getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toHaveCount(0);
    expect((await listar(request, 'atributos', e2e)).some((a) => a.codigo === codigo)).toBe(false);
  } finally {
    await repararPorApi(request, 'atributos', e2e, codigo);
  }
});

test('un atributo en uso no se elimina: el motivo y la sugerencia de inactivar (RF-CH-029, D-15)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);

  await page.goto('/acreditacion/atributos');
  // AG-I08 lo usan las competencias sembradas de la carrera E2E.
  const fila = page.getByRole('row').filter({ hasText: 'AG-I08' });
  await fila.getByRole('button', { name: 'Eliminar' }).click();
  const confirmar = page.getByRole('dialog', { name: 'Eliminar atributo' });
  await confirmar.getByRole('button', { name: 'Eliminar' }).click();

  const aviso = confirmar.getByRole('alert');
  await expect(aviso).toContainText('No se puede eliminar el atributo AG-I08: está en uso');
  await expect(aviso).toContainText('Inactívalo');
  // El diálogo no se cierra solo: quien lo lee decide.
  await confirmar.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmar).toBeHidden();

  expect((await listar(request, 'atributos', e2e)).some((a) => a.codigo === 'AG-I08')).toBe(true);
});

test('un criterio libre se elimina; con un plan de mejora, no (RF-CH-030, RF-CH-032)', async ({
  page,
  request,
}) => {
  const e2e = await carreraE2E(request);
  const h = cabeceras(await tokenDe('editor'));
  const codigo = `C-X${sufijo()}`;
  let planDeMejora: string | null = null;
  try {
    await page.goto('/acreditacion/criterios');
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Nuevo criterio' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo criterio de acreditación' });
    await modal.getByLabel('Código').fill(codigo);
    await modal.getByLabel('Nombre').fill('Criterio creado por la suite E2E');
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: codigo });
    await expect(fila).toBeVisible();
    const criterio = (await listar(request, 'criterios', e2e)).find((c) => c.codigo === codigo)!;
    expect(criterio.carreraId).toBe(e2e);

    // Un plan de mejora lo referencia: no hay clave foránea que lo impida, solo
    // la comprobación del caso de uso.
    const alta = await request.post(`${API}/planes-mejora`, {
      headers: h,
      data: { aspecto: 'CRITERIO_ACREDITACION', elementoId: criterio.id },
    });
    expect(alta.ok()).toBe(true);
    planDeMejora = ((await alta.json()) as { id: string }).id;

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    const bloqueado = page.getByRole('dialog', { name: 'Eliminar criterio' });
    await bloqueado.getByRole('button', { name: 'Eliminar' }).click();
    await expect(bloqueado.getByRole('alert')).toContainText('está en uso (1 plan de mejora)');
    await expect(bloqueado.getByRole('alert')).toContainText('Inactívalo');
    await bloqueado.getByRole('button', { name: 'Cancelar' }).click();
    expect((await listar(request, 'criterios', e2e)).some((c) => c.codigo === codigo)).toBe(true);

    // Sin el plan de mejora, ya se elimina.
    const borrado = await request.delete(`${API}/planes-mejora/${planDeMejora}`, { headers: h });
    expect(borrado.ok()).toBe(true);
    planDeMejora = null;

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar criterio' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(fila).toHaveCount(0);
    expect((await listar(request, 'criterios', e2e)).some((c) => c.codigo === codigo)).toBe(false);
  } finally {
    if (planDeMejora) await request.delete(`${API}/planes-mejora/${planDeMejora}`, { headers: h });
    await repararPorApi(request, 'criterios', e2e, codigo);
  }
});

test.describe('el alcance del Coordinador (API)', () => {
  test('lee otra carrera pero no escribe en ella; una carrera inexistente es 404', async ({
    request,
  }) => {
    const ajena = await crearCarreraAjena(request);
    const h = cabeceras(await tokenDe('editor'));

    // DEJA CONSTANCIA: el Coordinador lee con alcance global (la marca de «solo su
    // carrera» es del Director). Una carrera nueva empieza sin atributos ni criterios.
    for (const recurso of ['atributos', 'criterios'] as const) {
      const lectura = await request.get(`${API}/carreras/${ajena}/${recurso}`, { headers: h });
      expect(lectura.status()).toBe(200);
      expect(await lectura.json()).toEqual([]);

      const escritura = await request.post(`${API}/carreras/${ajena}/${recurso}`, {
        headers: h,
        data: { codigo: 'X-99', nombre: 'Intruso de la suite E2E' },
      });
      expect(escritura.status()).toBe(403);
    }

    const fantasma = await request.get(
      `${API}/carreras/00000000-0000-4000-8000-000000000000/atributos`,
      { headers: h },
    );
    expect(fantasma.status()).toBe(404);
  });
});

test.describe('el Consultor', () => {
  test.use({ rol: 'lector' });

  test('elige carrera y solo lee atributos y criterios', async ({ page }) => {
    await page.goto('/acreditacion/atributos');
    await expect(page.getByRole('heading', { name: 'Atributos del Graduado' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo atributo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

    await page.goto('/acreditacion/criterios');
    await expect(page.getByRole('heading', { name: 'Criterios de Acreditación' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo criterio' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
  });
});
