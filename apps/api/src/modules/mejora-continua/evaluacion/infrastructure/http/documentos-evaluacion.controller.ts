/**
 * Endpoints de exportación del plan de evaluación (RF-PE-032 a RF-PE-034).
 *
 * Calca `documentos-medicion.controller.ts` a propósito, incluida la cabecera
 * de descarga: es el mismo reparto que en Plan de Medición y en Plan de
 * Estudios — pedir un documento es una acción sobre un plan
 * (`/planes-evaluacion/:id/documentos`), y el trabajo resultante tiene vida
 * propia y se consulta por su identificador (`/documentos-evaluacion/:id`).
 * Colgar la consulta del plan obligaría al cliente a recordar de qué plan era
 * cada descarga.
 *
 * Las rutas llevan sufijo `-evaluacion` y no comparten espacio con las de
 * medición ni de Plan de Estudios porque los identificadores viven en tablas
 * distintas: un `GET /documentos-medicion/:id` con un identificador de aquí
 * devolvería 404 sin explicar por qué.
 *
 * `GenerarDocumentoEvaluacion` y `ConsultarDocumentoEvaluacion` son dos clases,
 * no una — ver la cabecera de `generar-documento-evaluacion.use-case.ts`. Este
 * controlador solo usa `encolar` (API) y las tres lecturas de la segunda
 * clase; `ejecutar` es del worker y no se expone aquí.
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
  ConsultarDocumentoEvaluacion,
  GenerarDocumentoEvaluacion,
} from '../../application/use-cases/generar-documento-evaluacion.use-case.js';
import { GenerarDocumentoEvaluacionDto } from './dto/documentos-evaluacion.dto.js';

@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('planes-evaluacion/:planId/documentos')
export class DocumentosDelPlanEvaluacionController {
  constructor(
    private readonly generar: GenerarDocumentoEvaluacion,
    private readonly consultar: ConsultarDocumentoEvaluacion,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Exportar el plan de evaluación a PDF o Excel',
    description:
      'RF-PE-032 a RF-PE-034. Devuelve 202 y no 201: el documento no existe ' +
      'todavía. Se genera en el worker (§3.4) y el cliente sigue su estado en ' +
      'GET /documentos-evaluacion/:id hasta que pasa a «Listo».',
  })
  @ApiResponse({ status: 202, description: 'Trabajo encolado.' })
  @ApiResponse({ status: 404, description: 'El plan de evaluación no existe.' })
  async pedir(
    @Param('planId', ParseUUIDPipe) planId: string,
    @ActorActual() actor: Actor,
    @Body() dto: GenerarDocumentoEvaluacionDto,
  ) {
    return this.generar.encolar(actor, planId, dto.tipo);
  }

  @Get()
  @ApiOperation({
    summary: 'Documentos generados de un plan de evaluación',
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

@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('documentos-evaluacion')
export class DocumentosEvaluacionController {
  constructor(private readonly consultar: ConsultarDocumentoEvaluacion) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Estado de un documento del plan de evaluación',
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
