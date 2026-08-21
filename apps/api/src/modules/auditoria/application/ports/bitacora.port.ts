/**
 * Puerto de lectura de la bitácora.
 *
 * Solo lectura, y es deliberado: la escritura entra por `PublicadorDeEventos`,
 * que es lo que consume el resto de módulos sin conocer este. Exponer aquí un
 * método de inserción abriría una segunda puerta por la que alguien podría
 * escribir en la bitácora sin pasar por un evento de dominio.
 *
 * Tampoco hay borrado ni actualización: §4.3 la define append-only y el rol de
 * base de datos lo impone con un trigger. Un puerto que ofreciera esas
 * operaciones prometería algo que la infraestructura rechaza.
 */

export interface EventoBitacora {
  readonly id: string;
  readonly entidad: string;
  readonly entidadId: string;
  readonly accion: string;
  readonly detalle: string;
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly fecha: Date;
}

export interface FiltroBitacora {
  readonly entidad?: string;
  readonly entidadId?: string;
  /** Tope de filas. La bitácora crece sin límite; el listado no puede. */
  readonly limite?: number;
}

export interface RepositorioBitacoraPort {
  listar(filtro: FiltroBitacora): Promise<EventoBitacora[]>;
}

export const REPOSITORIO_BITACORA = Symbol('RepositorioBitacoraPort');
