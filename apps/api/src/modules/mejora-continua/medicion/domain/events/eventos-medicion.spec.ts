/**
 * Pruebas de los eventos de auditoría del plan de medición.
 *
 * El detalle de un evento no es decoración: es lo único que queda cuando
 * alguien pregunta, meses después, qué se cambió y por qué. Aquí se comprueban
 * las ramas donde ese texto puede quedarse corto — guardar sin cambios, retirar
 * el último periodo, observar sin comentario.
 */

import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  CompetenciasDelPlanDeclaradas,
  MatrizProgramada,
  MedicionMarcada,
  PeriodosDeclarados,
  PlanMedicionCreado,
  PlanMedicionEditado,
  PlanMedicionEliminado,
  PlanMedicionTransicionado,
} from './eventos-medicion.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

describe('RF-PM-045 — todos hablan de la misma entidad', () => {
  it('la bitácora los agrupa bajo el plan, no bajo sus partes', () => {
    // Nadie busca «qué pasó con el periodo 2024-II»; busca qué pasó con el plan.
    const eventos = [
      new PlanMedicionCreado(ACTOR, 'pm-1', 'PM-1', 'DIRECTA', 70),
      new PeriodosDeclarados(ACTOR, 'pm-1', 'PM-1', [], ['2024-I']),
      new MatrizProgramada(ACTOR, 'pm-1', 'PM-1', 0, 5),
      new MedicionMarcada(ACTOR, 'pm-1', 'PM-1', 'cmp-1', '2024-I', true),
    ];

    for (const e of eventos) expect(e.entidad).toBe('PlanMedicion');
  });

  it('RF-PM-045: cada evento carga quién lo originó', () => {
    const e = new PlanMedicionCreado(ACTOR, 'pm-1', 'PM-1', 'DIRECTA', 70);

    expect(e.usuarioId).toBe('u-1');
    expect(e.usuarioNombre).toBe('Coordinadora académica');
  });
});

describe('creación y baja', () => {
  it('el alta deja la meta en porcentaje, que es como la lee una persona', () => {
    const e = new PlanMedicionCreado(ACTOR, 'pm-1', 'PM-ISI-D-v1', 'DIRECTA', 70);

    expect(e.detalle).toContain('PM-ISI-D-v1');
    expect(e.detalle).toContain('70 %');
  });

  it('la baja consta como ocurrida en Borrador', () => {
    const e = new PlanMedicionEliminado(ACTOR, 'pm-1', 'PM-1');

    expect(e.detalle).toContain('Borrador');
  });
});

describe('edición', () => {
  it('enumera los cambios', () => {
    const e = new PlanMedicionEditado(ACTOR, 'pm-1', 'PM-1', ['meta 70 % → 80 %']);

    expect(e.detalle).toContain('70 % → 80 %');
  });

  it('guardar sin tocar nada lo dice, en vez de dejar un registro vacío', () => {
    const e = new PlanMedicionEditado(ACTOR, 'pm-1', 'PM-1', []);

    expect(e.detalle).toContain('sin cambios');
  });
});

describe('transiciones', () => {
  it('registra el estado de origen y el de destino', () => {
    const e = new PlanMedicionTransicionado(ACTOR, 'pm-1', 'PM-1', 'Borrador', 'En revisión');

    expect(e.detalle).toContain('Borrador → En revisión');
  });

  it('RF-PM-037 RN2: la observación queda junto al cambio de estado', () => {
    // En una tabla aparte habría que reconstruir la correspondencia por fecha.
    const e = new PlanMedicionTransicionado(
      ACTOR,
      'pm-1',
      'PM-1',
      'En revisión',
      'Borrador',
      'Faltan periodos.',
    );

    expect(e.detalle).toContain('Faltan periodos.');
  });

  it('un comentario en blanco no ensucia el detalle', () => {
    const e = new PlanMedicionTransicionado(ACTOR, 'pm-1', 'PM-1', 'Aprobado', 'Vigente', '   ');

    expect(e.detalle).not.toContain('Observación');
  });
});

describe('contenido del plan', () => {
  it('los periodos se auditan por su etiqueta, con el antes y el después', () => {
    const e = new PeriodosDeclarados(ACTOR, 'pm-1', 'PM-1', ['2024-I'], ['2024-I', '2024-II']);

    expect(e.detalle).toContain('2024-I → 2024-I, 2024-II');
  });

  it('quedarse sin periodos se audita como «ninguno», no como un hueco', () => {
    const e = new PeriodosDeclarados(ACTOR, 'pm-1', 'PM-1', ['2024-I'], []);

    expect(e.detalle).toContain('→ ninguno');
  });

  it('las competencias se auditan por cuántas quedan', () => {
    // A diferencia de los periodos, aquí no se enumeran: el identificador de
    // una competencia no dice nada a quien lee la bitácora, y su código vive en
    // otro módulo al que este no puede consultar.
    const e = new CompetenciasDelPlanDeclaradas(ACTOR, 'pm-1', 'PM-1', 3, 5);

    expect(e.detalle).toContain('3 → 5');
  });

  it('la matriz se cuenta y no se enumera', () => {
    // 50 × 15 llenaría el detalle con 750 pares que nadie leería.
    const e = new MatrizProgramada(ACTOR, 'pm-1', 'PM-1', 0, 750);

    expect(e.detalle).toContain('0 → 750 celdas');
  });

  it('marcar y desmarcar una medición se distinguen', () => {
    const hecha = new MedicionMarcada(ACTOR, 'pm-1', 'PM-1', 'cmp-1', '2024-I', true);
    const pendiente = new MedicionMarcada(ACTOR, 'pm-1', 'PM-1', 'cmp-1', '2024-I', false);

    expect(hecha.detalle).toContain('realizada');
    expect(pendiente.detalle).toContain('pendiente');
  });
});
