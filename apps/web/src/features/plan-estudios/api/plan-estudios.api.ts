/**
 * Cliente de datos del módulo Plan de Estudios.
 *
 * Cada función habla con la API REST de NestJS y devuelve el modelo de dominio
 * del frontend. Las firmas son exactamente las que tenía la versión contra el
 * almacén en memoria: por eso los hooks, los componentes y sus pruebas no
 * cambiaron al hacer la conexión. Esa era la promesa de esta frontera y se
 * cumplió.
 *
 * **Las reglas de negocio ya no se validan aquí.** Cuando los datos vivían en
 * memoria, este archivo tenía que reimponer unicidad, integridad referencial y
 * transiciones de estado, porque no había nadie más que lo hiciera. Ahora sí lo
 * hay: el backend las aplica, y duplicarlas en el navegador solo garantizaría
 * que las dos copias se separen con el tiempo. Lo que llega de vuelta es un
 * `ErrorDeNegocio` con el mensaje del servidor, que es el que la UI muestra.
 *
 * Lo que sí queda del lado del navegador es la validación de formulario —campos
 * obligatorios, formatos— porque ahí su valor es no hacer un viaje en vano, no
 * decidir.
 */

import { cliente } from '../../../shared/api/cliente';
import type {
  Asignatura,
  Carrera,
  Competencia,
  EventoAprobacion,
  EventoAuditoria,
  Facultad,
  ObjetivoEducacional,
  PlanEstudios,
} from '../domain/tipos';
import type { AccionTransicion } from '../domain/estado-plan';
import {
  aAsignatura,
  aCarrera,
  aCompetencia,
  aEventoAprobacion,
  aEventoAuditoria,
  aFacultad,
  aObjetivo,
  aPlanDetalle,
  aPlanResumen,
  type AsignaturaApi,
  type CarreraApi,
  type CompetenciaApi,
  type DetallePlanApi,
  type EventoAprobacionApi,
  type EventoAuditoriaApi,
  type FacultadApi,
  type ObjetivoApi,
  type ResumenPlanApi,
} from './mapeadores';

/* ── Facultades (RF001-RF008) ─────────────────────────────────────────── */

export async function listarFacultades(): Promise<Facultad[]> {
  return (await cliente.get<FacultadApi[]>('/facultades')).map(aFacultad);
}

export async function crearFacultad(nombre: string): Promise<Facultad> {
  return aFacultad(await cliente.post<FacultadApi>('/facultades', { nombre }));
}

export async function editarFacultad(id: string, nombre: string): Promise<Facultad> {
  return aFacultad(await cliente.patch<FacultadApi>(`/facultades/${id}`, { nombre }));
}

/**
 * RF005 — alterna el estado.
 *
 * Se llama `inactivar` por continuidad con la UI, pero reactiva igual: el
 * endpoint recibe el estado deseado. Quien llama ya sabe en cuál está.
 */
export async function inactivarFacultad(id: string, activa = false): Promise<Facultad> {
  return aFacultad(await cliente.patch<FacultadApi>(`/facultades/${id}/estado`, { activa }));
}

export async function impactoInactivarFacultad(id: string): Promise<{
  carreras: number;
  planesVigentes: number;
}> {
  return cliente.get(`/facultades/${id}/impacto-inactivacion`);
}

/* ── Carreras (RF009-RF019) ───────────────────────────────────────────── */

export interface DatosCarrera {
  nombre: string;
  codigo: string;
  duracionAnios: number;
}

export async function listarCarreras(facultadId?: string): Promise<Carrera[]> {
  const filas = facultadId
    ? await cliente.get<CarreraApi[]>(`/facultades/${facultadId}/carreras`)
    : await cliente.get<CarreraApi[]>('/carreras');
  return filas.map(aCarrera);
}

export async function crearCarrera(facultadId: string, datos: DatosCarrera): Promise<Carrera> {
  return aCarrera(await cliente.post<CarreraApi>(`/facultades/${facultadId}/carreras`, datos));
}

export async function editarCarrera(id: string, datos: DatosCarrera): Promise<Carrera> {
  return aCarrera(await cliente.patch<CarreraApi>(`/carreras/${id}`, datos));
}

export async function inactivarCarrera(id: string, activa = false): Promise<Carrera> {
  return aCarrera(await cliente.patch<CarreraApi>(`/carreras/${id}/estado`, { activa }));
}

/* ── Planes de estudio (RF020-RF032) ──────────────────────────────────── */

export async function listarPlanes(filtros?: {
  carreraId?: string;
  estado?: string;
}): Promise<PlanEstudios[]> {
  const filas = await cliente.get<ResumenPlanApi[]>('/planes', {
    carreraId: filtros?.carreraId,
    estado: filtros?.estado,
  });
  return filas.map(aPlanResumen);
}

