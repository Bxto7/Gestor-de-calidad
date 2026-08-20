/**
 * Implementación Prisma de los puertos de persistencia del módulo.
 *
 * Cumple los contratos que declara `application/ports/`. La dirección de la
 * dependencia es la de §3.2: infraestructura conoce aplicación, nunca al revés.
 * Ningún caso de uso importa este archivo.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type {
  AsignaturaDelPlan,
  DatosCarrera,
  RepositorioAprobacionesPort,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../../application/ports/repositorios.port.js';
import { estadoAPrisma, planADominio } from './mapeadores.js';

@Injectable()
export class PlanRepositoryPrisma implements RepositorioPlanPort {
  constructor(private readonly prisma: PrismaService) {}

  async porId(id: string): Promise<PlanDeEstudios | null> {
    const fila = await this.prisma.planEstudios.findUnique({ where: { id } });
    return fila ? planADominio(fila) : null;
  }

  /** RF090: como mucho hay una, garantizado por el índice único parcial. */
  async vigenteDeCarrera(carreraId: string): Promise<PlanDeEstudios | null> {
    const fila = await this.prisma.planEstudios.findFirst({
      where: { carreraId, estado: 'VIGENTE' },
    });
    return fila ? planADominio(fila) : null;
  }

  /** RF075: la versión editable en curso, si existe. */
  async enCursoDeCarrera(carreraId: string): Promise<PlanDeEstudios | null> {
    const fila = await this.prisma.planEstudios.findFirst({
      where: { carreraId, estado: { in: ['BORRADOR', 'EN_REVISION'] } },
      orderBy: { version: 'desc' },
    });
    return fila ? planADominio(fila) : null;
  }

  async ultimaVersionDeCarrera(carreraId: string): Promise<number> {
    const fila = await this.prisma.planEstudios.findFirst({
      where: { carreraId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return fila?.version ?? 0;
  }

  /**
   * Guarda varios planes en UNA transacción.
   *
   * Es lo que hace posible que poner un plan vigente y archivar el anterior
   * ocurran juntos (RF082/RF090). Con escrituras separadas habría un instante
   * con dos planes VIGENTE y el índice único parcial rechazaría el segundo.
   *
   * Es un upsert porque el mismo método sirve para crear y para actualizar: el
   * caso de uso no debería tener que saber cuál de las dos cosas está haciendo.
   */
  async guardar(planes: readonly PlanDeEstudios[]): Promise<void> {
    await this.prisma.$transaction(
      planes.map((plan) =>
        this.prisma.planEstudios.upsert({
          where: { id: plan.id },
          create: {
            id: plan.id,
            carreraId: plan.carreraId,
            codigo: plan.codigo,
            version: plan.version,
            estado: estadoAPrisma(plan.estado),
            duracionAnios: plan.duracionAnios,
            fechaVigencia: plan.fechaVigencia,
            derivadoDeId: plan.derivadoDeId,
          },
          update: {
            estado: estadoAPrisma(plan.estado),
            duracionAnios: plan.duracionAnios,
            fechaVigencia: plan.fechaVigencia,
          },
        }),
      ),
    );
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.planEstudios.delete({ where: { id } });
  }

  /**
   * RF075: copia la malla a la versión nueva.
   *
   * Los identificadores se renuevan a propósito: si se conservaran, editar la
   * copia tocaría también el original. Las competencias de cada asignatura se
   * rehacen apuntando a la asignatura nueva.
   *
   * El ciclo se conserva tal cual porque los ciclos pertenecen a la carrera
   * (§3.3), no al plan: la versión nueva usa exactamente los mismos.
   */
  async copiarContenido(desdePlanId: string, haciaPlanId: string): Promise<void> {
    const origen = await this.prisma.asignatura.findMany({
      where: { planId: desdePlanId },
      include: { competencias: { select: { competenciaId: true } } },
    });
    if (origen.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const a of origen) {
        const nueva = await tx.asignatura.create({
          data: {
            planId: haciaPlanId,
            codigo: a.codigo,
            nombre: a.nombre,
            descripcion: a.descripcion,
            tipo: a.tipo,
            condicion: a.condicion,
            creditos: a.creditos,
            horasTeoricas: a.horasTeoricas,
            cicloId: a.cicloId,
            orden: a.orden,
            estado: a.estado,
          },
          select: { id: true },
        });

        if (a.competencias.length > 0) {
          await tx.asignaturaCompetencia.createMany({
            data: a.competencias.map((c) => ({
              asignaturaId: nueva.id,
              competenciaId: c.competenciaId,
            })),
          });
        }
      }
    });
  }
}

@Injectable()
export class ContenidoRepositoryPrisma implements RepositorioContenidoPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aplana la asignatura a lo que el motor de validaciones necesita.
   *
   * El motor recibe `cicloNumero` y no `cicloId` porque razona sobre la
   * numeración correlativa de RF096; el identificador no le dice nada.
   */
  async asignaturasDe(planId: string): Promise<AsignaturaDelPlan[]> {
    const filas = await this.prisma.asignatura.findMany({
      where: { planId },
      include: {
        ciclo: { select: { numero: true } },
        competencias: { select: { competenciaId: true } },
      },
      orderBy: { codigo: 'asc' },
    });

    return filas.map((a) => ({
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      creditos: a.creditos,
      competenciaIds: a.competencias.map((c) => c.competenciaId),
      cicloNumero: a.ciclo?.numero ?? null,
      activa: a.estado === 'ACTIVO',
    }));
  }

  async objetivoIdsDe(planId: string): Promise<string[]> {
    const filas = await this.prisma.planObjetivo.findMany({
      where: { planId },
      select: { objetivoId: true },
    });
    return filas.map((f) => f.objetivoId);
  }

  async carreraDe(planId: string): Promise<DatosCarrera | null> {
    const plan = await this.prisma.planEstudios.findUnique({
      where: { id: planId },
      select: { carrera: { select: { id: true, codigo: true, duracionAnios: true } } },
    });
    return plan?.carrera ?? null;
  }

  async carreraPorId(carreraId: string): Promise<DatosCarrera | null> {
    return this.prisma.carrera.findUnique({
      where: { id: carreraId },
      select: { id: true, codigo: true, duracionAnios: true },
    });
  }

  /** RF099: solo se guardan justificaciones de reglas no bloqueantes. */
  async reglasJustificadasDe(planId: string): Promise<string[]> {
    const filas = await this.prisma.justificacion.findMany({
      where: { planId },
      select: { codigoRegla: true },
      distinct: ['codigoRegla'],
    });
    return filas.map((f) => f.codigoRegla);
  }
}

@Injectable()
export class AprobacionesRepositoryPrisma implements RepositorioAprobacionesPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RF088 RN1: el responsable no puede modificarse después.
   *
   * Se guarda el nombre además del identificador porque el historial debe
   * seguir siendo legible aunque el usuario se elimine del sistema. Una tabla
   * de evidencia que muestre un UUID no sirve en una auditoría.
   */
  async registrar(evento: {
    planId: string;
    accion: string;
    comentario: string | null;
    usuarioId: string;
    usuarioNombre: string;
  }): Promise<void> {
    await this.prisma.eventoAprobacion.create({ data: evento });
  }
}
