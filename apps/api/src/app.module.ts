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

import {
  AUTHORIZATION_PORT,
  type AuthorizationPort,
} from './modules/auth/application/ports/authorization.port.js';
import {
  REPOSITORIO_USUARIO,
  SEGURIDAD_PORT,
  type RepositorioUsuarioPort,
  type SeguridadPort,
} from './modules/auth/application/ports/sesion.port.js';
import { IniciarSesion } from './modules/auth/application/use-cases/iniciar-sesion.use-case.js';
import { AuthorizationAdapter } from './modules/auth/infrastructure/authorization.adapter.js';
import { UsuarioRepositoryPrisma } from './modules/auth/infrastructure/usuario.repository.js';
import { Seguridad } from './modules/auth/infrastructure/seguridad.js';
import { JwtGuard } from './modules/auth/infrastructure/http/jwt.guard.js';
import { SesionController } from './modules/auth/infrastructure/http/sesion.controller.js';

import type { PublicadorDeEventos } from './shared-kernel/domain-events/domain-event.js';

import { BitacoraListener } from './modules/auditoria/infrastructure/listeners/bitacora.listener.js';

import {
  REPOSITORIO_ASIGNATURA,
  type RepositorioAsignaturaPort,
} from './modules/plan-estudios/application/ports/asignatura.port.js';
import {
  REPOSITORIO_CARRERA,
  REPOSITORIO_FACULTAD,
  type RepositorioCarreraPort,
  type RepositorioFacultadPort,
} from './modules/plan-estudios/application/ports/estructura.port.js';
import {
  REPOSITORIO_MALLA,
  type RepositorioMallaPort,
} from './modules/plan-estudios/application/ports/malla.port.js';
import {
  REPOSITORIO_APROBACIONES,
  REPOSITORIO_CONTENIDO,
  REPOSITORIO_PLAN,
  type RepositorioAprobacionesPort,
  type RepositorioContenidoPort,
  type RepositorioPlanPort,
} from './modules/plan-estudios/application/ports/repositorios.port.js';
import { CambiarEstadoPlan } from './modules/plan-estudios/application/use-cases/cambiar-estado-plan.use-case.js';
import { ConsultarPlan } from './modules/plan-estudios/application/use-cases/consultar-plan.use-case.js';
import { GenerarNuevaVersion } from './modules/plan-estudios/application/use-cases/generar-nueva-version.use-case.js';
import {
  GestionarCarreras,
  GestionarFacultades,
} from './modules/plan-estudios/application/use-cases/gestionar-estructura.use-case.js';
import { GestionarAsignaturas } from './modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.js';
import { UbicarAsignatura } from './modules/plan-estudios/application/use-cases/ubicar-asignatura.use-case.js';
import {
  AprobacionesRepositoryPrisma,
  ContenidoRepositoryPrisma,
  PlanRepositoryPrisma,
} from './modules/plan-estudios/infrastructure/persistence/plan.repository.js';
import { PlanesController } from './modules/plan-estudios/infrastructure/http/planes.controller.js';
import {
  CarrerasController,
  FacultadesController,
} from './modules/plan-estudios/infrastructure/http/estructura.controller.js';
import { MallaController } from './modules/plan-estudios/infrastructure/http/malla.controller.js';
import {
  AsignaturasController,
  AsignaturasDelPlanController,
} from './modules/plan-estudios/infrastructure/http/asignaturas.controller.js';
import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from './modules/plan-estudios/infrastructure/persistence/estructura.repository.js';
import { MallaRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/malla.repository.js';
import { AsignaturaRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/asignatura.repository.js';

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

  controllers: [
    SesionController,
    FacultadesController,
    CarrerasController,
    PlanesController,
    MallaController,
    AsignaturasDelPlanController,
    AsignaturasController,
  ],

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
    { provide: REPOSITORIO_FACULTAD, useClass: FacultadRepositoryPrisma },
    { provide: REPOSITORIO_CARRERA, useClass: CarreraRepositoryPrisma },
    { provide: REPOSITORIO_MALLA, useClass: MallaRepositoryPrisma },
    { provide: REPOSITORIO_ASIGNATURA, useClass: AsignaturaRepositoryPrisma },
    { provide: PUBLICADOR_EVENTOS, useExisting: BitacoraListener },

    /* ── Casos de uso ──────────────────────────────────────────────────── */
    {
      provide: IniciarSesion,
      inject: [REPOSITORIO_USUARIO, SEGURIDAD_PORT],
      useFactory: (usuarios: RepositorioUsuarioPort, seguridad: SeguridadPort) => {
        const log = new Logger('Seguridad');
        return new IniciarSesion(usuarios, seguridad, {
          intentoFallido: (email) => log.warn(`Intento de acceso fallido para ${email}.`),
          reusoDeToken: (usuarioId) =>
            log.error(
              `Reuso de refresh token revocado (usuario ${usuarioId}). Se revoca la sesión.`,
            ),
        });
      },
    },
    {
      provide: GestionarFacultades,
      inject: [REPOSITORIO_FACULTAD, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        facultades: RepositorioFacultadPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarFacultades(facultades, autorizacion, eventos),
    },
    {
      provide: GestionarCarreras,
      inject: [REPOSITORIO_CARRERA, REPOSITORIO_FACULTAD, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        carreras: RepositorioCarreraPort,
        facultades: RepositorioFacultadPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarCarreras(carreras, facultades, autorizacion, eventos),
    },
    {
      provide: GestionarAsignaturas,
      inject: [
        REPOSITORIO_ASIGNATURA,
        REPOSITORIO_PLAN,
        REPOSITORIO_CONTENIDO,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        asignaturas: RepositorioAsignaturaPort,
        planes: RepositorioPlanPort,
        contenido: RepositorioContenidoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarAsignaturas(asignaturas, planes, contenido, autorizacion, eventos),
    },
    {
      provide: UbicarAsignatura,
      inject: [
        REPOSITORIO_MALLA,
        REPOSITORIO_PLAN,
        REPOSITORIO_CONTENIDO,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        malla: RepositorioMallaPort,
        planes: RepositorioPlanPort,
        contenido: RepositorioContenidoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new UbicarAsignatura(malla, planes, contenido, autorizacion, eventos),
    },
    {
      provide: ConsultarPlan,
      inject: [REPOSITORIO_PLAN, REPOSITORIO_CONTENIDO, AUTHORIZATION_PORT],
      useFactory: (
        planes: RepositorioPlanPort,
        contenido: RepositorioContenidoPort,
        autorizacion: AuthorizationPort,
      ) => new ConsultarPlan(planes, contenido, autorizacion),
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
      useFactory: (
        planes: RepositorioPlanPort,
        contenido: RepositorioContenidoPort,
        aprobaciones: RepositorioAprobacionesPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new CambiarEstadoPlan(planes, contenido, aprobaciones, autorizacion, eventos),
    },
    {
      provide: GenerarNuevaVersion,
      inject: [REPOSITORIO_PLAN, REPOSITORIO_CONTENIDO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        planes: RepositorioPlanPort,
        contenido: RepositorioContenidoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new GenerarNuevaVersion(planes, contenido, autorizacion, eventos, {
          nuevo: () => randomUUID(),
        }),
    },
  ],
})
export class AppModule {}
