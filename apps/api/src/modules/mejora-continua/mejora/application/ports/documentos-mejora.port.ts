/**
 * Contratos de generación de documentos del plan de mejora (RF-PJ-032 a
 * RF-PJ-034).
 *
 * Calca a propósito `documentos-evaluacion.port.ts`: es el mismo concepto —un
 * trabajo que corre en la cola y cuyo estado hay que poder consultar después—
 * y leerlo igual ahorra traducirlo mentalmente al saltar de un submódulo a
 * otro. Lo que no se comparte es la tabla — cada submódulo tiene la suya
 * (§3.2) — ni este archivo, que es de este módulo.
 *
 * El estado del trabajo vive en PostgreSQL y no solo en BullMQ porque los
 * trabajos de la cola caducan: Redis los limpia y con ellos desaparecería el
 * rastro de qué evidencia se generó, cuándo y a petición de quién.
 *
 * CLAUDE.md §3.2: el puerto no declara tipos de Prisma — los suyos son
 * propios del dominio de la aplicación. Quien conoce Prisma es el
 * repositorio, en `infrastructure/persistence/`.
 */

export type TipoDocMejora = 'PLAN_MEJORA_PDF' | 'PLAN_MEJORA_EXCEL';

/** El estado viaja en el vocabulario del dominio, no en el enum de la base. */
export type EstadoDocMejora = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

/**
 * Lo que viaja al navegador.
 *
 * Sin `ubicacion`, a propósito: es interna, y decirla filtraría la
 * estructura del almacenamiento a cualquiera que abra las herramientas de
 * desarrollo. Se lee solo por `ubicacionDe`.
 */
export interface TrabajoDocumentoMejora {
  readonly id: string;
  readonly planMejoraId: string;
  readonly tipo: TipoDocMejora;
  readonly estado: EstadoDocMejora;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosMejoraPort {
  crear(datos: {
    planMejoraId: string;
    tipo: TipoDocMejora;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoMejora>;
  porId(id: string): Promise<TrabajoDocumentoMejora | null>;
  listarDePlan(planMejoraId: string, limite: number): Promise<TrabajoDocumentoMejora[]>;
  marcarGenerando(id: string): Promise<void>;
  marcarListo(
    id: string,
    archivo: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void>;
  marcarFallido(id: string, error: string): Promise<void>;
  /** La ubicación solo por aquí: no viaja en el trabajo. */
  ubicacionDe(id: string): Promise<string | null>;
}

export const REPOSITORIO_DOCUMENTOS_MEJORA = Symbol('RepositorioDocumentosMejoraPort');
