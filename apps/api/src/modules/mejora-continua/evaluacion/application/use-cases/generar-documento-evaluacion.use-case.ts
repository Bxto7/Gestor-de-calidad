/**
 * Generación del plan de evaluación como archivo (RF-PE-032 a RF-PE-034).
 *
 * Calca `generar-documento-medicion.use-case.ts` a propósito: es el mismo
 * concepto —un trabajo que corre en la cola y cuyo estado hay que poder
 * consultar después— y leerlo igual ahorra traducirlo mentalmente al saltar
 * de un submódulo a otro.
 *
 * Lo que sí cambia frente al gemelo: un plan de evaluación no guarda sus
 * propios datos, los hereda leyendo en vivo del plan de medición base y del
 * plan de estudios de origen (igual que `GestionarPlanesEvaluacion.porId`), y
 * `DatosParaDocumentoEvaluacion` pide nombres —de responsable y de
 * docente— donde la configuración solo guarda un UUID. Por eso este caso de
 * uso no tiene un puerto de «datos del documento» propio como el gemelo:
 * ensambla los datos a partir de `RepositorioPlanEvaluacionPort`,
 * `RepositorioPlanMedicionPort`, `ContenidoCurricularPort`,
 * `RepositorioConfiguracionEvaluacionPort` y `DirectorioDeUsuariosPort`, los
 * mismos puertos que ya usa `ConfigurarPlanEvaluacion` para lo mismo.
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
 * `encolar` exige `evaluacion.editar` con la carrera resuelta (2c-C, como el
 * resto del submódulo): exportar aquí sí muta —dispara un trabajo asíncrono y
 * dos consultas de un documento con datos de acreditación— a diferencia del
 * gemelo de medición, que trata exportar como una lectura. Las lecturas
 * (`estado`, `listarDePlan`, `descargar`) exigen `evaluacion.leer` con la
 * carrera en `null`: no están acotadas.
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
import type { DirectorioDeUsuariosPort } from '../../../../auth/application/ports/directorio-usuarios.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import {
  armarDocumentoEvaluacion,
  type DatosParaDocumentoEvaluacion,
  type FormatoDocumentoEvaluacion,
} from '../../domain/documentos/armar-documento-evaluacion.js';
import { DocumentoEvaluacionSolicitado } from '../../domain/events/eventos-evaluacion.js';
import type { RepositorioConfiguracionEvaluacionPort } from '../ports/configuracion-evaluacion.port.js';
import type {
  RepositorioDocumentosEvaluacionPort,
  TipoDocEvaluacion,
  TrabajoDocumentoEvaluacion,
} from '../ports/documentos-evaluacion.port.js';
import type {
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';

/** Con qué se dibuja cada tipo y cómo acaba llamándose el archivo. */
const FORMATO: Readonly<
  Record<
    TipoDocEvaluacion,
    {
      readonly formato: FormatoDocumentoEvaluacion;
      readonly extension: string;
      readonly tipoMime: string;
      readonly nombre: string;
    }
  >
> = {
  PLAN_EVALUACION_PDF: {
    formato: 'pdf',
    extension: 'pdf',
    tipoMime: 'application/pdf',
    nombre: 'el plan de evaluación en PDF',
  },
  PLAN_EVALUACION_EXCEL: {
    formato: 'excel',
    extension: 'xlsx',
    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nombre: 'el plan de evaluación en Excel',
  },
};

/** Qué escribir cuando un nombre no se puede resolver — nunca un UUID en el documento. */
const SIN_NOMBRE = 'ya no está en el plan de estudios';

export interface Reloj {
  ahora(): Date;
}

