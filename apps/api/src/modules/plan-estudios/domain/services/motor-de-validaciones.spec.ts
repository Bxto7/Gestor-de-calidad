/**
 * Pruebas del motor de validaciones de consistencia.
 *
 * Compartidas con el frontend: la misma lógica corre en los dos lados y este
 * juego de pruebas es lo que hace visible cualquier divergencia.
 *
 * Cubre RF064, RF065, RF067, RF068, RF069, RF094, RF095, RF096, RF097, RF099 y
 * RF100.
 *
 * Lo que más importa verificar aquí no es que detecte cada problema por
 * separado, sino dos cosas que la UI da por hechas:
 *   - que la clasificación bloqueante/advertencia sea la correcta, porque de
 *     ella depende que una transición se permita o no (RF085 / RF091);
 *   - que un plan con varios problemas los reporte **todos a la vez**, y no se
 *     detenga en el primero, que es justo lo que RF098 pide.
 */

import { describe, expect, it } from 'vitest';

import {
  calcularTotalCreditos,
  ciclosDeCarrera,
  creditosPorCiclo,
  validarPlan,
  type EntradaValidacion,
} from './motor-de-validaciones.js';
import type { AsignaturaDelPlan, DatosCarrera } from '../../application/ports/repositorios.port.js';

/* ── Constructores de datos de prueba ─────────────────────────────────── */

function carrera(duracionAnios = 2): DatosCarrera {
  return { id: 'car-1', codigo: 'ISI', duracionAnios };
}

function plan(sobrescribir: { objetivoIds?: readonly string[] } = {}): {
  objetivoIds: readonly string[];
} {
  return { objetivoIds: ['oe-1'], ...sobrescribir };
}

function asignatura(sobrescribir: Partial<AsignaturaDelPlan> = {}): AsignaturaDelPlan {
  return {
    id: 'asg-1',
    codigo: 'ISI-101',
    nombre: 'Matemática Básica',
    creditos: 4,
    competenciaIds: ['cpe-1'],
    cicloNumero: 1,
    activa: true,
    grupoElectivo: null,
    ...sobrescribir,
  };
}

/** Plan mínimo que pasa todas las validaciones: una asignatura por ciclo. */
function entradaValida(): EntradaValidacion {
  return {
    plan: plan(),
    carrera: carrera(2), // 4 ciclos
    asignaturas: [1, 2, 3, 4].map((c) =>
      asignatura({ id: `asg-${c}`, codigo: `ISI-10${c}`, nombre: `Curso ${c}`, cicloNumero: c }),
    ),
    reglasJustificadas: [],
  };
}

const codigos = (r: { hallazgos: { codigo: string }[] }) => r.hallazgos.map((h) => h.codigo);

/* ── Cálculos ─────────────────────────────────────────────────────────── */

