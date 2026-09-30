import { describe, expect, it } from 'vitest';

import { armarActaParaDocumento, type DatosParaActaDocumento } from './armar-acta-para-documento.js';

function datos(sobre: Partial<DatosParaActaDocumento> = {}): DatosParaActaDocumento {
  return {
    acta: {
      id: 'acta-1',
      correlativo: 2,
      codigo: 'ACTA N° 002 – EAP-ISI',
      titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
      objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
      periodoAcademico: '2025-10',
      convocadaPor: 'Directora de Escuela',
      fechaReunion: new Date('2026-03-09'),
      lugarReunion: 'Sala de reuniones',
      lugarEmision: 'Huancayo',
      fechaEmision: new Date('2026-03-20'),
      aprobadoEn: new Date('2026-03-15T10:00:00Z'),
      textoIntroduccion: 'Se deja constancia de la revisión.',
      textoAcuerdoCierre: 'Se resuelve aprobar las acciones.',
      asistentes: [{ nombre: 'Ana Pérez' }, { nombre: 'Luis Gómez' }],
      ...sobre.acta,
    },
    acciones: sobre.acciones ?? [],
    generadoEn: sobre.generadoEn ?? new Date('2026-09-20T15:00:00Z'),
  };
}

function accion(
  aspecto: 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA',
  sobre: Partial<DatosParaActaDocumento['acciones'][number]> = {},
): DatosParaActaDocumento['acciones'][number] {
  return {
    incluida: true,
    porcentajeMedicionCompetencia: null,
    metaCompetenciaSnapshot: null,
    plan: {
      codigo: 'CA-01',
      aspecto,
      nombre: 'Reforzar bibliografía',
      plazo: new Date('2026-12-01'),
      recursos: 'Presupuesto adicional',
      metas: 'Elevar el indicador',
      responsable: 'Coordinación académica',
    },
    ...sobre,
  };
}

describe('armarActaParaDocumento', () => {
  it('arma la cabecera y el acuerdo desde los datos del acta', () => {
    const resultado = armarActaParaDocumento(datos());

    expect(resultado.numeroActa).toBe('ACTA N° 002 – EAP-ISI');
    expect(resultado.cabecera.convocadaPor).toBe('Directora de Escuela');
    expect(resultado.acuerdo).toBe('Se deja constancia de la revisión.');
    expect(resultado.asistentes).toEqual(['Ana Pérez', 'Luis Gómez']);
  });

  it('agrupa las acciones incluidas por aspecto, en tres listas separadas', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('CRITERIO_ACREDITACION'),
          accion('OBJETIVO_EDUCACIONAL'),
          accion('COMPETENCIA'),
        ],
      }),
    );

    expect(resultado.criterios).toHaveLength(1);
    expect(resultado.objetivos).toHaveLength(1);
    expect(resultado.competencias).toHaveLength(1);
  });

  it('descarta las acciones no incluidas', () => {
    const resultado = armarActaParaDocumento(
      datos({ acciones: [accion('CRITERIO_ACREDITACION', { incluida: false })] }),
    );

    expect(resultado.criterios).toHaveLength(0);
    expect(resultado.resumen.total).toBe(0);
  });

  it('RF-AC-010: LOGRADO cuando el resultado alcanza la meta congelada', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('COMPETENCIA', { porcentajeMedicionCompetencia: 75, metaCompetenciaSnapshot: 70 }),
        ],
      }),
    );

    expect(resultado.competencias[0]?.logrado).toBe(true);
    expect(resultado.competencias[0]?.resultado).toBe(75);
    expect(resultado.competencias[0]?.meta).toBe(70);
  });

  it('NO LOGRADO cuando el resultado no alcanza la meta congelada', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('COMPETENCIA', { porcentajeMedicionCompetencia: 60, metaCompetenciaSnapshot: 70 }),
        ],
      }),
    );

    expect(resultado.competencias[0]?.logrado).toBe(false);
  });

  it('sin resultado o sin meta, logrado queda indeterminado (null), no false', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('COMPETENCIA', { porcentajeMedicionCompetencia: null, metaCompetenciaSnapshot: null }),
        ],
      }),
    );

    expect(resultado.competencias[0]?.logrado).toBeNull();
  });

  it('el resumen cuenta cada aspecto y el total', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('CRITERIO_ACREDITACION'),
          accion('CRITERIO_ACREDITACION'),
          accion('OBJETIVO_EDUCACIONAL'),
        ],
      }),
    );

    expect(resultado.resumen).toEqual({ criterios: 2, objetivos: 1, competencias: 0, total: 3 });
  });

  it('sin lugar o fecha de emisión, ciudadYFecha es null', () => {
    const resultado = armarActaParaDocumento(
      datos({ acta: { ...datos().acta, lugarEmision: null, fechaEmision: null } }),
    );

    expect(resultado.ciudadYFecha).toBeNull();
  });

  it('el código de verificación es estable para los mismos datos y cambia si cambia el acta', () => {
    const a = armarActaParaDocumento(datos());
    const b = armarActaParaDocumento(datos());
    const c = armarActaParaDocumento(datos({ acta: { ...datos().acta, id: 'acta-2' } }));

    expect(a.codigoVerificacion).toBe(b.codigoVerificacion);
    expect(a.codigoVerificacion).not.toBe(c.codigoVerificacion);
    expect(a.codigoVerificacion).toMatch(/^[0-9a-f]{12}$/);
  });
});
