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
