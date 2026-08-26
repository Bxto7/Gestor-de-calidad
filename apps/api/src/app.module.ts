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

import { Module } from '@nestjs/common';
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
import { ConsultarSesion } from './modules/auth/application/use-cases/consultar-sesion.use-case.js';
import { IniciarSesion } from './modules/auth/application/use-cases/iniciar-sesion.use-case.js';
import { AuthorizationAdapter } from './modules/auth/infrastructure/authorization.adapter.js';
import { UsuarioRepositoryPrisma } from './modules/auth/infrastructure/usuario.repository.js';
import { Seguridad } from './modules/auth/infrastructure/seguridad.js';
import { JwtGuard } from './modules/auth/infrastructure/http/jwt.guard.js';
import { SesionController } from './modules/auth/infrastructure/http/sesion.controller.js';
import {
  REPOSITORIO_GESTION_USUARIOS,
  type RepositorioGestionUsuariosPort,
} from './modules/auth/application/ports/gestion-usuarios.port.js';
import { GestionarUsuarios } from './modules/auth/application/use-cases/gestionar-usuarios.use-case.js';
import { GestionUsuariosRepositoryPrisma } from './modules/auth/infrastructure/persistence/gestion-usuarios.repository.js';
import { UsuariosController } from './modules/auth/infrastructure/http/usuarios.controller.js';
import { RegistroDeSeguridadBitacora } from './modules/auth/infrastructure/registro-de-seguridad.js';

import type { PublicadorDeEventos } from './shared-kernel/domain-events/domain-event.js';

import {
  REPOSITORIO_BITACORA,
  type RepositorioBitacoraPort,
} from './modules/auditoria/application/ports/bitacora.port.js';
import { ConsultarBitacora } from './modules/auditoria/application/use-cases/consultar-bitacora.use-case.js';
import { BitacoraController } from './modules/auditoria/infrastructure/http/bitacora.controller.js';
import { BitacoraRepositoryPrisma } from './modules/auditoria/infrastructure/persistence/bitacora.repository.js';
import { BitacoraListener } from './modules/auditoria/infrastructure/listeners/bitacora.listener.js';

