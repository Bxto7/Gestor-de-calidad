/**
 * A diferencia de Medición (nueva versión conserva, duplicar descarta) y de
 * Evaluación (nueva versión descarta el seguimiento porque no hay
 * "duplicar"), Plan de Mejora solo tiene una operación de copia y conserva
 * TODO el seguimiento: no hay ningún caso de uso que abra un periodo nuevo
 * sin arrastrar lo ya medido. Decisión tomada explícitamente con el usuario
 * (design §3.4).
 */

import { describe, expect, it } from 'vitest';

import { copiarPlanMejora, type PlanMejoraACopiar } from './copia-de-plan-mejora.js';

function origen(sobre: Partial<PlanMejoraACopiar> = {}): PlanMejoraACopiar {
  return {
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: 'carrera-1',
    criterioAcreditacionId: 'crit-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: 'pm-1',
    nombre: 'Reforzar el syllabus',
    causaRaiz: 'Cobertura insuficiente',
    justificacion: 'El indicador bajó dos periodos seguidos',
    input: 'Texto libre de la evidencia previa',
    plazo: new Date('2026-12-31'),
    recursos: 'Docente coordinador, 4 horas/semana',
    metas: 'Subir el indicador 10 puntos',
    responsable: 'Ana Quispe',
    estadoImplementacion: 'En proceso',
    logroMeta: '70% cumplido',
    impacto: 'Mejora observable en el segundo periodo',
    evidencias: [
      {
        referencia: 'https://drive/ev1',
        nombreArchivo: 'evidencia1.pdf',
        subidoPor: 'user-1',
        subidoEn: new Date('2026-08-01'),
      },
    ],
    ...sobre,
  };
}

describe('lo que se copia', () => {
  it('toda la definición, tal cual', () => {
    const copia = copiarPlanMejora(origen());

    expect(copia.nombre).toBe('Reforzar el syllabus');
    expect(copia.causaRaiz).toBe('Cobertura insuficiente');
    expect(copia.justificacion).toBe('El indicador bajó dos periodos seguidos');
    expect(copia.input).toBe('Texto libre de la evidencia previa');
    expect(copia.plazo).toEqual(new Date('2026-12-31'));
    expect(copia.recursos).toBe('Docente coordinador, 4 horas/semana');
    expect(copia.metas).toBe('Subir el indicador 10 puntos');
    expect(copia.responsable).toBe('Ana Quispe');
  });

  it('el elemento asociado y sus vínculos, tal cual', () => {
    const copia = copiarPlanMejora(
      origen({
        aspecto: 'COMPETENCIA',
        criterioAcreditacionId: null,
        competenciaId: 'comp-1',
        periodoId: 'periodo-1',
        planEvaluacionId: 'pe-1',
      }),
    );

    expect(copia.aspecto).toBe('COMPETENCIA');
    expect(copia.competenciaId).toBe('comp-1');
    expect(copia.periodoId).toBe('periodo-1');
    expect(copia.planEvaluacionId).toBe('pe-1');
  });

  it('el seguimiento completo — decisión §3.4, no un descuido', () => {
    const copia = copiarPlanMejora(origen());

    expect(copia.estadoImplementacion).toBe('En proceso');
    expect(copia.logroMeta).toBe('70% cumplido');
    expect(copia.impacto).toBe('Mejora observable en el segundo periodo');
    expect(copia.evidencias).toEqual([
      {
        referencia: 'https://drive/ev1',
        nombreArchivo: 'evidencia1.pdf',
        subidoPor: 'user-1',
        subidoEn: new Date('2026-08-01'),
      },
    ]);
  });

  it('la trazabilidad hacia el plan de medición afectado (RF-PJ-031)', () => {
    expect(copiarPlanMejora(origen()).planMedicionAfectadoId).toBe('pm-1');
  });

  it('un plan sin evidencias copia una lista vacía, no revienta', () => {
    const copia = copiarPlanMejora(origen({ evidencias: [] }));
    expect(copia.evidencias).toEqual([]);
  });
});
