import { IsIn } from 'class-validator';

import { TIPOS_DOCUMENTO, type TipoDocumento } from '../../../application/ports/documentos.port.js';

export class SolicitarDocumentoDto {
  /**
   * Qué documento generar.
   *
   * Lista cerrada y validada aquí: el tipo decide qué se dibuja y con qué
   * renderizador, así que un valor desconocido tiene que rebotar en el borde
   * con un 400 y no llegar al worker, donde el fallo aparecería minutos después
   * como un trabajo fallido sin explicación clara.
   */
  @IsIn(TIPOS_DOCUMENTO as readonly string[], {
    message: `El tipo debe ser uno de: ${TIPOS_DOCUMENTO.join(', ')}.`,
  })
  tipo!: TipoDocumento;
}
