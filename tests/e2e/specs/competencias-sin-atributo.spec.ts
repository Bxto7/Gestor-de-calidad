/**
 * RF127 contra la API, sin pasar por la pantalla.
 *
 * La pantalla deshabilita la casilla de una competencia sin atributo del graduado
 * (lo cubren `flujo-medicion` y `accesibilidad`), pero eso solo evita que quien la
 * usa choque con la regla. La regla vive en `declararCompetencias`: si alguien
 * llama a la API directamente —un script, otra pantalla, una petición hecha a
 * mano— tiene que recibir el mismo rechazo. Aquí se comprueba eso, que ninguna
 * prueba de interfaz puede ver.
 *
 * Es una sola prueba y no cuatro, como `flujo-medicion`: cada paso parte de lo que
 * dejó el anterior (el plan creado, los identificadores leídos).
 *
 * Los identificadores se leen de `competencias-disponibles` y no se dan por
 * conocidos: son UUID que genera la base al sembrar.
 */

import { tokenDe } from '../fixtures/api';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

interface Grupo {
  atributo: { codigo: string } | null;
  competencias: { id: string; codigo: string }[];
}

test('la API rechaza una competencia sin atributo del graduado y acepta las demás', async ({
  request,
}) => {
  const cabeceras = {
    authorization: `Bearer ${await tokenDe('editor')}`,
    'content-type': 'application/json',
  };

  // ── Un plan propio, en Borrador ─────────────────────────────────────────
  const planes = await request.get(`${API}/planes`, { headers: cabeceras });
  expect(planes.ok()).toBe(true);
  const base = ((await planes.json()) as { id: string; codigo: string }[]).find((p) =>
    p.codigo.startsWith('PE-E2E'),
  );
  expect(base, 'No hay plan de estudios E2E: falta `npm run e2e:preparar`.').toBeDefined();

  const creado = await request.post(`${API}/planes-medicion`, {
    headers: cabeceras,
    data: {
      planEstudiosId: base!.id,
      tipo: 'DIRECTA',
      metaPorcentaje: 70,
      periodoInicioAnio: 2026,
      periodoInicioMitad: 1,
    },
  });
  expect(creado.ok()).toBe(true);
  const plan = (await creado.json()) as { id: string; competenciaIds: string[] };
  expect(plan.competenciaIds).toEqual([]);

  // ── Las dos competencias que hacen falta ────────────────────────────────
  const disponibles = await request.get(
    `${API}/planes-medicion/${plan.id}/competencias-disponibles`,
    {
      headers: cabeceras,
    },
  );
  expect(disponibles.ok()).toBe(true);
  const grupos = (await disponibles.json()) as Grupo[];

  const sinAtributo = grupos
    .filter((g) => g.atributo === null)
    .flatMap((g) => g.competencias)
    .find((c) => c.codigo === 'CPE-E2E05');
  const conAtributo = grupos
    .filter((g) => g.atributo !== null)
    .flatMap((g) => g.competencias)
    .find((c) => c.codigo === 'CPE-E2E01');
  expect(sinAtributo, 'CPE-E2E05 debería salir en el grupo sin atributo.').toBeDefined();
  expect(conAtributo, 'CPE-E2E01 debería salir en un grupo con atributo.').toBeDefined();

  const declarar = (competenciaIds: string[]) =>
    request.put(`${API}/planes-medicion/${plan.id}/competencias`, {
      headers: cabeceras,
      data: { competenciaIds },
    });
  const leer = async () =>
    (await (
      await request.get(`${API}/planes-medicion/${plan.id}`, { headers: cabeceras })
    ).json()) as {
      competenciaIds: string[];
    };

  // ── Sola: se rechaza, y el mensaje dice cuál y por qué ─────────────────
  const sola = await declarar([sinAtributo!.id]);
  expect(sola.status()).toBe(409);
  const cuerpo = (await sola.json()) as { message: string };
  expect(cuerpo.message).toContain('RF127');
  expect(cuerpo.message).toContain('CPE-E2E05');

  // ── Acompañada: la regla rige sobre todo el conjunto, no solo sobre la ──
  // ── primera. Si una válida «tapara» a la otra, esto pasaría con 200.  ──
  const mezclada = await declarar([conAtributo!.id, sinAtributo!.id]);
  expect(mezclada.status()).toBe(409);
  expect((await mezclada.json()).message).toContain('CPE-E2E05');

  // El rechazo no guarda nada, ni siquiera la parte válida.
  expect((await leer()).competenciaIds).toEqual([]);

  // ── Control: la misma llamada con solo la que sí tiene atributo pasa. ───
  // Sin esto, un 409 por cualquier otra causa (permiso, plan mal creado) haría
  // pasar las dos aserciones de arriba sin que RF127 tuviera nada que ver.
  const valida = await declarar([conAtributo!.id]);
  expect(valida.status()).toBe(200);
  expect((await leer()).competenciaIds).toEqual([conAtributo!.id]);
});
