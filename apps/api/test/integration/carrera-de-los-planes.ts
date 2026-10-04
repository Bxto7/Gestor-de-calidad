/**
 * Bloque 6a: los planes de medición y de evaluación tienen carrera propia
 * (`carrera_id`, obligatoria). Las pruebas que los crean directamente con Prisma
 * la toman de donde la tomó la migración: la medición, de su plan de estudios; la
 * evaluación, de su plan de medición base.
 */

import type { PrismaService } from '../../src/platform/database/prisma.service.js';

export async function carreraDelPlanDeEstudios(
  prisma: PrismaService,
  planEstudiosId: string,
): Promise<string> {
  const plan = await prisma.planEstudios.findUniqueOrThrow({
    where: { id: planEstudiosId },
    select: { carreraId: true },
  });
  return plan.carreraId;
}

export async function carreraDeLaMedicion(
  prisma: PrismaService,
  planMedicionId: string,
): Promise<string> {
  const plan = await prisma.planMedicion.findUniqueOrThrow({
    where: { id: planMedicionId },
    select: { carreraId: true },
  });
  return plan.carreraId;
}
