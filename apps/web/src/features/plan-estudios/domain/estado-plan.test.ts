/**
 * Pruebas de la máquina de estados del Plan de Estudios.
 *
 * Cubre RF025, RF026, RF027, RF032, RF075, RF083, RF085, RF087 y RF091.
 *
 * El foco está en lo que la máquina debe **impedir**. Que una transición válida
 * funcione se comprueba con un caso; que las inválidas se rechacen necesita
 * recorrerlas todas, porque es ahí donde un `if` mal escrito deja pasar un plan
 * a Vigente saltándose la aprobación.
 */

import { describe, expect, it } from 'vitest';

import {
  describirTransicion,
  intentarTransicion,
  permiteEdicion,
  permiteEliminacion,
  permiteFechaVigencia,
  permiteNuevaVersion,
  transicionesDisponibles,
  type AccionTransicion,
} from './estado-plan';
import { ESTADOS_PLAN, type EstadoPlan } from './tipos';

const SIN_BLOQUEOS = { tieneBloqueos: false };
const CON_BLOQUEOS = { tieneBloqueos: true };

/** Todas las combinaciones estado × acción, para poder barrerlas. */
const ACCIONES: AccionTransicion[] = [
  'enviar-a-revision',
  'aprobar',
  'observar',
  'marcar-vigente',
  'archivar',
];

describe('RF025 — secuencia de estados', () => {
  it('declara los cinco estados en el orden del ciclo de vida', () => {
    expect([...ESTADOS_PLAN]).toEqual([
      'Borrador',
      'En revisión',
      'Aprobado',
      'Vigente',
      'Histórico',
    ]);
  });
});

