/**
 * Implementación del `AcreditacionPort`.
 *
 * Envuelve `RepositorioCriterioPort`, ya existente: no reimplementa ninguna
 * consulta, solo traduce forma — mismo espíritu que `ContenidoCurricularAdapter`.
 * El equivalente para Objetivos es `ObjetivosCrossModuloAdapter`, en
 * `objetivos-educacionales/infrastructure/objetivos-cross-modulo.adapter.ts`
 * desde la Fase 0c.
 */

import { Inject, Injectable } from '@nestjs/common';

import {
  REPOSITORIO_CRITERIO,
  type RepositorioCriterioPort,
} from '../application/ports/acreditacion.port.js';
import type {
  AcreditacionPort,
  DatosCriterioMejora,
} from '../application/ports/acreditacion-cross-modulo.port.js';

@Injectable()
export class AcreditacionAdapter implements AcreditacionPort {
  constructor(@Inject(REPOSITORIO_CRITERIO) private readonly criterios: RepositorioCriterioPort) {}

  async criteriosActivosDe(carreraId: string): Promise<DatosCriterioMejora[]> {
    const filas = await this.criterios.listar(carreraId, { activo: true });
    return filas.map((f) => ({
      id: f.id,
      carreraId: f.carreraId,
      codigo: f.codigo,
      nombre: f.nombre,
    }));
  }

  async criterioPorId(id: string): Promise<DatosCriterioMejora | null> {
    const fila = await this.criterios.porId(id);
    if (!fila) return null;
    return { id: fila.id, carreraId: fila.carreraId, codigo: fila.codigo, nombre: fila.nombre };
  }
}
