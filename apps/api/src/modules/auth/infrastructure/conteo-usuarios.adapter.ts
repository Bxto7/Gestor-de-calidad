import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type {
  ConteoDeUsuariosPort,
  ConteoPorCarrera,
} from '../application/ports/conteo-usuarios.port.js';

const DIRECTOR = 'DIRECTOR_CARRERA';

/**
 * Único lugar que lee `usuario_carrera`, `usuarios` y `usuario_rol` para contar.
 * Parte de `usuario` (no de `usuarioCarrera`) porque de ahí salen a la vez el
 * estado, los roles y la carrera; un usuario dirige o pertenece a una sola.
 */
@Injectable()
export class ConteoDeUsuariosAdapter implements ConteoDeUsuariosPort {
  constructor(private readonly prisma: PrismaService) {}

  async conteoPorCarrera(carreraIds: readonly string[]): Promise<Map<string, ConteoPorCarrera>> {
    const pedidas = new Set(carreraIds);
    const conteos = new Map<string, { usuarios: number; directores: number }>(
      [...pedidas].map((id) => [id, { usuarios: 0, directores: 0 }]),
    );
    if (pedidas.size === 0) return conteos;

    const filas = await this.prisma.usuario.findMany({
      where: { estado: 'ACTIVO', carreras: { some: { carreraId: { in: [...pedidas] } } } },
      select: {
        carreras: { select: { carreraId: true } },
        roles: { select: { rol: { select: { codigo: true } } } },
      },
    });

    for (const fila of filas) {
      const esDirector = fila.roles.some((r) => r.rol.codigo === DIRECTOR);
      for (const { carreraId } of fila.carreras) {
        const acumulado = conteos.get(carreraId);
        if (!acumulado) continue;
        acumulado.usuarios += 1;
        if (esDirector) acumulado.directores += 1;
      }
    }

    return conteos;
  }

  totalUsuariosActivos(): Promise<number> {
    return this.prisma.usuario.count({ where: { estado: 'ACTIVO' } });
  }
}
