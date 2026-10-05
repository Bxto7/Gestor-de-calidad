/**
 * Pasos de pantalla para armar un acta de aprobación, compartidos por las pruebas de
 * accesibilidad y las de alcance por carrera. Se mueven aquí desde
 * `accesibilidad.spec.ts` sin cambiar su comportamiento.
 */

import type { Page } from '@playwright/test';

import { completarDefinicion } from './plan-mejora';
import { expect, paginaComo } from './sesion';

/**
 * Crea un plan de mejora fresco (Criterio de Acreditación) y abre su detalle.
 * Sirve de punto de partida a las pruebas de Documentos y Versiones del plan y a las
 * actas, que cargan sus acciones de los planes Aprobados.
 */
export async function crearPlanMejora(page: Page): Promise<void> {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

/**
 * Crea un acta de aprobación fresca en Borrador y abre su detalle. El periodo
 * lleva la hora para que dos corridas seguidas sin reiniciar la base no choquen
 * ni se confundan entre sí.
 */
export async function crearActa(page: Page): Promise<void> {
  await page.goto('/mejora-continua/actas');
  await page.getByRole('button', { name: 'Nueva acta' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Periodo académico*').fill(`E2E-AXE-${Date.now()}`);
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Cabecera del acta' })).toBeVisible();
}

/** El identificador del acta que muestra la pantalla (último segmento de la URL). */
export function idDeLaPagina(page: Page): string {
  return page.url().split('/').pop()!;
}

/**
 * Pulsa un botón del acta y espera a que el servidor confirme el cambio (una
 * escritura a `/actas/...` con respuesta correcta). El acta se arma paso a paso y
 * cada paso valida contra lo ya guardado: pulsar «Enviar a revisión» antes de que
 * el servidor tenga la cabecera fallaría con «Hay inconsistencias bloqueantes» sin
 * decir cuál.
 */
export async function pulsarYEsperarGuardado(page: Page, nombre: string): Promise<void> {
  const [respuesta] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() !== 'GET' && new URL(r.url()).pathname.includes('/actas/'),
    ),
    page.getByRole('button', { name: nombre, exact: true }).click(),
  ]);
  expect(respuesta.ok(), `«${nombre}» no se guardó (${respuesta.status()}).`).toBe(true);
}

/**
 * Deja un acta En revisión, recorriendo la interfaz como lo haría quien la arma.
 *
 * Enviar a revisión exige la validación integral de RF-AC-016: cabecera, un asistente,
 * al menos una acción incluida y los datos de emisión. Las acciones salen de los planes
 * de mejora Aprobados de la carrera que no estén ya en un acta emitida, así que cada
 * llamada aprueba antes su propio plan de mejora: no depende de lo que hayan dejado
 * otros ficheros ni de que una corrida anterior no lo haya gastado.
 * Los permisos se reparten: `page` va con la cuenta `director` (`actas.*`) y el plan
 * de mejora lo aprueba el Coordinador (`mejora.aprobar`) en una pestaña aparte.
 */
export async function crearActaEnRevision(page: Page): Promise<void> {
  const coordinador = await paginaComo(page, 'editor');
  try {
    await crearPlanMejora(coordinador);
    await completarDefinicion(coordinador);
    await coordinador.getByRole('button', { name: 'Enviar a revisión' }).click();
    await coordinador.getByRole('button', { name: 'Aprobar', exact: true }).click();
    // Sin cerrar antes: la pestaña abandonaría la página antes de que el servidor
    // termine de aprobar el plan, y el acta no encontraría ninguna acción que cargar.
    await expect(coordinador.getByRole('button', { name: 'Aprobar', exact: true })).toBeHidden();
  } finally {
    await coordinador.close();
  }

  await crearActa(page);
  await page.getByLabel('Convocada por').fill('Dirección de la carrera');
  await page.getByLabel('Fecha de reunión').fill('2026-09-01');
  await page.getByLabel('Lugar de reunión').fill('Sala de reuniones');
  await page.getByLabel('Lugar de emisión').fill('Huancayo');
  await page.getByLabel('Fecha de emisión').fill('2026-09-02');
  await pulsarYEsperarGuardado(page, 'Guardar cabecera');

  await page.getByRole('button', { name: 'Agregar asistente' }).click();
  await page.getByLabel('Asistente 1').fill('E2E Director');
  await pulsarYEsperarGuardado(page, 'Guardar asistentes');

  await pulsarYEsperarGuardado(page, 'Cargar acciones del periodo');
  const acciones = page.getByRole('table', { name: 'Acciones de mejora incluidas en el acta' });
  await expect(acciones.getByRole('checkbox').first()).toBeChecked();

  await pulsarYEsperarGuardado(page, 'Enviar a revisión');
  // Aprobar solo aparece con el acta ya En revisión: esperarlo confirma que el
  // servidor y la pantalla coinciden antes de que la prueba haga nada más.
  await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toBeVisible();
}

/** Lo mismo que `crearActaEnRevision`, y además la aprueba (RF-AC-014). */
export async function crearActaAprobada(page: Page): Promise<void> {
  await crearActaEnRevision(page);
  await pulsarYEsperarGuardado(page, 'Aprobar');
  await expect(page.getByRole('note')).toContainText(
    'Esta acta está Aprobada y no admite cambios.',
  );
}
