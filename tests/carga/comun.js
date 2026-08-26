/**
 * Piezas compartidas por los scripts de carga.
 *
 * El login se hace una sola vez, en `setup()`, y el token se reparte a todos los
 * usuarios virtuales. Es obligatorio: §4.4 limita el login a 5 intentos por
 * minuto, así que un script que iniciara sesión por cada iteración mediría el
 * rate limiter en vez de la aplicación.
 */

import http from 'k6/http';
import { fail } from 'k6';

export const BASE = __ENV.BASE_URL ?? 'http://localhost:3000/api/v1';

/** Inicia sesión una vez y devuelve el token para todos los VU. */
export function iniciarSesion() {
  const email = __ENV.EMAIL;
  const password = __ENV.PASSWORD;

  if (!email || !password) {
    fail('Faltan EMAIL y PASSWORD. La contraseña va por entorno, no como argumento.');
  }

  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (r.status !== 200 && r.status !== 201) {
    fail(`No se pudo iniciar sesión (${r.status}): ${r.body}`);
  }

  return r.json('accessToken');
}

export function cabeceras(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

/**
 * Comprueba que el rate limiter no esté sesgando la medición.
 *
 * Un 429 no es un fallo de la aplicación, pero convierte el resultado en ruido:
 * si aparece, lo que se está midiendo es §4.4 y no el rendimiento. Mejor
 * detenerse y decirlo que publicar un percentil que no significa nada.
 */
export function vigilarThrottle(respuesta) {
  if (respuesta.status === 429) {
    fail(
      'La API devolvió 429: el límite de peticiones está sesgando la medición. ' +
        'Arranca la API con THROTTLE_LIMIT alto para las pruebas de carga.',
    );
  }
}

/** El primer plan con asignaturas que encuentre, para no fijar un UUID en el script. */
export function primerPlanConAsignaturas(token) {
  const r = http.get(`${BASE}/reportes/planes?limite=50`, cabeceras(token));
  if (r.status !== 200) fail(`No se pudo listar planes (${r.status}): ${r.body}`);

  const plan = r.json().find((p) => p.asignaturas > 0);
  if (!plan) {
    fail('No hay ningún plan con asignaturas. Carga datos antes de medir: un plan vacío no mide nada.');
  }
  return plan;
}
