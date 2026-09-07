/**
 * Implementación del `DirectorioDeUsuariosPort`.
 *
 * Vive en `auth` porque es quien posee la tabla. Quien lo consume depende de la
 * interfaz y nunca de esta clase.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type { DirectorioDeUsuariosPort } from '../application/ports/directorio-usuarios.port.js';

@Injectable()
export class DirectorioDeUsuariosAdapter implements DirectorioDeUsuariosPort {
  constructor(private readonly prisma: PrismaService) {}

  async nombresDe(ids: readonly string[]): Promise<Map<string, string>> {
    // Sin ids no hay consulta: un `IN ()` vacío es un viaje a la base para
    // preguntar por nada.
    if (ids.length === 0) return new Map();

    const filas = await this.prisma.usuario.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, nombreCompleto: true },
    });

    return new Map(filas.map((f) => [f.id, f.nombreCompleto]));
  }

  async porRol(codigoRol: string): Promise<{ id: string; nombre: string }[]> {
    const filas = await this.prisma.usuario.findMany({
      where: { estado: 'ACTIVO', roles: { some: { rol: { codigo: codigoRol } } } },
      select: { id: true, nombreCompleto: true },
      orderBy: { nombreCompleto: 'asc' },
    });
    return filas.map((f) => ({ id: f.id, nombre: f.nombreCompleto }));
  }
}
