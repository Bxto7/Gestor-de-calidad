/**
 * Un recorrido de punta a punta por cada uno de los tres aspectos de Plan de
 * Mejora — RF-PJ-001/002 (aspecto y elemento) hasta RF-PJ-004/005 (enviar a
 * revisión) — sobre las pantallas base construidas en este ciclo (Tasks 5 y
 * 6).
 *
 * No cubre RF-PJ-006 (definición editable en Borrador): en un plan recién
 * creado ese guardado por campo nunca tiene éxito (ver el comentario dentro
 * del primer test) — un defecto real, separado del que motivó esta tarea, y
 * fuera de su alcance.
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

  // No se comprueba aquí el guardado de "Nombre de la acción": en un plan
  // recién creado, `causaRaiz`/`justificacion`/`recursos`/`metas`/
  // `responsable` nacen vacíos (`plan-mejora.repository.ts:196-203`) y
  // `DefinicionPlanMejoraDto` exige los cinco no vacíos A LA VEZ en cada PATCH
  // (`plan-mejora.dto.ts:56-95`) — pero `PlanMejoraPage.tsx` guarda un campo
  // por `onBlur`, cada uno con el resto de `datosDefinicionActual(plan)`
  // todavía vacío. Confirmado con un spec de depuración: el primer campo que
  // se intenta guardar responde 400 ("causaRaiz must be longer than or equal
  // to 1 characters..."), así que no hay ninguna secuencia de campos que
  // logre guardar el primero. Es un defecto real y separado del que motivó
  // esta tarea (la navegación tras crear), fuera de su alcance — RF-PJ-004/005
  // (enviar a revisión) no exige la definición completa, así que este
  // recorrido puede seguir sin ella.
  //
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
