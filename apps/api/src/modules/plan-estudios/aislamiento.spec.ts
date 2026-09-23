/**
 * El aislamiento en la dirección opuesta (2c-J-B, §4 del diseño).
 *
 * `ImpactoPlanMejoraPort` (RF132) abre la primera dependencia circular de
 * primer nivel del proyecto: `mejora-continua → plan-estudios` ya existía
 * (`ContenidoCurricularPort`/`AcreditacionPort`); este puerto es
 * `plan-estudios → mejora-continua`. CLAUDE.md §3.2 sigue cumplido —se habla
 * por puerto, no se comparte tabla— pero necesita su propia guardia: la de
 * `mejora-continua/aislamiento.spec.ts` solo vigila lo que ese módulo
 * importa, no lo que `plan-estudios` importa de él.
 *
 * Mismo mecanismo que la guardia hermana: se escribe sobre el especificador
 * ya extraído y lleva su propio control positivo, para no repetir el fallo
 * real que dejó una regla comparando `[]` contra `[]` sin vigilar nada.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

/** Lo único que este módulo puede importar de Mejora Continua. */
const PUERTO_PERMITIDO = 'ports/impacto-plan-mejora.port.js';

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

describe('aislamiento de plan-estudios hacia mejora-continua', () => {
  it('solo importa de mejora-continua el puerto de impacto de plan de mejora', () => {
    const vistos = importsDe().filter(({ importado }) => DE_MEJORA_CONTINUA.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Control positivo: sin esto, un patrón que dejara de casar convertiría
    // la regla en `[]` contra `[]` y seguiría en verde sin vigilar nada.
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido escrito en relativo', () => {
    expect(
      DE_MEJORA_CONTINUA.test(
        '../../mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js',
      ),
    ).toBe(true);
    expect(DE_MEJORA_CONTINUA.test('./mejora-continua-legacy.js')).toBe(false);
  });
});

describe('aislamiento de plan-estudios hacia academico', () => {
  const DE_ACADEMICO = /(^|\/)academico\//;
  const PUERTO_PERMITIDO_ACADEMICO = 'ports/academico-cross-modulo.port.js';

  it('solo importa de academico el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) => DE_ACADEMICO.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_ACADEMICO))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de academico escrito en relativo', () => {
    expect(
      DE_ACADEMICO.test('../../academico/infrastructure/persistence/academico.repository.js'),
    ).toBe(true);
  });
});

describe('aislamiento de plan-estudios hacia objetivos-educacionales', () => {
  const DE_OBJETIVOS = /(^|\/)objetivos-educacionales\//;
  const PUERTO_PERMITIDO_OBJETIVOS = 'ports/objetivos-cross-modulo.port.js';

  it('solo importa de objetivos-educacionales el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) => DE_OBJETIVOS.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_OBJETIVOS))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Sin control positivo `vistos.not.toEqual([])` a propósito: hoy
    // plan-estudios no consume nada de objetivos-educacionales —a diferencia
    // de academico, donde sí hay un consumo real (crear un plan necesita la
    // carrera). Verificado de primera mano (Task 6): ningún archivo de
    // plan-estudios tiene un `import ... from` real hacia
    // objetivos-educacionales; las únicas coincidencias de la cadena son
    // menciones en comentarios de documentación. Si en el futuro aparece un
    // consumo real, agregar aquí el control positivo correspondiente.
  });

  it('reconoce un import prohibido de objetivos-educacionales escrito en relativo', () => {
    expect(
      DE_OBJETIVOS.test(
        '../../objetivos-educacionales/infrastructure/persistence/objetivos.repository.js',
      ),
    ).toBe(true);
  });
});

describe('aislamiento de plan-estudios hacia atributos-graduado', () => {
  const DE_ATRIBUTOS = /(^|\/)atributos-graduado\//;

  it('no importa nada de atributos-graduado por TypeScript', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_ATRIBUTOS.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('reconoce un import prohibido de atributos-graduado escrito en relativo', () => {
    expect(
      DE_ATRIBUTOS.test(
        '../../atributos-graduado/infrastructure/persistence/atributos.repository.js',
      ),
    ).toBe(true);
  });
});
