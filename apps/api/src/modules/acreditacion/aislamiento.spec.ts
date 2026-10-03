/**
 * `acreditacion` nunca importa de `plan-estudios` ni de `mejora-continua` — la
 * dependencia va en un solo sentido (CLAUDE.md §3.1): son esos módulos los que
 * implementan los puertos que `acreditacion` define (`PlanParaAcreditacionPort`,
 * `CriterioEnUsoPort`). Mismo mecanismo que las guardias hermanas: se escribe
 * sobre el especificador ya extraído y lleva su propio control positivo.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

const DE_PLAN_ESTUDIOS = /(^|\/)plan-estudios\//;
const DE_MEJORA_CONTINUA = /(^|\/)mejora-continua\//;

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

describe('aislamiento de acreditacion hacia plan-estudios y mejora-continua', () => {
  it('no importa nada de plan-estudios', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_PLAN_ESTUDIOS.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('no importa nada de mejora-continua', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_MEJORA_CONTINUA.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('el barrido ve los imports del módulo', () => {
    // Control positivo de las dos reglas de arriba, que comparan `[]` con `[]`:
    // si `archivosTs` o `importadosDe` dejaran de ver archivos, seguirían en
    // verde sin vigilar nada.
    const vistos = importsDe();
    expect(vistos.length).toBeGreaterThan(0);
    expect(vistos.some(({ importado }) => importado.endsWith('errores.js'))).toBe(true);
  });

  it('reconocen un import prohibido escrito en relativo', () => {
    expect(
      DE_PLAN_ESTUDIOS.test('../../plan-estudios/infrastructure/persistence/plan.repository.js'),
    ).toBe(true);
    expect(DE_PLAN_ESTUDIOS.test('./plan-estudios-legacy.js')).toBe(false);
    expect(
      DE_MEJORA_CONTINUA.test(
        '../../mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js',
      ),
    ).toBe(true);
    expect(DE_MEJORA_CONTINUA.test('./mejora-continua-legacy.js')).toBe(false);
  });
});

describe('aislamiento de acreditacion hacia academico', () => {
  // El spec del Bloque 5 solo preveía `plan-estudios` y `mejora-continua`; la
  // existencia de la carrera se comprueba con el puerto que `academico` ya
  // expone para eso (404 en vez de lista vacía), y solo ese.
  const DE_ACADEMICO = /(^|\/)academico\//;
  const PUERTO_PERMITIDO_ACADEMICO = 'ports/academico-cross-modulo.port.js';

  it('de academico solo importa el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) => DE_ACADEMICO.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_ACADEMICO))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Control positivo: `GestionarAtributos` y `GestionarCriterios` lo consumen.
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de academico escrito en relativo', () => {
    expect(
      DE_ACADEMICO.test('../../academico/infrastructure/persistence/academico.repository.js'),
    ).toBe(true);
    expect(DE_ACADEMICO.test('./academico-legacy.js')).toBe(false);
  });
});
