/**
 * Cliente de datos del módulo. Hoy resuelve contra el almacén en memoria; cada
 * función tiene la firma que tendría contra la API REST de NestJS, así que
 * migrar es cambiar el cuerpo por un `fetch` sin tocar hooks ni componentes.
 *
 * Las reglas de negocio que el backend deberá reimponer (unicidad, integridad
 * referencial, transiciones de estado) se validan también aquí: la UI no debe
 * dejar guardar algo que el servidor rechazaría.
 */

import {
  codigoPlan,
  existeNombreDuplicado,
  normalizarParaUnicidad,
  siguienteCodigoAsignatura,
  siguienteCodigoCompetencia,
  siguienteCodigoObjetivo,
} from '../domain/codigos';
import { intentarTransicion, permiteEdicion, type AccionTransicion } from '../domain/estado-plan';
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
import {
  ErrorDeNegocio,
  USUARIO_ACTUAL,
  ahora,
  clonar,
  db,
  demora,
  nuevoId,
  registrarAuditoria,
} from './almacen-mock';

/* ── Facultades (RF001-RF008) ─────────────────────────────────────────── */

export async function listarFacultades(): Promise<Facultad[]> {
  // RF003 RN1: ordenado alfabéticamente por defecto.
  const orden = [...db.facultades].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  return demora(clonar(orden));
}

export async function crearFacultad(nombre: string): Promise<Facultad> {
  const limpio = nombre.trim();
  if (!limpio) throw new ErrorDeNegocio('El nombre de la facultad es obligatorio.');
  // RF006: unicidad sin distinguir mayúsculas ni espacios.
  if (existeNombreDuplicado(limpio, db.facultades)) {
    throw new ErrorDeNegocio('Ya existe una facultad con ese nombre.');
  }

  // RF001 RN2: toda facultad nace Activa.
  const facultad: Facultad = { id: nuevoId(), nombre: limpio, estado: 'Activo', creadoEn: ahora() };
  db.facultades.push(facultad);
  registrarAuditoria('Facultad', facultad.id, 'Creación', `Facultad "${limpio}" registrada.`);
  return demora(clonar(facultad));
}

export async function editarFacultad(id: string, nombre: string): Promise<Facultad> {
  const facultad = db.facultades.find((f) => f.id === id);
  if (!facultad) throw new ErrorDeNegocio('La facultad no existe.');

  const limpio = nombre.trim();
  if (!limpio) throw new ErrorDeNegocio('No se permite dejar el nombre vacío.');
  if (existeNombreDuplicado(limpio, db.facultades, id)) {
    throw new ErrorDeNegocio('Ya existe otra facultad con ese nombre.');
  }

  const anterior = facultad.nombre;
  facultad.nombre = limpio;
  // RF002 RN2: el cambio queda en el histórico.
  registrarAuditoria('Facultad', id, 'Edición', `Nombre: "${anterior}" → "${limpio}".`);
  return demora(clonar(facultad));
}

export async function inactivarFacultad(id: string): Promise<Facultad> {
  const facultad = db.facultades.find((f) => f.id === id);
  if (!facultad) throw new ErrorDeNegocio('La facultad no existe.');

  // RF005 RN1: no se elimina físicamente.
  facultad.estado = facultad.estado === 'Activo' ? 'Inactivo' : 'Activo';
  registrarAuditoria('Facultad', id, 'Cambio de estado', `Estado: ${facultad.estado}.`);
  return demora(clonar(facultad));
}

/** RF005: advertencia previa si la facultad tiene carreras con planes vigentes. */
export async function impactoInactivarFacultad(id: string): Promise<{
  carreras: number;
  planesVigentes: number;
}> {
  const carreras = db.carreras.filter((c) => c.facultadId === id);
  const idsCarrera = new Set(carreras.map((c) => c.id));
  const planesVigentes = db.planes.filter(
    (p) => idsCarrera.has(p.carreraId) && p.estado === 'Vigente',
  ).length;
  return demora({ carreras: carreras.length, planesVigentes }, 60);
}

/* ── Carreras (RF009-RF019) ───────────────────────────────────────────── */

export async function listarCarreras(facultadId?: string): Promise<Carrera[]> {
  const filtradas = facultadId
    ? db.carreras.filter((c) => c.facultadId === facultadId)
    : db.carreras;
  const orden = [...filtradas].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  return demora(clonar(orden));
}

export interface DatosCarrera {
  nombre: string;
  codigo: string;
  duracionAnios: number;
}

