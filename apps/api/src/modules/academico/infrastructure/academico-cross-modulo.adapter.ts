/**
 * Implementa `AcademicoCrossModuloPort` reutilizando `RepositorioCarreraPort`
 * — mismo patrón que `AcreditacionAdapter` en `plan-estudios`: se inyecta por
 * el token del puerto, no por la clase concreta `CarreraRepositoryPrisma`,
 * para no acoplar este adaptador a Prisma y para que la Task 6 (wiring) solo
 * tenga que registrar un provider por token, no una clase específica.
 */

import { Inject, Injectable } from '@nestjs/common';

import {
  REPOSITORIO_CARRERA,
  type RepositorioCarreraPort,
} from '../application/ports/academico.port.js';
import type {
  AcademicoCrossModuloPort,
  DatosCarreraResumen,
} from '../application/ports/academico-cross-modulo.port.js';

@Injectable()
export class AcademicoCrossModuloAdapter implements AcademicoCrossModuloPort {
  constructor(@Inject(REPOSITORIO_CARRERA) private readonly carreras: RepositorioCarreraPort) {}

  async carreraPorId(id: string): Promise<DatosCarreraResumen | null> {
    const c = await this.carreras.porId(id);
    return c ? { id: c.id, nombre: c.nombre, codigo: c.codigo, activa: c.activa } : null;
  }

  async carrerasActivas(): Promise<DatosCarreraResumen[]> {
    const activas = await this.carreras.listar({ activa: true });
    return activas.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo, activa: c.activa }));
  }
}
