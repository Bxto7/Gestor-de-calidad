// apps/api/src/modules/mejora-continua/resumen/infrastructure/persistence/resumen-carrera.repository.ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  LecturaResumenCarreraPort,
  SinResponsableCrudo,
} from '../../application/ports/lectura-resumen-carrera.port.js';
import type {
  ActaLeida,
  MedicionLeida,
  PlanMejoraLeido,
} from '../../domain/services/resumen-de-carrera.js';

@Injectable()
export class ResumenCarreraRepositoryPrisma implements LecturaResumenCarreraPort {
  constructor(private readonly prisma: PrismaService) {}

  async medicionDirectaVigente(planEstudiosId: string): Promise<MedicionLeida | null> {
    const plan = await this.prisma.planMedicion.findFirst({
      where: { planEstudiosId, tipo: 'DIRECTA', estado: 'VIGENTE' },
      select: {
        id: true,
        meta: true,
        periodos: {
          select: { id: true, etiqueta: true, orden: true, fechaCierre: true },
          orderBy: { orden: 'asc' },
        },
      },
    });
    if (!plan) return null;

    const [celdas, evaluacion] = await Promise.all([
      this.prisma.programacion.findMany({
        where: { planMedicionId: plan.id },
        select: { periodoId: true, realizada: true },
      }),
      this.prisma.planEvaluacion.findFirst({
        where: { planMedicionId: plan.id, estado: 'VIGENTE' },
        select: { id: true },
      }),
    ]);

    const resultados = evaluacion
      ? await this.prisma.medicionAlcanzada.findMany({
          where: { planEvaluacionId: evaluacion.id, porcentajeAlcanzado: { not: null } },
          select: { competenciaId: true, periodoId: true, porcentajeAlcanzado: true },
        })
      : [];

    return {
      meta: Number(plan.meta),
      periodos: plan.periodos.map((p) => {
        const deEste = celdas.filter((c) => c.periodoId === p.id);
        return {
          id: p.id,
          etiqueta: p.etiqueta,
          orden: p.orden,
          fechaCierre: p.fechaCierre,
          programadas: deEste.length,
          realizadas: deEste.filter((c) => c.realizada).length,
        };
      }),
      resultados: resultados.map((r) => ({
        competenciaId: r.competenciaId,
        periodoId: r.periodoId,
        // El filtro `not: null` de arriba garantiza el valor.
        porcentaje: r.porcentajeAlcanzado ?? 0,
      })),
    };
  }

  async planesMejoraDeCarrera(carreraId: string): Promise<readonly PlanMejoraLeido[]> {
    const filas = await this.prisma.planMejora.findMany({
      where: { carreraId, estado: { not: 'HISTORICO' } },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        aspecto: true,
        competenciaId: true,
        estado: true,
        estadoImplementacion: true,
        responsable: true,
        plazo: true,
      },
    });
    return filas;
  }

  async actasPorCerrarDeCarrera(carreraId: string): Promise<readonly ActaLeida[]> {
    const filas = await this.prisma.actaAprobacion.findMany({
      where: { carreraId, estado: { in: ['BORRADOR', 'EN_REVISION', 'APROBADA'] } },
      select: { id: true, codigo: true, estado: true },
      orderBy: { correlativo: 'asc' },
    });
    return filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      // El filtro de arriba deja fuera EMITIDA e HISTORICA.
      estado: f.estado as ActaLeida['estado'],
    }));
  }

  async sinResponsableDe(planEstudiosId: string): Promise<readonly SinResponsableCrudo[]> {
    const [competencias, asignaturas] = await Promise.all([
      this.prisma.configuracionCompetencia.findMany({
        where: {
          responsableId: null,
          plan: { estado: 'VIGENTE', plan: { planEstudiosId, tipo: 'INDIRECTA' } },
        },
        select: { competenciaId: true },
      }),
      this.prisma.asignaturaEvaluada.findMany({
        where: {
          docenteId: null,
          medicion: { plan: { estado: 'VIGENTE', plan: { planEstudiosId, tipo: 'DIRECTA' } } },
        },
        select: { asignaturaId: true },
      }),
    ]);

    return [
      ...competencias.map((c) => ({ tipo: 'COMPETENCIA' as const, referenciaId: c.competenciaId })),
      ...asignaturas.map((a) => ({ tipo: 'ASIGNATURA' as const, referenciaId: a.asignaturaId })),
    ];
  }
}
