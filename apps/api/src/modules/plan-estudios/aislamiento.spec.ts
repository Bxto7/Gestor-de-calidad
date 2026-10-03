/**
 * El aislamiento de `plan-estudios` hacia los demás módulos.
 *
 * Hasta el Bloque 4 `plan-estudios` importaba de `mejora-continua` el puerto de
 * impacto de planes de mejora (RF132) para sus criterios. Desde el Bloque 5 los
 * criterios viven en `acreditacion` y este módulo ya no importa **nada** de
 * `mejora-continua`: la dependencia circular de primer nivel desapareció con
 * ellos.
 *
 * Mismo mecanismo que las guardias hermanas: se escribe sobre el especificador
 * ya extraído y lleva su propio control positivo, para no repetir el fallo
 * real que dejó una regla comparando `[]` contra `[]` sin vigilar nada.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

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
  it('no importa nada de mejora-continua', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_MEJORA_CONTINUA.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
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
  // `plan-para-objetivos.port.js` (Bloque 4b): objetivos define lo que necesita
  // saber de un plan y `plan-estudios` lo implementa con su repositorio.
  const PUERTOS_PERMITIDOS_OBJETIVOS = [
    'ports/objetivos-cross-modulo.port.js',
    'ports/plan-para-objetivos.port.js',
  ];

  it('solo importa de objetivos-educacionales sus puertos', () => {
    const vistos = importsDe().filter(({ importado }) => DE_OBJETIVOS.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !PUERTOS_PERMITIDOS_OBJETIVOS.some((p) => importado.endsWith(p)))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // Control positivo: desde el Bloque 4b hay un consumo real
    // (`PlanParaObjetivosAdapter`). Sin esto, un patrón que dejara de casar
    // compararía `[]` con `[]` y seguiría en verde.
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de objetivos-educacionales escrito en relativo', () => {
    expect(
      DE_OBJETIVOS.test(
        '../../objetivos-educacionales/infrastructure/persistence/objetivos.repository.js',
      ),
    ).toBe(true);
  });
});

describe('aislamiento de plan-estudios hacia acreditacion', () => {
  const DE_ACREDITACION = /(^|\/)acreditacion\//;

  // Por ahora no importa nada de `acreditacion`; la Tarea 3 añade el único
  // puerto permitido (`plan-para-acreditacion.port.js`) y su control positivo.
  it('no importa nada de acreditacion', () => {
    const infractores = importsDe()
      .filter(({ importado }) => DE_ACREDITACION.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('reconoce un import prohibido de acreditacion escrito en relativo', () => {
    expect(
      DE_ACREDITACION.test('../../acreditacion/infrastructure/persistence/atributos.repository.js'),
    ).toBe(true);
    expect(DE_ACREDITACION.test('./acreditacion-legacy.js')).toBe(false);
  });
});
