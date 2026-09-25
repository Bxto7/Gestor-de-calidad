/**
 * Traducciones de «mis evaluaciones» (`/mejora-continua/mis-evaluaciones`) a lo que
 * enseña el inicio del Docente. Funciones puras: la página solo las compone.
 *
 * Una evaluación está «pendiente» si no tiene ninguna evidencia, sea de quien sea:
 * lo que importa es que la evaluación quede respaldada, no quién la respaldó.
 * Las fechas son `AAAA-MM-DD` y `hoy` llega por parámetro para que nada dependa del reloj.
 */

import type { EvaluacionAsignada } from '@/features/mejora-continua/api/mis-evidencias.api';
import type { ItemPendiente } from '@/shared/components/ui';

import { plural } from './vista-admin';
import { fechaCorta } from './vista-director';

const DESTINO = '/mis-evidencias';
const MAXIMO_PLAZOS = 5;
/** Un plazo es urgente si vence dentro de menos de esta cantidad de días. */
const DIAS_URGENTE = 7;
const MS_POR_DIA = 86_400_000;

export interface KpisDeDocente {
  readonly asignaturas: number;
  readonly pendientes: number;
  readonly competencias: number;
}

export interface VenceProntoDeDocente {
  readonly titulo: string;
  readonly descripcion: string;
}

/** Hoy como `AAAA-MM-DD` en hora local: el «hoy» del docente no es el de UTC. */
export function fechaLocalIso(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Días de calendario de `hoy` a `fecha`; negativo si ya pasó. */
function diasHasta(fecha: string, hoy: string): number {
  return Math.round(
    (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / MS_POR_DIA,
  );
}

const esPendiente = (e: EvaluacionAsignada): boolean => e.evidencias.length === 0;

/** Pendientes con plazo, la de cierre más cercana primero. Las ya vencidas quedan al frente. */
function pendientesConPlazo(
  evaluaciones: readonly EvaluacionAsignada[],
): (EvaluacionAsignada & { periodo: { fechaCierre: string } })[] {
  return evaluaciones
    .filter(esPendiente)
    .filter(
      (e): e is EvaluacionAsignada & { periodo: { fechaCierre: string } } =>
        e.periodo.fechaCierre !== null,
    )
    .sort(
      (a, b) =>
        a.periodo.fechaCierre.localeCompare(b.periodo.fechaCierre) || a.id.localeCompare(b.id),
    );
}

export function kpisDeDocente(evaluaciones: readonly EvaluacionAsignada[]): KpisDeDocente {
  return {
    asignaturas: new Set(evaluaciones.map((e) => e.asignatura.id)).size,
    pendientes: evaluaciones.filter(esPendiente).length,
    competencias: new Set(evaluaciones.map((e) => e.competencia.id)).size,
  };
}

export function plazosDe(
  evaluaciones: readonly EvaluacionAsignada[],
  hoy: string,
): ItemPendiente[] {
  return pendientesConPlazo(evaluaciones)
    .slice(0, MAXIMO_PLAZOS)
    .map((e) => {
      const cierre = e.periodo.fechaCierre;
      const dias = diasHasta(cierre, hoy);
      const cuando =
        dias < 0 ? `venció el ${fechaCorta(cierre)}` : `vence el ${fechaCorta(cierre)}`;
      return {
        id: e.id,
        texto: `${e.asignatura.nombre} · ${e.competencia.codigo} — ${cuando}`,
        urgente: dias < DIAS_URGENTE,
        href: DESTINO,
      };
    });
}

function cuandoVence(fecha: string, hoy: string): string {
  const dias = diasHasta(fecha, hoy);
  if (dias < 0) return `venció el ${fechaCorta(fecha)}`;
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `vence en ${dias} días`;
}

/** El texto de la tarjeta «Vence pronto»: la pendiente con cierre más cercano, o por qué no hay. */
export function venceProntoDe(
  evaluaciones: readonly EvaluacionAsignada[],
  hoy: string,
): VenceProntoDeDocente {
  const [proxima] = pendientesConPlazo(evaluaciones);
  if (proxima) {
    return {
      titulo: proxima.asignatura.nombre,
      descripcion: `${proxima.entregable} · ${proxima.competencia.codigo} — ${cuandoVence(proxima.periodo.fechaCierre, hoy)}.`,
    };
  }

  const pendientes = evaluaciones.filter(esPendiente).length;
  if (pendientes === 0) {
    return { titulo: 'Estás al día', descripcion: 'No tienes evidencias pendientes por subir.' };
  }
  return {
    titulo: 'Sin fecha de cierre',
    descripcion: `Tienes ${plural(pendientes, 'evidencia pendiente', 'evidencias pendientes')} y ninguna tiene fecha de cierre.`,
  };
}

export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? '';
}

export function subtituloDeDocente(k: KpisDeDocente): string {
  if (k.asignaturas === 0) return 'Aún no tienes evaluaciones asignadas.';
  const asignaturas = plural(k.asignaturas, 'asignatura', 'asignaturas');
  if (k.pendientes === 0) return `No tienes evidencias pendientes en ${asignaturas}.`;
  return `Tienes ${plural(k.pendientes, 'evidencia pendiente', 'evidencias pendientes')} en ${asignaturas}.`;
}
