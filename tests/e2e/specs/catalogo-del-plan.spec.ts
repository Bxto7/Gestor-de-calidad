/**
 * Bloque 4b de Plan de Estudios contra la aplicación entera: objetivos y
 * competencias del plan (RF-CH-015, RF-CH-017), eliminarlos (RF-CH-016,
 * RF-CH-018) y eliminar asignaturas (RF-CH-019), sobre un Borrador del plan
 * E2E que cada prueba genera y borra.
 *
 * Lo que cada prueba crea lo borra la propia pantalla antes de terminar: un
 * objetivo o una competencia creados solo en el Borrador se borran del todo
 * al quitarlos, así que no se acumulan entre corridas.
 */

import { tokenDe } from '../fixtures/api';
import { borradorNuevo, borrarPlan, cabeceras, idDeCompetencia } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

test.use({ rol: 'director' });

async function carreraE2E(token: string, request: import('@playwright/test').APIRequestContext) {
  const r = await request.get(`${API}/carreras`, { headers: cabeceras(token) });
  expect(r.ok()).toBe(true);
  const [carrera] = (await r.json()) as { id: string; codigo: string }[];
  expect(carrera?.codigo).toBe('E2E');
  return carrera!.id;
}

test('crear y eliminar un objetivo desde la pantalla del plan (RF-CH-015, RF-CH-016)', async ({
  page,
  request,
}) => {
  const planId = await borradorNuevo(request);
  try {
    const token = await tokenDe('director');
    const h = cabeceras(token);
    const nombre = `Objetivo E2E ${Date.now().toString().slice(-7)}`;

    await page.goto(`/plan-estudios/planes/${planId}/objetivos`);
    await page.getByRole('button', { name: 'Nuevo objetivo' }).click();
    const modal = page.getByRole('dialog', { name: 'Nuevo objetivo educacional' });
    await modal.getByLabel('Nombre').fill(nombre);
    await modal.getByLabel('Descripción').fill('Objetivo creado por la suite E2E en el plan.');
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: nombre });
    await expect(fila).toBeVisible();

    // Quedó en este plan y en la carrera del plan, sin elegirla.
    const delPlan = (await (
      await request.get(`${API}/objetivos`, { headers: h, params: { planId } })
    ).json()) as { id: string; nombre: string; carreraId: string }[];
    const creado = delPlan.find((o) => o.nombre === nombre);
    expect(creado?.carreraId).toBe(await carreraE2E(token, request));

    await fila.getByRole('button', { name: 'Eliminar' }).click();
    const confirmar = page.getByRole('dialog', { name: 'Eliminar objetivo del plan' });
    await expect(confirmar).toContainText('Si ningún otro plan lo usa');
    await confirmar.getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila).toHaveCount(0);

    // Solo estaba en este Borrador: el registro desapareció.
    const despues = await request.get(`${API}/objetivos/${creado!.id}`, { headers: h });
    expect(despues.status()).toBe(404);
  } finally {
    await borrarPlan(request, planId);
  }
});

test('crear y eliminar una competencia; una usada por una asignatura no se elimina (RF-CH-017, RF-CH-018)', async ({
  page,
  request,
}) => {
  const planId = await borradorNuevo(request);
  try {
    const h = cabeceras(await tokenDe('director'));
    const sufijo = Date.now().toString().slice(-7);
    const nombre = `Competencia E2E ${sufijo}`;

    await page.goto(`/plan-estudios/planes/${planId}/competencias`);
    await page.getByRole('button', { name: 'Nueva competencia' }).click();
    const modal = page.getByRole('dialog', { name: 'Nueva competencia' });
    await modal.getByLabel('Nombre').fill(nombre);
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(modal).toBeHidden();

    const fila = page.getByRole('row').filter({ hasText: nombre });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar competencia del plan' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(fila).toHaveCount(0);

    // Bloqueo por uso: una asignatura del Borrador usa CPE-E2E01.
    const cpe = await idDeCompetencia(request, 'CPE-E2E01');
    const alta = await request.post(`${API}/planes/${planId}/asignaturas`, {
      headers: h,
      data: {
        nombre: `Asignatura que usa CPE-E2E01 ${sufijo}`,
        descripcion: 'Asignatura creada por la suite E2E.',
        tipo: 'Especialidad',
        condicion: 'Obligatoria',
        creditos: 3,
        competenciaIds: [cpe],
      },
    });
    expect(alta.ok()).toBe(true);
    const { codigo } = (await alta.json()) as { codigo: string };

    await page.reload();
    const usada = page.getByRole('row').filter({ hasText: 'CPE-E2E01' });
    await usada.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar competencia del plan' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(
      page.getByText(`La usan ${codigo}. Quítala de esas asignaturas primero.`),
    ).toBeVisible();
    await expect(usada).toBeVisible();
  } finally {
    await borrarPlan(request, planId);
  }
});

test('quitar una competencia del Borrador no la quita del Vigente', async ({ request }) => {
  const planId = await borradorNuevo(request);
  try {
    const h = cabeceras(await tokenDe('director'));
    const planes = (await (await request.get(`${API}/planes`, { headers: h })).json()) as {
      id: string;
      codigo: string;
      estado: string;
    }[];
    const vigente = planes.find((p) => p.codigo.startsWith('PE-E2E') && p.estado === 'Vigente')!;
    const cpe = await idDeCompetencia(request, 'CPE-E2E02');

    const codigosDe = async (id: string) =>
      (
        (await (
          await request.get(`${API}/competencias`, { headers: h, params: { planId: id } })
        ).json()) as { codigo: string }[]
      ).map((c) => c.codigo);

    // La versión nueva trae las del Vigente (Tarea 2).
    expect(await codigosDe(planId)).toContain('CPE-E2E02');

    const quitada = await request.delete(`${API}/planes/${planId}/competencias/${cpe}`, {
      headers: h,
    });
    expect(quitada.status()).toBe(204);

    expect(await codigosDe(planId)).not.toContain('CPE-E2E02');
    expect(await codigosDe(vigente.id)).toContain('CPE-E2E02');
    expect((await request.get(`${API}/competencias/${cpe}`, { headers: h })).status()).toBe(200);
  } finally {
    await borrarPlan(request, planId);
  }
});

test('eliminar una asignatura del Borrador (RF-CH-019)', async ({ page, request }) => {
  const planId = await borradorNuevo(request);
  try {
    const h = cabeceras(await tokenDe('director'));
    const nombre = `Asignatura a eliminar ${Date.now().toString().slice(-7)}`;
    const alta = await request.post(`${API}/planes/${planId}/asignaturas`, {
      headers: h,
      data: {
        nombre,
        descripcion: 'Asignatura creada por la suite E2E.',
        tipo: 'Especialidad',
        condicion: 'Electiva',
        creditos: 3,
        competenciaIds: [],
      },
    });
    expect(alta.ok()).toBe(true);
    const { id } = (await alta.json()) as { id: string };

    await page.goto(`/plan-estudios/planes/${planId}/asignaturas`);
    const tarjeta = page.getByRole('article').filter({ hasText: nombre });
    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    await page
      .getByRole('dialog', { name: 'Eliminar asignatura' })
      .getByRole('button', { name: 'Eliminar' })
      .click();
    await expect(tarjeta).toHaveCount(0);

    expect((await request.get(`${API}/asignaturas/${id}`, { headers: h })).status()).toBe(404);
  } finally {
    await borrarPlan(request, planId);
  }
});
