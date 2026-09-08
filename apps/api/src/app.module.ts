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
  REPOSITORIO_ATRIBUTO,
  REPOSITORIO_CRITERIO,
  type RepositorioAtributoPort,
  type RepositorioCriterioPort,
} from './modules/plan-estudios/application/ports/acreditacion.port.js';
import { GestionarAtributos } from './modules/plan-estudios/application/use-cases/gestionar-atributos.use-case.js';
import { GestionarCriterios } from './modules/plan-estudios/application/use-cases/gestionar-criterios.use-case.js';
import { AtributoRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/atributo.repository.js';
import { CriterioRepositoryPrisma } from './modules/plan-estudios/infrastructure/persistence/criterio.repository.js';
import {
  AtributosController,
  AtributosDelPlanController,
  CriteriosController,
  CriteriosDeCarreraController,
} from './modules/plan-estudios/infrastructure/http/acreditacion.controller.js';

/* ── Mejora continua ─────────────────────────────────────────────────────── */
import {
  CONTENIDO_CURRICULAR,
  type ContenidoCurricularPort,
} from './modules/plan-estudios/application/ports/contenido-curricular.port.js';
import { ContenidoCurricularAdapter } from './modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import {
  DIRECTORIO_USUARIOS,
  type DirectorioDeUsuariosPort,
} from './modules/auth/application/ports/directorio-usuarios.port.js';
import { DirectorioDeUsuariosAdapter } from './modules/auth/infrastructure/directorio-usuarios.adapter.js';
import {
  DATOS_DOCUMENTO_MEDICION,
  REPOSITORIO_DOCUMENTOS_MEDICION,
} from './modules/mejora-continua/medicion/application/ports/documentos-medicion.port.js';
import {
  DatosDocumentoMedicionRepositoryPrisma,
  DocumentoMedicionRepositoryPrisma,
} from './modules/mejora-continua/medicion/infrastructure/persistence/documentos-medicion.repository.js';
import type {
  RepositorioDatosDocumentoMedicionPort,
  RepositorioDocumentosMedicionPort,
} from './modules/mejora-continua/medicion/application/ports/documentos-medicion.port.js';
import {
  ConsultarDocumentoMedicion,
  GenerarDocumentoMedicion,
} from './modules/mejora-continua/medicion/application/use-cases/generar-documento-medicion.use-case.js';
import {
  REPOSITORIO_PLAN_MEDICION,
  type RepositorioPlanMedicionPort,
} from './modules/mejora-continua/medicion/application/ports/plan-medicion.port.js';
import { ConfigurarPlanMedicion } from './modules/mejora-continua/medicion/application/use-cases/configurar-plan-medicion.use-case.js';
import { GestionarPlanesMedicion } from './modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.js';
import { VersionarPlanesMedicion } from './modules/mejora-continua/medicion/application/use-cases/versionar-planes-medicion.use-case.js';
import { ProgramarMediciones } from './modules/mejora-continua/medicion/application/use-cases/programar-mediciones.use-case.js';
import { PlanMedicionRepositoryPrisma } from './modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { PlanesMedicionController } from './modules/mejora-continua/medicion/infrastructure/http/planes-medicion.controller.js';
import {
  DocumentosDelPlanMedicionController,
  DocumentosMedicionController,
} from './modules/mejora-continua/medicion/infrastructure/http/documentos-medicion.controller.js';
import {
  REPOSITORIO_PLAN_EVALUACION,
  type RepositorioPlanEvaluacionPort,
} from './modules/mejora-continua/evaluacion/application/ports/plan-evaluacion.port.js';
import { GestionarPlanesEvaluacion } from './modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.js';
import { PlanEvaluacionRepositoryPrisma } from './modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import {
  EvaluacionVigenteController,
  PlanesEvaluacionController,
} from './modules/mejora-continua/evaluacion/infrastructure/http/planes-evaluacion.controller.js';
import {
  REPOSITORIO_CONFIGURACION_EVALUACION,
  type RepositorioConfiguracionEvaluacionPort,
} from './modules/mejora-continua/evaluacion/application/ports/configuracion-evaluacion.port.js';
import { ConfigurarPlanEvaluacion } from './modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from './modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import {
  ConfiguracionEvaluacionController,
  DocentesController,
  EvidenciasController,
} from './modules/mejora-continua/evaluacion/infrastructure/http/configuracion-evaluacion.controller.js';
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
import { AlmacenEnDisco } from './platform/documentos/almacen-en-disco.js';
import { RenderizadorPdfKit } from './platform/documentos/pdfkit.renderer.js';
import { RenderizadorExcelJs } from './platform/documentos/exceljs.renderer.js';
import { ColaDeDocumentosBullMq } from './platform/documentos/cola.js';
import { GENERADORES_DE_DOCUMENTOS } from './platform/documentos/puertos.js';
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
    //
    // Configurable porque una prueba de carga necesita subirlo: con 120 req/min
    // por IP, k6 mediría el rate limiter en vez de la aplicación. En producción
    // se deja el valor por defecto.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env['THROTTLE_LIMIT'] ?? 120) }]),
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
    AtributosController,
    AtributosDelPlanController,
    CriteriosDeCarreraController,
    CriteriosController,
    PlanesMedicionController,
    PlanesEvaluacionController,
    EvaluacionVigenteController,
    ConfiguracionEvaluacionController,
    EvidenciasController,
    DocentesController,
    DocumentosDelPlanMedicionController,
    DocumentosMedicionController,
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
    { provide: REPOSITORIO_ATRIBUTO, useClass: AtributoRepositoryPrisma },
    { provide: REPOSITORIO_CRITERIO, useClass: CriterioRepositoryPrisma },
    // La frontera entre módulos: lo expone `plan-estudios` y lo consume
    // `mejora-continua`, que solo conoce la interfaz (§3.2).
    { provide: CONTENIDO_CURRICULAR, useClass: ContenidoCurricularAdapter },
    { provide: REPOSITORIO_PLAN_MEDICION, useClass: PlanMedicionRepositoryPrisma },
    { provide: REPOSITORIO_PLAN_EVALUACION, useClass: PlanEvaluacionRepositoryPrisma },
    {
      provide: REPOSITORIO_CONFIGURACION_EVALUACION,
      useClass: ConfiguracionEvaluacionRepositoryPrisma,
    },
    { provide: PUBLICADOR_EVENTOS, useExisting: BitacoraListener },
    { provide: REPOSITORIO_DOCUMENTOS, useClass: DocumentoRepositoryPrisma },
    { provide: REPOSITORIO_DATOS_DOCUMENTO, useClass: DatosDocumentoRepositoryPrisma },
    // La otra frontera: `auth` pone el nombre donde Mejora Continua solo tiene
    // un identificador, sin que nadie consulte su tabla de usuarios (§3.2).
    { provide: DIRECTORIO_USUARIOS, useClass: DirectorioDeUsuariosAdapter },
    { provide: REPOSITORIO_DOCUMENTOS_MEDICION, useClass: DocumentoMedicionRepositoryPrisma },
    { provide: DATOS_DOCUMENTO_MEDICION, useClass: DatosDocumentoMedicionRepositoryPrisma },
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
      inject: [
        REPOSITORIO_GESTION_USUARIOS,
        SEGURIDAD_PORT,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
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
      provide: GestionarAtributos,
      inject: [REPOSITORIO_ATRIBUTO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        atributos: RepositorioAtributoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarAtributos(atributos, autorizacion, eventos),
    },
    {
      provide: GestionarCriterios,
      inject: [REPOSITORIO_CRITERIO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        criterios: RepositorioCriterioPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarCriterios(criterios, autorizacion, eventos),
    },
    {
      provide: GestionarPlanesMedicion,
      inject: [
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarPlanesMedicion(planes, curricular, autorizacion, eventos),
    },
    {
      provide: GestionarPlanesEvaluacion,
      inject: [
        REPOSITORIO_PLAN_EVALUACION,
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        evaluaciones: RepositorioPlanEvaluacionPort,
        mediciones: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new GestionarPlanesEvaluacion(evaluaciones, mediciones, curricular, autorizacion, eventos),
    },
    {
      provide: ConfigurarPlanEvaluacion,
      inject: [
        REPOSITORIO_PLAN_EVALUACION,
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        REPOSITORIO_CONFIGURACION_EVALUACION,
        DIRECTORIO_USUARIOS,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        evaluaciones: RepositorioPlanEvaluacionPort,
        mediciones: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        configuraciones: RepositorioConfiguracionEvaluacionPort,
        directorio: DirectorioDeUsuariosPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new ConfigurarPlanEvaluacion(
          evaluaciones,
          mediciones,
          curricular,
          configuraciones,
          directorio,
          autorizacion,
          eventos,
        ),
    },
    {
      provide: VersionarPlanesMedicion,
      inject: [
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new VersionarPlanesMedicion(planes, curricular, autorizacion, eventos),
    },
    {
      provide: ConfigurarPlanMedicion,
      inject: [
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new ConfigurarPlanMedicion(planes, curricular, autorizacion, eventos),
    },
    {
      // El puerto curricular entra solo por el alcance por carrera (2c-C): lo
      // que valida el contenido —competencia, periodo— sigue saliendo del
      // propio plan.
      provide: ProgramarMediciones,
      inject: [
        REPOSITORIO_PLAN_MEDICION,
        CONTENIDO_CURRICULAR,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        planes: RepositorioPlanMedicionPort,
        curricular: ContenidoCurricularPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new ProgramarMediciones(planes, curricular, autorizacion, eventos),
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
      ) => new SolicitarDocumento(planes, aprobaciones, documentos, cola, autorizacion, eventos),
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
      provide: GenerarDocumentoMedicion,
      inject: [
        REPOSITORIO_DOCUMENTOS_MEDICION,
        DATOS_DOCUMENTO_MEDICION,
        COLA_DOCUMENTOS,
        ALMACEN_ARCHIVOS,
        RENDERIZADOR_PDF,
        RENDERIZADOR_HOJA,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        documentos: RepositorioDocumentosMedicionPort,
        datos: RepositorioDatosDocumentoMedicionPort,
        cola: ColaDeDocumentosPort,
        almacen: AlmacenDeArchivosPort,
        pdf: RenderizadorPdfPort,
        hoja: RenderizadorHojaPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) =>
        new GenerarDocumentoMedicion(
          documentos,
          datos,
          cola,
          almacen,
          pdf,
          hoja,
          autorizacion,
          eventos,
        ),
    },
    {
      provide: ConsultarDocumentoMedicion,
      inject: [REPOSITORIO_DOCUMENTOS_MEDICION, ALMACEN_ARCHIVOS, AUTHORIZATION_PORT],
      useFactory: (
        documentos: RepositorioDocumentosMedicionPort,
        almacen: AlmacenDeArchivosPort,
        autorizacion: AuthorizationPort,
      ) => new ConsultarDocumentoMedicion(documentos, almacen, autorizacion),
    },
    {
      // El worker despacha por esta clave y no conoce ningún módulo. Añadir un
      // tercero que genere documentos es una entrada más aquí, y nada en
      // `platform/`.
      provide: GENERADORES_DE_DOCUMENTOS,
      inject: [GenerarDocumento, GenerarDocumentoMedicion],
      useFactory: (planEstudios: GenerarDocumento, mejoraContinua: GenerarDocumentoMedicion) => ({
        'plan-estudios': planEstudios,
        'mejora-continua': mejoraContinua,
      }),
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
  // Lo único que el proceso worker necesita de aquí: el registro de generadores
  // por módulo. `GenerarDocumento` seguía exportado por sí mismo desde cuando
  // el worker lo inyectaba directamente, y ya no hace falta.
  exports: [GENERADORES_DE_DOCUMENTOS],
})
export class AppModule {}
