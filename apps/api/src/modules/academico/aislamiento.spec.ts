/**
 * `academico` nunca importa de `plan-estudios` — la dependencia va en un
 * solo sentido (CLAUDE.md §3.1). Mismo mecanismo que las guardias
 * hermanas: se escribe sobre el especificador ya extraído y lleva su
 * propio control positivo.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

const DE_PLAN_ESTUDIOS = /(^|\/)plan-estudios\//;

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    return statSync(ruta).isDirectory() ? archivosTs(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

function relativo(ruta: string): string {
  return ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
}

function importadosDe(contenido: string): string[] {
  return [...contenido.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
}

function importsDe(raiz: string = RAIZ): { archivo: string; importado: string }[] {
  return archivosTs(raiz).flatMap((archivo) =>
    importadosDe(readFileSync(archivo, 'utf8')).map((importado) => ({
      archivo: relativo(archivo),
      importado,
    })),
  );
}

describe('aislamiento de academico hacia plan-estudios', () => {
  it('no importa nada de plan-estudios', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_PLAN_ESTUDIOS.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('reconoce un import prohibido escrito en relativo', () => {
    expect(
      DE_PLAN_ESTUDIOS.test('../../plan-estudios/infrastructure/persistence/plan.repository.js'),
    ).toBe(true);
    expect(DE_PLAN_ESTUDIOS.test('./plan-estudios-legacy.js')).toBe(false);
  });
});

/**
 * `academico` puede pedirle cosas a `auth` —el permiso, los conteos— pero solo
 * por sus puertos: en `application/` y `domain/` lo único importable de `auth`
 * son archivos de `auth/application/ports/`. La infraestructura de `academico`
 * (el controller usa el guard JWT) queda fuera de esta regla a propósito.
 */
const DE_AUTH = /(^|\/)auth\//;
const PUERTO_DE_AUTH = /(^|\/)auth\/application\/ports\/[^/]+$/;

const esImportProhibidoDeAuth = (importado: string) =>
  DE_AUTH.test(importado) && !PUERTO_DE_AUTH.test(importado);

describe('aislamiento de academico hacia auth', () => {
  const capasPuras = ['application', 'domain'].flatMap((capa) => importsDe(join(RAIZ, capa)));

  it('application y domain solo importan de auth archivos de application/ports', () => {
    const infractores = capasPuras
      .filter(({ importado }) => esImportProhibidoDeAuth(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('control positivo: el patrón reconoce lo prohibido y lo permitido', () => {
    expect(esImportProhibidoDeAuth('../../../auth/infrastructure/conteo-usuarios.adapter.js')).toBe(
      true,
    );
    expect(esImportProhibidoDeAuth('../../../auth/application/use-cases/x.use-case.js')).toBe(true);
    expect(esImportProhibidoDeAuth('../../../auth/application/ports/conteo-usuarios.port.js')).toBe(
      false,
    );
    expect(esImportProhibidoDeAuth('./oauth-utils.js')).toBe(false);
  });

  it('control positivo: la regla ve de verdad imports de puertos de auth en el código real', () => {
    const dePuertos = capasPuras.filter(({ importado }) => PUERTO_DE_AUTH.test(importado));

    expect(dePuertos.length).toBeGreaterThan(0);
  });
});