export async function crearCarrera(facultadId: string, datos: DatosCarrera): Promise<Carrera> {
  const facultad = db.facultades.find((f) => f.id === facultadId);
  if (!facultad) throw new ErrorDeNegocio('La facultad no existe.');
  // RF004: una facultad inactiva no admite carreras nuevas.
  if (facultad.estado === 'Inactivo') {
    throw new ErrorDeNegocio('La facultad está inactiva y no admite nuevas carreras.');
  }

  validarDatosCarrera(datos);

  // RF015 RN1: el nombre puede repetirse entre facultades, no dentro de una.
  const hermanas = db.carreras.filter((c) => c.facultadId === facultadId);
  if (existeNombreDuplicado(datos.nombre, hermanas)) {
    throw new ErrorDeNegocio('Ya existe una carrera con ese nombre en esta facultad.');
  }
  // RF017 RN1: el código es único en toda la universidad.
  if (existeCodigoCarrera(datos.codigo)) {
    throw new ErrorDeNegocio('Ya existe una carrera con ese código en la universidad.');
  }

  const carrera: Carrera = {
    id: nuevoId(),
    facultadId,
    nombre: datos.nombre.trim(),
    codigo: datos.codigo.trim().toUpperCase(),
    duracionAnios: datos.duracionAnios,
    estado: 'Activo',
    creadoEn: ahora(),
  };
  db.carreras.push(carrera);
  registrarAuditoria('Carrera', carrera.id, 'Creación', `Carrera "${carrera.nombre}" registrada.`);
  return demora(clonar(carrera));
}

export async function editarCarrera(id: string, datos: DatosCarrera): Promise<Carrera> {
  const carrera = db.carreras.find((c) => c.id === id);
  if (!carrera) throw new ErrorDeNegocio('La carrera no existe.');

  validarDatosCarrera(datos);

  const hermanas = db.carreras.filter((c) => c.facultadId === carrera.facultadId);
  if (existeNombreDuplicado(datos.nombre, hermanas, id)) {
    throw new ErrorDeNegocio('Ya existe otra carrera con ese nombre en esta facultad.');
  }
  if (existeCodigoCarrera(datos.codigo, id)) {
    throw new ErrorDeNegocio('Ya existe otra carrera con ese código en la universidad.');
  }

  // RF012 RN1: no se puede reducir ciclos si hay asignaturas en los que desaparecerían.
  const ciclosNuevos = datos.duracionAnios * 2;
  const planesDeCarrera = new Set(db.planes.filter((p) => p.carreraId === id).map((p) => p.id));
  const afectadas = db.asignaturas.filter(
    (a) => planesDeCarrera.has(a.planId) && a.cicloNumero !== null && a.cicloNumero > ciclosNuevos,
  );
  if (afectadas.length > 0) {
    throw new ErrorDeNegocio(
      `No se puede reducir a ${ciclosNuevos} ciclos: ${afectadas.length} asignatura(s) están ubicadas en ciclos que dejarían de existir.`,
    );
  }

  carrera.nombre = datos.nombre.trim();
  carrera.codigo = datos.codigo.trim().toUpperCase();
  carrera.duracionAnios = datos.duracionAnios;
  registrarAuditoria('Carrera', id, 'Edición', `Datos generales actualizados.`);
  return demora(clonar(carrera));
}

export async function inactivarCarrera(id: string): Promise<Carrera> {
  const carrera = db.carreras.find((c) => c.id === id);
  if (!carrera) throw new ErrorDeNegocio('La carrera no existe.');
  carrera.estado = carrera.estado === 'Activo' ? 'Inactivo' : 'Activo';
  registrarAuditoria('Carrera', id, 'Cambio de estado', `Estado: ${carrera.estado}.`);
  return demora(clonar(carrera));
}

function validarDatosCarrera(datos: DatosCarrera): void {
  if (!datos.nombre.trim()) throw new ErrorDeNegocio('El nombre de la carrera es obligatorio.');
  if (!datos.codigo.trim()) throw new ErrorDeNegocio('El código de la carrera es obligatorio.');
  // RF011 RN1: entero positivo.
  if (!Number.isInteger(datos.duracionAnios) || datos.duracionAnios < 1) {
    throw new ErrorDeNegocio('La duración debe ser un número entero de años mayor a cero.');
  }
}

function existeCodigoCarrera(codigo: string, idIgnorado?: string): boolean {
  const objetivo = normalizarParaUnicidad(codigo);
  return db.carreras.some(
    (c) => c.id !== idIgnorado && normalizarParaUnicidad(c.codigo) === objetivo,
  );
}

