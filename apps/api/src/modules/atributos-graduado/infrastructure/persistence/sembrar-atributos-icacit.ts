/**
 * Da a una carrera los once atributos de ICACIT. Lo usan las siembras de
 * desarrollo y de e2e (`scripts/`) y las pruebas de integración; la aplicación
 * no lo llama: en producción una carrera nueva empieza sin atributos.
 *
 * Idempotente por `(carreraId, marco, codigo)`: una segunda pasada deja los once,
 * no veintidós. Deja cada fila como el estándar —nombre, orden y activa—, así que
 * pisa una edición hecha a mano: es una siembra de desarrollo, no una migración
 * de datos.
 */

import type { PrismaClient } from '../../../../platform/database/generated/client.js';
import { ATRIBUTOS_ICACIT, MARCO_ICACIT } from '../../domain/value-objects/atributos-icacit.js';

export async function sembrarAtributosIcacit(
  prisma: Pick<PrismaClient, 'atributoGraduado'>,
  carreraId: string,
): Promise<number> {
  for (const [indice, a] of ATRIBUTOS_ICACIT.entries()) {
    await prisma.atributoGraduado.upsert({
      where: { carreraId_marco_codigo: { carreraId, marco: MARCO_ICACIT, codigo: a.codigo } },
      create: {
        carreraId,
        marco: MARCO_ICACIT,
        codigo: a.codigo,
        nombre: a.nombre,
        orden: indice + 1,
      },
      update: { nombre: a.nombre, orden: indice + 1, estado: 'ACTIVO' },
    });
  }
  return ATRIBUTOS_ICACIT.length;
}

/**
 * Crea solo los atributos de ICACIT que la carrera no tiene y nunca toca los
 * existentes: ni nombre, ni orden, ni estado. Es lo que usa la carga histórica
 * del plan ISI 2018, que se puede volver a ejecutar sobre una carrera ya en uso
 * sin deshacer lo que un Coordinador editó o inactivó. Devuelve cuántos creó.
 */
export async function crearAtributosIcacitFaltantes(
  prisma: Pick<PrismaClient, 'atributoGraduado'>,
  carreraId: string,
): Promise<number> {
  const { count } = await prisma.atributoGraduado.createMany({
    data: ATRIBUTOS_ICACIT.map((a, indice) => ({
      carreraId,
      marco: MARCO_ICACIT,
      codigo: a.codigo,
      nombre: a.nombre,
      orden: indice + 1,
    })),
    skipDuplicates: true,
  });
  return count;
}
