/**
 * El recorrido completo de un plan de medición, contra la API real.
 *
 * Es una sola prueba y no seis, a propósito: cada paso depende del estado que
 * dejó el anterior, y partirla obligaría a recrear ese estado en cada una —o a
 * encadenarlas por orden de declaración, que es peor porque lo esconde.
 *
 * Los selectores van por rol accesible y no por clase de CSS: si el nombre
 * accesible cambia, la prueba debe fallar, porque eso es justo lo que percibe
 * quien usa un lector de pantalla.
 */

import { expect, test } from '../fixtures/sesion';

test('crear, configurar, programar y enviar a revisión un plan de medición', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  // ── Alta ────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
  await modal.getByRole('spinbutton', { name: 'Meta (%)*' }).fill('70');
  await modal.getByRole('spinbutton', { name: 'Año de inicio' }).fill('2026');
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(modal).toBeHidden();

  // `.first()` y no el enlace a secas: el listado llega con el más reciente
  // delante, y los planes de otras pruebas —o de una ejecución local anterior
  // sin volver a preparar los datos— siguen ahí. Buscar por el código exacto no
  // vale: lo genera el backend con un correlativo que no se conoce de antemano.
  const enlace = page.getByRole('link', { name: /^PM-PE-E2E-v1-D-v/ }).first();
  await expect(enlace).toBeVisible();
  await enlace.click();

  // Se exige la URL del detalle antes de nada: sin esto, una aserción que
  // casara también en el listado daría por buena una navegación que no ocurrió.
  await expect(page).toHaveURL(/\/mejora-continua\/medicion\/[0-9a-f-]{36}$/);

  // Se espera a un encabezado que SOLO existe en el detalle. `toHaveURL` casa en
  // el instante de navegar, cuando React todavía no ha cambiado el contenido, y
  // `heading level 1` no sirve porque el listado también tiene el suyo. Sin esta
  // espera, la aserción siguiente encuentra los diez «Borrador» del listado y
  // falla al instante: una violación de modo estricto no reintenta.
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await expect(page.locator('main').getByText('Borrador', { exact: true })).toBeVisible();

  // ── Competencias, agrupadas por atributo del graduado (RF-PM-013) ───────
  //
  // Una a una, esperando a que el servidor confirme. No es una precaución de
  // más: la casilla es controlada desde `plan.competenciaIds`, así que su
  // estado llega de la API, y `.check()` —que comprueba el estado justo tras el
  // clic— fallaría siempre. Encadenar los dos clics sin esperar tampoco vale:
  // el segundo calcularía el conjunto a enviar sobre un estado que aún no
  // incluye el primero, y lo perdería.
  const primera = page.getByRole('checkbox', { name: /CPE-E2E01/ });
  await primera.click();
  await expect(primera).toBeChecked();

  const segunda = page.getByRole('checkbox', { name: /CPE-E2E02/ });
  await segunda.click();
  await expect(segunda).toBeChecked();

  await expect(page.getByRole('heading', { name: 'Competencias a medir (2)' })).toBeVisible();

  // ── Periodos: la propuesta rellena, el guardado envía (RF-PM-016) ───────
  await page.getByRole('button', { name: /Usar la propuesta/ }).click();

  // `exact` en todos: sin él, «Cierre de 2026-I» casa también con
  // «Cierre de 2026-II», porque `getByLabel` busca por subcadena.
  const primerCierre = page.getByLabel('Cierre de 2026-I', { exact: true });
  await expect(primerCierre).toBeVisible();

  // Los cuatro, no dos: RF-PM-017 exige la fecha en todos los periodos antes de
  // aprobar, y dejar uno sin fechar mantendría vivo el bloqueante que la
  // aserción de consistencia de más abajo espera no encontrar.
  await primerCierre.fill('2026-07-15');
  await page.getByLabel('Cierre de 2026-II', { exact: true }).fill('2026-12-18');
  await page.getByLabel('Cierre de 2027-I', { exact: true }).fill('2027-07-16');
  await page.getByLabel('Cierre de 2027-II', { exact: true }).fill('2027-12-17');
  await page.getByRole('button', { name: 'Guardar periodos' }).click();

  // ── La matriz, con el ratón ────────────────────────────────────────────
  const celda = page.getByRole('button', { name: 'CPE-E2E01 en 2026-I: no programada' });
  await celda.click();
  await expect(page.getByRole('button', { name: /CPE-E2E01 en 2026-I: pendiente/ })).toBeVisible();

  // ── La matriz, sin ratón: la vía que la cuadrícula no puede dar ─────────
  const fila = page.getByRole('row', { name: /CPE-E2E02/ });
  await fila.getByRole('button', { name: 'Programar periodos' }).click();

  const selector = page.getByRole('dialog');
  await selector.getByRole('checkbox', { name: '2026-II' }).check();
  await selector.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByRole('button', { name: /CPE-E2E02 en 2026-II: pendiente/ })).toBeVisible();

  // ── Consistencia limpia (RF-PM-038) ────────────────────────────────────
  await expect(page.getByText('Sin inconsistencias pendientes')).toBeVisible();

  // ── Transición (RF-PM-006) ─────────────────────────────────────────────
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();

  // `exact` y dentro de `main`: la tarjeta de Historial muestra «Borrador → En
  // revisión», que contiene el mismo texto que el badge de estado.
  await expect(page.locator('main').getByText('En revisión', { exact: true })).toBeVisible();

  // ── RF-PM-007 RN1: fuera de Borrador se cierra la edición ──────────────
  await expect(page.getByLabel('Cierre de 2026-I', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /CPE-E2E01/ })).toBeDisabled();
});
