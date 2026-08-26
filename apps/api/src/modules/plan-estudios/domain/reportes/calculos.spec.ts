import { describe, expect, it } from 'vitest';

import {
  reporteAreasDeFormacion,
  reporteCreditosPorCiclo,
  type AsignaturaParaReporte,
  type CicloConfigurado,
} from './calculos.js';

function asignatura(sobre: Partial<AsignaturaParaReporte> = {}): AsignaturaParaReporte {
  return {
    id: 'a-1',
    nombre: 'Asignatura',
    competenciaIds: [],
    codigo: 'ASUC001',
    creditos: 4,
    cicloNumero: 1,
    activa: true,
    tipo: 'Especialidad',
    condicion: 'Obligatoria',
    grupoElectivo: null,
    ...sobre,
  };
}

function ciclos(cantidad: number, rango?: { min: number; max: number }): CicloConfigurado[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    numero: i + 1,
    creditosMin: rango?.min ?? null,
    creditosMax: rango?.max ?? null,
  }));
}

describe('créditos por ciclo', () => {
  it('lista todos los ciclos que la carrera declara, también los vacíos', async () => {
    // Un reporte que solo enseñara los ciclos con contenido siempre se vería
    // completo, que es la peor forma de informar sobre un plan a medio hacer.
    const r = reporteCreditosPorCiclo([asignatura({ cicloNumero: 1 })], ciclos(4));

    expect(r.filas).toHaveLength(4);
    expect(r.ciclosVacios).toEqual([2, 3, 4]);
  });

  it('no suma todas las opciones de un grupo de electivos', async () => {
    const grupo = { codigo: 'GE-1', cantidadAElegir: 1 };
    const r = reporteCreditosPorCiclo(
      [
        asignatura({ id: 'o', codigo: 'OBL', creditos: 4 }),
        asignatura({ id: 'e1', codigo: 'EL1', creditos: 3, grupoElectivo: grupo }),
        asignatura({ id: 'e2', codigo: 'EL2', creditos: 3, grupoElectivo: grupo }),
        asignatura({ id: 'e3', codigo: 'EL3', creditos: 3, grupoElectivo: grupo }),
      ],
      ciclos(1),
    );

    expect(r.filas[0]?.creditos).toBe(7);
    expect(r.totalCreditos).toBe(7);
    // El recuento de asignaturas sí las cuenta todas: son cuatro cursos que
    // existen, aunque solo se lleven dos.
    expect(r.filas[0]?.asignaturas).toBe(4);
  });

  it('un ciclo sin rango configurado no se declara ni bien ni mal', async () => {
    // `null` y no `true`: pintar de verde lo que nadie ha configurado sería
    // afirmar algo que no consta en ninguna parte.
    const r = reporteCreditosPorCiclo([asignatura()], ciclos(1));
    expect(r.filas[0]?.dentroDelRango).toBeNull();
  });

  it('marca fuera de rango por debajo y por encima', async () => {
    const bajo = reporteCreditosPorCiclo(
      [asignatura({ creditos: 3 })],
      ciclos(1, { min: 15, max: 24 }),
    );
    expect(bajo.filas[0]?.dentroDelRango).toBe(false);

    const alto = reporteCreditosPorCiclo(
      [asignatura({ creditos: 30 })],
      ciclos(1, { min: 15, max: 24 }),
    );
    expect(alto.filas[0]?.dentroDelRango).toBe(false);

    const bien = reporteCreditosPorCiclo(
      [asignatura({ creditos: 20 })],
      ciclos(1, { min: 15, max: 24 }),
    );
    expect(bien.filas[0]?.dentroDelRango).toBe(true);
  });

  it('las inactivas no cuentan', async () => {
    const r = reporteCreditosPorCiclo(
      [asignatura({ creditos: 4 }), asignatura({ id: 'x', creditos: 9, activa: false })],
      ciclos(1),
    );
    expect(r.totalCreditos).toBe(4);
  });

  it('el promedio va con un decimal, no con quince', async () => {
    const r = reporteCreditosPorCiclo(
      [
        asignatura({ id: '1', creditos: 4, cicloNumero: 1 }),
        asignatura({ id: '2', creditos: 3, cicloNumero: 2 }),
        asignatura({ id: '3', creditos: 3, cicloNumero: 3 }),
      ],
      ciclos(3),
    );
    expect(r.promedioPorCiclo).toBe(3.3);
  });
});

