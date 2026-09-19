/**
 * Implementación Prisma del `RepositorioActaAprobacionPort` (2c-AC-A).
 * Sigue el patrón de `plan-mejora.repository.ts`: `@Injectable`,
 * `PrismaService` por constructor, una `SELECCION` explícita, y
 * traductores `A_BD`/`A_DOMINIO` para el enum de estado.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type { EstadoActa } from '../../domain/value-objects/estado-acta.js';
import type {
  AccionActaDato,
  AsistenteActaDato,
  CabeceraActa,
  DatosActa,
  NuevaAccionActa,
  NuevaActa,
  RepositorioActaAprobacionPort,
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

const SELECCION_ASISTENTE = { id: true, nombre: true } as const;

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
      select: {
        id: true,
        planMejoraId: true,
        aspecto: true,
        incluida: true,
        porcentajeMedicionCompetencia: true,
        orden: true,
      },
      orderBy: [{ aspecto: 'asc' }, { orden: 'asc' }],
    });
    return filas.map((f) => ({
      id: f.id,
      planMejoraId: f.planMejoraId,
      aspecto: f.aspecto,
      incluida: f.incluida,
      porcentajeMedicionCompetencia: f.porcentajeMedicionCompetencia,
      orden: f.orden,
    }));
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
