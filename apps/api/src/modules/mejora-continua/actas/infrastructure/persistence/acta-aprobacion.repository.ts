/**
 * Implementación Prisma del `RepositorioActaAprobacionPort` (2c-AC-A).
 * Sigue el patrón de `plan-mejora.repository.ts`: `@Injectable`,
 * `PrismaService` por constructor, una `SELECCION` explícita, y
 * traductores `A_BD`/`A_DOMINIO` para el enum de estado.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type { EstadoActa } from '../../domain/value-objects/estado-acta.js';
import type { AspectoPlanMejora } from '../../../mejora/application/ports/plan-mejora.port.js';
import type {
  AccionActaDato,
  ActaResumen,
  AsistenteActaDato,
  CabeceraActa,
  DatosActa,
  FiltroActas,
  NuevaAccionActa,
  NuevaActa,
  RepositorioActaAprobacionPort,
  SnapshotAccionActa,
} from '../../application/ports/acta-aprobacion.port.js';

type EstadoActaBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADA' | 'EMITIDA' | 'HISTORICA';

const A_BD: Readonly<Record<EstadoActa, EstadoActaBd>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobada: 'APROBADA',
  Emitida: 'EMITIDA',
  Histórica: 'HISTORICA',
};

const A_DOMINIO = Object.fromEntries(Object.entries(A_BD).map(([k, v]) => [v, k])) as Record<
  EstadoActaBd,
  EstadoActa
>;

/** RF-AC-020: solo lo que el listado muestra — nada de asistentes ni acciones. */
const SELECCION_RESUMEN = {
  id: true,
  codigo: true,
  correlativo: true,
  titulo: true,
  periodoAcademico: true,
  estado: true,
  carreraId: true,
  creadoEn: true,
} as const;

interface FilaResumen {
  id: string;
  codigo: string;
  correlativo: number;
  titulo: string;
  periodoAcademico: string;
  estado: string;
  carreraId: string;
  creadoEn: Date;
}

function aResumen(fila: FilaResumen): ActaResumen {
  return {
    id: fila.id,
    codigo: fila.codigo,
    correlativo: fila.correlativo,
    titulo: fila.titulo,
    periodoAcademico: fila.periodoAcademico,
    estado: A_DOMINIO[fila.estado as EstadoActaBd] ?? 'Borrador',
    carreraId: fila.carreraId,
    creadoEn: fila.creadoEn,
  };
}

const SELECCION_ASISTENTE = { id: true, nombre: true } as const;

/** 2c-AC-B / RNF24: incluye las columnas `*Snapshot` congeladas al aprobar. */
const SELECCION_ACCION = {
  id: true,
  planMejoraId: true,
  aspecto: true,
  incluida: true,
  porcentajeMedicionCompetencia: true,
  orden: true,
  codigoSnapshot: true,
  nombreSnapshot: true,
  plazoSnapshot: true,
  recursosSnapshot: true,
  metasSnapshot: true,
  responsableSnapshot: true,
  metaCompetenciaSnapshot: true,
} as const;

interface FilaAccion {
  id: string;
  planMejoraId: string;
  aspecto: AspectoPlanMejora;
  incluida: boolean;
  porcentajeMedicionCompetencia: number | null;
  orden: number;
  codigoSnapshot: string | null;
  nombreSnapshot: string | null;
  plazoSnapshot: Date | null;
  recursosSnapshot: string | null;
  metasSnapshot: string | null;
  responsableSnapshot: string | null;
  metaCompetenciaSnapshot: number | null;
}

function aAccion(fila: FilaAccion): AccionActaDato {
  return {
    id: fila.id,
    planMejoraId: fila.planMejoraId,
    aspecto: fila.aspecto,
    incluida: fila.incluida,
    porcentajeMedicionCompetencia: fila.porcentajeMedicionCompetencia,
    orden: fila.orden,
    codigoSnapshot: fila.codigoSnapshot,
    nombreSnapshot: fila.nombreSnapshot,
    plazoSnapshot: fila.plazoSnapshot,
    recursosSnapshot: fila.recursosSnapshot,
    metasSnapshot: fila.metasSnapshot,
    responsableSnapshot: fila.responsableSnapshot,
    metaCompetenciaSnapshot: fila.metaCompetenciaSnapshot,
  };
}

const SELECCION = {
  id: true,
  carreraId: true,
  correlativo: true,
  codigo: true,
  periodoAcademico: true,
  periodoMedicionId: true,
  titulo: true,
  objetivo: true,
  textoIntroduccion: true,
  textoAcuerdoCierre: true,
  convocadaPor: true,
  fechaReunion: true,
  lugarReunion: true,
  comentario: true,
  lugarEmision: true,
  fechaEmision: true,
  aprobadoPorId: true,
  aprobadoEn: true,
  estado: true,
  creadoEn: true,
  asistentes: { select: SELECCION_ASISTENTE, orderBy: { orden: 'asc' as const } },
} as const;

