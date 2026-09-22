// apps/api/src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.ts

/**
 * Qué dice el documento del Acta de Aprobación (RF-AC-018/019). Archivo
 * puro: no importa NestJS, Prisma, `pdfkit` ni `exceljs` — eso vive en
 * `infrastructure/documentos/` (Tasks 8-11), que consume `ActaParaDocumento`
 * sin saber de dónde salió.
 *
 * No importa `DatosActa`/`AccionDelActa` de `application/` a propósito:
 * recibe su propio tipo de entrada (`DatosParaActaDocumento`), ya plano —
 * mismo criterio que `armar-documento-mejora.ts` con `DatosParaDocumentoMejora`.
 *
 * Sin sección de firma (decisión del usuario, ver el plan 2026-09-20) y sin
 * columna "Cargo/rol" de asistentes (RF-AC-005 nunca la pidió).
 */

import { createHash } from 'node:crypto';

export type AspectoAccionDocumento = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';

export interface FilaAccionDocumento {
  readonly codigo: string;
  readonly nombre: string;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
}

export interface FilaCompetenciaDocumento extends FilaAccionDocumento {
  /** Porcentaje 0-100, o `null` si no hay medición disponible (RF-PJ-028 RN3). */
  readonly resultado: number | null;
  /** La meta contra la que se comparó, congelada al aprobar (0-100). */
  readonly meta: number | null;
  /** `null`, no `false`, cuando falta el resultado o la meta. */
  readonly logrado: boolean | null;
}

export interface ActaParaDocumento {
  readonly numeroActa: string;
  readonly titulo: string;
  readonly periodoAcademico: string;
  readonly cabecera: {
    readonly convocadaPor: string;
    readonly fecha: Date;
    readonly lugar: string;
    readonly periodoAcademico: string;
    readonly objetivo: string;
  };
  readonly asistentes: readonly string[];
  readonly acuerdo: string;
  readonly criterios: readonly FilaAccionDocumento[];
  readonly objetivos: readonly FilaAccionDocumento[];
  readonly competencias: readonly FilaCompetenciaDocumento[];
  readonly resumen: {
    readonly criterios: number;
    readonly objetivos: number;
    readonly competencias: number;
    readonly total: number;
  };
  readonly constanciaYResolucion: string;
  readonly ciudadYFecha: { readonly lugar: string; readonly fecha: Date } | null;
  readonly codigoVerificacion: string;
  readonly generadoEn: Date;
}

/**
 * Exportado: Task 12 (`GenerarDocumentoActa`) construye este tipo
 * directamente desde los puertos, sin pasar por `GestionarActas`.
 *
 * `id`/`orden` y `plan.id` no los usa `armarActaParaDocumento` — ninguno
 * aparece en `ActaParaDocumento` — y tampoco los lee ningún consumidor hoy:
 * Task 12 (`generar-documento-acta.use-case.ts`) reconstruye este objeto
 * campo por campo en sus dos ramas (en vivo y desde snapshot) y nunca toca
 * esos tres campos, así que no hay paso por referencia que los reutilice. Se
 * conservan en el tipo por si un futuro consumidor los necesita, no porque
 * alguno ya los use.
 */
export interface AccionParaDocumento {
  readonly id: string;
  readonly incluida: boolean;
  readonly orden: number;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly metaCompetenciaSnapshot: number | null;
  readonly plan: {
    readonly id: string;
    readonly codigo: string;
    readonly aspecto: AspectoAccionDocumento;
    readonly nombre: string;
    readonly plazo: Date;
    readonly recursos: string;
    readonly metas: string;
    readonly responsable: string;
  };
}

