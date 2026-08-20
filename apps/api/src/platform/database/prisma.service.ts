/**
 * Cliente Prisma como proveedor de NestJS.
 *
 * Es la ÚNICA pieza del sistema que instancia `PrismaClient`. Los repositorios
 * lo reciben inyectado; ninguno abre su propia conexión, o el pool se
 * multiplicaría por cada módulo.
 *
 * Vive en `platform/` y no en `shared-kernel/` porque conoce Prisma: §3.2 deja
 * el shared-kernel para dominio puro, y esto es infraestructura compartida.
 */

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      // Fallar al arrancar y no en la primera consulta: un servicio que levanta
      // sin base de datos solo traslada el error al primer usuario.
      throw new Error('Falta DATABASE_URL. Revisa el .env o las variables del entorno.');
    }

    // Prisma 7 exige un driver adapter explícito; ya no abre la conexión solo.
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.log.log('Conexión a PostgreSQL establecida.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
