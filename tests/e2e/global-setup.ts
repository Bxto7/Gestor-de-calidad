/**
 * Inicia sesión una vez por rol y deja los tokens en `.auth/`.
 *
 * Una vez, no una por prueba: `sesion.controller.ts:33` limita el acceso a cinco
 * intentos por minuto y ese número está en el código, no en una variable de
 * entorno —`THROTTLE_LIMIT` gobierna el resto de la API, pero no el login—. Una
 * suite que navegara el formulario en cada prueba se ahogaría en la sexta.
 *
 * Son dos peticiones por rol porque el login no devuelve el id del usuario:
 * `/auth/login` da los tokens y el nombre, y `/auth/yo` completa la identidad.
 * Es exactamente lo que hace `auth.api.ts` en el navegador.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api/v1';
const AQUI = dirname(fileURLToPath(import.meta.url));

export const DIRECTORIO_AUTH = join(AQUI, '.auth');

export const CUENTAS = {
  editor: { email: 'e2e-editor@sgc.local' },
  lector: { email: 'e2e-lector@sgc.local' },
} as const;

export type Rol = keyof typeof CUENTAS;

/** La misma forma que guarda `apps/web/src/shared/api/sesion.ts`. */
interface Sesion {
  accessToken: string;
  refreshToken: string;
  usuario: { id: string; nombre: string };
}

async function entrar(email: string, password: string): Promise<Sesion> {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!login.ok) {
    // El 429 se distingue del resto porque su causa y su remedio son otros: no
    // falta ningún dato, es que `sesion.controller.ts:33` limita el acceso a
    // cinco por minuto y la suite se ha ejecutado varias veces seguidas. Sin
    // este mensaje, quien lo vea irá a revisar los scripts y no encontrará nada.
    if (login.status === 429) {
      throw new Error(
        'Demasiados intentos de acceso: el login admite cinco por minuto y esta ' +
          'suite gasta dos por ejecución. Espera un minuto y vuelve a lanzarla.',
      );
    }

    throw new Error(
      `No se pudo iniciar sesión como ${email} (${login.status}). ` +
        'Comprueba que `scripts/preparar-e2e.ts` y `scripts/crear-usuario.ts` se ejecutaron.',
    );
  }

  const datos = (await login.json()) as {
    accessToken: string;
    refreshToken: string;
    usuario: { nombre: string };
  };

  const yo = await fetch(`${API}/auth/yo`, {
    headers: { authorization: `Bearer ${datos.accessToken}` },
  });
  if (!yo.ok) throw new Error(`/auth/yo respondió ${yo.status} para ${email}.`);
  const identidad = (await yo.json()) as { id: string; nombre: string };

  return {
    accessToken: datos.accessToken,
    refreshToken: datos.refreshToken,
    usuario: { id: identidad.id, nombre: identidad.nombre },
  };
}

export default async function globalSetup(): Promise<void> {
  const r = await fetch(`${API}/planes-medicion`).catch(() => null);

  // 401 es la respuesta correcta sin sesión: la API está viva y protegida.
  if (!r || r.status !== 401) {
    throw new Error(
      `La API no responde en ${API} como se espera (se recibió ${r ? r.status : 'nada'}). ` +
        'Arráncala con `cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start`.',
    );
  }

  const password = process.env['SGC_E2E_PASSWORD'];
  if (!password) {
    throw new Error(
      'Falta SGC_E2E_PASSWORD. Es la contraseña de las cuentas que crea `preparar-e2e`.',
    );
  }

  await mkdir(DIRECTORIO_AUTH, { recursive: true });

  let editor: Sesion | null = null;
  for (const [rol, cuenta] of Object.entries(CUENTAS)) {
    const sesion = await entrar(cuenta.email, password);
    if (rol === 'editor') editor = sesion;
    await writeFile(join(DIRECTORIO_AUTH, `${rol}.json`), JSON.stringify(sesion), 'utf8');
  }

  if (editor) await asegurarUnPlan(editor.accessToken);
}

/**
 * Garantiza que existe al menos un plan de medición antes de la primera prueba.
 *
 * `accesibilidad` y `permisos` necesitan abrir el detalle de alguno, y por orden
 * alfabético corren antes que `flujo-medicion`, que es quien los crea. Contra una
 * base con datos de ejecuciones anteriores eso no se nota; contra una recién
 * creada —que es la de CI— fallan las dos.
 *
 * Se crea por la API y no recorriendo la interfaz: esto es preparación, no
 * prueba. Lo que el alta hace por pantalla ya lo cubre `flujo-medicion`.
 */
async function asegurarUnPlan(token: string): Promise<void> {
  const cabeceras = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const existentes = await fetch(`${API}/planes-medicion`, { headers: cabeceras });
  if (!existentes.ok) throw new Error(`No se pudo listar los planes (${existentes.status}).`);
  if (((await existentes.json()) as unknown[]).length > 0) return;

  const planes = await fetch(`${API}/planes`, { headers: cabeceras });
  if (!planes.ok)
    throw new Error(`No se pudieron listar los planes de estudio (${planes.status}).`);
  const elegible = ((await planes.json()) as { id: string; codigo: string }[]).find((p) =>
    p.codigo.startsWith('PE-E2E'),
  );
  if (!elegible) {
    throw new Error('No hay plan de estudios E2E. Ejecuta `npm run e2e:preparar` en apps/api.');
  }

  const creado = await fetch(`${API}/planes-medicion`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      planEstudiosId: elegible.id,
      tipo: 'DIRECTA',
      metaPorcentaje: 70,
      periodoInicioAnio: 2026,
      periodoInicioMitad: 1,
    }),
  });
  if (!creado.ok) {
    throw new Error(`No se pudo crear el plan de medición de partida (${creado.status}).`);
  }
}
