/**
 * Puertos de la estructura académica: facultades, carreras y ciclos.
 *
 * Nota sobre unicidad. Las reglas RF006, RF015 y RF017 se comprueban en **dos**
 * sitios y es a propósito:
 *
 *   - aquí, para poder devolver un mensaje útil ("Ya existe una facultad con
 *     ese nombre") en vez de un error de base de datos;
 *   - en el índice único de la migración, que es lo único que resiste dos
 *     peticiones concurrentes pasando la comprobación a la vez.
 *
 * La segunda es la autoridad. La primera existe por la experiencia de usuario.
 */

export interface DatosFacultad {
  readonly id: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly creadoEn: Date;
  /** Conteo para la tarjeta del listado (RF003). */
  readonly totalCarreras: number;
}

export interface DatosCarreraCompleta {
  readonly id: string;
  readonly facultadId: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly duracionAnios: number;
  readonly activa: boolean;
  readonly creadoEn: Date;
}

export interface RepositorioFacultadPort {
  listar(filtro?: { texto?: string; activa?: boolean }): Promise<DatosFacultad[]>;
  porId(id: string): Promise<DatosFacultad | null>;
  crear(nombre: string): Promise<DatosFacultad>;
  renombrar(id: string, nombre: string): Promise<DatosFacultad>;
  cambiarEstado(id: string, activa: boolean): Promise<DatosFacultad>;
  /** RF006: comprobación previa, con la misma normalización que el índice. */
  existeNombre(nombre: string, idIgnorado?: string): Promise<boolean>;
  /** RF005: impacto antes de confirmar la inactivación. */
  impactoDeInactivar(id: string): Promise<{ carreras: number; planesVigentes: number }>;
}

export interface DatosNuevaCarrera {
  readonly facultadId: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly duracionAnios: number;
}

export interface RepositorioCarreraPort {
  listar(filtro?: {
    facultadId?: string;
    texto?: string;
    activa?: boolean;
  }): Promise<DatosCarreraCompleta[]>;
  porId(id: string): Promise<DatosCarreraCompleta | null>;
  crear(datos: DatosNuevaCarrera): Promise<DatosCarreraCompleta>;
  actualizar(
    id: string,
    datos: Omit<DatosNuevaCarrera, 'facultadId'>,
  ): Promise<DatosCarreraCompleta>;
  cambiarEstado(id: string, activa: boolean): Promise<DatosCarreraCompleta>;

  existeNombreEnFacultad(facultadId: string, nombre: string, idIgnorado?: string): Promise<boolean>;
  /** RF017 RN1: el código es único en toda la universidad, no por facultad. */
  existeCodigo(codigo: string, idIgnorado?: string): Promise<boolean>;

  /**
   * RF012 RN1: cuántas asignaturas quedarían huérfanas al reducir los ciclos.
   * Se consulta antes de permitir el cambio, no después de romperlo.
   */
  asignaturasSobreCiclo(carreraId: string, cicloMaximo: number): Promise<number>;

  /**
   * Crea los ciclos que falten y elimina los sobrantes (RF011).
   * Los ciclos pertenecen a la carrera (§3.3), así que su ciclo de vida va
   * atado al de ella y no al de cada plan.
   */
  sincronizarCiclos(carreraId: string, totalCiclos: number): Promise<void>;
}

export const REPOSITORIO_FACULTAD = Symbol('RepositorioFacultadPort');
export const REPOSITORIO_CARRERA = Symbol('RepositorioCarreraPort');