interface FilaAsistente {
  id: string;
  nombre: string;
}

interface Fila {
  id: string;
  carreraId: string;
  correlativo: number;
  codigo: string;
  periodoAcademico: string;
  periodoMedicionId: string | null;
  titulo: string;
  objetivo: string;
  textoIntroduccion: string;
  textoAcuerdoCierre: string;
  convocadaPor: string;
  fechaReunion: Date;
  lugarReunion: string;
  comentario: string | null;
  lugarEmision: string | null;
  fechaEmision: Date | null;
  aprobadoPorId: string | null;
  aprobadoEn: Date | null;
  estado: string;
  creadoEn: Date;
  asistentes: FilaAsistente[];
}

function aAsistente(fila: FilaAsistente): AsistenteActaDato {
  return { id: fila.id, nombre: fila.nombre };
}

function aDatos(fila: Fila): DatosActa {
  return {
    id: fila.id,
    carreraId: fila.carreraId,
    correlativo: fila.correlativo,
    codigo: fila.codigo,
    periodoAcademico: fila.periodoAcademico,
    periodoMedicionId: fila.periodoMedicionId,
    titulo: fila.titulo,
    objetivo: fila.objetivo,
    textoIntroduccion: fila.textoIntroduccion,
    textoAcuerdoCierre: fila.textoAcuerdoCierre,
    convocadaPor: fila.convocadaPor,
    fechaReunion: fila.fechaReunion,
    lugarReunion: fila.lugarReunion,
    comentario: fila.comentario,
    lugarEmision: fila.lugarEmision,
    fechaEmision: fila.fechaEmision,
    aprobadoPorId: fila.aprobadoPorId,
    aprobadoEn: fila.aprobadoEn,
    estado: A_DOMINIO[fila.estado as EstadoActaBd] ?? 'Borrador',
    creadoEn: fila.creadoEn,
    asistentes: fila.asistentes.map(aAsistente),
  };
}

