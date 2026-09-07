/**
 * Implementación Prisma del `RepositorioPlanMedicionPort`.
 *
 * Aquí ocurre la única traducción entre el vocabulario del dominio —«En
 * revisión», con tilde y espacio— y el del enum de PostgreSQL. Mantenerla en un
 * solo sitio evita que `EN_REVISION` se filtre hacia los casos de uso, que
 * hablan del ciclo de vida y no de cómo se guarda.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  CeldaMatriz,
  DatosPlanMedicion,
  FiltroPlanesMedicion,
  RepositorioPlanMedicionPort,
  TipoMedicion,
} from '../../application/ports/plan-medicion.port.js';
import type { EstadoMedicion } from '../../../domain/value-objects/estado-plan.js';
import type { CopiaDelPlan } from '../../domain/services/copia-de-plan.js';

type EstadoBd = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

const A_BD: Readonly<Record<EstadoMedicion, EstadoBd>> = {
  Borrador: 'BORRADOR',
  'En revisión': 'EN_REVISION',
  Aprobado: 'APROBADO',
  Vigente: 'VIGENTE',
  Histórico: 'HISTORICO',
};

const A_DOMINIO = Object.fromEntries(Object.entries(A_BD).map(([k, v]) => [v, k])) as Record<
  string,
  EstadoMedicion
>;

const SELECCION = {
  id: true,
  planEstudiosId: true,
  tipo: true,
  codigo: true,
  version: true,
  meta: true,
  estado: true,
  periodoInicioAnio: true,
  periodoInicioMitad: true,
  creadoEn: true,
  derivadoDeId: true,
  aprobadoPorId: true,
  aprobadoEn: true,
  competencias: { select: { competenciaId: true } },
  periodos: {
    select: { id: true, etiqueta: true, orden: true, fechaCierre: true },
    orderBy: { orden: 'asc' as const },
  },
} as const;

interface Fila {
  id: string;
  planEstudiosId: string;
  tipo: string;
  codigo: string;
  version: number;
  meta: unknown;
  estado: string;
  periodoInicioAnio: number | null;
  periodoInicioMitad: number | null;
  creadoEn: Date;
  derivadoDeId: string | null;
  aprobadoPorId: string | null;
  aprobadoEn: Date | null;
  competencias: { competenciaId: string }[];
  periodos: { id: string; etiqueta: string; orden: number; fechaCierre: Date | null }[];
}

function aDatos(fila: Fila): DatosPlanMedicion {
  return {
    id: fila.id,
    planEstudiosId: fila.planEstudiosId,
    tipo: fila.tipo as TipoMedicion,
    codigo: fila.codigo,
    version: fila.version,
    // `meta` llega como `Prisma.Decimal`; el dominio la quiere como número.
    meta: Number(fila.meta),
    estado: A_DOMINIO[fila.estado] ?? 'Borrador',
    periodoInicio:
      fila.periodoInicioAnio !== null && fila.periodoInicioMitad !== null
        ? { anio: fila.periodoInicioAnio, mitad: fila.periodoInicioMitad as 1 | 2 }
        : null,
    competenciaIds: fila.competencias.map((c) => c.competenciaId),
    periodos: fila.periodos,
    creadoEn: fila.creadoEn,
    derivadoDeId: fila.derivadoDeId,
    aprobadoPorId: fila.aprobadoPorId,
    aprobadoEn: fila.aprobadoEn,
  };
}

@Injectable()
export class PlanMedicionRepositoryPrisma implements RepositorioPlanMedicionPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro?: FiltroPlanesMedicion): Promise<DatosPlanMedicion[]> {
    const texto = filtro?.texto?.trim();
    const filas = await this.prisma.planMedicion.findMany({
      where: {
        ...(filtro?.planEstudiosId ? { planEstudiosId: filtro.planEstudiosId } : {}),
        ...(filtro?.tipo ? { tipo: filtro.tipo } : {}),
        ...(filtro?.estado ? { estado: A_BD[filtro.estado] } : {}),
        ...(texto ? { codigo: { contains: texto, mode: 'insensitive' as const } } : {}),
      },
      select: SELECCION,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aDatos);
  }

  async porId(id: string): Promise<DatosPlanMedicion | null> {
    const fila = await this.prisma.planMedicion.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDatos(fila) : null;
  }

  /** RF-PM-041 RN1. */
  async vigenteDe(planEstudiosId: string, tipo: TipoMedicion): Promise<DatosPlanMedicion | null> {
    const fila = await this.prisma.planMedicion.findFirst({
      where: { planEstudiosId, tipo, estado: 'VIGENTE' },
      select: SELECCION,
    });
    return fila ? aDatos(fila) : null;
  }

  async codigosDe(planEstudiosId: string, tipo: TipoMedicion): Promise<string[]> {
    const filas = await this.prisma.planMedicion.findMany({
      where: { planEstudiosId, tipo },
      select: { codigo: true },
    });
    return filas.map((f) => f.codigo);
  }

  async crear(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    meta: number;
    periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  }): Promise<DatosPlanMedicion> {
    const fila = await this.prisma.planMedicion.create({
      data: {
        planEstudiosId: datos.planEstudiosId,
        tipo: datos.tipo,
        codigo: datos.codigo,
        meta: datos.meta,
        periodoInicioAnio: datos.periodoInicio?.anio ?? null,
        periodoInicioMitad: datos.periodoInicio?.mitad ?? null,
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async actualizar(id: string, datos: { meta?: number }): Promise<DatosPlanMedicion> {
    const fila = await this.prisma.planMedicion.update({
      where: { id },
      data: { ...(datos.meta === undefined ? {} : { meta: datos.meta }) },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  async cambiarEstado(
    id: string,
    estado: EstadoMedicion,
    aprobacion?: { actorId: string; fecha: Date },
  ): Promise<DatosPlanMedicion> {
    const fila = await this.prisma.planMedicion.update({
      where: { id },
      data: {
        estado: A_BD[estado],
        // RF-PM-039. Solo se escriben cuando llegan: una transicion posterior
        // -archivar, por ejemplo- no debe borrar quien aprobo ni cuando.
        ...(aprobacion ? { aprobadoPorId: aprobacion.actorId, aprobadoEn: aprobacion.fecha } : {}),
      },
      select: SELECCION,
    });
    return aDatos(fila);
  }

  /**
   * El contenido copiable del plan, con las celdas referidas por etiqueta.
   *
   * Por etiqueta y no por id porque quien reciba esto va a crear periodos
   * nuevos: el id del origen no le sirve para nada.
   */
  async contenidoDe(id: string): Promise<CopiaDelPlan | null> {
    const plan = await this.porId(id);
    if (!plan) return null;

    const etiquetaDe = new Map(plan.periodos.map((p) => [p.id, p.etiqueta]));
    const celdas = await this.matriz(id);

    return {
      meta: plan.meta,
      periodoInicio: plan.periodoInicio,
      competenciaIds: plan.competenciaIds,
      periodos: plan.periodos.map((p) => ({
        etiqueta: p.etiqueta,
        orden: p.orden,
        fechaCierre: p.fechaCierre,
      })),
      celdas: celdas.flatMap((c) => {
        const etiqueta = etiquetaDe.get(c.periodoId);
        // Una celda cuyo periodo ya no existe no puede copiarse a ningun sitio.
        if (!etiqueta) return [];
        return [
          {
            competenciaId: c.competenciaId,
            periodoEtiqueta: etiqueta,
            realizada: c.realizada,
            realizadaEn: c.realizadaEn,
          },
        ];
      }),
    };
  }

  /** RNF12: todo el contenido en una transaccion. Media copia es peor que ninguna. */
  async copiar(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    version: number;
    derivadoDeId: string | null;
    contenido: CopiaDelPlan;
  }): Promise<DatosPlanMedicion> {
    const { contenido } = datos;

    const id = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.planMedicion.create({
        data: {
          planEstudiosId: datos.planEstudiosId,
          tipo: datos.tipo,
          codigo: datos.codigo,
          version: datos.version,
          derivadoDeId: datos.derivadoDeId,
          meta: contenido.meta,
          periodoInicioAnio: contenido.periodoInicio?.anio ?? null,
          periodoInicioMitad: contenido.periodoInicio?.mitad ?? null,
        },
      });

      if (contenido.competenciaIds.length > 0) {
        await tx.competenciaDelPlan.createMany({
          data: contenido.competenciaIds.map((competenciaId) => ({
            planMedicionId: creado.id,
            competenciaId,
          })),
        });
      }

      if (contenido.periodos.length > 0) {
        await tx.periodoMedicion.createMany({
          data: contenido.periodos.map((p) => ({
            planMedicionId: creado.id,
            etiqueta: p.etiqueta,
            orden: p.orden,
            fechaCierre: p.fechaCierre,
          })),
        });
      }

      if (contenido.celdas.length > 0) {
        // Los ids se leen DESPUES de crear los periodos: `createMany` no los
        // devuelve, y las celdas del origen apuntan a periodos de otro plan.
        const nuevos = await tx.periodoMedicion.findMany({
          where: { planMedicionId: creado.id },
          select: { id: true, etiqueta: true },
        });
        const idDe = new Map(nuevos.map((p) => [p.etiqueta, p.id]));

        await tx.programacion.createMany({
          data: contenido.celdas.flatMap((c) => {
            const periodoId = idDe.get(c.periodoEtiqueta);
            if (!periodoId) return [];
            return [
              {
                planMedicionId: creado.id,
                competenciaId: c.competenciaId,
                periodoId,
                realizada: c.realizada,
                realizadaEn: c.realizadaEn,
              },
            ];
          }),
        });
      }

      return creado.id;
    });

    return this.exigir(id);
  }

  /**
   * RF-PM-031: la cadena entera, se pida desde donde se pida.
   *
   * Se sube hasta la raiz por `derivadoDeId` y se baja recogiendo descendientes.
   * En bucle y no con una CTE recursiva: las cadenas son de unos pocos planes y
   * un SQL recursivo aqui seria mas dificil de leer que de ejecutar.
   *
   * El conjunto `vistos` no es paranoia gratuita: la clave foranea no impide un
   * ciclo, y sin el una cadena mal formada colgaria el proceso.
   */
  async linajeDe(id: string): Promise<DatosPlanMedicion[]> {
    let raiz = await this.prisma.planMedicion.findUnique({
      where: { id },
      select: { id: true, derivadoDeId: true },
    });
    if (!raiz) return [];

    const vistos = new Set<string>([raiz.id]);
    while (raiz?.derivadoDeId && !vistos.has(raiz.derivadoDeId)) {
      vistos.add(raiz.derivadoDeId);
      raiz = await this.prisma.planMedicion.findUnique({
        where: { id: raiz.derivadoDeId },
        select: { id: true, derivadoDeId: true },
      });
    }
    if (!raiz) return [];

    const cadena: string[] = [];
    const pendientes = [raiz.id];
    while (pendientes.length > 0) {
      const actual = pendientes.shift()!;
      cadena.push(actual);
      const hijos = await this.prisma.planMedicion.findMany({
        where: { derivadoDeId: actual },
        select: { id: true },
      });
      pendientes.push(...hijos.map((h) => h.id));
    }

    const planes = await Promise.all(cadena.map((c) => this.porId(c)));
    // RF-PM-031 RN1: de la mas reciente a la mas antigua.
    return planes
      .filter((p): p is DatosPlanMedicion => p !== null)
      .sort((a, b) => b.version - a.version);
  }

  /**
   * RF-PM-041 RN1: como mucho un Vigente por plan de estudios y tipo.
   *
   * Las dos escrituras van en una transaccion. Sueltas, un fallo entre medias
   * dejaria el programa sin ningun plan vigente o con dos, y el indice parcial
   * rechazaria la segunda dejando la primera a medias.
   */
  async marcarVigenteRelevando(
    id: string,
  ): Promise<{ plan: DatosPlanMedicion; relevado: DatosPlanMedicion | null }> {
    const plan = await this.exigir(id);

    const anterior = await this.prisma.planMedicion.findFirst({
      where: {
        planEstudiosId: plan.planEstudiosId,
        tipo: plan.tipo,
        estado: 'VIGENTE',
        id: { not: id },
      },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Primero archivar: al reves, el indice parcial rechazaria el segundo
      // VIGENTE antes de que el primero dejara de serlo.
      if (anterior) {
        await tx.planMedicion.update({
          where: { id: anterior.id },
          data: { estado: 'HISTORICO' },
        });
      }
      await tx.planMedicion.update({ where: { id }, data: { estado: 'VIGENTE' } });
    });

    return {
      plan: await this.exigir(id),
      relevado: anterior ? await this.exigir(anterior.id) : null,
    };
  }

  async eliminar(id: string): Promise<void> {
    // Periodos, competencias y matriz caen por cascada del esquema.
    await this.prisma.planMedicion.delete({ where: { id } });
  }

  /** RNF12: atómico. */
  async declararCompetencias(
    id: string,
    competenciaIds: readonly string[],
  ): Promise<DatosPlanMedicion> {
    await this.prisma.$transaction([
      this.prisma.competenciaDelPlan.deleteMany({ where: { planMedicionId: id } }),
      this.prisma.competenciaDelPlan.createMany({
        data: competenciaIds.map((competenciaId) => ({ planMedicionId: id, competenciaId })),
      }),
    ]);
    return this.exigir(id);
  }

  /**
   * RNF12: atómico. Las celdas de los periodos que desaparecen caen por la
   * cascada de `Programacion.periodo`, que es lo que RF-PM-016 permite hacer
   * mientras el plan está en Borrador.
   *
   * El periodo que **sigue ahí** conserva su programación. Como se borra y se
   * recrea, su fila nace con otro id y la cascada se llevaría también sus
   * celdas; se reinyectan emparejando por etiqueta, que es lo que identifica a
   * un periodo para quien lo usa. Sin esto, fijar la fecha de cierre —que
   * RF-PM-017 exige para aprobar, y que obliga a reenviar la lista entera—
   * borraría la matriz de todo plan justo antes de aprobarlo.
   *
   * Es el mismo criterio que `programar` aplica a las marcas de realizada.
   */
  async declararPeriodos(
    id: string,
    periodos: readonly { etiqueta: string; orden: number; fechaCierre: Date | null }[],
  ): Promise<DatosPlanMedicion> {
    await this.prisma.$transaction(async (tx) => {
      // Qué etiqueta tenía cada celda, antes de que los ids cambien.
      const anteriores = await tx.periodoMedicion.findMany({
        where: { planMedicionId: id },
        select: { id: true, etiqueta: true },
      });
      const etiquetaDe = new Map(anteriores.map((p) => [p.id, p.etiqueta]));

      const celdas = await tx.programacion.findMany({ where: { planMedicionId: id } });

      await tx.periodoMedicion.deleteMany({ where: { planMedicionId: id } });
      await tx.periodoMedicion.createMany({
        data: periodos.map((p) => ({
          planMedicionId: id,
          etiqueta: p.etiqueta,
          orden: p.orden,
          fechaCierre: p.fechaCierre,
        })),
      });

      if (celdas.length === 0) return;

      const nuevos = await tx.periodoMedicion.findMany({
        where: { planMedicionId: id },
        select: { id: true, etiqueta: true },
      });
      const idDe = new Map(nuevos.map((p) => [p.etiqueta, p.id]));

      const rescatadas = celdas.flatMap((c) => {
        const nuevoId = idDe.get(etiquetaDe.get(c.periodoId) ?? '');
        // Sin equivalente: el periodo desapareció de verdad y la celda con él.
        if (!nuevoId) return [];
        return [
          {
            planMedicionId: id,
            competenciaId: c.competenciaId,
            periodoId: nuevoId,
            realizada: c.realizada,
            realizadaEn: c.realizadaEn,
            realizadaPorId: c.realizadaPorId,
          },
        ];
      });

      if (rescatadas.length > 0) await tx.programacion.createMany({ data: rescatadas });
    });

    return this.exigir(id);
  }

  async matriz(id: string): Promise<CeldaMatriz[]> {
    // Selección mínima: la prueba de RNF04 pide 750 filas, y traer el plan
    // entero por cada una las multiplicaría sin que nadie las use.
    return this.prisma.programacion.findMany({
      where: { planMedicionId: id },
      select: { competenciaId: true, periodoId: true, realizada: true, realizadaEn: true },
    });
  }

  /**
   * Reemplaza la programación completa, conservando las marcas de realizada.
   *
   * Se leen antes de borrar y se reinyectan en las celdas que siguen presentes:
   * quitar y volver a poner una competencia en la matriz no puede borrar la
   * constancia de que su medición ya ocurrió.
   */
  async programar(
    id: string,
    celdas: readonly { competenciaId: string; periodoId: string }[],
  ): Promise<CeldaMatriz[]> {
    const previas = new Map(
      (await this.matriz(id)).map((c) => [`${c.competenciaId}|${c.periodoId}`, c]),
    );

    await this.prisma.$transaction([
      this.prisma.programacion.deleteMany({ where: { planMedicionId: id } }),
      this.prisma.programacion.createMany({
        data: celdas.map((c) => {
          const previa = previas.get(`${c.competenciaId}|${c.periodoId}`);
          return {
            planMedicionId: id,
            competenciaId: c.competenciaId,
            periodoId: c.periodoId,
            realizada: previa?.realizada ?? false,
            realizadaEn: previa?.realizadaEn ?? null,
          };
        }),
      }),
    ]);

    return this.matriz(id);
  }

  /** RF-PM-026 RN2: con usuario y fecha. Desmarcar las limpia. */
  async marcarRealizada(
    id: string,
    competenciaId: string,
    periodoId: string,
    realizada: boolean,
    actorId: string,
  ): Promise<CeldaMatriz> {
    const fila = await this.prisma.programacion.update({
      where: {
        planMedicionId_competenciaId_periodoId: {
          planMedicionId: id,
          competenciaId,
          periodoId,
        },
      },
      data: {
        realizada,
        realizadaEn: realizada ? new Date() : null,
        realizadaPorId: realizada ? actorId : null,
      },
      select: { competenciaId: true, periodoId: true, realizada: true, realizadaEn: true },
    });
    return fila;
  }

  /** Relee el plan tras una escritura parcial. */
  private async exigir(id: string): Promise<DatosPlanMedicion> {
    const plan = await this.porId(id);
    if (!plan) throw new Error(`El plan de medición ${id} desapareció durante la operación.`);
    return plan;
  }
}
