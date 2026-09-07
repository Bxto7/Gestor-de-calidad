/**
 * Implementación del `ContenidoCurricularPort`.
 *
 * Vive en `plan-estudios` porque es quien posee los datos. Mejora Continua
 * depende de la interfaz y nunca de esta clase: por eso el adaptador puede
 * cambiar —o convertirse en un cliente HTTP el día que el módulo se extraiga a
 * su propio servicio— sin que el consumidor se entere.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type {
  AsignaturaBase,
  CompetenciaConAtributos,
  ContenidoCurricularPort,
  PlanBase,
} from '../application/ports/contenido-curricular.port.js';

/** RF-PM-001 RN2: los únicos estados sobre los que se puede medir. */
const ELEGIBLES = ['APROBADO', 'VIGENTE'] as const;

const SELECCION_PLAN = {
  id: true,
  codigo: true,
  carreraId: true,
  version: true,
  estado: true,
  duracionAnios: true,
  carrera: { select: { nombre: true } },
} as const;

interface FilaPlan {
  id: string;
  codigo: string;
  carreraId: string;
  version: number;
  estado: string;
  duracionAnios: number;
  carrera: { nombre: string };
}

function aPlanBase(fila: FilaPlan): PlanBase {
  return {
    id: fila.id,
    codigo: fila.codigo,
    carreraId: fila.carreraId,
    carreraNombre: fila.carrera.nombre,
    version: fila.version,
    elegible: (ELEGIBLES as readonly string[]).includes(fila.estado),
    duracionAnios: fila.duracionAnios,
  };
}

@Injectable()
export class ContenidoCurricularAdapter implements ContenidoCurricularPort {
  constructor(private readonly prisma: PrismaService) {}

  async planesElegibles(): Promise<PlanBase[]> {
    const filas = await this.prisma.planEstudios.findMany({
      where: { estado: { in: [...ELEGIBLES] } },
      select: SELECCION_PLAN,
      orderBy: [{ carrera: { nombre: 'asc' } }, { version: 'desc' }],
    });
    return filas.map(aPlanBase);
  }

  /**
   * Devuelve también los no elegibles, con la marca puesta.
   *
   * Distinguir «no existe» de «existe pero no está Aprobado» es lo que permite
   * al caso de uso dar el motivo concreto que pide RNF08 en vez de un 404 que
   * mandaría al usuario a buscar un plan que sí tiene delante.
   */
  async planPorId(planEstudiosId: string): Promise<PlanBase | null> {
    const fila = await this.prisma.planEstudios.findUnique({
      where: { id: planEstudiosId },
      select: SELECCION_PLAN,
    });
    return fila ? aPlanBase(fila) : null;
  }

  /**
   * Las competencias del plan, con los atributos del graduado que desarrollan.
   *
   * Se parte de `planCompetencia` y no de `competencia` porque la pregunta es
   * «qué contiene este plan», y la competencia es un catálogo global que varios
   * planes comparten. Las inactivas se devuelven marcadas y no se filtran: quien
   * arma el plan de medición necesita ver que una competencia quedó retirada,
   * porque ocultarla dejaría un hueco sin explicación.
   */
  async competenciasDelPlan(planEstudiosId: string): Promise<CompetenciaConAtributos[]> {
    const filas = await this.prisma.planCompetencia.findMany({
      where: { planId: planEstudiosId },
      select: {
        competencia: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            estado: true,
            atributos: {
              select: { atributo: { select: { id: true, codigo: true, nombre: true } } },
              orderBy: { atributo: { codigo: 'asc' } },
            },
          },
        },
      },
      orderBy: { competencia: { codigo: 'asc' } },
    });

    return filas.map((f) => ({
      id: f.competencia.id,
      codigo: f.competencia.codigo,
      nombre: f.competencia.nombre,
      activa: f.competencia.estado === 'ACTIVO',
      atributos: f.competencia.atributos.map((a) => a.atributo),
    }));
  }

  async asignaturasDelPlan(planEstudiosId: string): Promise<AsignaturaBase[]> {
    const filas = await this.prisma.asignatura.findMany({
      where: { planId: planEstudiosId },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        estado: true,
        ciclo: { select: { numero: true } },
      },
      orderBy: [{ ciclo: { numero: 'asc' } }, { codigo: 'asc' }],
    });

    return filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      cicloNumero: f.ciclo?.numero ?? null,
      activa: f.estado === 'ACTIVO',
    }));
  }
}
