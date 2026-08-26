/**
 * Lectura de todo lo que un documento necesita, en una sola consulta.
 *
 * Es un puerto de lectura propio y no una ampliación de los repositorios que ya
 * existen. Los otros están pensados para pantallas: cada uno devuelve su trozo
 * y la pantalla compone. Un documento necesita el plan entero de golpe —
 * carrera, facultad, malla, prerrequisitos, catálogo y flujo de aprobación—, y
 * armarlo llamando a seis repositorios haría seis viajes a la base para algo
 * que el worker resuelve en uno.
 *
 * Ensanchar los puertos existentes para que devolvieran de más habría empeorado
 * las pantallas que sí funcionan bien, que es la razón de que esto viva aparte.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../platform/database/prisma.service.js';
import type { RepositorioDatosDocumentoPort } from '../../application/ports/documentos.port.js';
import type {
  AsignaturaParaDocumento,
  DatosParaDocumento,
} from '../../domain/documentos/armar-documentos.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';

const ESTADO: Readonly<Record<string, EstadoPlan>> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  VIGENTE: 'Vigente',
  HISTORICO: 'Histórico',
};

const CONDICION: Readonly<Record<string, 'Obligatoria' | 'Electiva'>> = {
  OBLIGATORIA: 'Obligatoria',
  ELECTIVA: 'Electiva',
};

const TIPO: Readonly<Record<string, 'General' | 'Transversal' | 'Especialidad'>> = {
  GENERAL: 'General',
  TRANSVERSAL: 'Transversal',
  ESPECIALIDAD: 'Especialidad',
};

@Injectable()
export class DatosDocumentoRepositoryPrisma implements RepositorioDatosDocumentoPort {
  constructor(private readonly prisma: PrismaService) {}

  async datosDe(planId: string): Promise<Omit<DatosParaDocumento, 'generadoEn'> | null> {
    const plan = await this.prisma.planEstudios.findUnique({
      where: { id: planId },
      include: {
        carrera: { include: { facultad: { select: { nombre: true } } } },
        objetivos: {
          include: {
            objetivo: { select: { codigo: true, nombre: true, descripcion: true } },
          },
        },
        competencias: {
          include: {
            competencia: {
              select: {
                codigo: true,
                nombre: true,
                atributos: { select: { atributo: { select: { codigo: true } } } },
              },
            },
          },
        },
        aprobaciones: {
          select: { fecha: true, accion: true, usuarioNombre: true, comentario: true },
        },
        asignaturas: {
          include: {
            ciclo: { select: { numero: true } },
            grupo: { select: { codigo: true, nombre: true, cantidadAElegir: true } },
            // Solo la dirección «esta asignatura depende de». La inversa
            // («quién depende de ella») no se imprime: en un plan de 74 cursos
            // duplicaría cada arista y no aporta nada que no se pueda leer
            // recorriendo la columna de prerrequisitos.
            dependeDe: {
              select: { tipo: true, requiere: { select: { codigo: true } } },
            },
          },
        },
      },
    });

    if (!plan) return null;

    return {
      plan: {
        codigo: plan.codigo,
        version: plan.version,
        estado: ESTADO[plan.estado] ?? 'Borrador',
        duracionAnios: plan.duracionAnios,
        fechaVigencia: plan.fechaVigencia,
      },
      carrera: { nombre: plan.carrera.nombre, codigo: plan.carrera.codigo },
      facultad: plan.carrera.facultad.nombre,
      asignaturas: plan.asignaturas.map(aAsignatura),
      objetivos: plan.objetivos.map((o) => o.objetivo),
      competencias: plan.competencias.map((c) => ({
        codigo: c.competencia.codigo,
        nombre: c.competencia.nombre,
        // Ordenados: el orden de una tabla puente no está garantizado, y dos
        // generaciones del mismo plan no deberían diferir en el orden de una
        // columna.
        atributos: c.competencia.atributos
          .map((a) => a.atributo.codigo)
          .sort((x, y) => x.localeCompare(y, 'es')),
      })),
      aprobaciones: plan.aprobaciones,
    };
  }
}

function aAsignatura(fila: {
  id: string;
  codigo: string;
  nombre: string;
  creditos: number;
  horasTeoricas: number;
  estado: string;
  tipo: string;
  condicion: string;
  ciclo: { numero: number } | null;
  grupo: { codigo: string; nombre: string; cantidadAElegir: number } | null;
  dependeDe: { tipo: string; requiere: { codigo: string } }[];
}): AsignaturaParaDocumento {
  const codigos = (tipo: string): string[] =>
    fila.dependeDe
      .filter((d) => d.tipo === tipo)
      .map((d) => d.requiere.codigo)
      .sort((x, y) => x.localeCompare(y, 'es'));

  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    creditos: fila.creditos,
    horasTeoricas: fila.horasTeoricas,
    // El documento no lista competencias por asignatura, pero el cálculo de
    // créditos comparte forma con el motor de validaciones y este campo va ahí.
    competenciaIds: [],
    cicloNumero: fila.ciclo?.numero ?? null,
    activa: fila.estado === 'ACTIVO',
    condicion: CONDICION[fila.condicion] ?? 'Obligatoria',
    tipo: TIPO[fila.tipo] ?? 'Especialidad',
    grupoElectivo: fila.grupo
      ? { codigo: fila.grupo.codigo, cantidadAElegir: fila.grupo.cantidadAElegir }
      : null,
    grupoNombre: fila.grupo?.nombre ?? null,
    prerrequisitos: codigos('PRERREQUISITO'),
    correquisitos: codigos('CORREQUISITO'),
  };
}