export class GenerarDocumentoEvaluacion {
  constructor(
    private readonly documentos: RepositorioDocumentosEvaluacionPort,
    private readonly evaluaciones: RepositorioPlanEvaluacionPort,
    private readonly mediciones: RepositorioPlanMedicionPort,
    private readonly curricular: ContenidoCurricularPort,
    private readonly configuraciones: RepositorioConfiguracionEvaluacionPort,
    private readonly directorio: DirectorioDeUsuariosPort,
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
    planEvaluacionId: string,
    tipo: TipoDocEvaluacion,
  ): Promise<TrabajoDocumentoEvaluacion> {
    // Se comprueban antes de crear la fila: un trabajo de un plan inexistente
    // solo serviría para aparecer como Fallido en una pantalla que tampoco
    // existe.
    const plan = await this.exigirPlan(planEvaluacionId);
    const base = await this.exigirBase(plan.planMedicionId);
    await this.exigir(actor, 'evaluacion.editar', await this.carreraDe(base.planEstudiosId));

    const trabajo = await this.documentos.crear({
      planEvaluacionId,
      tipo,
      solicitadoPor: actor.id,
    });

    // Se encola después de persistir el trabajo, no antes: si el worker lo
    // recogiera primero, buscaría en la base una fila que todavía no existe.
    await this.cola.encolar(trabajo.id, 'mejora-continua-evaluacion');

    await this.eventos.publicar([
      new DocumentoEvaluacionSolicitado(actor, planEvaluacionId, plan.codigo, tipo),
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

      const base = await this.datosDelDocumento(trabajo.planEvaluacionId);

      const documento = armarDocumentoEvaluacion(
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

  /**
   * Ensambla lo que el documento necesita, leyendo en vivo — nada se copia.
   * Espejo de `GestionarPlanesEvaluacion.porId` y de
   * `ConfigurarPlanEvaluacion.evaluar` en cómo resuelven la base y el
   * catálogo, más `DirectorioDeUsuariosPort` para poner un nombre donde la
   * configuración solo guarda un identificador (RF-PE-024).
   */
  private async datosDelDocumento(
    planEvaluacionId: string,
  ): Promise<Omit<DatosParaDocumentoEvaluacion, 'generadoEn'>> {
    const plan = await this.evaluaciones.porId(planEvaluacionId);
    if (plan === null) throw new Error('El plan de evaluación ya no existe.');

    const base = await this.mediciones.porId(plan.planMedicionId);
    if (base === null) throw new Error('El plan de medición base ya no existe.');

    const planEstudios = await this.curricular.planPorId(base.planEstudiosId);
    if (planEstudios === null) throw new Error('El plan de estudios base ya no existe.');

    const [config, competenciasCatalogo, asignaturasCatalogo] = await Promise.all([
      this.configuraciones.del(plan.id),
      this.curricular.competenciasDelPlan(base.planEstudiosId),
      this.curricular.asignaturasDelPlan(base.planEstudiosId),
    ]);

    const competenciaPorId = new Map(competenciasCatalogo.map((c) => [c.id, c]));
    const asignaturaPorId = new Map(asignaturasCatalogo.map((a) => [a.id, a]));

    // Un solo viaje al directorio con todos los identificadores que hagan
    // falta, responsables y docentes juntos: uno por competencia y uno por
    // asignatura evaluada acabaría pidiendo el mismo nombre varias veces.
    const idsDeNombres = new Set<string>();
    for (const c of config.competencias) {
      if (c.responsableId !== null) idsDeNombres.add(c.responsableId);
    }
    for (const m of config.mediciones) {
      for (const a of m.asignaturas) {
        if (a.docenteId !== null) idsDeNombres.add(a.docenteId);
      }
    }
    const nombres = await this.directorio.nombresDe([...idsDeNombres]);

    return {
      codigo: plan.codigo,
      version: plan.version,
      estado: plan.estado,
      tipo: base.tipo,
      carreraNombre: planEstudios.carreraNombre,
      planBaseCodigo: base.codigo,
      competencias: config.competencias.map((c) => {
        const cat = competenciaPorId.get(c.competenciaId);
        return {
          id: c.competenciaId,
          codigo: cat?.codigo ?? c.competenciaId,
          nombre: cat?.nombre ?? SIN_NOMBRE,
          instrumento: c.instrumento,
          frecuencia: c.frecuencia,
          responsableNombre: c.responsableId === null ? null : (nombres.get(c.responsableId) ?? null),
        };
      }),
      periodos: base.periodos.map((p) => ({ id: p.id, etiqueta: p.etiqueta })),
      mediciones: config.mediciones.map((m) => ({
        competenciaId: m.competenciaId,
        periodoId: m.periodoId,
        porcentajeAlcanzado: m.porcentajeAlcanzado,
        asignaturas: m.asignaturas.map((a) => {
          const cat = asignaturaPorId.get(a.asignaturaId);
          return {
            codigo: cat?.codigo ?? a.asignaturaId,
            nombre: cat?.nombre ?? SIN_NOMBRE,
            entregable: a.entregable,
            docenteNombre: a.docenteId === null ? null : (nombres.get(a.docenteId) ?? null),
            evidencias: a.evidencias.length,
          };
        }),
      })),
      indicaciones: config.indicaciones.map((i) => ({
        periodoId: i.periodoId,
        grupoObjetivo: i.grupoObjetivo,
        instruccion: i.instruccion,
        enlaceInstrumento: i.enlaceInstrumento,
        enlaceResultados: i.enlaceResultados,
      })),
    };
  }

  private async exigirPlan(id: string): Promise<DatosPlanEvaluacion> {
    const plan = await this.evaluaciones.porId(id);
    if (!plan) throw new NoEncontrado('el plan de evaluación', id);
    return plan;
  }

  private async exigirBase(planMedicionId: string): Promise<DatosPlanMedicion> {
    const base = await this.mediciones.porId(planMedicionId);
    if (!base) throw new NoEncontrado('el plan de medición', planMedicionId);
    return base;
  }

  /**
   * La carrera del plan, para acotar el permiso.
   *
   * Sale de la cadena que ya existe —evaluación → medición → plan de
   * estudios— y no de una columna propia, igual que en el resto del
   * submódulo desde 2c-C.
   */
  private async carreraDe(planEstudiosId: string): Promise<string> {
    const plan = await this.curricular.planPorId(planEstudiosId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planEstudiosId);
    return plan.carreraId;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
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
 * repositorio de trabajos: no encola, no ensambla datos del documento ni
 * escribe en el almacén, solo lee.
 */
export class ConsultarDocumentoEvaluacion {
  constructor(
    private readonly documentos: RepositorioDocumentosEvaluacionPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumentoEvaluacion> {
    await this.exigirLectura(actor);
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) throw new NoEncontrado('el documento', trabajoId);
    return trabajo;
  }

  async listarDePlan(
    actor: Actor,
    planEvaluacionId: string,
    limite = 20,
  ): Promise<TrabajoDocumentoEvaluacion[]> {
    await this.exigirLectura(actor);
    return this.documentos.listarDePlan(planEvaluacionId, limite);
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
    // No acotado por carrera (2c-C): exportar es leer, y quien puede ver el
    // plan en pantalla puede llevárselo, sin importar qué carrera dirija.
    const decision = await this.autorizacion.puede(actor.id, 'evaluacion.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