describe('RF026 — transiciones válidas', () => {
  it('recorre el camino completo del ciclo de vida', () => {
    // Borrador → En revisión → Aprobado → Vigente → Histórico, sin saltos.
    const camino: [EstadoPlan, AccionTransicion, EstadoPlan][] = [
      ['Borrador', 'enviar-a-revision', 'En revisión'],
      ['En revisión', 'aprobar', 'Aprobado'],
      ['Aprobado', 'marcar-vigente', 'Vigente'],
      ['Vigente', 'archivar', 'Histórico'],
    ];

    for (const [desde, accion, hacia] of camino) {
      const r = intentarTransicion(desde, accion, SIN_BLOQUEOS);
      expect(r.ok, `${desde} --${accion}--> ${hacia}`).toBe(true);
      if (r.ok) expect(r.nuevoEstado).toBe(hacia);
    }
  });

  it('devuelve el plan a Borrador al observarlo', () => {
    const r = intentarTransicion('En revisión', 'observar', {
      tieneBloqueos: false,
      comentario: 'Faltan las competencias del ciclo 5.',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nuevoEstado).toBe('Borrador');
  });
});

describe('RF026 RN1 — no se permiten saltos fuera de la secuencia', () => {
  /**
   * Barrido exhaustivo: para cada estado, la única acción admisible es la que
   * `transicionesDisponibles` anuncia. Cualquier otra debe rechazarse.
   *
   * Sin este barrido, un salto como Borrador → Vigente (que se saltaría la
   * revisión y la aprobación completas) podría pasar inadvertido.
   */
  for (const estado of ESTADOS_PLAN) {
    const permitidas = transicionesDisponibles(estado);

    for (const accion of ACCIONES) {
      const deberiaPasar = permitidas.includes(accion);

      it(`${estado} + "${accion}" → ${deberiaPasar ? 'permitida' : 'rechazada'}`, () => {
        const r = intentarTransicion(estado, accion, {
          tieneBloqueos: false,
          comentario: 'motivo cualquiera',
        });
        expect(r.ok).toBe(deberiaPasar);
        if (!r.ok) expect(r.motivo).toMatch(/solo aplica desde/);
      });
    }
  }

  it('Histórico es un estado terminal, sin ninguna salida', () => {
    // RF083: ninguna versión histórica puede modificarse, bajo ningún rol.
    expect(transicionesDisponibles('Histórico')).toEqual([]);
  });

  it('no existe camino de vuelta desde Vigente a Borrador', () => {
    // Modificar un plan vigente exige una versión nueva (RF027 / RF075), nunca
    // reabrir el que ya está en uso.
    for (const accion of ACCIONES) {
      const r = intentarTransicion('Vigente', accion, SIN_BLOQUEOS);
      if (r.ok) expect(r.nuevoEstado).not.toBe('Borrador');
    }
  });
});

describe('RF085 / RF091 — las inconsistencias bloqueantes detienen el flujo', () => {
  it('impide enviar a revisión con bloqueos pendientes', () => {
    const r = intentarTransicion('Borrador', 'enviar-a-revision', CON_BLOQUEOS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/inconsistencias bloqueantes/);
  });

  it('impide aprobar con bloqueos pendientes', () => {
    const r = intentarTransicion('En revisión', 'aprobar', CON_BLOQUEOS);
    expect(r.ok).toBe(false);
  });

  it('permite observar aunque haya bloqueos', () => {
    // Devolver el plan con observaciones es precisamente la salida cuando algo
    // está mal: exigirle un plan limpio dejaría el flujo atascado.
    const r = intentarTransicion('En revisión', 'observar', {
      tieneBloqueos: true,
      comentario: 'Corregir antes de reenviar.',
    });
    expect(r.ok).toBe(true);
  });

  it('permite marcar vigente y archivar aunque haya bloqueos', () => {
    // Un plan ya aprobado pasó su control; recalcular validaciones después no
    // debe poder bloquear su puesta en vigencia.
    expect(intentarTransicion('Aprobado', 'marcar-vigente', CON_BLOQUEOS).ok).toBe(true);
    expect(intentarTransicion('Vigente', 'archivar', CON_BLOQUEOS).ok).toBe(true);
  });
});

describe('RF087 — observar exige comentario', () => {
  it('rechaza la observación sin comentario', () => {
    const r = intentarTransicion('En revisión', 'observar', SIN_BLOQUEOS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/observación/);
  });

  it('rechaza un comentario que solo tiene espacios', () => {
    const r = intentarTransicion('En revisión', 'observar', {
      tieneBloqueos: false,
      comentario: '   \n  ',
    });
    expect(r.ok).toBe(false);
  });

  it('acepta un comentario con contenido', () => {
    const r = intentarTransicion('En revisión', 'observar', {
      tieneBloqueos: false,
      comentario: 'Revisar créditos del ciclo 3.',
    });
    expect(r.ok).toBe(true);
  });

  it('las demás transiciones no piden comentario', () => {
    expect(describirTransicion('aprobar').exigeComentario).toBe(false);
    expect(describirTransicion('enviar-a-revision').exigeComentario).toBe(false);
  });
});

describe('RF027 / RF083 — permisos de edición por estado', () => {
  it('solo Borrador y En revisión admiten edición', () => {
    expect(permiteEdicion('Borrador')).toBe(true);
    expect(permiteEdicion('En revisión')).toBe(true);
    expect(permiteEdicion('Aprobado')).toBe(false);
    expect(permiteEdicion('Vigente')).toBe(false);
    expect(permiteEdicion('Histórico')).toBe(false);
  });
});

describe('RF032 — eliminación solo en Borrador', () => {
  it('permite eliminar únicamente el borrador', () => {
    expect(permiteEliminacion('Borrador')).toBe(true);
    for (const estado of ESTADOS_PLAN.filter((e) => e !== 'Borrador')) {
      expect(permiteEliminacion(estado), estado).toBe(false);
    }
  });
});

describe('RF075 — nueva versión desde un plan consolidado', () => {
  it('se habilita en Aprobado, Vigente e Histórico', () => {
    expect(permiteNuevaVersion('Aprobado')).toBe(true);
    expect(permiteNuevaVersion('Vigente')).toBe(true);
    expect(permiteNuevaVersion('Histórico')).toBe(true);
  });

  it('no se ofrece mientras el plan aún es editable', () => {
    // Con el plan en Borrador se edita directamente; generar otra versión solo
    // crearía dos borradores compitiendo para la misma carrera.
    expect(permiteNuevaVersion('Borrador')).toBe(false);
    expect(permiteNuevaVersion('En revisión')).toBe(false);
  });

  it('edición y nueva versión son mutuamente excluyentes', () => {
    // Invariante de diseño: en todo estado, o se edita el plan, o se deriva
    // otra versión. Nunca ambas ni ninguna.
    for (const estado of ESTADOS_PLAN) {
      expect(permiteEdicion(estado) !== permiteNuevaVersion(estado), estado).toBe(true);
    }
  });
});

describe('RF023 — cuándo puede fijarse la fecha de vigencia', () => {
  it('se habilita desde Aprobado en adelante', () => {
    // Un plan ya aprobado, vigente o histórico tiene una fecha legítima; los
    // dos primeros estados aún no han pasado por ninguna aprobación.
    expect(permiteFechaVigencia('Aprobado')).toBe(true);
    expect(permiteFechaVigencia('Vigente')).toBe(true);
    expect(permiteFechaVigencia('Histórico')).toBe(true);
  });

  it('no se permite mientras el plan no esté aprobado', () => {
    expect(permiteFechaVigencia('Borrador')).toBe(false);
    expect(permiteFechaVigencia('En revisión')).toBe(false);
  });

  it('es exactamente lo contrario de poder editar', () => {
    // Ambas reglas parten el ciclo de vida por el mismo punto: antes de la
    // aprobación se edita, después se fecha.
    for (const estado of ESTADOS_PLAN) {
      expect(permiteFechaVigencia(estado) !== permiteEdicion(estado), estado).toBe(true);
    }
  });
});
