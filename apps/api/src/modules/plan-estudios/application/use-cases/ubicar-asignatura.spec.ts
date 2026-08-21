/**
 * Pruebas del caso de uso de ubicación en la malla.
 *
 * Es la operación que más veces se ejecuta en la pantalla de malla —una por
 * cada arrastre— y la que más fácil deja la bitácora inservible si registra
 * movimientos que no movieron nada.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type { AsignaturaUbicable, RepositorioMallaPort } from '../ports/malla.port.js';
import type {
  AsignaturaDelPlan,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';
import { UbicarAsignatura } from './ubicar-asignatura.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinador académico' };
const ISI = 'car-isi';

function plan(estado: EstadoPlan): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: 'plan-1',
    carreraId: ISI,
    codigo: 'PE-ISI-2026-v1',
    version: 1,
    estado,
    duracionAnios: 2, // 4 ciclos
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function montar(opciones: {
  asignatura?: AsignaturaUbicable | null;
  plan?: PlanDeEstudios | null;
  permitido?: boolean;
  /** Estado de la malla tras el movimiento, para el resumen de la respuesta. */
  asignaturasTras?: AsignaturaDelPlan[];
}) {
  const ubicaciones: { id: string; ciclo: number | null; orden?: number }[] = [];
  const publicados: DomainEvent[] = [];

  const malla: RepositorioMallaPort = {
    asignaturaPorId: async () =>
      opciones.asignatura === undefined
        ? { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: null }
        : opciones.asignatura,
    ubicar: async (id, ciclo, orden) => void ubicaciones.push({ id, ciclo, orden }),
  };

  const planes = {
    porId: async () => (opciones.plan === undefined ? plan('Borrador') : opciones.plan),
  } as unknown as RepositorioPlanPort;

  const contenido = {
    carreraDe: async () => ({ id: ISI, codigo: 'ISI', duracionAnios: 2 }),
    asignaturasDe: async () =>
      opciones.asignaturasTras ?? [
        {
          id: 'a-1',
          codigo: 'ISI-101',
          nombre: 'A',
          creditos: 4,
          competenciaIds: ['c'],
          cicloNumero: 2,
          activa: true,
          grupoElectivo: null,
        },
        {
          id: 'a-2',
          codigo: 'ISI-102',
          nombre: 'B',
          creditos: 3,
          competenciaIds: ['c'],
          cicloNumero: null,
          activa: true,
          grupoElectivo: null,
        },
      ],
  } as unknown as RepositorioContenidoPort;

  const autorizacion: AuthorizationPort = {
    puede: async () =>
      opciones.permitido === false
        ? { permitido: false, motivo: 'No dirige la carrera.' }
        : { permitido: true },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new UbicarAsignatura(malla, planes, contenido, autorizacion, eventos);

  return { caso, ubicaciones, publicados };
}

describe('Precondiciones', () => {
  it('404 si la asignatura no existe', async () => {
    const { caso } = montar({ asignatura: null });
    await expect(
      caso.ejecutar({ asignaturaId: 'x', cicloNumero: 1, actor: ACTOR }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('404 si el plan no existe', async () => {
    const { caso } = montar({ plan: null });
    await expect(
      caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 1, actor: ACTOR }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('deniega si el actor no dirige esa carrera', async () => {
    const { caso, ubicaciones } = montar({ permitido: false });
    await expect(
      caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 1, actor: ACTOR }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    expect(ubicaciones).toHaveLength(0);
  });
});

describe('RF027 — la malla se congela con el plan', () => {
  it('rechaza mover en Aprobado, Vigente e Histórico', async () => {
    for (const estado of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      const { caso, ubicaciones } = montar({ plan: plan(estado) });
      await expect(
        caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 1, actor: ACTOR }),
        estado,
      ).rejects.toThrow(/no admite cambios/);
      expect(ubicaciones).toHaveLength(0);
    }
  });

  it('permite mover en Borrador y En revisión', async () => {
    for (const estado of ['Borrador', 'En revisión'] as const) {
      const { caso, ubicaciones } = montar({ plan: plan(estado) });
      await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 1, actor: ACTOR });
      expect(ubicaciones, estado).toHaveLength(1);
    }
  });

  it('sugiere generar una nueva versión', async () => {
    const { caso } = montar({ plan: plan('Vigente') });
    await expect(
      caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 1, actor: ACTOR }),
    ).rejects.toThrow(/nueva versión/);
  });
});

describe('RF096 — rango de ciclos de la carrera', () => {
  it('acepta cualquier ciclo dentro del rango', async () => {
    // La carrera dura 2 años: 4 ciclos.
    for (const ciclo of [1, 2, 3, 4]) {
      const { caso, ubicaciones } = montar({});
      await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: ciclo, actor: ACTOR });
      expect(ubicaciones[0]?.ciclo, String(ciclo)).toBe(ciclo);
    }
  });

  it('rechaza un ciclo por encima del rango', async () => {
    const { caso } = montar({});
    await expect(
      caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 5, actor: ACTOR }),
    ).rejects.toThrow(/fuera del rango de la carrera \(1 a 4\)/);
  });

  it('rechaza el ciclo 0 y los negativos', async () => {
    const { caso } = montar({});
    for (const ciclo of [0, -1]) {
      await expect(
        caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: ciclo, actor: ACTOR }),
        String(ciclo),
      ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    }
  });

  it('null no valida rango: es retirar de la malla', async () => {
    const { caso, ubicaciones } = montar({
      asignatura: { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: 2 },
    });
    await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: null, actor: ACTOR });
    expect(ubicaciones[0]?.ciclo).toBeNull();
  });
});