export async function obtenerPlan(id: string): Promise<PlanEstudios> {
  return aPlanDetalle(await cliente.get<DetallePlanApi>(`/planes/${id}`));
}

/**
 * El detalle completo, con validación y acciones disponibles.
 *
 * `obtenerPlan` devuelve solo el plan porque es lo que esperan los hooks
 * existentes. Esta función expone lo demás: qué inconsistencias tiene (RF097) y
 * qué transiciones puede ejecutar **este** usuario sobre él, calculado en el
 * servidor. Es lo que evita que la UI vuelva a implementar la máquina de
 * estados y el RBAC para decidir qué botón habilitar.
 */
export async function obtenerDetallePlan(id: string): Promise<DetallePlanApi> {
  return cliente.get<DetallePlanApi>(`/planes/${id}`);
}

export async function crearPlan(carreraId: string): Promise<PlanEstudios> {
  return aPlanResumen(await cliente.post<ResumenPlanApi>('/planes', { carreraId }));
}

export async function editarPlan(
  id: string,
  cambios: { duracionAnios?: number; fechaVigencia?: string | null },
): Promise<PlanEstudios> {
  return aPlanResumen(await cliente.patch<ResumenPlanApi>(`/planes/${id}`, cambios));
}

/** RF028 / RF029: cada lista enviada reemplaza por completo a la anterior. */
export async function asociarAlPlan(
  id: string,
  cambios: { objetivoIds?: string[]; competenciaIds?: string[] },
): Promise<PlanEstudios> {
  return aPlanResumen(await cliente.put<ResumenPlanApi>(`/planes/${id}/asociaciones`, cambios));
}

export async function eliminarPlan(id: string): Promise<void> {
  await cliente.delete(`/planes/${id}`);
}

/**
 * RF026 — ejecuta una transición de estado.
 *
 * `tieneBloqueos` ya no viaja: el servidor recalcula las validaciones antes de
 * transicionar, porque un cliente podría mandar `false` y saltarse RF097. La
 * firma lo conserva para no tocar a quien llama, y se ignora a propósito.
 */
export async function cambiarEstadoPlan(
  id: string,
  accion: AccionTransicion,
  contexto: { tieneBloqueos: boolean; comentario?: string | undefined },
): Promise<PlanEstudios> {
  const respuesta = await cliente.post<{ plan: ResumenPlanApi } | ResumenPlanApi>(
    `/planes/${id}/transiciones`,
    { accion, ...(contexto.comentario ? { comentario: contexto.comentario } : {}) },
  );
  return aPlanResumen('plan' in respuesta ? respuesta.plan : respuesta);
}

/** RF075: nueva versión a partir de la vigente. */
export async function generarNuevaVersion(idOrigen: string): Promise<PlanEstudios> {
  return aPlanResumen(await cliente.post<ResumenPlanApi>(`/planes/${idOrigen}/versiones`));
}

/** RF076 / RF091: todas las versiones de la carrera, de la más nueva a la más antigua. */
export async function listarVersiones(carreraId: string): Promise<PlanEstudios[]> {
  const filas = await cliente.get<ResumenPlanApi[]>(`/carreras/${carreraId}/versiones`);
  return filas.map(aPlanResumen);
}

/* ── Histórico y evidencia (RF078, RF089, RF092, RF099) ───────────────── */

export async function listarAuditoria(
  entidad: EventoAuditoria['entidad'],
  entidadId: string,
): Promise<EventoAuditoria[]> {
  const filas = await cliente.get<EventoAuditoriaApi[]>('/auditoria', { entidad, entidadId });
  return filas.map(aEventoAuditoria);
}

/** RF089: historial del flujo de aprobación. */
export async function listarAprobaciones(planId: string): Promise<EventoAprobacion[]> {
  const filas = await cliente.get<EventoAprobacionApi[]>(`/planes/${planId}/aprobaciones`);
  return filas.map(aEventoAprobacion);
}

/** RF099: justificar una advertencia no bloqueante. */
export async function justificarRegla(
  planId: string,
  codigoRegla: string,
  motivo: string,
): Promise<void> {
  await cliente.post(`/planes/${planId}/justificaciones`, { codigoRegla, motivo });
}

export async function listarJustificaciones(planId: string): Promise<string[]> {
  return cliente.get<string[]>(`/planes/${planId}/justificaciones`);
}

export interface DiferenciaAsignatura {
  codigo: string;
  nombre: string;
  cambio: 'agregada' | 'retirada' | 'modificada';
  detalle: string;
}

/**
 * RF092 — compara dos versiones del mismo plan.
 *
 * El emparejamiento por nombre lo hace el servidor, que es donde están las dos
 * mallas completas. Traerlas al navegador para compararlas ahí significaría
 * descargar dos planes enteros para mostrar una lista de diferencias.
 */
