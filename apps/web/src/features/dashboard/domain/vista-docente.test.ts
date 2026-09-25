import { describe, expect, it } from 'vitest';

import type { EvaluacionAsignada } from '@/features/mejora-continua/api/mis-evidencias.api';

import {
  fechaLocalIso,
  kpisDeDocente,
  plazosDe,
  primerNombre,
  subtituloDeDocente,
  venceProntoDe,
} from './vista-docente';

const evidencia = { id: 'ev', enlace: 'https://x.pe', descripcion: 'd', propia: true };

function evaluacion(
  id: string,
  sobrescribe: {
    asignatura?: string;
    competencia?: string;
    fechaCierre?: string | null;
    evidencias?: number;
    entregable?: string;
  } = {},
): EvaluacionAsignada {
  const asignatura = sobrescribe.asignatura ?? 'a1';
  const competencia = sobrescribe.competencia ?? 'k1';
  return {
    id,
    asignatura: {
      id: asignatura,
      codigo: asignatura.toUpperCase(),
      nombre: `Asignatura ${asignatura}`,
    },
    competencia: {
      id: competencia,
      codigo: competencia.toUpperCase(),
      nombre: `Competencia ${competencia}`,
    },
    entregable: sobrescribe.entregable ?? 'Proyecto final',
    periodo: {
      id: 'p1',
      etiqueta: '2026-I',
      fechaCierre: sobrescribe.fechaCierre === undefined ? '2026-10-30' : sobrescribe.fechaCierre,
    },
    planEvaluacion: { id: 'pe1', codigo: 'PE-01' },
    evidencias: Array.from({ length: sobrescribe.evidencias ?? 0 }, (_, i) => ({
      ...evidencia,
      id: `${id}-ev${i}`,
    })),
    puedeAgregar: true,
  };
}

const HOY = '2026-09-25';

describe('kpisDeDocente', () => {
  it('sin evaluaciones todo es cero', () => {
    expect(kpisDeDocente([])).toEqual({ asignaturas: 0, pendientes: 0, competencias: 0 });
  });

  it('cuenta asignaturas y competencias distintas, no evaluaciones', () => {
    const evs = [
      evaluacion('e1', { asignatura: 'a1', competencia: 'k1' }),
      evaluacion('e2', { asignatura: 'a1', competencia: 'k2' }),
      evaluacion('e3', { asignatura: 'a2', competencia: 'k1' }),
    ];
    expect(kpisDeDocente(evs)).toMatchObject({ asignaturas: 2, competencias: 2 });
  });

  it('pendiente es la evaluación sin ninguna evidencia, sea de quien sea', () => {
    const evs = [
      evaluacion('e1', { evidencias: 0 }),
      evaluacion('e2', { evidencias: 1 }),
      evaluacion('e3', { evidencias: 3 }),
    ];
    expect(kpisDeDocente(evs).pendientes).toBe(1);
  });
});

describe('plazosDe', () => {
  it('lista solo las pendientes con fecha, de la más cercana a la más lejana', () => {
    const evs = [
      evaluacion('lejana', { fechaCierre: '2026-12-01' }),
      evaluacion('hecha', { fechaCierre: '2026-09-26', evidencias: 1 }),
      evaluacion('sin-fecha', { fechaCierre: null }),
      evaluacion('cercana', { fechaCierre: '2026-10-05' }),
    ];
    expect(plazosDe(evs, HOY).map((p) => p.id)).toEqual(['cercana', 'lejana']);
  });

  it('marca urgente lo que vence en menos de 7 días, y no desde el día 7', () => {
    const evs = [
      evaluacion('seis', { fechaCierre: '2026-10-01' }),
      evaluacion('siete', { fechaCierre: '2026-10-02' }),
    ];
    const [seis, siete] = plazosDe(evs, HOY);
    expect(seis?.urgente).toBe(true);
    expect(siete?.urgente).toBe(false);
  });

  it('lo ya vencido es urgente y lo dice en pasado', () => {
    const [vencida] = plazosDe([evaluacion('v', { fechaCierre: '2026-09-10' })], HOY);
    expect(vencida?.urgente).toBe(true);
    expect(vencida?.texto).toContain('venció el 10 sep');
  });

  it('cada plazo nombra asignatura, competencia y fecha, y enlaza a Mis evidencias', () => {
    const [plazo] = plazosDe([evaluacion('e1', { fechaCierre: '2026-10-30' })], HOY);
    expect(plazo).toMatchObject({
      id: 'e1',
      texto: 'Asignatura a1 · K1 — vence el 30 oct',
      href: '/mis-evidencias',
    });
  });

  it('muestra como máximo cinco', () => {
    const evs = Array.from({ length: 8 }, (_, i) =>
      evaluacion(`e${i}`, { fechaCierre: `2026-11-0${i + 1}` }),
    );
    expect(plazosDe(evs, HOY)).toHaveLength(5);
  });
});

