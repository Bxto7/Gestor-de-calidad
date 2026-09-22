/**
 * Endpoints de exportación del acta de aprobación (RF-AC-018, RF-AC-019).
 *
 * Calca `documentos-mejora.controller.ts` a propósito, incluida la cabecera
 * de descarga: mismo reparto que en Mejora, Evaluación, Medición y Plan de
 * Estudios — pedir un documento es una acción sobre el acta
 * (`/actas/:id/documentos`), y el trabajo resultante tiene vida propia y se
 * consulta por su identificador (`/documentos-acta/:id`). Colgar la consulta
 * del acta obligaría al cliente a recordar de qué acta era cada descarga.
 *
 * Las rutas llevan sufijo `-acta` y no comparten espacio con las de
 * medición, evaluación, mejora ni Plan de Estudios porque los
 * identificadores viven en tablas distintas: un `GET /documentos-mejora/:id`
 * con un identificador de aquí devolvería 404 sin explicar por qué.
 *
 * `GenerarDocumentoActa` y `ConsultarDocumentoActa` son dos clases, no una —
 * ver la cabecera de `generar-documento-acta.use-case.ts`. Este controlador
 * solo usa `encolar` (API) y las tres lecturas de la segunda clase;
 * `ejecutar` es del worker y no se expone aquí.
 *
 * Sin test HTTP dedicado — ningún módulo de documentos del proyecto lo
 * tiene (ver `documentos-mejora.controller.ts` y sus gemelos): la cobertura
 * real es el spec del caso de uso con puertos dobles
 * (`generar-documento-acta.spec.ts`) más el spec de integración del
 * repositorio contra Postgres real (`documentos-acta.int.spec.ts`).
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
      'RF-AC-018, RF-AC-019. Devuelve 202 y no 201: el documento no existe ' +
      'todavía. Se genera en el worker y el cliente sigue su estado en ' +
      'GET /documentos-acta/:id hasta que pasa a «Listo».',
  })
  @ApiResponse({ status: 202, description: 'Trabajo encolado.' })
  @ApiResponse({ status: 404, description: 'El acta de aprobación no existe.' })
  async pedir(
    @Param('actaId', ParseUUIDPipe) actaId: string,
    @ActorActual() actor: Actor,
    @Body() dto: GenerarDocumentoActaDto,
  ) {
    return this.generar.encolar(actor, actaId, dto.tipo);
  }

  @Get()
  @ApiOperation({
    summary: 'Documentos generados de un acta de aprobación',
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
    summary: 'Estado de un documento del acta de aprobación',
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
 * nombres los genera el sistema a partir del código del acta, así que en la
 * práctica ya son seguros; esto lo mantiene cierto si algún día dejan de serlo.
 */
function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^\w.-]/g, '_');
}
