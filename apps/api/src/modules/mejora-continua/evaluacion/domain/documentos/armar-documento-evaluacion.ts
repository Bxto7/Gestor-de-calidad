/**
 * Qué dice el documento de un plan de evaluación (RF-PE-031 a RF-PE-033).
 *
 * Función pura: datos dentro, `Documento` fuera. No abre archivos, no sabe qué
 * es un PDF y no depende de NestJS ni de Prisma, así que el contenido de una
 * evidencia de acreditación se afirma en una prueba unitaria en lugar de
 * revisarse abriendo el archivo a ojo.
 *
 * El dibujo lo hacen los renderizadores de `platform/documentos/`, que no
 * saben de qué hablan — y tampoco saben que un plan de evaluación puede ser
 * directo o indirecto. La única rama de tipo de este archivo es la
 * estructural, al final de `secciones` en `armarDocumentoEvaluacion`: el
 * resto del documento (resumen, competencias, periodos, medición alcanzada)
 * es idéntico para los dos tipos, porque el gemelo de medición no la
 * necesita. Donde el tipo solo cambia un texto (la etiqueta «Directa»/
 * «Indirecta» de la cabecera, o su versión en minúscula del resumen) no hay
 * rama: `ETIQUETA_TIPO` es una tabla de consulta, no un `? :` repetido.
 */

import {
  fechaYHoraLegible,
  type Documento,
  type Metadato,
  type Seccion,
} from '../../../../../platform/documentos/documento.js';

/** El formato cambia solo cómo se presenta la medición alcanzada; el resto es igual. */
export type FormatoDocumentoEvaluacion = 'pdf' | 'excel';

export interface DatosParaDocumentoEvaluacion {
  readonly codigo: string;
  readonly version: number;
  readonly estado: string;
  readonly tipo: 'DIRECTA' | 'INDIRECTA';
  readonly carreraNombre: string;
  readonly planBaseCodigo: string;
  readonly competencias: readonly {
    readonly id: string;
    readonly codigo: string;
    readonly nombre: string;
    readonly instrumento: string | null;
    readonly frecuencia: string | null;
    readonly responsableNombre: string | null;
  }[];
  readonly periodos: readonly { readonly id: string; readonly etiqueta: string }[];
  readonly mediciones: readonly {
    readonly competenciaId: string;
    readonly periodoId: string;
    readonly porcentajeAlcanzado: number | null;
    readonly asignaturas: readonly {
      readonly codigo: string;
      readonly nombre: string;
      readonly entregable: string;
      readonly docenteNombre: string | null;
      readonly evidencias: number;
    }[];
  }[];
  readonly indicaciones: readonly {
    readonly periodoId: string;
    readonly grupoObjetivo: string;
    readonly instruccion: string;
    readonly enlaceInstrumento: string;
    readonly enlaceResultados: string | null;
  }[];
  /** Se inyecta en vez de leer el reloj: así la prueba fija la fecha. */
  readonly generadoEn: Date;
}

/** Qué escribir cuando un campo opcional no llegó — nunca una celda en blanco. */
const SIN_DATO = 'Sin definir';

const SIN_COMPETENCIAS = 'Este plan no tiene competencias asignadas.';

/**
 * Cómo se presenta cada tipo de plan — una tabla de consulta, no una rama.
 *
 * El valor de dominio (`DIRECTA`/`INDIRECTA`) es una constante técnica, no un
 * texto pensado para salir en un documento de acreditación. Antes esto se
 * resolvía con un `? :` en cada sitio que necesitaba el texto — dos ramas de
 * presentación además de la estructural — y eso es justo lo que el comentario
 * de cabecera del archivo decía que no pasaba. Con la tabla, añadir un texto
 * nuevo (o una tercera variante) no es una rama más, es una entrada más.
 */
const ETIQUETA_TIPO = { DIRECTA: 'Directa', INDIRECTA: 'Indirecta' } as const;

function competenciaPorId(datos: DatosParaDocumentoEvaluacion, id: string) {
  return datos.competencias.find((c) => c.id === id);
}

function periodoPorId(datos: DatosParaDocumentoEvaluacion, id: string) {
  return datos.periodos.find((p) => p.id === id);
}

/* ── Cabecera y pie ─────────────────────────────────────────────────────── */

/**
 * Los pares de la cabecera.
 *
 * RF-PE-033 RN1 exige código, tipo y estado como mínimo — literal.
 */
