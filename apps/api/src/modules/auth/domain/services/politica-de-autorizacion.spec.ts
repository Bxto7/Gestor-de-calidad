/**
 * Pruebas de la política de autorización.
 *
 * La regla que se verifica aquí es la que la universidad confirmó:
 * **un director aprueba el plan de su carrera, no el de otra**.
 *
 * Es una conjunción de dos condiciones, y el error clásico es implementar solo
 * la primera. Por eso las pruebas insisten en el caso "tiene el permiso pero
 * sobre la carrera equivocada": ese es exactamente el fallo que dejaría a
 * cualquier director aprobando planes ajenos.
 */

import { describe, expect, it } from 'vitest';

import {
  esPermisoAcotadoACarrera,
  puede,
  tienePermiso,
  type ContextoDeAutorizacion,
} from './politica-de-autorizacion.js';

const ISI = 'carrera-isi';
const IIN = 'carrera-iin';

function director(carrera: string | null = ISI): ContextoDeAutorizacion {
  return {
    permisos: new Set([
      'plan.leer',
      'plan.editar',
      'plan.aprobar',
      'plan.observar',
      'plan.nueva_version',
      'malla.editar',
      'competencia.gestionar',
    ]),
    carreraACargo: carrera,
  };
}

function coordinador(carrera: string | null = ISI): ContextoDeAutorizacion {
  return {
    permisos: new Set(['plan.leer', 'plan.editar', 'plan.enviar_revision', 'malla.editar']),
    carreraACargo: carrera,
  };
}

const consultor: ContextoDeAutorizacion = {
  permisos: new Set(['plan.leer']),
  carreraACargo: null,
};

describe('RF086 — aprobar exige el permiso', () => {
  it('el director tiene plan.aprobar', () => {
    expect(puede(director(), 'plan.aprobar', ISI).permitido).toBe(true);
  });

  it('el coordinador no puede aprobar aunque dirija esa carrera', () => {
    // Separación de funciones: quien construye el plan no lo aprueba. Que el
    // alcance coincida no suple la falta del permiso.
    const d = puede(coordinador(ISI), 'plan.aprobar', ISI);
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toContain('plan.aprobar');
  });

  it('el consultor no puede aprobar', () => {
    expect(puede(consultor, 'plan.aprobar', ISI).permitido).toBe(false);
  });
});

describe('Alcance — "de su carrera"', () => {
  it('el director aprueba el plan de SU carrera', () => {
    expect(puede(director(ISI), 'plan.aprobar', ISI).permitido).toBe(true);
  });

  it('el director NO aprueba el plan de otra carrera', () => {
    // El caso central. Tiene el permiso, pero no sobre este plan.
    const d = puede(director(ISI), 'plan.aprobar', IIN);
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toContain('no dirige la carrera');
  });

  it('un usuario sin carrera asignada no ejerce permisos acotados', () => {
    const d = puede(director(null), 'plan.aprobar', ISI);
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toContain('ninguna carrera asignada');
  });

  it('el alcance aplica a todas las operaciones de escritura del plan', () => {
    const d = director(ISI);
    for (const permiso of ['plan.editar', 'plan.aprobar', 'plan.observar', 'malla.editar']) {
      expect(puede(d, permiso, ISI).permitido, `${permiso} sobre la propia`).toBe(true);
      expect(puede(d, permiso, IIN).permitido, `${permiso} sobre otra`).toBe(false);
    }
  });

  it('deniega si el permiso está acotado y no se indicó la carrera', () => {
    // Olvidar pasar la carrera es un bug de quien llama. Denegar es más seguro
    // que asumir que el recurso es de la suya.
    const d = puede(director(ISI), 'plan.aprobar', null);
    expect(d.permitido).toBe(false);
    if (!d.permitido) expect(d.motivo).toContain('no se indicó cuál');
  });
});

describe('Lectura — no está acotada', () => {
  it('el director puede consultar planes de otras carreras', () => {
    // Consultar no es gestionar: la definición del rol acota la gestión y la
    // aprobación, no la visibilidad.
    expect(puede(director(ISI), 'plan.leer', IIN).permitido).toBe(true);
  });

  it('el consultor lee sin tener carrera asignada', () => {
    expect(puede(consultor, 'plan.leer', ISI).permitido).toBe(true);
  });

  it('los permisos de catálogo no dependen de una carrera', () => {
    // Objetivos y competencias son institucionales, no de una carrera.
    expect(esPermisoAcotadoACarrera('competencia.gestionar')).toBe(false);
    expect(puede(director(ISI), 'competencia.gestionar', null).permitido).toBe(true);
  });
});

describe('Clasificación de permisos', () => {
  it('las operaciones de escritura del plan están acotadas', () => {
    for (const p of [
      'plan.crear',
      'plan.editar',
      'plan.eliminar',
      'plan.enviar_revision',
      'plan.aprobar',
      'plan.observar',
      'plan.nueva_version',
      'plan.justificar',
      'asignatura.gestionar',
      'malla.editar',
    ]) {
      expect(esPermisoAcotadoACarrera(p), p).toBe(true);
    }
  });

  it('las de lectura y las de catálogo no lo están', () => {
    for (const p of [
      'plan.leer',
      'plan.leer_historico',
      'facultad.leer',
      'carrera.leer',
      'objetivo.gestionar',
      'competencia.gestionar',
      'reporte.generar',
      'auditoria.leer',
    ]) {
      expect(esPermisoAcotadoACarrera(p), p).toBe(false);
    }
  });
});

describe('tienePermiso — comprobación sin alcance', () => {
  it('informa solo de la existencia del permiso', () => {
    expect(tienePermiso(director(ISI), 'plan.aprobar')).toBe(true);
    expect(tienePermiso(coordinador(ISI), 'plan.aprobar')).toBe(false);
  });

  it('ignora el alcance por diseño, y por eso no sustituye a `puede`', () => {
    // Existe para que la UI oculte botones, no para autorizar. Usarla como
    // control de acceso sería justo el fallo que estas pruebas persiguen.
    expect(tienePermiso(director(ISI), 'plan.aprobar')).toBe(true);
    expect(puede(director(ISI), 'plan.aprobar', IIN).permitido).toBe(false);
  });
});
