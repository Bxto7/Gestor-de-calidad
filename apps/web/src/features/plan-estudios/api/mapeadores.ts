/**
 * Traducción entre lo que devuelve la API y el modelo de dominio del frontend.
 *
 * No son el mismo vocabulario, y es correcto que no lo sean. La API responde
 * `activa: true`; el dominio del frontend dice `estado: 'Activo'`, que es lo que
 * se pinta en un badge y lo que aparece en los requisitos. La API devuelve las
 * competencias de una asignatura como objetos completos; la pantalla solo
 * necesita sus identificadores para marcar casillas.
 *
 * Traducir aquí, en un único sitio, tiene dos consecuencias buenas: los
 * componentes y sus pruebas no se enteraron del cambio de mock a HTTP, y si
 * mañana la API cambia una forma, se arregla en este archivo y no en veinte.
 *
 * Las fechas llegan como cadena ISO —JSON no tiene tipo fecha— y así se
 * conservan: el dominio del frontend las declara `string` porque lo único que
 * hace con ellas es ordenarlas y mostrarlas.
 */

import type {
  Asignatura,
  Carrera,
  Competencia,
  CondicionAsignatura,
  EstadoActivacion,
  EstadoPlan,
  EventoAprobacion,
  EventoAuditoria,
  Facultad,
  ObjetivoEducacional,
  PlanEstudios,
  TipoAsignatura,
} from '../domain/tipos';

/* ── Formas que devuelve la API ───────────────────────────────────────── */

export interface FacultadApi {
  id: string;
  nombre: string;
  activa: boolean;
  creadoEn: string;
  totalCarreras: number;
}

export interface CarreraApi {
  id: string;
  facultadId: string;
  nombre: string;
  codigo: string;
  duracionAnios: number;
  activa: boolean;
  creadoEn: string;
}

export interface ObjetivoApi {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  planesVinculados: number;
  creadoEn: string;
}

export interface CompetenciaApi {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  planesVinculados: number;
  asignaturasVinculadas: number;
  creadoEn: string;
}

export interface AsignaturaApi {
  id: string;
  planId: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: TipoAsignatura;
  condicion: CondicionAsignatura;
  creditos: number;
  horasTeoricas: number;
  cicloNumero: number | null;
  orden: number;
  activa: boolean;
  competencias: { id: string; codigo: string; nombre: string }[];
  grupoElectivo: { codigo: string; nombre: string; cantidadAElegir: number } | null;
  creadoEn: string;
}

/** Lo que devuelve `GET /planes` para cada fila. */
export interface ResumenPlanApi {
  id: string;
  carreraId: string;
  codigo: string;
  version: number;
  estado: EstadoPlan;
  duracionAnios: number;
  fechaVigencia: string | null;
  derivadoDeId: string | null;
}

/** Lo que devuelve `GET /planes/:id`: el resumen más lo que solo se calcula ahí. */
export interface DetallePlanApi extends ResumenPlanApi {
  objetivoIds: string[];
  competenciaIds: string[];
  esEditable: boolean;
  admiteNuevaVersion: boolean;
  validacion: {
    totalCreditos: number;
    tieneBloqueos: boolean;
    bloqueantes: { codigo: string; mensaje: string; afectados: string[] }[];
    advertencias: { codigo: string; mensaje: string; afectados: string[] }[];
  };
  accionesDisponibles: {
    accion: string;
    etiqueta: string;
    habilitada: boolean;
    motivo: string | null;
  }[];
}

export interface EventoAuditoriaApi {
  id: string;
  entidad: EventoAuditoria['entidad'];
  entidadId: string;
  accion: string;
  detalle: string;
  usuarioId: string;
  usuarioNombre: string;
  fecha: string;
}

export interface EventoAprobacionApi {
  id: string;
  planId: string;
  accion: string;
  comentario: string | null;
  usuarioNombre: string;
  fecha: string;
}

/* ── Traducciones ─────────────────────────────────────────────────────── */

/**
 * El booleano de la API al vocabulario del dominio.
 *
 * La API usa un booleano porque en la base es un enumerado de dos valores y
 * `activa` se lee bien en una condición. El dominio del frontend usa la palabra
 * porque es lo que se muestra y lo que dicen los requisitos.
 */
