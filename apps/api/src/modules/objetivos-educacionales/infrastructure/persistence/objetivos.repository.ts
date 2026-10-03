/**
 * Repositorio Prisma de objetivos educacionales.
 *
 * Copiado de `ObjetivoRepositoryPrisma` en
 * `plan-estudios/infrastructure/persistence/catalogo.repository.ts` (Fase 0c)
 * — ahí compartía archivo con `CompetenciaRepositoryPrisma`; aquí vive solo,
 * con sus dos helpers privados (`dondeTexto`/`dondeEstado`) duplicados, no
 * importados, mismo criterio de duplicación que el resto de este plan.
 *
 * El recuento de vínculos (`planesVinculados`) se trae siempre, no solo
 * cuando alguien va a borrar. Es lo que permite a la UI avisar del impacto
 * antes de que el usuario pulse, y de paso lo que sostiene la validación de
 * RF038 sin una consulta extra en el momento crítico.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosObjetivo,
  FiltroObjetivo,
  RepositorioObjetivoPort,
} from '../../application/ports/objetivos.port.js';

/**
 * RF039 RN1: la búsqueda aplica sobre nombre y código.
 *
 * Igual que en asignaturas, `mode: 'insensitive'` ignora mayúsculas pero no
 * acentos: quien busque "etica" no encontrará "Ética". Está documentado con una
 * prueba; resolverlo exige `unaccent` en la base.
 */
function dondeTexto(texto: string) {
  return {
    OR: [
      { nombre: { contains: texto, mode: 'insensitive' as const } },
      { codigo: { contains: texto, mode: 'insensitive' as const } },
    ],
  };
}

function dondeEstado(activo: boolean | undefined) {
  return activo === undefined
    ? {}
    : { estado: activo ? ('ACTIVO' as const) : ('INACTIVO' as const) };
}

@Injectable()
export class ObjetivoRepositoryPrisma implements RepositorioObjetivoPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: FiltroObjetivo): Promise<DatosObjetivo[]> {
    const filas = await this.prisma.objetivoEducacional.findMany({
      where: {
        ...dondeEstado(filtro?.activo),
        ...(filtro?.texto ? dondeTexto(filtro.texto) : {}),
        ...(filtro?.planId ? { planes: { some: { planId: filtro.planId } } } : {}),
        ...(filtro?.carreraId ? { carreraId: filtro.carreraId } : {}),
      },
      // Por código: es correlativo, así que ordena por antigüedad de alta, que
      // es como se lee un catálogo numerado.
      orderBy: { codigo: 'asc' },
      include: { _count: { select: { planes: true } } },
    });
    return filas.map(aObjetivo);
  }

  async porId(id: string): Promise<DatosObjetivo | null> {
    const fila = await this.prisma.objetivoEducacional.findUnique({
      where: { id },
      include: { _count: { select: { planes: true } } },
    });
    return fila ? aObjetivo(fila) : null;
  }

  async codigos(): Promise<string[]> {
    const filas = await this.prisma.objetivoEducacional.findMany({ select: { codigo: true } });
    return filas.map((f) => f.codigo);
  }

  /**
   * RF-CH-015 RN1: la fila y su vínculo con el plan en una sola escritura
   * anidada, que Prisma ejecuta en una transacción.
   *
   * Excepción deliberada de aislamiento, como las de `catalogo.repository.ts`:
   * `plan_objetivo` vive en el esquema `plan_estudios`, pero el alta y su
   * vínculo tienen que ser atómicos, y una transacción no se puede partir entre
   * repositorios de dos módulos. Este repositorio solo escribe y borra esa fila
   * puente; nunca lee ni toca la tabla de planes.
   */
  async crearEnPlan(
    planId: string,
    carreraId: string,
    codigo: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    const fila = await this.prisma.objetivoEducacional.create({
      data: { codigo, nombre, descripcion, carreraId, planes: { create: { planId } } },
      include: { _count: { select: { planes: true } } },
    });
    return aObjetivo(fila);
  }

  async actualizar(id: string, nombre: string, descripcion: string): Promise<DatosObjetivo> {
    const fila = await this.prisma.objetivoEducacional.update({
      where: { id },
      data: { nombre, descripcion },
      include: { _count: { select: { planes: true } } },
    });
    return aObjetivo(fila);
  }

  async cambiarEstado(id: string, activo: boolean): Promise<DatosObjetivo> {
    const fila = await this.prisma.objetivoEducacional.update({
      where: { id },
      data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
      include: { _count: { select: { planes: true } } },
    });
    return aObjetivo(fila);
  }

  async eliminar(id: string): Promise<void> {
    // El caso de uso ya comprobó que no hay vínculos. Si aun así los hubiera,
    // el `onDelete: Restrict` de la relación lo impediría: la comprobación de
    // la aplicación da el mensaje, la de la base da la garantía.
    await this.prisma.objetivoEducacional.delete({ where: { id } });
  }

  async existeNombre(
    nombre: string,
    carreraId: string | null,
    idIgnorado?: string,
  ): Promise<boolean> {
    const fila = await this.prisma.objetivoEducacional.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        // `null` busca entre las filas sin carrera: Prisma lo traduce a IS NULL.
        carreraId,
        ...(idIgnorado ? { id: { not: idIgnorado } } : {}),
      },
      select: { id: true },
    });
    return fila !== null;
  }
}

function aObjetivo(fila: {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  estado: string;
  carreraId: string | null;
  creadoEn: Date;
  _count: { planes: number };
}): DatosObjetivo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    activo: fila.estado === 'ACTIVO',
    carreraId: fila.carreraId,
    planesVinculados: fila._count.planes,
    creadoEn: fila.creadoEn,
  };
}