export interface DatosParaActaDocumento {
  readonly acta: {
    readonly id: string;
    readonly correlativo: number;
    readonly codigo: string;
    readonly titulo: string;
    readonly objetivo: string;
    readonly periodoAcademico: string;
    readonly convocadaPor: string;
    readonly fechaReunion: Date;
    readonly lugarReunion: string;
    readonly lugarEmision: string | null;
    readonly fechaEmision: Date | null;
    readonly aprobadoEn: Date | null;
    readonly textoIntroduccion: string;
    readonly textoAcuerdoCierre: string;
    readonly asistentes: readonly { readonly nombre: string }[];
  };
  readonly acciones: readonly AccionParaDocumento[];
  readonly generadoEn: Date;
}

export function armarActaParaDocumento(datos: DatosParaActaDocumento): ActaParaDocumento {
  const incluidas = datos.acciones.filter((a) => a.incluida);
  const criterios = incluidas
    .filter((a) => a.plan.aspecto === 'CRITERIO_ACREDITACION')
    .map(aFilaAccion);
  const objetivos = incluidas
    .filter((a) => a.plan.aspecto === 'OBJETIVO_EDUCACIONAL')
    .map(aFilaAccion);
  const competencias = incluidas
    .filter((a) => a.plan.aspecto === 'COMPETENCIA')
    .map(aFilaCompetencia);

  return {
    numeroActa: datos.acta.codigo,
    titulo: datos.acta.titulo,
    periodoAcademico: datos.acta.periodoAcademico,
    cabecera: {
      convocadaPor: datos.acta.convocadaPor,
      fecha: datos.acta.fechaReunion,
      lugar: datos.acta.lugarReunion,
      periodoAcademico: datos.acta.periodoAcademico,
      objetivo: datos.acta.objetivo,
    },
    asistentes: datos.acta.asistentes.map((a) => a.nombre),
    acuerdo: datos.acta.textoIntroduccion,
    criterios,
    objetivos,
    competencias,
    resumen: {
      criterios: criterios.length,
      objetivos: objetivos.length,
      competencias: competencias.length,
      total: criterios.length + objetivos.length + competencias.length,
    },
    constanciaYResolucion: datos.acta.textoAcuerdoCierre,
    ciudadYFecha:
      datos.acta.lugarEmision !== null && datos.acta.fechaEmision !== null
        ? { lugar: datos.acta.lugarEmision, fecha: datos.acta.fechaEmision }
        : null,
    codigoVerificacion: codigoDeVerificacion(
      datos.acta.id,
      datos.acta.correlativo,
      datos.acta.aprobadoEn,
    ),
    generadoEn: datos.generadoEn,
  };
}

function aFilaAccion(a: AccionParaDocumento): FilaAccionDocumento {
  return {
    codigo: a.plan.codigo,
    nombre: a.plan.nombre,
    plazo: a.plan.plazo,
    recursos: a.plan.recursos,
    metas: a.plan.metas,
    responsable: a.plan.responsable,
  };
}

function aFilaCompetencia(a: AccionParaDocumento): FilaCompetenciaDocumento {
  const resultado = a.porcentajeMedicionCompetencia;
  const meta = a.metaCompetenciaSnapshot;
  return {
    ...aFilaAccion(a),
    resultado,
    meta,
    logrado: resultado === null || meta === null ? null : resultado >= meta,
  };
}

/**
 * §6 de la especificación: hash corto de "id + versión + fecha de
 * aprobación". Este modelo no tiene un campo `version` propio (a diferencia
 * de `PlanMejora`/`PlanMedicion`), así que se usa `correlativo` — es lo que
 * de verdad identifica a esta acta dentro de su carrera de forma estable.
 * `aprobadoEn` puede ser `null` solo en teoría (una acta llega aquí siempre
 * Aprobada en adelante); se usa el epoch como respaldo determinista en vez
 * de lanzar, porque un código de verificación nunca debe ser la causa de
 * que la exportación falle.
 */
function codigoDeVerificacion(id: string, correlativo: number, aprobadoEn: Date | null): string {
  const material = `${id}:${correlativo}:${(aprobadoEn ?? new Date(0)).toISOString()}`;
  return createHash('sha256').update(material).digest('hex').slice(0, 12);
}
