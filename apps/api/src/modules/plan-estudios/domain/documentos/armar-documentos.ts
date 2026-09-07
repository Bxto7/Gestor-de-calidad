/**
 * Qué dice cada documento (RF072, RF073, RF084, RF092).
 *
 * Funciones puras: datos dentro, `Documento` fuera. No abren archivos, no
 * saben qué es un PDF y no dependen de nada de NestJS ni de Prisma, así que el
 * contenido de un documento de acreditación se puede afirmar en una prueba
 * unitaria en lugar de comprobarse abriéndolo a ojo.
 *
 * El dibujo lo hacen los renderizadores de `infrastructure/documents/`.
 */

import {
  fechaLegible,
  fechaYHoraLegible,
  type Documento,
  type Seccion,
  type Tabla,
} from '../../../../platform/documentos/documento.js';
import { calcularTotalCreditos, creditosPorCiclo } from '../services/motor-de-validaciones.js';
import type { EstadoPlan } from '../value-objects/estado-plan.js';

/**
 * Asignatura tal como la necesita un documento.
 *
 * Coincide campo a campo con lo que espera `calcularTotalCreditos`, así que el
 * total del documento sale del mismo cálculo que el de la pantalla y no de una
 * suma paralela. Una segunda suma es exactamente cómo el plan 2018 llegó a
 * declarar 249 créditos en un sitio y 210 en otro.
 */
export interface AsignaturaParaDocumento {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly creditos: number;
  readonly horasTeoricas: number;
  readonly competenciaIds: readonly string[];
  readonly cicloNumero: number | null;
  readonly activa: boolean;
  readonly condicion: 'Obligatoria' | 'Electiva';
  readonly tipo: 'General' | 'Transversal' | 'Especialidad';
  readonly grupoElectivo: { readonly codigo: string; readonly cantidadAElegir: number } | null;
  readonly grupoNombre: string | null;
  /** Códigos, no identificadores: el documento lo lee una persona. */
  readonly prerrequisitos: readonly string[];
  readonly correquisitos: readonly string[];
}

export interface DatosParaDocumento {
  readonly plan: {
    readonly codigo: string;
    readonly version: number;
    readonly estado: EstadoPlan;
    readonly duracionAnios: number;
    readonly fechaVigencia: Date | null;
  };
  readonly carrera: { readonly nombre: string; readonly codigo: string };
  readonly facultad: string;
  readonly asignaturas: readonly AsignaturaParaDocumento[];
  readonly objetivos: readonly {
    readonly codigo: string;
    readonly nombre: string;
    readonly descripcion: string;
  }[];
  readonly competencias: readonly {
    readonly codigo: string;
    readonly nombre: string;
    /** Códigos de atributos ICACIT que desarrolla (§6.2). Puede estar vacío. */
    readonly atributos: readonly string[];
  }[];
  readonly aprobaciones: readonly {
    readonly fecha: Date;
    readonly accion: string;
    readonly usuarioNombre: string;
    readonly comentario: string | null;
  }[];
  /** Cuándo se generó. Se inyecta en vez de leer el reloj: así la prueba fija la fecha. */
  readonly generadoEn: Date;
}

/* ── Piezas comunes ─────────────────────────────────────────────────────── */

function pie(datos: DatosParaDocumento): string {
  return (
    `Generado por el Sistema de Gestión de la Calidad el ${fechaYHoraLegible(datos.generadoEn)} · ` +
    `${datos.plan.codigo} v${datos.plan.version} (${datos.plan.estado})`
  );
}

function cabecera(datos: DatosParaDocumento) {
  return [
    { etiqueta: 'Facultad', valor: datos.facultad },
    { etiqueta: 'Carrera', valor: datos.carrera.nombre },
    { etiqueta: 'Plan de estudios', valor: `${datos.plan.codigo} (versión ${datos.plan.version})` },
    { etiqueta: 'Estado', valor: datos.plan.estado },
    {
      etiqueta: 'Vigencia',
      valor: datos.plan.fechaVigencia ? fechaLegible(datos.plan.fechaVigencia) : 'Sin fecha',
    },
  ];
}

/** Ciclos que la carrera declara, tenga o no asignaturas puestas (RF011 RN2). */
function ciclos(datos: DatosParaDocumento): number[] {
  return Array.from({ length: datos.plan.duracionAnios * 2 }, (_, i) => i + 1);
}

function activas(datos: DatosParaDocumento): AsignaturaParaDocumento[] {
  return datos.asignaturas.filter((a) => a.activa);
}

/** «ASUC01113, ASUC01114» o un guion. Nunca vacío: una celda en blanco no dice nada. */
function lista(codigos: readonly string[]): string {
  return codigos.length === 0 ? '—' : codigos.join(', ');
}

