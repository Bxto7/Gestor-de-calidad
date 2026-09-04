/**
 * La sesión inyectada tiene que servir para lo mismo que la navegada: entrar.
 *
 * Si esta prueba falla, todas las demás fallarán también y por la misma razón,
 * así que conviene tenerla aparte y nombrada.
 */

import { expect, test } from '../fixtures/sesion';

test('con la sesión inyectada se entra sin pasar por el formulario', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  await expect(page).toHaveURL(/\/mejora-continua\/medicion$/);
  await expect(page.getByRole('heading', { name: 'Planes de medición' })).toBeVisible();
});

test('el menú lateral muestra la identidad de la cuenta', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('E2E Editor')).toBeVisible();
});

test.describe('con la cuenta de solo lectura', () => {
  test.use({ rol: 'lector' });

  test('también entra, con su propia identidad', async ({ page }) => {
    await page.goto('/mejora-continua/medicion');

    await expect(page.getByText('E2E Lector')).toBeVisible();
  });
});