/* ── Planes de estudio (RF020-RF032, RF075-RF093) ─────────────────────── */

export async function listarPlanes(filtros?: {
  carreraId?: string;
  estado?: string;
}): Promise<PlanEstudios[]> {
  let planes = [...db.planes];
  // RF030 / RF031 RN1: los filtros son combinables.
  if (filtros?.carreraId) planes = planes.filter((p) => p.carreraId === filtros.carreraId);
  if (filtros?.estado) planes = planes.filter((p) => p.estado === filtros.estado);
  // RF030 RN1: fecha de creación descendente.
  planes.sort((x, y) => y.creadoEn.localeCompare(x.creadoEn));
  return demora(clonar(planes));
}

export async function obtenerPlan(id: string): Promise<PlanEstudios> {
  const plan = db.planes.find((p) => p.id === id);
  if (!plan) throw new ErrorDeNegocio('El plan de estudios no existe.');
  return demora(clonar(plan));
}

export async function crearPlan(carreraId: string): Promise<PlanEstudios> {
  const carrera = db.carreras.find((c) => c.id === carreraId);
  if (!carrera) throw new ErrorDeNegocio('La carrera no existe.');
  // RF020 / RF014 RN1: sin ciclos definidos no se puede crear un plan.
  if (carrera.duracionAnios < 1) {
    throw new ErrorDeNegocio('La carrera no tiene ciclos definidos. Defínelos antes de continuar.');
  }

  const previos = db.planes.filter((p) => p.carreraId === carreraId);
  const version = previos.length === 0 ? 1 : Math.max(...previos.map((p) => p.version)) + 1;

  const plan: PlanEstudios = {
    id: nuevoId(),
    carreraId,
    // RF022: autogenerado, no editable.
    codigo: codigoPlan(carrera.codigo, new Date().getFullYear(), version),
    version,
    estado: 'Borrador', // RF020 RN1
    duracionAnios: carrera.duracionAnios,
    fechaVigencia: null,
    objetivoIds: [],
    competenciaIds: [],
    derivadoDe: null,
    creadoEn: ahora(),
  };
  db.planes.push(plan);
  registrarAuditoria('Plan', plan.id, 'Creación', `Plan ${plan.codigo} creado en Borrador.`);
  return demora(clonar(plan));
}

/** RF021 / RF023 / RF024: edición de datos generales, solo en estados editables. */
export async function editarPlan(
  id: string,
  cambios: { duracionAnios?: number; fechaVigencia?: string | null },
): Promise<PlanEstudios> {
  const plan = db.planes.find((p) => p.id === id);
  if (!plan) throw new ErrorDeNegocio('El plan de estudios no existe.');
  // RF027: bloqueo de edición fuera de Borrador / En revisión.
  if (!permiteEdicion(plan.estado)) {
    throw new ErrorDeNegocio(
      `Un plan en estado ${plan.estado} no admite edición. Genera una nueva versión para modificarlo.`,
    );
  }

  if (cambios.duracionAnios !== undefined) {
    if (!Number.isInteger(cambios.duracionAnios) || cambios.duracionAnios < 1) {
      throw new ErrorDeNegocio('La duración debe ser un número entero de años mayor a cero.');
    }
    plan.duracionAnios = cambios.duracionAnios;
  }
  if (cambios.fechaVigencia !== undefined) plan.fechaVigencia = cambios.fechaVigencia;

  registrarAuditoria('Plan', id, 'Edición', 'Datos generales del plan actualizados.');
  return demora(clonar(plan));
}

/** RF028 / RF029: asociar objetivos y competencias al plan. */
export async function asociarAlPlan(
  id: string,
  cambios: { objetivoIds?: string[]; competenciaIds?: string[] },
): Promise<PlanEstudios> {
  const plan = db.planes.find((p) => p.id === id);
  if (!plan) throw new ErrorDeNegocio('El plan de estudios no existe.');
  if (!permiteEdicion(plan.estado)) {
    throw new ErrorDeNegocio(`Un plan en estado ${plan.estado} no admite cambios.`);
  }

  if (cambios.objetivoIds) plan.objetivoIds = [...cambios.objetivoIds];
  if (cambios.competenciaIds) plan.competenciaIds = [...cambios.competenciaIds];

  registrarAuditoria('Plan', id, 'Edición', 'Objetivos y competencias del plan actualizados.');
  return demora(clonar(plan));
}