function aEstado(activa: boolean): EstadoActivacion {
  return activa ? 'Activo' : 'Inactivo';
}

export function aFacultad(f: FacultadApi): Facultad {
  return { id: f.id, nombre: f.nombre, estado: aEstado(f.activa), creadoEn: f.creadoEn };
}

export function aCarrera(c: CarreraApi): Carrera {
  return {
    id: c.id,
    facultadId: c.facultadId,
    nombre: c.nombre,
    codigo: c.codigo,
    duracionAnios: c.duracionAnios,
    estado: aEstado(c.activa),
    creadoEn: c.creadoEn,
  };
}

export function aObjetivo(o: ObjetivoApi): ObjetivoEducacional {
  return {
    id: o.id,
    codigo: o.codigo,
    nombre: o.nombre,
    descripcion: o.descripcion,
    estado: aEstado(o.activo),
  };
}

export function aCompetencia(c: CompetenciaApi): Competencia {
  return { id: c.id, codigo: c.codigo, nombre: c.nombre, estado: aEstado(c.activa) };
}

export function aAsignatura(a: AsignaturaApi): Asignatura {
  return {
    id: a.id,
    planId: a.planId,
    codigo: a.codigo,
    nombre: a.nombre,
    descripcion: a.descripcion,
    tipo: a.tipo,
    condicion: a.condicion,
    creditos: a.creditos,
    horasTeoricas: a.horasTeoricas,
    // La API devuelve las competencias enteras porque la ficha las muestra con
    // su código; el modelo del frontend guarda solo los identificadores, que es
    // lo que necesitan las casillas del formulario.
    competenciaIds: a.competencias.map((c) => c.id),
    cicloNumero: a.cicloNumero,
    orden: a.orden,
    grupoElectivo: a.grupoElectivo,
    estado: aEstado(a.activa),
  };
}

/**
 * Un plan del listado.
 *
 * `GET /planes` no trae objetivos ni competencias asociados —serían dos
 * consultas más por fila, para un dato que el listado no muestra—, así que
 * llegan vacíos. La pantalla que los necesita abre el detalle, que sí los trae.
 */
export function aPlanResumen(p: ResumenPlanApi): PlanEstudios {
  return {
    id: p.id,
    carreraId: p.carreraId,
    codigo: p.codigo,
    version: p.version,
    estado: p.estado,
    duracionAnios: p.duracionAnios,
    fechaVigencia: p.fechaVigencia,
    objetivoIds: [],
    competenciaIds: [],
    derivadoDe: p.derivadoDeId,
    // El listado no devuelve la fecha de creación: ordena por ella en el
    // servidor y la pantalla no la muestra.
    creadoEn: '',
  };
}

export function aPlanDetalle(p: DetallePlanApi): PlanEstudios {
  return {
    ...aPlanResumen(p),
    objetivoIds: p.objetivoIds,
    competenciaIds: p.competenciaIds,
  };
}

export function aEventoAuditoria(e: EventoAuditoriaApi): EventoAuditoria {
  return {
    id: e.id,
    entidad: e.entidad,
    entidadId: e.entidadId,
    accion: e.accion,
    detalle: e.detalle,
    // El dominio del frontend guarda el nombre, no el identificador: es lo que
    // se muestra, y el histórico debe seguir siendo legible aunque el usuario
    // ya no exista.
    usuario: e.usuarioNombre,
    fecha: e.fecha,
  };
}

/**
 * Un paso del flujo de aprobación.
 *
 * La API devuelve `accion` como texto libre; el dominio del frontend lo tiene
 * como lista cerrada para poder pintar cada paso con su color. Lo que no
 * encaje se deja pasar tal cual: inventar un valor de la lista falsearía el
 * histórico, y este dato es evidencia de acreditación.
 */
export function aEventoAprobacion(e: EventoAprobacionApi): EventoAprobacion {
  return {
    id: e.id,
    planId: e.planId,
    accion: e.accion as EventoAprobacion['accion'],
    comentario: e.comentario,
    usuario: e.usuarioNombre,
    fecha: e.fecha,
  };
}
