/**
 * `axe-core` sobre las pantallas del flujo de Mejora Continua.
 *
 * Automatizado no es completo: axe detecta alrededor de un tercio de los
 * problemas reales de accesibilidad. Lo que no puede ver —si el orden de
 * tabulación tiene sentido, si un texto alternativo describe la imagen— sigue
 * necesitando a una persona. Esta suite cubre lo que una máquina sí puede.
 */

import type { Page } from '@playwright/test';

import { analizar } from '../fixtures/axe';
import { expect, test } from '../fixtures/sesion';

/**
 * Crea un plan de evaluación fresco sobre la base Indirecta de la semilla y
 * abre su detalle. Sirve de punto de partida a las dos pruebas de Documentos
 * y Versiones de más abajo.
 *
 * La base Indirecta y no la Directa: este fichero corre alfabéticamente antes
 * que `configuracion-evaluacion.spec.ts`, que depende de que «el plan Directo
 * más reciente» siga siendo el mismo entre sus dos pruebas. Crear aquí un
 * Directo más lo desplazaría. El tipo de plan es irrelevante para lo que estas
 * dos pruebas comprueban.
 */
async function crearPlanEvaluacion(page: Page): Promise<void> {
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
}

test('el listado de planes de medición', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  await expect(page.getByRole('heading', { name: 'Planes de medición' })).toBeVisible();

  await analizar(page, 'el listado de planes de medición');
});

test('el detalle, con su matriz', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();
  await analizar(page, 'el detalle del plan de medición');
});

test('el listado de planes de evaluación', async ({ page }) => {
  await page.goto('/mejora-continua/evaluacion');
  await expect(page.getByRole('heading', { name: 'Planes de evaluación' })).toBeVisible();

  await analizar(page, 'el listado de planes de evaluación');
});

test('el detalle de evaluación, con la cuadrícula de lo heredado', async ({ page }) => {
  // La tabla por atributo con `caption`, `scope="row"` y columna fija es
  // estructura nueva: el resto de la pantalla calca la de medición, pero esa
  // cuadrícula no existía en ninguna otra parte.
  //
  // Filtrado por tipo Directa a propósito: desde la Task 7 la semilla también
  // trae un plan de medición Indirecta, y el test siguiente de este fichero
  // crea su propio plan de evaluación sobre él — sin el filtro, «el más
  // reciente» dejaría de ser fiable en cuanto ese test se ejecutara antes.
  await page.goto('/mejora-continua/evaluacion');
  await page.getByLabel('Filtrar por tipo').selectOption('DIRECTA');
  const primero = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page.getByRole('heading', { name: 'Heredado del plan de medición' })).toBeVisible();

  // RF-PE-013 a RF-PE-021: en 2c-A la matriz base no programaba ningún cruce,
  // así que esta tarjeta solo mostraba su estado vacío y axe nunca llegó a ver
  // un campo de verdad. Con al menos una competencia programada (§ fixture
  // E2E), se despliega una fila real —con su propio selector de asignatura y
  // de docente— antes de analizar.
  await expect(page.getByRole('heading', { name: 'Configuración por competencia' })).toBeVisible();
  await page.getByLabel('Periodo a configurar').selectOption({ label: '2026-I' });
  await page.getByRole('button', { name: 'Añadir asignatura' }).click();

  await analizar(page, 'el detalle del plan de evaluación');
});

test('el detalle de un plan de evaluación indirecta, con sus indicaciones', async ({ page }) => {
  // `ConfiguracionDelAnio` es una tarjeta hermana de la directa, no una rama
  // suya (RF-PE-022 a RF-PE-030): tiene su propia mitad de campos —responsable
  // por competencia e indicaciones por grupo objetivo, sin cruce con
  // asignaturas— que la pantalla directa nunca pinta. Sin abrirla, axe nunca
  // llegaría a analizar el selector de grupo objetivo ni los campos de una
  // indicación.
  //
  // Crea su propio plan de evaluación sobre el plan de medición Indirecta de
  // la semilla (`PM-PE-E2E-v1-I-v1`, Task 7): por orden alfabético este
  // fichero corre antes que `configuracion-indirecta.spec.ts`, que es quien
  // tiene el suyo, y ninguno de los dos puede compartirlo con el otro.
  await page.goto('/mejora-continua/evaluacion');
  await page.getByRole('button', { name: 'Nuevo plan de evaluación' }).click();
  const modal = page.getByRole('dialog');
  await modal
    .getByLabel('Plan de medición base*')
    .selectOption({ label: 'PM-PE-E2E-v1-I-v1 — Aprobado' });
  await modal.getByRole('button', { name: 'Crear' }).click();
  await expect(modal).toBeHidden();

  await page.getByLabel('Filtrar por tipo').selectOption('INDIRECTA');
  const primero = page.getByRole('link', { name: /^EV-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();

  await expect(page.getByRole('heading', { name: 'Heredado del plan de medición' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configuración por competencia' })).toBeVisible();

  // Con contenido real: en 2c-A se analizó el estado vacío y axe no llegó a
  // ver ningún campo. Selecciona el año y añade una indicación antes de
  // analizar, tal como pide la Task 7.
  await page.getByLabel('Año a configurar').selectOption({ label: '2026' });
  await page.getByRole('button', { name: 'Añadir indicación' }).click();

  await analizar(page, 'el detalle del plan de evaluación indirecta');
});

test('los atributos del graduado', async ({ page }) => {
  await page.goto('/acreditacion/atributos');
  await expect(page.getByRole('heading', { name: 'Atributos del Graduado' })).toBeVisible();

  await analizar(page, 'la pantalla de atributos');
});

test('el resumen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Bienvenido/ })).toBeVisible();

  await analizar(page, 'el resumen');
});

test('la pestaña de documentos del plan de evaluación, con un PDF ya generado', async ({
  page,
}) => {
  // Con contenido real: analizar la lista vacía no distingue «sin problemas»
  // de «axe nunca llegó a ver la fila de un documento», que es justo el
  // defecto de 2c-A que esta suite ya corrigió una vez para otras pantallas.
  await crearPlanEvaluacion(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByRole('button', { name: 'Generar PDF' }).click();
  await expect(page.getByText('Listo')).toBeVisible({ timeout: 30_000 });

  await analizar(page, 'la pestaña de documentos del plan de evaluación');
});

test.describe('con la cuenta que aprueba', () => {
  // Generar una versión exige `evaluacion.crear` y aprobar exige
  // `evaluacion.aprobar`; la cuenta por defecto no tiene el segundo.
  test.use({ rol: 'director' });

  test('la pestaña de versiones del plan de evaluación, con un linaje real', async ({ page }) => {
    await crearPlanEvaluacion(page);

    // RF-PE-034 RN: «Generar nueva versión» solo cabe desde Aprobado, Vigente
    // o Histórico — hace falta salir de Borrador primero.
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

    await page.getByRole('tab', { name: 'Versiones' }).click();
    await page.getByRole('button', { name: 'Generar nueva versión' }).click();

    // La operación navega a la copia nueva y reinicia la pestaña activa a
    // Documentos: se espera ese reinicio (evidencia de que la navegación ya
    // ocurrió) antes de volver a pedir Versiones, para no pulsar la pestaña
    // vieja un instante antes de que la página cambie por debajo.
    await expect(page.getByRole('tab', { name: 'Documentos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Versiones' }).click();
    await expect(page.getByRole('link', { name: /^EV-/ })).toBeVisible();

    await analizar(page, 'la pestaña de versiones del plan de evaluación');
  });
});
