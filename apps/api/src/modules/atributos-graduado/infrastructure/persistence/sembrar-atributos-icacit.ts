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
