/**
 * Repositorio Prisma de asignaturas.
 *
 * Dos traducciones viven aquí y en ningún otro sitio: los enumerados de tipo y
 * condición (`ESPECIALIDAD` ↔ `'Especialidad'`) y el estado de activación. El
 * dominio usa el vocabulario de los requisitos; PostgreSQL necesita
 * identificadores SQL. Mismo criterio que `mapeadores.ts` aplica a los estados
 * del plan.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type {
  CondicionAsignatura,
  DatosAsignatura,
  DatosAsignaturaEntrada,
  FiltroAsignaturas,
  ImpactoInactivacion,
  RepositorioAsignaturaPort,
  TipoAsignatura,
} from '../../application/ports/asignatura.port.js';
import type {
  CondicionAsignatura as CondicionPrisma,
  Prisma,
  TipoAsignatura as TipoPrisma,
} from '../../../../platform/database/generated/client.js';

const TIPO_A_PRISMA: Readonly<Record<TipoAsignatura, TipoPrisma>> = {
  General: 'GENERAL',
  Transversal: 'TRANSVERSAL',
  Especialidad: 'ESPECIALIDAD',
};
const TIPO_A_DOMINIO: Readonly<Record<TipoPrisma, TipoAsignatura>> = {
  GENERAL: 'General',
  TRANSVERSAL: 'Transversal',
  ESPECIALIDAD: 'Especialidad',
};

const CONDICION_A_PRISMA: Readonly<Record<CondicionAsignatura, CondicionPrisma>> = {
  Obligatoria: 'OBLIGATORIA',
  Electiva: 'ELECTIVA',
};
const CONDICION_A_DOMINIO: Readonly<Record<CondicionPrisma, CondicionAsignatura>> = {
  OBLIGATORIA: 'Obligatoria',
  ELECTIVA: 'Electiva',
};

/** Lo que hay que traer para poder construir un `DatosAsignatura` completo. */
const SELECCION = {
  id: true,
  planId: true,
  codigo: true,
  nombre: true,
  descripcion: true,
  tipo: true,
  condicion: true,
  creditos: true,
  horasTeoricas: true,
  orden: true,
  estado: true,
  creadoEn: true,
  ciclo: { select: { numero: true } },
  competencias: {
    select: { competencia: { select: { id: true, codigo: true, nombre: true } } },
  },
  grupo: { select: { codigo: true, nombre: true, cantidadAElegir: true } },
} satisfies Prisma.AsignaturaSelect;

type FilaAsignatura = Prisma.AsignaturaGetPayload<{ select: typeof SELECCION }>;

@Injectable()
export class AsignaturaRepositoryPrisma implements RepositorioAsignaturaPort {
  constructor(private readonly prisma: PrismaService) {}

