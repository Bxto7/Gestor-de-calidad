/**
 * Comprueba que el andamiaje funciona: el navegador arranca, sirve el bundle
 * construido y la aplicación redirige a la pantalla de acceso sin sesión.
 *
 * Si esta prueba falla, el problema es la configuración y no el flujo que se
 * estuviera escribiendo.
 */

import { expect, test } from '@playwright/test';

test('sin sesión, la aplicación lleva a la pantalla de acceso', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});

test('el proxy de `vite preview` alcanza la API', async ({ request }) => {
  // Sin `preview.proxy` en vite.config.ts, esto devolvería el index.html con un
  // 200 en vez del 401 de la API, y todas las pruebas siguientes fallarían al
  // intentar leer HTML como JSON.
  const r = await request.get('/api/v1/planes-medicion');

  expect(r.status()).toBe(401);
});
