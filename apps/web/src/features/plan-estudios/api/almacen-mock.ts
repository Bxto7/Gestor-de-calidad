/**
 * Almacén en memoria que sustituye al backend mientras NestJS no existe.
 *
 * Está deliberadamente escondido detrás de las funciones `*.api.ts`, que son
 * asíncronas y tienen la misma forma que tendría un cliente HTTP. Cuando exista
 * el backend real solo se reemplaza el cuerpo de esas funciones por un `fetch`:
 * ni los hooks de react-query ni los componentes cambian.
 *
 * Por eso este archivo no se importa nunca desde un componente.
 */

import type {
  Asignatura,
  Carrera,
  Competencia,
  EventoAprobacion,
  EventoAuditoria,
  Facultad,
  Justificacion,
  ObjetivoEducacional,
  PlanEstudios,
} from '../domain/tipos';

export interface BaseDatos {
  facultades: Facultad[];
  carreras: Carrera[];
  planes: PlanEstudios[];
  objetivos: ObjetivoEducacional[];
  competencias: Competencia[];
  asignaturas: Asignatura[];
  auditoria: EventoAuditoria[];
  aprobaciones: EventoAprobacion[];
  justificaciones: Justificacion[];
}

/**
 * Usuario en sesión. Provisional: el módulo de Auth aún no existe (§6 del
 * prompt lo deja fuera de alcance), pero RF080 exige que ninguna modificación
 * sea anónima, así que la bitácora necesita un nombre desde ya.
 */
export const USUARIO_ACTUAL = 'Coordinador académico';

export function nuevoId(): string {
  return crypto.randomUUID();
}

export function ahora(): string {
  return new Date().toISOString();
}

const HOY = new Date('2026-08-20T09:00:00.000Z');

function haceDias(dias: number): string {
  return new Date(HOY.getTime() - dias * 86_400_000).toISOString();
}

/**
 * Datos sintéticos. CLAUDE.md §6.5: nunca datos reales de estudiantes o
 * docentes fuera de producción, ni siquiera en un mock de UI.
 */
