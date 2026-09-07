/**
 * Implementación Prisma del `RepositorioPlanEvaluacionPort`.
 *
 * Sigue el patrón de `plan-medicion.repository.ts`: los traductores `A_BD` y
 * `A_DOMINIO` entre el enum de la base y el vocabulario del dominio, y una
 * `SELECCION` explícita.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import { ReglaDeNegocioViolada } from '../../../../../shared-kernel/errors/errores.js';
import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import type { TipoMedicion } from '../../../medicion/domain/value-objects/tipo-medicion.js';
import type {
  DatosPlanEvaluacion,
  FiltroPlanesEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../../application/ports/plan-evaluacion.port.js';

type EstadoBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

/** El enum de la base va en mayúsculas; el del dominio, en lenguaje llano. */
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

const SELECCION = {
  id: true,
  planMedicionId: true,
  codigo: true,
  version: true,
  estado: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

interface Fila {
  id: string;
  planMedicionId: string;
  codigo: string;
  version: number;
  estado: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

function aDatos(fila: Fila): DatosPlanEvaluacion {
  return {
    id: fila.id,
    planMedicionId: fila.planMedicionId,
    codigo: fila.codigo,
    version: fila.version,
    estado: A_DOMINIO[fila.estado as EstadoBd] ?? 'Borrador',
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}

/**
 * Reconoce la violación de un índice único concreto.
 *
 * Se mira el nombre del índice y no solo el código de error: si mañana hay dos
 * índices únicos en la tabla, un `P2002` genérico daría el mensaje equivocado.
 *
 * El nombre no siempre viaja en el mismo sitio de `meta`: con el motor clásico
 * de Prisma llega en `meta.target`, pero con el adaptador `@prisma/adapter-pg`
 * (el que usa este proyecto) `target` llega vacío y el nombre solo aparece
 * dentro del mensaje original de `pg`, anidado en
 * `meta.driverAdapterError.cause.originalMessage`. Se miran los dos sitios para
 * no depender de cuál motor esté activo.
 */
function esViolacionDeUnico(error: unknown, indice: string): boolean {
  const e = error as {
    code?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: { cause?: { originalMessage?: unknown } };
    };
  };
  if (e?.code !== 'P2002') return false;
  const target = JSON.stringify(e.meta?.target ?? '');
  const original = e.meta?.driverAdapterError?.cause?.originalMessage;
  const mensajeOriginal = typeof original === 'string' ? original : '';
  return target.includes(indice) || mensajeOriginal.includes(indice);
}

@Injectable()
export class PlanEvaluacionRepositoryPrisma implements RepositorioPlanEvaluacionPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroPlanesEvaluacion = {}): Promise<DatosPlanEvaluacion[]> {
    const filas = await this.prisma.planEvaluacion.findMany({
      where: {
        ...(filtro.planMedicionId ? { planMedicionId: filtro.planMedicionId } : {}),
        ...(filtro.estado ? { estado: A_BD[filtro.estado] } : {}),
        ...(filtro.texto
          ? { codigo: { contains: filtro.texto, mode: 'insensitive' as const } }
          : {}),
        // El tipo vive en el plan de medición: se filtra atravesando la
        // relación en vez de copiarlo aquí.
        ...(filtro.tipo ? { plan: { tipo: filtro.tipo } } : {}),
      },
      orderBy: { creadoEn: 'desc' },
      select: SELECCION,
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosPlanEvaluacion | null> {
    const fila = await this.prisma.planEvaluacion.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  async vigenteDe(planMedicionId: string): Promise<DatosPlanEvaluacion | null> {
    const fila = await this.prisma.planEvaluacion.findFirst({
      where: { planMedicionId, estado: 'VIGENTE' },
      select: SELECCION,
    });
    return fila ? aDatos(fila) : null;
  }

  async codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]> {
    const filas = await this.prisma.planEvaluacion.findMany({
      where: { plan: { planEstudiosId, tipo } },
      select: { codigo: true },
    });
    return filas.map((f) => f.codigo);
  }

  async crear(datos: { planMedicionId: string; codigo: string }): Promise<DatosPlanEvaluacion> {
    const fila = await this.prisma.planEvaluacion.create({ data: datos, select: SELECCION });
    return aDatos(fila);
  }

  async cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanEvaluacion> {
    try {
      const fila = await this.prisma.planEvaluacion.update({
        where: { id },
        data: { estado: A_BD[estado] },
        select: SELECCION,
      });
      return aDatos(fila);
    } catch (error) {
      // El índice parcial rechaza el segundo Vigente con un P2002 cuyo mensaje
      // nombra el índice. Dejarlo salir tal cual daría un 500 con el nombre de
      // una estructura interna; traducirlo aquí es lo único que puede convertir
      // esa violación en algo que quien lo lea entienda.
      if (esViolacionDeUnico(error, 'evaluacion_una_vigente_por_medicion')) {
        throw new ReglaDeNegocioViolada(
          'Ese plan de medición ya tiene un plan de evaluación vigente. Archiva el actual antes de dar vigencia a otro.',
        );
      }
      throw error;
    }
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.planEvaluacion.delete({ where: { id } });
  }
}
