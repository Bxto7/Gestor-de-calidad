/**
 * Carga sobre las pantallas de consulta.
 *
 * Recorre lo que hace alguien revisando un plan: abre el detalle, mira la malla,
 * busca otro plan, consulta el panel. No es una ráfaga contra un endpoint —eso
 * mide una consulta, no la aplicación— sino el patrón que produce una persona
 * trabajando, repetido por varias a la vez.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

import { BASE, cabeceras, iniciarSesion, primerPlanConAsignaturas, vigilarThrottle } from './comun.js';

const busqueda = new Trend('busqueda_global', true);
const panel = new Trend('panel_estadistico', true);

export const options = {
  stages: [
    // Subida gradual: un salto en seco mide el arranque en frío del pool de
    // conexiones, no el estado estacionario.
    { duration: '20s', target: 5 },
    { duration: '40s', target: 15 },
    { duration: '20s', target: 0 },
  ],

  thresholds: {
    // Umbral y no solo informe: k6 sale con código distinto de cero si no se
    // cumple, así sirve como puerta de calidad en el pipeline.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    // El panel agrega ocho consultas: se le da más margen que a una lectura
    // simple, pero acotado — es la portada del sistema.
    panel_estadistico: ['p(95)<1500'],
    busqueda_global: ['p(95)<800'],
  },
};

export function setup() {
  const token = iniciarSesion();
  return { token, plan: primerPlanConAsignaturas(token) };
}

export default function (datos) {
  const { token, plan } = datos;
  const auth = cabeceras(token);

  group('detalle del plan', () => {
    const r = http.get(`${BASE}/planes/${plan.id}`, auth);
    vigilarThrottle(r);
    check(r, { 'detalle 200': (x) => x.status === 200 });
  });

  group('malla', () => {
    const r = http.get(`${BASE}/planes/${plan.id}/asignaturas`, auth);
    vigilarThrottle(r);
    check(r, {
      'asignaturas 200': (x) => x.status === 200,
      'trae asignaturas': (x) => Array.isArray(x.json()) && x.json().length > 0,
    });
  });

  group('reporte del plan', () => {
    const r = http.get(`${BASE}/reportes/planes/${plan.id}`, auth);
    vigilarThrottle(r);
    check(r, {
      'reporte 200': (x) => x.status === 200,
      // El total tiene que salir del motor de validaciones, no de una suma
      // paralela. Si alguna vez divergieran, aquí se vería como un cero.
      'trae créditos': (x) => x.status === 200 && x.json('creditosPorCiclo.totalCreditos') > 0,
    });
  });

  group('búsqueda global', () => {
    const r = http.get(`${BASE}/reportes/planes?texto=ing`, auth);
    vigilarThrottle(r);
    busqueda.add(r.timings.duration);
    check(r, { 'búsqueda 200': (x) => x.status === 200 });
  });

  group('panel', () => {
    const r = http.get(`${BASE}/reportes/panel`, auth);
    vigilarThrottle(r);
    panel.add(r.timings.duration);
    check(r, { 'panel 200': (x) => x.status === 200 });
  });

  // Pausa entre recorridos: sin ella el script simula un bot, no a una persona,
  // y el resultado no dice nada sobre la carga que va a existir de verdad.
  sleep(Math.random() * 2 + 1);
}