/**
 * Cómo se nombra una asignatura electiva dentro de un grupo.
 *
 * El grupo se declara una vez y sus opciones se marcan como tales. Un listado
 * que enseñe las cinco opciones sin decir que solo se lleva una hace parecer el
 * plan más largo de lo que es — el error de los 249 créditos, otra vez, pero
 * escrito en un documento que sale de la universidad.
 */
function etiquetaElectivo(a: AsignaturaParaDocumento): string {
  if (a.grupoElectivo === null) return a.condicion;
  const nombre = a.grupoNombre ?? a.grupoElectivo.codigo;
  return `Electivo · ${nombre} (elegir ${a.grupoElectivo.cantidadAElegir})`;
}

/* ── RF072 — PDF resumen del plan ───────────────────────────────────────── */

/**
 * Resumen del plan: información general y malla por ciclos.
 *
 * RF072 pide expresamente que un plan sin asignaturas genere el PDF igual,
 * «indicando la ausencia de contenido». Por eso los ciclos vacíos aparecen con
 * su tabla y su aviso, en vez de desaparecer del documento: un plan al que le
 * falta el ciclo 7 y un plan cuyo ciclo 7 está vacío no son lo mismo, y quien
 * revisa el expediente necesita distinguirlos.
 */
export function armarResumenDelPlan(datos: DatosParaDocumento): Documento {
  const conCiclo = activas(datos);

  const secciones: Seccion[] = [
    {
      titulo: 'Resumen',
      parrafos: [
        `El plan contempla ${datos.plan.duracionAnios} años académicos ` +
          `(${ciclos(datos).length} ciclos) y un total de ` +
          `${calcularTotalCreditos(conCiclo)} créditos.`,
        `Asignaturas registradas: ${conCiclo.length}. ` +
          `Objetivos educacionales: ${datos.objetivos.length}. ` +
          `Competencias del perfil de egreso: ${datos.competencias.length}.`,
      ],
    },
    seccionObjetivos(datos),
    seccionCompetencias(datos),
    ...ciclos(datos).map((numero) => seccionCiclo(datos, numero)),
  ];

  const sueltas = seccionSinUbicar(datos);
  if (sueltas) secciones.push(sueltas);

  return {
    nombreArchivo: `plan-${datos.plan.codigo}-v${datos.plan.version}`,
    titulo: 'Plan de estudios',
    subtitulo: `${datos.carrera.nombre} · ${datos.plan.codigo} v${datos.plan.version}`,
    metadatos: cabecera(datos),
    secciones,
    pie: pie(datos),
  };
}

function seccionObjetivos(datos: DatosParaDocumento): Seccion {
  return {
    titulo: 'Objetivos educacionales',
    tabla: {
      columnas: [
        { titulo: 'Código', peso: 1 },
        { titulo: 'Objetivo', peso: 3 },
        { titulo: 'Descripción', peso: 6 },
      ],
      filas: datos.objetivos.map((o) => [o.codigo, o.nombre, o.descripcion]),
      siVacia: 'El plan todavía no tiene objetivos educacionales asociados.',
    },
  };
}

function seccionCompetencias(datos: DatosParaDocumento): Seccion {
  const sinMapear = datos.competencias.filter((c) => c.atributos.length === 0).length;

  return {
    titulo: 'Competencias del perfil de egreso',
    parrafos:
      sinMapear > 0
        ? [
            // Se dice en el propio documento y no solo en pantalla: si el PDF va
            // a un expediente de acreditación, la brecha tiene que viajar con él.
            `${sinMapear} de ${datos.competencias.length} competencias no están ` +
              'mapeadas a ningún atributo del graduado.',
          ]
        : undefined,
    tabla: {
      columnas: [
        { titulo: 'Código', peso: 1 },
        { titulo: 'Competencia', peso: 4 },
        { titulo: 'Atributos ICACIT', peso: 2 },
      ],
      filas: datos.competencias.map((c) => [
        c.codigo,
        c.nombre,
        c.atributos.length === 0 ? 'Sin mapear' : c.atributos.join(', '),
      ]),
      siVacia: 'El plan todavía no tiene competencias asociadas.',
    },
  };
}

function seccionCiclo(datos: DatosParaDocumento, numero: number): Seccion {
  const delCiclo = activas(datos)
    .filter((a) => a.cicloNumero === numero)
    .sort((x, y) => x.codigo.localeCompare(y.codigo, 'es'));

  const creditos = creditosPorCiclo(activas(datos), numero);

  return {
    titulo: `Ciclo ${numero} — ${creditos} créditos`,
    tabla: {
      columnas: [
        { titulo: 'Código', peso: 2 },
        { titulo: 'Asignatura', peso: 5 },
        { titulo: 'Cr.', peso: 1, alineacion: 'derecha' },
        { titulo: 'Condición', peso: 3 },
        { titulo: 'Prerrequisitos', peso: 3 },
      ],
      filas: delCiclo.map((a) => [
        a.codigo,
        a.nombre,
        String(a.creditos),
        etiquetaElectivo(a),
        lista(a.prerrequisitos),
      ]),
      siVacia: 'Sin asignaturas ubicadas en este ciclo.',
    },
  };
}

