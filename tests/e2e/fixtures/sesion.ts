/**
 * Pone la sesión en el navegador antes de que la aplicación arranque.
 *
 * `addInitScript` corre en cada documento **antes** de que se ejecute nada de la
 * página, que es lo que hace falta: la aplicación lee `sessionStorage` en su
 * primer render para decidir si redirige a la pantalla de acceso. Escribirlo
 * después de `goto` llegaría tarde.
 *
 * Se usa este `test` en lugar del de `@playwright/test` en todos los specs.
 */

import { test as base, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DIRECTORIO_AUTH, type Rol } from '../global-setup';

/** La misma clave que usa `apps/web/src/shared/api/sesion.ts:16`. */
const CLAVE = 'sgc.sesion';

async function ponerSesion(page: Page, rol: Rol): Promise<void> {
  const sesion = await readFile(join(DIRECTORIO_AUTH, `${rol}.json`), 'utf8');

  await page.addInitScript(
    ([clave, valor]) => {
      window.sessionStorage.setItem(clave!, valor!);
    },
    [CLAVE, sesion],
  );
}

/**
 * Abre una pestaña nueva con la sesión de otro rol, en el mismo contexto.
 *
 * La sesión vive en `sessionStorage`, que es de cada pestaña: esta no toca la de
 * `page`. Sirve para los flujos en que dos roles se reparten los permisos —el
 * Coordinador aprueba los planes de Mejora Continua y el Director aprueba las
 * actas— sin que la prueba tenga que cambiar de cuenta a mitad de camino.
 */
export async function paginaComo(page: Page, rol: Rol): Promise<Page> {
  const otra = await page.context().newPage();
  await ponerSesion(otra, rol);
  return otra;
}

export const test = base.extend<{ rol: Rol }>({
  // Por defecto, quien puede escribir. Un spec lo cambia con
  // `test.use({ rol: 'lector' })`.
  rol: ['editor', { option: true }],

  page: async ({ page, rol }, usar) => {
    await ponerSesion(page, rol);
    await usar(page);
  },
});

export { expect } from '@playwright/test';
