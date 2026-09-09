/**
 * El aislamiento entre módulos, comprobado y no solo prometido.
 *
 * CLAUDE.md §3.2 dice que un módulo nunca accede a las entidades ni a los
 * repositorios de otro. Es la clase de regla que se respeta el primer día y se
 * erosiona al tercer mes, cuando alguien necesita un dato y el import está a un
 * autocompletado de distancia. Aquí se vigila sola.
 *
 * Si esta prueba falla, la respuesta no es relajarla: es añadir al puerto lo
 * que haga falta, que es lo que la hace sostenible.
 *
 * Los tres filtros de módulo se escriben sobre el **especificador ya extraído**
 * y no con un `matchAll` propio por regla. La razón es un fallo real: la regla
 * de `auth` buscó durante todo el ciclo la cadena `modules/auth`, que ningún
 * import de este proyecto contiene —todos son relativos—, así que comparaba
 * `[]` contra `[]` desde el primer día sin vigilar nada. Con una sola
 * extracción compartida, un patrón muerto no puede esconderse en una regla: o
 * las rompe todas, o lo caza el control positivo del final.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

/**
 * Lo único que este módulo puede importar del Plan de Estudios.
 *
 * Dos puertos desde 2c-J-B: `contenido-curricular.port.js` (existente, de
 * `medicion`/`evaluacion`) y `acreditacion-cross-modulo.port.js` (nuevo, de
 * `mejora` — RF-PJ-020 a RF-PJ-024, §4 del diseño de 2c-J-B).
 */
const PUERTO_PERMITIDO = ['ports/contenido-curricular.port.js', 'ports/acreditacion-cross-modulo.port.js'];

/**
 * Las tres pertenencias, con las dos barras y no con el nombre suelto: `auth`
 * a secas casaría con `authorization.port.js` y con cualquier otra palabra que
 * lo contenga, y una regla que salta de más se acaba desactivando.
 */
