/**
 * Qué dice el documento de un plan de medición (RF-PM-027 a RF-PM-029).
 *
 * Función pura: datos dentro, `Documento` fuera. No abre archivos, no sabe qué
 * es un PDF y no depende de NestJS ni de Prisma, así que el contenido de una
 * evidencia de acreditación se afirma en una prueba unitaria en lugar de
 * revisarse abriendo el archivo a ojo.
 *
 * El dibujo lo hacen los renderizadores de `platform/documentos/`, que no
 * saben de qué hablan.
 */

import {
  fechaLegible,
  fechaYHoraLegible,
  type Documento,
  type Metadato,
  type Seccion,
} from '../../../../../platform/documentos/documento.js';

/** El formato cambia solo la matriz; el resto del documento es el mismo. */
export type FormatoDocumentoMedicion = 'pdf' | 'excel';

export interface DatosParaDocumentoMedicion {
  readonly codigo: string;
  readonly tipo: string;
  readonly metaPorcentaje: number;
  readonly estado: string;
  /** El plan de estudios del que cuelga; el documento lo lee una persona. */
  readonly planEstudiosCodigo: string;
  readonly carreraNombre: string;
  readonly aprobadoPor: string | null;
  readonly aprobadoEn: Date | null;
  /** Se inyecta en vez de leer el reloj: así la prueba fija la fecha. */
  readonly generadoEn: Date;
  readonly grupos: readonly {
    readonly atributo: string;
    readonly competencias: readonly { readonly codigo: string; readonly nombre: string }[];
  }[];
  readonly periodos: readonly {
    readonly etiqueta: string;
    readonly fechaCierre: Date | null;
  }[];
  readonly celdas: readonly {
    readonly competenciaCodigo: string;
    readonly periodoEtiqueta: string;
    readonly realizada: boolean;
  }[];
}

/** Competencia con el atributo del que cuelga, para recorrer la matriz en orden. */
interface Fila {
  readonly atributo: string;
  readonly codigo: string;
  readonly nombre: string;
}

function filas(datos: DatosParaDocumentoMedicion): Fila[] {
  return datos.grupos.flatMap((g) =>
    g.competencias.map((c) => ({ atributo: g.atributo, codigo: c.codigo, nombre: c.nombre })),
  );
}

const SIN_COMPETENCIAS = 'Este plan no tiene competencias asignadas.';

/* ── Cabecera y pie ─────────────────────────────────────────────────────── */

/**
 * Los pares de la cabecera.
 *
 * Un plan sin aprobar no lleva la fila de aprobación en absoluto. Escribir
 * «Aprobado por: —» en un documento que sale hacia un expediente sugiere que
 * hubo una aprobación que no llegó a registrarse, y eso es peor que callar.
 */
function cabecera(datos: DatosParaDocumentoMedicion): Metadato[] {
  const metadatos: Metadato[] = [
    { etiqueta: 'Carrera', valor: datos.carreraNombre },
    { etiqueta: 'Plan de estudios', valor: datos.planEstudiosCodigo },
    { etiqueta: 'Plan de medición', valor: datos.codigo },
    { etiqueta: 'Tipo de medición', valor: datos.tipo },
    { etiqueta: 'Meta', valor: `${datos.metaPorcentaje}%` },
    { etiqueta: 'Estado', valor: datos.estado },
  ];

  if (datos.aprobadoPor !== null) {
    metadatos.push({
      etiqueta: 'Aprobado por',
      valor:
        datos.aprobadoEn === null
          ? datos.aprobadoPor
          : `${datos.aprobadoPor} · ${fechaLegible(datos.aprobadoEn)}`,
    });
  }

  return metadatos;
}

function pie(datos: DatosParaDocumentoMedicion): string {
  return (
    `Generado por el Sistema de Gestión de la Calidad el ${fechaYHoraLegible(datos.generadoEn)} · ` +
    `${datos.codigo} (${datos.estado})`
  );
}

/* ── Secciones comunes a los dos formatos ───────────────────────────────── */

function seccionResumen(datos: DatosParaDocumentoMedicion): Seccion {
  const competencias = filas(datos).length;
  const medidas = datos.celdas.filter((c) => c.realizada).length;

  return {
    titulo: 'Resumen',
    parrafos: [
      `El plan mide ${competencias} competencia(s) agrupada(s) en ` +
        `${datos.grupos.length} atributo(s) del graduado, a lo largo de ` +
        `${datos.periodos.length} periodo(s) académico(s).`,
      `Mediciones programadas: ${datos.celdas.length}, de las cuales ` +
        `${medidas} ya se realizaron. Meta comprometida: ${datos.metaPorcentaje}%.`,
    ],
  };
}

