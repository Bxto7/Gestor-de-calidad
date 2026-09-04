import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Configuración de pruebas.
 *
 * Separada de `vite.config.ts` a propósito: aquí no hace falta Tailwind, porque
 * las pruebas no miran estilos. El plugin de React sí, desde que hay pruebas de
 * componente: sin él, el JSX de un `.test.tsx` no se transforma.
 *
 * El entorno por defecto sigue siendo `node`. Las pruebas de dominio son código
 * puro y montarles un DOM solo las haría más lentas; las de componente piden
 * `jsdom` con un docblock en su primera línea:
 *
 *     /** @vitest-environment jsdom *\/
 *
 * El umbral de cobertura es el RNF que CLAUDE.md §2 y §6.6 fijan en 80%, y se
 * aplica exclusivamente a `domain/`. Medir cobertura sobre componentes de UI
 * daría un número alto y vacío: lo que importa es que las reglas de negocio
 * estén cubiertas, no que un `<div>` se haya renderizado.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/pruebas/preparar.ts'],
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
