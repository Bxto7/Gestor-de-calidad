import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Configuración de pruebas.
 *
 * Separada de `vite.config.ts` a propósito: aquí no hacen falta los plugins de
 * React ni de Tailwind, porque lo que se prueba es el dominio, que es código
 * puro sin JSX ni estilos. Cargarlos solo alargaría cada ejecución.
 *
 * El umbral de cobertura es el RNF que CLAUDE.md §2 y §6.6 fijan en 80%, y se
 * aplica exclusivamente a `domain/`. Medir cobertura sobre componentes de UI
 * daría un número alto y vacío: lo que importa es que las reglas de negocio
 * estén cubiertas, no que un `<div>` se haya renderizado.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/features/*/domain/**/*.ts'],
      // `tipos.ts` solo declara interfaces y constantes: no tiene ramas que
      // cubrir y su presencia distorsionaría el porcentaje hacia arriba.
      exclude: ['**/tipos.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
