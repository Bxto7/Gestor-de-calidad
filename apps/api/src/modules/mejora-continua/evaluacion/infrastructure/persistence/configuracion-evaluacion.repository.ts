/**
 * Implementación Prisma del `RepositorioConfiguracionEvaluacionPort`.
 *
 * Sigue el patrón de `plan-evaluacion.repository.ts`: `@Injectable`,
 * `PrismaService` por constructor, una `SELECCION` explícita y funciones de
 * mapeo puras.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  ConfiguracionDelPlan,
  DatosAsignaturaEvaluada,
  DatosConfiguracionCompetencia,
  DatosEvidencia,
  DatosIndicacion,
  DatosMedicion,
  GrupoObjetivo,
  RepositorioConfiguracionEvaluacionPort,
} from '../../application/ports/configuracion-evaluacion.port.js';

const SELECCION_EVIDENCIA = {
  id: true,
  enlace: true,
  descripcion: true,
} as const;

const SELECCION_ASIGNATURA = {
  id: true,
  asignaturaId: true,
  entregable: true,
  docenteId: true,
  evidencias: {
    select: SELECCION_EVIDENCIA,
    orderBy: { orden: 'asc' as const },
  },
} as const;

const SELECCION_MEDICION = {
  competenciaId: true,
  periodoId: true,
  porcentajeAlcanzado: true,
  asignaturas: {
    select: SELECCION_ASIGNATURA,
    orderBy: { asignaturaId: 'asc' as const },
  },
} as const;

const SELECCION_COMPETENCIA = {
  competenciaId: true,
  instrumento: true,
  frecuencia: true,
  responsableId: true,
} as const;

const SELECCION_INDICACION = {
  id: true,
  periodoId: true,
  grupoObjetivo: true,
  instruccion: true,
  enlaceInstrumento: true,
  enlaceResultados: true,
} as const;

interface FilaEvidencia {
  id: string;
  enlace: string;
  descripcion: string;
}

interface FilaAsignatura {
  id: string;
  asignaturaId: string;
  entregable: string;
  docenteId: string | null;
  evidencias: FilaEvidencia[];
}

interface FilaMedicion {
  competenciaId: string;
  periodoId: string;
  porcentajeAlcanzado: number | null;
  asignaturas: FilaAsignatura[];
}

interface FilaCompetencia {
  competenciaId: string;
  instrumento: string | null;
  frecuencia: string | null;
  responsableId: string | null;
}

interface FilaIndicacion {
  id: string;
  periodoId: string;
  grupoObjetivo: GrupoObjetivo;
  instruccion: string;
  enlaceInstrumento: string;
  enlaceResultados: string | null;
}

function aEvidencia(fila: FilaEvidencia): DatosEvidencia {
  return { id: fila.id, enlace: fila.enlace, descripcion: fila.descripcion };
}

function aAsignatura(fila: FilaAsignatura): DatosAsignaturaEvaluada {
  return {
    id: fila.id,
    asignaturaId: fila.asignaturaId,
    entregable: fila.entregable,
    docenteId: fila.docenteId,
    evidencias: fila.evidencias.map(aEvidencia),
  };
}

function aMedicion(fila: FilaMedicion): DatosMedicion {
  return {
    competenciaId: fila.competenciaId,
    periodoId: fila.periodoId,
    porcentajeAlcanzado: fila.porcentajeAlcanzado,
    asignaturas: fila.asignaturas.map(aAsignatura),
  };
}

function aCompetencia(fila: FilaCompetencia): DatosConfiguracionCompetencia {
  return {
    competenciaId: fila.competenciaId,
    instrumento: fila.instrumento,
    frecuencia: fila.frecuencia,
    responsableId: fila.responsableId,
  };
}

function aIndicacion(fila: FilaIndicacion): DatosIndicacion {
  return {
    id: fila.id,
    periodoId: fila.periodoId,
    grupoObjetivo: fila.grupoObjetivo,
    instruccion: fila.instruccion,
    enlaceInstrumento: fila.enlaceInstrumento,
    enlaceResultados: fila.enlaceResultados,
  };
}

@Injectable()
export class ConfiguracionEvaluacionRepositoryPrisma implements RepositorioConfiguracionEvaluacionPort {
  constructor(private readonly prisma: PrismaService) {}

  async del(planEvaluacionId: string): Promise<ConfiguracionDelPlan> {
    const [competencias, mediciones, indicaciones] = await Promise.all([
      this.prisma.configuracionCompetencia.findMany({
        where: { planEvaluacionId },
        select: SELECCION_COMPETENCIA,
      }),
      this.prisma.medicionAlcanzada.findMany({
        where: { planEvaluacionId },
        select: SELECCION_MEDICION,
      }),
      this.prisma.indicacionDeMedicion.findMany({
        where: { planEvaluacionId },
        select: SELECCION_INDICACION,
        orderBy: [{ periodoId: 'asc' }, { grupoObjetivo: 'asc' }],
      }),
    ]);

    return {
      competencias: competencias.map(aCompetencia),
      mediciones: mediciones.map(aMedicion),
      indicaciones: indicaciones.map(aIndicacion),
    };
  }

  async guardarCompetencia(datos: {
    planEvaluacionId: string;
    competenciaId: string;
    instrumento: string | null;
    frecuencia: string | null;
    responsableId?: string | null;
  }): Promise<void> {
    await this.prisma.configuracionCompetencia.upsert({
      where: {
        planEvaluacionId_competenciaId: {
          planEvaluacionId: datos.planEvaluacionId,
          competenciaId: datos.competenciaId,
        },
      },
      create: datos,
      // `responsableId` va tal cual, incluso `undefined`: Prisma no toca un
      // campo que no viene en el `update`, así que quien llama sin conocer el
      // responsable no borra el que ya estaba (ver el comentario del puerto).
      update: {
        instrumento: datos.instrumento,
        frecuencia: datos.frecuencia,
        responsableId: datos.responsableId,
      },
    });
  }

  async reemplazarAsignaturas(
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    asignaturas: readonly { asignaturaId: string; entregable: string; docenteId: string | null }[],
  ): Promise<void> {
    const ids = asignaturas.map((a) => a.asignaturaId);

    await this.prisma.$transaction(async (tx) => {
      // La fila del cruce puede no existir todavía: `AsignaturaEvaluada` cuelga
      // de ella. El `update` va vacío a propósito — asegurar que existe no debe
      // tocar el porcentaje que alguien ya registró.
      const cruce = await tx.medicionAlcanzada.upsert({
        where: {
          planEvaluacionId_competenciaId_periodoId: { planEvaluacionId, competenciaId, periodoId },
        },
        create: { planEvaluacionId, competenciaId, periodoId },
        update: {},
        select: { id: true },
      });

      // Solo las que ya no vienen. Borrarlas todas y recrearlas daría el mismo
      // resultado visible y se llevaría por cascada las evidencias de las que
      // se conservan — el usuario perdería su trabajo sin que nada lo avise.
      await tx.asignaturaEvaluada.deleteMany({
        where: { medicionAlcanzadaId: cruce.id, asignaturaId: { notIn: ids } },
      });

      for (const a of asignaturas) {
        await tx.asignaturaEvaluada.upsert({
          where: {
            medicionAlcanzadaId_asignaturaId: {
              medicionAlcanzadaId: cruce.id,
              asignaturaId: a.asignaturaId,
            },
          },
          create: {
            medicionAlcanzadaId: cruce.id,
            asignaturaId: a.asignaturaId,
            entregable: a.entregable,
            docenteId: a.docenteId,
          },
          update: { entregable: a.entregable, docenteId: a.docenteId },
        });
      }
    });
  }

  async guardarPorcentaje(
    planEvaluacionId: string,
    competenciaId: string,
    periodoId: string,
    porcentaje: number | null,
  ): Promise<void> {
    await this.prisma.medicionAlcanzada.upsert({
      where: {
        planEvaluacionId_competenciaId_periodoId: { planEvaluacionId, competenciaId, periodoId },
      },
      create: { planEvaluacionId, competenciaId, periodoId, porcentajeAlcanzado: porcentaje },
      update: { porcentajeAlcanzado: porcentaje },
    });
  }

  async reemplazarEvidencias(
    asignaturaEvaluadaId: string,
    evidencias: readonly { enlace: string; descripcion: string }[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.evidencia.deleteMany({ where: { asignaturaEvaluadaId } });
      if (evidencias.length === 0) return;
      await tx.evidencia.createMany({
        data: evidencias.map((e, indice) => ({
          asignaturaEvaluadaId,
          enlace: e.enlace,
          descripcion: e.descripcion,
          orden: indice,
        })),
      });
    });
  }

  async planDeAsignaturaEvaluada(asignaturaEvaluadaId: string): Promise<string | null> {
    const fila = await this.prisma.asignaturaEvaluada.findUnique({
      where: { id: asignaturaEvaluadaId },
      select: { medicion: { select: { planEvaluacionId: true } } },
    });
    return fila?.medicion.planEvaluacionId ?? null;
  }

  async reemplazarIndicaciones(
    planEvaluacionId: string,
    periodoId: string,
    indicaciones: readonly {
      grupoObjetivo: GrupoObjetivo;
      instruccion: string;
      enlaceInstrumento: string;
    }[],
  ): Promise<void> {
    const grupos = indicaciones.map((i) => i.grupoObjetivo);

    await this.prisma.$transaction(async (tx) => {
      // Solo las que ya no vienen. Borrarlas todas y recrearlas daría el mismo
      // resultado visible pero se llevaría el `enlaceResultados` de las que se
      // conservan: es seguimiento, y lo escribe otro endpoint (RF-PE-029), no
      // la definición que este método reemplaza.
      await tx.indicacionDeMedicion.deleteMany({
        where: { planEvaluacionId, periodoId, grupoObjetivo: { notIn: grupos } },
      });

      for (const i of indicaciones) {
        await tx.indicacionDeMedicion.upsert({
          where: {
            planEvaluacionId_periodoId_grupoObjetivo: {
              planEvaluacionId,
              periodoId,
              grupoObjetivo: i.grupoObjetivo,
            },
          },
          create: {
            planEvaluacionId,
            periodoId,
            grupoObjetivo: i.grupoObjetivo,
            instruccion: i.instruccion,
            enlaceInstrumento: i.enlaceInstrumento,
          },
          // El `update` no menciona `enlaceResultados`: por eso sobrevive.
          update: { instruccion: i.instruccion, enlaceInstrumento: i.enlaceInstrumento },
        });
      }
    });
  }

  async guardarResultados(indicacionId: string, enlaceResultados: string | null): Promise<void> {
    await this.prisma.indicacionDeMedicion.update({
      where: { id: indicacionId },
      data: { enlaceResultados },
    });
  }

  async planDeIndicacion(indicacionId: string): Promise<string | null> {
    const fila = await this.prisma.indicacionDeMedicion.findUnique({
      where: { id: indicacionId },
      select: { planEvaluacionId: true },
    });
    return fila?.planEvaluacionId ?? null;
  }
}