/** RF032: eliminar, solo en Borrador. */
export async function eliminarPlan(id: string): Promise<void> {
  const plan = db.planes.find((p) => p.id === id);
  if (!plan) throw new ErrorDeNegocio('El plan de estudios no existe.');
  if (plan.estado !== 'Borrador') {
    throw new ErrorDeNegocio(
      `Un plan en estado ${plan.estado} no puede eliminarse; solo puede quedar como Histórico.`,
    );
  }
  db.planes = db.planes.filter((p) => p.id !== id);
  db.asignaturas = db.asignaturas.filter((a) => a.planId !== id);
  registrarAuditoria('Plan', id, 'Eliminación', `Plan ${plan.codigo} eliminado en Borrador.`);
  await demora(null, 80);
}

/**
 * RF026 / RF085-RF087 / RF082 / RF090 - ejecuta una transición de estado.
 * El resultado del motor de validaciones llega desde fuera porque quien lo
 * calcula es la pantalla, que ya lo tiene para el banner.
 */
export async function cambiarEstadoPlan(
  id: string,
  accion: AccionTransicion,
  contexto: { tieneBloqueos: boolean; comentario?: string | undefined },
): Promise<PlanEstudios> {
  const plan = db.planes.find((p) => p.id === id);
  if (!plan) throw new ErrorDeNegocio('El plan de estudios no existe.');

  const resultado = intentarTransicion(plan.estado, accion, contexto);
  if (!resultado.ok) throw new ErrorDeNegocio(resultado.motivo);

  // RF090: una sola versión Vigente por carrera. Al marcar vigente, la anterior
  // pasa a Histórico (RF082) en la misma operación.
  if (resultado.nuevoEstado === 'Vigente') {
    for (const otro of db.planes) {
      if (otro.carreraId === plan.carreraId && otro.id !== plan.id && otro.estado === 'Vigente') {
        otro.estado = 'Histórico';
        registrarAuditoria(
          'Plan',
          otro.id,
          'Cambio de estado',
          `Pasa a Histórico al entrar en vigencia ${plan.codigo}.`,
        );
      }
    }
    // RF023 RN1: la vigencia se activa recién aquí.
    plan.fechaVigencia = plan.fechaVigencia ?? ahora();
  }

  const anterior = plan.estado;
  plan.estado = resultado.nuevoEstado;

  const etiquetaAprobacion: Record<AccionTransicion, EventoAprobacion['accion'] | null> = {
    'enviar-a-revision': 'Enviado a revisión',
    aprobar: 'Aprobado',
    observar: 'Observado',
    'marcar-vigente': 'Marcado vigente',
    archivar: null,
  };

  const etiqueta = etiquetaAprobacion[accion];
  const comentarioLimpio = contexto.comentario?.trim() ?? '';
  if (etiqueta) {
    // RF088 / RF089: responsable y fecha, en un historial de solo lectura.
    db.aprobaciones.unshift({
      id: nuevoId(),
      planId: id,
      accion: etiqueta,
      // Un comentario en blanco se guarda como null, no como cadena vacia:
      // por eso no sirve `??`, que conservaria el "".
      comentario: comentarioLimpio === '' ? null : comentarioLimpio,
      usuario: USUARIO_ACTUAL,
      fecha: ahora(),
    });
  }

  // RF026 RN2: todo cambio de estado se registra con usuario y fecha.
  registrarAuditoria('Plan', id, 'Cambio de estado', `${anterior} → ${plan.estado}.`);
  return demora(clonar(plan));
}

/** RF075: nueva versión a partir de un plan consolidado, copiando su malla. */
export async function generarNuevaVersion(idOrigen: string): Promise<PlanEstudios> {
  const origen = db.planes.find((p) => p.id === idOrigen);
  if (!origen) throw new ErrorDeNegocio('El plan de origen no existe.');

  const carrera = db.carreras.find((c) => c.id === origen.carreraId);
  if (!carrera) throw new ErrorDeNegocio('La carrera del plan no existe.');

  const enCurso = db.planes.find(
    (p) =>
      p.carreraId === origen.carreraId && (p.estado === 'Borrador' || p.estado === 'En revisión'),
  );
  if (enCurso) {
    throw new ErrorDeNegocio(
      `Ya existe la versión ${enCurso.codigo} en estado ${enCurso.estado} para esta carrera. Ciérrala antes de generar otra.`,
    );
  }

  const version =
    Math.max(...db.planes.filter((p) => p.carreraId === origen.carreraId).map((p) => p.version)) +
    1;

  const nuevo: PlanEstudios = {
    id: nuevoId(),
    carreraId: origen.carreraId,
    codigo: codigoPlan(carrera.codigo, new Date().getFullYear(), version),
    version,
    estado: 'Borrador',
    duracionAnios: origen.duracionAnios,
    fechaVigencia: null,
    objetivoIds: [...origen.objetivoIds],
    competenciaIds: [...origen.competenciaIds],
    derivadoDe: origen.id,
    creadoEn: ahora(),
  };
  db.planes.push(nuevo);

  // La malla se copia: una versión nueva parte del contenido de la anterior.
  for (const a of db.asignaturas.filter((x) => x.planId === origen.id)) {
    db.asignaturas.push({
      ...a,
      id: nuevoId(),
      planId: nuevo.id,
      competenciaIds: [...a.competenciaIds],
    });
  }

  registrarAuditoria(
    'Plan',
    nuevo.id,
    'Creación',
    `Versión ${version} generada desde ${origen.codigo}.`,
  );
  return demora(clonar(nuevo));
}

