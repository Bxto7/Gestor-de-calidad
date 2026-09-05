import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { TIPOS_DOCUMENTO_MEDICION } from '../../../application/ports/documentos-medicion.port.js';

export class GenerarDocumentoMedicionDto {
  @ApiProperty({ enum: TIPOS_DOCUMENTO_MEDICION })
  @IsIn(TIPOS_DOCUMENTO_MEDICION, {
    message: `El tipo debe ser uno de: ${TIPOS_DOCUMENTO_MEDICION.join(', ')}.`,
  })
  tipo!: (typeof TIPOS_DOCUMENTO_MEDICION)[number];
}
