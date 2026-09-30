/**
 * Bloque 4a de Plan de Estudios contra la aplicación entera: Reactivar
 * (RF-CH-023), electivas sin ciclo (RF-CH-022), competencias del plan en las
 * asignaturas (RF-CH-021) y alta sin horas teóricas (RF-CH-020).
 *
 * El plan E2E está Vigente y no admite cambios, así que las pruebas de
 * asignaturas trabajan sobre una versión nueva en Borrador que generan ellas
 * mismas y **borran al terminar**, pase lo que pase: otras suites toman «el
 * primer plan PE-E2E» del listado, y un Borrador olvidado podría ser ese. Si
 * una corrida anterior se interrumpió y dejó uno, se borra antes de empezar
 * (RF075 impide generar otra versión mientras exista).
 *
 * Cada corrida deja una facultad y una competencia de catálogo con nombre
 * único: no hay endpoint para borrarlas, y es el precio de probar con datos
 * propios en vez de tocar los sembrados.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

function cabeceras(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

interface PlanResumen {
  id: string;
  codigo: string;
  estado: string;
}

interface AsignaturaApi {
  id: string;
  codigo: string;
  nombre: string;
  condicion: string;
}

interface Bloqueante {
  codigo: string;
  afectados: string[];
}

/** Borra cualquier Borrador del plan E2E y genera uno limpio desde el Vigente. */
async function borradorNuevo(request: APIRequestContext): Promise<string> {
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

async function borrarPlan(request: APIRequestContext, planId: string): Promise<void> {
  const h = cabeceras(await tokenDe('director'));
  await request.delete(`${API}/planes/${planId}`, { headers: h });
}

async function idDeCompetencia(request: APIRequestContext, codigo: string): Promise<string> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/competencias`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  const competencia = ((await respuesta.json()) as { id: string; codigo: string }[]).find(
    (c) => c.codigo === codigo,
  );
  expect(competencia, `No existe ${codigo}: falta \`npm run e2e:preparar\`.`).toBeDefined();
  return competencia!.id;
}

async function asociarCompetencias(
  request: APIRequestContext,
  planId: string,
  competenciaIds: string[],
): Promise<void> {
  const h = cabeceras(await tokenDe('director'));
  const asociado = await request.put(`${API}/planes/${planId}/asociaciones`, {
    headers: h,
    data: { competenciaIds },
  });
  expect(asociado.ok()).toBe(true);
}

async function bloqueantes(request: APIRequestContext, planId: string): Promise<Bloqueante[]> {
  const h = cabeceras(await tokenDe('director'));
  const respuesta = await request.get(`${API}/planes/${planId}`, { headers: h });
  expect(respuesta.ok()).toBe(true);
  return ((await respuesta.json()) as { validacion: { bloqueantes: Bloqueante[] } }).validacion
    .bloqueantes;
}

test.describe('Reactivar (RF-CH-023)', () => {
  test.use({ rol: 'admin' });

  test('una facultad inactivada vuelve a Activo con «Reactivar»', async ({ page, request }) => {
    const h = cabeceras(await tokenDe('admin'));
    const nombre = `Facultad reactivable ${Date.now().toString().slice(-7)}`;
    const creada = await request.post(`${API}/facultades`, { headers: h, data: { nombre } });
    expect(creada.ok()).toBe(true);
    const { id } = (await creada.json()) as { id: string };

    await page.goto('/plan-estudios');
    await page.getByLabel('Buscar facultad por nombre').fill(nombre);
    const tarjeta = page.getByRole('article').filter({ hasText: nombre });

    await tarjeta.getByRole('button', { name: 'Inactivar' }).click();
    await page
      .getByRole('dialog', { name: 'Inactivar facultad' })
      .getByRole('button', { name: 'Inactivar' })
      .click();
    await expect(tarjeta.getByText('Inactivo', { exact: true })).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Reactivar' }).click();
    await expect(tarjeta.getByText('Activo', { exact: true })).toBeVisible();

    const facultades = (await (await request.get(`${API}/facultades`, { headers: h })).json()) as {
      id: string;
      activa: boolean;
    }[];
    expect(facultades.find((f) => f.id === id)?.activa).toBe(true);
  });
});