/** RF076 / RF079: versiones de la carrera, para el selector de histórico. */
export async function listarVersiones(carreraId: string): Promise<PlanEstudios[]> {
  const versiones = db.planes
    .filter((p) => p.carreraId === carreraId)
    .sort((x, y) => y.version - x.version);
  return demora(clonar(versiones));
}

/** RF078 / RF080 / RF008 / RF019 / RF059: bitácora de una entidad. */
export async function listarAuditoria(
  entidad: EventoAuditoria['entidad'],
  entidadId: string,
): Promise<EventoAuditoria[]> {
  const eventos = db.auditoria
    .filter((e) => e.entidad === entidad && e.entidadId === entidadId)
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
  return demora(clonar(eventos));
}

/** RF089: historial de aprobaciones del plan. */
export async function listarAprobaciones(planId: string): Promise<EventoAprobacion[]> {
  const eventos = db.aprobaciones
    .filter((e) => e.planId === planId)
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
  return demora(clonar(eventos));
}

/** RF099: justificar una observación no bloqueante. */
export async function justificarRegla(
  planId: string,
  codigoRegla: string,
  motivo: string,
): Promise<void> {
  if (!motivo.trim()) throw new ErrorDeNegocio('La justificación no puede quedar vacía.');
  db.justificaciones.push({
    planId,
    codigoRegla,
    motivo: motivo.trim(),
    usuario: USUARIO_ACTUAL,
    fecha: ahora(),
  });
  registrarAuditoria('Plan', planId, 'Justificación', `Observación ${codigoRegla} justificada.`);
  await demora(null, 80);
}

export async function listarJustificaciones(planId: string): Promise<string[]> {
  return demora(db.justificaciones.filter((j) => j.planId === planId).map((j) => j.codigoRegla));
}

/* ── Objetivos educacionales (RF033-RF039) ────────────────────────────── */

export async function listarObjetivos(): Promise<ObjetivoEducacional[]> {
  return demora(clonar([...db.objetivos].sort((x, y) => x.codigo.localeCompare(y.codigo))));
}

export async function crearObjetivo(
  nombre: string,
  descripcion: string,
): Promise<ObjetivoEducacional> {
  // RF033 RN1: nombre y descripción obligatorios.
  if (!nombre.trim()) throw new ErrorDeNegocio('El nombre del objetivo es obligatorio.');
  if (!descripcion.trim()) throw new ErrorDeNegocio('La descripción del objetivo es obligatoria.');

  const objetivo: ObjetivoEducacional = {
    id: nuevoId(),
    // RF034: correlativo, no editable.
    codigo: siguienteCodigoObjetivo(db.objetivos.map((o) => o.codigo)),
    nombre: nombre.trim(),
    descripcion: descripcion.trim(),
    estado: 'Activo',
  };
  db.objetivos.push(objetivo);
  registrarAuditoria('Objetivo', objetivo.id, 'Creación', `${objetivo.codigo} registrado.`);
  return demora(clonar(objetivo));
}

export async function editarObjetivo(
  id: string,
  nombre: string,
  descripcion: string,
): Promise<ObjetivoEducacional> {
  const objetivo = db.objetivos.find((o) => o.id === id);
  if (!objetivo) throw new ErrorDeNegocio('El objetivo no existe.');
  if (!nombre.trim()) throw new ErrorDeNegocio('El nombre del objetivo es obligatorio.');
  if (!descripcion.trim()) throw new ErrorDeNegocio('La descripción del objetivo es obligatoria.');

  // RF036 RN1: el código no se modifica al editar.
  objetivo.nombre = nombre.trim();
  objetivo.descripcion = descripcion.trim();
  registrarAuditoria('Objetivo', id, 'Edición', `${objetivo.codigo} actualizado.`);
  return demora(clonar(objetivo));
}