describe('RF011 RN2 / RF060 — ciclos derivados de la carrera', () => {
  it('genera dos ciclos por año, correlativos desde 1', () => {
    expect(ciclosDeCarrera(carrera(5))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('RF067 — total de créditos', () => {
  it('suma los créditos de las asignaturas activas', () => {
    const total = calcularTotalCreditos([
      asignatura({ id: 'a', creditos: 4 }),
      asignatura({ id: 'b', creditos: 3 }),
    ]);
    expect(total).toBe(7);
  });

  it('excluye las asignaturas inactivas', () => {
    // RF052 conserva el registro al inactivar; contarlo inflaría el total del
    // plan con cursos que ya no se dictan.
    const total = calcularTotalCreditos([
      asignatura({ id: 'a', creditos: 4 }),
      asignatura({ id: 'b', creditos: 3, activa: false }),
    ]);
    expect(total).toBe(4);
  });

  it('es cero sin asignaturas', () => {
    expect(calcularTotalCreditos([])).toBe(0);
  });
});

describe('créditos por ciclo', () => {
  it('suma solo las del ciclo pedido', () => {
    const lista = [
      asignatura({ id: 'a', creditos: 4, cicloNumero: 1 }),
      asignatura({ id: 'b', creditos: 3, cicloNumero: 1 }),
      asignatura({ id: 'c', creditos: 5, cicloNumero: 2 }),
    ];
    expect(creditosPorCiclo(lista, 1)).toBe(7);
    expect(creditosPorCiclo(lista, 2)).toBe(5);
  });

  it('ignora las que no tienen ciclo', () => {
    expect(creditosPorCiclo([asignatura({ cicloNumero: null })], 1)).toBe(0);
  });
});

/* ── Validación integral ──────────────────────────────────────────────── */

describe('RF097 / RF098 — un plan correcto no genera hallazgos', () => {
  it('no reporta nada y no bloquea', () => {
    const r = validarPlan(entradaValida());
    expect(r.hallazgos).toEqual([]);
    expect(r.tieneBloqueos).toBe(false);
    expect(r.totalCreditos).toBe(16);
  });
});

describe('RF094 — cada asignatura necesita una competencia', () => {
  it('detecta las que no tienen ninguna y bloquea', () => {
    const e = entradaValida();
    e.asignaturas[0] = { ...e.asignaturas[0]!, competenciaIds: [] };
    const r = validarPlan(e);

    expect(codigos(r)).toContain('ASIGNATURA_SIN_COMPETENCIA');
    expect(r.tieneBloqueos).toBe(true);
  });

  it('nombra la asignatura afectada para poder corregirla', () => {
    // Un reporte que diga "hay 1 problema" sin decir cuál obliga a revisar el
    // plan entero a mano.
    const e = entradaValida();
    e.asignaturas[1] = { ...e.asignaturas[1]!, competenciaIds: [] };
    const r = validarPlan(e);
    const h = r.hallazgos.find((x) => x.codigo === 'ASIGNATURA_SIN_COMPETENCIA');

    expect(h?.afectados).toHaveLength(1);
    expect(h?.afectados[0]).toContain(e.asignaturas[1].codigo);
  });

  it('ignora las asignaturas inactivas', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'x', codigo: 'ISI-199', competenciaIds: [], activa: false }),
    );
    expect(codigos(validarPlan(e))).not.toContain('ASIGNATURA_SIN_COMPETENCIA');
  });
});

describe('RF095 — el plan necesita un objetivo educacional', () => {
  it('bloquea cuando no hay ninguno asociado', () => {
    const e = entradaValida();
    e.plan = plan({ objetivoIds: [] });
    const r = validarPlan(e);

    expect(codigos(r)).toContain('PLAN_SIN_OBJETIVO');
    expect(r.tieneBloqueos).toBe(true);
  });

  it('pasa con uno solo', () => {
    const e = entradaValida();
    e.plan = plan({ objetivoIds: ['oe-1'] });
    expect(codigos(validarPlan(e))).not.toContain('PLAN_SIN_OBJETIVO');
  });
});

describe('RF068 — asignaturas sin ciclo', () => {
  it('bloquea, porque impide enviar el plan a aprobación', () => {
    const e = entradaValida();
    e.asignaturas.push(asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: null }));
    const r = validarPlan(e);
    const h = r.hallazgos.find((x) => x.codigo === 'ASIGNATURA_SIN_CICLO');

    expect(h?.severidad).toBe('bloqueante');
    expect(r.tieneBloqueos).toBe(true);
  });

  it('lista todas las que faltan, no solo la primera', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'x', codigo: 'ISI-198', cicloNumero: null }),
      asignatura({ id: 'y', codigo: 'ISI-199', cicloNumero: null }),
    );
    const h = validarPlan(e).hallazgos.find((x) => x.codigo === 'ASIGNATURA_SIN_CICLO');
    expect(h?.afectados).toHaveLength(2);
  });
});

describe('RF069 — ciclos vacíos', () => {
  it('avisa pero no bloquea', () => {
    // Su RN1 dice que un ciclo vacío no impide guardar en Borrador.
    const e = entradaValida();
    e.asignaturas = e.asignaturas.filter((a) => a.cicloNumero !== 4);
    const r = validarPlan(e);
    const h = r.hallazgos.find((x) => x.codigo === 'CICLO_VACIO');

    expect(h?.severidad).toBe('advertencia');
    expect(r.tieneBloqueos).toBe(false);
    expect(h?.afectados).toEqual(['Ciclo 4']);
  });

  it('reporta todos los ciclos vacíos de una vez', () => {
    const e = entradaValida();
    e.carrera = carrera(4); // 8 ciclos, solo 4 con cursos
    const h = validarPlan(e).hallazgos.find((x) => x.codigo === 'CICLO_VACIO');
    expect(h?.afectados).toEqual(['Ciclo 5', 'Ciclo 6', 'Ciclo 7', 'Ciclo 8']);
  });
});

