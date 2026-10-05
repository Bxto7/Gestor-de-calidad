/**
 * Bloque 6c contra la aplicación entera: actas de aprobación por carrera
 * (RF-CH-048, RF-CH-049, RF-CH-050) con el Coordinador (`editor`), el Consultor
 * (`lector`, lee todas) y el Director (`director`). El acta de la carrera ajena
 * (`ACTA-E2E-AJENA`) la siembra `npm run e2e:preparar`.
 *
 * Cada acta que una prueba crea la elimina por la pantalla, que es lo que prueba.
 */

import type { APIRequestContext } from '@playwright/test';

import { crearActa, crearActaEnRevision, idDeLaPagina } from '../fixtures/acta';
import { tokenDe } from '../fixtures/api';
import { cabeceras } from '../fixtures/plan-borrador';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

async function actaAjena(request: APIRequestContext): Promise<{ id: string; codigo: string }> {
  const r = await request.get(`${API}/actas`, { headers: cabeceras(await tokenDe('lector')) });
  expect(r.ok()).toBe(true);
  const ajena = ((await r.json()) as { id: string; codigo: string }[]).find(
    (a) => a.codigo === 'ACTA-E2E-AJENA',
  );
  expect(ajena, 'Falta el acta ACTA-E2E-AJENA: `npm run e2e:preparar`.').toBeDefined();
  return ajena!;
}

test.describe('con la cuenta de coordinador', () => {
  test.use({ rol: 'editor' });

  test('el listado no trae el acta de otra carrera y su URL directa responde «no encontrada»', async ({
    page,
    request,
  }) => {
    const ajena = await actaAjena(request);

    await page.goto('/mejora-continua/actas');
    await expect(page.getByRole('heading', { name: 'Actas de aprobación' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Carrera' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ACTA-E2E-AJENA' })).toHaveCount(0);

    await page.goto(`/mejora-continua/actas/${ajena.id}`);
    await expect(page.getByText('Acta de aprobación no encontrada')).toBeVisible();
  });

  test('toda lectura y escritura sobre el acta de otra carrera es 404, incluida la exportación', async ({
    request,
  }) => {
    const ajena = await actaAjena(request);
    const h = cabeceras(await tokenDe('editor'));
    const intentos: { metodo: string; ruta: string; data?: unknown }[] = [
      { metodo: 'GET', ruta: `/actas/${ajena.id}` },
      { metodo: 'GET', ruta: `/actas/${ajena.id}/contenido` },
      { metodo: 'GET', ruta: `/actas/${ajena.id}/historial` },
      { metodo: 'GET', ruta: `/actas/${ajena.id}/documentos` },
      { metodo: 'POST', ruta: `/actas/${ajena.id}/documentos`, data: { tipo: 'ACTA_PDF' } },
      {
        metodo: 'PATCH',
        ruta: `/actas/${ajena.id}`,
        data: {
          titulo: 't',
          objetivo: 'o',
          convocadaPor: 'c',
          fechaReunion: '2026-05-01T00:00:00.000Z',
          lugarReunion: 'l',
        },
      },
      { metodo: 'PATCH', ruta: `/actas/${ajena.id}/textos`, data: { textoIntroduccion: 'x' } },
      { metodo: 'PUT', ruta: `/actas/${ajena.id}/asistentes`, data: { nombres: ['Ana'] } },
      { metodo: 'POST', ruta: `/actas/${ajena.id}/acciones/cargar` },
      {
        metodo: 'POST',
        ruta: `/actas/${ajena.id}/transiciones`,
        data: { accion: 'enviar-a-revision' },
      },
      { metodo: 'DELETE', ruta: `/actas/${ajena.id}` },
    ];

    for (const { metodo, ruta, data } of intentos) {
      const r = await request.fetch(`${API}${ruta}`, { method: metodo, headers: h, data });
      expect(r.status(), `${metodo} ${ruta}`).toBe(404);
    }
  });
});

test.describe('con la cuenta de consultor', () => {
  test.use({ rol: 'lector' });

  test('lee las actas de todas las carreras, pero no las modifica', async ({ request }) => {
    const ajena = await actaAjena(request);
    const h = cabeceras(await tokenDe('lector'));

    const lectura = await request.get(`${API}/actas/${ajena.id}`, { headers: h });
    expect(lectura.status()).toBe(200);

    const borrado = await request.delete(`${API}/actas/${ajena.id}`, { headers: h });
    expect(borrado.status()).toBe(403);
  });
});

test.describe('con la cuenta de director', () => {
  test.use({ rol: 'director' });

  test('crea un acta sin elegir carrera y la elimina en Borrador', async ({ page, request }) => {
    await crearActa(page);
    const id = idDeLaPagina(page);

    await page.getByRole('button', { name: 'Eliminar acta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page).toHaveURL(/\/mejora-continua\/actas$/);

    const r = await request.get(`${API}/actas/${id}`, {
      headers: cabeceras(await tokenDe('director')),
    });
    expect(r.status()).toBe(404);
  });

  test('también elimina un acta En revisión (RF-CH-050)', async ({ page, request }) => {
    await crearActaEnRevision(page);
    const id = idDeLaPagina(page);

    await page.getByRole('button', { name: 'Eliminar acta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page).toHaveURL(/\/mejora-continua\/actas$/);

    const r = await request.get(`${API}/actas/${id}`, {
      headers: cabeceras(await tokenDe('director')),
    });
    expect(r.status()).toBe(404);
  });
});
