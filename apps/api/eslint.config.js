// @ts-check
/**
 * Configuración de ESLint (flat config) para el backend del SGC.
 *
 * CLAUDE.md §4.2 marca ESLint + Prettier como no negociables en CI y §6.6 los
 * incluye en el Definition of Done. El backend se quedó sin ellos mientras el
 * frontend sí los tenía; esto cierra esa asimetría.
 *
 * Decisiones:
 *
 * - **Reglas con tipos** (`recommendedTypeChecked`). En una base con Prisma y
 *   NestJS casi todo devuelve una promesa, y una promesa sin `await` en un caso
 *   de uso significa un evento de auditoría que nunca se escribe o una
 *   transacción que se da por buena antes de confirmarse. Sin el type checker,
 *   ESLint no puede verlas.
 *
 * - **TypeScript 5.9, no 7.** `typescript-eslint` todavía no soporta el
 *   compilador nativo, y el backend estaba en 7 solo por ser la última versión.
 *   Alinearlo con el frontend da linting con tipos en los dos lados y un único
 *   compilador en el monorepo. Conviene revisarlo cuando salga soporte.
 *
 * - **`eslint-config-prettier` va al final**, para apagar las reglas de formato
 *   que pelearían con Prettier.
 */

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // `generated/` es el cliente de Prisma: no se escribe a mano y analizarlo
    // solo produce ruido. `coverage/` es HTML de informe; sin excluirlo, las
    // reglas con tipos abortan la ejecución entera.
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/platform/database/generated/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // §2: "Nada de `any` sin justificar con comentario".
      '@typescript-eslint/no-explicit-any': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // La regla que más justifica el coste del análisis con tipos aquí: §3.4
      // exige que toda mutación relevante emita su evento de auditoría, y un
      // `this.eventos.publicar(...)` sin `await` lo deja al azar.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Los decoradores de NestJS declaran clases cuyos métodos no usan `this`
      // en los casos triviales; no es un olor de código aquí.
      '@typescript-eslint/class-methods-use-this': 'off',

      // `process.env['DATABASE_URL']` no es una preferencia de estilo: el tipo
      // `ProcessEnv` es una firma de índice, y los corchetes dejan a la vista
      // que la clave puede no existir. La opción conserva la regla donde sí
      // importa —`objeto['propiedadFija']`— sin pelearse con las variables de
      // entorno.
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],

      // Desactivada a conciencia. Un puerto declara `Promise<T>` porque puede
      // haber E/S al otro lado, no porque tenga que haberla: `AuthorizationAdapter`
      // resuelve de memoria y un doble de prueba devuelve un valor fijo. Marcar
      // esas implementaciones como error empujaría a envolverlas en promesas
      // artificiales o a partir los puertos en variantes síncronas y asíncronas,
      // que es justo el acoplamiento que §3.2 evita. `no-floating-promises`, que
      // sí atrapa fallos reales, sigue activa.
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Las pruebas montan dobles a propósito: exigirles la misma disciplina de
  // tipos que al código de producción obliga a escribir mocks completos que no
  // aportan nada. Se relaja lo justo, no las reglas de corrección.
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Un doble que no hace nada —un publicador de eventos que se descarta—
      // se escribe como cuerpo vacío, y eso es exactamente lo que quiere decir.
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  // Archivos de configuración y scripts sueltos: no participan del proyecto de
  // TypeScript de la aplicación.
  {
    files: ['*.config.{js,ts}', 'prisma.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
