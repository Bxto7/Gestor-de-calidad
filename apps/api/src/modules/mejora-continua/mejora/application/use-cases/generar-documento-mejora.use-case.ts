/**
 * Generación del plan de mejora como archivo (RF-PJ-032 a RF-PJ-034).
 *
 * Calca `generar-documento-medicion.use-case.ts`, con una diferencia de
 * permiso frente al gemelo de Evaluación: aquí exportar SÍ es lectura
 * (`mejora.leer`), como en Medición — no hay razón propia de este submódulo
 * para tratarlo como escritura.
 *
 * `mejora.leer` viaja siempre con `carreraId: null`, sin excepción, en todo
 * el submódulo — así lo hacen `GestionarPlanesMejora.porId`/`listar` pese a
 * resolver un plan concreto, y así lo hacen los dos gemelos para sus propios
 * permisos de lectura (`ConsultarDocumentoMedicion`/`ConsultarDocumentoEvaluacion.exigirLectura`,
 * este último con el comentario explícito "sin importar qué carrera dirija").
 * Acotar aquí por `plan.carreraId` sería la única lectura del submódulo que
 * lo hiciera, así que se sigue el patrón establecido en vez de inventar uno
 * nuevo.
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
 * A diferencia del gemelo de medición, aquí no hay un puerto de «datos del
 * documento» aparte: se lee directamente `RepositorioPlanMejoraPort`, el
 * mismo que ya usa `GestionarPlanesMejora` — `DatosPlanMejora` ya trae todo
 * lo que el documento necesita.
 */

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
  RenderizadorHojaPort,
  RenderizadorPdfPort,
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
import {
  armarDocumentoMejora,
  type FormatoDocumentoMejora,
} from '../../domain/documentos/armar-documento-mejora.js';
import { DocumentoMejoraSolicitado } from '../../domain/events/eventos-mejora.js';
import type {
  RepositorioDocumentosMejoraPort,
  TipoDocMejora,
  TrabajoDocumentoMejora,
} from '../ports/documentos-mejora.port.js';
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../ports/plan-mejora.port.js';

/** Con qué se dibuja cada tipo y cómo acaba llamándose el archivo. */
const FORMATO: Readonly<
  Record<
    TipoDocMejora,
    {
      readonly formato: FormatoDocumentoMejora;
      readonly extension: string;
      readonly tipoMime: string;
      readonly nombre: string;
    }
  >
> = {
  PLAN_MEJORA_PDF: {
    formato: 'pdf',
    extension: 'pdf',
    tipoMime: 'application/pdf',
    nombre: 'el plan de mejora en PDF',
  },
  PLAN_MEJORA_EXCEL: {
    formato: 'excel',
    extension: 'xlsx',
    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nombre: 'el plan de mejora en Excel',
  },
};

export interface Reloj {
  ahora(): Date;
}

export class GenerarDocumentoMejora {
  constructor(
    private readonly documentos: RepositorioDocumentosMejoraPort,
    private readonly planes: RepositorioPlanMejoraPort,
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
    planMejoraId: string,
    tipo: TipoDocMejora,
  ): Promise<TrabajoDocumentoMejora> {
    // Se comprueba antes de crear la fila: un trabajo de un plan inexistente
    // solo serviría para aparecer como Fallido en una pantalla que tampoco
    // existe.
    const plan = await this.exigirPlan(planMejoraId);
    await this.exigir(actor, 'mejora.leer', null);

    const trabajo = await this.documentos.crear({ planMejoraId, tipo, solicitadoPor: actor.id });

    // Se encola después de persistir el trabajo, no antes: si el worker lo
    // recogiera primero, buscaría en la base una fila que todavía no existe.
    await this.cola.encolar(trabajo.id, 'mejora-continua-mejora');

    await this.eventos.publicar([
      new DocumentoMejoraSolicitado(actor, planMejoraId, plan.codigo, tipo),
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

      const plan = await this.planes.porId(trabajo.planMejoraId);
      if (plan === null) throw new Error('El plan de mejora ya no existe.');

      const documento = armarDocumentoMejora(this.datosDelDocumento(plan), formato);

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

  /**
   * El "elemento asociado" se resuelve solo con lo que `DatosPlanMejora` ya
   * trae, no con una consulta cruzada a `plan-estudios` o `evaluacion`: el
   * documento cita el código que el plan mismo conoce por auditoría, no
   * re-resuelve el catálogo vivo (a diferencia de `armar-documento-mejora`
   * en pantalla, que sí lo hace vía React Query). Si el nombre resuelto
   * hiciera falta en el PDF, se añade aquí una dependencia a
   * `AcreditacionPort`/`ContenidoCurricularPort` — no antes.
   */
  private datosDelDocumento(plan: DatosPlanMejora) {
    return {
      codigo: plan.codigo,
      aspecto: plan.aspecto,
      elementoNombre: plan.codigo,
      estado: plan.estado,
      estadoImplementacion: plan.estadoImplementacion,
      nombre: plan.nombre,
      causaRaiz: plan.causaRaiz,
      justificacion: plan.justificacion,
      input: plan.input,
      plazo: plan.plazo,
      recursos: plan.recursos,
      metas: plan.metas,
      responsable: plan.responsable,
      evidencias: plan.evidencias.map((e) => ({
        referencia: e.referencia,
        subidoPor: e.subidoPor,
        subidoEn: e.subidoEn,
      })),
      logroMeta: plan.logroMeta,
      impacto: plan.impacto,
      generadoEn: this.reloj.ahora(),
    };
  }

  private async exigirPlan(id: string): Promise<DatosPlanMejora> {
    const plan = await this.planes.porId(id);
    if (plan === null) throw new NoEncontrado('el plan de mejora', id);
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

/* ── Consulta y descarga ────────────────────────────────────────────────── */

export interface ArchivoDescargadoMejora {
  readonly nombreArchivo: string;
  readonly tipoMime: string;
  readonly contenido: Buffer;
}

/**
 * Corre en la API. Estado, listado y descarga.
 *
 * Separado del generador porque no comparte ni una dependencia con él salvo
 * el repositorio de trabajos: no encola, no ensambla datos del documento ni
 * escribe en el almacén, solo lee.
 */
export class ConsultarDocumentoMejora {
  constructor(
    private readonly documentos: RepositorioDocumentosMejoraPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumentoMejora> {
    await this.exigirLectura(actor);
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) throw new NoEncontrado('el documento', trabajoId);
    return trabajo;
  }

  async listarDePlan(
    actor: Actor,
    planMejoraId: string,
    limite = 20,
  ): Promise<TrabajoDocumentoMejora[]> {
    await this.exigirLectura(actor);
    return this.documentos.listarDePlan(planMejoraId, limite);
  }

  async descargar(actor: Actor, trabajoId: string): Promise<ArchivoDescargadoMejora> {
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
    // No acotado por carrera: exportar es leer, y quien puede ver el plan en
    // pantalla puede llevárselo, sin importar qué carrera dirija — mismo
    // criterio que `ConsultarDocumentoEvaluacion.exigirLectura`.
    const decision = await this.autorizacion.puede(actor.id, 'mejora.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
