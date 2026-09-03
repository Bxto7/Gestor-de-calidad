/**
 * Repositorio Prisma de los reportes.
 *
 * Solo lectura: ningún método escribe, y el puerto tampoco los declara. Un
 * reporte que pudiera modificar lo que está midiendo sería una forma difícil de
 * detectar de corromper los datos que sostienen una acreditación.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosPanel,
  DatosReportePlan,
  FiltroBusqueda,
  PlanEncontrado,
  RepositorioReportesPort,
} from '../../application/ports/reportes.port.js';
import type { AsignaturaParaReporte } from '../../domain/reportes/calculos.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';

const A_DOMINIO: Readonly<Record<string, EstadoPlan>> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  VIGENTE: 'Vigente',
  HISTORICO: 'Histórico',
};

const A_BASE: Readonly<Record<EstadoPlan, string>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
  Vigente: 'VIGENTE',
  Histórico: 'HISTORICO',
};

const CONDICION: Readonly<Record<string, 'Obligatoria' | 'Electiva'>> = {
  OBLIGATORIA: 'Obligatoria',
  ELECTIVA: 'Electiva',
};

const TIPO: Readonly<Record<string, 'General' | 'Transversal' | 'Especialidad'>> = {
  GENERAL: 'General',
  TRANSVERSAL: 'Transversal',
  ESPECIALIDAD: 'Especialidad',
};

@Injectable()
export class ReportesRepositoryPrisma implements RepositorioReportesPort {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPlanes(filtro: FiltroBusqueda): Promise<PlanEncontrado[]> {
    const texto = filtro.texto?.trim();

    const filas = await this.prisma.planEstudios.findMany({
      where: {
        ...(texto
          ? {
              // El texto busca en los tres niveles a la vez. Es lo que la hace
              // «global»: quien escribe «Sistemas» no sabe si es el nombre de
              // la carrera o parte del código del plan, y no tiene por qué.
              OR: [
                { codigo: { contains: texto, mode: 'insensitive' as const } },
                { carrera: { nombre: { contains: texto, mode: 'insensitive' as const } } },
                { carrera: { codigo: { contains: texto, mode: 'insensitive' as const } } },
                {
                  carrera: {
                    facultad: { nombre: { contains: texto, mode: 'insensitive' as const } },
                  },
                },
              ],
            }
          : {}),
        ...(filtro.estado ? { estado: A_BASE[filtro.estado] as never } : {}),
        ...(filtro.carreraId ? { carreraId: filtro.carreraId } : {}),
        ...(filtro.facultadId ? { carrera: { facultadId: filtro.facultadId } } : {}),
      },
      include: {
        carrera: { select: { nombre: true, facultad: { select: { nombre: true } } } },
        _count: { select: { asignaturas: true } },
      },
      // Lo más recientemente tocado primero: es lo que se está trabajando.
      orderBy: { actualizadoEn: 'desc' },
      take: filtro.limite,
    });

    return filas.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      version: p.version,
      estado: A_DOMINIO[p.estado] ?? 'Borrador',
      carreraId: p.carreraId,
      carrera: p.carrera.nombre,
      facultad: p.carrera.facultad.nombre,
      asignaturas: p._count.asignaturas,
      fechaVigencia: p.fechaVigencia,
      actualizadoEn: p.actualizadoEn,
    }));
  }

  async datosDePlan(planId: string): Promise<DatosReportePlan | null> {
    const plan = await this.prisma.planEstudios.findUnique({
      where: { id: planId },
      include: {
        carrera: {
          select: {
            nombre: true,
            facultad: { select: { nombre: true } },
            ciclos: {
              select: { numero: true, creditosMin: true, creditosMax: true },
              orderBy: { numero: 'asc' },
            },
          },
        },
        asignaturas: {
          include: {
            ciclo: { select: { numero: true } },
            grupo: { select: { codigo: true, cantidadAElegir: true } },
          },
        },
      },
    });

    if (!plan) return null;

    return {
      plan: {
        id: plan.id,
        codigo: plan.codigo,
        version: plan.version,
        estado: A_DOMINIO[plan.estado] ?? 'Borrador',
        carreraId: plan.carreraId,
      },
      carrera: plan.carrera.nombre,
      facultad: plan.carrera.facultad.nombre,
      asignaturas: plan.asignaturas.map(aAsignatura),
      ciclos: plan.carrera.ciclos,
    };
  }

  async panel(marco: string): Promise<DatosPanel> {
    // En paralelo: son consultas independientes y en serie el panel tardaría la
    // suma de todas para no ganar nada.
    const [
      facultades,
      carreras,
      porEstado,
      asignaturas,
      competencias,
      objetivos,
      sinVigente,
      atributos,
    ] = await Promise.all([
      this.prisma.facultad.count(),
      this.prisma.carrera.count(),
      this.prisma.planEstudios.groupBy({ by: ['estado'], _count: { _all: true } }),
      this.prisma.asignatura.count({ where: { estado: 'ACTIVO' } }),
      this.prisma.competencia.count({ where: { estado: 'ACTIVO' } }),
      this.prisma.objetivoEducacional.count({ where: { estado: 'ACTIVO' } }),
      this.prisma.carrera.findMany({
        where: { planes: { none: { estado: 'VIGENTE' } } },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.atributoGraduado.findMany({
        where: { marco },
        select: {
          codigo: true,
          competencias: {
            where: { competencia: { estado: 'ACTIVO' } },
            select: { atributoId: true },
          },
        },
        orderBy: { orden: 'asc' },
      }),
    ]);

    return {
      facultades,
      carreras,
      // Los cinco estados, también los que están a cero: «ningún plan aprobado»
      // es información, y una fila ausente no se distingue de un fallo.
      planesPorEstado: Object.values(A_DOMINIO).map((estado) => ({
        estado,
        total: porEstado.find((g) => A_DOMINIO[g.estado] === estado)?._count._all ?? 0,
      })),
      asignaturas,
      competencias,
      objetivos,
      carrerasSinPlanVigente: sinVigente,
      atributosSinCubrir: atributos.filter((a) => a.competencias.length === 0).map((a) => a.codigo),
      totalAtributos: atributos.length,
    };
  }
}

function aAsignatura(fila: {
  id: string;
  codigo: string;
  nombre: string;
  creditos: number;
  estado: string;
  tipo: string;
  condicion: string;
  ciclo: { numero: number } | null;
  grupo: { codigo: string; cantidadAElegir: number } | null;
}): AsignaturaParaReporte {
  return {
    id: fila.id,
    nombre: fila.nombre,
    // Los reportes no miran competencias por asignatura; el campo existe para
    // compartir forma con lo que espera el motor de validaciones.
    competenciaIds: [],
    codigo: fila.codigo,
    creditos: fila.creditos,
    cicloNumero: fila.ciclo?.numero ?? null,
    activa: fila.estado === 'ACTIVO',
    tipo: TIPO[fila.tipo] ?? 'Especialidad',
    condicion: CONDICION[fila.condicion] ?? 'Obligatoria',
    grupoElectivo: fila.grupo,
  };
}
