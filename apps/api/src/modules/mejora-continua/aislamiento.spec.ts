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
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = import.meta.dirname;

/** Lo único que este módulo puede importar del Plan de Estudios. */
const PUERTO_PERMITIDO = 'ports/contenido-curricular.port.js';

function archivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    return statSync(ruta).isDirectory() ? archivosTs(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

function relativo(ruta: string): string {
  return ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
}

describe('aislamiento de mejora-continua', () => {
  it('solo importa de plan-estudios el puerto de contenido curricular', () => {
    const infractores: string[] = [];

    for (const archivo of archivosTs(RAIZ)) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const m of contenido.matchAll(/from '([^']*plan-estudios[^']*)'/g)) {
        const importado = m[1] ?? '';
        if (!importado.endsWith(PUERTO_PERMITIDO)) {
          infractores.push(`${relativo(archivo)} → ${importado}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('de auth solo importa los puertos que auth expone, no sus repositorios', () => {
    // `auth` es transversal (§3.5) y se consume por puertos. Un import de su
    // repositorio de usuarios sería la misma erosión, con otro nombre.
    const permitidos = ['ports/authorization.port.js', 'ports/directorio-usuarios.port.js'];
    const infractores: string[] = [];

    for (const archivo of archivosTs(RAIZ)) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const m of contenido.matchAll(/from '([^']*modules\/auth[^']*)'/g)) {
        const importado = m[1] ?? '';
        if (!permitidos.some((p) => importado.endsWith(p))) {
          infractores.push(`${relativo(archivo)} → ${importado}`);
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('no importa nada del módulo de auditoría ni de sus tablas', () => {
    // La bitácora se alimenta de eventos de dominio, no de llamadas directas:
    // por eso `plan-estudios` y `auditoria` pueden ignorarse mutuamente.
    const infractores: string[] = [];

    for (const archivo of archivosTs(RAIZ)) {
      const contenido = readFileSync(archivo, 'utf8');
      if (/from '[^']*modules\/auditoria/.test(contenido)) infractores.push(relativo(archivo));
    }

    expect(infractores).toEqual([]);
  });

  it('el dominio no importa NestJS ni Prisma', () => {
    // El dominio vive en dos sitios: lo compartido en `domain/` y lo propio
    // de Medición en `medicion/domain/` (§ carpeta del submódulo).
    const infractores: string[] = [];

    for (const raiz of [join(RAIZ, 'domain'), join(RAIZ, 'medicion', 'domain')]) {
      for (const archivo of archivosTs(raiz)) {
        const contenido = readFileSync(archivo, 'utf8');
        if (/from '@nestjs\/|from '@prisma\/|database\/generated/.test(contenido)) {
          infractores.push(relativo(archivo));
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it('la capa de aplicación no importa Prisma ni el cliente generado', () => {
    // Los casos de uso hablan con puertos. Si aquí aparece Prisma, es que
    // alguien se saltó el puerto para «una consulta rápida».
    const infractores: string[] = [];

    for (const archivo of archivosTs(join(RAIZ, 'medicion', 'application'))) {
      const contenido = readFileSync(archivo, 'utf8');
      if (/from '@prisma\/|database\/generated|prisma\.service/.test(contenido)) {
        infractores.push(relativo(archivo));
      }
    }

    expect(infractores).toEqual([]);
  });
});
