/**
 * Lo que se vigila aquí es una regla con consecuencias fuera del software.
 *
 * Una marca de `realizada` es constancia de que una medición ocurrió, con
 * usuario y fecha: es evidencia. Una versión nueva corrige el mismo plan y
 * sigue cubriendo los mismos periodos, así que descartarla borraría evidencia
 * real. Un duplicado arranca un periodo de acreditación nuevo, así que
 * arrastrarla afirmaría que se midió algo que todavía no ha ocurrido.
 *
 * En un expediente de acreditación, lo segundo es lo peor que puede pasar.
 */

import { describe, expect, it } from 'vitest';

import { copiarPlan, permiteVersionado, type PlanACopiar } from './copia-de-plan.js';

function origen(sobre: Partial<PlanACopiar> = {}): PlanACopiar {
  return {
    meta: 0.7,
    periodoInicio: { anio: 2026, mitad: 1 },
    competenciaIds: ['cmp-1', 'cmp-2'],
    periodos: [
      { etiqueta: '2026-I', orden: 1, fechaCierre: new Date('2026-07-15') },
      { etiqueta: '2026-II', orden: 2, fechaCierre: null },
    ],
    celdas: [
      {
        competenciaId: 'cmp-1',
        periodoEtiqueta: '2026-I',
        realizada: true,
        realizadaEn: new Date('2026-07-10'),
      },
      { competenciaId: 'cmp-2', periodoEtiqueta: '2026-II', realizada: false, realizadaEn: null },
    ],
    ...sobre,
  };
}

describe('lo que las dos copias comparten', () => {
  it('la meta, las competencias y los periodos con su fecha de cierre', () => {
    for (const modo of ['version', 'duplicado'] as const) {
      const copia = copiarPlan(origen(), modo);

      expect(copia.meta).toBe(0.7);
      expect(copia.competenciaIds).toEqual(['cmp-1', 'cmp-2']);
      expect(copia.periodos).toEqual([
        { etiqueta: '2026-I', orden: 1, fechaCierre: new Date('2026-07-15') },
        { etiqueta: '2026-II', orden: 2, fechaCierre: null },
      ]);
    }
  });

  it('las celdas programadas, referidas por etiqueta y no por id', () => {
    // La copia crea periodos nuevos con ids nuevos, así que el id del origen no
    // sirve para nada. La etiqueta sí: RF-PM-018 la obliga a ser única.
    const copia = copiarPlan(origen(), 'duplicado');

    expect(copia.celdas.map((c) => [c.competenciaId, c.periodoEtiqueta])).toEqual([
      ['cmp-1', '2026-I'],
      ['cmp-2', '2026-II'],
    ]);
  });

  it('el periodo de inicio, para poder reproducir la propuesta', () => {
    expect(copiarPlan(origen(), 'version').periodoInicio).toEqual({ anio: 2026, mitad: 1 });
  });

  it('no comparte referencias con el origen: mutar la copia no lo toca', () => {
    const antes = origen();
    const copia = copiarPlan(antes, 'version');

    (copia.competenciaIds as string[]).push('cmp-3');

    expect(antes.competenciaIds).toEqual(['cmp-1', 'cmp-2']);
  });
});

describe('RF-PM-030 — la versión conserva la evidencia', () => {
  it('mantiene las marcas de realizada con su fecha', () => {
    const copia = copiarPlan(origen(), 'version');
    const medida = copia.celdas.find((c) => c.competenciaId === 'cmp-1');

    expect(medida?.realizada).toBe(true);
    expect(medida?.realizadaEn).toEqual(new Date('2026-07-10'));
  });
});

describe('RF-PM-034 — el duplicado NO inventa evidencia', () => {
  it('descarta toda marca de realizada', () => {
    const copia = copiarPlan(origen(), 'duplicado');

    expect(copia.celdas.every((c) => !c.realizada)).toBe(true);
    expect(copia.celdas.every((c) => c.realizadaEn === null)).toBe(true);
  });

  it('la celda sigue programada: se pierde la medición, no la programación', () => {
    const copia = copiarPlan(origen(), 'duplicado');

    expect(copia.celdas).toHaveLength(2);
  });
});

describe('RF-PM-030 — desde qué estados se versiona', () => {
  it('un plan ya cerrado sí; uno editable no hace falta versionarlo', () => {
    expect(permiteVersionado('Aprobado')).toBe(true);
    expect(permiteVersionado('Vigente')).toBe(true);
    expect(permiteVersionado('Histórico')).toBe(true);
    expect(permiteVersionado('Borrador')).toBe(false);
    expect(permiteVersionado('En revisión')).toBe(false);
  });
});
