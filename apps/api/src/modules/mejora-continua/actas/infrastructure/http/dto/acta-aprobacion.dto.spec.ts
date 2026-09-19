import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  ActualizarSeleccionAccionesDto,
  AsistentesActaDto,
  CabeceraActaDto,
  CrearActaDto,
  TextosActaDto,
} from './acta-aprobacion.dto.js';

function fallos<T extends object>(cls: new () => T, plano: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(cls, plano)).map((e) => e.property);
}

describe('CrearActaDto', () => {
  it('acepta un periodoAcademico no vacío, sin periodoMedicionId', () => {
    expect(fallos(CrearActaDto, { periodoAcademico: '2025-10' })).toEqual([]);
  });

  it('exige periodoAcademico', () => {
    expect(fallos(CrearActaDto, {})).toContain('periodoAcademico');
  });

  it('exige que periodoMedicionId, si viene, sea un UUID', () => {
    expect(fallos(CrearActaDto, { periodoAcademico: '2025-10', periodoMedicionId: 'no-es-uuid' })).toContain(
      'periodoMedicionId',
    );
  });
});

describe('CabeceraActaDto', () => {
  const BASE = {
    titulo: '',
    objetivo: '',
    convocadaPor: '',
    fechaReunion: new Date(0).toISOString(),
    lugarReunion: '',
  };

  /**
   * Sin `@MinLength(1)` a propósito, igual que `DefinicionPlanMejoraDto`:
   * `convocadaPor`/`lugarReunion` nacen vacíos al crear el acta (Task 1) y
   * se completan luego con esta misma edición — la completitud real es
   * RF-AC-016, en 2c-AC-B.
   */
  it('acepta el objeto recién creado, todo vacío salvo el campo que se guarda', () => {
    expect(fallos(CabeceraActaDto, { ...BASE, convocadaPor: 'Directora de Escuela' })).toEqual([]);
  });

  it('sigue exigiendo el tipo y el máximo de longitud', () => {
    expect(fallos(CabeceraActaDto, { ...BASE, titulo: 'x'.repeat(301) })).toContain('titulo');
  });

  it('sigue exigiendo que fechaReunion sea una fecha', () => {
    expect(fallos(CabeceraActaDto, { ...BASE, fechaReunion: 'no-es-una-fecha' })).toContain(
      'fechaReunion',
    );
  });

  it('acepta lugarEmision/fechaEmision/comentario omitidos', () => {
    expect(fallos(CabeceraActaDto, BASE)).toEqual([]);
  });
});

describe('AsistentesActaDto', () => {
  it('acepta una lista de nombres', () => {
    expect(fallos(AsistentesActaDto, { nombres: ['Ana Pérez', 'Luis Gómez'] })).toEqual([]);
  });

  it('acepta una lista vacía (se limpia antes de emitir, no antes de guardar)', () => {
    expect(fallos(AsistentesActaDto, { nombres: [] })).toEqual([]);
  });

  it('rechaza un elemento que no sea texto', () => {
    expect(fallos(AsistentesActaDto, { nombres: [123] })).toContain('nombres');
  });
});

describe('ActualizarSeleccionAccionesDto', () => {
  it('acepta una selección válida', () => {
    expect(
      fallos(ActualizarSeleccionAccionesDto, {
        seleccion: [{ planMejoraId: '11111111-1111-4111-8111-111111111111', incluida: false }],
      }),
    ).toEqual([]);
  });

  it('rechaza un planMejoraId que no es UUID', () => {
    const errores = fallos(ActualizarSeleccionAccionesDto, {
      seleccion: [{ planMejoraId: 'no-es-uuid', incluida: true }],
    });
    expect(errores).toContain('seleccion');
  });
});

describe('TextosActaDto', () => {
  it('acepta ambos campos opcionales', () => {
    expect(fallos(TextosActaDto, { textoIntroduccion: 'x', textoAcuerdoCierre: 'y' })).toEqual([]);
  });

  it('acepta el objeto vacío (ningún campo es obligatorio)', () => {
    expect(fallos(TextosActaDto, {})).toEqual([]);
  });
});