describe('áreas de formación', () => {
  it('las categorías aparecen aunque estén a cero', async () => {
    // Un plan sin ninguna asignatura general es un hallazgo; omitir la fila lo
    // escondería.
    const r = reporteAreasDeFormacion([asignatura({ tipo: 'Especialidad' })]);

    expect(r.porTipo.map((f) => f.area)).toEqual(['General', 'Transversal', 'Especialidad']);
    expect(r.porTipo.find((f) => f.area === 'General')?.creditos).toBe(0);
  });

  it('los porcentajes suman el total, no más', async () => {
    const r = reporteAreasDeFormacion([
      asignatura({ id: '1', codigo: 'A', creditos: 6, tipo: 'General' }),
      asignatura({ id: '2', codigo: 'B', creditos: 4, tipo: 'Especialidad' }),
    ]);

    expect(r.totalCreditos).toBe(10);
    expect(r.porTipo.reduce((s, f) => s + f.creditos, 0)).toBe(10);
    expect(r.porTipo.reduce((s, f) => s + f.porcentaje, 0)).toBeCloseTo(100, 1);
  });

  it('un grupo de electivos heterogéneo no se cuenta dos veces', async () => {
    // Es el caso que hace inexacto el reparto ingenuo: si las opciones no
    // comparten tipo, sumar por categoría contaría el grupo en cada una y el
    // reporte declararía más créditos de los que el plan tiene.
    const grupo = { codigo: 'GE-1', cantidadAElegir: 1 };
    const r = reporteAreasDeFormacion([
      asignatura({ id: '1', codigo: 'OBL', creditos: 10, tipo: 'Especialidad' }),
      asignatura({ id: '2', codigo: 'EL1', creditos: 3, tipo: 'Especialidad', grupoElectivo: grupo }),
      asignatura({ id: '3', codigo: 'EL2', creditos: 3, tipo: 'General', grupoElectivo: grupo }),
    ]);

    expect(r.totalCreditos).toBe(13);
    expect(r.porTipo.reduce((s, f) => s + f.creditos, 0)).toBe(13);
  });

  it('el grupo se asigna siempre a la misma categoría, sin depender del orden', async () => {
    const grupo = { codigo: 'GE-1', cantidadAElegir: 1 };
    const opciones = [
      asignatura({ id: '2', codigo: 'EL2', creditos: 3, tipo: 'General', grupoElectivo: grupo }),
      asignatura({ id: '1', codigo: 'EL1', creditos: 3, tipo: 'Especialidad', grupoElectivo: grupo }),
    ];

    const unOrden = reporteAreasDeFormacion(opciones);
    const otroOrden = reporteAreasDeFormacion([...opciones].reverse());

    expect(unOrden.porTipo).toEqual(otroOrden.porTipo);
    // EL1 es el código menor: el grupo cuenta como Especialidad.
    expect(unOrden.porTipo.find((f) => f.area === 'Especialidad')?.creditos).toBe(3);
  });

  it('el corte por condición no se deduce del de tipo', async () => {
    // Uno dice qué se enseña, el otro cuánta elección tiene el estudiante.
    const grupo = { codigo: 'GE-1', cantidadAElegir: 1 };
    const r = reporteAreasDeFormacion([
      asignatura({ id: '1', codigo: 'A', creditos: 12, condicion: 'Obligatoria' }),
      asignatura({
        id: '2',
        codigo: 'B',
        creditos: 3,
        condicion: 'Electiva',
        grupoElectivo: grupo,
      }),
      asignatura({
        id: '3',
        codigo: 'C',
        creditos: 3,
        condicion: 'Electiva',
        grupoElectivo: grupo,
      }),
    ]);

    const electiva = r.porCondicion.find((f) => f.area === 'Electiva');
    expect(electiva?.creditos).toBe(3);
    // Dos opciones, aunque solo se lleve una.
    expect(electiva?.asignaturas).toBe(2);
    expect(electiva?.porcentaje).toBe(20);
  });

  it('un plan vacío no divide por cero', async () => {
    const r = reporteAreasDeFormacion([]);
    expect(r.totalCreditos).toBe(0);
    expect(r.porTipo.every((f) => f.porcentaje === 0)).toBe(true);
  });
});