describe('RF096 — numeración de ciclos coherente con la carrera', () => {
  it('bloquea si una asignatura está en un ciclo que no existe', () => {
    // Reducir la duración de la carrera puede dejar cursos huérfanos en ciclos
    // que desaparecieron.
    const e = entradaValida();
    e.asignaturas.push(asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: 9 }));
    const r = validarPlan(e);
    const h = r.hallazgos.find((x) => x.codigo === 'CICLO_FUERA_DE_RANGO');

    expect(h?.severidad).toBe('bloqueante');
    expect(h?.afectados).toEqual(['Ciclo 9']);
  });

  it('rechaza también el ciclo 0 y los negativos', () => {
    const e = entradaValida();
    e.asignaturas.push(asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: 0 }));
    expect(codigos(validarPlan(e))).toContain('CICLO_FUERA_DE_RANGO');
  });
});

describe('RF065 — una asignatura en un solo ciclo', () => {
  it('detecta el mismo nombre ubicado en dos ciclos', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'dup', codigo: 'ISI-999', nombre: 'Curso 1', cicloNumero: 3 }),
    );
    const r = validarPlan(e);

    expect(codigos(r)).toContain('ASIGNATURA_EN_VARIOS_CICLOS');
    expect(r.tieneBloqueos).toBe(true);
  });

  it('no confunde nombres que solo difieren en mayúsculas o espacios', () => {
    const e = entradaValida();
    e.asignaturas.push(
      asignatura({ id: 'dup', codigo: 'ISI-999', nombre: '  curso 1  ', cicloNumero: 3 }),
    );
    expect(codigos(validarPlan(e))).toContain('ASIGNATURA_EN_VARIOS_CICLOS');
  });
});

describe('RF064 — rango de créditos por ciclo', () => {
  it('se omite si no hay rango configurado', () => {
    // Su RN dice que sin rango la validación no corre; inventar un umbral
    // generaría advertencias que nadie pidió.
    const e = entradaValida();
    e.asignaturas[0] = { ...e.asignaturas[0]!, creditos: 99 };
    expect(codigos(validarPlan(e))).not.toContain('CREDITOS_CICLO_FUERA_DE_RANGO');
  });

  it('avisa cuando un ciclo se pasa del máximo', () => {
    const e = entradaValida();
    e.rangoPorCiclo = { min: 1, max: 10 };
    e.asignaturas[0] = { ...e.asignaturas[0]!, creditos: 30 };
    const r = validarPlan(e);
    const h = r.hallazgos.find((x) => x.codigo === 'CREDITOS_CICLO_FUERA_DE_RANGO');

    expect(h?.severidad).toBe('advertencia');
    expect(r.tieneBloqueos).toBe(false);
  });

  it('no penaliza a un ciclo vacío por quedar bajo el mínimo', () => {
    // Un ciclo sin cursos ya se reporta como CICLO_VACIO; acusarlo además de
    // tener 0 créditos sería el mismo problema contado dos veces.
    const e = entradaValida();
    e.rangoPorCiclo = { min: 5, max: 30 };
    e.asignaturas = e.asignaturas.filter((a) => a.cicloNumero !== 4);
    const h = validarPlan(e).hallazgos.find((x) => x.codigo === 'CREDITOS_CICLO_FUERA_DE_RANGO');

    expect(h?.afectados ?? []).not.toContain('Ciclo 4: 0 créditos');
  });
});

