/**
 * Controller de la malla curricular.
 *
 * `PATCH /asignaturas/:id/ubicacion` en vez de tres rutas para asignar, quitar
 * y mover. Las tres son la misma escritura sobre el mismo campo, y separarlas
 * obligaría al cliente a decidir cuál llamar según el estado actual —justo lo
 * que no debería tener que saber al arrastrar una tarjeta.
 */

import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { UbicarAsignatura } from '../../application/use-cases/ubicar-asignatura.use-case.js';
import { UbicarDto } from './dto/malla.dto.js';

@ApiTags('Malla curricular')
@ApiBearerAuth()
@Controller('asignaturas')
export class MallaController {
  constructor(private readonly ubicar: UbicarAsignatura) {}

  @Patch(':id/ubicacion')
  @ApiOperation({
    summary: 'Ubicar, mover o retirar una asignatura de la malla',
    description:
      'RF061, RF062, RF070 y RF071. `cicloNumero: null` la retira de la malla. ' +
      'La respuesta incluye cuántas asignaturas quedan sin ciclo, para que la UI ' +
      'actualice la alerta de RF068 sin recargar el plan.',
  })
  @ApiResponse({ status: 409, description: 'Ciclo fuera de rango, o el plan no admite cambios.' })
  async ubicarAsignatura(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: UbicarDto,
  ) {
    return this.ubicar.ejecutar({
      asignaturaId: id,
      cicloNumero: dto.cicloNumero,
      orden: dto.orden,
      actor,
    });
  }
}