const DE_PLAN_ESTUDIOS = /(^|\/)plan-estudios\//;
const DE_AUTH = /(^|\/)auth\//;
const DE_AUDITORIA = /(^|\/)auditoria\//;

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    return statSync(ruta).isDirectory() ? archivosTs(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

function relativo(ruta: string): string {
  return ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
}

/** Los especificadores de todos los `import … from '…'` de un archivo. */
function importadosDe(contenido: string): string[] {
  return [...contenido.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
}

/** Cada import del módulo (o de una carpeta suya), con el archivo que lo escribe. */
function importsDe(raiz: string = RAIZ): { archivo: string; importado: string }[] {
  return archivosTs(raiz).flatMap((archivo) =>
    importadosDe(readFileSync(archivo, 'utf8')).map((importado) => ({
      archivo: relativo(archivo),
      importado,
    })),
  );
}

describe('aislamiento de mejora-continua', () => {
  it('solo importa de plan-estudios el puerto de contenido curricular', () => {
    const vistos = importsDe().filter(({ importado }) => DE_PLAN_ESTUDIOS.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !PUERTO_PERMITIDO.some((p) => importado.endsWith(p)))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    // El barrido tiene que **ver** los imports permitidos. Sin esto, un patrón
    // que dejara de casar convertiría la regla en una comparación de `[]`
    // contra `[]` y seguiría en verde. Ver la cabecera del archivo.
    expect(vistos).not.toEqual([]);
  });

  it('de auth solo importa lo que auth expone, no sus repositorios', () => {
    // `auth` es transversal (§3.5) y se consume por puertos. Un import de su
    // repositorio de usuarios sería la misma erosión, con otro nombre.
    const permitidos = [
      'ports/authorization.port.js',
      'ports/directorio-usuarios.port.js',
      // Lo que se permite es la **ruta del fichero**, no un símbolo: por aquí
      // pasan también `JwtGuard`, `PUBLICO` y `Publico`, que es lo demás que
      // ese módulo exporta. Se deja así a propósito —los cuatro son plomería
      // de transporte y ninguno toca las tablas de `auth`—, pero conviene
      // saber que la regla no distingue cuál de ellos se importa.
      //
      // Hoy lo que se importa es `ActorActual`, y no es una excepción de
      // conveniencia: es la convención de transporte de todo el proyecto —lo
      // importan igual los ocho controladores de `plan-estudios` y el de
      // `auditoria`—. Es un decorador de parámetro que lee lo que el guard ya
      // dejó en la petición; no toca el repositorio de `auth`, así que no abre
      // la vía que esta regla vigila.
      'infrastructure/http/jwt.guard.js',
    ];

    const vistos = importsDe().filter(({ importado }) => DE_AUTH.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !permitidos.some((p) => importado.endsWith(p)))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    expect(vistos).not.toEqual([]);
  });

  it('no importa nada del módulo de auditoría ni de sus tablas', () => {
    // La bitácora se alimenta de eventos de dominio, no de llamadas directas:
    // por eso `plan-estudios` y `auditoria` pueden ignorarse mutuamente.
    //
    // Aquí no cabe la comprobación de «el barrido ve algo»: lo correcto es que
    // no haya ni un import, así que la lista vacía es el resultado bueno. Lo
    // que sostiene esta regla es el control positivo de abajo, que comprueba
    // que `DE_AUDITORIA` reconoce un import prohibido escrito como los escribe
    // el proyecto.
    const infractores = importsDe()
      .filter(({ importado }) => DE_AUDITORIA.test(importado))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
  });

  it('los tres filtros reconocen un import prohibido escrito en relativo', () => {
    // Control positivo. Ninguna de las tres reglas distingue por sí sola «no
    // hay infractores» de «el patrón no casa con nada»: las tres comparan `[]`
    // con `[]`. Esto fija la forma que tienen de verdad los imports de este
    // repositorio —relativa, nunca `modules/…`— y es justo la que dejó muerta
    // la regla de `auth`.
    expect(DE_PLAN_ESTUDIOS.test('../../../../plan-estudios/infrastructure/persistence/x.js')).toBe(
      true,
    );
    expect(DE_AUTH.test('../../../../auth/infrastructure/persistence/usuario.repository.js')).toBe(
      true,
    );
    expect(DE_AUDITORIA.test('../../../auditoria/infrastructure/persistence/bitacora.js')).toBe(
      true,
    );

    // Y no saltan por una palabra que los contenga: `authorization` no es
    // `auth/`, ni `plan-estudios-legacy` es `plan-estudios/`.
    expect(DE_AUTH.test('./authorization-helper.js')).toBe(false);
    expect(DE_PLAN_ESTUDIOS.test('../plan-estudios-legacy.js')).toBe(false);
  });

  it('el dominio no importa NestJS ni Prisma', () => {
    // El dominio vive en tres sitios: lo compartido en `domain/` y lo propio de
    // cada submódulo en `medicion/domain/` y `evaluacion/domain/` (§ carpeta del
    // submódulo).
    const infractores: string[] = [];

    for (const raiz of [
      join(RAIZ, 'domain'),
      join(RAIZ, 'medicion', 'domain'),
      join(RAIZ, 'evaluacion', 'domain'),
    ]) {
      for (const { archivo, importado } of importsDe(raiz)) {
        if (/^@nestjs\/|^@prisma\/|database\/generated/.test(importado)) infractores.push(archivo);
      }
    }

    expect(infractores).toEqual([]);
  });

  it('la capa de aplicación no importa Prisma ni el cliente generado', () => {
    // Los casos de uso hablan con puertos. Si aquí aparece Prisma, es que
    // alguien se saltó el puerto para «una consulta rápida».
    const infractores: string[] = [];

    for (const raiz of [
      join(RAIZ, 'medicion', 'application'),
      join(RAIZ, 'evaluacion', 'application'),
    ]) {
      for (const { archivo, importado } of importsDe(raiz)) {
        if (/^@prisma\/|database\/generated|prisma\.service/.test(importado)) {
          infractores.push(archivo);
        }
      }
    }

    expect(infractores).toEqual([]);
  });
});
