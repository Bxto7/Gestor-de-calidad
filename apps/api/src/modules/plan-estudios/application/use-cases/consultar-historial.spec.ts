/**
 * Pruebas del histórico del plan.
 *
 * La comparación de versiones concentra el riesgo: empareja por nombre y no por
 * código, y si eso se cambiara sin querer, cualquier par de versiones saldría
 * como "todo agregado y todo retirado" sin que nada fallara. Estas pruebas
 * fijan esa decisión.
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
import type { DatosAsignatura, RepositorioAsignaturaPort } from '../ports/asignatura.port.js';
import type {
  RepositorioAprobacionesPort,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';
import { ConsultarHistorial } from './consultar-historial.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Directora de Sistemas' };
const ISI = 'car-isi';

function plan(id: string, codigo: string, carreraId = ISI): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id,
    carreraId,
    codigo,
    version: 1,
    estado: 'Vigente',
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function asignatura(sobre: Partial<DatosAsignatura> = {}): DatosAsignatura {
  return {
    id: 'a-1',
    planId: 'plan-a',
    codigo: 'ISI-101',
    nombre: 'Álgebra Lineal',
    descripcion: 'Sumilla.',
    tipo: 'General',
    condicion: 'Obligatoria',
    creditos: 4,
    horasTeoricas: 3,
    cicloNumero: 1,
    orden: 0,
    activa: true,
    competencias: [],
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function montar(
  opciones: {
    planes?: Record<string, PlanDeEstudios | null>;
    enA?: DatosAsignatura[];
    enB?: DatosAsignatura[];
    permitido?: boolean;
    reglasJustificadas?: string[];
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const justificadas: { codigoRegla: string; motivo: string }[] = [];

  const mapa = opciones.planes ?? {
    'plan-a': plan('plan-a', 'PE-ISI-2026-v1'),
    'plan-b': plan('plan-b', 'PE-ISI-2027-v2'),
  };

  const repoPlanes = {
    porId: async (id: string) => mapa[id] ?? null,
  } as unknown as RepositorioPlanPort;

  const repoAsignaturas = {
    listar: async (planId: string) =>
      planId === 'plan-a' ? (opciones.enA ?? []) : (opciones.enB ?? []),
  } as unknown as RepositorioAsignaturaPort;

  const contenido = {
    reglasJustificadasDe: async () => opciones.reglasJustificadas ?? [],
  } as unknown as RepositorioContenidoPort;

  const aprobaciones = {
    listar: async () => [
      {
        id: 'ev-1',
        planId: 'plan-a',
        accion: 'Aprobado',
        comentario: null,
        usuarioNombre: 'Directora',
        fecha: new Date('2026-05-01'),
      },
    ],
    justificar: async (d: { codigoRegla: string; motivo: string }) =>
      void justificadas.push({ codigoRegla: d.codigoRegla, motivo: d.motivo }),
  } as unknown as RepositorioAprobacionesPort;

  const autorizacion: AuthorizationPort = {
    puede: async () =>
      opciones.permitido === false
        ? { permitido: false, motivo: 'Sin permiso.' }
        : { permitido: true },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };

  const caso = new ConsultarHistorial(
    repoPlanes,
    repoAsignaturas,
    contenido,
    aprobaciones,
    autorizacion,
    eventos,
  );

  return { caso, publicados, justificadas };
}

describe('RF089 — historial de aprobaciones', () => {
  it('devuelve los pasos del plan', async () => {
    const { caso } = montar();
    expect(await caso.aprobacionesDe(ACTOR, 'plan-a')).toHaveLength(1);
  });

  it('404 si el plan no existe', async () => {
    const { caso } = montar({ planes: {} });
    await expect(caso.aprobacionesDe(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('exige permiso de lectura', async () => {
    const { caso } = montar({ permitido: false });
    await expect(caso.aprobacionesDe(ACTOR, 'plan-a')).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('RF099 — justificaciones', () => {
  it('guarda el motivo con la regla en mayúsculas', async () => {
    const { caso, justificadas } = montar();
    await caso.justificar(ACTOR, 'plan-a', 'rn-05', '  La carrera comparte cursos con Civil.  ');

    expect(justificadas[0]).toEqual({
      codigoRegla: 'RN-05',
      motivo: 'La carrera comparte cursos con Civil.',
    });
  });

  it('rechaza un motivo vacío', async () => {
    // Cumpliría el trámite sin justificar nada, y dejaría constancia de una
    // decisión que después nadie puede revisar.
    const { caso, justificadas } = montar();
    await expect(caso.justificar(ACTOR, 'plan-a', 'RN-05', '   ')).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    expect(justificadas).toHaveLength(0);
  });

  it('rechaza una regla sin código', async () => {
    const { caso } = montar();
    await expect(caso.justificar(ACTOR, 'plan-a', '  ', 'Motivo suficiente.')).rejects.toThrow(
      /qué advertencia/,
    );
  });

  it('queda en la bitácora sin volcar el motivo', async () => {
    // El motivo vive en su propia tabla y ahí se lee entero; la bitácora dice
    // que la decisión se tomó y quién la tomó.
    const { caso, publicados } = montar();
    await caso.justificar(ACTOR, 'plan-a', 'RN-05', 'Un motivo largo y detallado.');

    expect(publicados[0]?.nombre).toBe('plan.justificado');
    expect(publicados[0]?.detalle).toContain('RN-05');
    expect(publicados[0]?.detalle).not.toContain('largo y detallado');
  });

  it('404 si el plan no existe', async () => {
    const { caso } = montar({ planes: {} });
    await expect(caso.justificar(ACTOR, 'x', 'RN-05', 'Motivo.')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('lista las reglas ya justificadas', async () => {
    const { caso } = montar({ reglasJustificadas: ['RN-05', 'RN-07'] });
    expect(await caso.justificacionesDe(ACTOR, 'plan-a')).toEqual(['RN-05', 'RN-07']);
  });
});

describe('RF092 — comparar versiones', () => {
  it('empareja por nombre, no por código', async () => {
    // Al generar una versión los códigos se renuevan (RF075): comparar por
    // código daría todo como agregado y retirado en cualquier par.
    const { caso } = montar({
      enA: [asignatura({ codigo: 'ISI-101', nombre: 'Álgebra Lineal' })],
      enB: [asignatura({ codigo: 'ISI-777', nombre: 'Álgebra Lineal' })],
    });

    expect(await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b')).toEqual([]);
  });

  it('detecta una asignatura agregada', async () => {
    const { caso } = montar({
      enA: [],
      enB: [asignatura({ nombre: 'Cálculo' })],
    });

    const r = await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b');
    expect(r).toHaveLength(1);
    expect(r[0]?.cambio).toBe('agregada');
    expect(r[0]?.detalle).toContain('PE-ISI-2027-v2');
  });

  it('detecta una retirada', async () => {
    const { caso } = montar({
      enA: [asignatura({ nombre: 'Dibujo Técnico' })],
      enB: [],
    });

    const r = await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b');
    expect(r[0]?.cambio).toBe('retirada');
  });

  it('enumera los campos que cambiaron', async () => {
    const { caso } = montar({
      enA: [asignatura({ creditos: 4, cicloNumero: 1, tipo: 'General' })],
      enB: [asignatura({ creditos: 5, cicloNumero: 2, tipo: 'Especialidad' })],
    });

    const r = await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b');
    expect(r[0]?.cambio).toBe('modificada');
    expect(r[0]?.detalle).toContain('créditos 4 → 5');
    expect(r[0]?.detalle).toContain('ciclo 1 → 2');
    expect(r[0]?.detalle).toContain('tipo General → Especialidad');
  });

  it('nombra "sin asignar" el ciclo ausente', async () => {
    const { caso } = montar({
      enA: [asignatura({ cicloNumero: null })],
      enB: [asignatura({ cicloNumero: 3 })],
    });
    expect((await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b'))[0]?.detalle).toContain(
      'ciclo sin asignar → 3',
    );
  });

  it('la inactivación cuenta como cambio', async () => {
    const { caso } = montar({
      enA: [asignatura({ activa: true })],
      enB: [asignatura({ activa: false })],
    });
    expect((await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b'))[0]?.detalle).toContain(
      'inactivada',
    );
  });

  it('el nombre se compara sin distinguir mayúsculas ni espacios', async () => {
    const { caso } = montar({
      enA: [asignatura({ nombre: 'Álgebra Lineal' })],
      enB: [asignatura({ nombre: '  ÁLGEBRA LINEAL  ' })],
    });
    expect(await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b')).toEqual([]);
  });

  it('el resultado va ordenado por código, no por orden de recorrido', async () => {
    // Dos comparaciones seguidas deben dar exactamente lo mismo.
    const { caso } = montar({
      enA: [],
      enB: [
        asignatura({ codigo: 'ISI-305', nombre: 'Redes' }),
        asignatura({ codigo: 'ISI-101', nombre: 'Álgebra' }),
      ],
    });

    expect((await caso.compararVersiones(ACTOR, 'plan-a', 'plan-b')).map((d) => d.codigo)).toEqual([
      'ISI-101',
      'ISI-305',
    ]);
  });

  it('rechaza comparar versiones de carreras distintas', async () => {
    const { caso } = montar({
      planes: {
        'plan-a': plan('plan-a', 'PE-ISI-2026-v1'),
        'plan-b': plan('plan-b', 'PE-CIV-2026-v1', 'car-civ'),
      },
    });

    await expect(caso.compararVersiones(ACTOR, 'plan-a', 'plan-b')).rejects.toThrow(
      /una misma carrera/,
    );
  });

  it('404 si alguna de las dos no existe', async () => {
    const { caso } = montar({ planes: { 'plan-a': plan('plan-a', 'PE-ISI-2026-v1') } });
    await expect(caso.compararVersiones(ACTOR, 'plan-a', 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('exige permiso de histórico', async () => {
    const { caso } = montar({ permitido: false });
    await expect(caso.compararVersiones(ACTOR, 'plan-a', 'plan-b')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });
});
