/**
 * Para las pruebas que llaman a la API directamente, sin pasar por la pantalla.
 *
 * El token sale del mismo archivo que `sesion.ts` inyecta en el navegador: lo
 * escribió `global-setup` tras iniciar sesión una sola vez por cuenta. No se hace
 * un login nuevo aquí, porque el login admite cinco intentos por minuto y la suite
 * ya gasta los cinco.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DIRECTORIO_AUTH, type Rol } from '../global-setup';

export async function tokenDe(rol: Rol): Promise<string> {
  const sesion = JSON.parse(await readFile(join(DIRECTORIO_AUTH, `${rol}.json`), 'utf8')) as {
    accessToken: string;
  };
  return sesion.accessToken;
}
