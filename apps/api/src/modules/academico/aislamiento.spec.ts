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
