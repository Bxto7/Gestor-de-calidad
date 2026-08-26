/**
 * El RNF de §3.4: generación de documentos por debajo de 5 s bajo carga.
 *
 * Mide de extremo a extremo —del clic a tener el archivo— y no solo lo que tarda
 * el POST. Ese devuelve 202 en milisegundos porque solo encola; el requisito
 * habla de cuándo el documento existe, que es lo que la persona espera.
 *
 * Por eso el reloj cubre encolar + sondear + descargar, igual que hace la
 * pantalla.
 */

import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

import { BASE, cabeceras, iniciarSesion, primerPlanConAsignaturas, vigilarThrottle } from './comun.js';

const extremoAExtremo = new Trend('documento_extremo_a_extremo', true);
const soloEncolar = new Trend('documento_encolar', true);
const fallidos = new Counter('documentos_fallidos');

/** Tope de espera. Cuatro veces el RNF: pasado eso, algo está roto, no lento. */
const ESPERA_MAXIMA_MS = 20_000;
const INTERVALO_MS = 250;

export const options = {
  scenarios: {
    // Tasa constante y no VU fijos: el RNF habla de documentos por unidad de
    // tiempo, y con VU fijos cada uno esperaría al anterior — se mediría el
    // throughput de la cola disfrazado de latencia.
    generacion: {
      executor: 'constant-arrival-rate',
      rate: 6,
      timeUnit: '1m',
      duration: '2m',
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },

  thresholds: {
    // El requisito, escrito como umbral. Si no se cumple, k6 falla.
    documento_extremo_a_extremo: ['p(95)<5000'],
    // Encolar sí debe ser inmediato: es lo único que ocurre dentro del request.
    documento_encolar: ['p(95)<500'],
    documentos_fallidos: ['count==0'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const token = iniciarSesion();
  return { token, plan: primerPlanConAsignaturas(token) };
}

export default function (datos) {
  const { token, plan } = datos;
  const auth = cabeceras(token);

  // Se alternan los dos formatos: PDF y Excel usan renderizadores distintos y
  // medir solo uno dejaría el otro sin cubrir.
  const tipo = __ITER % 2 === 0 ? 'RESUMEN_PLAN' : 'MALLA_EXCEL';

  const arranque = Date.now();

  const encolado = http.post(
    `${BASE}/planes/${plan.id}/documentos`,
    JSON.stringify({ tipo }),
    auth,
  );
  vigilarThrottle(encolado);
  soloEncolar.add(encolado.timings.duration);

  if (encolado.status !== 202) {
    fallidos.add(1);
    check(encolado, { 'encolado 202': () => false });
    return;
  }

  const trabajoId = encolado.json('id');
  const estado = esperarDocumento(trabajoId, auth);

  if (estado !== 'Listo') {
    fallidos.add(1);
    check(null, { [`documento ${tipo} listo`]: () => false });
    return;
  }

  const archivo = http.get(`${BASE}/documentos/${trabajoId}/archivo`, auth);
  extremoAExtremo.add(Date.now() - arranque);

  check(archivo, {
    'descarga 200': (r) => r.status === 200,
    // Que pese algo: un archivo de cero bytes pasaría un check de status y
    // sería inservible.
    'el archivo tiene contenido': (r) => r.body.length > 1000,
  });

  sleep(1);
}

/** Sondea hasta que el trabajo deja de estar en curso, o hasta rendirse. */
function esperarDocumento(trabajoId, auth) {
  const limite = Date.now() + ESPERA_MAXIMA_MS;

  for (;;) {
    const r = http.get(`${BASE}/documentos/${trabajoId}`, auth);
    vigilarThrottle(r);

    if (r.status !== 200) return 'Error';

    const estado = r.json('estado');
    if (estado === 'Listo' || estado === 'Fallido') return estado;

    if (Date.now() > limite) {
      // Casi siempre significa que el worker no está corriendo. Se dice, en vez
      // de devolver un percentil enorme que habría que interpretar.
      fail(
        `El documento ${trabajoId} sigue en «${estado}» tras ${ESPERA_MAXIMA_MS} ms. ` +
          '¿Está corriendo el worker (npm run start:worker)?',
      );
    }

    sleep(INTERVALO_MS / 1000);
  }
}