function construirSemilla(): BaseDatos {
  const facultades: Facultad[] = [
    { id: 'fac-ing', nombre: 'Ingeniería', estado: 'Activo', creadoEn: haceDias(420) },
    {
      id: 'fac-emp',
      nombre: 'Ciencias de la Empresa',
      estado: 'Activo',
      creadoEn: haceDias(400),
    },
    { id: 'fac-sal', nombre: 'Ciencias de la Salud', estado: 'Activo', creadoEn: haceDias(380) },
    { id: 'fac-hum', nombre: 'Humanidades', estado: 'Inactivo', creadoEn: haceDias(700) },
  ];

  const carreras: Carrera[] = [
    {
      id: 'car-isi',
      facultadId: 'fac-ing',
      nombre: 'Ingeniería de Sistemas e Informática',
      codigo: 'ISI',
      duracionAnios: 5,
      estado: 'Activo',
      creadoEn: haceDias(410),
    },
    {
      id: 'car-iin',
      facultadId: 'fac-ing',
      nombre: 'Ingeniería Industrial',
      codigo: 'IIN',
      duracionAnios: 5,
      estado: 'Activo',
      creadoEn: haceDias(405),
    },
    {
      id: 'car-adm',
      facultadId: 'fac-emp',
      nombre: 'Administración de Empresas',
      codigo: 'ADM',
      duracionAnios: 5,
      estado: 'Activo',
      creadoEn: haceDias(395),
    },
    {
      id: 'car-enf',
      facultadId: 'fac-sal',
      nombre: 'Enfermería',
      codigo: 'ENF',
      duracionAnios: 5,
      estado: 'Activo',
      creadoEn: haceDias(370),
    },
  ];

  const objetivos: ObjetivoEducacional[] = [
    {
      id: 'oe-1',
      codigo: 'OE-01',
      nombre: 'Desempeño profesional en ingeniería de software',
      descripcion:
        'Los egresados se desempeñan con solvencia técnica en el diseño, construcción y mantenimiento de sistemas de software en organizaciones públicas y privadas.',
      estado: 'Activo',
    },
    {
      id: 'oe-2',
      codigo: 'OE-02',
      nombre: 'Liderazgo y trabajo en equipos multidisciplinarios',
      descripcion:
        'Los egresados lideran o integran equipos multidisciplinarios, comunicando decisiones técnicas a públicos no especializados.',
      estado: 'Activo',
    },
    {
      id: 'oe-3',
      codigo: 'OE-03',
      nombre: 'Aprendizaje continuo y actualización tecnológica',
      descripcion:
        'Los egresados incorporan nuevas tecnologías y metodologías a lo largo de su ejercicio profesional.',
      estado: 'Activo',
    },
    {
      id: 'oe-4',
      codigo: 'OE-04',
      nombre: 'Responsabilidad ética y social',
      descripcion:
        'Los egresados aplican criterios éticos y consideran el impacto social y ambiental de las soluciones que desarrollan.',
      estado: 'Inactivo',
    },
  ];

  const competencias: Competencia[] = [
    { id: 'cpe-1', codigo: 'CPE-01', nombre: 'Análisis y resolución de problemas', estado: 'Activo' },
    { id: 'cpe-2', codigo: 'CPE-02', nombre: 'Diseño de soluciones de software', estado: 'Activo' },
    { id: 'cpe-3', codigo: 'CPE-03', nombre: 'Comunicación efectiva', estado: 'Activo' },
    { id: 'cpe-4', codigo: 'CPE-04', nombre: 'Trabajo en equipo', estado: 'Activo' },
    { id: 'cpe-5', codigo: 'CPE-05', nombre: 'Ética profesional', estado: 'Activo' },
    { id: 'cpe-6', codigo: 'CPE-06', nombre: 'Experimentación y análisis de datos', estado: 'Activo' },
    { id: 'cpe-7', codigo: 'CPE-07', nombre: 'Gestión de proyectos', estado: 'Inactivo' },
  ];

  const planes: PlanEstudios[] = [
    {
      id: 'plan-isi-v1',
      carreraId: 'car-isi',
      codigo: 'PE-ISI-2021-v1',
      version: 1,
      estado: 'Histórico',
      duracionAnios: 5,
      fechaVigencia: haceDias(1400),
      objetivoIds: ['oe-1', 'oe-2'],
      competenciaIds: ['cpe-1', 'cpe-2'],
      derivadoDe: null,
      creadoEn: haceDias(1460),
    },
    {
      id: 'plan-isi-v2',
      carreraId: 'car-isi',
      codigo: 'PE-ISI-2026-v2',
      version: 2,
      estado: 'Borrador',
      duracionAnios: 5,
      fechaVigencia: null,
      objetivoIds: ['oe-1', 'oe-2', 'oe-3'],
      competenciaIds: ['cpe-1', 'cpe-2', 'cpe-3', 'cpe-4'],
      derivadoDe: 'plan-isi-v1',
      creadoEn: haceDias(45),
    },
    {
      id: 'plan-iin-v1',
      carreraId: 'car-iin',
      codigo: 'PE-IIN-2024-v1',
      version: 1,
      estado: 'Vigente',
      duracionAnios: 5,
      fechaVigencia: haceDias(600),
      objetivoIds: ['oe-1'],
      competenciaIds: ['cpe-1'],
      derivadoDe: null,
      creadoEn: haceDias(700),
    },
    {
      id: 'plan-adm-v1',
      carreraId: 'car-adm',
      codigo: 'PE-ADM-2026-v1',
      version: 1,
      estado: 'En revisión',
      duracionAnios: 5,
      fechaVigencia: null,
      objetivoIds: ['oe-2'],
      competenciaIds: ['cpe-3'],
      derivadoDe: null,
      creadoEn: haceDias(30),
    },
  ];

  /**
   * Malla parcial del plan ISI v2. Está incompleta a propósito: deja
   * asignaturas sin ciclo y sin competencia para que las validaciones
   * bloqueantes (RF068, RF094) se vean en acción al abrir el hub, en vez de
   * mostrar un plan perfecto donde el motor no hace nada visible.
   */
  const asignaturas: Asignatura[] = [
    a('asg-1', 'ISI-101', 'Matemática Básica', 'General', 'Obligatoria', 4, 3, ['cpe-1'], 1, 0),
    a('asg-2', 'ISI-102', 'Comunicación', 'Transversal', 'Obligatoria', 3, 2, ['cpe-3'], 1, 1),
    a('asg-3', 'ISI-103', 'Introducción a la Ingeniería', 'General', 'Obligatoria', 3, 2, ['cpe-1'], 1, 2),
    a('asg-4', 'ISI-104', 'Algoritmos y Programación', 'Especialidad', 'Obligatoria', 5, 3, ['cpe-1', 'cpe-2'], 2, 0),
    a('asg-5', 'ISI-105', 'Cálculo Diferencial', 'General', 'Obligatoria', 4, 3, ['cpe-1'], 2, 1),
    a('asg-6', 'ISI-106', 'Ética y Ciudadanía', 'Transversal', 'Obligatoria', 2, 2, ['cpe-5'], 2, 2),
    a('asg-7', 'ISI-107', 'Estructuras de Datos', 'Especialidad', 'Obligatoria', 5, 3, ['cpe-2'], 3, 0),
    a('asg-8', 'ISI-108', 'Base de Datos I', 'Especialidad', 'Obligatoria', 4, 3, ['cpe-2'], 3, 1),
    a('asg-9', 'ISI-109', 'Estadística Aplicada', 'General', 'Obligatoria', 3, 2, ['cpe-6'], 3, 2),
    a('asg-10', 'ISI-110', 'Ingeniería de Software I', 'Especialidad', 'Obligatoria', 4, 3, ['cpe-2', 'cpe-4'], 4, 0),
    a('asg-11', 'ISI-111', 'Redes y Comunicaciones', 'Especialidad', 'Obligatoria', 4, 3, ['cpe-1'], 4, 1),
    a('asg-12', 'ISI-112', 'Sistemas Operativos', 'Especialidad', 'Obligatoria', 4, 3, ['cpe-1'], 5, 0),
    // Sin competencia: dispara RF094 (bloqueante).
    a('asg-13', 'ISI-113', 'Arquitectura de Software', 'Especialidad', 'Obligatoria', 4, 3, [], 5, 1),
    // Sin ciclo: disparan RF068 (bloqueante).
    a('asg-14', 'ISI-114', 'Inteligencia Artificial', 'Especialidad', 'Electiva', 3, 2, ['cpe-6'], null, 0),
    a('asg-15', 'ISI-115', 'Gestión de Proyectos de TI', 'Especialidad', 'Electiva', 3, 2, ['cpe-4'], null, 0),
    a('asg-16', 'ISI-116', 'Emprendimiento Digital', 'Transversal', 'Electiva', 2, 2, ['cpe-3'], null, 0),
  ];

  function a(
    id: string,
    codigo: string,
    nombre: string,
    tipo: Asignatura['tipo'],
    condicion: Asignatura['condicion'],
    creditos: number,
    horasTeoricas: number,
    competenciaIds: string[],
    cicloNumero: number | null,
    orden: number,
  ): Asignatura {
    return {
      id,
      planId: 'plan-isi-v2',
      codigo,
      nombre,
      descripcion: 'Asignatura del plan de estudios de Ingeniería de Sistemas e Informática.',
      tipo,
      condicion,
      creditos,
      horasTeoricas,
      competenciaIds,
      cicloNumero,
      orden,
      estado: 'Activo',
    };
  }

  const auditoria: EventoAuditoria[] = [
    {
      id: 'aud-1',
      entidad: 'Plan',
      entidadId: 'plan-isi-v2',
      accion: 'Creación',
      detalle: 'Nueva versión generada a partir de PE-ISI-2021-v1.',
      usuario: 'Director de carrera',
      fecha: haceDias(45),
    },
    {
      id: 'aud-2',
      entidad: 'Plan',
      entidadId: 'plan-isi-v2',
      accion: 'Edición',
      detalle: 'Se asoció el objetivo educacional OE-03.',
      usuario: USUARIO_ACTUAL,
      fecha: haceDias(20),
    },
    {
      id: 'aud-3',
      entidad: 'Facultad',
      entidadId: 'fac-ing',
      accion: 'Creación',
      detalle: 'Facultad registrada.',
      usuario: 'Administrador del sistema',
      fecha: haceDias(420),
    },
  ];

  const aprobaciones: EventoAprobacion[] = [
    {
      id: 'apr-1',
      planId: 'plan-isi-v1',
      accion: 'Aprobado',
      comentario: null,
      usuario: 'Decano de Ingeniería',
      fecha: haceDias(1405),
    },
    {
      id: 'apr-2',
      planId: 'plan-isi-v1',
      accion: 'Marcado vigente',
      comentario: null,
      usuario: 'Decano de Ingeniería',
      fecha: haceDias(1400),
    },
  ];

  return {
    facultades,
    carreras,
    planes,
    objetivos,
    competencias,
    asignaturas,
    auditoria,
    aprobaciones,
    justificaciones: [],
  };
}

export const db: BaseDatos = construirSemilla();

/** Simula la latencia de red para que los estados de carga sean reales. */
export function demora<T>(valor: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(valor), ms));
}

/** Copia defensiva: nadie muta el almacén por tener una referencia. */
export function clonar<T>(valor: T): T {
  return structuredClone(valor);
}

export function registrarAuditoria(
  entidad: EventoAuditoria['entidad'],
  entidadId: string,
  accion: string,
  detalle: string,
): void {
  db.auditoria.unshift({
    id: nuevoId(),
    entidad,
    entidadId,
    accion,
    detalle,
    usuario: USUARIO_ACTUAL,
    fecha: ahora(),
  });
}

/** Error de negocio con mensaje presentable. La UI lo muestra tal cual. */
export class ErrorDeNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeNegocio';
  }
}
