/**
 * Bloque 6b contra la aplicación entera: planes de Mejora por carrera, ciclo propio
 * y responsable (RF-CH-040 a RF-CH-047) con el Coordinador (`editor`), el Docente
 * (`docente`, misma carrera) y el Consultor (`lector`, sin carrera).
 *
 * Cada prueba que crea un plan lo elimina —por la pantalla, que es lo que prueba, y
 * en un `finally` por API si falló a medias— para no dejar un Borrador que otras
 * suites tomen con `.first()`. El plan de la carrera ajena (`PJ-E2E-AJENA`) lo
 * siembra `npm run e2e:preparar`.
 */

import { tokenDe } from '../fixtures/api';
import { cabeceras } from '../fixtures/plan-borrador';
import {
  completarDefinicion,
  crearPlanDeMejoraPorApi,
  eliminarPlanDeMejoraPorApi,
  planDeMejoraAjeno,
} from '../fixtures/plan-mejora';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

test.describe('con la cuenta de coordinador', () => {
  test.use({ rol: 'editor' });

  test('crea un plan sin elegir carrera, elige un docente de responsable, lo envía a revisión y lo elimina', async ({
    page,
    request,
  }) => {
    await page.goto('/mejora-continua/mejora');
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
    await modal.getByLabel('Elemento').selectOption({ index: 1 });
    await modal.getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
    const codigo = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
    const id = page.url().split('/').pop();

    try {
      await completarDefinicion(page);
      await expect(page.getByLabel('Responsable', { exact: true })).toHaveValue(/.+/);

      // Ciclo propio: sin «vigente» ni «archivar», y el seguimiento bloqueado en Borrador.
      await expect(page.getByRole('button', { name: /vigente|archivar/i })).toHaveCount(0);
      await page.getByRole('tab', { name: 'Seguimiento' }).click();
      await expect(page.getByLabel('Estado de implementación')).toBeDisabled();

      await page.getByRole('button', { name: 'Enviar a revisión' }).click();
      await expect(page.getByText('En revisión').first()).toBeVisible();

      // RF-CH-042: En revisión también se elimina, desde el listado.
      await page.goto('/mejora-continua/mejora');
      await page.getByRole('button', { name: `Eliminar ${codigo}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByRole('link', { name: codigo, exact: true })).toHaveCount(0);
    } finally {
      await eliminarPlanDeMejoraPorApi(request, id);
    }
  });

  test('un plan de otra carrera responde «no encontrado» por URL directa', async ({
    page,
    request,
  }) => {
    const ajeno = await planDeMejoraAjeno(request);

    await page.goto(`/mejora-continua/mejora/${ajeno.id}`);

    await expect(page.getByText('Plan de mejora no encontrado')).toBeVisible();
  });
});

test.describe('con la cuenta de docente', () => {
  test.use({ rol: 'docente' });

  test('ve los planes de su carrera, sin «Eliminar» ni «Nuevo plan», y el de otra carrera no existe para él', async ({
    page,
    request,
  }) => {
    const ajeno = await planDeMejoraAjeno(request);

    await page.goto('/mejora-continua/mejora');
    await expect(page.getByRole('heading', { name: 'Planes de Mejora' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo plan de mejora' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Eliminar / })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'PJ-E2E-AJENA' })).toHaveCount(0);

    const r = await request.get(`${API}/planes-mejora/${ajeno.id}`, {
      headers: cabeceras(await tokenDe('docente')),
    });
    expect(r.status()).toBe(404);
  });
});

test.describe('API: alcance y ciclo', () => {
  test('el listado ignora un carreraId ajeno y el Consultor sí ve todas', async ({ request }) => {
    const ajeno = await planDeMejoraAjeno(request);

    const coord = await request.get(`${API}/planes-mejora?carreraId=${ajeno.carreraId}`, {
      headers: cabeceras(await tokenDe('editor')),
    });
    expect(((await coord.json()) as { codigo: string }[]).map((p) => p.codigo)).not.toContain(
      'PJ-E2E-AJENA',
    );

    const consultor = await request.get(`${API}/planes-mejora`, {
      headers: cabeceras(await tokenDe('lector')),
    });
    expect(((await consultor.json()) as { codigo: string }[]).map((p) => p.codigo)).toContain(
      'PJ-E2E-AJENA',
    );
  });

  test('marcar-vigente y archivar ya no existen: 400', async ({ request }) => {
    const ajeno = await planDeMejoraAjeno(request);
    for (const accion of ['marcar-vigente', 'archivar']) {
      const r = await request.post(`${API}/planes-mejora/${ajeno.id}/transicion`, {
        headers: cabeceras(await tokenDe('editor')),
        data: { accion },
      });
      expect(r.status(), accion).toBe(400);
    }
  });

  test('responsable: un id que no es de un docente de la carrera es 409', async ({ request }) => {
    const plan = await crearPlanDeMejoraPorApi(request);
    try {
      const r = await request.patch(`${API}/planes-mejora/${plan.id}/definicion`, {
        headers: cabeceras(await tokenDe('editor')),
        data: {
          nombre: 'a',
          causaRaiz: 'b',
          justificacion: 'c',
          plazo: '2026-12-31',
          recursos: 'd',
          metas: 'e',
          responsableId: '00000000-0000-4000-8000-000000000000',
        },
      });
      expect(r.status()).toBe(409);
      expect(((await r.json()) as { message: string }).message).toContain('RF-CH-045');
    } finally {
      await eliminarPlanDeMejoraPorApi(request, plan.id);
    }
  });
});
