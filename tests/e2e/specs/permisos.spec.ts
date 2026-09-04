/**
 * Con `medicion.leer` a secas no debe aparecer ninguna puerta de escritura.
 *
 * No es seguridad —esa la aplica el backend en cada petición— sino no ofrecer
 * una puerta que se cierra en la cara: quien pulsara solo vería un 403.
 *
 * La comprobación es por ausencia y en bloque, no botón a botón: una lista de
 * nombres concretos envejecería mal, y el día que alguien añada un botón nuevo
 * sin condicionarlo al permiso, esta prueba lo ve y una lista no.
 */

import { expect, test } from '../fixtures/sesion';

test.use({ rol: 'lector' });

test('el listado no ofrece dar de alta', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  await expect(page.getByRole('heading', { name: 'Planes de medición' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo plan de medición' })).toHaveCount(0);
});

test('el detalle no tiene ni un campo editable ni una celda pulsable', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  // Que la pantalla haya cargado de verdad antes de contar ausencias: sin esto
  // la prueba pasaría también con el detalle a medio pintar, que es cuando no
  // hay nada de nada.
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  // Ningún campo de fecha, ninguna casilla habilitada.
  await expect(page.locator('main input[type=date]')).toHaveCount(0);
  await expect(page.locator('main input[type=checkbox]:not([disabled])')).toHaveCount(0);

  // Ninguna celda de la matriz pulsable.
  await expect(page.locator('main table button:not([disabled])')).toHaveCount(0);
});

/**
 * Esta comprueba que el menú filtra por permiso, no que lo haga distinto para
 * el lector: ninguna entrada del menú separa a las dos cuentas de prueba.
 * Ambas tienen `medicion.leer`, `atributo.leer`, `criterio.leer` y `plan.leer`;
 * lo que las diferencia son los permisos de escritura, y el menú no los mira.
 *
 * «Usuarios» exige `usuario.gestionar`, que solo tiene ADMIN_SISTEMA, así que
 * su ausencia demuestra que el filtro existe y funciona. Se deja dicho para que
 * nadie la lea como una prueba del rol de solo lectura, que no lo es.
 */
test('el menú esconde las entradas cuyo permiso falta', async ({ page }) => {
  await page.goto('/');

  const navegacion = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(navegacion.getByRole('link', { name: 'Planes de Medición' })).toBeVisible();
  await expect(navegacion.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
});