/**
 * Asignaturas dadas de alta pero todavía sin ciclo.
 *
 * La sección solo aparece si hay alguna. Es lo contrario del criterio de los
 * ciclos vacíos, y a propósito: un ciclo vacío es información —falta contenido
 * ahí—, mientras que un apartado «sin ubicar» vacío no informa de nada.
 */
function seccionSinUbicar(datos: DatosParaDocumento): Seccion | null {
  const sueltas = activas(datos).filter((a) => a.cicloNumero === null);
  if (sueltas.length === 0) return null;

  return {
    titulo: 'Asignaturas sin ubicar en la malla',
    parrafos: ['Están registradas en el plan pero todavía no pertenecen a ningún ciclo.'],
    tabla: {
      columnas: [
        { titulo: 'Código', peso: 2 },
        { titulo: 'Asignatura', peso: 6 },
        { titulo: 'Cr.', peso: 1, alineacion: 'derecha' },
        { titulo: 'Condición', peso: 3 },
      ],
      filas: sueltas.map((a) => [a.codigo, a.nombre, String(a.creditos), etiquetaElectivo(a)]),
      siVacia: '',
    },
  };
}

/* ── RF073 — Excel de la malla ──────────────────────────────────────────── */

/**
 * Malla completa en una sola tabla.
 *
 * Una hoja de cálculo se usa para filtrar, ordenar y hacer tablas dinámicas
 * (RF073 habla de «análisis externos»), y nada de eso funciona sobre diez
 * tablas separadas con títulos entre medias. Por eso aquí el ciclo es una
 * columna más y no una sección, al revés que en el PDF.
 */
export function armarMallaParaHojaDeCalculo(datos: DatosParaDocumento): Documento {
  const filas = activas(datos)
    .slice()
    .sort(porCicloYCodigo)
    .map((a) => [
      a.cicloNumero === null ? 'Sin ubicar' : String(a.cicloNumero),
      a.codigo,
      a.nombre,
      String(a.creditos),
      String(a.horasTeoricas),
      a.tipo,
      a.condicion,
      a.grupoNombre ?? '',
      a.grupoElectivo === null ? '' : String(a.grupoElectivo.cantidadAElegir),
      a.prerrequisitos.join(', '),
      a.correquisitos.join(', '),
    ]);

  const resumen: Seccion = {
    titulo: 'Resumen por ciclo',
    tabla: {
      columnas: [
        { titulo: 'Ciclo', peso: 1 },
        { titulo: 'Asignaturas', peso: 1, alineacion: 'derecha' },
        { titulo: 'Créditos', peso: 1, alineacion: 'derecha' },
      ],
      filas: ciclos(datos).map((n) => [
        `Ciclo ${n}`,
        String(activas(datos).filter((a) => a.cicloNumero === n).length),
        String(creditosPorCiclo(activas(datos), n)),
      ]),
      // La estructura de ciclos siempre existe, así que esta tabla nunca queda
      // vacía; el texto está por si una carrera llegara con duración 0.
      siVacia: 'La carrera no declara ciclos.',
    },
  };

  return {
    nombreArchivo: `malla-${datos.plan.codigo}-v${datos.plan.version}`,
    titulo: 'Malla curricular',
    subtitulo: `${datos.carrera.nombre} · ${datos.plan.codigo} v${datos.plan.version}`,
    metadatos: [
      ...cabecera(datos),
      { etiqueta: 'Total de créditos', valor: String(calcularTotalCreditos(activas(datos))) },
    ],
    secciones: [
      {
        titulo: 'Malla curricular',
        tabla: {
          columnas: [
            { titulo: 'Ciclo', peso: 1 },
            { titulo: 'Código', peso: 2 },
            { titulo: 'Asignatura', peso: 5 },
            { titulo: 'Créditos', peso: 1, alineacion: 'derecha' },
            { titulo: 'Horas teóricas', peso: 1, alineacion: 'derecha' },
            { titulo: 'Tipo', peso: 2 },
            { titulo: 'Condición', peso: 2 },
            { titulo: 'Grupo de electivos', peso: 3 },
            { titulo: 'Elegir', peso: 1, alineacion: 'derecha' },
            { titulo: 'Prerrequisitos', peso: 3 },
            { titulo: 'Correquisitos', peso: 3 },
          ],
          filas,
          // RF073: sin asignaturas se entrega igual, con la estructura de
          // ciclos, que es lo que la hoja «Resumen por ciclo» ya contiene.
          siVacia: 'El plan no tiene asignaturas registradas.',
        },
      },
      resumen,
    ],
    pie: pie(datos),
  };
}