export async function compararVersiones(idA: string, idB: string): Promise<DiferenciaAsignatura[]> {
  return cliente.get<DiferenciaAsignatura[]>('/planes/comparar', { a: idA, b: idB });
}

/* ── Objetivos educacionales (RF033-RF039) ────────────────────────────── */

export async function listarObjetivos(): Promise<ObjetivoEducacional[]> {
  return (await cliente.get<ObjetivoApi[]>('/objetivos')).map(aObjetivo);
}

export async function crearObjetivo(
  nombre: string,
  descripcion: string,
): Promise<ObjetivoEducacional> {
  return aObjetivo(await cliente.post<ObjetivoApi>('/objetivos', { nombre, descripcion }));
}

export async function editarObjetivo(
  id: string,
  nombre: string,
  descripcion: string,
): Promise<ObjetivoEducacional> {
  return aObjetivo(await cliente.patch<ObjetivoApi>(`/objetivos/${id}`, { nombre, descripcion }));
}

export async function inactivarObjetivo(id: string, activo = false): Promise<ObjetivoEducacional> {
  return aObjetivo(await cliente.patch<ObjetivoApi>(`/objetivos/${id}/estado`, { activo }));
}

/** RF038: solo si no lo usa ningún plan. El servidor lo comprueba. */
export async function eliminarObjetivo(id: string): Promise<void> {
  await cliente.delete(`/objetivos/${id}`);
}

/* ── Competencias (RF040-RF046) ───────────────────────────────────────── */

export async function listarCompetencias(): Promise<Competencia[]> {
  return (await cliente.get<CompetenciaApi[]>('/competencias')).map(aCompetencia);
}

export async function crearCompetencia(nombre: string): Promise<Competencia> {
  return aCompetencia(await cliente.post<CompetenciaApi>('/competencias', { nombre }));
}

export async function editarCompetencia(id: string, nombre: string): Promise<Competencia> {
  return aCompetencia(await cliente.patch<CompetenciaApi>(`/competencias/${id}`, { nombre }));
}

export async function inactivarCompetencia(id: string, activo = false): Promise<Competencia> {
  return aCompetencia(
    await cliente.patch<CompetenciaApi>(`/competencias/${id}/estado`, { activo }),
  );
}

/** RF045: solo si no la usa ninguna asignatura ni ningún plan. */
export async function eliminarCompetencia(id: string): Promise<void> {
  await cliente.delete(`/competencias/${id}`);
}

/* ── Asignaturas (RF047-RF059) ────────────────────────────────────────── */

export interface DatosAsignatura {
  nombre: string;
  descripcion: string;
  tipo: Asignatura['tipo'];
  condicion: Asignatura['condicion'];
  creditos: number;
  horasTeoricas: number;
  competenciaIds: string[];
}

export async function listarAsignaturas(planId: string): Promise<Asignatura[]> {
  const filas = await cliente.get<AsignaturaApi[]>(`/planes/${planId}/asignaturas`);
  return filas.map(aAsignatura);
}

export async function crearAsignatura(planId: string, datos: DatosAsignatura): Promise<Asignatura> {
  return aAsignatura(await cliente.post<AsignaturaApi>(`/planes/${planId}/asignaturas`, datos));
}

export async function editarAsignatura(id: string, datos: DatosAsignatura): Promise<Asignatura> {
  return aAsignatura(await cliente.patch<AsignaturaApi>(`/asignaturas/${id}`, datos));
}

export async function inactivarAsignatura(id: string, activa = false): Promise<Asignatura> {
  return aAsignatura(await cliente.patch<AsignaturaApi>(`/asignaturas/${id}/estado`, { activa }));
}

/** RF052: a qué afecta inactivarla, para poder avisar antes de confirmar. */
export async function impactoInactivarAsignatura(id: string): Promise<{
  dependientes: string[];
  cicloNumero: number | null;
}> {
  return cliente.get(`/asignaturas/${id}/impacto-inactivacion`);
}

/* ── Malla curricular (RF061-RF071) ───────────────────────────────────── */

/**
 * RF061 / RF062 / RF070: coloca, mueve o retira una asignatura de la malla.
 *
 * Las tres son la misma escritura —fijar el ciclo a un número o a `null`— y por
 * eso son un único endpoint. La respuesta trae los contadores que la pantalla
 * necesita para refrescar sin recargar el plan entero.
 */
export async function ubicarAsignatura(
  asignaturaId: string,
  cicloNumero: number | null,
  orden?: number,
): Promise<{
  asignaturaId: string;
  codigo: string;
  cicloAnterior: number | null;
  cicloNuevo: number | null;
  asignaturasSinCiclo: number;
  creditosDelCiclo: number;
}> {
  return cliente.patch(`/asignaturas/${asignaturaId}/ubicacion`, {
    cicloNumero,
    ...(orden === undefined ? {} : { orden }),
  });
}
