/**
 * Repositorios Prisma de los documentos del plan de medición.
 *
 * Dos piezas con responsabilidades distintas y por eso separadas:
 *
 * - `DocumentoMedicionRepositoryPrisma` lleva el ciclo de vida del trabajo
 *   —en cola, generando, listo, fallido— contra su propia tabla.
 * - `DatosDocumentoMedicionRepositoryPrisma` reúne lo que el documento dice.
 *   No consulta ni una tabla de Plan de Estudios: lo que necesita de allí lo
 *   pide por `ContenidoCurricularPort`, y el nombre de quien aprobó, por
 *   `DirectorioDeUsuariosPort` (§3.2).
 */

import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import {
  CONTENIDO_CURRICULAR,
  type ContenidoCurricularPort,
} from '../../../plan-estudios/application/ports/contenido-curricular.port.js';
import {
  DIRECTORIO_USUARIOS,
  type DirectorioDeUsuariosPort,
} from '../../../auth/application/ports/directorio-usuarios.port.js';
import type { DatosParaDocumentoMedicion } from '../../domain/documentos/armar-documento-medicion.js';
import { agruparPorAtributo, tituloDeGrupo } from '../../domain/services/agrupar-por-atributo.js';
import type {
  EstadoTrabajo,
  RepositorioDatosDocumentoMedicionPort,
  RepositorioDocumentosMedicionPort,
  TipoDocumentoMedicion,
  TrabajoDocumentoMedicion,
} from '../../application/ports/documentos-medicion.port.js';
import {
  REPOSITORIO_PLAN_MEDICION,
  type RepositorioPlanMedicionPort,
} from '../../application/ports/plan-medicion.port.js';

/** El enum de la base va en mayúsculas; el del dominio, en lenguaje llano. */
const A_DOMINIO: Readonly<Record<string, EstadoTrabajo>> = {
  EN_COLA: 'En cola',
  GENERANDO: 'Generando',
  LISTO: 'Listo',
  FALLIDO: 'Fallido',
};

@Injectable()
export class DocumentoMedicionRepositoryPrisma implements RepositorioDocumentosMedicionPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: {
    planMedicionId: string;
    tipo: TipoDocumentoMedicion;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoMedicion> {
    const fila = await this.prisma.documentoMedicion.create({
      data: {
        planMedicionId: datos.planMedicionId,
        tipo: datos.tipo,
        solicitadoPor: datos.solicitadoPor,
      },
    });
    return aTrabajo(fila);
  }

  async porId(id: string): Promise<TrabajoDocumentoMedicion | null> {
    const fila = await this.prisma.documentoMedicion.findUnique({ where: { id } });
    return fila ? aTrabajo(fila) : null;
  }

  async listarDePlan(planMedicionId: string, limite: number): Promise<TrabajoDocumentoMedicion[]> {
    const filas = await this.prisma.documentoMedicion.findMany({
      where: { planMedicionId },
      orderBy: { solicitadoEn: 'desc' },
      take: limite,
    });
    return filas.map(aTrabajo);
  }

  async marcarGenerando(id: string): Promise<void> {
    await this.prisma.documentoMedicion.update({
      where: { id },
      data: { estado: 'GENERANDO', error: null },
    });
  }

