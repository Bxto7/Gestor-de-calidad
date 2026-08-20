// @ts-check
/**
 * Configuración de ESLint (flat config) para el frontend del SGC.
 *
 * CLAUDE.md §4.2 marca ESLint + Prettier como no negociables en CI, y §6.6 los
 * incluye en el Definition of Done por PR.
 *
 * Decisiones:
 *
 * - **ESLint 9, no 10.** `eslint-plugin-jsx-a11y` todavía no soporta la 10, y
 *   ese plugin es el que sostiene el objetivo de WCAG 2.1 AA de §6.2. Entre
 *   tener la versión más nueva de ESLint o tener linting de accesibilidad,
 *   pesa más lo segundo.
 *
 * - **Reglas con tipos** (`recommendedTypeChecked`). Sin el type checker, ESLint
 *   no ve promesas sin `await`, comparaciones imposibles ni accesos inseguros;
 *   justo la clase de fallo que un proyecto con `strict: true` quiere atrapar.
 *   Cuesta velocidad de análisis y se acepta a cambio.
 *
 * - **`eslint-config-prettier` va al final.** Apaga las reglas de formato de
 *   ESLint para que no peleen con Prettier. Si se mueve de sitio, vuelven los
 *   conflictos de comillas y comas finales.
 */

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Artefactos generados: `dist` del build y `coverage` del informe de
    // pruebas. Sin excluir `coverage`, ESLint intenta analizar su HTML+JS con
    // reglas que exigen tipos y aborta la ejecución entera.
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/features/auth/pages/*.preview.html',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // CLAUDE.md §2: "Nada de `any` sin justificar con comentario".
      // Error, no warning: un warning se ignora y acaba colándose en main.
      '@typescript-eslint/no-explicit-any': 'error',

      // Permite `_algo` para lo que se descarta a propósito (destructuring,
      // firmas de callback), sin abrir la mano a variables muertas de verdad.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Promesas sin manejar. Es el fallo más caro de esta base de código:
      // una mutación de react-query que falla en silencio deja la UI mintiendo
      // sobre el estado del plan.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        // Los handlers de React (onClick, onChange) declaran `void`; pasarles
        // una función async es idiomático y no un error.
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Archivos de configuración: corren en Node, no en el navegador, y no
  // participan del proyecto de TypeScript de la app.
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
