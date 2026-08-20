/**
 * Pruebas del agregado PlanDeEstudios.
 *
 * Lo que se verifica aquí es que el agregado **se niegue**. Un agregado que
 * acepta cualquier cosa no protege nada, y §3.3 pide justo lo contrario: que
 * los invariantes vivan en el dominio y no solo en la UI.
 *
 * También se comprueba que emita los eventos correctos, porque de ellos depende
 * la bitácora (§3.4): un cambio sin evento es un cambio sin rastro.
 */

import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  InvarianteViolado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { EstadoPlan } from '../value-objects/estado-plan.js';
import { PlanDeEstudios } from './plan-de-estudios.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinador académico' };
const SIN_BLOQUEOS = { tieneBloqueos: false };

function plan(estado: EstadoPlan): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: 'plan-1',
    carreraId: 'car-1',
    codigo: 'PE-ISI-2026-v1',
    version: 1,
    estado,
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

describe('RF020 — creación', () => {
  const base = {
    id: 'plan-1',
    carreraId: 'car-1',
    codigo: 'PE-ISI-2026-v1',
    version: 1,
    duracionAnios: 5,
    derivadoDeId: null,
  };

  it('RN1: siempre nace en Borrador', () => {
    // El estado no es un parámetro de `crear`, así que no hay forma de crear un
    // plan ya aprobado ni por error ni a propósito.
    expect(PlanDeEstudios.crear(base, ACTOR).estado).toBe('Borrador');
  });

  it('emite el evento de creación', () => {
    const p = PlanDeEstudios.crear(base, ACTOR);
    expect(p.eventos).toHaveLength(1);
    expect(p.eventos[0]?.nombre).toBe('plan.creado');
    expect(p.eventos[0]?.usuarioNombre).toBe('Coordinador académico');
  });

  it('distingue en la bitácora una versión derivada de un plan nuevo', () => {
    const derivado = PlanDeEstudios.crear({ ...base, derivadoDeId: 'plan-0' }, ACTOR);
    expect(derivado.eventos[0]?.detalle).toContain('nueva versión');
    expect(PlanDeEstudios.crear(base, ACTOR).eventos[0]?.detalle).not.toContain('nueva versión');
  });

  it('rechaza una duración inválida', () => {
    for (const anios of [0, -1, 2.5]) {
      expect(() => PlanDeEstudios.crear({ ...base, duracionAnios: anios }, ACTOR)).toThrow(
        ReglaDeNegocioViolada,
      );
    }
  });
});

describe('RF027 / RF083 — edición según estado', () => {
  it('permite cambiar la duración en Borrador y En revisión', () => {
    for (const estado of ['Borrador', 'En revisión'] as const) {
      const p = plan(estado);
      p.cambiarDuracion(4);
      expect(p.duracionAnios).toBe(4);
    }
  });

  it('bloquea la edición en Aprobado, Vigente e Histórico', () => {
    for (const estado of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      expect(() => plan(estado).cambiarDuracion(4), estado).toThrow(ReglaDeNegocioViolada);
    }
  });

  it('sugiere generar una nueva versión cuando procede', () => {
    // El mensaje importa: decir solo "no se puede" deja al usuario sin salida.
    try {
      plan('Vigente').cambiarDuracion(4);
      expect.unreachable('debió lanzar');
    } catch (e) {
      expect((e as Error).message).toContain('nueva versión');
    }
  });

  it('rechaza una duración inválida incluso siendo editable', () => {
    expect(() => plan('Borrador').cambiarDuracion(0)).toThrow(ReglaDeNegocioViolada);
  });
});

describe('RF023 — fecha de vigencia', () => {
  it('no puede fijarse antes de la aprobación', () => {
    for (const estado of ['Borrador', 'En revisión'] as const) {
      expect(() => plan(estado).fijarFechaVigencia(new Date()), estado).toThrow(
        ReglaDeNegocioViolada,
      );
    }
  });

  it('puede fijarse desde Aprobado en adelante', () => {
    const p = plan('Aprobado');
    const fecha = new Date('2026-03-01');
    p.fijarFechaVigencia(fecha);
    expect(p.fechaVigencia).toBe(fecha);
  });

  it('limpiarla se permite siempre', () => {
    // Poner null no afirma nada sobre la vigencia; es deshacer, no declarar.
    const p = plan('Borrador');
    p.fijarFechaVigencia(null);
    expect(p.fechaVigencia).toBeNull();
  });

  it('se fija sola al entrar en vigencia si nadie la puso', () => {
    const p = plan('Aprobado');
    expect(p.fechaVigencia).toBeNull();
    p.transicionar('marcar-vigente', SIN_BLOQUEOS, ACTOR);
    expect(p.fechaVigencia).toBeInstanceOf(Date);
  });

  it('respeta la fecha que ya se había fijado', () => {
    const p = plan('Aprobado');
    const fecha = new Date('2026-03-01');
    p.fijarFechaVigencia(fecha);
    p.transicionar('marcar-vigente', SIN_BLOQUEOS, ACTOR);
    expect(p.fechaVigencia).toBe(fecha);
  });
});

