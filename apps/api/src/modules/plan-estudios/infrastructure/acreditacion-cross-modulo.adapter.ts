/**
 * Implementación del `AcreditacionPort`.
 *
 * Envuelve `RepositorioCriterioPort`/`RepositorioObjetivoPort`, ya
 * existentes: no reimplementa ninguna consulta, solo traduce forma — mismo
 * espíritu que `ContenidoCurricularAdapter`.
 */

import { Inject, Injectable } from '@nestjs/common';

import { REPOSITORIO_CRITERIO, type RepositorioCriterioPort } from '../application/ports/acreditacion.port.js';
import {
  REPOSITORIO_OBJETIVO,
  type RepositorioObjetivoPort,
} from '../application/ports/catalogo.port.js';
import type {
  AcreditacionPort,
  DatosCriterioMejora,
  DatosObjetivoMejora,
} from '../application/ports/acreditacion-cross-modulo.port.js';

@Injectable()
export class AcreditacionAdapter implements AcreditacionPort {
  constructor(
    @Inject(REPOSITORIO_CRITERIO) private readonly criterios: RepositorioCriterioPort,
    @Inject(REPOSITORIO_OBJETIVO) private readonly objetivos: RepositorioObjetivoPort,
  ) {}

  async criteriosActivosDe(carreraId: string): Promise<DatosCriterioMejora[]> {
    const filas = await this.criterios.listar(carreraId, { activo: true });
    return filas.map((f) => ({ id: f.id, carreraId: f.carreraId, codigo: f.codigo, nombre: f.nombre }));
  }

  async criterioPorId(id: string): Promise<DatosCriterioMejora | null> {
    const fila = await this.criterios.porId(id);
    if (!fila) return null;
    return { id: fila.id, carreraId: fila.carreraId, codigo: fila.codigo, nombre: fila.nombre };
  }

  /** RF-PJ-023 RN1: sin filtro de estado — el requisito no lo pide. */
  async objetivosEducacionales(): Promise<DatosObjetivoMejora[]> {
    const filas = await this.objetivos.listar();
    return filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre }));
  }

  async objetivoPorId(id: string): Promise<DatosObjetivoMejora | null> {
    const fila = await this.objetivos.porId(id);
    if (!fila) return null;
    return { id: fila.id, codigo: fila.codigo, nombre: fila.nombre };
  }
}
