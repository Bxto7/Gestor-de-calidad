/**
 * RF-PJ-032 a RF-PJ-038 contra la aplicación entera: documentos, versionado y
 * búsqueda del plan de mejora, de punta a punta.
 *
 * Lo que solo se ve aquí es que las piezas encajen: que el trabajo de
 * documento que encola la API lo recoja de verdad un worker aparte y termine
 * en «Listo» antes de poder descargarse, que generar una versión navegue al
 * plan nuevo y lo deje visible en su propio linaje, y que el filtro de texto
 * de la lista de verdad reduzca lo que se ve. Cada pieza por separado ya tiene
 * su propia prueba unitaria o de integración (Tasks 1-11); que funcionen
 * juntas es otra cosa.
 *
 * Desviaciones respecto al esbozo de la Task 12 del plan, verificadas contra
 * el código real antes de escribir (ver task-12-report.md):
 * - «Descargar» es un `<button>`, no un `<a>` (`DocumentosDelPlanMejora.tsx`):
 *   el token de sesión vive en `sessionStorage` y no en una cookie, así que un
 *   enlace directo al endpoint llegaría sin autorización. Se comprueba con
 *   `getByRole('button', ...)`.
 * - No se navega a un plan cualquiera del listado con `getByRole('link', {
 *   name: /^PJ-/ })`: crear vía el modal ya deja a quien lo hace en el detalle
 *   del plan recién creado (`onCreado` en `PlanesMejoraPage.tsx`), que es el
 *   mismo patrón que ya usan `plan-mejora.spec.ts` y el `crearPlanMejora` de
 *   `accesibilidad.spec.ts` — más determinista que depender de qué plan quedó
 *   primero en una lista que otros ficheros de la suite también alimentan.
 * - Generar una nueva versión exige que el plan ya no esté en Borrador
 *   (`permiteVersionado`) y el permiso `mejora.crear`, y aprobarlo hasta ahí
 *   exige `mejora.aprobar` — solo el rol `director` tiene los dos a la vez
 *   (`prisma/seed.ts`), igual que en `accesibilidad.spec.ts` y
 *   `documentos-evaluacion.spec.ts`.
 */

import type { Page } from '@playwright/test';

import { completarDefinicion } from '../fixtures/plan-mejora';
import { expect, test } from '../fixtures/sesion';

/** Crea un plan de mejora fresco (Criterio de Acreditación) y abre su detalle. */
async function crearPlanMejora(page: Page): Promise<void> {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

test('exportar un PDF del plan de mejora y verlo listo', async ({ page }) => {
  await crearPlanMejora(page);

  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByRole('button', { name: 'Generar PDF' }).click();

  // El worker tarda: se espera al estado, no a un tiempo fijo (mismo patrón
  // que `documentos-evaluacion.spec.ts`).
  await expect(page.getByText('Listo')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Descargar' }).first()).toBeVisible();
});

test.describe('con la cuenta que aprueba', () => {
  // Versionar exige `mejora.crear` y llevar el plan hasta Aprobado exige
  // `mejora.aprobar` (RF-PJ-044: quien construye no da el visto bueno). La
  // cuenta por defecto (`editor`) tiene el primero pero no el segundo.
  test.use({ rol: 'director' });

  test('generar una nueva versión y verla en el linaje', async ({ page }) => {
    await crearPlanMejora(page);

    // RF-PJ-035 RN: «Generar nueva versión» solo cabe desde Aprobado, Vigente
    // o Histórico — hace falta salir de Borrador primero, y RF-PJ-042 no deja
    // salir con la definición incompleta.
    await completarDefinicion(page);
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

    await page.getByRole('tab', { name: 'Versiones' }).click();
    await page.getByRole('button', { name: 'Generar nueva versión' }).click();

    await expect(page).toHaveURL(/\/mejora-continua\/mejora\/[0-9a-f-]{36}$/);
    // La operación reinicia la pestaña activa a Definición
    // (`useState<Pestana>('definicion')` en `PlanMejoraPage.tsx`): se espera
    // ese reinicio como evidencia de que la navegación ya ocurrió, antes de
    // volver a pedir Versiones.
    await expect(page.getByRole('tab', { name: 'Definición' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Versiones' }).click();
    await expect(page.getByText(/viendo esta/i)).toBeVisible();
  });
});

test('buscar por texto filtra el listado', async ({ page }) => {
  // Plan propio y no uno cualquiera del listado: otros ficheros de la suite
  // también crean planes de mejora para la misma carrera, así que depender de
  // "el primero" o de un conteo total ajeno sería frágil. Se filtra por el
  // propio código, que es único.
  await crearPlanMejora(page);
  const codigo = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  expect(codigo).toMatch(/^PJ-/);

  await page.goto('/mejora-continua/mejora');
  const searchbox = page.getByRole('searchbox', { name: /buscar/i });

  await searchbox.fill(codigo);
  await expect(page.getByRole('link', { name: codigo, exact: true })).toBeVisible();

  await searchbox.fill('un-texto-que-no-existe-en-ningun-plan-de-mejora');
  await expect(page.getByText(/no hay planes de mejora/i)).toBeVisible();
  await expect(page.getByRole('link', { name: codigo, exact: true })).toHaveCount(0);
});
