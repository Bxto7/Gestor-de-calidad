import { defineConfig } from 'vitest/config';

/**
 * Pruebas del backend.
 *
 * DESVIACIÓN DE CLAUDE.md §4.2, que fija Jest. Se usa Vitest por tres razones:
 *
 *  1. El paquete es `type: module` y el cliente de Prisma 7 es ESM-first. El
 *     soporte de ESM en Jest todavía exige `--experimental-vm-modules` y un
 *     preset de ts-jest con aristas conocidas.
 *  2. El frontend ya corre Vitest. Un solo runner en el monorepo simplifica el
 *     CI y lo que el equipo tiene que aprender.
 *  3. Las 105 pruebas del dominio del frontend se trasladan aquí sin reescribir
 *     su forma.
 *
 * Es una decisión revisable: si se prefiere Jest por lo que dice §4.2, lo que
 * cambia es la configuración, no las pruebas, porque la API es casi idéntica.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // §2 y §6.6: el umbral del 80% aplica a dominio y aplicación, que es
      // donde viven las reglas de negocio.
      include: ['src/modules/*/domain/**/*.ts', 'src/modules/*/application/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/ports/**', '**/*.types.ts'],
      reporter: ['text', 'html'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
