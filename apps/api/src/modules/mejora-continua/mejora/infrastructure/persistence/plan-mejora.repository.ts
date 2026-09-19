/**
 * Implementación Prisma del `RepositorioPlanMejoraPort` (y, desde 2c-J-B, del
 * `ImpactoPlanMejoraPort` — la clase implementa ambos: es el mismo dueño del
 * dato, `contarVinculados` es solo un `count` más sobre la misma tabla).
 *
 * Sigue el patrón de `plan-evaluacion.repository.ts`: `@Injectable`,
 * `PrismaService` por constructor, una `SELECCION` explícita, y
 * traductores `A_BD`/`A_DOMINIO` para los enums. El de `estado` es el mismo
 * mapa que usa `PlanEvaluacionRepositoryPrisma` — es el mismo enum
 * `EstadoMedicion` reutilizado, no uno nuevo.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import type { CopiaPlanMejora } from '../../domain/services/copia-de-plan-mejora.js';
import type { EstadoImplementacion } from '../../domain/value-objects/estado-implementacion.js';
import type { ImpactoPlanMejoraPort } from '../../application/ports/impacto-plan-mejora.port.js';
import type {
  AspectoPlanMejora,
  DatosEvidencia,
  DatosParametroPlanMejora,
  DatosPlanMejora,
  DefinicionAccionMejora,
  NuevaEvidencia,
  NuevoPlanMejora,
  RepositorioPlanMejoraPort,
} from '../../application/ports/plan-mejora.port.js';

type EstadoBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';
type EstadoImplementacionBd = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO';

/** Mismo mapa que `plan-evaluacion.repository.ts`: es el mismo enum de dominio. */
const A_BD: Readonly<Record<EstadoMedicion, EstadoBd>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
  Vigente: 'VIGENTE',
  Histórico: 'HISTORICO',
};

const A_DOMINIO = Object.fromEntries(Object.entries(A_BD).map(([k, v]) => [v, k])) as Record<
  EstadoBd,
  EstadoMedicion
>;

const IMPLEMENTACION_A_BD: Readonly<Record<EstadoImplementacion, EstadoImplementacionBd>> = {
  Pendiente: 'PENDIENTE',
  'En proceso': 'EN_PROCESO',
  Completado: 'COMPLETADO',
};

const IMPLEMENTACION_A_DOMINIO = Object.fromEntries(
  Object.entries(IMPLEMENTACION_A_BD).map(([k, v]) => [v, k]),
) as Record<EstadoImplementacionBd, EstadoImplementacion>;

const SELECCION_EVIDENCIA = {
  id: true,
  planMejoraId: true,
  referencia: true,
  nombreArchivo: true,
  subidoPor: true,
  subidoEn: true,
} as const;

const SELECCION = {
  id: true,
  codigo: true,
  aspecto: true,
  carreraId: true,
  criterioAcreditacionId: true,
  objetivoEducacionalId: true,
  competenciaId: true,
  periodoId: true,
  planEvaluacionId: true,
  planMedicionAfectadoId: true,
  estado: true,
  estadoImplementacion: true,
  nombre: true,
  causaRaiz: true,
  justificacion: true,
  input: true,
  plazo: true,
  recursos: true,
  metas: true,
  responsable: true,
  logroMeta: true,
  impacto: true,
  creadoEn: true,
  version: true,
  derivadoDeId: true,
  evidencias: { select: SELECCION_EVIDENCIA, orderBy: { subidoEn: 'asc' as const } },
} as const;

interface FilaEvidencia {
  id: string;
  planMejoraId: string;
  referencia: string;
  nombreArchivo: string | null;
  subidoPor: string;
  subidoEn: Date;
}

interface Fila {
  id: string;
  codigo: string;
  aspecto: AspectoPlanMejora;
  carreraId: string;
  criterioAcreditacionId: string | null;
  objetivoEducacionalId: string | null;
  competenciaId: string | null;
  periodoId: string | null;
  planEvaluacionId: string | null;
  planMedicionAfectadoId: string | null;
  estado: string;
  estadoImplementacion: string;
  nombre: string;
  causaRaiz: string;
  justificacion: string;
  input: string | null;
  plazo: Date;
  recursos: string;
  metas: string;
  responsable: string;
  logroMeta: string | null;
  impacto: string | null;
  creadoEn: Date;
  version: number;
  derivadoDeId: string | null;
  evidencias: FilaEvidencia[];
}

