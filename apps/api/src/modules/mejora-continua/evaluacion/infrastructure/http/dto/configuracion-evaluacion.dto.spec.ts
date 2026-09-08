/**
 * Los tres campos obligatorios de la configuración, contra la entrada que los
 * dejaba pasar en blanco.
 *
 * `@MinLength(1)` mide la cadena tal como llega: `"   "` mide 3 y pasa, y la
 * columna `NOT NULL` tampoco lo rechaza, así que RF-PE-017 RN1 —«entregable
 * obligatorio»— quedaba satisfecho sobre el papel con un entregable en blanco.
 * `Recortado()` recorta antes de medir, y por eso se prueba aquí y no en el
 * caso de uso: la barrera está en el DTO, que es la puerta HTTP (§8 del
 * diseño: «Entregable vacío | 400 del DTO»). RF-PE-029 RN1 corre el mismo
 * riesgo con la instrucción de una indicación, así que sigue el mismo patrón.
 */

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  AsignaturaEvaluadaDto,
  EvidenciaDto,
  IndicacionDto,
} from './configuracion-evaluacion.dto.js';

const UUID = '11111111-1111-4111-8111-111111111111';

function fallos<T extends object>(clase: new () => T, plano: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(clase, plano)).map((e) => e.property);
}

describe('RF-PE-017 RN1 — el entregable es obligatorio de verdad', () => {
  it('rechaza el que solo son espacios', () => {
    expect(fallos(AsignaturaEvaluadaDto, { asignaturaId: UUID, entregable: '   ' })).toContain(
      'entregable',
    );
  });

  it('y acepta el que tiene contenido', () => {
    expect(fallos(AsignaturaEvaluadaDto, { asignaturaId: UUID, entregable: 'Proyecto' })).toEqual(
      [],
    );
  });

  it('llega recortado al caso de uso, no con los espacios de los lados', () => {
    // Si pasara sin recortar, la fila guardaría `" Proyecto "` y dos entregables
    // que el usuario escribió igual dejarían de parecerse.
    const dto = plainToInstance(AsignaturaEvaluadaDto, {
      asignaturaId: UUID,
      entregable: '  Proyecto  ',
    });

    expect(dto.entregable).toBe('Proyecto');
  });
});

describe('RF-PE-020 — la descripción de una evidencia sigue la misma regla', () => {
  it('rechaza la que solo son espacios', () => {
    expect(
      fallos(EvidenciaDto, { enlace: 'https://drive.example/x', descripcion: '   ' }),
    ).toContain('descripcion');
  });

  it('y acepta la que describe algo', () => {
    expect(
      fallos(EvidenciaDto, { enlace: 'https://drive.example/x', descripcion: 'Rúbrica firmada' }),
    ).toEqual([]);
  });
});

describe('RF-PE-029 RN1 — la instrucción de una indicación sigue la misma regla', () => {
  it('rechaza la que solo son espacios', () => {
    expect(
      fallos(IndicacionDto, {
        grupoObjetivo: 'EGRESADOS',
        instruccion: '   ',
        enlaceInstrumento: 'https://drive.example/x',
      }),
    ).toContain('instruccion');
  });

  it('y acepta la que tiene contenido', () => {
    expect(
      fallos(IndicacionDto, {
        grupoObjetivo: 'EGRESADOS',
        instruccion: 'Responda la encuesta antes del 30 de noviembre.',
        enlaceInstrumento: 'https://drive.example/x',
      }),
    ).toEqual([]);
  });

  it('llega recortada al caso de uso, no con los espacios de los lados', () => {
    // Si pasara sin recortar, la fila guardaría la instrucción con espacios y
    // dos ediciones que un usuario escribió igual dejarían de parecerse.
    const dto = plainToInstance(IndicacionDto, {
      grupoObjetivo: 'EGRESADOS',
      instruccion: '  Responda la encuesta.  ',
      enlaceInstrumento: 'https://drive.example/x',
    });

    expect(dto.instruccion).toBe('Responda la encuesta.');
  });
});