test.describe('asignaturas en un Borrador del plan E2E', () => {
  test.use({ rol: 'director' });

  test('una electiva sin ciclo no bloquea y una obligatoria sin ciclo sí (RF-CH-022 y RF-CH-020)', async ({
    page,
    request,
  }) => {
    const planId = await borradorNuevo(request);
    try {
      const h = cabeceras(await tokenDe('director'));
      const cpe = await idDeCompetencia(request, 'CPE-E2E01');
      await asociarCompetencias(request, planId, [cpe]);

      // RF-CH-020: el alta ya no lleva horas teóricas, ni de ida ni de vuelta.
      const alta = await request.post(`${API}/planes/${planId}/asignaturas`, {
        headers: h,
        data: {
          nombre: 'Electiva sin ciclo E2E',
          descripcion: 'Electiva creada por la suite E2E.',
          tipo: 'Especialidad',
          condicion: 'Electiva',
          creditos: 3,
          competenciaIds: [cpe],
        },
      });
      expect(alta.ok()).toBe(true);
      const electiva = (await alta.json()) as AsignaturaApi;
      expect(electiva).not.toHaveProperty('horasTeoricas');

      // Las obligatorias copiadas del Vigente nacen sin ciclo: se ubican todas.
      const lista = (await (
        await request.get(`${API}/planes/${planId}/asignaturas`, { headers: h })
      ).json()) as AsignaturaApi[];
      const obligatorias = lista.filter((a) => a.condicion === 'Obligatoria');
      expect(obligatorias.length).toBeGreaterThan(0);
      for (const [i, a] of obligatorias.entries()) {
        const ubicada = await request.patch(`${API}/asignaturas/${a.id}/ubicacion`, {
          headers: h,
          data: { cicloNumero: (i % 4) + 1 },
        });
        expect(ubicada.ok()).toBe(true);
      }

      expect((await bloqueantes(request, planId)).map((b) => b.codigo)).not.toContain(
        'ASIGNATURA_SIN_CICLO',
      );

      await page.goto(`/plan-estudios/planes/${planId}/asignaturas`);
      await expect(page.getByRole('heading', { name: 'Electiva sin ciclo E2E' })).toBeVisible();
      await expect(page.getByText(/obligatoria\(s\) sin ciclo asignado/)).toHaveCount(0);

      // Una obligatoria sin ciclo sigue bloqueando, y RF068 no nombra la electiva.
      const primera = obligatorias[0]!;
      const retirada = await request.patch(`${API}/asignaturas/${primera.id}/ubicacion`, {
        headers: h,
        data: { cicloNumero: null },
      });
      expect(retirada.ok()).toBe(true);

      const sinCiclo = (await bloqueantes(request, planId)).find(
        (b) => b.codigo === 'ASIGNATURA_SIN_CICLO',
      );
      expect(sinCiclo?.afectados.some((x) => x.startsWith(primera.codigo))).toBe(true);
      expect(sinCiclo?.afectados.some((x) => x.startsWith(electiva.codigo))).toBe(false);

      await page.reload();
      await expect(
        page.getByText('1 asignatura(s) obligatoria(s) sin ciclo asignado.'),
      ).toBeVisible();
    } finally {
      await borrarPlan(request, planId);
    }
  });

  test('solo se ofrecen y se aceptan las competencias del plan (RF-CH-021)', async ({
    page,
    request,
  }) => {
    const planId = await borradorNuevo(request);
    try {
      const h = cabeceras(await tokenDe('director'));
      const cpe = await idDeCompetencia(request, 'CPE-E2E01');
      await asociarCompetencias(request, planId, [cpe]);

      const sufijo = Date.now().toString().slice(-7);
      const creada = await request.post(`${API}/competencias`, {
        headers: h,
        data: { nombre: `Competencia fuera del plan ${sufijo}`, atributoIds: [] },
      });
      expect(creada.ok()).toBe(true);
      const ajena = (await creada.json()) as { id: string; codigo: string };

      const rechazo = await request.post(`${API}/planes/${planId}/asignaturas`, {
        headers: h,
        data: {
          nombre: `Asignatura con competencia ajena ${sufijo}`,
          descripcion: 'Asignatura creada por la suite E2E.',
          tipo: 'Especialidad',
          condicion: 'Obligatoria',
          creditos: 3,
          competenciaIds: [ajena.id],
        },
      });
      expect(rechazo.status()).toBe(409);
      expect(((await rechazo.json()) as { message: string }).message).toContain(
        'no están asociadas al plan',
      );

      await page.goto(`/plan-estudios/planes/${planId}/asignaturas`);
      await page.getByRole('button', { name: 'Nueva asignatura' }).click();
      const modal = page.getByRole('dialog', { name: 'Nueva asignatura' });
      await expect(modal.getByRole('checkbox', { name: /CPE-E2E01/ })).toBeVisible();
      await expect(
        modal.getByRole('checkbox', { name: new RegExp(`^${ajena.codigo} `) }),
      ).toHaveCount(0);
    } finally {
      await borrarPlan(request, planId);
    }
  });
});