function cabecera(datos: DatosParaDocumentoEvaluacion): Metadato[] {
  return [
    { etiqueta: 'Código', valor: datos.codigo },
    { etiqueta: 'Versión', valor: String(datos.version) },
    { etiqueta: 'Carrera', valor: datos.carreraNombre },
    { etiqueta: 'Plan base', valor: datos.planBaseCodigo },
    { etiqueta: 'Tipo', valor: ETIQUETA_TIPO[datos.tipo] },
    { etiqueta: 'Estado', valor: datos.estado },
  ];
}

function pie(datos: DatosParaDocumentoEvaluacion): string {
  return (
    `Generado por el SGC (Sistema de Gestión de la Calidad) el ` +
    `${fechaYHoraLegible(datos.generadoEn)} · ${datos.codigo} (${datos.estado})`
  );
}

/* ── Secciones comunes a los dos tipos de plan ──────────────────────────── */

function seccionResumen(datos: DatosParaDocumentoEvaluacion): Seccion {
  const registradas = datos.mediciones.filter((m) => m.porcentajeAlcanzado !== null).length;
  // Minúscula porque aquí va en medio de una frase, no en una etiqueta de
  // cabecera; se deriva de la misma tabla de consulta, no de una rama propia.
  const tipoTexto = ETIQUETA_TIPO[datos.tipo].toLowerCase();

  return {
    titulo: 'Resumen',
    parrafos: [
      `Plan de evaluación ${tipoTexto} de ${datos.competencias.length} competencia(s), a lo ` +
        `largo de ${datos.periodos.length} periodo(s) académico(s).`,
      `Mediciones programadas: ${datos.mediciones.length}, de las cuales ${registradas} ya ` +
        `tienen un porcentaje alcanzado registrado.`,
    ],
  };
}

function seccionCompetencias(datos: DatosParaDocumentoEvaluacion): Seccion {
  return {
    titulo: 'Competencias',
    tabla: {
      columnas: [
        { titulo: 'Código', peso: 1 },
        { titulo: 'Nombre', peso: 3 },
        { titulo: 'Instrumento', peso: 2 },
        { titulo: 'Frecuencia', peso: 2 },
        { titulo: 'Responsable', peso: 2 },
      ],
      filas: datos.competencias.map((c) => [
        c.codigo,
        c.nombre,
        c.instrumento ?? SIN_DATO,
        c.frecuencia ?? SIN_DATO,
        c.responsableNombre ?? SIN_DATO,
      ]),
      siVacia: SIN_COMPETENCIAS,
    },
  };
}

function seccionPeriodos(datos: DatosParaDocumentoEvaluacion): Seccion {
  return {
    titulo: 'Periodos académicos',
    tabla: {
      columnas: [
        { titulo: '#', peso: 1, alineacion: 'derecha' },
        { titulo: 'Periodo', peso: 3 },
      ],
      filas: datos.periodos.map((p, i) => [String(i + 1), p.etiqueta]),
      siVacia: 'Este plan no tiene periodos declarados.',
    },
  };
}

/* ── Medición alcanzada — RF-PE-031/032, se exporta lo que hay ────────────
 *
 * Un periodo sin porcentaje registrado se exporta igual que uno con dato: la
 * evaluación puede estar en curso y el documento tiene que poder salir antes
 * de que termine. «Sin registrar» dice que la medición está programada pero
 * no cerrada; una celda en blanco no distinguiría eso de un cruce que nadie
 * programó.
 */

/** Una fila por competencia, con sus periodos en texto — igual que la matriz en PDF del gemelo. */
function seccionMedicionAlcanzadaPdf(datos: DatosParaDocumentoEvaluacion): Seccion {
  return {
    titulo: 'Medición alcanzada',
    parrafos: [
      'Cada competencia se lista con el porcentaje alcanzado en cada periodo en que fue medida.',
    ],
    tabla: {
      columnas: [
        { titulo: 'Competencia', peso: 2 },
        { titulo: 'Resultado por periodo', peso: 3 },
      ],
      filas: datos.competencias.map((c) => {
        const suyas = datos.mediciones.filter((m) => m.competenciaId === c.id);
        const texto = suyas
          .map((m) => {
            const periodo = periodoPorId(datos, m.periodoId)?.etiqueta ?? m.periodoId;
            const valor =
              m.porcentajeAlcanzado === null ? 'Sin registrar' : `${m.porcentajeAlcanzado}%`;
            return `${periodo}: ${valor}`;
          })
          .join(', ');
        return [`${c.codigo} — ${c.nombre}`, texto === '' ? 'Sin mediciones programadas' : texto];
      }),
      siVacia: SIN_COMPETENCIAS,
    },
  };
}