describe('Movimiento sin cambio', () => {
  it('no escribe si se suelta en el mismo ciclo', async () => {
    const { caso, ubicaciones } = montar({
      asignatura: { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: 2 },
    });
    await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, actor: ACTOR });
    expect(ubicaciones).toHaveLength(0);
  });

  it('tampoco registra evento', async () => {
    // Una bitácora llena de movimientos que no movieron nada es una bitácora
    // que nadie lee, y RF078 la quiere útil para auditoría.
    const { caso, publicados } = montar({
      asignatura: { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: 2 },
    });
    await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, actor: ACTOR });
    expect(publicados).toHaveLength(0);
  });

  it('pero SÍ escribe si cambia solo el orden dentro del ciclo', async () => {
    // RF070: reordenar es un cambio real aunque el ciclo no varíe.
    const { caso, ubicaciones } = montar({
      asignatura: { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: 2 },
    });
    await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, orden: 0, actor: ACTOR });
    expect(ubicaciones).toHaveLength(1);
  });
});

describe('Auditoría del movimiento', () => {
  it('el detalle nombra origen y destino', async () => {
    const { caso, publicados } = montar({
      asignatura: { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: 1 },
    });
    await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 3, actor: ACTOR });

    expect(publicados[0]?.nombre).toBe('asignatura.ubicada');
    expect(publicados[0]?.detalle).toContain('ciclo 1 → 3');
  });

  it('retirar de la malla se registra como tal', async () => {
    const { caso, publicados } = montar({
      asignatura: { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: 2 },
    });
    await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: null, actor: ACTOR });
    expect(publicados[0]?.detalle).toContain('retirada del ciclo 2');
  });
});

describe('Respuesta para la UI', () => {
  it('RF068: informa cuántas quedan sin ciclo', async () => {
    // Así la pantalla actualiza la alerta bloqueante sin recargar el plan.
    const { caso } = montar({});
    const r = await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, actor: ACTOR });
    expect(r.asignaturasSinCiclo).toBe(1);
  });

  it('devuelve los créditos del ciclo de destino', async () => {
    const { caso } = montar({});
    const r = await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, actor: ACTOR });
    expect(r.creditosDelCiclo).toBe(4);
  });

  it('al retirar, los créditos del destino son cero', async () => {
    const { caso } = montar({
      asignatura: { id: 'a-1', planId: 'plan-1', codigo: 'ISI-101', cicloNumero: 2 },
    });
    const r = await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: null, actor: ACTOR });
    expect(r.creditosDelCiclo).toBe(0);
    expect(r.cicloAnterior).toBe(2);
  });

  it('ignora las asignaturas inactivas en el resumen', async () => {
    const { caso } = montar({
      asignaturasTras: [
        {
          id: 'a-1',
          codigo: 'ISI-101',
          nombre: 'A',
          creditos: 4,
          competenciaIds: ['c'],
          cicloNumero: 2,
          activa: true,
          grupoElectivo: null,
        },
        {
          id: 'a-9',
          codigo: 'ISI-109',
          nombre: 'Z',
          creditos: 9,
          competenciaIds: [],
          cicloNumero: null,
          activa: false,
          grupoElectivo: null,
        },
      ],
    });
    const r = await caso.ejecutar({ asignaturaId: 'a-1', cicloNumero: 2, actor: ACTOR });
    expect(r.asignaturasSinCiclo).toBe(0);
  });
});
