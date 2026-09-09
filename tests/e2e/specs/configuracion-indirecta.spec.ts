/**
 * RF-PE-022 a RF-PE-030 contra la aplicación entera: la configuración de un
 * plan de evaluación **indirecta**, un año a la vez.
 *
 * Lo que solo se ve aquí: que el instrumento (dato de competencia, común a
 * todo el plan) sobreviva un cambio de año mientras el porcentaje (dato del
 * año) no; y que un plan Vigente deje registrar el enlace a los resultados de
 * una indicación ya guardada, pero no cambiar su instrucción.
 *
 * La semilla E2E crea un plan de medición DIRECTA (que sigue usando
 * `configuracion-evaluacion.spec.ts`, con «Periodo a configurar») y, desde la
 * Task 7, uno propio INDIRECTA ya Aprobado (`PM-PE-E2E-v1-I-v1`), con dos años
 * —2026 y 2027— y una única competencia, `CPE-01`, programada en ambos.
 * `abrirPlanIndirecto` crea un plan de evaluación nuevo sobre esa base en cada
 * llamada: por orden alfabético este fichero corre antes que
 * `evaluacion.spec.ts`, así que no puede dejarle un plan compartido en un
 * estado que no espere.
 */

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/sesion';

/** Crea un plan de evaluación sobre el plan de medición Indirecta de la semilla y abre su detalle. */
async function abrirPlanIndirecto(page: Page): Promise<void> {
  await page.goto('/mejora-continua/evaluacion');

  await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();
  const modal = page.getByRole('dialog');
  await modal
    .getByLabel('Plan de medición base*')
    .selectOption({ label: 'PM-PE-E2E-v1-I-v1 — Aprobado' });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  // El más reciente: el repositorio lista de más nuevo a más antiguo, y este
  // acaba de crearse.
  const enlace = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(enlace).toBeVisible();
  await enlace.click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configuración por competencia' })).toBeVisible();
}

/** Borrador → En revisión → Aprobado → Vigente, con la cuenta que puede aprobar. */
async function llevarAVigente(page: Page): Promise<void> {
  for (const accion of ['Enviar a revisión', 'Aprobar', 'Marcar como vigente']) {
    await page.getByRole('button', { name: accion }).click();
    await expect(page.getByRole('button', { name: accion })).toHaveCount(0);
  }
  await expect(page.locator('main').getByText('Vigente', { exact: true }).first()).toBeVisible();
}

test('configurar un año deja los demás intactos', async ({ page }) => {
  await abrirPlanIndirecto(page);
  await page.getByLabel('Año a configurar').selectOption({ label: '2026' });

  await page.getByRole('textbox', { name: 'Instrumento de CPE-01' }).fill('Encuesta');
  // El porcentaje TAMBIÉN se escribe: sin esto, la aserción sobre 2027 no
  // distingue «el porcentaje es por año» de «nunca se guardó». Es el defecto
  // exacto que 2c-B dejó pasar en su recorrido equivalente.
  await page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' }).fill('80');
  await page.getByRole('button', { name: 'Guardar el año' }).click();
  await expect(page.getByText(/Guardado/)).toBeVisible();

  await page.getByLabel('Año a configurar').selectOption({ label: '2027' });

  // El instrumento es común a todos los años (RF-PE-022 RN1): sigue puesto.
  await expect(page.getByRole('textbox', { name: 'Instrumento de CPE-01' })).toHaveValue(
    'Encuesta',
  );
  // El porcentaje es por año (RF-PE-027): 2027 sigue vacío.
  await expect(page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' })).toHaveValue(
    '',
  );
});

test.describe('con la cuenta que aprueba', () => {
  // `e2e-editor` (COORDINADOR_ACADEMICO) no tiene `evaluacion.aprobar` — solo
  // `e2e-director` (DIRECTOR_CARRERA) puede llevar el plan a Vigente, y ambas
  // cuentas están en la misma carrera E2E que este plan, como exigen los
  // permisos acotados por carrera de este ciclo.
  test.use({ rol: 'director' });

  test('un plan Vigente deja registrar resultados pero no cambiar la instrucción', async ({
    page,
  }) => {
    await abrirPlanIndirecto(page);
    await page.getByLabel('Año a configurar').selectOption({ label: '2026' });

    await page.getByRole('button', { name: 'Añadir indicación' }).click();
    await page
      .getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' })
      .selectOption('EGRESADOS');
    await page
      .getByRole('textbox', { name: 'Instrucción para EGRESADOS' })
      .fill('Encuesta a egresados');
    await page
      .getByRole('textbox', { name: 'Enlace al instrumento para EGRESADOS' })
      .fill('https://forms.example/egresados');
    await page.getByRole('button', { name: 'Guardar el año' }).click();
    await expect(page.getByText(/Guardado/)).toBeVisible();

    await llevarAVigente(page);

    await expect(page.getByRole('textbox', { name: 'Instrucción para EGRESADOS' })).toBeDisabled();
    await page
      .getByRole('textbox', { name: 'Enlace a los resultados para EGRESADOS' })
      .fill('https://drive.example/resultados');
    await page.getByRole('button', { name: 'Guardar el año' }).click();
    await expect(page.getByText(/Guardado/)).toBeVisible();
  });
});
