/**
 * Generación del plan de medición como archivo (RF-PM-027 a RF-PM-029).
 *
 * Una sola clase con dos métodos que corren en procesos distintos:
 *
 *   - `encolar` corre en la API. Comprueba el permiso, deja constancia del
 *     trabajo y encola. Devuelve enseguida: §3.4 pide que la generación no
 *     bloquee el request.
 *   - `ejecutar` corre en el worker. No comprueba permisos —ya se comprobaron
 *     al encolar— y **no lanza nunca**: guarda el fallo como estado, porque al
 *     otro lado no hay ninguna petición viva a la que devolvérselo.
 *
 * Están juntos y no en dos clases, a diferencia de Plan de Estudios, porque
 * aquí no hay precondiciones que comprobar antes de encolar más allá de que el
 * plan exista: separarlos daría dos clases de cinco líneas y un puerto más que
 * cablear.
 */

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
  RenderizadorHojaPort,
  RenderizadorPdfPort,
} from '../../../../platform/documentos/puertos.js';
import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  armarDocumentoMedicion,
  type FormatoDocumentoMedicion,
} from '../../domain/documentos/armar-documento-medicion.js';
import { DocumentoMedicionSolicitado } from '../../domain/events/eventos-medicion.js';
import type {
  RepositorioDatosDocumentoMedicionPort,
  RepositorioDocumentosMedicionPort,
  TipoDocumentoMedicion,
  TrabajoDocumentoMedicion,
} from '../ports/documentos-medicion.port.js';

/** Con qué se dibuja cada tipo y cómo acaba llamándose el archivo. */
const FORMATO: Readonly<
  Record<
    TipoDocumentoMedicion,
    {
      readonly formato: FormatoDocumentoMedicion;
      readonly extension: string;
      readonly tipoMime: string;
      readonly nombre: string;
    }
  >
> = {
  PLAN_MEDICION_PDF: {
    formato: 'pdf',
    extension: 'pdf',
    tipoMime: 'application/pdf',
    nombre: 'el plan de medición en PDF',
  },
  PLAN_MEDICION_EXCEL: {
    formato: 'excel',
    extension: 'xlsx',
    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nombre: 'el plan de medición en Excel',
  },
};

export interface Reloj {
  ahora(): Date;
}

export class GenerarDocumentoMedicion {
  constructor(
    private readonly documentos: RepositorioDocumentosMedicionPort,
    private readonly datos: RepositorioDatosDocumentoMedicionPort,
    private readonly cola: ColaDeDocumentosPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly pdf: RenderizadorPdfPort,
    private readonly hoja: RenderizadorHojaPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly reloj: Reloj = { ahora: () => new Date() },
  ) {}

  /** Corre en la API. Deja el trabajo pedido y vuelve. */
  async encolar(
    actor: Actor,
    planMedicionId: string,
    tipo: TipoDocumentoMedicion,
  ): Promise<TrabajoDocumentoMedicion> {
    // Exportar es leer: quien puede ver el plan en pantalla puede llevárselo.
    // Exigir un permiso de escritura dejaría sin evidencia justo al perfil
    // consultor, que es quien la pide para el expediente.
    const decision = await this.autorizacion.puede(actor.id, 'medicion.leer');
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    // Se comprueba antes de crear la fila: un trabajo de un plan inexistente
    // solo serviría para aparecer como Fallido en una pantalla que tampoco
    // existe.
    const base = await this.datos.datosDe(planMedicionId);
    if (base === null) throw new NoEncontrado('el plan de medición', planMedicionId);

    const trabajo = await this.documentos.crear({
      planMedicionId,
      tipo,
      solicitadoPor: actor.id,
    });

    // Se encola después de persistir el trabajo, no antes: si el worker lo
    // recogiera primero, buscaría en la base una fila que todavía no existe.
    await this.cola.encolar(trabajo.id, 'mejora-continua');

    await this.eventos.publicar([
      new DocumentoMedicionSolicitado(actor, planMedicionId, base.codigo, tipo),
    ]);
    return trabajo;
  }

