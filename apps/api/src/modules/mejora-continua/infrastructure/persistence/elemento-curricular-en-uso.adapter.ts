/**
 * Responde, con las tablas de Mejora Continua, si un objetivo, una competencia
 * o una asignatura del Plan de Estudios todavía se usan aquí (RF-CH-016,
 * RF-CH-018, RF-CH-019). Mismo patrón que `DocenteEnUsoAdapter`: el módulo que
 * quiere borrar pregunta por su puerto, y quien guarda el id responde por lo
 * suyo, sin que ninguno lea las tablas del otro (§3.2).
 *
 * Vive en la raíz de `mejora-continua` y no en un submódulo porque cuenta
 * tablas de los tres: medición, evaluación y mejora. `acciones_acta` no
 * aparece: referencia `plan_mejora_id`, no los elementos, así que queda
 * cubierta por `planes_mejora`.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  ObjetivoEnUsoPort,
  UsoDeObjetivo,
} from '../../../objetivos-educacionales/application/ports/objetivo-en-uso.port.js';
import type {
  ElementoCurricularEnUsoPort,
  UsoDeElemento,
} from '../../../plan-estudios/application/ports/elemento-curricular-en-uso.port.js';

@Injectable()
export class ElementoCurricularEnUsoAdapter
  implements ElementoCurricularEnUsoPort, ObjetivoEnUsoPort
{
  constructor(private readonly prisma: PrismaService) {}

  async competenciaEnUso(competenciaId: string): Promise<UsoDeElemento> {
    const [planesMedicion, programaciones, configuraciones, mediciones, planesMejora] =
      await Promise.all([
        this.prisma.competenciaDelPlan.count({ where: { competenciaId } }),
        this.prisma.programacion.count({ where: { competenciaId } }),
        this.prisma.configuracionCompetencia.count({ where: { competenciaId } }),
        this.prisma.medicionAlcanzada.count({ where: { competenciaId } }),
        this.prisma.planMejora.count({ where: { competenciaId } }),
      ]);

    const motivos: string[] = [];
    if (planesMedicion > 0) motivos.push(`está en ${planesMedicion} plan(es) de medición`);
    if (programaciones > 0) motivos.push(`tiene ${programaciones} programación(es) de medición`);
    if (configuraciones > 0) {
      motivos.push(`tiene ${configuraciones} configuración(es) de evaluación`);
    }
    if (mediciones > 0) motivos.push(`tiene ${mediciones} medición(es) alcanzada(s)`);
    if (planesMejora > 0) motivos.push(`la usan ${planesMejora} plan(es) de mejora`);

    return { enUso: motivos.length > 0, motivos };
  }

  async objetivoEnUso(objetivoId: string): Promise<UsoDeObjetivo> {
    const planesMejora = await this.prisma.planMejora.count({
      where: { objetivoEducacionalId: objetivoId },
    });
    const motivos = planesMejora > 0 ? [`lo usan ${planesMejora} plan(es) de mejora`] : [];
    return { enUso: motivos.length > 0, motivos };
  }

  async asignaturaEnUso(asignaturaId: string): Promise<UsoDeElemento> {
    // `evidencia` cuelga de `asignatura_evaluada` en cascada: contar esta basta.
    const evaluaciones = await this.prisma.asignaturaEvaluada.count({ where: { asignaturaId } });
    const motivos = evaluaciones > 0 ? [`está asignada en ${evaluaciones} evaluación(es)`] : [];
    return { enUso: motivos.length > 0, motivos };
  }
}
