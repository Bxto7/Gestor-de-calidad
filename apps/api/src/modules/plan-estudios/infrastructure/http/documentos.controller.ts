/**
 * Endpoints de generación y descarga de documentos.
 *
 * Solicitar y consultar cuelgan de sitios distintos a propósito: pedir un
 * documento es una acción sobre un plan (`/planes/:id/documentos`), mientras que
 * el trabajo resultante tiene vida propia y se consulta por su identificador
 * (`/documentos/:id`). Colgar la consulta del plan obligaría al cliente a
 * recordar de qué plan era cada descarga.
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

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import {
  ConsultarDocumento,
  SolicitarDocumento,
} from '../../application/use-cases/generar-documentos.use-case.js';
import { SolicitarDocumentoDto } from './dto/documentos.dto.js';

@ApiTags('Documentos')
@ApiBearerAuth()
@Controller('planes/:planId/documentos')
export class DocumentosDelPlanController {
  constructor(
    private readonly solicitar: SolicitarDocumento,
    private readonly consultar: ConsultarDocumento,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Solicitar la generación de un documento',
    description:
      'RF072, RF073, RF084 y RF092. Devuelve 202 y no 201: el documento no ' +
      'existe todavía. Se genera en el worker (§3.4) y el cliente sigue su ' +
      'estado en GET /documentos/:id hasta que pasa a «Listo».',
  })
  @ApiResponse({ status: 202, description: 'Trabajo encolado.' })
  @ApiResponse({ status: 409, description: 'El plan no cumple las precondiciones del documento.' })
  async pedir(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Body() dto: SolicitarDocumentoDto,
  ) {
    return this.solicitar.ejecutar(actor, planId, dto.tipo);
  }

  @Get()
  @ApiOperation({
    summary: 'Documentos generados de un plan',
    description: 'Del más reciente al más antiguo, para poder volver a descargar uno de ayer.',
  })
  async listar(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Query('limite') limite?: string,
  ) {
    const tope = Number(limite);
    return this.consultar.listarDePlan(
      actor,
      planId,
      Number.isInteger(tope) && tope > 0 && tope <= 100 ? tope : 20,
    );
  }
}

@ApiTags('Documentos')
@ApiBearerAuth()
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly consultar: ConsultarDocumento) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Estado de un documento',
    description:
      'En cola → Generando → Listo, o Fallido con el motivo. La pantalla ' +
      'consulta este endpoint hasta que deja de estar en curso.',
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

    // `StreamableFile` en vez de `@Res()`: usar la respuesta de Express en
    // crudo desactivaría el filtro de errores y los interceptores globales
    // para esta ruta, y entonces un fallo aquí saldría con un formato distinto
    // al del resto de la API.
    return new StreamableFile(archivo.contenido, {
      type: archivo.tipoMime,
      // `attachment`: sin esto el navegador intentaría enseñar el PDF en una
      // pestaña con el nombre feo del identificador, en vez de descargarlo con
      // el nombre que lo identifica.
      disposition: `attachment; filename="${nombreSeguro(archivo.nombreArchivo)}"`,
    });
  }
}

/**
 * Nombre de archivo apto para una cabecera HTTP.
 *
 * Las comillas y los saltos de línea permitirían inyectar cabeceras, y los
 * acentos no son válidos en `filename` sin la forma extendida `filename*`. Los
 * nombres los genera el sistema a partir del código del plan, así que en la
 * práctica ya son seguros; esto lo mantiene cierto si algún día dejan de serlo.
 */
function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^\w.-]/g, '_');
}
