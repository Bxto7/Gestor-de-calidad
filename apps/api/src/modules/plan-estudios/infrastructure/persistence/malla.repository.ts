/**
 * Repositorio de la malla curricular.
 *
 * La reordenación es la parte delicada. Mover una asignatura no cambia solo su
 * fila: obliga a renumerar las de su ciclo de origen y las del de destino, y
 * las tres escrituras tienen que ir juntas o la malla queda con huecos y
 * posiciones repetidas a media operación.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  AsignaturaUbicable,
  RepositorioMallaPort,
} from '../../application/ports/malla.port.js';

@Injectable()
export class MallaRepositoryPrisma implements RepositorioMallaPort {
  constructor(private readonly prisma: PrismaService) {}

  async asignaturaPorId(id: string): Promise<AsignaturaUbicable | null> {
    const a = await this.prisma.asignatura.findUnique({
      where: { id },
      select: { id: true, planId: true, codigo: true, ciclo: { select: { numero: true } } },
    });
    if (!a) return null;
    return {
      id: a.id,
      planId: a.planId,
      codigo: a.codigo,
      cicloNumero: a.ciclo?.numero ?? null,
    };
  }

  async ubicar(asignaturaId: string, cicloNumero: number | null, orden?: number): Promise<void> {
    const asignatura = await this.prisma.asignatura.findUnique({
      where: { id: asignaturaId },
      select: {
        id: true,
        planId: true,
        cicloId: true,
        plan: { select: { carreraId: true } },
      },
    });
    if (!asignatura) return;

    // El ciclo se resuelve por (carrera, número) y no por identificador: la UI
    // razona en números correlativos, que es lo que ve el usuario, y así no
    // tiene que conocer los UUID de los ciclos.
    const cicloDestino =
      cicloNumero === null
        ? null
        : await this.prisma.ciclo.findUnique({
            where: {
              carreraId_numero: { carreraId: asignatura.plan.carreraId, numero: cicloNumero },
            },
            select: { id: true },
          });

    const cicloOrigenId = asignatura.cicloId;
    const cicloDestinoId = cicloDestino?.id ?? null;

    await this.prisma.$transaction(async (tx) => {
      // 1. Colocar la asignatura. Se le da un orden provisional alto para que
      //    no compita con las existentes mientras se renumera.
      await tx.asignatura.update({
        where: { id: asignaturaId },
        data: { cicloId: cicloDestinoId, orden: orden ?? 999 },
      });

      // 2. Renumerar el ciclo de destino respetando la posición pedida.
      if (cicloDestinoId) {
        const enDestino = await tx.asignatura.findMany({
          where: { planId: asignatura.planId, cicloId: cicloDestinoId },
          orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
          select: { id: true },
        });

        // Si se pidió una posición concreta, se saca la movida de la lista y se
        // reinserta ahí; si no, el `orden: 999` ya la dejó al final.
        const ids = enDestino.map((a) => a.id);
        if (orden !== undefined) {
          const sinLaMovida = ids.filter((id) => id !== asignaturaId);
          const posicion = Math.max(0, Math.min(orden, sinLaMovida.length));
          sinLaMovida.splice(posicion, 0, asignaturaId);
          ids.splice(0, ids.length, ...sinLaMovida);
        }

        await Promise.all(
          ids.map((id, i) => tx.asignatura.update({ where: { id }, data: { orden: i } })),
        );
      }

      // 3. Cerrar el hueco que dejó en el ciclo de origen. Sin esto, los
      //    órdenes quedan como 0, 2, 3 y una inserción posterior por posición
      //    caería en el sitio equivocado.
      if (cicloOrigenId && cicloOrigenId !== cicloDestinoId) {
        const enOrigen = await tx.asignatura.findMany({
          where: { planId: asignatura.planId, cicloId: cicloOrigenId },
          orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
          select: { id: true },
        });
        await Promise.all(
          enOrigen.map((a, i) => tx.asignatura.update({ where: { id: a.id }, data: { orden: i } })),
        );
      }
    });
  }
}
