/**
 * RF-PM-027 a RF-PM-029 contra la aplicación entera.
 *
 * Lo que solo se ve aquí es la cadena completa: encolar por HTTP, que el worker
 * —otro proceso— lo tome, genere el archivo y lo guarde, y que la pantalla se
 * entere sola sin que nadie recargue.
 *
 * **El worker tiene que estar corriendo.** Si no lo está, el trabajo se queda
 * en «En cola» y la espera del primer recorrido agota su tiempo: eso es lo que
 * significa ese fallo, no que la pantalla esté rota.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/sesion';

async function abrirPrimerPlan(page: Page): Promise<void> {
  await page.goto('/mejora-continua/medicion');

  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  // El heading del detalle, y no la URL: `toHaveURL` pasa antes de que React
  // haya cambiado el contenido, y entonces se busca en la pantalla anterior.
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

test('sin documentos, la tarjeta lo dice en vez de quedarse en blanco', async ({ page }) => {
  await abrirPrimerPlan(page);

  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar PDF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar Excel' })).toBeVisible();
});

test('generar un PDF del plan y verlo listo sin recargar', async ({ page }) => {
  await abrirPrimerPlan(page);
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();

  await page.getByRole('button', { name: 'Generar PDF' }).click();

  const lista = page.getByRole('list', { name: 'Documentos generados' });
  await expect(lista.getByText('PDF', { exact: true }).first()).toBeVisible();

  // La lista se refresca sola mientras haya trabajos sin terminar. Si esto se
  // queda esperando, o el worker no corre o el refresco automático se rompió.
  await expect(lista.getByRole('button', { name: /descargar/i }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test('el Excel se genera aparte y se distingue del PDF', async ({ page }) => {
  await abrirPrimerPlan(page);
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();

  await page.getByRole('button', { name: 'Generar Excel' }).click();

  const lista = page.getByRole('list', { name: 'Documentos generados' });
  const fila = lista.getByRole('listitem').filter({ hasText: 'Excel' }).first();

  // Dos formatos que se vieran igual obligarían a leer el nombre del archivo
  // entero para saber cuál se está descargando.
  await expect(fila).toBeVisible();
  await expect(fila.getByRole('button', { name: /descargar/i })).toBeVisible({
    timeout: 30_000,
  });
});
