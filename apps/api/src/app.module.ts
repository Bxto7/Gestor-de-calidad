/**
 * Composición de la aplicación.
 *
 * Aquí es donde los puertos se atan a sus adaptadores. Es el ÚNICO sitio del
 * sistema donde una interfaz de `application/ports/` se encuentra con su
 * implementación de `infrastructure/`: por eso los casos de uso pueden
 * probarse con dobles y no saben qué hay al otro lado.
 *
 * Los casos de uso se registran con `useFactory` y no con `@Injectable`. Es
 * deliberado: mantiene las clases de `application/` libres de decoradores de
 * NestJS, que es lo que exige §3.2 —"la capa de dominio no importa nada de
 * NestJS"— y lo que permite instanciarlas a mano en las pruebas.
 */

import { Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';

import { PrismaService } from './platform/database/prisma.service.js';
import { FiltroErroresDominio } from './platform/http/filtro-errores-dominio.js';

import { AUTHORIZATION_PORT } from './modules/auth/application/ports/authorization.port.js';
import {
  REPOSITORIO_USUARIO,
  SEGURIDAD_PORT,
} from './modules/auth/application/ports/sesion.port.js';
import { IniciarSesion } from './modules/auth/application/use-cases/iniciar-sesion.use-case.js';
import { AuthorizationAdapter } from './modules/auth/infrastructure/authorization.adapter.js';
import { UsuarioRepositoryPrisma } from './modules/auth/infrastructure/usuario.repository.js';
import { Seguridad } from './modules/auth/infrastructure/seguridad.js';
import { JwtGuard } from './modules/auth/infrastructure/http/jwt.guard.js';
import { SesionController } from './modules/auth/infrastructure/http/sesion.controller.js';

import { BitacoraListener } from './modules/auditoria/infrastructure/listeners/bitacora.listener.js';

import {
  REPOSITORIO_APROBACIONES,
  REPOSITORIO_CONTENIDO,
  REPOSITORIO_PLAN,
} from './modules/plan-estudios/application/ports/repositorios.port.js';
import { CambiarEstadoPlan } from './modules/plan-estudios/application/use-cases/cambiar-estado-plan.use-case.js';
import { ConsultarPlan } from './modules/plan-estudios/application/use-cases/consultar-plan.use-case.js';
import { GenerarNuevaVersion } from './modules/plan-estudios/application/use-cases/generar-nueva-version.use-case.js';
import {
  AprobacionesRepositoryPrisma,
  ContenidoRepositoryPrisma,
  PlanRepositoryPrisma,
} from './modules/plan-estudios/infrastructure/persistence/plan.repository.js';
import { PlanesController } from './modules/plan-estudios/infrastructure/http/planes.controller.js';

const PUBLICADOR_EVENTOS = Symbol('PublicadorDeEventos');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),

    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env['JWT_SECRET'];
        // Falla al arrancar y no en el primer login: un servicio que levanta
        // con un secreto vacío firma tokens que cualquiera puede falsificar.
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres.');
        }
        return { secret };
      },
    }),

    // §4.4: límite global además del específico de login.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],

  controllers: [SesionController, PlanesController],

  providers: [
    PrismaService,
    Seguridad,
    BitacoraListener,

    { provide: APP_FILTER, useClass: FiltroErroresDominio },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },

    /* ── Puertos → adaptadores ─────────────────────────────────────────── */
    { provide: AUTHORIZATION_PORT, useClass: AuthorizationAdapter },
    { provide: REPOSITORIO_USUARIO, useClass: UsuarioRepositoryPrisma },
    { provide: SEGURIDAD_PORT, useExisting: Seguridad },
    { provide: REPOSITORIO_PLAN, useClass: PlanRepositoryPrisma },
    { provide: REPOSITORIO_CONTENIDO, useClass: ContenidoRepositoryPrisma },
    { provide: REPOSITORIO_APROBACIONES, useClass: AprobacionesRepositoryPrisma },
    { provide: PUBLICADOR_EVENTOS, useExisting: BitacoraListener },

    /* ── Casos de uso ──────────────────────────────────────────────────── */
    {
      provide: IniciarSesion,
      inject: [REPOSITORIO_USUARIO, SEGURIDAD_PORT],
      useFactory: (usuarios, seguridad) => {
        const log = new Logger('Seguridad');
        return new IniciarSesion(usuarios, seguridad, {
          intentoFallido: (email) => log.warn(`Intento de acceso fallido para ${email}.`),
          reusoDeToken: (usuarioId) =>
            log.error(`Reuso de refresh token revocado (usuario ${usuarioId}). Se revoca la sesión.`),
        });
      },
    },
    {
      provide: ConsultarPlan,
      inject: [REPOSITORIO_PLAN, REPOSITORIO_CONTENIDO, AUTHORIZATION_PORT],
      useFactory: (planes, contenido, autorizacion) =>
        new ConsultarPlan(planes, contenido, autorizacion),
    },
    {
      provide: CambiarEstadoPlan,
      inject: [
        REPOSITORIO_PLAN,
        REPOSITORIO_CONTENIDO,
        REPOSITORIO_APROBACIONES,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (planes, contenido, aprobaciones, autorizacion, eventos) =>
        new CambiarEstadoPlan(planes, contenido, aprobaciones, autorizacion, eventos),
    },
    {
      provide: GenerarNuevaVersion,
      inject: [REPOSITORIO_PLAN, REPOSITORIO_CONTENIDO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (planes, contenido, autorizacion, eventos) =>
        new GenerarNuevaVersion(planes, contenido, autorizacion, eventos, {
          nuevo: () => randomUUID(),
        }),
    },
  ],
})
export class AppModule {}
