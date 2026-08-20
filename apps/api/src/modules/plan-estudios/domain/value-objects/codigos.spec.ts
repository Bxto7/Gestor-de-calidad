/**
 * Pruebas de generación de códigos y unicidad.
 *
 * Trasladadas desde el frontend sin cambios de fondo: la lógica es la misma y
 * compartir el juego de pruebas es lo que hace que una divergencia se note.
 *
 * Cubre RF006, RF015, RF017, RF022, RF034, RF041 y RF053. Cada bloque nombra el
 * RF que verifica para que la trazabilidad requisito↔caso de prueba que pide
 * CLAUDE.md §2 (vocabulario ISO/IEC/IEEE 29119) sea legible sin buscar en otro
 * documento.
 */

import { describe, expect, it } from 'vitest';

import {
  codigoPlan,
  existeNombreDuplicado,
  normalizarParaUnicidad,
  siguienteCodigoAsignatura,
  siguienteCodigoCompetencia,
  siguienteCodigoObjetivo,
} from './codigos.js';

describe('RF034 — código automático de objetivo educacional', () => {
  it('arranca en OE-01 cuando no hay ninguno', () => {
    expect(siguienteCodigoObjetivo([])).toBe('OE-01');
  });

  it('continúa el correlativo con relleno de dos dígitos', () => {
    expect(siguienteCodigoObjetivo(['OE-01', 'OE-02'])).toBe('OE-03');
  });

  it('sigue al mayor y no al último de la lista', () => {
    // El orden de llegada no tiene por qué ser el orden numérico: si se
    // continuara por el último elemento, se repetiría un código ya usado.
    expect(siguienteCodigoObjetivo(['OE-03', 'OE-01', 'OE-02'])).toBe('OE-04');
  });

  it('no reutiliza un código liberado al eliminar el intermedio', () => {
    // RF034 RN1 pide un correlativo único; reciclar huecos rompería la
    // trazabilidad de un objetivo que ya pudo citarse en un plan histórico.
    expect(siguienteCodigoObjetivo(['OE-01', 'OE-03'])).toBe('OE-04');
  });

  it('pasa a tres dígitos sin romper el correlativo', () => {
    expect(siguienteCodigoObjetivo(['OE-99'])).toBe('OE-100');
  });

  it('ignora códigos de otra entidad presentes en la lista', () => {
    expect(siguienteCodigoObjetivo(['CPE-07', 'OE-02'])).toBe('OE-03');
  });
});

describe('RF041 — código automático de competencia', () => {
  it('arranca en CPE-01', () => {
    expect(siguienteCodigoCompetencia([])).toBe('CPE-01');
  });

  it('no se confunde con el prefijo de los objetivos', () => {
    // "OE-" y "CPE-" comparten sufijo; un filtro mal hecho contaría de más.
    expect(siguienteCodigoCompetencia(['OE-05', 'CPE-01'])).toBe('CPE-02');
  });
});

describe('RF053 — código de asignatura', () => {
  it('arranca en 101 para sugerir el primer ciclo', () => {
    expect(siguienteCodigoAsignatura('ISI', [])).toBe('ISI-101');
  });

  it('continúa el correlativo dentro de la misma carrera', () => {
    expect(siguienteCodigoAsignatura('ISI', ['ISI-101', 'ISI-102'])).toBe('ISI-103');
  });

  it('cuenta solo los códigos de su propia carrera', () => {
    // Dos carreras conviven en el sistema; el correlativo es por carrera, no
    // global, o dos planes distintos compartirían numeración.
    expect(siguienteCodigoAsignatura('ISI', ['IIN-101', 'IIN-102', 'ISI-101'])).toBe('ISI-102');
  });

  it('arranca limpio para una carrera sin asignaturas aunque existan otras', () => {
    expect(siguienteCodigoAsignatura('ADM', ['ISI-105'])).toBe('ADM-101');
  });

  it('descarta entradas con sufijo no numérico', () => {
    expect(siguienteCodigoAsignatura('ISI', ['ISI-101', 'ISI-BORRADOR'])).toBe('ISI-102');
  });
});

describe('RF022 — código del plan de estudios', () => {
  it('compone carrera, año y versión', () => {
    expect(codigoPlan('ISI', 2026, 2)).toBe('PE-ISI-2026-v2');
  });

  it('distingue versiones del mismo año', () => {
    expect(codigoPlan('ISI', 2026, 1)).not.toBe(codigoPlan('ISI', 2026, 2));
  });
});

describe('RF006 / RF015 — normalización para comparar unicidad', () => {
  it('ignora mayúsculas', () => {
    expect(normalizarParaUnicidad('Ingeniería')).toBe(normalizarParaUnicidad('INGENIERÍA'));
  });

  it('ignora espacios de sobra al inicio, al final y en medio', () => {
    expect(normalizarParaUnicidad('  Ciencias   de la Salud ')).toBe('ciencias de la salud');
  });

  it('ignora acentos', () => {
    // Sin esto convivirían "Ingeniería" e "Ingenieria" como facultades
    // distintas, que es justo el duplicado que RF006 quiere evitar.
    expect(normalizarParaUnicidad('Ingeniería')).toBe(normalizarParaUnicidad('Ingenieria'));
  });

  it('conserva la eñe como letra propia', () => {
    // La eñe no es una "n" con acento: "año" y "ano" son palabras distintas.
    expect(normalizarParaUnicidad('Diseño')).not.toBe(normalizarParaUnicidad('Diseno'));
  });

  it('no colapsa nombres genuinamente distintos', () => {
    expect(normalizarParaUnicidad('Derecho')).not.toBe(normalizarParaUnicidad('Economía'));
  });
});

describe('RF006 — detección de nombre duplicado', () => {
  const existentes = [
    { id: '1', nombre: 'Ingeniería' },
    { id: '2', nombre: 'Ciencias de la Empresa' },
  ];

  it('detecta un duplicado exacto', () => {
    expect(existeNombreDuplicado('Ingeniería', existentes)).toBe(true);
  });

  it('detecta un duplicado que solo difiere en mayúsculas y espacios', () => {
    expect(existeNombreDuplicado('  ingenieria  ', existentes)).toBe(true);
  });

  it('acepta un nombre nuevo', () => {
    expect(existeNombreDuplicado('Humanidades', existentes)).toBe(false);
  });

  it('no se marca a sí mismo al editar', () => {
    // Sin ignorar el propio id, guardar una edición sin cambiar el nombre
    // fallaría siempre con "ya existe".
    expect(existeNombreDuplicado('Ingeniería', existentes, '1')).toBe(false);
  });

  it('sí detecta colisión con otro registro al editar', () => {
    expect(existeNombreDuplicado('Ingeniería', existentes, '2')).toBe(true);
  });

  it('no encuentra duplicados en una lista vacía', () => {
    expect(existeNombreDuplicado('Ingeniería', [])).toBe(false);
  });
});
