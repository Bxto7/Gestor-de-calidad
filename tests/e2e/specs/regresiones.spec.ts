/**
 * Dos fallos que existieron y que solo aparecen atravesando el sistema entero.
 *
 * Ninguno lo veían las pruebas unitarias, y no por descuido: cada capa hacía
 * exactamente lo que su prueba le pedía. El fallo estaba en la costura.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/sesion';

/**
 * Deja un plan nuevo con dos competencias y los periodos declarados sin fechar.
 *
 * Las competencias se marcan una a una esperando la confirmación del servidor:
 * la casilla es controlada desde `plan.competenciaIds`, así que su estado llega
 * de la API, y encadenar los clics haría que el segundo calculase el conjunto a
 * enviar sobre un estado que aún no incluye el primero.
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
