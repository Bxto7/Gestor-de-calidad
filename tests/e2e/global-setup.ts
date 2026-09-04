/**
 * Comprueba que la API responde antes de que arranque ninguna prueba.
 *
 * Sin esto, un backend caído se manifiesta como toda la suite fallando por
 * razones distintas y ninguna clara. La Task 3 le añade el inicio de sesión.
 */

const API = process.env['E2E_API_URL'] ?? 'http://localhost:3000/api/v1';

export default async function globalSetup(): Promise<void> {
  const r = await fetch(`${API}/planes-medicion`).catch(() => null);

  // 401 es la respuesta correcta sin sesión: la API está viva y protegida.
  if (!r || r.status !== 401) {
    throw new Error(
      `La API no responde en ${API} como se espera (se recibió ${r ? r.status : 'nada'}). ` +
        'Arráncala con `cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start`.',
    );
  }
}
