/**
 * Un recorrido de punta a punta por cada uno de los tres aspectos de Plan de
 * Mejora — RF-PJ-001/002 (aspecto y elemento) hasta RF-PJ-004/005 (enviar a
 * revisión) — sobre las pantallas base construidas en este ciclo (Tasks 5 y
 * 6).
 *
 * El primer recorrido cubre además RF-PJ-006 (definición editable en
 * Borrador, guardado por campo): `DefinicionPlanMejoraDto` ya no exige los
 * seis campos de texto no vacíos a la vez (`plan-mejora.dto.ts`), así que
 * guardar "Nombre de la acción" en un plan recién creado —con el resto de la
 * definición todavía vacía— tiene éxito.
 *
 * Corre alfabéticamente después de `configuracion-evaluacion.spec.ts`, que
 * deja al menos un plan de evaluación Directa en estado Vigente: es la base
 * que el tercer recorrido (Competencia) necesita y que `preparar-e2e.ts` no
 * siembra a propósito, para no reimplementar aquí la máquina de estados de
 * Evaluación.
 *
 * El Criterio de Acreditación (`C-E2E-01`) y el Objetivo Educacional
 * (`OE-E2E-01`) sí los siembra `preparar-e2e.ts`, activos, para la carrera
 * E2E — sin ellos el desplegable "Elemento" no tendría nada que ofrecer en
 * los dos primeros recorridos.
 */

import { expect, test } from '../fixtures/sesion';

test('crear un plan de mejora de Criterio de Acreditación y enviarlo a revisión', async ({
  page,
}) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('CRITERIO_ACREDITACION');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  // RF-PJ-006: el plan nace con la definición vacía (`causaRaiz`,
  // `justificacion`, `recursos`, `metas` y `responsable` todavía sin
  // completar) y "Nombre de la acción" debe poder guardarse igual — cada
  // `onBlur` reenvía el objeto entero, así que esto ejercita justo el caso
  // que antes fallaba con 400 ("causaRaiz must be longer than or equal to 1
  // characters...").
  const nombreDeLaAccion = page.getByLabel('Nombre de la acción');
  await nombreDeLaAccion.fill('Reforzar el syllabus del curso');
  // `onBlur` dispara el PATCH sin esperarlo (`void ejecutar(...)`): hay que
  // esperar la respuesta antes de recargar, o la recarga puede ganarle a la
  // petición todavía en vuelo.
  const guardado = page.waitForResponse(
    (r) => r.url().includes('/definicion') && r.request().method() === 'PATCH',
  );
  await nombreDeLaAccion.blur();
  await guardado;
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Nombre de la acción')).toHaveValue('Reforzar el syllabus del curso');

  // RF-PJ-004/005: Borrador → En revisión.
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.locator('main').getByText('En revisión', { exact: true }).first()).toBeVisible();
});

test('crear un plan de mejora de Objetivo Educacional', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('OBJETIVO_EDUCACIONAL');
  await modal.getByLabel('Elemento').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elemento asociado' })).toBeVisible();

  // La tarjeta "Elemento asociado" pinta el `nombre` del objetivo
  // (`PlanMejoraPage.tsx`, `nombreElemento`), no su `codigo` — igual que la
  // columna "Elemento" del listado (`PlanesMejoraPage.tsx`,
  // `nombreDelElemento`). `OE-E2E-01` no aparece en ningún sitio de esta
  // pantalla, así que lo que hay que comprobar es el nombre sembrado por
  // `criterioYObjetivoDePrueba`.
  await expect(page.getByText('Objetivo educacional de prueba', { exact: false })).toBeVisible();
});

test('crear un plan de mejora de Competencia, filtrado por lo programado en el periodo', async ({
  page,
}) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('button', { name: 'Nuevo plan de mejora' }).click();

  const modal = page.getByRole('dialog');
  await modal.getByLabel('Aspecto').selectOption('COMPETENCIA');

  // RF-PJ-026: solo planes de evaluación Directa, Aprobados o Vigentes —
  // `configuracion-evaluacion.spec.ts` deja al menos uno en Vigente.
  await modal.getByLabel('Plan de evaluación base').selectOption({ index: 1 });
  await modal.getByLabel('Periodo académico').selectOption({ index: 1 });
  await modal.getByLabel('Competencia').selectOption({ index: 1 });
  await modal.getByRole('button', { name: 'Crear' }).click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elemento asociado' })).toBeVisible();

  // RF-PJ-028: distinto de los otros dos aspectos — sin campo Input libre.
  await expect(page.getByLabel('Input')).toHaveCount(0);
});