describe('venceProntoDe', () => {
  it('con una pendiente con fecha nombra la más cercana', () => {
    const evs = [
      evaluacion('lejana', { asignatura: 'a2', fechaCierre: '2026-12-01' }),
      evaluacion('cercana', { asignatura: 'a1', fechaCierre: '2026-10-05', entregable: 'Informe' }),
    ];
    expect(venceProntoDe(evs, HOY)).toEqual({
      titulo: 'Asignatura a1',
      descripcion: 'Informe · K1 — vence en 10 días.',
    });
  });

  it.each([
    ['2026-09-25', 'vence hoy'],
    ['2026-09-26', 'vence mañana'],
    ['2026-10-05', 'vence en 10 días'],
    ['2026-09-10', 'venció el 10 sep'],
  ])('con cierre %s dice «%s»', (fecha, texto) => {
    const { descripcion } = venceProntoDe([evaluacion('e', { fechaCierre: fecha })], HOY);
    expect(descripcion).toContain(texto);
  });

  it('una evaluación ya con evidencia no cuenta como pendiente', () => {
    const { titulo } = venceProntoDe(
      [evaluacion('hecha', { fechaCierre: '2026-09-26', evidencias: 1 })],
      HOY,
    );
    expect(titulo).toBe('Estás al día');
  });

  it('sin pendientes dice que está al día', () => {
    expect(venceProntoDe([], HOY)).toEqual({
      titulo: 'Estás al día',
      descripcion: 'No tienes evidencias pendientes por subir.',
    });
  });

  it('con pendientes pero ninguna con fecha lo dice sin inventar un plazo', () => {
    const evs = [evaluacion('a', { fechaCierre: null }), evaluacion('b', { fechaCierre: null })];
    expect(venceProntoDe(evs, HOY)).toEqual({
      titulo: 'Sin fecha de cierre',
      descripcion: 'Tienes 2 evidencias pendientes y ninguna tiene fecha de cierre.',
    });
  });
});

describe('primerNombre', () => {
  it('toma la primera palabra', () => {
    expect(primerNombre('Jorge Pérez Rojas')).toBe('Jorge');
  });
  it('ignora espacios de más', () => {
    expect(primerNombre('  Jorge   Pérez ')).toBe('Jorge');
  });
  it('con un nombre vacío devuelve cadena vacía', () => {
    expect(primerNombre('   ')).toBe('');
  });
});

describe('subtituloDeDocente', () => {
  it('resume pendientes y asignaturas', () => {
    expect(subtituloDeDocente({ asignaturas: 3, pendientes: 1, competencias: 2 })).toBe(
      'Tienes 1 evidencia pendiente en 3 asignaturas.',
    );
  });
  it('sin pendientes lo celebra sin exagerar', () => {
    expect(subtituloDeDocente({ asignaturas: 1, pendientes: 0, competencias: 1 })).toBe(
      'No tienes evidencias pendientes en 1 asignatura.',
    );
  });
  it('sin evaluaciones asignadas lo dice', () => {
    expect(subtituloDeDocente({ asignaturas: 0, pendientes: 0, competencias: 0 })).toBe(
      'Aún no tienes evaluaciones asignadas.',
    );
  });
});

describe('fechaLocalIso', () => {
  it('usa los componentes locales, no UTC', () => {
    expect(fechaLocalIso(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05');
  });
});
