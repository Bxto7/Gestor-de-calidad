/**
 * Implementa `ObjetivosCrossModuloPort` — mismo patrón que `AcreditacionAdapter`
 * real (inyecta por token de puerto, no por clase concreta de Prisma), no el
 * patrón que tenía el propio `AcreditacionAdapter` antes de que el módulo
 * `objetivos-educacionales` existiera (que sí envolvía la clase concreta
 * directamente porque compartía archivo).
 */

import { Inject, Injectable } from '@nestjs/common';

import {
  REPOSITORIO_OBJETIVO,
  type RepositorioObjetivoPort,
} from '../application/ports/objetivos.port.js';
import type {
  ObjetivosCrossModuloPort,
  DatosObjetivoMejora,
} from '../application/ports/objetivos-cross-modulo.port.js';

@Injectable()
export class ObjetivosCrossModuloAdapter implements ObjetivosCrossModuloPort {
  constructor(@Inject(REPOSITORIO_OBJETIVO) private readonly objetivos: RepositorioObjetivoPort) {}

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
