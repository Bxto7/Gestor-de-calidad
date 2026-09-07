/**
 * Fallos que existieron y que solo aparecen atravesando el sistema entero.
 *
 * Ninguno lo veían las pruebas unitarias, y no por descuido: cada capa hacía
 * exactamente lo que su prueba le pedía. El fallo estaba en la costura.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/sesion';

/**
 * Deja un plan nuevo con dos competencias y los periodos declarados sin fechar.
 *
 * Las competencias se marcan una a una esperando la confirmación del servidor.
 * Encadenarlas también funciona desde que la caché se adelanta —lo congela la
 * regresión del final de este archivo—, pero aquí interesa llegar a los
 * periodos con un estado del que no quepa dudar.
 */
async function planConPeriodos(page: Page): Promise<void> {
  await page.goto('/mejora-continua/medicion');
  await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
  await modal.getByRole('spinbutton', { name: 'Año de inicio' }).fill('2026');
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  await page
    .getByRole('link', { name: /^PM-PE-E2E-v1-D-v/ })
    .first()
    .click();

  const primera = page.getByRole('checkbox', { name: /CPE-E2E01/ });
  await primera.click();
  await expect(primera).toBeChecked();

  const segunda = page.getByRole('checkbox', { name: /CPE-E2E02/ });
  await segunda.click();
  await expect(segunda).toBeChecked();

  await page.getByRole('button', { name: /Usar la propuesta/ }).click();
  await page.getByRole('button', { name: 'Guardar periodos' }).click();
  await expect(page.getByRole('heading', { name: 'Periodos (4)' })).toBeVisible();
}

test('fechar los periodos no borra la programación de la matriz', async ({ page }) => {
  // `declararPeriodos` borra y recrea las filas, así que la cascada de
  // `Programacion.periodo` se llevaba toda la matriz. Como RF-PM-017 exige la
  // fecha de cierre para aprobar, y fijarla obliga a reenviar la lista entera,
  // todo plan perdía su matriz justo antes de aprobarse.
  await planConPeriodos(page);

  await page.getByRole('button', { name: 'CPE-E2E01 en 2026-I: no programada' }).click();
  await expect(page.getByRole('button', { name: /CPE-E2E01 en 2026-I: pendiente/ })).toBeVisible();

  await page.getByLabel('Cierre de 2026-I', { exact: true }).fill('2026-07-15');

  // Se espera a la respuesta del PUT antes de seguir. Sin esto la aserción de
  // más abajo leería el DOM anterior al guardado —donde la celda todavía está
  // programada— y pasaría incluso con el fallo reintroducido. Comprobado
  // revirtiendo el arreglo: la primera versión de esta prueba pasaba igual.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/periodos') && r.request().method() === 'PUT' && r.ok(),
    ),
    page.getByRole('button', { name: 'Guardar periodos' }).click(),
  ]);

  // Y se recarga: lo que importa es que el dato sobrevivió en el servidor, no
  // que la pantalla siga pintando lo que tenía en memoria.
  await page.reload();

  await expect(page.getByRole('button', { name: /CPE-E2E01 en 2026-I: pendiente/ })).toBeVisible();
});

test('los hallazgos nombran las competencias por su código, no por su UUID', async ({ page }) => {
  // El motor recibía `competenciaIds: string[]` y emitía el id porque era lo
  // único que tenía. Con los periodos declarados y ninguna celda programada,
  // RF-PM-025 dispara y nombra las dos competencias.
  await planConPeriodos(page);

  const hallazgo = page.getByRole('listitem').filter({ hasText: 'RF-PM-025' });

  await expect(hallazgo).toContainText('CPE-E2E01');
  await expect(hallazgo).toContainText('CPE-E2E02');
  // Ningún UUID: ocho hexadecimales, un guion y cuatro más.
  await expect(hallazgo).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}/);
});

/**
 * Marcar dos competencias sin esperar entre una y otra perdía la primera.
 *
 * La casilla se controla desde `plan.competenciaIds`, que llega de la caché de
 * react-query y solo cambiaba cuando la mutación terminaba y el refetch volvía.
 * Dentro de esa ventana —un viaje completo al servidor— el segundo clic
 * calculaba el conjunto a enviar sobre el plan de antes del primero, y lo
 * pisaba. Se arregló adelantando la caché al mutar, con restauración si falla.
 *
 * Solo se ve aquí: el componente hacía lo correcto con lo que le daban, y su
 * prueba unitaria pasaba. El fallo estaba en lo que le daban.
 */
test('marcar dos competencias seguidas no pierde la primera', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
  await modal.getByRole('spinbutton', { name: 'Año de inicio' }).fill('2026');
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  await page
    .getByRole('link', { name: /^PM-PE-E2E-v1-D-v/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  // Se cuentan las respuestas, y no se esperan con dos `waitForResponse`: dos
  // esperas con el mismo predicado se enganchan las dos a la primera respuesta,
  // y la recarga abortaría la segunda escritura antes de que saliera.
  const guardados: number[] = [];
  page.on('response', (r) => {
    if (/\/competencias$/.test(r.url())) guardados.push(r.status());
  });

  // Seguidos, sin esperar confirmación entre uno y otro: es el gesto de quien
  // configura un plan marcando competencias una detrás de otra.
  await page.getByRole('checkbox', { name: /CPE-E2E01/ }).click();
  await page.getByRole('checkbox', { name: /CPE-E2E02/ }).click();

  // Se espera a que las dos escrituras terminen, y no a que la pantalla se vea
  // bien: la pantalla adelanta el cambio, así que afirmar sobre ella sin esto
  // pasaría aunque no se hubiera guardado nada. Recargar después lee lo que la
  // base tiene de verdad — con el fallo, «(1)».
  await expect.poll(() => guardados).toEqual([200, 200]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Competencias a medir (2)' })).toBeVisible();
});

/**
 * La escritura vieja no puede pisar a la nueva por llegar más tarde.
 *
 * Las dos son lee-modifica-escribe sobre el plan entero, así que dos en vuelo a
 * la vez se resuelven por orden de llegada, y ese orden no lo decide el
 * cliente. En una red normal la primera vuelve antes y no se nota; con la
 * primera retrasada a propósito, sí. Por eso las escrituras de un mismo plan
 * van en fila (`scope` de react-query): sin eso, esta prueba deja el plan con
 * una competencia — comprobado quitándolo.
 */
test('una escritura lenta no pisa a la que salió después', async ({ page }) => {
  let retrasada = false;
  await page.route(/\/competencias$/, async (ruta) => {
    if (!retrasada) {
      retrasada = true;
      await new Promise((seguir) => setTimeout(seguir, 800));
    }
    await ruta.continue();
  });

  await page.goto('/mejora-continua/medicion');
  await page.getByRole('button', { name: 'Nuevo plan de medición' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de estudios*').selectOption({ label: 'PE-E2E-v1 — Vigente' });
  await modal.getByRole('spinbutton', { name: 'Año de inicio' }).fill('2026');
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  await page
    .getByRole('link', { name: /^PM-PE-E2E-v1-D-v/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  const guardados: number[] = [];
  page.on('response', (r) => {
    if (/\/competencias$/.test(r.url())) guardados.push(r.status());
  });

  await page.getByRole('checkbox', { name: /CPE-E2E01/ }).click();
  await page.getByRole('checkbox', { name: /CPE-E2E02/ }).click();

  await expect.poll(() => guardados, { timeout: 15_000 }).toEqual([200, 200]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Competencias a medir (2)' })).toBeVisible();
});
