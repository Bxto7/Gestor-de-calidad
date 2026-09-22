/**
 * Generación del acta de aprobación como archivo (RF-AC-018, RF-AC-019).
 * Calca `generar-documento-mejora.use-case.ts`: una sola clase con
 * `encolar` (API, comprueba permiso) y `ejecutar` (worker, nunca lanza).
 *
 * `ejecutar` no pasa por `GestionarActas.obtenerContenido` — ese método
 * exige un `Actor` y ya comprobó `actas.leer` en `encolar`. `armarContenido`
 * repite, deliberadamente, una versión más chica de la ramificación en
 * vivo/snapshot de `GestionarActas` (Task 4) — es la misma separación entre
 * caso de uso con permisos y generador de worker que ya existe en Mejora.
 *
 * RF-AC-018/019 (efecto interno): la primera exportación exitosa de un acta
 * en Aprobada la pasa a Emitida — ver `intentarMarcarEmitida`.
 */

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
} from '../../../../../platform/documentos/puertos.js';
import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import {
  armarActaParaDocumento,
  type AccionParaDocumento,
} from '../../domain/documentos/armar-acta-para-documento.js';
import { ActaTransicionada, DocumentoActaSolicitado } from '../../domain/events/eventos-actas.js';
import { intentarMarcarEmitida } from '../../domain/value-objects/transiciones-acta.js';
import type {
  AccionActaDato,
  DatosActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
import type {
  RenderizadorExcelActaPort,
  RenderizadorPdfActaPort,
  RepositorioDocumentosActaPort,
  TipoDocActa,
  TrabajoDocumentoActa,
} from '../ports/documentos-acta.port.js';

const FORMATO: Readonly<Record<TipoDocActa, { extension: string; tipoMime: string; nombre: string }>> = {
  ACTA_PDF: { extension: 'pdf', tipoMime: 'application/pdf', nombre: 'el acta en PDF' },
  ACTA_EXCEL: {
    extension: 'xlsx',
    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nombre: 'el acta en Excel',
  },
};

export interface Reloj {
  ahora(): Date;
}

export class GenerarDocumentoActa {
  constructor(
    private readonly documentos: RepositorioDocumentosActaPort,
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly cola: ColaDeDocumentosPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly pdf: RenderizadorPdfActaPort,
    private readonly excel: RenderizadorExcelActaPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly reloj: Reloj = { ahora: () => new Date() },
  ) {}

  async encolar(actor: Actor, actaId: string, tipo: TipoDocActa): Promise<TrabajoDocumentoActa> {
    const acta = await this.exigirActa(actaId);
    await this.exigir(actor, 'actas.leer', null);

    // I-2: la primera exportación exitosa de un acta Aprobada la pasa a
    // Emitida (ver `ejecutar`) — un efecto permanente e irreversible, así que
    // exigimos el mismo permiso que aprobarla, no solo leerla.
    //
    // Carrera residual conocida y aceptada: si el acta pasa a Aprobada
    // *después* de este chequeo pero *antes* de que el worker procese el
    // job, ese job puede emitirla sin haber pasado esta puerta. Ventana de
    // segundos, requiere coincidencia exacta; cerrarla del todo exigiría
    // llevar la decisión de permiso en el payload de la cola, desproporcionado
    // frente al riesgo real.
    if (acta.estado === 'Aprobada') {
      await this.exigir(actor, 'actas.aprobar', acta.carreraId);
    }

    const trabajo = await this.documentos.crear({ actaId, tipo, solicitadoPor: actor.id });
    await this.cola.encolar(trabajo.id, 'mejora-continua-actas');

    await this.eventos.publicar([new DocumentoActaSolicitado(actor, actaId, acta.codigo, tipo)]);
    return trabajo;
  }

  async ejecutar(trabajoId: string): Promise<void> {
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) return;
    if (trabajo.estado === 'Listo') return;

    const { extension, tipoMime, nombre } = FORMATO[trabajo.tipo];
    let acta: DatosActa | null = null;

    try {
      await this.documentos.marcarGenerando(trabajoId);

      acta = await this.actas.porId(trabajo.actaId);
      if (acta === null) throw new Error('El acta ya no existe.');

      const acciones = await this.armarContenido(acta);
      const documento = armarActaParaDocumento({
        acta: {
          id: acta.id,
          correlativo: acta.correlativo,
          codigo: acta.codigo,
          titulo: acta.titulo,
          objetivo: acta.objetivo,
          periodoAcademico: acta.periodoAcademico,
          convocadaPor: acta.convocadaPor,
          fechaReunion: acta.fechaReunion,
          lugarReunion: acta.lugarReunion,
          lugarEmision: acta.lugarEmision,
          fechaEmision: acta.fechaEmision,
          aprobadoEn: acta.aprobadoEn,
          textoIntroduccion: acta.textoIntroduccion,
          textoAcuerdoCierre: acta.textoAcuerdoCierre,
          asistentes: acta.asistentes,
        },
        acciones,
        generadoEn: this.reloj.ahora(),
      });

      const bytes =
        trabajo.tipo === 'ACTA_PDF' ? await this.pdf.render(documento) : await this.excel.render(documento);
      const ubicacion = await this.almacen.guardar(`${trabajoId}.${extension}`, bytes);

      await this.documentos.marcarListo(trabajoId, {
        nombreArchivo: `${nombreDeArchivoSeguro(acta.codigo)}.${extension}`,
        tipoMime,
        bytes: bytes.byteLength,
        ubicacion,
      });
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Error desconocido.';
      await this.documentos.marcarFallido(trabajoId, `No se pudo generar ${nombre}: ${motivo}`);
      return;
    }

    if (acta === null) return; // inalcanzable en la práctica: si lo fuera, el try ya habría lanzado.

    // M-4: fuera del try principal a propósito. El trabajo ya quedó Listo, con
    // su archivo real en disco — un fallo de aquí en adelante no debe
    // sobrescribirlo como Fallido (el archivo quedaría huérfano e
    // indescargable, y `ejecutar` nunca relanza, así que BullMQ no reintenta).
    if (acta.estado === 'Aprobada') {
      try {
        const r = intentarMarcarEmitida(acta.estado);
        if (r.ok) {
          await this.actas.cambiarEstado(acta.id, r.nuevoEstado);
          await this.eventos.publicar([
            new ActaTransicionada(
              { id: trabajo.solicitadoPor, nombre: 'Emisión automática al exportar' },
              acta.id,
              acta.codigo,
              'Aprobada',
              'Emitida',
            ),
          ]);
        }
      } catch {
        // El documento ya está Listo; un fallo aquí no debe volver a marcar el
        // trabajo como Fallido. El acta simplemente no transiciona esta vez.
      }
    }
  }

  /**
   * Misma ramificación que `GestionarActas.obtenerContenido` (Task 4): en
   * vivo mientras el acta es editable, desde el snapshot en adelante. Sin
   * `Actor` — el permiso ya se comprobó en `encolar`.
   */
  private async armarContenido(acta: DatosActa): Promise<readonly AccionParaDocumento[]> {
    const vinculos = await this.actas.accionesDe(acta.id);

    if (acta.estado === 'Borrador' || acta.estado === 'En revisión') {
      const planes = await this.planes.planesPorIds(vinculos.map((v) => v.planMejoraId));
      const planesPorId = new Map(planes.map((p) => [p.id, p]));
      return vinculos.flatMap((v): AccionParaDocumento[] => {
        const plan = planesPorId.get(v.planMejoraId);
        if (!plan) return [];
        return [
          {
            id: v.id,
            incluida: v.incluida,
            orden: v.orden,
            porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
            metaCompetenciaSnapshot: null,
            plan: {
              id: plan.id,
              codigo: plan.codigo,
              aspecto: plan.aspecto,
              nombre: plan.nombre,
              plazo: plan.plazo,
              recursos: plan.recursos,
              metas: plan.metas,
              responsable: plan.responsable,
            },
          },
        ];
      });
    }

    return vinculos.flatMap((v): AccionParaDocumento[] => this.filaDesdeSnapshot(v));
  }

  private filaDesdeSnapshot(v: AccionActaDato): AccionParaDocumento[] {
    if (
      v.codigoSnapshot === null ||
      v.nombreSnapshot === null ||
      v.plazoSnapshot === null ||
      v.recursosSnapshot === null ||
      v.metasSnapshot === null ||
      v.responsableSnapshot === null
    ) {
      return [];
    }
    return [
      {
        id: v.id,
        incluida: v.incluida,
        orden: v.orden,
        porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
        metaCompetenciaSnapshot: v.metaCompetenciaSnapshot,
        plan: {
          id: v.planMejoraId,
          codigo: v.codigoSnapshot,
          aspecto: v.aspecto,
          nombre: v.nombreSnapshot,
          plazo: v.plazoSnapshot,
          recursos: v.recursosSnapshot,
          metas: v.metasSnapshot,
          responsable: v.responsableSnapshot,
        },
      },
    ];
  }

  private async exigirActa(id: string): Promise<DatosActa> {
    const acta = await this.actas.porId(id);
    if (acta === null) throw new NoEncontrado('el acta de aprobación', id);
    return acta;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

function nombreDeArchivoSeguro(codigo: string): string {
  return codigo.replace(/[^\w.-]/g, '_');
}

/* ── Consulta y descarga ────────────────────────────────────────────────── */

export interface ArchivoDescargadoActa {
  readonly nombreArchivo: string;
  readonly tipoMime: string;
  readonly contenido: Buffer;
}

export class ConsultarDocumentoActa {
  constructor(
    private readonly documentos: RepositorioDocumentosActaPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumentoActa> {
    await this.exigirLectura(actor);
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) throw new NoEncontrado('el documento', trabajoId);
    return trabajo;
  }

  async listarDeActa(actor: Actor, actaId: string, limite = 20): Promise<TrabajoDocumentoActa[]> {
    await this.exigirLectura(actor);
    return this.documentos.listarDeActa(actaId, limite);
  }

  async descargar(actor: Actor, trabajoId: string): Promise<ArchivoDescargadoActa> {
    const trabajo = await this.estado(actor, trabajoId);

    if (trabajo.estado !== 'Listo') {
      throw new ReglaDeNegocioViolada(
        trabajo.estado === 'Fallido'
          ? (trabajo.error ?? 'La generación del documento falló.')
          : `El documento todavía se está generando (${trabajo.estado}).`,
      );
    }

    const ubicacion = await this.documentos.ubicacionDe(trabajoId);
    if (ubicacion === null || trabajo.nombreArchivo === null || trabajo.tipoMime === null) {
      throw new NoEncontrado('el archivo del documento', trabajoId);
    }

    return {
      nombreArchivo: trabajo.nombreArchivo,
      tipoMime: trabajo.tipoMime,
      contenido: await this.almacen.leer(ubicacion),
    };
  }

  private async exigirLectura(actor: Actor): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, 'actas.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