function seccionCompetencias(datos: DatosParaDocumentoMedicion): Seccion {
  return {
    titulo: 'Competencias por atributo del graduado',
    tabla: {
      columnas: [
        { titulo: 'Atributo del graduado', peso: 2 },
        { titulo: 'Competencia', peso: 3 },
      ],
      filas: filas(datos).map((f) => [f.atributo, `${f.codigo} — ${f.nombre}`]),
      siVacia: SIN_COMPETENCIAS,
    },
  };
}

function seccionPeriodos(datos: DatosParaDocumentoMedicion): Seccion {
  return {
    titulo: 'Periodos académicos',
    tabla: {
      columnas: [
        { titulo: '#', peso: 1, alineacion: 'derecha' },
        { titulo: 'Periodo', peso: 2 },
        { titulo: 'Fecha de cierre', peso: 2 },
      ],
      filas: datos.periodos.map((p, i) => [
        String(i + 1),
        p.etiqueta,
        // Un periodo abierto y uno cerrado sin fecha registrada no son lo
        // mismo para quien revisa, y la celda en blanco los confunde.
        p.fechaCierre === null ? 'Sin fecha de cierre' : fechaLegible(p.fechaCierre),
      ]),
      siVacia: 'Este plan no tiene periodos declarados.',
    },
  };
}

/* ── RF-PM-029 — la matriz en PDF ───────────────────────────────────────── */

/**
 * Una fila por competencia y una sola columna con los periodos.
 *
 * Quince columnas —el máximo que admite un plan— no caben en una página
 * vertical; el renderizador de PDF ya avisa de ese límite en su propio código.
 * Así que la matriz se transpone a texto: la competencia y los periodos en que
 * se mide, separados por coma.
 */
function seccionMatrizPdf(datos: DatosParaDocumentoMedicion): Seccion {
  return {
    titulo: 'Matriz de medición',
    parrafos: [
      'Cada competencia se lista con los periodos en que está programada. ' +
        'Un periodo marcado como realizado significa que la medición ya ocurrió.',
    ],
    tabla: {
      columnas: [
        { titulo: 'Competencia', peso: 2 },
        { titulo: 'Periodos en que se mide', peso: 3 },
      ],
      filas: filas(datos).map((f) => {
        const suyas = datos.celdas.filter((c) => c.competenciaCodigo === f.codigo);
        const texto = suyas
          .map((c) => (c.realizada ? `${c.periodoEtiqueta} (realizada)` : c.periodoEtiqueta))
          .join(', ');
        return [`${f.codigo} — ${f.nombre}`, texto === '' ? 'Sin programar' : texto];
      }),
      siVacia: SIN_COMPETENCIAS,
    },
  };
}

/* ── RF-PM-028 — la matriz en Excel ─────────────────────────────────────── */

/**
 * La cuadrícula tal cual: una columna por periodo.
 *
 * Es lo que una hoja de cálculo sí puede sostener, y lo que hace falta para
 * filtrar o pegar los datos en otro sitio. «Realizada» y «Programada» no se
 * escriben igual porque una es evidencia de que la medición ocurrió y la otra
 * una intención.
 */
function seccionMatrizExcel(datos: DatosParaDocumentoMedicion): Seccion {
  return {
    titulo: 'Matriz de medición',
    tabla: {
      columnas: [
        { titulo: 'Competencia', peso: 3 },
        ...datos.periodos.map((p) => ({ titulo: p.etiqueta, peso: 1 })),
      ],
      filas: filas(datos).map((f) => [
        `${f.codigo} — ${f.nombre}`,
        ...datos.periodos.map((p) => {
          const celda = datos.celdas.find(
            (c) => c.competenciaCodigo === f.codigo && c.periodoEtiqueta === p.etiqueta,
          );
          if (celda === undefined) return '';
          return celda.realizada ? 'Realizada' : 'Programada';
        }),
      ]),
      siVacia: SIN_COMPETENCIAS,
    },
  };
}

/* ── El armador ─────────────────────────────────────────────────────────── */

export function armarDocumentoMedicion(
  datos: DatosParaDocumentoMedicion,
  formato: FormatoDocumentoMedicion,
): Documento {
  return {
    nombreArchivo: `plan-medicion-${datos.codigo}`,
    titulo: 'Plan de Medición de Competencias',
    subtitulo: `${datos.carreraNombre} · ${datos.codigo}`,
    metadatos: cabecera(datos),
    secciones: [
      seccionResumen(datos),
      seccionCompetencias(datos),
      seccionPeriodos(datos),
      formato === 'pdf' ? seccionMatrizPdf(datos) : seccionMatrizExcel(datos),
    ],
    pie: pie(datos),
  };
}
