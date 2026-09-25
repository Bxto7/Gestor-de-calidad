/**
 * Arma el listado «mis evaluaciones» del docente a partir de lo ya leído.
 *
 * Dominio puro: resuelve nombres, marca qué evidencias son del actor, decide si
 * aún admite más y ordena. La respuesta llega ordenada; el frontend no ordena.
 */

/** Tope de evidencias por evaluación, el mismo que el del coordinador (ArrayMaxSize del DTO). */
export const MAXIMO_EVIDENCIAS = 20;

export interface EvidenciaLeida {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
  readonly registradaPorId: string | null;
}

export interface EvaluacionAsignada {
  /** `AsignaturaEvaluada.id`. */
  readonly id: string;
  readonly asignaturaId: string;
  readonly competenciaId: string;
  readonly entregable: string;
  readonly periodo: {
    readonly id: string;
    readonly etiqueta: string;
    readonly fechaCierre: Date | null;
  };
  readonly planEvaluacion: { readonly id: string; readonly codigo: string };
  readonly evidencias: readonly EvidenciaLeida[];
}

export interface NombreDe {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface EntradaMisEvaluaciones {
  readonly actorId: string;
  readonly evaluaciones: readonly EvaluacionAsignada[];
  readonly asignaturas: ReadonlyMap<string, NombreDe>;
  readonly competencias: ReadonlyMap<string, NombreDe>;
}

export interface EvidenciaVista {
  readonly id: string;
  readonly enlace: string;
  readonly descripcion: string;
  readonly propia: boolean;
}

export interface EvaluacionVista {
  readonly id: string;
  readonly asignatura: NombreDe;
  readonly competencia: NombreDe;
  readonly entregable: string;
  /** `fechaCierre` como `AAAA-MM-DD`, o nula si el periodo no tiene. */
  readonly periodo: {
    readonly id: string;
    readonly etiqueta: string;
    readonly fechaCierre: string | null;
  };
  readonly planEvaluacion: { readonly id: string; readonly codigo: string };
  readonly evidencias: readonly EvidenciaVista[];
  readonly puedeAgregar: boolean;
}

export interface MisEvaluaciones {
  readonly evaluaciones: readonly EvaluacionVista[];
}

// Lo que ya no está en el plan se sigue mostrando: ocultarlo dejaría al docente
// sin poder ver una evaluación que sí tiene asignada.
const asignaturaDesconocida = (id: string): NombreDe => ({
  id,
  codigo: '—',
  nombre: 'Asignatura que ya no está en el plan',
});
const competenciaDesconocida = (id: string): NombreDe => ({
  id,
  codigo: '—',
  nombre: 'Competencia que ya no está en el plan',
});

const fechaIso = (fecha: Date | null): string | null =>
  fecha ? fecha.toISOString().slice(0, 10) : null;

// Sin fecha de cierre va al final: no hay plazo que vigilar.
const marcaDeFecha = (fecha: Date | null): number =>
  fecha ? fecha.getTime() : Number.POSITIVE_INFINITY;

export function armarMisEvaluaciones(entrada: EntradaMisEvaluaciones): MisEvaluaciones {
  const vistas = entrada.evaluaciones.map((e) => ({
    origen: e,
    vista: {
      id: e.id,
      asignatura: entrada.asignaturas.get(e.asignaturaId) ?? asignaturaDesconocida(e.asignaturaId),
      competencia:
        entrada.competencias.get(e.competenciaId) ?? competenciaDesconocida(e.competenciaId),
      entregable: e.entregable,
      periodo: {
        id: e.periodo.id,
        etiqueta: e.periodo.etiqueta,
        fechaCierre: fechaIso(e.periodo.fechaCierre),
      },
      planEvaluacion: e.planEvaluacion,
      evidencias: e.evidencias.map((x) => ({
        id: x.id,
        enlace: x.enlace,
        descripcion: x.descripcion,
        propia: x.registradaPorId === entrada.actorId,
      })),
      puedeAgregar: e.evidencias.length < MAXIMO_EVIDENCIAS,
    } satisfies EvaluacionVista,
  }));

  vistas.sort(
    (a, b) =>
      a.vista.asignatura.codigo.localeCompare(b.vista.asignatura.codigo) ||
      // Las desconocidas comparten código «—»: sin esto sus grupos se intercalan por fecha.
      a.vista.asignatura.id.localeCompare(b.vista.asignatura.id) ||
      marcaDeFecha(a.origen.periodo.fechaCierre) - marcaDeFecha(b.origen.periodo.fechaCierre) ||
      a.vista.competencia.codigo.localeCompare(b.vista.competencia.codigo) ||
      a.vista.id.localeCompare(b.vista.id),
  );

  return { evaluaciones: vistas.map((v) => v.vista) };
}
