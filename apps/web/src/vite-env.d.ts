/// <reference types="vite/client" />

/**
 * Variables de entorno propias.
 *
 * Declararlas aquí las convierte en `string | undefined` tipado en vez de
 * `any`: quien escriba mal el nombre lo sabrá al compilar y no al desplegar.
 */
interface ImportMetaEnv {
  /** Base de la API. Solo hace falta si no comparte origen con el frontend. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Da tipos a los imports de assets (`.png`, `.svg`, `.webp`…) que resuelve Vite.
// Sin esto, TypeScript marca `import logo from './logo.png'` como módulo inexistente.
