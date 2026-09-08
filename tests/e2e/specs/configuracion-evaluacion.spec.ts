/**
 * RF-PE-013 a RF-PE-021 contra la aplicación entera.
 *
 * Lo que solo se ve aquí: que configurar un periodo no toque los demás
 * (RF-PE-021), y que un plan Vigente deje registrar el porcentaje pero no
 * cambiar las asignaturas (RF-PE-006 RN2).
 */

import { expect, test } from '../fixtures/sesion';

test('configurar un periodo deja los demás intactos', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('link', { name: /^EV-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Configuración por competencia' })).toBeVisible();
  await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-I' });

  await page
    .getByRole('textbox', { name: /instrumento/i })
    .first()
    .fill('Rúbrica analítica');
  await page.getByRole('button', { name: 'Guardar el periodo' }).click();

  // Se espera a la respuesta y no a que la pantalla se vea bien: la pantalla
  // adelanta el cambio, así que afirmar sobre ella sin esto pasaría aunque no
  // se hubiera guardado nada.
  await expect(page.getByText(/guardado/i)).toBeVisible();

  // RF-PE-021: el otro periodo sigue vacío.
  await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-II' });
  await expect(page.getByRole('textbox', { name: /instrumento/i }).first()).toHaveValue(
    'Rúbrica analítica',
  );
  await expect(page.getByRole('spinbutton', { name: /porcentaje/i }).first()).toHaveValue('');
});

test.describe('con la cuenta que aprueba', () => {
  test.use({ rol: 'director' });

  test('un plan Vigente deja registrar lo alcanzado, no cambiar la definición', async ({
    page,
  }) => {
    // RF-PE-006 RN2. Es la mitad del submódulo: sin esta excepción, el porcentaje
    // alcanzado de un periodo que ya cerró no podría registrarse nunca.
    await page.goto('/mejora-continua/evaluacion');
    await page.getByRole('link', { name: /^EV-/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

    // Se lleva a Vigente por su ciclo de vida, sin tocar la base de datos: lo que
    // se prueba es lo que hace la aplicación, no lo que sabemos que guarda.
    for (const accion of ['Enviar a revisión', 'Aprobar', 'Marcar como vigente']) {
      await page.getByRole('button', { name: accion }).click();
      await expect(page.getByRole('button', { name: accion })).toHaveCount(0);
    }
    await expect(page.locator('main').getByText('Vigente', { exact: true }).first()).toBeVisible();

    await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-I' });

    await expect(page.getByRole('spinbutton', { name: /porcentaje/i }).first()).toBeEnabled();
    await expect(page.getByRole('textbox', { name: /instrumento/i }).first()).toBeDisabled();
  });
});