function aEvidencia(fila: FilaEvidencia): DatosEvidencia {
  return {
    id: fila.id,
    planMejoraId: fila.planMejoraId,
    referencia: fila.referencia,
    nombreArchivo: fila.nombreArchivo,
    subidoPor: fila.subidoPor,
    subidoEn: fila.subidoEn,
  };
}

function aDatos(fila: Fila): DatosPlanMejora {
  return {
    id: fila.id,
    codigo: fila.codigo,
    aspecto: fila.aspecto,
    carreraId: fila.carreraId,
    criterioAcreditacionId: fila.criterioAcreditacionId,
    objetivoEducacionalId: fila.objetivoEducacionalId,
    competenciaId: fila.competenciaId,
    periodoId: fila.periodoId,
    planEvaluacionId: fila.planEvaluacionId,
    planMedicionAfectadoId: fila.planMedicionAfectadoId,
    estado: A_DOMINIO[fila.estado as EstadoBd] ?? 'Borrador',
    estadoImplementacion:
      IMPLEMENTACION_A_DOMINIO[fila.estadoImplementacion as EstadoImplementacionBd] ?? 'Pendiente',
    nombre: fila.nombre,
    causaRaiz: fila.causaRaiz,
    justificacion: fila.justificacion,
    input: fila.input,
    plazo: fila.plazo,
    recursos: fila.recursos,
    metas: fila.metas,
    responsable: fila.responsable,
    logroMeta: fila.logroMeta,
    impacto: fila.impacto,
    creadoEn: fila.creadoEn,
    version: fila.version,
    derivadoDeId: fila.derivadoDeId,
    evidencias: fila.evidencias.map(aEvidencia),
  };
}

/** Mismo filtro por aspecto que usa `codigosDe` — se reutiliza en `contarVinculados`. */
function filtroPorAspecto(aspecto: AspectoPlanMejora, elementoId: string) {
  return aspecto === 'CRITERIO_ACREDITACION'
    ? { criterioAcreditacionId: elementoId }
    : aspecto === 'OBJETIVO_EDUCACIONAL'
      ? { objetivoEducacionalId: elementoId }
      : { periodoId: elementoId };
}

