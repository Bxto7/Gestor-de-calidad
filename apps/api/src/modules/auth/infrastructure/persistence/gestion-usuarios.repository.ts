/**
 * Repositorio Prisma de administración de cuentas.
 *
 * Aparte de `UsuarioRepositoryPrisma`, que solo sirve al login. La razón no es
 * organizativa: aquel es el adaptador de un puerto que deliberadamente no sabe
 * escribir usuarios, y fusionarlos le daría al caso de uso más expuesto del
 * sistema acceso a operaciones que no necesita.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  DatosPermiso,
  DatosRol,
  DatosUsuario,
  DatosUsuarioEntrada,
  FiltroUsuarios,
  RepositorioGestionUsuariosPort,
} from '../../application/ports/gestion-usuarios.port.js';

/** Lo que hay que traer siempre para componer un `DatosUsuario`. */
const INCLUIR = {
  roles: { include: { rol: { select: { codigo: true, nombre: true } } } },
  carreras: { select: { carreraId: true } },
  // Solo el más reciente: basta para la última actividad y evita arrastrar
  // todos los refrescos de la cuenta a memoria.
  refreshTokens: { orderBy: { creadoEn: 'desc' as const }, take: 1, select: { creadoEn: true } },
};

@Injectable()
export class GestionUsuariosRepositoryPrisma implements RepositorioGestionUsuariosPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroUsuarios): Promise<DatosUsuario[]> {
    const filas = await this.prisma.usuario.findMany({
      where: {
        ...(filtro.texto
          ? {
              OR: [
                { nombreCompleto: { contains: filtro.texto, mode: 'insensitive' as const } },
                { email: { contains: filtro.texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(filtro.activo === undefined
          ? {}
          : { estado: filtro.activo ? ('ACTIVO' as const) : ('INACTIVO' as const) }),
        ...(filtro.rol ? { roles: { some: { rol: { codigo: filtro.rol } } } } : {}),
      },
      include: INCLUIR,
      orderBy: { nombreCompleto: 'asc' },
    });

    return filas.map(aUsuario);
  }

  async porId(id: string): Promise<DatosUsuario | null> {
    const fila = await this.prisma.usuario.findUnique({ where: { id }, include: INCLUIR });
    return fila ? aUsuario(fila) : null;
  }

  async existeEmail(email: string, idIgnorado?: string): Promise<boolean> {
    const fila = await this.prisma.usuario.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(idIgnorado ? { id: { not: idIgnorado } } : {}),
      },
      select: { id: true },
    });
    return fila !== null;
  }

  async crear(datos: DatosUsuarioEntrada & { passwordHash: string }): Promise<DatosUsuario> {
    const roles = await this.idsDeRoles(datos.rolCodigos);

    const fila = await this.prisma.usuario.create({
      data: {
        email: datos.email,
        nombreCompleto: datos.nombreCompleto,
        passwordHash: datos.passwordHash,
        roles: { create: roles.map((rolId) => ({ rolId })) },
        ...(datos.carreraId ? { carreras: { create: { carreraId: datos.carreraId } } } : {}),
      },
      include: INCLUIR,
    });

    return aUsuario(fila);
  }

  async actualizar(
    id: string,
    datos: Omit<DatosUsuarioEntrada, 'email'>,
  ): Promise<DatosUsuario> {
    const roles = await this.idsDeRoles(datos.rolCodigos);

    // En una transacción: si se borraran los roles y fallara la inserción, la
    // cuenta quedaría sin ninguno y su dueño no podría hacer nada al entrar.
    const fila = await this.prisma.$transaction(async (tx) => {
      await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioCarrera.deleteMany({ where: { usuarioId: id } });

      return tx.usuario.update({
        where: { id },
        data: {
          nombreCompleto: datos.nombreCompleto,
          roles: { create: roles.map((rolId) => ({ rolId })) },
          ...(datos.carreraId ? { carreras: { create: { carreraId: datos.carreraId } } } : {}),
        },
        include: INCLUIR,
      });
    });

    return aUsuario(fila);
  }

  async cambiarEstado(id: string, activo: boolean): Promise<DatosUsuario> {
    const fila = await this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.usuario.update({
        where: { id },
        data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
        include: INCLUIR,
      });

      // Desactivar sin cortar las sesiones dejaría a la cuenta trabajando hasta
      // que caducara su token: el guard comprueba el estado al refrescar, no en
      // cada petición.
      if (!activo) {
        await tx.refreshToken.updateMany({
          where: { usuarioId: id, revocadoEn: null },
          data: { revocadoEn: new Date() },
        });
      }

      return actualizado;
    });

    return aUsuario(fila);
  }

  async cambiarPassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { usuarioId: id, revocadoEn: null },
        data: { revocadoEn: new Date() },
      }),
    ]);
  }

  async cuantosActivosConRol(rolCodigo: string): Promise<number> {
    return this.prisma.usuario.count({
      where: { estado: 'ACTIVO', roles: { some: { rol: { codigo: rolCodigo } } } },
    });
  }

  async roles(): Promise<DatosRol[]> {
    const filas = await this.prisma.rol.findMany({
      include: {
        permisos: { select: { permiso: { select: { codigo: true } } } },
        _count: { select: { usuarios: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    return filas.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      descripcion: r.descripcion,
      esDelSistema: r.esDelSistema,
      permisos: r.permisos.map((p) => p.permiso.codigo).sort(),
      usuariosAsignados: r._count.usuarios,
    }));
  }

  async permisos(): Promise<DatosPermiso[]> {
    return this.prisma.permiso.findMany({
      select: { codigo: true, descripcion: true, modulo: true },
      orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }],
    });
  }

  async rolesConPermisos(
    codigos: readonly string[],
  ): Promise<{ codigo: string; permisos: string[] }[]> {
    const filas = await this.prisma.rol.findMany({
      where: { codigo: { in: [...codigos] } },
      select: {
        codigo: true,
        permisos: { select: { permiso: { select: { codigo: true } } } },
      },
    });

    return filas.map((r) => ({
      codigo: r.codigo,
      permisos: r.permisos.map((p) => p.permiso.codigo),
    }));
  }

  private async idsDeRoles(codigos: readonly string[]): Promise<string[]> {
    const filas = await this.prisma.rol.findMany({
      where: { codigo: { in: [...codigos] } },
      select: { id: true },
    });
    return filas.map((r) => r.id);
  }
}

function aUsuario(fila: {
  id: string;
  email: string;
  nombreCompleto: string;
  estado: string;
  creadoEn: Date;
  roles: { rol: { codigo: string; nombre: string } }[];
  carreras: { carreraId: string }[];
  refreshTokens: { creadoEn: Date }[];
}): DatosUsuario {
  return {
    id: fila.id,
    email: fila.email,
    nombreCompleto: fila.nombreCompleto,
    activo: fila.estado === 'ACTIVO',
    roles: fila.roles.map((r) => r.rol),
    // Como máximo una: la tabla tiene índice único por usuario.
    carreraId: fila.carreras[0]?.carreraId ?? null,
    creadoEn: fila.creadoEn,
    ultimaActividad: fila.refreshTokens[0]?.creadoEn ?? null,
  };
}