  async marcarListo(
    id: string,
    resultado: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void> {
    await this.prisma.documentoMedicion.update({
      where: { id },
      data: {
        estado: 'LISTO',
        nombreArchivo: resultado.nombreArchivo,
        tipoMime: resultado.tipoMime,
        bytes: resultado.bytes,
        ubicacion: resultado.ubicacion,
        error: null,
        terminadoEn: new Date(),
      },
    });
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    await this.prisma.documentoMedicion.update({
      where: { id },
      // El mensaje se recorta al ancho de la columna. Un error largo haría
      // fallar el UPDATE, y entonces el trabajo se quedaría en «Generando»
      // para siempre: el fallo al guardar el fallo es el peor de los dos.
      data: { estado: 'FALLIDO', error: error.slice(0, 2000), terminadoEn: new Date() },
    });
  }

  async ubicacionDe(id: string): Promise<string | null> {
    const fila = await this.prisma.documentoMedicion.findUnique({
      where: { id },
      select: { ubicacion: true },
    });
    return fila?.ubicacion ?? null;
  }
}

/**
 * El parámetro no declara `ubicacion`, así que no puede acabar en el resultado
 * aunque la fila que llega la traiga. La omisión es del tipo, no del cuidado de
 * quien escriba la próxima línea.
 */
function aTrabajo(fila: {
  id: string;
  planMedicionId: string;
  tipo: string;
  estado: string;
  nombreArchivo: string | null;
  tipoMime: string | null;
  bytes: number | null;
  error: string | null;
  solicitadoPor: string;
  solicitadoEn: Date;
  terminadoEn: Date | null;
}): TrabajoDocumentoMedicion {
  return {
    id: fila.id,
    planMedicionId: fila.planMedicionId,
    tipo: fila.tipo as TipoDocumentoMedicion,
    estado: A_DOMINIO[fila.estado] ?? 'En cola',
    nombreArchivo: fila.nombreArchivo,
    tipoMime: fila.tipoMime,
    bytes: fila.bytes,
    error: fila.error,
    solicitadoPor: fila.solicitadoPor,
    solicitadoEn: fila.solicitadoEn,
    terminadoEn: fila.terminadoEn,
  };
}

/* ── Lo que el documento dice ───────────────────────────────────────────── */

@Injectable()
export class DatosDocumentoMedicionRepositoryPrisma implements RepositorioDatosDocumentoMedicionPort {
  constructor(
    @Inject(REPOSITORIO_PLAN_MEDICION) private readonly planes: RepositorioPlanMedicionPort,
    @Inject(CONTENIDO_CURRICULAR) private readonly curricular: ContenidoCurricularPort,
    @Inject(DIRECTORIO_USUARIOS) private readonly directorio: DirectorioDeUsuariosPort,
  ) {}

  async datosDe(
    planMedicionId: string,
  ): Promise<Omit<DatosParaDocumentoMedicion, 'generadoEn'> | null> {
    const plan = await this.planes.porId(planMedicionId);
    if (plan === null) return null;

    const base = await this.curricular.planPorId(plan.planEstudiosId);
    const todas = await this.curricular.competenciasDelPlan(plan.planEstudiosId);
    const celdas = await this.planes.matriz(planMedicionId);

    // Solo las que este plan declaró medir, no todo el catálogo del plan base.
    const declaradas = new Set(plan.competenciaIds);
    const competencias = todas.filter((c) => declaradas.has(c.id));

    const grupos = agruparPorAtributo(competencias).map((g) => ({
      atributo: tituloDeGrupo(g),
      competencias: g.competencias.map((c) => ({ codigo: c.codigo, nombre: c.nombre })),
    }));

    const codigoDe = new Map(competencias.map((c) => [c.id, c.codigo]));
    const etiquetaDe = new Map(plan.periodos.map((p) => [p.id, p.etiqueta]));

    return {
      codigo: plan.codigo,
      tipo: plan.tipo,
      // La meta se guarda como fracción y se lee como porcentaje, igual que en
      // la pantalla: 0.7 es «70 %», no «0.7 %».
      metaPorcentaje: Math.round(plan.meta * 100),
      estado: plan.estado,
      planEstudiosCodigo: base?.codigo ?? '—',
      carreraNombre: base?.carreraNombre ?? '—',
      aprobadoPor: await this.nombreDelAprobador(plan.aprobadoPorId),
      aprobadoEn: plan.aprobadoEn,
      grupos,
      periodos: plan.periodos.map((p) => ({ etiqueta: p.etiqueta, fechaCierre: p.fechaCierre })),
      celdas: celdas.flatMap((c) => {
        const competenciaCodigo = codigoDe.get(c.competenciaId);
        const periodoEtiqueta = etiquetaDe.get(c.periodoId);
        // Una celda de una competencia que ya no está declarada no se dibuja:
        // no tiene fila donde ir.
        if (competenciaCodigo === undefined || periodoEtiqueta === undefined) return [];
        return [{ competenciaCodigo, periodoEtiqueta, realizada: c.realizada }];
      }),
    };
  }

  /**
   * El nombre, no el identificador.
   *
   * Si la cuenta ya no existe se devuelve `null` y el documento omite la línea
   * de aprobación entera, en vez de escribir un UUID que no le dice nada a
   * quien revisa el expediente.
   */
  private async nombreDelAprobador(id: string | null): Promise<string | null> {
    if (id === null) return null;
    return (await this.directorio.nombresDe([id])).get(id) ?? null;
  }
}