@Injectable()
export class ActaAprobacionRepositoryPrisma implements RepositorioActaAprobacionPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: NuevaActa): Promise<DatosActa> {
    const fila = await this.prisma.actaAprobacion.create({
      data: {
        carreraId: datos.carreraId,
        correlativo: datos.correlativo,
        codigo: datos.codigo,
        periodoAcademico: datos.periodoAcademico,
        periodoMedicionId: datos.periodoMedicionId,
        titulo: datos.titulo,
        objetivo: datos.objetivo,
        textoIntroduccion: datos.textoIntroduccion,
        textoAcuerdoCierre: datos.textoAcuerdoCierre,
        // RF-AC-004: la cabecera nace vacía, se completa con `editarCabecera`.
        convocadaPor: '',
        fechaReunion: new Date(0),
        lugarReunion: '',
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async porId(id: string): Promise<DatosActa | null> {
    const fila = await this.prisma.actaAprobacion.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  /** RF-AC-020: periodoAcademico y estado son exactos; texto busca en código y título. */
  async listar(filtro?: FiltroActas): Promise<readonly ActaResumen[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.actaAprobacion.findMany({
      where: {
        ...(filtro?.periodoAcademico ? { periodoAcademico: filtro.periodoAcademico } : {}),
        ...(filtro?.estado ? { estado: A_BD[filtro.estado] } : {}),
        ...(texto
          ? {
              OR: [
                { codigo: { contains: texto, mode: 'insensitive' as const } },
                { titulo: { contains: texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: SELECCION_RESUMEN,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aResumen);
  }

  async editarCabecera(id: string, datos: CabeceraActa): Promise<DatosActa> {
    const fila = await this.prisma.actaAprobacion.update({
      where: { id },
      data: {
        titulo: datos.titulo,
        objetivo: datos.objetivo,
        convocadaPor: datos.convocadaPor,
        fechaReunion: datos.fechaReunion,
        lugarReunion: datos.lugarReunion,
        comentario: datos.comentario,
        lugarEmision: datos.lugarEmision,
        fechaEmision: datos.fechaEmision,
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async reemplazarAsistentes(id: string, nombres: readonly string[]): Promise<DatosActa> {
    await this.prisma.$transaction([
      this.prisma.asistenteActa.deleteMany({ where: { actaId: id } }),
      this.prisma.asistenteActa.createMany({
        data: nombres.map((nombre, orden) => ({ actaId: id, nombre, orden })),
      }),
    ]);
    return this.exigir(id);
  }

  /** RF-AC-013. `opciones.snapshots` solo llega al aprobar (Task 4). */
  async cambiarEstado(
    id: string,
    estado: EstadoActa,
    opciones?: {
      readonly aprobacion?: { readonly actorId: string; readonly fecha: Date };
      readonly snapshots?: readonly SnapshotAccionActa[];
    },
  ): Promise<DatosActa> {
    await this.prisma.$transaction([
      this.prisma.actaAprobacion.update({
        where: { id },
        data: {
          estado: A_BD[estado],
          // RF-AC-014 RN2: solo se escriben cuando llegan — una transición
          // posterior (rechazar, por ejemplo) no debe borrar quién aprobó ni cuándo.
          ...(opciones?.aprobacion
            ? { aprobadoPorId: opciones.aprobacion.actorId, aprobadoEn: opciones.aprobacion.fecha }
            : {}),
        },
      }),
      // RNF24: cada snapshot se escribe en la fila de `AccionActa` que le
      // corresponde. `updateMany` con un `where` de un solo id, no `update`,
      // porque `$transaction` con un arreglo de promesas no puede mezclar el
      // resultado tipado de `update` con el de `updateMany` en el mismo
      // arreglo sin perder el tipo de la primera — y aquí no se necesita el
      // resultado de ninguna de las dos, solo que las dos ejecuten.
      ...(opciones?.snapshots ?? []).map((s) =>
        this.prisma.accionActa.updateMany({
          where: { id: s.accionActaId },
          data: {
            codigoSnapshot: s.codigo,
            nombreSnapshot: s.nombre,
            plazoSnapshot: s.plazo,
            recursosSnapshot: s.recursos,
            metasSnapshot: s.metas,
            responsableSnapshot: s.responsable,
            metaCompetenciaSnapshot: s.metaCompetenciaSnapshot,
          },
        }),
      ),
    ]);
    return this.exigir(id);
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.actaAprobacion.delete({ where: { id } });
  }

  async correlativosDe(carreraId: string): Promise<readonly number[]> {
    const filas = await this.prisma.actaAprobacion.findMany({
      where: { carreraId },
      select: { correlativo: true },
    });
    return filas.map((f) => f.correlativo);
  }

  private async exigir(id: string): Promise<DatosActa> {
    const a = await this.porId(id);
    if (!a) throw new Error(`El acta ${id} desapareció durante la operación.`);
    return a;
  }

  async accionesDe(actaId: string): Promise<AccionActaDato[]> {
    const filas = await this.prisma.accionActa.findMany({
      where: { actaId },
      select: SELECCION_ACCION,
      orderBy: [{ aspecto: 'asc' }, { orden: 'asc' }],
    });
    return filas.map(aAccion);
  }

  async agregarAcciones(actaId: string, nuevas: readonly NuevaAccionActa[]): Promise<void> {
    if (nuevas.length === 0) return;
    // `skipDuplicates`: la carga es idempotente (RF-AC-007) — el
    // `@@unique([actaId, planMejoraId])` hace que una candidata ya vinculada
    // no se reinserte ni resetee su `incluida`.
    await this.prisma.accionActa.createMany({
      data: nuevas.map((n) => ({
        actaId,
        planMejoraId: n.planMejoraId,
        aspecto: n.aspecto,
        porcentajeMedicionCompetencia: n.porcentajeMedicionCompetencia,
        orden: n.orden,
      })),
      skipDuplicates: true,
    });
  }

  async actualizarSeleccion(
    actaId: string,
    cambios: readonly { planMejoraId: string; incluida: boolean }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      cambios.map((c) =>
        this.prisma.accionActa.updateMany({
          where: { actaId, planMejoraId: c.planMejoraId },
          data: { incluida: c.incluida },
        }),
      ),
    );
  }

  async editarTextos(
    id: string,
    datos: { textoIntroduccion: string; textoAcuerdoCierre: string },
  ): Promise<DatosActa> {
    const fila = await this.prisma.actaAprobacion.update({
      where: { id },
      data: { textoIntroduccion: datos.textoIntroduccion, textoAcuerdoCierre: datos.textoAcuerdoCierre },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async planesYaEmitidos(planMejoraIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (planMejoraIds.length === 0) return new Set();
    const filas = await this.prisma.accionActa.findMany({
      where: {
        planMejoraId: { in: [...planMejoraIds] },
        incluida: true,
        acta: { estado: 'EMITIDA' },
      },
      select: { planMejoraId: true },
    });
    return new Set(filas.map((f) => f.planMejoraId));
  }
}