export async function inactivarObjetivo(id: string): Promise<ObjetivoEducacional> {
  const objetivo = db.objetivos.find((o) => o.id === id);
  if (!objetivo) throw new ErrorDeNegocio('El objetivo no existe.');
  objetivo.estado = objetivo.estado === 'Activo' ? 'Inactivo' : 'Activo';
  registrarAuditoria('Objetivo', id, 'Cambio de estado', `Estado: ${objetivo.estado}.`);
  return demora(clonar(objetivo));
}

/** RF038: integridad referencial. Solo se elimina lo que nadie usa. */
export async function eliminarObjetivo(id: string): Promise<void> {
  const enUso = db.planes.filter((p) => p.objetivoIds.includes(id));
  if (enUso.length > 0) {
    throw new ErrorDeNegocio(
      `No se puede eliminar: el objetivo está vinculado a ${enUso.length} plan(es). Inactívalo en su lugar.`,
    );
  }
  db.objetivos = db.objetivos.filter((o) => o.id !== id);
  await demora(null, 80);
}

/* ── Competencias (RF040-RF046) ───────────────────────────────────────── */

export async function listarCompetencias(): Promise<Competencia[]> {
  return demora(clonar([...db.competencias].sort((x, y) => x.codigo.localeCompare(y.codigo))));
}

export async function crearCompetencia(nombre: string): Promise<Competencia> {
  // RF040 RN1: el nombre es obligatorio.
  if (!nombre.trim()) throw new ErrorDeNegocio('El nombre de la competencia es obligatorio.');

  const competencia: Competencia = {
    id: nuevoId(),
    // RF041: correlativo, no editable.
    codigo: siguienteCodigoCompetencia(db.competencias.map((c) => c.codigo)),
    nombre: nombre.trim(),
    estado: 'Activo',
  };
  db.competencias.push(competencia);
  registrarAuditoria(
    'Competencia',
    competencia.id,
    'Creación',
    `${competencia.codigo} registrada.`,
  );
  return demora(clonar(competencia));
}

export async function editarCompetencia(id: string, nombre: string): Promise<Competencia> {
  const competencia = db.competencias.find((c) => c.id === id);
  if (!competencia) throw new ErrorDeNegocio('La competencia no existe.');
  if (!nombre.trim()) throw new ErrorDeNegocio('El nombre de la competencia es obligatorio.');

  competencia.nombre = nombre.trim();
  registrarAuditoria('Competencia', id, 'Edición', `${competencia.codigo} actualizada.`);
  return demora(clonar(competencia));
}

export async function inactivarCompetencia(id: string): Promise<Competencia> {
  const competencia = db.competencias.find((c) => c.id === id);
  if (!competencia) throw new ErrorDeNegocio('La competencia no existe.');
  competencia.estado = competencia.estado === 'Activo' ? 'Inactivo' : 'Activo';
  registrarAuditoria('Competencia', id, 'Cambio de estado', `Estado: ${competencia.estado}.`);
  return demora(clonar(competencia));
}

/** RF045: integridad referencial contra asignaturas y planes. */
export async function eliminarCompetencia(id: string): Promise<void> {
  const asignaturas = db.asignaturas.filter((a) => a.competenciaIds.includes(id)).length;
  const planes = db.planes.filter((p) => p.competenciaIds.includes(id)).length;
  if (asignaturas + planes > 0) {
    throw new ErrorDeNegocio(
      `No se puede eliminar: la competencia está vinculada a ${asignaturas} asignatura(s) y ${planes} plan(es). Inactívala en su lugar.`,
    );
  }
  db.competencias = db.competencias.filter((c) => c.id !== id);
  await demora(null, 80);
}

/* ── Asignaturas (RF047-RF059) y malla (RF060-RF074) ──────────────────── */

export async function listarAsignaturas(planId: string): Promise<Asignatura[]> {
  const lista = db.asignaturas
    .filter((a) => a.planId === planId)
    .sort((x, y) => x.codigo.localeCompare(y.codigo));
  return demora(clonar(lista));
}

export interface DatosAsignatura {
  nombre: string;
  descripcion: string;
  tipo: Asignatura['tipo'];
  condicion: Asignatura['condicion'];
  creditos: number;
  horasTeoricas: number;
  competenciaIds: string[];
}

