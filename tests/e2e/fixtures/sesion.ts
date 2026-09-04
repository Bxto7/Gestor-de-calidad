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

import { test as base } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DIRECTORIO_AUTH, type Rol } from '../global-setup';

/** La misma clave que usa `apps/web/src/shared/api/sesion.ts:16`. */
const CLAVE = 'sgc.sesion';

export const test = base.extend<{ rol: Rol }>({
  // Por defecto, quien puede escribir. Un spec lo cambia con
  // `test.use({ rol: 'lector' })`.
  rol: ['editor', { option: true }],

  page: async ({ page, rol }, usar) => {
    const sesion = await readFile(join(DIRECTORIO_AUTH, `${rol}.json`), 'utf8');

    await page.addInitScript(
      ([clave, valor]) => {
        window.sessionStorage.setItem(clave!, valor!);
      },
      [CLAVE, sesion],
    );

    await usar(page);
  },
});

export { expect } from '@playwright/test';