import {
  REPOSITORIO_ASIGNATURA,
  type RepositorioAsignaturaPort,
} from './modules/plan-estudios/application/ports/asignatura.port.js';
import {
  REPOSITORIO_COMPETENCIA,
  REPOSITORIO_OBJETIVO,
  type RepositorioCompetenciaPort,
  type RepositorioObjetivoPort,
} from './modules/plan-estudios/application/ports/catalogo.port.js';
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
import { ConsultarHistorial } from './modules/plan-estudios/application/use-cases/consultar-historial.use-case.js';
import { GestionarPlanes } from './modules/plan-estudios/application/use-cases/gestionar-planes.use-case.js';
import {
  GestionarCompetencias,
  GestionarObjetivos,
} from './modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.js';
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
  CompetenciasController,
  ObjetivosController,
} from './modules/plan-estudios/infrastructure/http/catalogo.controller.js';
import {
  CarreraRepositoryPrisma,
  FacultadRepositoryPrisma,
} from './modules/plan-estudios/infrastructure/persistence/estructura.repository.js';
import { MallaRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/malla.repository.js';
import {
  REPOSITORIO_REPORTES,
  type RepositorioReportesPort,
} from './modules/plan-estudios/application/ports/reportes.port.js';
import { ConsultarReportes } from './modules/plan-estudios/application/use-cases/consultar-reportes.use-case.js';
import { ReportesRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/reportes.repository.js';
import { ReportesController } from './modules/plan-estudios/infrastructure/http/reportes.controller.js';
import { AsignaturaRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/asignatura.repository.js';
import {
  CompetenciaRepositoryPrisma,
  ObjetivoRepositoryPrisma,
} from './modules/plan-estudios/infrastructure/persistence/catalogo.repository.js';
import {
  ALMACEN_ARCHIVOS,
  COLA_DOCUMENTOS,
  RENDERIZADOR_HOJA,
  RENDERIZADOR_PDF,
  REPOSITORIO_DATOS_DOCUMENTO,
  REPOSITORIO_DOCUMENTOS,
  type AlmacenDeArchivosPort,
  type ColaDeDocumentosPort,
  type RenderizadorHojaPort,
  type RenderizadorPdfPort,
  type RepositorioDatosDocumentoPort,
  type RepositorioDocumentosPort,
} from './modules/plan-estudios/application/ports/documentos.port.js';
import {
  ConsultarDocumento,
  GenerarDocumento,
  SolicitarDocumento,
} from './modules/plan-estudios/application/use-cases/generar-documentos.use-case.js';
import { DocumentoRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/documentos.repository.js';
import { DatosDocumentoRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/datos-documento.repository.js';
import { AlmacenEnDisco } from './modules/plan-estudios/infrastructure/documents/almacen-en-disco.js';
import { RenderizadorPdfKit } from './modules/plan-estudios/infrastructure/documents/pdfkit.renderer.js';
import { RenderizadorExcelJs } from './modules/plan-estudios/infrastructure/documents/exceljs.renderer.js';
import { ColaDeDocumentosBullMq } from './modules/plan-estudios/infrastructure/queue/documentos.cola.js';
import {
  DocumentosController,
  DocumentosDelPlanController,
} from './modules/plan-estudios/infrastructure/http/documentos.controller.js';

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
    UsuariosController,
    FacultadesController,
    CarrerasController,
    PlanesController,
    MallaController,
    AsignaturasDelPlanController,
    AsignaturasController,
    ObjetivosController,
    CompetenciasController,
    DocumentosDelPlanController,
    DocumentosController,
    ReportesController,
    BitacoraController,
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
    { provide: REPOSITORIO_GESTION_USUARIOS, useClass: GestionUsuariosRepositoryPrisma },
    { provide: SEGURIDAD_PORT, useExisting: Seguridad },
    { provide: REPOSITORIO_PLAN, useClass: PlanRepositoryPrisma },
    { provide: REPOSITORIO_CONTENIDO, useClass: ContenidoRepositoryPrisma },
    { provide: REPOSITORIO_APROBACIONES, useClass: AprobacionesRepositoryPrisma },
    { provide: REPOSITORIO_FACULTAD, useClass: FacultadRepositoryPrisma },
    { provide: REPOSITORIO_CARRERA, useClass: CarreraRepositoryPrisma },
    { provide: REPOSITORIO_MALLA, useClass: MallaRepositoryPrisma },
    { provide: REPOSITORIO_ASIGNATURA, useClass: AsignaturaRepositoryPrisma },
    { provide: REPOSITORIO_BITACORA, useClass: BitacoraRepositoryPrisma },
    { provide: REPOSITORIO_OBJETIVO, useClass: ObjetivoRepositoryPrisma },
    { provide: REPOSITORIO_COMPETENCIA, useClass: CompetenciaRepositoryPrisma },
    { provide: PUBLICADOR_EVENTOS, useExisting: BitacoraListener },
    { provide: REPOSITORIO_DOCUMENTOS, useClass: DocumentoRepositoryPrisma },
    { provide: REPOSITORIO_DATOS_DOCUMENTO, useClass: DatosDocumentoRepositoryPrisma },
    {
      // Por fábrica y no por `useClass`: el constructor lleva un parámetro con
      // valor por defecto, y Nest intentaría inyectar un `string` que ningún
      // proveedor declara.
      provide: ALMACEN_ARCHIVOS,
      useFactory: () => new AlmacenEnDisco(),
    },
    { provide: RENDERIZADOR_PDF, useClass: RenderizadorPdfKit },
    { provide: RENDERIZADOR_HOJA, useClass: RenderizadorExcelJs },
    { provide: COLA_DOCUMENTOS, useClass: ColaDeDocumentosBullMq },
    { provide: REPOSITORIO_REPORTES, useClass: ReportesRepositoryPrisma },

    /* ── Casos de uso ──────────────────────────────────────────────────── */
    {
      provide: IniciarSesion,
      inject: [REPOSITORIO_USUARIO, SEGURIDAD_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        usuarios: RepositorioUsuarioPort,
        seguridad: SeguridadPort,
        eventos: PublicadorDeEventos,
      ) =>
        // El registro va a la bitácora además de al log: la rotación de logs se
        // lleva por delante lo que una revisión de seguridad consulta meses
        // después.
        new IniciarSesion(usuarios, seguridad, new RegistroDeSeguridadBitacora(eventos)),
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
      provide: GestionarUsuarios,
      inject: [REPOSITORIO_GESTION_USUARIOS, SEGURIDAD_PORT, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        usuarios: RepositorioGestionUsuariosPort,
        seguridad: SeguridadPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarUsuarios(usuarios, seguridad, autorizacion, eventos),
    },
    {
      provide: ConsultarSesion,
      inject: [AUTHORIZATION_PORT],
      useFactory: (autorizacion: AuthorizationPort) => new ConsultarSesion(autorizacion),
    },
    {
      provide: GestionarObjetivos,
      inject: [REPOSITORIO_OBJETIVO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        objetivos: RepositorioObjetivoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarObjetivos(objetivos, autorizacion, eventos),
    },
    {
      provide: GestionarCompetencias,
      inject: [REPOSITORIO_COMPETENCIA, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        competencias: RepositorioCompetenciaPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarCompetencias(competencias, autorizacion, eventos),
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
      provide: ConsultarBitacora,
      inject: [REPOSITORIO_BITACORA, AUTHORIZATION_PORT],
      useFactory: (bitacora: RepositorioBitacoraPort, autorizacion: AuthorizationPort) =>
        new ConsultarBitacora(bitacora, autorizacion),
    },
    {
      provide: ConsultarHistorial,
      inject: [
        REPOSITORIO_PLAN,
        REPOSITORIO_ASIGNATURA,
        REPOSITORIO_CONTENIDO,
        REPOSITORIO_APROBACIONES,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        planes: RepositorioPlanPort,
        asignaturas: RepositorioAsignaturaPort,
        contenido: RepositorioContenidoPort,
        aprobaciones: RepositorioAprobacionesPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new ConsultarHistorial(planes, asignaturas, contenido, aprobaciones, autorizacion, eventos),
    },
    {
      provide: GestionarPlanes,
      inject: [REPOSITORIO_PLAN, REPOSITORIO_CONTENIDO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        planes: RepositorioPlanPort,
        contenido: RepositorioContenidoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new GestionarPlanes(planes, contenido, autorizacion, eventos, {
          nuevo: () => randomUUID(),
        }),
    },
    {
      provide: SolicitarDocumento,
      inject: [
        REPOSITORIO_PLAN,
        REPOSITORIO_APROBACIONES,
        REPOSITORIO_DOCUMENTOS,
        COLA_DOCUMENTOS,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        planes: RepositorioPlanPort,
        aprobaciones: RepositorioAprobacionesPort,
        documentos: RepositorioDocumentosPort,
        cola: ColaDeDocumentosPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new SolicitarDocumento(planes, aprobaciones, documentos, cola, autorizacion, eventos),
    },
    {
      provide: ConsultarDocumento,
      inject: [REPOSITORIO_DOCUMENTOS, REPOSITORIO_PLAN, ALMACEN_ARCHIVOS, AUTHORIZATION_PORT],
      useFactory: (
        documentos: RepositorioDocumentosPort,
        planes: RepositorioPlanPort,
        almacen: AlmacenDeArchivosPort,
        autorizacion: AuthorizationPort,
      ) => new ConsultarDocumento(documentos, planes, almacen, autorizacion),
    },
    {
      // Se registra también en la API aunque solo lo ejecute el worker: el
      // módulo del worker importa este mismo, y duplicar la definición allí
      // sería una segunda composición que se desincroniza en el primer cambio.
      provide: GenerarDocumento,
      inject: [
        REPOSITORIO_DOCUMENTOS,
        REPOSITORIO_DATOS_DOCUMENTO,
        ALMACEN_ARCHIVOS,
        RENDERIZADOR_PDF,
        RENDERIZADOR_HOJA,
      ],
      useFactory: (
        documentos: RepositorioDocumentosPort,
        datos: RepositorioDatosDocumentoPort,
        almacen: AlmacenDeArchivosPort,
        pdf: RenderizadorPdfPort,
        hoja: RenderizadorHojaPort,
      ) => new GenerarDocumento(documentos, datos, almacen, pdf, hoja),
    },
    {
      provide: ConsultarReportes,
      inject: [REPOSITORIO_REPORTES, AUTHORIZATION_PORT],
      useFactory: (reportes: RepositorioReportesPort, autorizacion: AuthorizationPort) =>
        new ConsultarReportes(reportes, autorizacion),
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

  // Lo único que sale de aquí: el proceso worker importa este módulo y necesita
  // este caso de uso para atender la cola. El resto sigue siendo interno, para
  // que importar `AppModule` no se convierta en acceso a todo.
  exports: [GenerarDocumento],
})
export class AppModule {}
