/**
 * Implementación Prisma del `RepositorioPlanMedicionPort`.
 *
 * Aquí ocurre la única traducción entre el vocabulario del dominio —«En
 * revisión», con tilde y espacio— y el del enum de PostgreSQL. Mantenerla en un
 * solo sitio evita que `EN_REVISION` se filtre hacia los casos de uso, que
 * hablan del ciclo de vida y no de cómo se guarda.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  CeldaMatriz,
  DatosPlanMedicion,
  FiltroPlanesMedicion,
  RepositorioPlanMedicionPort,
  TipoMedicion,
} from '../../application/ports/plan-medicion.port.js';
import type { EstadoMedicion } from '../../domain/value-objects/estado-plan-medicion.js';

type EstadoBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

const A_BD: Readonly<Record<EstadoMedicion, EstadoBd>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
  Vigente: 'VIGENTE',
  Histórico: 'HISTORICO',
};

const A_DOMINIO = Object.fromEntries(Object.entries(A_BD).map(([k, v]) => [v, k])) as Record<
  string,
  EstadoMedicion
>;

const SELECCION = {
  id: true,
  planEstudiosId: true,
  tipo: true,
  codigo: true,
  version: true,
  meta: true,
  estado: true,
  periodoInicioAnio: true,
  periodoInicioMitad: true,
  creadoEn: true,
  competencias: { select: { competenciaId: true } },
  periodos: {
    select: { id: true, etiqueta: true, orden: true, fechaCierre: true },
    orderBy: { orden: 'asc' as const },
  },
} as const;

interface Fila {
  id: string;
  planEstudiosId: string;
  tipo: string;
  codigo: string;
  version: number;
  meta: unknown;
  estado: string;
  periodoInicioAnio: number | null;
  periodoInicioMitad: number | null;
  creadoEn: Date;
  competencias: { competenciaId: string }[];
  periodos: { id: string; etiqueta: string; orden: number; fechaCierre: Date | null }[];
}

function aDatos(fila: Fila): DatosPlanMedicion {
  return {
    id: fila.id,
    planEstudiosId: fila.planEstudiosId,
    tipo: fila.tipo as TipoMedicion,
    codigo: fila.codigo,
    version: fila.version,
    // `meta` llega como `Prisma.Decimal`; el dominio la quiere como número.
    meta: Number(fila.meta),
    estado: A_DOMINIO[fila.estado] ?? 'Borrador',
    periodoInicio:
      fila.periodoInicioAnio !== null && fila.periodoInicioMitad !== null
        ? { anio: fila.periodoInicioAnio, mitad: fila.periodoInicioMitad as 1 | 2 }
        : null,
    competenciaIds: fila.competencias.map((c) => c.competenciaId),
    periodos: fila.periodos,
    creadoEn: fila.creadoEn,
  };
}

@Injectable()
export class PlanMedicionRepositoryPrisma implements RepositorioPlanMedicionPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: FiltroPlanesMedicion): Promise<DatosPlanMedicion[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.planMedicion.findMany({
      where: {
        ...(filtro?.planEstudiosId ? { planEstudiosId: filtro.planEstudiosId } : {}),
        ...(filtro?.tipo ? { tipo: filtro.tipo } : {}),
        ...(filtro?.estado ? { estado: A_BD[filtro.estado] } : {}),
        ...(texto ? { codigo: { contains: texto, mode: 'insensitive' as const } } : {}),
      },
      select: SELECCION,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosPlanMedicion | null> {
    const fila = await this.prisma.planMedicion.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  /** RF-PM-041 RN1. */
  async vigenteDe(planEstudiosId: string, tipo: TipoMedicion): Promise<DatosPlanMedicion | null> {
    const fila = await this.prisma.planMedicion.findFirst({
      where: { planEstudiosId, tipo, estado: 'VIGENTE' },
      select: SELECCION,
    });
    return fila ? aDatos(fila) : null;
  }

  async codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]> {
    const filas = await this.prisma.planMedicion.findMany({
      where: { planEstudiosId, tipo },
      select: { codigo: true },
    });
    return filas.map((f) => f.codigo);
  }

  async crear(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    meta: number;
    periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  }): Promise<DatosPlanMedicion> {
    const fila = await this.prisma.planMedicion.create({
      data: {
        planEstudiosId: datos.planEstudiosId,
        tipo: datos.tipo,
        codigo: datos.codigo,
        meta: datos.meta,
        periodoInicioAnio: datos.periodoInicio?.anio ?? null,
        periodoInicioMitad: datos.periodoInicio?.mitad ?? null,
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizar(id: string, datos: { meta?: number }): Promise<DatosPlanMedicion> {
    const fila = await this.prisma.planMedicion.update({
      where: { id },
      data: { ...(datos.meta === undefined ? {} : { meta: datos.meta }) },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanMedicion> {
    const fila = await this.prisma.planMedicion.update({
      where: { id },
      data: { estado: A_BD[estado] },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async eliminar(id: string): Promise<void> {
    // Periodos, competencias y matriz caen por cascada del esquema.
    await this.prisma.planMedicion.delete({ where: { id } });
  }

  /** RNF12: atómico. */
  async declararCompetencias(
    id: string,
    competenciaIds: readonly string[],
  ): Promise<DatosPlanMedicion> {
    await this.prisma.$transaction([
      this.prisma.competenciaDelPlan.deleteMany({ where: { planMedicionId: id } }),
      this.prisma.competenciaDelPlan.createMany({
        data: competenciaIds.map((competenciaId) => ({ planMedicionId: id, competenciaId })),
      }),
    ]);
    return this.exigir(id);
  }

  /**
   * RNF12: atómico. Las celdas de los periodos que desaparecen caen por la
   * cascada de `Programacion.periodo`, que es lo que RF-PM-016 permite hacer
   * mientras el plan está en Borrador.
   */
  async declararPeriodos(
    id: string,
    periodos: readonly { etiqueta: string; orden: number; fechaCierre: Date | null }[],
  ): Promise<DatosPlanMedicion> {
    await this.prisma.$transaction([
      this.prisma.periodoMedicion.deleteMany({ where: { planMedicionId: id } }),
      this.prisma.periodoMedicion.createMany({
        data: periodos.map((p) => ({
          planMedicionId: id,
          etiqueta: p.etiqueta,
          orden: p.orden,
          fechaCierre: p.fechaCierre,
        })),
      }),
    ]);
    return this.exigir(id);
  }

  async matriz(id: string): Promise<CeldaMatriz[]> {
    // Selección mínima: la prueba de RNF04 pide 750 filas, y traer el plan
    // entero por cada una las multiplicaría sin que nadie las use.
    return this.prisma.programacion.findMany({
      where: { planMedicionId: id },
      select: { competenciaId: true, periodoId: true, realizada: true, realizadaEn: true },
    });
  }

  /**
   * Reemplaza la programación completa, conservando las marcas de realizada.
   *
   * Se leen antes de borrar y se reinyectan en las celdas que siguen presentes:
   * quitar y volver a poner una competencia en la matriz no puede borrar la
   * constancia de que su medición ya ocurrió.
   */
  async programar(
    id: string,
    celdas: readonly { competenciaId: string; periodoId: string }[],
  ): Promise<CeldaMatriz[]> {
    const previas = new Map(
      (await this.matriz(id)).map((c) => [`${c.competenciaId}|${c.periodoId}`, c]),
    );

    await this.prisma.$transaction([
      this.prisma.programacion.deleteMany({ where: { planMedicionId: id } }),
      this.prisma.programacion.createMany({
        data: celdas.map((c) => {
          const previa = previas.get(`${c.competenciaId}|${c.periodoId}`);
          return {
            planMedicionId: id,
            competenciaId: c.competenciaId,
            periodoId: c.periodoId,
            realizada: previa?.realizada ?? false,
            realizadaEn: previa?.realizadaEn ?? null,
          };
        }),
      }),
    ]);

    return this.matriz(id);
  }

  /** RF-PM-026 RN2: con usuario y fecha. Desmarcar las limpia. */
  async marcarRealizada(
    id: string,
    competenciaId: string,
    periodoId: string,
    realizada: boolean,
    actorId: string,
  ): Promise<CeldaMatriz> {
    const fila = await this.prisma.programacion.update({
      where: {
        planMedicionId_competenciaId_periodoId: {
          planMedicionId: id,
          competenciaId,
          periodoId,
        },
      },
      data: {
        realizada,
        realizadaEn: realizada ? new Date() : null,
        realizadaPorId: realizada ? actorId : null,
      },
      select: { competenciaId: true, periodoId: true, realizada: true, realizadaEn: true },
    });
    return fila;
  }

  /** Relee el plan tras una escritura parcial. */
  private async exigir(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.porId(id);
    if (!plan) throw new Error(`El plan de medición ${id} desapareció durante la operación.`);
    return plan;
  }
}