export async function crearAsignatura(planId: string, datos: DatosAsignatura): Promise<Asignatura> {
  const plan = exigirPlanEditable(planId);
  const carrera = db.carreras.find((c) => c.id === plan.carreraId);
  if (!carrera) throw new ErrorDeNegocio('La carrera del plan no existe.');

  validarDatosAsignatura(datos);

  const asignatura: Asignatura = {
    id: nuevoId(),
    planId,
    // RF053: autogenerado, no editable.
    codigo: siguienteCodigoAsignatura(
      carrera.codigo,
      db.asignaturas.filter((a) => a.planId === planId).map((a) => a.codigo),
    ),
    nombre: datos.nombre.trim(),
    descripcion: datos.descripcion.trim(),
    tipo: datos.tipo,
    condicion: datos.condicion,
    creditos: datos.creditos,
    horasTeoricas: datos.horasTeoricas,
    competenciaIds: [...datos.competenciaIds],
    cicloNumero: null,
    orden: 0,
    estado: 'Activo',
  };
  db.asignaturas.push(asignatura);
  registrarAuditoria('Asignatura', asignatura.id, 'Creación', `${asignatura.codigo} registrada.`);
  return demora(clonar(asignatura));
}

export async function editarAsignatura(id: string, datos: DatosAsignatura): Promise<Asignatura> {
  const asignatura = db.asignaturas.find((a) => a.id === id);
  if (!asignatura) throw new ErrorDeNegocio('La asignatura no existe.');
  // RF050 RN1: edición completa solo con el plan editable.
  exigirPlanEditable(asignatura.planId);
  validarDatosAsignatura(datos);

  Object.assign(asignatura, {
    nombre: datos.nombre.trim(),
    descripcion: datos.descripcion.trim(),
    tipo: datos.tipo,
    condicion: datos.condicion,
    creditos: datos.creditos,
    horasTeoricas: datos.horasTeoricas,
    competenciaIds: [...datos.competenciaIds],
  });
  // RF059: cada modificación relevante queda registrada.
  registrarAuditoria('Asignatura', id, 'Edición', `${asignatura.codigo} actualizada.`);
  return demora(clonar(asignatura));
}

export async function inactivarAsignatura(id: string): Promise<Asignatura> {
  const asignatura = db.asignaturas.find((a) => a.id === id);
  if (!asignatura) throw new ErrorDeNegocio('La asignatura no existe.');
  exigirPlanEditable(asignatura.planId);
  // RF052 RN1: no se elimina físicamente.
  asignatura.estado = asignatura.estado === 'Activo' ? 'Inactivo' : 'Activo';
  registrarAuditoria('Asignatura', id, 'Cambio de estado', `Estado: ${asignatura.estado}.`);
  return demora(clonar(asignatura));
}

function validarDatosAsignatura(datos: DatosAsignatura): void {
  // RF047 RN1
  if (!datos.nombre.trim()) throw new ErrorDeNegocio('El nombre de la asignatura es obligatorio.');
  if (!datos.descripcion.trim()) throw new ErrorDeNegocio('La descripción es obligatoria.');
  // RF054 RN1: mayor a cero.
  if (!Number.isFinite(datos.creditos) || datos.creditos <= 0) {
    throw new ErrorDeNegocio('Los créditos deben ser un número mayor a cero.');
  }
  // RF055 RN1: numérico y no negativo.
  if (!Number.isFinite(datos.horasTeoricas) || datos.horasTeoricas < 0) {
    throw new ErrorDeNegocio('Las horas teóricas deben ser un número no negativo.');
  }
}

/**
 * RF061 / RF071 - ubica una asignatura en un ciclo, o la saca si `ciclo` es
 * null (RF062). Como `cicloNumero` es un único valor, RF065 (no repetirse en
 * varios ciclos) se cumple por construcción: reubicar es sobrescribir.
 */