  /**
   * Lo llama el worker. No lanza: cualquier fallo queda como estado `Fallido`.
   *
   * Un throw aquí acabaría en el log del worker y en ningún sitio más, y la
   * pantalla seguiría diciendo «Generando» indefinidamente. Quien pidió el
   * documento tiene derecho a saber que no va a llegar.
   */
  async ejecutar(trabajoId: string): Promise<void> {
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) return;

    // Reintento de un trabajo ya terminado: no se rehace. BullMQ puede
    // reentregar un job tras una caída del worker, y regenerar sobreescribiría
    // un archivo que quizá ya se descargó.
    if (trabajo.estado === 'Listo') return;

    const { formato, extension, tipoMime, nombre } = FORMATO[trabajo.tipo];

    try {
      await this.documentos.marcarGenerando(trabajoId);

      const base = await this.datos.datosDe(trabajo.planMedicionId);
      if (base === null) throw new Error('El plan de medición ya no existe.');

      const documento = armarDocumentoMedicion(
        { ...base, generadoEn: this.reloj.ahora() },
        formato,
      );

      const contenido =
        formato === 'pdf' ? await this.pdf.render(documento) : await this.hoja.render(documento);

      const ubicacion = await this.almacen.guardar(`${trabajoId}.${extension}`, contenido);

      await this.documentos.marcarListo(trabajoId, {
        nombreArchivo: `${documento.nombreArchivo}.${extension}`,
        tipoMime,
        bytes: contenido.byteLength,
        ubicacion,
      });
    } catch (error) {
      // El mensaje lo va a leer quien pidió el documento, no quien mantiene el
      // worker: la traza completa va al log, aquí queda algo accionable.
      const motivo = error instanceof Error ? error.message : 'Error desconocido.';
      await this.documentos.marcarFallido(trabajoId, `No se pudo generar ${nombre}: ${motivo}`);
    }
  }
}

/* ── Consulta y descarga ────────────────────────────────────────────────── */

export interface ArchivoDescargado {
  readonly nombreArchivo: string;
  readonly tipoMime: string;
  readonly contenido: Buffer;
}

/**
 * Corre en la API. Estado, listado y descarga.
 *
 * Separado del generador porque no comparte ni una dependencia con él salvo el
 * repositorio: no encola, no renderiza y no escribe en el almacén, solo lee.
 */
export class ConsultarDocumentoMedicion {
  constructor(
    private readonly documentos: RepositorioDocumentosMedicionPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumentoMedicion> {
    await this.exigirLectura(actor);
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) throw new NoEncontrado('el documento', trabajoId);
    return trabajo;
  }

  async listarDePlan(
    actor: Actor,
    planMedicionId: string,
    limite = 20,
  ): Promise<TrabajoDocumentoMedicion[]> {
    await this.exigirLectura(actor);
    return this.documentos.listarDePlan(planMedicionId, limite);
  }

  async descargar(actor: Actor, trabajoId: string): Promise<ArchivoDescargado> {
    const trabajo = await this.estado(actor, trabajoId);

    if (trabajo.estado !== 'Listo') {
      // Un archivo vacío parecería un documento roto. Decir por qué no hay
      // nada que descargar es lo único accionable.
      throw new ReglaDeNegocioViolada(
        trabajo.estado === 'Fallido'
          ? (trabajo.error ?? 'La generación del documento falló.')
          : `El documento todavía se está generando (${trabajo.estado}).`,
      );
    }

    const ubicacion = await this.documentos.ubicacionDe(trabajoId);
    if (ubicacion === null || trabajo.nombreArchivo === null || trabajo.tipoMime === null) {
      // El trabajo dice estar listo pero le falta el archivo. Es incoherencia
      // de datos, no un caso de uso: se nombra en vez de devolver 0 bytes.
      throw new NoEncontrado('el archivo del documento', trabajoId);
    }

    return {
      nombreArchivo: trabajo.nombreArchivo,
      tipoMime: trabajo.tipoMime,
      contenido: await this.almacen.leer(ubicacion),
    };
  }

  private async exigirLectura(actor: Actor): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, 'medicion.leer');
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
