/**
 * Completa la definición de un plan de mejora recién creado, para que pueda
 * salir de Borrador.
 *
 * RF-PJ-042 (`motor-de-consistencia.ts`) bloquea «Enviar a revisión» mientras
 * falte alguno de estos ocho campos, y un plan nace con todos vacíos y el plazo
 * en el centinela `1970-01-01`. Los recorridos que necesitan un plan fuera de
 * Borrador —para versionarlo, aprobarlo— tienen que pasar por aquí antes; antes
 * de que existiera esa regla, bastaba con pulsar el botón.
 *
 * Solo se rellena lo que está vacío: un recorrido que ya escribió alguno de estos
 * campos (p. ej. el nombre) no lo ve cambiar.
 *
 * Los campos se rellenan **de uno en uno y esperando**. Cada `onBlur` de la
 * pantalla reenvía la definición entera armada desde el plan en caché
 * (`datosDefinicionActual` en `PlanMejoraPage.tsx`) y solo pisa el campo que
 * cambió: si se rellena el siguiente antes de que el refetch del plan llegue, ese
 * segundo PATCH manda el campo anterior todavía vacío y lo borra. Por eso se espera
 * al PATCH y al GET que lo sigue, no solo al PATCH.
 */

import { expect, type Page } from '@playwright/test';

const CAMPOS_DE_TEXTO: readonly (readonly [etiqueta: string, valor: string])[] = [
  ['Nombre de la acción', 'Reforzar el syllabus del curso'],
  ['Causa raíz', 'Los contenidos del syllabus no reflejan el resultado esperado'],
  ['Justificación', 'Sin ajuste el indicador seguirá por debajo de la meta'],
  ['Input', 'Resultados de la medición del periodo anterior'],
  ['Recursos', 'Horas docentes y material de laboratorio'],
  ['Metas', 'Llegar al 80 % de logro en el siguiente periodo'],
  ['Responsable', 'Coordinación académica'],
];

/** El valor con el que nace un plan: `new Date(0)`, ver `plan-mejora.repository.ts`. */
const PLAZO_SIN_COMPLETAR = '1970-01-01';
const PLAZO = '2026-12-31';

/** Guarda un campo y espera a que el plan en pantalla ya lo incluya. */
async function guardarCampo(page: Page, etiqueta: string, valor: string): Promise<void> {
  const campo = page.getByLabel(etiqueta, { exact: true });
  await campo.fill(valor);

  const patch = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/definicion'),
  );
  const refetch = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      /\/planes-mejora\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname),
  );
  await campo.blur();

  expect((await patch).ok(), `No se guardó «${etiqueta}».`).toBe(true);
  await refetch;
}

export async function completarDefinicion(page: Page): Promise<void> {
  for (const [etiqueta, valor] of CAMPOS_DE_TEXTO) {
    const actual = await page.getByLabel(etiqueta, { exact: true }).inputValue();
    if (actual.trim() === '') await guardarCampo(page, etiqueta, valor);
  }
  const plazo = page.getByLabel('Plazo', { exact: true });
  if ((await plazo.inputValue()) === PLAZO_SIN_COMPLETAR) await guardarCampo(page, 'Plazo', PLAZO);

  // Si un PATCH pisó a otro, el envío a revisión fallaría más adelante con un
  // mensaje que no dice cuál. Se recarga para leer lo que guardó el servidor —los
  // campos no son controlados: sin recargar, solo se vería lo que se escribió— y se
  // comprueba con el nombre del campo que ninguno quedó vacío.
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  for (const [etiqueta] of CAMPOS_DE_TEXTO) {
    await expect(page.getByLabel(etiqueta, { exact: true }), etiqueta).not.toHaveValue('');
  }
  await expect(page.getByLabel('Plazo', { exact: true })).not.toHaveValue(PLAZO_SIN_COMPLETAR);
}
