/**
 * `axe-core` sobre las pantallas del flujo de Mejora Continua.
 *
 * Automatizado no es completo: axe detecta alrededor de un tercio de los
 * problemas reales de accesibilidad. Lo que no puede ver —si el orden de
 * tabulación tiene sentido, si un texto alternativo describe la imagen— sigue
 * necesitando a una persona. Esta suite cubre lo que una máquina sí puede.
 */

import { analizar } from '../fixtures/axe';
import { expect, test } from '../fixtures/sesion';

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
  await page.goto('/mejora-continua/evaluacion');
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
