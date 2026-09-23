/**
 * Implementa `AcademicoCrossModuloPort` reutilizando `CarreraRepositoryPrisma`
 * — mismo patrón que `AcreditacionCrossModuloAdapter` en `plan-estudios`.
 */

import { Injectable } from '@nestjs/common';

import type { AcademicoCrossModuloPort, DatosCarreraResumen } from '../application/ports/academico-cross-modulo.port.js';
import { CarreraRepositoryPrisma } from './persistence/academico.repository.js';

@Injectable()
export class AcademicoCrossModuloAdapter implements AcademicoCrossModuloPort {
  constructor(private readonly carreras: CarreraRepositoryPrisma) {}

  async carreraPorId(id: string): Promise<DatosCarreraResumen | null> {
    const c = await this.carreras.porId(id);
    return c ? { id: c.id, nombre: c.nombre, codigo: c.codigo, activa: c.activa } : null;
  }

  async carrerasActivas(): Promise<DatosCarreraResumen[]> {
    const activas = await this.carreras.listar({ activa: true });
    return activas.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo, activa: c.activa }));
  }
}