/** La cuadrícula: una columna por periodo — igual que la matriz en Excel del gemelo. */
function seccionMedicionAlcanzadaExcel(datos: DatosParaDocumentoEvaluacion): Seccion {
  return {
    titulo: 'Medición alcanzada',
    tabla: {
      columnas: [
        { titulo: 'Competencia', peso: 3 },
        ...datos.periodos.map((p) => ({ titulo: p.etiqueta, peso: 1 })),
      ],
      filas: datos.competencias.map((c) => [
        `${c.codigo} — ${c.nombre}`,
        ...datos.periodos.map((p) => {
          const m = datos.mediciones.find(
            (x) => x.competenciaId === c.id && x.periodoId === p.id,
          );
          if (m === undefined) return '';
          return m.porcentajeAlcanzado === null ? 'Sin registrar' : `${m.porcentajeAlcanzado}%`;
        }),
      ]),
      siVacia: SIN_COMPETENCIAS,
    },
  };
}

function seccionMedicionAlcanzada(
  datos: DatosParaDocumentoEvaluacion,
  formato: FormatoDocumentoEvaluacion,
): Seccion {
  return formato === 'pdf'
    ? seccionMedicionAlcanzadaPdf(datos)
    : seccionMedicionAlcanzadaExcel(datos);
}

/* ── La única rama: directa lleva asignaturas, indirecta lleva indicaciones ─
 *
 * Un plan directo mide con asignaturas, entregable y docente; uno indirecto
 * mide con indicaciones por grupo objetivo (egresados, empleadores...). Son
 * dos formas de evidencia que no comparten columnas, así que no tiene sentido
 * forzarlas en una tabla común — y por eso la rama vive aquí, en el armador,
 * en vez de en un renderizador que tendría que aprender a distinguir tipos de
 * plan.
 */

function seccionAsignaturas(datos: DatosParaDocumentoEvaluacion): Seccion {
  const filas = datos.mediciones.flatMap((m) => {
    const competencia = competenciaPorId(datos, m.competenciaId);
    const periodo = periodoPorId(datos, m.periodoId);
    return m.asignaturas.map((a) => [
      competencia?.codigo ?? m.competenciaId,
      periodo?.etiqueta ?? m.periodoId,
      a.codigo,
      a.nombre,
      a.entregable,
      a.docenteNombre ?? SIN_DATO,
      String(a.evidencias),
    ]);
  });

  return {
    titulo: 'Asignaturas evaluadas',
    tabla: {
      columnas: [
        { titulo: 'Competencia', peso: 1 },
        { titulo: 'Periodo', peso: 1 },
        { titulo: 'Código', peso: 1 },
        { titulo: 'Asignatura', peso: 2 },
        { titulo: 'Entregable', peso: 2 },
        { titulo: 'Docente', peso: 2 },
        { titulo: 'Evidencias', peso: 1, alineacion: 'derecha' },
      ],
      filas,
      siVacia: 'Este plan directo no tiene asignaturas registradas.',
    },
  };
}

function seccionIndicaciones(datos: DatosParaDocumentoEvaluacion): Seccion {
  return {
    titulo: 'Indicaciones de medición',
    tabla: {
      columnas: [
        { titulo: 'Periodo', peso: 1 },
        { titulo: 'Grupo objetivo', peso: 2 },
        { titulo: 'Instrucción', peso: 3 },
        { titulo: 'Instrumento', peso: 2 },
        { titulo: 'Resultados', peso: 2 },
      ],
      filas: datos.indicaciones.map((i) => [
        periodoPorId(datos, i.periodoId)?.etiqueta ?? i.periodoId,
        i.grupoObjetivo,
        i.instruccion,
        i.enlaceInstrumento,
        i.enlaceResultados ?? 'Pendiente',
      ]),
      siVacia: 'Este plan indirecto no tiene indicaciones registradas.',
    },
  };
}

/* ── El armador ─────────────────────────────────────────────────────────── */

export function armarDocumentoEvaluacion(
  datos: DatosParaDocumentoEvaluacion,
  formato: FormatoDocumentoEvaluacion,
): Documento {
  return {
    nombreArchivo: `plan-evaluacion-${datos.codigo}`,
    titulo: 'Plan de Evaluación de Competencias',
    subtitulo: `${datos.carreraNombre} · ${datos.codigo}`,
    metadatos: cabecera(datos),
    secciones: [
      seccionResumen(datos),
      seccionCompetencias(datos),
      seccionPeriodos(datos),
      seccionMedicionAlcanzada(datos, formato),
      datos.tipo === 'DIRECTA' ? seccionAsignaturas(datos) : seccionIndicaciones(datos),
    ],
    pie: pie(datos),
  };
}
