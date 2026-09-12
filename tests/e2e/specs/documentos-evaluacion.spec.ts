/**
 * RF-PE-031 a RF-PE-042 contra la aplicación entera: documentos, versionado y
 * aprobación del plan de evaluación, de punta a punta.
 *
 * Lo que solo se ve aquí es que las piezas encajen: que el trabajo de
 * documento que encola la API lo recoja de verdad un worker aparte y termine
 * en «Listo» antes de poder descargarse, y que versionar copie la definición
 * del plan pero nunca su seguimiento. Cada pieza por separado ya tiene su
 * propia prueba unitaria o de integración; que funcionen juntas es otra cosa.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/sesion';

/** Crea un plan de evaluación fresco (cualquier base sirve) y abre su detalle. */
async function abrirPlanEvaluacion(page: Page): Promise<void> {
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Plan de medición base*').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  // El más reciente: el repositorio lista de más nuevo a más antiguo, y este
  // acaba de crearse.
  const enlace = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(enlace).toBeVisible();
  await enlace.click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
}

test('generar un PDF y descargarlo', async ({ page }) => {
  await abrirPlanEvaluacion(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByRole('button', { name: 'Generar PDF' }).click();

  // El worker tarda: se espera al estado, no a un tiempo fijo.
  await expect(page.getByText('Listo')).toBeVisible({ timeout: 30_000 });

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar' }).first().click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
});

test.describe('con la cuenta que aprueba', () => {
  // Versionar exige `evaluacion.crear` (RF-PE-042: el mismo permiso que
  // crear) y llevar el plan a Vigente exige `evaluacion.aprobar`. La cuenta
  // por defecto (`e2e-editor`) no tiene el segundo.
  test.use({ rol: 'director' });

  /**
   * Crea un plan sobre la base Indirecta de la semilla y lo lleva a Vigente.
   *
   * La base Indirecta y no la Directa: su única competencia, `CPE-01`, es el
   * código estable que el resto de la suite ya usa en pantalla
   * (`configuracion-indirecta.spec.ts`) — hace falta un nombre accesible fijo
   * para pedir «Porcentaje alcanzado de CPE-01» sin depender de qué
   * competencias trajo la semilla Directa.
   */
  async function abrirPlanEvaluacionVigente(page: Page): Promise<void> {
    await page.goto('/mejora-continua/evaluacion');
    await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();

    const modal = page.getByRole('dialog');
    await modal
      .getByLabel('Plan de medición base*')
      .selectOption({ label: 'PM-PE-E2E-v1-I-v1 — Aprobado' });
    await modal.getByRole('button', { name: 'Crear' }).click();
    await expect(modal).toBeHidden();

    const enlace = page.getByRole('link', { name: /^EV-/ }).first();
    await expect(enlace).toBeVisible();
    await enlace.click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

    // Borrador → En revisión → Aprobado → Vigente, por su ciclo de vida real.
    for (const accion of ['Enviar a revisión', 'Aprobar', 'Marcar como vigente']) {
      await page.getByRole('button', { name: accion }).click();
      await expect(page.getByRole('button', { name: accion })).toHaveCount(0);
    }
    await expect(
      page.locator('main').getByText('Vigente', { exact: true }).first(),
    ).toBeVisible();
    // RF-PE-042: la fecha de aprobación queda junto al plan, no solo en la
    // bitácora — sigue visible aunque el plan ya haya avanzado a Vigente.
    await expect(page.getByText('Aprobado el')).toBeVisible();

    await page.getByLabel('Año a configurar').selectOption({ label: '2026' });
  }

  /** Escribe el porcentaje alcanzado de una competencia del año ya seleccionado y lo guarda. */
  async function registrarPorcentaje(
    page: Page,
    competencia: string,
    valor: string,
  ): Promise<void> {
    await page
      .getByRole('spinbutton', { name: `Porcentaje alcanzado de ${competencia}` })
      .fill(valor);
    await page.getByRole('button', { name: 'Guardar el año' }).click();
    await expect(page.getByText(/Guardado/)).toBeVisible();
  }

  /**
   * Vuelve a una versión del linaje por su correlativo final (p. ej. `v3`).
   *
   * No por un texto corto «v3» suelto: el propio código del plan de estudios
   * de la semilla ya lleva un «v1» incrustado (`PE-E2E-v1`), así que
   * cualquier versión de evaluación lo arrastra en medio de su código
   * (`EV-PE-E2E-v1-I-v3`). Anclar el patrón al final del nombre accesible es
   * lo único que distingue el correlativo real del que solo aparece de paso.
   */
  async function volverA(page: Page, correlativoFinal: string): Promise<void> {
    await page.getByRole('tab', { name: 'Versiones' }).click();
    await page.getByRole('link', { name: new RegExp(`-${correlativoFinal}$`) }).click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  }

  test('generar una versión deja intacta la original', async ({ page }) => {
    await abrirPlanEvaluacionVigente(page);
    // Escribe un porcentaje ANTES de versionar: sin esto, comprobar que la
    // copia no lo arrastra no distingue «no se copió» de «nunca existió».
    await registrarPorcentaje(page, 'CPE-01', '80');

    // El correlativo se lee de pantalla y no se asume «v1 → v2»: otros
    // ficheros de esta suite crean planes de evaluación Indirecta antes que
    // este (`accesibilidad.spec.ts`, `configuracion-indirecta.spec.ts`), y el
    // correlativo de RF-PE-003 es un contador compartido por todos los planes
    // de este tipo — no por linaje —, así que el número real depende del
    // orden de ejecución de la suite.
    const codigoOrigen =
      (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
    const numeroOrigen = codigoOrigen.match(/-v(\d+)$/)?.[1];
    if (!numeroOrigen) {
      throw new Error(`No se pudo leer el correlativo de versión de "${codigoOrigen}".`);
    }
    const correlativoNuevo = `v${Number(numeroOrigen) + 1}`;

    await page.getByRole('tab', { name: 'Versiones' }).click();
    await page.getByRole('button', { name: 'Generar nueva versión' }).click();

    // RF-PE-034: la operación navega directamente a la copia nueva, en
    // Borrador — no hay, desde la página de origen, un enlace a pulsar hacia
    // ella: quien la genera pasa a verla de inmediato.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      new RegExp(`-${correlativoNuevo}$`),
    );

    // La copia nace sin el seguimiento…
    await expect(
      page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' }),
    ).toHaveValue('');

    // …y el origen conserva el suyo.
    await volverA(page, `v${numeroOrigen}`);
    await expect(
      page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' }),
    ).toHaveValue('80');
  });
});
