/**
 * Endpoints de exportación del plan de medición (RF-PM-027 a RF-PM-029).
 *
 * Mismo reparto que en Plan de Estudios: pedir un documento es una acción sobre
 * un plan (`/planes-medicion/:id/documentos`), y el trabajo resultante tiene
 * vida propia y se consulta por su identificador (`/documentos-medicion/:id`).
 * Colgar la consulta del plan obligaría al cliente a recordar de qué plan era
 * cada descarga.
 *
 * Las rutas llevan sufijo `-medicion` y no comparten espacio con las de Plan de
 * Estudios porque los identificadores viven en tablas distintas: un `GET
 * /documentos/:id` con un identificador de aquí devolvería 404 sin explicar por
 * qué.
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
  ConsultarDocumentoMedicion,
  GenerarDocumentoMedicion,
} from '../../application/use-cases/generar-documento-medicion.use-case.js';
import { GenerarDocumentoMedicionDto } from './dto/documentos-medicion.dto.js';

@ApiTags('Planes de medición')
@ApiBearerAuth()
@Controller('planes-medicion/:planId/documentos')
export class DocumentosDelPlanMedicionController {
  constructor(
    private readonly generar: GenerarDocumentoMedicion,
    private readonly consultar: ConsultarDocumentoMedicion,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Exportar el plan de medición a PDF o Excel',
    description:
      'RF-PM-027 a RF-PM-029. Devuelve 202 y no 201: el documento no existe ' +
      'todavía. Se genera en el worker (§3.4) y el cliente sigue su estado en ' +
      'GET /documentos-medicion/:id hasta que pasa a «Listo».',
  })
  @ApiResponse({ status: 202, description: 'Trabajo encolado.' })
  @ApiResponse({ status: 404, description: 'El plan de medición no existe.' })
  async pedir(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Body() dto: GenerarDocumentoMedicionDto,
  ) {
    return this.generar.encolar(actor, planId, dto.tipo);
  }

  @Get()
  @ApiOperation({
    summary: 'Documentos generados de un plan de medición',
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

@ApiTags('Planes de medición')
@ApiBearerAuth()
@Controller('documentos-medicion')
export class DocumentosMedicionController {
  constructor(private readonly consultar: ConsultarDocumentoMedicion) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Estado de un documento del plan de medición',
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
