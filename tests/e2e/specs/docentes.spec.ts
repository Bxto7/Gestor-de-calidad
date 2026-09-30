/**
 * Gestión de docentes por el Director (RF-CH-010 a 014) contra la API real.
 *
 * Cada prueba usa un correo único (`Date.now()`): la suite comparte base y una
 * cuenta que sobrevive a una corrida fallida no debe romper la siguiente.
 * No se inicia sesión como el docente creado: el login admite cinco intentos por
 * minuto y la suite ya gasta los cinco.
 */

import type { APIRequestContext, Page } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { analizar } from '../fixtures/axe';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

async function irADocentes(page: Page, request: APIRequestContext): Promise<void> {
  const respuesta = await request.get(`${API}/planes`, {
    headers: { authorization: `Bearer ${await tokenDe('director')}` },
  });
  expect(respuesta.ok()).toBe(true);
  const plan = ((await respuesta.json()) as { id: string; codigo: string }[]).find((p) =>
    p.codigo.startsWith('PE-E2E'),
  );
  expect(plan, 'No hay plan de estudios E2E: falta `npm run e2e:preparar`.').toBeDefined();

  await page.goto(`/plan-estudios/planes/${plan!.id}`);
  await page.getByRole('link', { name: /^Docentes/ }).click();
  await expect(page.getByRole('heading', { name: 'Docentes', level: 1 })).toBeVisible();
}

test.describe('con la cuenta de director', () => {
  test.use({ rol: 'director' });

  test('registra un docente, le cambia la contraseña, lo inactiva, lo reactiva y lo elimina', async ({
    page,
    request,
  }) => {
    const correo = `docente-${Date.now()}@sgc.local`;
    await irADocentes(page, request);

    await page.getByRole('button', { name: 'Nuevo docente' }).click();
    const alta = page.getByRole('dialog', { name: 'Nuevo docente' });
    await alta.getByLabel(/Nombre completo/).fill('Docente de Prueba');
    await alta.getByLabel(/Usuario/).fill(correo);
    await alta.getByLabel(/Contraseña/).fill('Clave.Docente.1');
    await alta.getByRole('button', { name: 'Guardar' }).click();

    const fila = page.getByRole('row', { name: new RegExp(correo) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Activo');

    await fila.getByRole('button', { name: /Editar contraseña/ }).click();
    const cambio = page.getByRole('dialog', { name: 'Editar contraseña' });
    await cambio.getByLabel(/Nueva contraseña/).fill('Otra.Clave.Docente.2');
    await cambio.getByRole('button', { name: 'Guardar' }).click();
    await expect(cambio).toBeHidden();

    await fila.getByRole('button', { name: /Inactivar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Inactivar' }).click();
    await expect(fila).toContainText('Inactivo');

    await fila.getByRole('button', { name: /Reactivar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reactivar' }).click();
    await expect(fila).toContainText('Activo');

    await fila.getByRole('button', { name: /Eliminar/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toBeHidden();
  });

  test('la sección de Docentes, con un docente en la lista, sin violaciones de accesibilidad', async ({
    page,
    request,
  }) => {
    const cabeceras = {
      authorization: `Bearer ${await tokenDe('director')}`,
      'content-type': 'application/json',
    };
    const creado = await request.post(`${API}/carrera/docentes`, {
      headers: cabeceras,
      data: {
        nombreCompleto: 'Docente Axe',
        email: `axe-${Date.now()}@sgc.local`,
        password: 'Clave.Docente.1',
      },
    });
    expect(creado.ok()).toBe(true);
    const { id } = (await creado.json()) as { id: string };

    try {
      await irADocentes(page, request);
      await expect(page.getByRole('table')).toBeVisible();
      await analizar(page, 'la sección de Docentes');
    } finally {
      await request.delete(`${API}/carrera/docentes/${id}`, { headers: cabeceras });
    }
  });
});

test('solo el Director gestiona docentes: el Coordinador y el Docente reciben 403', async ({
  request,
}) => {
  for (const rol of ['editor', 'docente'] as const) {
    const respuesta = await request.get(`${API}/carrera/docentes`, {
      headers: { authorization: `Bearer ${await tokenDe(rol)}` },
    });
    expect(respuesta.status(), `El rol ${rol} no debería listar docentes.`).toBe(403);
  }
});
