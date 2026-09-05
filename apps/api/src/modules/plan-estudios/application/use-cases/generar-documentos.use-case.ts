/**
 * Casos de uso de generación de documentos (RF072, RF073, RF084, RF092).
 *
 * Son tres piezas y no una porque el trabajo cruza dos procesos:
 *
 *   - `SolicitarDocumento` corre en la API. Comprueba permisos y precondiciones,
 *     deja constancia y encola. Devuelve enseguida: §3.4 pide que la generación
 *     no bloquee el request, y un PDF de un plan de 74 asignaturas no cabe en el
 *     presupuesto de latencia de una petición HTTP.
 *   - `GenerarDocumento` corre en el worker. No comprueba permisos —ya se
 *     comprobaron al solicitar— y no lanza excepciones hacia arriba: guarda el
 *     fallo como estado, porque al otro lado no hay ninguna petición viva a la
 *     que devolvérselo.
 *   - `ConsultarDocumento` corre en la API. Estado y descarga.
 */

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
  armarEvidenciaDeAprobacion,
  armarHistoricoDeCambios,
  armarMallaParaHojaDeCalculo,
  armarResumenDelPlan,
  type DatosParaDocumento,
} from '../../domain/documentos/armar-documentos.js';
import type { Documento } from '../../../../platform/documentos/documento.js';
import { DocumentoSolicitado, NOMBRE_DOCUMENTO } from '../../domain/events/eventos-documento.js';
import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
  RenderizadorHojaPort,
  RenderizadorPdfPort,
  RepositorioDatosDocumentoPort,
  RepositorioDocumentosPort,
  TipoDocumento,
  TrabajoDocumento,
} from '../ports/documentos.port.js';
import type {
  RepositorioAprobacionesPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';

/** Con qué se dibuja cada tipo y cómo se llama el archivo resultante. */
const FORMATO: Readonly<
  Record<TipoDocumento, { readonly formato: 'pdf' | 'xlsx'; readonly tipoMime: string }>
> = {
  RESUMEN_PLAN: { formato: 'pdf', tipoMime: 'application/pdf' },
  EVIDENCIA_APROBACION: { formato: 'pdf', tipoMime: 'application/pdf' },
  // RF084 admite «PDF o Excel». Solo está implementado el PDF; si hiciera falta
  // el Excel, es un tipo nuevo aquí y un renderizador que ya existe.
  HISTORICO_CAMBIOS: { formato: 'pdf', tipoMime: 'application/pdf' },
  MALLA_EXCEL: {
    formato: 'xlsx',
    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

/** Estados desde los que un plan ya recorrió la aprobación. */
const YA_APROBADO = ['Aprobado', 'Vigente', 'Histórico'];

export interface Reloj {
  ahora(): Date;
}

export class SolicitarDocumento {
  constructor(
    private readonly planes: RepositorioPlanPort,
    private readonly aprobaciones: RepositorioAprobacionesPort,
    private readonly documentos: RepositorioDocumentosPort,
    private readonly cola: ColaDeDocumentosPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  async ejecutar(actor: Actor, planId: string, tipo: TipoDocumento): Promise<TrabajoDocumento> {
    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);

    const decision = await this.autorizacion.puede(actor.id, 'reporte.generar', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    await this.comprobarPrecondiciones(plan.estado, planId, tipo);

    const trabajo = await this.documentos.crear({ planId, tipo, solicitadoPor: actor.id });

    // Se encola después de persistir el trabajo, no antes: si el worker lo
    // recogiera primero, buscaría en la base una fila que todavía no existe.
    await this.cola.encolar(trabajo.id, 'plan-estudios');

    await this.eventos.publicar([new DocumentoSolicitado(actor, planId, plan.codigo, tipo)]);
    return trabajo;
  }

  private async comprobarPrecondiciones(
    estado: string,
    planId: string,
    tipo: TipoDocumento,
  ): Promise<void> {
    if (tipo === 'EVIDENCIA_APROBACION') {
      // RF092 dice literalmente «El plan se encuentra en estado Aprobado». Se
      // acepta también Vigente e Histórico: son estados posteriores a la
      // aprobación, y la lectura estricta dejaría sin evidencia justo a los
      // planes archivados, que son los que un evaluador pide.
      if (!YA_APROBADO.includes(estado)) {
        throw new ReglaDeNegocioViolada(
          `El plan está en estado ${estado}. La evidencia de aprobación solo puede ` +
            'generarse una vez el plan ha sido aprobado.',
        );
      }
    }

    if (tipo === 'HISTORICO_CAMBIOS') {
      // RF084: «Si no existen cambios registrados, el sistema informa que no hay
      // datos para exportar». Un documento vacío no informa de eso; parece un
      // fallo de generación.
      const eventos = await this.aprobaciones.listar(planId);
      if (eventos.length === 0) {
        throw new ReglaDeNegocioViolada(
          'El plan todavía no tiene cambios registrados, así que no hay nada que exportar.',
        );
      }
    }
  }
}

export class GenerarDocumento {
  constructor(
    private readonly documentos: RepositorioDocumentosPort,
    private readonly datos: RepositorioDatosDocumentoPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly pdf: RenderizadorPdfPort,
    private readonly hoja: RenderizadorHojaPort,
    private readonly reloj: Reloj = { ahora: () => new Date() },
  ) {}

  /**
   * Lo llama el worker. No lanza: cualquier fallo queda como estado `Fallido`.
   *
   * Un throw aquí acabaría en el log del worker y en ningún sitio más, y la
   * pantalla seguiría diciendo «Generando» indefinidamente. El usuario tiene
   * derecho a saber que su documento no va a llegar.
   */
  async ejecutar(trabajoId: string): Promise<void> {
    const trabajo = await this.documentos.porId(trabajoId);
    if (!trabajo) return;

    // Reintento de un trabajo ya terminado: no se rehace. BullMQ puede
    // reentregar un job tras una caída del worker, y regenerar sobreescribiría
    // un archivo que el usuario quizá ya descargó.
    if (trabajo.estado === 'Listo') return;

    try {
      await this.documentos.marcarGenerando(trabajoId);

      const base = await this.datos.datosDe(trabajo.planId);
      if (!base) throw new Error('El plan ya no existe.');

      const completos: DatosParaDocumento = { ...base, generadoEn: this.reloj.ahora() };
      const documento = armar(trabajo.tipo, completos);
      const { formato, tipoMime } = FORMATO[trabajo.tipo];

      const contenido =
        formato === 'pdf' ? await this.pdf.render(documento) : await this.hoja.render(documento);

      const nombreArchivo = `${documento.nombreArchivo}.${formato}`;
      const ubicacion = await this.almacen.guardar(`${trabajoId}.${formato}`, contenido);

      await this.documentos.marcarListo(trabajoId, {
        nombreArchivo,
        tipoMime,
        bytes: contenido.byteLength,
        ubicacion,
      });
    } catch (error) {
      // El mensaje lo va a leer alguien que pidió un PDF, no quien mantiene el
      // worker: la traza completa va al log, aquí queda algo accionable.
      const motivo = error instanceof Error ? error.message : 'Error desconocido.';
      await this.documentos.marcarFallido(
        trabajoId,
        `No se pudo generar ${NOMBRE_DOCUMENTO[trabajo.tipo] ?? trabajo.tipo}: ${motivo}`,
      );
    }
  }
}

export interface ArchivoDescargado {
  readonly nombreArchivo: string;
  readonly tipoMime: string;
  readonly contenido: Buffer;
}

export class ConsultarDocumento {
  constructor(
    private readonly documentos: RepositorioDocumentosPort,
    private readonly planes: RepositorioPlanPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumento> {
    const trabajo = await this.documentos.porId(trabajoId);
    if (!trabajo) throw new NoEncontrado('el documento', trabajoId);
    await this.exigirLectura(actor, trabajo.planId);
    return trabajo;
  }

  async listarDePlan(actor: Actor, planId: string, limite = 20): Promise<TrabajoDocumento[]> {
    await this.exigirLectura(actor, planId);
    return this.documentos.listarDePlan(planId, limite);
  }

  async descargar(actor: Actor, trabajoId: string): Promise<ArchivoDescargado> {
    const trabajo = await this.estado(actor, trabajoId);

    if (trabajo.estado !== 'Listo') {
      throw new ReglaDeNegocioViolada(
        trabajo.estado === 'Fallido'
          ? (trabajo.error ?? 'La generación del documento falló.')
          : `El documento todavía se está generando (${trabajo.estado}).`,
      );
    }

    const ubicacion = await this.documentos.ubicacionDe(trabajoId);
    if (!ubicacion || !trabajo.nombreArchivo || !trabajo.tipoMime) {
      // El trabajo dice estar listo pero le falta el archivo. Es incoherencia
      // de datos, no un caso de uso: se nombra en vez de devolver un 0 bytes.
      throw new NoEncontrado('el archivo del documento', trabajoId);
    }

    return {
      nombreArchivo: trabajo.nombreArchivo,
      tipoMime: trabajo.tipoMime,
      contenido: await this.almacen.leer(ubicacion),
    };
  }

  /**
   * Descargar exige el mismo permiso que generar, no solo leer el plan.
   *
   * Si bastara `plan.leer`, cualquiera con acceso de consulta podría llevarse
   * la evidencia de aprobación que otro generó, saltándose el control que sí se
   * aplica al pedirla.
   */
  private async exigirLectura(actor: Actor, planId: string): Promise<void> {
    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);

    const decision = await this.autorizacion.puede(actor.id, 'reporte.generar', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

function armar(tipo: TipoDocumento, datos: DatosParaDocumento): Documento {
  switch (tipo) {
    case 'RESUMEN_PLAN':
      return armarResumenDelPlan(datos);
    case 'MALLA_EXCEL':
      return armarMallaParaHojaDeCalculo(datos);
    case 'EVIDENCIA_APROBACION':
      return armarEvidenciaDeAprobacion(datos);
    case 'HISTORICO_CAMBIOS':
      return armarHistoricoDeCambios(datos);
  }
}
