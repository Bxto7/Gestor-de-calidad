/**
 * Endpoints de exportación del acta de aprobación (RF-AC-018, RF-AC-019).
 *
 * Calca `documentos-mejora.controller.ts`: pedir un documento es una acción
 * sobre un acta (`/actas/:actaId/documentos`) y el trabajo resultante tiene
 * vida propia y se consulta por su identificador (`/documentos-acta/:id`).
 * El sufijo `-acta` evita chocar con las rutas de los demás módulos, cuyos
 * identificadores viven en otras tablas.
 *
 * Sin lógica de negocio: los permisos (`actas.leer` vía `AuthorizationPort`)
 * y el paso a Emitida viven en `GenerarDocumentoActa` /
 * `ConsultarDocumentoActa`. Este controlador solo usa `encolar` y las tres
 * lecturas; `ejecutar` es del worker.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../../auth/infrastructure/http/jwt.guard.js';
import {
  ConsultarDocumentoActa,
  GenerarDocumentoActa,
} from '../../application/use-cases/generar-documento-acta.use-case.js';
import { GenerarDocumentoActaDto } from './dto/documentos-acta.dto.js';

@ApiTags('Actas de aprobación')
@ApiBearerAuth()
@Controller('actas/:actaId/documentos')
export class DocumentosDelActaController {
  constructor(
    private readonly generar: GenerarDocumentoActa,
    private readonly consultar: ConsultarDocumentoActa,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Exportar el acta de aprobación a PDF o Excel',
    description:
      'RF-AC-018 y RF-AC-019. Devuelve 202 y no 201: el documento no existe ' +
      'todavía. Se genera en el worker y el cliente sigue su estado en ' +
      'GET /documentos-acta/:id hasta que pasa a «Listo».',
  })
  @ApiResponse({ status: 202, description: 'Trabajo encolado.' })
  @ApiResponse({ status: 404, description: 'El acta no existe.' })
  async pedir(
    @Param('actaId', ParseUUIDPipe) actaId: string,
    @ActorActual() actor: Actor,
    @Body() dto: GenerarDocumentoActaDto,
  ) {
    return this.generar.encolar(actor, actaId, dto.tipo);
  }

  @Get()
  @ApiOperation({
    summary: 'Documentos generados de un acta',
    description: 'Del más reciente al más antiguo, para poder volver a descargar uno de ayer.',
  })
  async listar(
    @Param('actaId', ParseUUIDPipe) actaId: string,
    @ActorActual() actor: Actor,
    @Query('limite') limite?: string,
  ) {
    const tope = Number(limite);
    return this.consultar.listarDeActa(
      actor,
      actaId,
      Number.isInteger(tope) && tope > 0 && tope <= 100 ? tope : 20,
    );
  }
}

@ApiTags('Actas de aprobación')
@ApiBearerAuth()
@Controller('documentos-acta')
export class DocumentosActaController {
  constructor(private readonly consultar: ConsultarDocumentoActa) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Estado de un documento del acta',
    description:
      'En cola → Generando → Listo, o Fallido con el motivo. La pantalla ' +
      'consulta hasta que deja de estar en curso.',
  })
  @ApiResponse({ status: 404, description: 'El trabajo no existe.' })
  async estado(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.consultar.estado(actor, id);
  }

  @Get(':id/archivo')
  @ApiOperation({
    summary: 'Descargar el documento generado',
    description: 'Solo con el trabajo en estado «Listo».',
  })
  @ApiResponse({ status: 409, description: 'El documento todavía no está listo, o falló.' })
  async descargar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
  ): Promise<StreamableFile> {
    const archivo = await this.consultar.descargar(actor, id);

    // `StreamableFile` en vez de `@Res()`: conserva el filtro de errores y los
    // interceptores globales, como en el resto de controladores de descarga.
    return new StreamableFile(archivo.contenido, {
      type: archivo.tipoMime,
      disposition: `attachment; filename="${nombreSeguro(archivo.nombreArchivo)}"`,
    });
  }
}

/** Nombre apto para una cabecera HTTP: sin comillas, saltos de línea ni acentos. */
function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^\w.-]/g, '_');
}
