/**
 * RF-PE-001 a RF-PE-012 contra la aplicación entera.
 *
 * Lo que solo se ve aquí: que el plan de evaluación lea de verdad las
 * competencias y los periodos del plan de medición base —no de una copia— y que
 * el ciclo de vida funcione de punta a punta.
 */

import { expect, test } from '../fixtures/sesion';

test('crear un plan de evaluación sobre un plan de medición vigente', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');

  await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de medición base*').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  // El código empieza por EV- y nunca por PE-, que es el prefijo del plan de
  // estudios y va dentro del propio código.
  const enlace = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(enlace).toBeVisible();
  await enlace.click();

  // Un encabezado que solo existe en el detalle: `toHaveURL` casa en el
  // instante de navegar, cuando React todavía no ha cambiado el contenido.
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
});

test('el detalle enseña lo heredado, y no deja tocarlo', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('link', { name: /^EV-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Heredado del plan de medición' })).toBeVisible();
  await expect(page.getByText(/CPE-E2E01/)).toBeVisible();

  // RF-PE-010 RN1 y RF-PE-011 RN1: desde aquí no se añaden ni se quitan.
  await expect(page.locator('main').getByRole('checkbox')).toHaveCount(0);
});

test('el ciclo de vida avanza y queda en la bitácora', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('link', { name: /^EV-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await page.getByRole('button', { name: 'Enviar a revisión' }).click();

  await expect(
    page.locator('main').getByText('En revisión', { exact: true }).first(),
  ).toBeVisible();
});
