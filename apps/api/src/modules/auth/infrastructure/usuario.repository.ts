/**
 * Implementación Prisma del `RepositorioUsuarioPort`.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../platform/database/prisma.service.js';
import type {
  RepositorioUsuarioPort,
  SesionRefresco,
  UsuarioAutenticable,
} from '../application/ports/sesion.port.js';

@Injectable()
export class UsuarioRepositoryPrisma implements RepositorioUsuarioPort {
  constructor(private readonly prisma: PrismaService) {}

  async porEmail(email: string): Promise<UsuarioAutenticable | null> {
    const u = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, nombreCompleto: true, estado: true },
    });
    if (!u) return null;
    return {
      id: u.id,
      passwordHash: u.passwordHash,
      nombreCompleto: u.nombreCompleto,
      activo: u.estado === 'ACTIVO',
    };
  }

  async buscarRefresco(tokenHash: string): Promise<SesionRefresco | null> {
    const t = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiraEn: true,
        revocadoEn: true,
        usuario: { select: { id: true, nombreCompleto: true, estado: true } },
      },
    });
    if (!t) return null;
    return {
      id: t.id,
      expiraEn: t.expiraEn,
      revocadoEn: t.revocadoEn,
      usuario: {
        id: t.usuario.id,
        nombreCompleto: t.usuario.nombreCompleto,
        activo: t.usuario.estado === 'ACTIVO',
      },
    };
  }

  async crearRefresco(datos: {
    usuarioId: string;
    tokenHash: string;
    expiraEn: Date;
  }): Promise<void> {
    await this.prisma.refreshToken.create({ data: datos });
  }

  async revocarRefresco(id: string): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { revocadoEn: new Date() } });
  }

  async revocarTodosDe(usuarioId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }
}