describe('RF100 — rango de créditos del plan', () => {
  it('se omite si no hay rango configurado', () => {
    expect(codigos(validarPlan(entradaValida()))).not.toContain('CREDITOS_TOTAL_FUERA_DE_RANGO');
  });

  it('avisa si el total queda por debajo del mínimo', () => {
    const e = entradaValida();
    e.rangoTotal = { min: 200, max: 260 };
    const r = validarPlan(e);
    const h = r.hallazgos.find((x) => x.codigo === 'CREDITOS_TOTAL_FUERA_DE_RANGO');

    expect(h?.severidad).toBe('advertencia');
    expect(h?.detalle).toContain('16');
  });

  it('no avisa cuando el total cae dentro del rango', () => {
    const e = entradaValida();
    e.rangoTotal = { min: 10, max: 20 };
    expect(codigos(validarPlan(e))).not.toContain('CREDITOS_TOTAL_FUERA_DE_RANGO');
  });
});

describe('RF099 — justificación de advertencias', () => {
  it('deja de reportar una advertencia justificada', () => {
    const e = entradaValida();
    e.asignaturas = e.asignaturas.filter((a) => a.cicloNumero !== 4);
    expect(codigos(validarPlan(e))).toContain('CICLO_VACIO');

    e.reglasJustificadas = ['CICLO_VACIO'];
    expect(codigos(validarPlan(e))).not.toContain('CICLO_VACIO');
  });

  it('NO permite justificar una bloqueante', () => {
    // Su RN dice que las bloqueantes deben corregirse obligatoriamente. Si una
    // justificación las silenciara, un plan incompleto podría aprobarse.
    const e = entradaValida();
    e.plan = plan({ objetivoIds: [] });
    e.reglasJustificadas = ['PLAN_SIN_OBJETIVO'];
    const r = validarPlan(e);

    expect(codigos(r)).toContain('PLAN_SIN_OBJETIVO');
    expect(r.tieneBloqueos).toBe(true);
  });
});

describe('RF097 / RF098 — reporte consolidado', () => {
  it('acumula todos los problemas en una sola pasada', () => {
    // El motor no debe detenerse en el primer hallazgo: la UI muestra la lista
    // completa para que el usuario corrija de una vez, no de uno en uno.
    const e = entradaValida();
    e.plan = plan({ objetivoIds: [] }); // RF095
    e.asignaturas[0] = { ...e.asignaturas[0]!, competenciaIds: [] }; // RF094
    e.asignaturas.push(asignatura({ id: 'x', codigo: 'ISI-199', cicloNumero: null })); // RF068
    e.asignaturas = e.asignaturas.filter((a) => a.cicloNumero !== 4); // RF069

    const r = validarPlan(e);
    expect(codigos(r)).toEqual(
      expect.arrayContaining([
        'PLAN_SIN_OBJETIVO',
        'ASIGNATURA_SIN_COMPETENCIA',
        'ASIGNATURA_SIN_CICLO',
        'CICLO_VACIO',
      ]),
    );
  });

  it('separa bloqueantes de advertencias sin perder ninguno', () => {
    const e = entradaValida();
    e.plan = plan({ objetivoIds: [] });
    e.asignaturas = e.asignaturas.filter((a) => a.cicloNumero !== 4);
    const r = validarPlan(e);

    expect(r.bloqueantes.every((h) => h.severidad === 'bloqueante')).toBe(true);
    expect(r.advertencias.every((h) => h.severidad === 'advertencia')).toBe(true);
    expect(r.bloqueantes.length + r.advertencias.length).toBe(r.hallazgos.length);
  });

  it('tieneBloqueos refleja exactamente si hay bloqueantes', () => {
    // Es el valor del que cuelga que "Enviar a revisión" esté habilitado.
    const soloAdvertencia = entradaValida();
    soloAdvertencia.asignaturas = soloAdvertencia.asignaturas.filter((a) => a.cicloNumero !== 4);
    expect(validarPlan(soloAdvertencia).tieneBloqueos).toBe(false);

    const conBloqueante = entradaValida();
    conBloqueante.plan = plan({ objetivoIds: [] });
    expect(validarPlan(conBloqueante).tieneBloqueos).toBe(true);
  });

  it('cada hallazgo cita el RF que lo origina', () => {
    // La trazabilidad requisito↔hallazgo es lo que permite defender el reporte
    // en una auditoría de acreditación.
    const e = entradaValida();
    e.plan = plan({ objetivoIds: [] });
    for (const h of validarPlan(e).hallazgos) {
      expect(h.rf).toMatch(/^RF\d{3}$/);
    }
  });

  it('un plan vacío reporta sus carencias sin reventar', () => {
    const r = validarPlan({
      plan: plan({ objetivoIds: [] }),
      carrera: carrera(1),
      asignaturas: [],
      reglasJustificadas: [],
    });

    expect(r.totalCreditos).toBe(0);
    expect(codigos(r)).toContain('PLAN_SIN_OBJETIVO');
    expect(codigos(r)).toContain('CICLO_VACIO');
  });
});