describe('RF026 — transiciones', () => {
  it('rechaza un salto fuera de la secuencia', () => {
    expect(() => plan('Borrador').transicionar('aprobar', SIN_BLOQUEOS, ACTOR)).toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('emite un evento por cada transición', () => {
    const esperados: [EstadoPlan, Parameters<PlanDeEstudios['transicionar']>[0], string][] = [
      ['Borrador', 'enviar-a-revision', 'plan.enviado-a-revision'],
      ['En revisión', 'aprobar', 'plan.aprobado'],
      ['Aprobado', 'marcar-vigente', 'plan.vigente'],
      ['Vigente', 'archivar', 'plan.archivado'],
    ];

    for (const [estado, accion, nombreEvento] of esperados) {
      const p = plan(estado);
      p.transicionar(accion, SIN_BLOQUEOS, ACTOR);
      expect(p.eventos.map((e) => e.nombre), `${estado} + ${accion}`).toContain(nombreEvento);
    }
  });

  it('la observación lleva su comentario a la bitácora', () => {
    const p = plan('En revisión');
    p.transicionar('observar', { tieneBloqueos: false, comentario: 'Faltan competencias.' }, ACTOR);
    expect(p.eventos[0]?.detalle).toContain('Faltan competencias.');
  });

  it('no emite evento si la transición se rechaza', () => {
    // Un evento sin cambio real ensuciaría la bitácora con algo que no ocurrió.
    const p = plan('Borrador');
    expect(() => p.transicionar('aprobar', SIN_BLOQUEOS, ACTOR)).toThrow();
    expect(p.eventos).toHaveLength(0);
  });

  it('limpiarEventos vacía la cola tras publicarlos', () => {
    const p = plan('Borrador');
    p.transicionar('enviar-a-revision', SIN_BLOQUEOS, ACTOR);
    expect(p.eventos).toHaveLength(1);
    p.limpiarEventos();
    expect(p.eventos).toHaveLength(0);
  });
});

describe('RF082 — ceder la vigencia', () => {
  it('pasa a Histórico y deja constancia de a quién cede', () => {
    const p = plan('Vigente');
    p.cederVigencia(ACTOR, 'PE-ISI-2026-v2');

    expect(p.estado).toBe('Histórico');
    expect(p.eventos[0]?.nombre).toBe('plan.archivado');
    expect(p.eventos[0]?.detalle).toContain('PE-ISI-2026-v2');
  });

  it('solo un plan Vigente puede ceder la vigencia', () => {
    // Llamarlo sobre otro estado sería un bug del caso de uso, no del usuario:
    // por eso es InvarianteViolado y no ReglaDeNegocioViolada.
    for (const estado of ['Borrador', 'En revisión', 'Aprobado', 'Histórico'] as const) {
      expect(() => plan(estado).cederVigencia(ACTOR, 'X'), estado).toThrow(InvarianteViolado);
    }
  });
});

describe('Propiedades derivadas', () => {
  it('esEditable coincide con los estados que admiten cambios', () => {
    expect(plan('Borrador').esEditable).toBe(true);
    expect(plan('En revisión').esEditable).toBe(true);
    expect(plan('Vigente').esEditable).toBe(false);
  });

  it('admiteEliminacion solo en Borrador', () => {
    expect(plan('Borrador').admiteEliminacion).toBe(true);
    expect(plan('En revisión').admiteEliminacion).toBe(false);
  });

  it('editar y derivar son mutuamente excluyentes', () => {
    for (const estado of ['Borrador', 'En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
      const p = plan(estado);
      expect(p.esEditable !== p.admiteNuevaVersion, estado).toBe(true);
    }
  });

  it('expone la etiqueta de una acción para la capa HTTP', () => {
    expect(PlanDeEstudios.etiquetaDe('aprobar')).toBe('Aprobar');
  });
});