export async function ubicarAsignatura(
  id: string,
  ciclo: number | null,
  ordenDestino?: number,
): Promise<Asignatura> {
  const asignatura = db.asignaturas.find((a) => a.id === id);
  if (!asignatura) throw new ErrorDeNegocio('La asignatura no existe.');
  const plan = exigirPlanEditable(asignatura.planId);

  if (ciclo !== null) {
    const carrera = db.carreras.find((c) => c.id === plan.carreraId);
    const totalCiclos = (carrera?.duracionAnios ?? 0) * 2;
    if (ciclo < 1 || ciclo > totalCiclos) {
      throw new ErrorDeNegocio(
        `El ciclo ${ciclo} está fuera del rango de la carrera (1 a ${totalCiclos}).`,
      );
    }
  }

  const anterior = asignatura.cicloNumero;
  asignatura.cicloNumero = ciclo;

  // RF070: el orden dentro del ciclo es de presentación.
  const hermanas = db.asignaturas
    .filter((a) => a.planId === asignatura.planId && a.cicloNumero === ciclo && a.id !== id)
    .sort((x, y) => x.orden - y.orden);

  const posicion = ordenDestino ?? hermanas.length;
  hermanas.splice(Math.max(0, Math.min(posicion, hermanas.length)), 0, asignatura);
  hermanas.forEach((a, i) => {
    a.orden = i;
  });

  const descripcion =
    ciclo === null
      ? `${asignatura.codigo} retirada del ciclo ${anterior ?? '—'}.`
      : `${asignatura.codigo}: ciclo ${anterior ?? 'sin asignar'} → ${ciclo}.`;
  registrarAuditoria('Asignatura', id, 'Ubicación en malla', descripcion);
  return demora(clonar(asignatura), 60);
}

function exigirPlanEditable(planId: string): PlanEstudios {
  const plan = db.planes.find((p) => p.id === planId);
  if (!plan) throw new ErrorDeNegocio('El plan de estudios no existe.');
  if (!permiteEdicion(plan.estado)) {
    throw new ErrorDeNegocio(
      `El plan está en estado ${plan.estado} y no admite cambios. Genera una nueva versión para modificarlo.`,
    );
  }
  return plan;
}

/* ── Comparación de versiones (RF077) ─────────────────────────────────── */

export interface DiferenciaAsignatura {
  codigo: string;
  nombre: string;
  cambio: 'agregada' | 'retirada' | 'modificada';
  detalle: string;
}

/**
 * RF077 - compara dos versiones del mismo plan. RN1 limita la comparación a
 * versiones de una misma carrera, así que se rechaza cualquier otro par.
 * El emparejamiento es por nombre y no por id: al generar una versión los ids
 * se renuevan, y lo que el usuario reconoce como "la misma asignatura" es el
 * nombre.
 */
export async function compararVersiones(idA: string, idB: string): Promise<DiferenciaAsignatura[]> {
  const a = db.planes.find((p) => p.id === idA);
  const b = db.planes.find((p) => p.id === idB);
  if (!a || !b) throw new ErrorDeNegocio('Alguna de las versiones no existe.');
  if (a.carreraId !== b.carreraId) {
    throw new ErrorDeNegocio('Solo se pueden comparar versiones de una misma carrera.');
  }

  const porNombre = (planId: string) =>
    new Map(
      db.asignaturas
        .filter((x) => x.planId === planId)
        .map((x) => [x.nombre.trim().toLowerCase(), x] as const),
    );

  const enA = porNombre(idA);
  const enB = porNombre(idB);
  const diferencias: DiferenciaAsignatura[] = [];

  for (const [clave, asig] of enB) {
    const previa = enA.get(clave);
    if (!previa) {
      diferencias.push({
        codigo: asig.codigo,
        nombre: asig.nombre,
        cambio: 'agregada',
        detalle: `Nueva en ${b.codigo}.`,
      });
      continue;
    }
    const cambios: string[] = [];
    if (previa.creditos !== asig.creditos) {
      cambios.push(`créditos ${previa.creditos} → ${asig.creditos}`);
    }
    if (previa.cicloNumero !== asig.cicloNumero) {
      cambios.push(
        `ciclo ${previa.cicloNumero ?? 'sin asignar'} → ${asig.cicloNumero ?? 'sin asignar'}`,
      );
    }
    if (previa.tipo !== asig.tipo) cambios.push(`tipo ${previa.tipo} → ${asig.tipo}`);
    if (previa.condicion !== asig.condicion) {
      cambios.push(`condición ${previa.condicion} → ${asig.condicion}`);
    }
    if (cambios.length > 0) {
      diferencias.push({
        codigo: asig.codigo,
        nombre: asig.nombre,
        cambio: 'modificada',
        detalle: cambios.join(' · '),
      });
    }
  }

  for (const [clave, asig] of enA) {
    if (!enB.has(clave)) {
      diferencias.push({
        codigo: asig.codigo,
        nombre: asig.nombre,
        cambio: 'retirada',
        detalle: `Ya no está en ${b.codigo}.`,
      });
    }
  }

  return demora(diferencias);
}