function porCicloYCodigo(x: AsignaturaParaDocumento, y: AsignaturaParaDocumento): number {
  // Las que no tienen ciclo van al final y no al principio: un `null` ordenado
  // como cero pondría lo que falta por ubicar antes del primer ciclo.
  const cx = x.cicloNumero ?? Number.MAX_SAFE_INTEGER;
  const cy = y.cicloNumero ?? Number.MAX_SAFE_INTEGER;
  return cx === cy ? x.codigo.localeCompare(y.codigo, 'es') : cx - cy;
}

/* ── RF092 — Evidencia de aprobación ────────────────────────────────────── */

/**
 * Evidencia documental de la aprobación, para el expediente de acreditación.
 *
 * RF092 anota que «el formato oficial del documento debe ser definido por la
 * universidad». Mientras tanto, lo que este documento sí garantiza es que
 * ningún dato esté inventado: cada línea del flujo sale de la tabla de eventos
 * de aprobación, con el responsable y la fecha que se registraron entonces.
 */
export function armarEvidenciaDeAprobacion(datos: DatosParaDocumento): Documento {
  const tabla: Tabla = {
    columnas: [
      { titulo: 'Fecha', peso: 2 },
      { titulo: 'Acción', peso: 2 },
      { titulo: 'Responsable', peso: 3 },
      { titulo: 'Comentario', peso: 5 },
    ],
    // Del más antiguo al más reciente: una evidencia se lee como un relato del
    // recorrido, y el repositorio los devuelve al revés para la pantalla.
    filas: [...datos.aprobaciones]
      .sort((x, y) => x.fecha.getTime() - y.fecha.getTime())
      .map((e) => [fechaYHoraLegible(e.fecha), e.accion, e.usuarioNombre, e.comentario ?? '—']),
    siVacia: 'No hay pasos de aprobación registrados para este plan.',
  };

  return {
    nombreArchivo: `evidencia-aprobacion-${datos.plan.codigo}-v${datos.plan.version}`,
    titulo: 'Evidencia de aprobación',
    subtitulo: `${datos.carrera.nombre} · ${datos.plan.codigo} v${datos.plan.version}`,
    metadatos: [
      ...cabecera(datos),
      { etiqueta: 'Total de créditos', valor: String(calcularTotalCreditos(activas(datos))) },
      { etiqueta: 'Asignaturas', valor: String(activas(datos).length) },
    ],
    secciones: [
      {
        titulo: 'Flujo de aprobación',
        parrafos: [
          'Detalle cronológico de las transiciones de estado registradas sobre ' +
            'este plan, con el responsable de cada una.',
        ],
        tabla,
      },
      seccionObjetivos(datos),
      seccionCompetencias(datos),
    ],
    pie: pie(datos),
  };
}

/* ── RF084 — Histórico de cambios ───────────────────────────────────────── */

/**
 * Histórico de cambios del plan, para auditoría externa.
 *
 * RF084 dice que si no hay cambios registrados el sistema informe de que no hay
 * datos. Eso se decide antes, en el caso de uso: aquí no se llega. La tabla
 * conserva igualmente su texto de vacío, porque una función pura que devuelve
 * un documento roto cuando la llaman mal es peor que una que devuelve uno
 * honesto.
 */
export function armarHistoricoDeCambios(datos: DatosParaDocumento): Documento {
  return {
    nombreArchivo: `historico-${datos.plan.codigo}-v${datos.plan.version}`,
    titulo: 'Histórico de cambios',
    subtitulo: `${datos.carrera.nombre} · ${datos.plan.codigo} v${datos.plan.version}`,
    metadatos: cabecera(datos),
    secciones: [
      {
        titulo: 'Cambios registrados',
        tabla: {
          columnas: [
            { titulo: 'Fecha', peso: 2 },
            { titulo: 'Acción', peso: 2 },
            { titulo: 'Responsable', peso: 3 },
            { titulo: 'Comentario', peso: 5 },
          ],
          filas: [...datos.aprobaciones]
            .sort((x, y) => x.fecha.getTime() - y.fecha.getTime())
            .map((e) => [
              fechaYHoraLegible(e.fecha),
              e.accion,
              e.usuarioNombre,
              e.comentario ?? '—',
            ]),
          siVacia: 'No hay cambios registrados para este plan.',
        },
      },
    ],
    pie: pie(datos),
  };
}