  async listar(planId: string, filtro?: FiltroAsignaturas): Promise<DatosAsignatura[]> {
    const filas = await this.prisma.asignatura.findMany({
      where: {
        planId,
        ...(filtro?.tipo ? { tipo: TIPO_A_PRISMA[filtro.tipo] } : {}),
        ...(filtro?.condicion ? { condicion: CONDICION_A_PRISMA[filtro.condicion] } : {}),
        // RF058: `null` en `cicloId` es exactamente "no ubicada en la malla".
        ...(filtro?.sinCiclo === true ? { cicloId: null } : {}),
        ...(filtro?.activa === undefined ? {} : { estado: filtro.activa ? 'ACTIVO' : 'INACTIVO' }),
        ...(filtro?.texto
          ? {
              OR: [
                { nombre: { contains: filtro.texto, mode: 'insensitive' } },
                { codigo: { contains: filtro.texto, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
      select: SELECCION,
    });

    // El orden final —por ciclo, luego posición, luego código— se calcula aquí
    // y no en SQL porque PostgreSQL no puede poner los nulos al final de una
    // columna que llega por relación, y ese es justamente el criterio: las que
    // aún no tienen ciclo van al final, que es donde la pantalla las muestra
    // como pendientes. Un plan tiene decenas de asignaturas, no millones.
    return filas.map(aDominio).sort(porCicloYPosicion);
  }

  async porId(id: string): Promise<DatosAsignatura | null> {
    const fila = await this.prisma.asignatura.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDominio(fila) : null;
  }

  async codigosDe(planId: string): Promise<string[]> {
    // Incluye las inactivas a propósito: su código sigue ocupado y reutilizarlo
    // rompería la unicidad y confundiría el histórico.
    const filas = await this.prisma.asignatura.findMany({
      where: { planId },
      select: { codigo: true },
    });
    return filas.map((f) => f.codigo);
  }

  async crear(
    planId: string,
    codigo: string,
    datos: DatosAsignaturaEntrada,
  ): Promise<DatosAsignatura> {
    const fila = await this.prisma.asignatura.create({
      data: {
        planId,
        codigo,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        tipo: TIPO_A_PRISMA[datos.tipo],
        condicion: CONDICION_A_PRISMA[datos.condicion],
        creditos: datos.creditos,
        horasTeoricas: datos.horasTeoricas,
        competencias: {
          create: datos.competenciaIds.map((competenciaId) => ({ competenciaId })),
        },
      },
      select: SELECCION,
    });
    return aDominio(fila);
  }

  async actualizar(id: string, datos: DatosAsignaturaEntrada): Promise<DatosAsignatura> {
    // Los vínculos con competencias se reemplazan enteros dentro de la misma
    // transacción que el resto de campos: calcular el diferencial daría el mismo
    // resultado con más código, y a medias dejaría la asignatura sin ninguna.
    const fila = await this.prisma.$transaction(async (tx) => {
      await tx.asignaturaCompetencia.deleteMany({ where: { asignaturaId: id } });
      return tx.asignatura.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          descripcion: datos.descripcion,
          tipo: TIPO_A_PRISMA[datos.tipo],
          condicion: CONDICION_A_PRISMA[datos.condicion],
          creditos: datos.creditos,
          horasTeoricas: datos.horasTeoricas,
          competencias: {
            create: datos.competenciaIds.map((competenciaId) => ({ competenciaId })),
          },
        },
        select: SELECCION,
      });
    });
    return aDominio(fila);
  }

  async cambiarEstado(id: string, activa: boolean): Promise<DatosAsignatura> {
    const fila = await this.prisma.asignatura.update({
      where: { id },
      data: {
        estado: activa ? 'ACTIVO' : 'INACTIVO',
        // RF052: "se retira de la malla curricular activa". Se suelta el ciclo
        // al inactivar; si vuelve a activarse, habrá que ubicarla otra vez, que
        // es lo correcto: la malla cambió mientras no estaba.
        ...(activa ? {} : { cicloId: null }),
      },
      select: SELECCION,
    });
    return aDominio(fila);
  }

  async existeNombreEnPlan(planId: string, nombre: string, idIgnorado?: string): Promise<boolean> {
    const fila = await this.prisma.asignatura.findFirst({
      where: {
        planId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(idIgnorado ? { id: { not: idIgnorado } } : {}),
      },
      select: { id: true },
    });
    return fila !== null;
  }

  async competenciasValidas(competenciaIds: readonly string[]): Promise<string[]> {
    const filas = await this.prisma.competencia.findMany({
      where: { id: { in: [...competenciaIds] }, estado: 'ACTIVO' },
      select: { id: true },
    });
    return filas.map((f) => f.id);
  }

  async impactoDeInactivar(id: string): Promise<ImpactoInactivacion> {
    const [dependientes, asignatura] = await Promise.all([
      // Quién la requiere: la asignatura está del lado `requiere_id`.
      this.prisma.dependencia.findMany({
        where: { requiereId: id },
        select: { asignatura: { select: { codigo: true } } },
      }),
      this.prisma.asignatura.findUnique({
        where: { id },
        select: { ciclo: { select: { numero: true } } },
      }),
    ]);

    return {
      dependientes: dependientes.map((d) => d.asignatura.codigo).sort(),
      cicloNumero: asignatura?.ciclo?.numero ?? null,
    };
  }
}

/** Sin ciclo al final; dentro del ciclo, por posición y luego por código. */
function porCicloYPosicion(a: DatosAsignatura, b: DatosAsignatura): number {
  if (a.cicloNumero !== b.cicloNumero) {
    if (a.cicloNumero === null) return 1;
    if (b.cicloNumero === null) return -1;
    return a.cicloNumero - b.cicloNumero;
  }
  if (a.orden !== b.orden) return a.orden - b.orden;
  return a.codigo.localeCompare(b.codigo, 'es');
}

function aDominio(fila: FilaAsignatura): DatosAsignatura {
  return {
    id: fila.id,
    planId: fila.planId,
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    tipo: TIPO_A_DOMINIO[fila.tipo],
    condicion: CONDICION_A_DOMINIO[fila.condicion],
    creditos: fila.creditos,
    horasTeoricas: fila.horasTeoricas,
    cicloNumero: fila.ciclo?.numero ?? null,
    orden: fila.orden,
    activa: fila.estado === 'ACTIVO',
    competencias: fila.competencias.map((c) => c.competencia),
    grupoElectivo: fila.grupo,
    creadoEn: fila.creadoEn,
  };
}