describe('RF056 / RF067 — los grupos de electivos cuentan una vez', () => {
  /** Una opción de electivo: pertenece a un grupo del que se elige `cantidad`. */
  function opcion(codigo: string, grupo: string, cantidad = 1) {
    return asignatura({
      id: `op-${codigo}`,
      codigo,
      creditos: 3,
      cicloNumero: 5,
      grupoElectivo: { codigo: grupo, cantidadAElegir: cantidad },
    });
  }

  it('cinco opciones de un grupo aportan los créditos de una', () => {
    // El error que esto corrige: el plan 2018 de ISI declaraba 249 créditos en
    // vez de 210 porque sumaba las cinco opciones de cada grupo.
    const r = validarPlan({
      ...entradaValida(),
      asignaturas: [
        asignatura({ id: 'obl', codigo: 'ISI-101', creditos: 4, cicloNumero: 5 }),
        opcion('E1', 'ELEC GENER'),
        opcion('E2', 'ELEC GENER'),
        opcion('E3', 'ELEC GENER'),
        opcion('E4', 'ELEC GENER'),
        opcion('E5', 'ELEC GENER'),
      ],
    });

    expect(r.totalCreditos).toBe(7); // 4 obligatorios + 3 del electivo elegido
  });

  it('dos grupos distintos aportan cada uno lo suyo', () => {
    const r = validarPlan({
      ...entradaValida(),
      asignaturas: [
        opcion('A1', 'ELEC GENER'),
        opcion('A2', 'ELEC GENER'),
        opcion('B1', 'ELECT ESP1'),
        opcion('B2', 'ELECT ESP1'),
      ],
    });

    expect(r.totalCreditos).toBe(6);
  });

  it('un grupo del que se eligen dos aporta el doble', () => {
    const r = validarPlan({
      ...entradaValida(),
      asignaturas: [
        opcion('C1', 'ELECT ESP2', 2),
        opcion('C2', 'ELECT ESP2', 2),
        opcion('C3', 'ELECT ESP2', 2),
      ],
    });

    expect(r.totalCreditos).toBe(6);
  });

  it('los créditos del ciclo siguen el mismo criterio', () => {
    // El ciclo 5 del plan real: 18 obligatorios más el electivo, no más los 15
    // de las cinco opciones.
    const asignaturas = [
      asignatura({ id: 'o1', codigo: 'ISI-101', creditos: 18, cicloNumero: 5 }),
      opcion('E1', 'ELEC GENER'),
      opcion('E2', 'ELEC GENER'),
      opcion('E3', 'ELEC GENER'),
    ];

    expect(creditosPorCiclo(asignaturas, 5)).toBe(21);
  });

  it('una opción inactiva no cambia el aporte del grupo', () => {
    const r = validarPlan({
      ...entradaValida(),
      asignaturas: [opcion('E1', 'ELEC GENER'), { ...opcion('E2', 'ELEC GENER'), activa: false }],
    });

    expect(r.totalCreditos).toBe(3);
  });

  it('las electivas sueltas, sin grupo, sí se suman todas', () => {
    // No toda electiva pertenece a un grupo; las que no, son cursos del plan
    // como cualquier otro.
    const r = validarPlan({
      ...entradaValida(),
      asignaturas: [
        asignatura({ id: 's1', codigo: 'S1', creditos: 3, cicloNumero: 5 }),
        asignatura({ id: 's2', codigo: 'S2', creditos: 3, cicloNumero: 5 }),
      ],
    });

    expect(r.totalCreditos).toBe(6);
  });
});