@Injectable()
export class PlanMejoraRepositoryPrisma
  implements RepositorioPlanMejoraPort, ImpactoPlanMejoraPort
{
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: NuevoPlanMejora): Promise<DatosPlanMejora> {
    const fila = await this.prisma.planMejora.create({
      data: {
        codigo: datos.codigo,
        aspecto: datos.aspecto,
        carreraId: datos.carreraId,
        criterioAcreditacionId: datos.criterioAcreditacionId,
        objetivoEducacionalId: datos.objetivoEducacionalId,
        competenciaId: datos.competenciaId,
        periodoId: datos.periodoId,
        planEvaluacionId: datos.planEvaluacionId,
        // Los campos de definición nacen vacíos: RF-PJ-001/002/003 no los
        // captura, se completan luego con `editarDefinicion` (RF-PJ-009 a 013).
        nombre: '',
        causaRaiz: '',
        justificacion: '',
        input: null,
        plazo: new Date(0),
        recursos: '',
        metas: '',
        responsable: '',
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async porId(id: string): Promise<DatosPlanMejora | null> {
    const fila = await this.prisma.planMejora.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  async editarDefinicion(id: string, datos: DefinicionAccionMejora): Promise<DatosPlanMejora> {
    const fila = await this.prisma.planMejora.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        causaRaiz: datos.causaRaiz,
        justificacion: datos.justificacion,
        input: datos.input,
        plazo: datos.plazo,
        recursos: datos.recursos,
        metas: datos.metas,
        responsable: datos.responsable,
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.planMejora.delete({ where: { id } });
  }

  async cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanMejora> {
    const fila = await this.prisma.planMejora.update({
      where: { id },
      data: { estado: A_BD[estado] },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizarImplementacion(
    id: string,
    estado: EstadoImplementacion,
  ): Promise<DatosPlanMejora> {
    const fila = await this.prisma.planMejora.update({
      where: { id },
      data: { estadoImplementacion: IMPLEMENTACION_A_BD[estado] },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizarRetroalimentacion(
    id: string,
    logroMeta: string,
    impacto: string,
  ): Promise<DatosPlanMejora> {
    const fila = await this.prisma.planMejora.update({
      where: { id },
      data: { logroMeta, impacto },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async agregarEvidencia(id: string, evidencia: NuevaEvidencia): Promise<DatosEvidencia> {
    const fila = await this.prisma.evidenciaPlanMejora.create({
      data: {
        planMejoraId: id,
        referencia: evidencia.referencia,
        nombreArchivo: evidencia.nombreArchivo,
        subidoPor: evidencia.subidoPor,
      },
      select: SELECCION_EVIDENCIA,
    });
    return aEvidencia(fila);
  }

  async planDeEvidencia(evidenciaId: string): Promise<string | null> {
    const fila = await this.prisma.evidenciaPlanMejora.findUnique({
      where: { id: evidenciaId },
      select: { planMejoraId: true },
    });
    return fila?.planMejoraId ?? null;
  }

  async eliminarEvidencia(evidenciaId: string): Promise<void> {
    await this.prisma.evidenciaPlanMejora.delete({ where: { id: evidenciaId } });
  }

  async codigosDe(aspecto: AspectoPlanMejora, elementoId: string): Promise<readonly string[]> {
    const filas = await this.prisma.planMejora.findMany({
      where: { aspecto, ...filtroPorAspecto(aspecto, elementoId) },
      select: { codigo: true },
    });
    return filas.map((f) => f.codigo);
  }

  /**
   * RF-PJ-022/025: la fila única de umbrales. Si por alguna razón no existe
   * (una base sin la migración que la siembra), 1/1 es el valor por defecto
   * declarado en el esquema — no falla el resto de la aplicación por un dato
   * de configuración que además el propio RN dice que puede variar.
   */
  async parametros(): Promise<DatosParametroPlanMejora> {
    const fila = await this.prisma.parametroPlanMejora.findUnique({ where: { id: 1 } });
    return {
      minimoAccionesCriterio: fila?.minimoAccionesCriterio ?? 1,
      minimoAccionesObjetivo: fila?.minimoAccionesObjetivo ?? 1,
    };
  }

  async registrarImpactoEnMedicion(
    id: string,
    planMedicionAfectadoId: string | null,
  ): Promise<DatosPlanMejora> {
    const fila = await this.prisma.planMejora.update({
      where: { id },
      data: { planMedicionAfectadoId },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async listarDeCarrera(
    carreraId: string,
    filtro?: {
      texto?: string;
      aspecto?: AspectoPlanMejora;
      estadoImplementacion?: EstadoImplementacion;
      estado?: EstadoMedicion | readonly EstadoMedicion[];
      periodoId?: string;
    },
  ): Promise<DatosPlanMejora[]> {
    let estadoBd: { in: EstadoBd[] } | EstadoBd | undefined;
    const { estado: estadoFiltro } = filtro ?? {};
    if (estadoFiltro && Array.isArray(estadoFiltro)) {
      estadoBd = { in: estadoFiltro.map((e) => A_BD[e as EstadoMedicion]) };
    } else if (estadoFiltro) {
      estadoBd = A_BD[estadoFiltro as EstadoMedicion];
    } else {
      estadoBd = undefined;
    }

    const filas = await this.prisma.planMejora.findMany({
      where: {
        carreraId,
        ...(filtro?.aspecto ? { aspecto: filtro.aspecto } : {}),
        ...(filtro?.estadoImplementacion
          ? { estadoImplementacion: IMPLEMENTACION_A_BD[filtro.estadoImplementacion] }
          : {}),
        ...(estadoBd ? { estado: estadoBd } : {}),
        ...(filtro?.periodoId ? { periodoId: filtro.periodoId } : {}),
        ...(filtro?.texto
          ? {
              OR: [
                { codigo: { contains: filtro.texto, mode: 'insensitive' } },
                { nombre: { contains: filtro.texto, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: SELECCION,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aDatos);
  }

  /** 2c-AC-B: resuelve varios planes por id en una sola consulta. */
  async planesPorIds(ids: readonly string[]): Promise<DatosPlanMejora[]> {
    if (ids.length === 0) return [];
    const filas = await this.prisma.planMejora.findMany({
      where: { id: { in: [...ids] } },
      select: SELECCION,
    });
    return filas.map(aDatos);
  }

  /** `ImpactoPlanMejoraPort` (RF132, §2f del diseño de 2c-J-B). */
  async contarVinculados(aspecto: AspectoPlanMejora, elementoId: string): Promise<number> {
    return this.prisma.planMejora.count({
      where: { aspecto, ...filtroPorAspecto(aspecto, elementoId) },
    });
  }

  /** RF-PJ-035: la copia entera, en una transacción — media copia es peor que ninguna. */
  async copiar(datos: {
    codigo: string;
    version: number;
    derivadoDeId: string;
    contenido: CopiaPlanMejora;
  }): Promise<DatosPlanMejora> {
    const { contenido } = datos;

    const id = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.planMejora.create({
        data: {
          codigo: datos.codigo,
          version: datos.version,
          derivadoDeId: datos.derivadoDeId,
          aspecto: contenido.aspecto,
          carreraId: contenido.carreraId,
          criterioAcreditacionId: contenido.criterioAcreditacionId,
          objetivoEducacionalId: contenido.objetivoEducacionalId,
          competenciaId: contenido.competenciaId,
          periodoId: contenido.periodoId,
          planEvaluacionId: contenido.planEvaluacionId,
          planMedicionAfectadoId: contenido.planMedicionAfectadoId,
          nombre: contenido.nombre,
          causaRaiz: contenido.causaRaiz,
          justificacion: contenido.justificacion,
          input: contenido.input,
          plazo: contenido.plazo,
          recursos: contenido.recursos,
          metas: contenido.metas,
          responsable: contenido.responsable,
          estadoImplementacion: IMPLEMENTACION_A_BD[contenido.estadoImplementacion],
          logroMeta: contenido.logroMeta,
          impacto: contenido.impacto,
        },
      });

      if (contenido.evidencias.length > 0) {
        await tx.evidenciaPlanMejora.createMany({
          data: contenido.evidencias.map((e) => ({
            planMejoraId: creado.id,
            referencia: e.referencia,
            nombreArchivo: e.nombreArchivo,
            subidoPor: e.subidoPor,
            subidoEn: e.subidoEn,
          })),
        });
      }

      return creado.id;
    });

    return this.exigir(id);
  }

  /** RF-PJ-037: la cadena entera, se pida desde donde se pida. Mismo patrón que `linajeDe` de medición: en bucle, no CTE recursiva. */
  async linajeDe(id: string): Promise<DatosPlanMejora[]> {
    let raiz = await this.prisma.planMejora.findUnique({
      where: { id },
      select: { id: true, derivadoDeId: true },
    });
    if (!raiz) return [];

    const vistos = new Set<string>([raiz.id]);
    while (raiz?.derivadoDeId && !vistos.has(raiz.derivadoDeId)) {
      vistos.add(raiz.derivadoDeId);
      raiz = await this.prisma.planMejora.findUnique({
        where: { id: raiz.derivadoDeId },
        select: { id: true, derivadoDeId: true },
      });
    }
    if (!raiz) return [];

    const cadena: string[] = [];
    const pendientes = [raiz.id];
    while (pendientes.length > 0) {
      const actual = pendientes.shift()!;
      cadena.push(actual);
      const hijos = await this.prisma.planMejora.findMany({
        where: { derivadoDeId: actual },
        select: { id: true },
      });
      pendientes.push(...hijos.map((h) => h.id));
    }

    const planes = await Promise.all(cadena.map((c) => this.porId(c)));
    return planes
      .filter((p): p is DatosPlanMejora => p !== null)
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  }

  private async exigir(id: string): Promise<DatosPlanMejora> {
    const plan = await this.porId(id);
    if (!plan) throw new Error(`El plan de mejora ${id} desapareció durante la operación.`);
    return plan;
  }
}
