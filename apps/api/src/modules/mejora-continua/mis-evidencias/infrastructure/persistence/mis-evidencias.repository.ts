import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  ContextoDeEvaluacion,
  ContextoDeEvidencia,
  RepositorioMisEvidenciasPort,
} from '../../application/ports/mis-evidencias.port.js';
import type { EvaluacionAsignada } from '../../domain/services/mis-evaluaciones.js';

/** Lo que hay que leer de una asignatura evaluada para armar su contexto. */
const SELECCION_CONTEXTO = {
  id: true,
  docenteId: true,
  _count: { select: { evidencias: true } },
  medicion: {
    select: {
      plan: {
        select: {
          id: true,
          codigo: true,
          estado: true,
          plan: { select: { planEstudiosId: true } },
        },
      },
    },
  },
} as const;

interface FilaContexto {
  id: string;
  docenteId: string | null;
  _count: { evidencias: number };
  medicion: {
    plan: {
      id: string;
      codigo: string;
      estado: ContextoDeEvaluacion['estadoPlan'];
      plan: { planEstudiosId: string };
    };
  };
}

function aContexto(fila: FilaContexto): ContextoDeEvaluacion {
  return {
    asignaturaEvaluadaId: fila.id,
    docenteId: fila.docenteId,
    planEvaluacionId: fila.medicion.plan.id,
    planCodigo: fila.medicion.plan.codigo,
    estadoPlan: fila.medicion.plan.estado,
    planEstudiosId: fila.medicion.plan.plan.planEstudiosId,
    totalEvidencias: fila._count.evidencias,
  };
}

@Injectable()
export class MisEvidenciasRepositoryPrisma implements RepositorioMisEvidenciasPort {
  constructor(private readonly prisma: PrismaService) {}

  async evaluacionesDelDocente(
    docenteId: string,
    planEstudiosId: string,
  ): Promise<readonly EvaluacionAsignada[]> {
    const filas = await this.prisma.asignaturaEvaluada.findMany({
      where: {
        docenteId,
        medicion: { plan: { estado: 'VIGENTE', plan: { planEstudiosId } } },
      },
      select: {
        id: true,
        asignaturaId: true,
        entregable: true,
        evidencias: {
          select: { id: true, enlace: true, descripcion: true, registradaPorId: true },
          orderBy: { orden: 'asc' },
        },
        medicion: {
          select: {
            competenciaId: true,
            periodoId: true,
            plan: { select: { id: true, codigo: true } },
          },
        },
      },
    });

    // El periodo es un UUID suelto (sin clave foránea): se resuelve aparte.
    const periodoIds = [...new Set(filas.map((f) => f.medicion.periodoId))];
    const periodos = await this.prisma.periodoMedicion.findMany({
      where: { id: { in: periodoIds } },
      select: { id: true, etiqueta: true, fechaCierre: true },
    });
    const periodoPorId = new Map(periodos.map((p) => [p.id, p]));

    return filas.map((f) => {
      const periodo = periodoPorId.get(f.medicion.periodoId);
      // Un periodo borrado no debe hacer desaparecer la evaluación asignada.
      return {
        id: f.id,
        asignaturaId: f.asignaturaId,
        competenciaId: f.medicion.competenciaId,
        entregable: f.entregable,
        periodo: {
          id: f.medicion.periodoId,
          etiqueta: periodo?.etiqueta ?? '—',
          fechaCierre: periodo?.fechaCierre ?? null,
        },
        planEvaluacion: f.medicion.plan,
        evidencias: f.evidencias,
      };
    });
  }

  async contextoDeEvaluacion(asignaturaEvaluadaId: string): Promise<ContextoDeEvaluacion | null> {
    const fila = await this.prisma.asignaturaEvaluada.findUnique({
      where: { id: asignaturaEvaluadaId },
      select: SELECCION_CONTEXTO,
    });
    return fila ? aContexto(fila) : null;
  }

  async contextoDeEvidencia(evidenciaId: string): Promise<ContextoDeEvidencia | null> {
    const fila = await this.prisma.evidencia.findUnique({
      where: { id: evidenciaId },
      select: { id: true, registradaPorId: true, asignatura: { select: SELECCION_CONTEXTO } },
    });
    if (!fila) return null;
    return {
      ...aContexto(fila.asignatura),
      evidenciaId: fila.id,
      registradaPorId: fila.registradaPorId,
    };
  }

  async agregarEvidencia(
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string; registradaPorId: string },
  ): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const ultimo = await tx.evidencia.aggregate({
        where: { asignaturaEvaluadaId },
        _max: { orden: true },
      });
      return tx.evidencia.create({
        data: {
          asignaturaEvaluadaId,
          enlace: datos.enlace,
          descripcion: datos.descripcion,
          orden: (ultimo._max.orden ?? -1) + 1,
          registradaPorId: datos.registradaPorId,
        },
        select: { id: true },
      });
    });
  }

  async retirarEvidencia(evidenciaId: string): Promise<void> {
    await this.prisma.evidencia.delete({ where: { id: evidenciaId } });
  }
}
