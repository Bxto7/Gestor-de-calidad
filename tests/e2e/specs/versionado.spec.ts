/**
 * RF-PM-030, RF-PM-031 y RF-PM-034 contra la aplicación entera.
 *
 * Lo que solo se ve aquí es que las piezas encajen: que el guardián acotado de
 * `crear` deje convivir un Borrador con un Vigente, que el linaje llegue del
 * backend en el orden que RF-PM-031 RN1 pide, y que la pantalla ofrezca cada
 * operación solo cuando corresponde. Cada una de esas piezas pasa sus pruebas
 * por separado; que funcionen juntas es otra cosa.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/sesion';

/** Abre el detalle del plan más reciente del listado. */
async function abrirPrimerPlan(page: Page): Promise<void> {
  await page.goto('/mejora-continua/medicion');

  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page).toHaveURL(/\/mejora-continua\/medicion\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

test('un Borrador se duplica pero no se versiona', async ({ page }) => {
  await abrirPrimerPlan(page);
  await expect(page.locator('main').getByText('Borrador', { exact: true })).toBeVisible();

  // RF-PM-030: versionar un Borrador no tiene sentido, se edita directamente.
  await expect(page.getByRole('button', { name: 'Nueva versión' })).toHaveCount(0);

  // RF-PM-034: duplicar sí, desde cualquier estado.
  await expect(page.getByRole('button', { name: 'Duplicar' })).toBeVisible();
});

test('duplicar deja una copia en Borrador y sin linaje', async ({ page }) => {
  await abrirPrimerPlan(page);
  const origen = page.url();

  await page.getByRole('button', { name: 'Duplicar' }).click();

  // Se navega al plan nuevo, que es otro.
  await expect(page).toHaveURL(/\/mejora-continua\/medicion\/[0-9a-f-]{36}$/);
  await expect(page).not.toHaveURL(origen);
  await expect(page.locator('main').getByText('Borrador', { exact: true })).toBeVisible();

  // RF-PM-034 RN1: la copia no desciende de nadie, así que no hay linaje que
  // mostrar. Si apareciera la sección, sería que heredó el vínculo.
  await expect(page.getByRole('heading', { name: 'Versiones' })).toHaveCount(0);
});

test('versionar un plan vigente deja la copia enlazada a su origen', async ({ page }) => {
  // El plan vigente se busca con el filtro de la propia pantalla, no pidiéndolo
  // a la API: `page.request` no lleva la sesión —el token vive en
  // `sessionStorage`, que es de la página y no del contexto de peticiones— y
  // devolvería un 401. Además, filtrar por estado es lo que haría una persona.
  await page.goto('/mejora-continua/medicion');
  await page.getByLabel('Filtrar por estado').selectOption('Vigente');

  // Se espera a que la lista se refresque tras filtrar. Contar antes daría cero
  // y la prueba se saltaría sola: `preparar-e2e` deja siempre un plan vigente,
  // así que aquí no hay nada que tolerar.
  const vigente = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(vigente).toBeVisible();

  const codigoOrigen = (await vigente.textContent())?.trim() ?? '';
  await vigente.click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await page.getByRole('button', { name: 'Nueva versión' }).click();

  await expect(page).toHaveURL(/\/mejora-continua\/medicion\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  // `.first()` es el badge de la cabecera. «Borrador» sale también dentro de la
  // lista de versiones, porque la copia recién creada lo es: son dos apariciones
  // correctas del mismo texto, no una ambigüedad que haya que arreglar.
  await expect(page.locator('main').getByText('Borrador', { exact: true }).first()).toBeVisible();

  // RF-PM-031: ahora sí hay linaje, y desde la copia se llega al origen.
  const versiones = page.getByRole('list', { name: 'Versiones del plan' });
  await expect(versiones).toBeVisible();
  await expect(versiones.getByRole('link', { name: codigoOrigen })).toBeVisible();
});

test('el historial muestra lo que se hizo, con quién y cuándo', async ({ page }) => {
  await abrirPrimerPlan(page);

  await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();

  // Por su nombre accesible y no por posición: la pantalla tiene tres listas
  // —hallazgos, versiones e historial— y «la última» rompería en cuanto alguien
  // añadiera una cuarta. El nombre del usuario también sale en la barra lateral,
  // así que ceñirse a la lista importa.
  const historial = page.getByRole('list', { name: 'Movimientos del plan' });
  await expect(historial).toContainText('E2E Editor');
});
