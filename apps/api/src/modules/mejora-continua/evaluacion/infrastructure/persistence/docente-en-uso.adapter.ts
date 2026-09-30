import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  DocenteEnUsoPort,
  UsoDeDocente,
} from '../../../../auth/application/ports/docente-en-uso.port.js';

/**
 * Las tres tablas de Mejora Continua que guardan el id de un docente sin clave
 * foránea, para que `auth` sepa si puede borrar una cuenta (RF-CH-014).
 *
 * Cuando exista la responsabilidad de acciones de mejora sobre un docente
 * registrado (bloque de Mejora Continua), su tabla se añade aquí.
 */
@Injectable()
export class DocenteEnUsoAdapter implements DocenteEnUsoPort {
  constructor(private readonly prisma: PrismaService) {}

  async enUso(docenteId: string): Promise<UsoDeDocente> {
    const [asignaturas, configuraciones, evidencias] = await Promise.all([
      this.prisma.asignaturaEvaluada.count({ where: { docenteId } }),
      this.prisma.configuracionCompetencia.count({ where: { responsableId: docenteId } }),
      this.prisma.evidencia.count({ where: { registradaPorId: docenteId } }),
    ]);

    const motivos: string[] = [];
    if (asignaturas > 0) {
      motivos.push(`tiene ${asignaturas} asignatura(s) asignada(s) en planes de evaluación`);
    }
    if (configuraciones > 0) {
      motivos.push(`es responsable de ${configuraciones} configuración(es) de evaluación`);
    }
    if (evidencias > 0) {
      motivos.push(`tiene ${evidencias} evidencia(s) registrada(s)`);
    }

    return { enUso: motivos.length > 0, motivos };
  }
}
