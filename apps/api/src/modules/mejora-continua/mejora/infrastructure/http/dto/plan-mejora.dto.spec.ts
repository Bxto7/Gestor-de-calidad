/**
 * RF-PJ-006 a RF-PJ-013: la definición se completa de a un campo por vez —
 * cada `onBlur` de `PlanMejoraPage.tsx` reenvía el objeto entero con solo el
 * campo tocado distinto (`datosDefinicionActual(plan)` más ese campo).
 *
 * Los campos nacen vacíos: `PlanMejoraRepositoryPrisma.crear()` los inserta
 * como `''` (y `plazo` como `new Date(0)`) a propósito — "se completan luego
 * con `editarDefinicion`". Exigir `@MinLength(1)` en ellos bloqueaba guardar
 * CUALQUIER campo de un plan recién creado: el envío siempre incluye los
 * demás campos, todavía vacíos, y el DTO entero se rechazaba con 400 antes de
 * llegar al caso de uso. RF-PJ-042 (la validación real de completitud) es
 * 2c-J-D y hoy no existe (`gestionar-planes-mejora.use-case.ts` tiene
 * `tieneBloqueos: false` a propósito, mismo placeholder que tuvo RF-PE-041) —
 * nada exige hoy que estos campos estén llenos al guardarlos, solo al
 * completarlos.
 */

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { DefinicionPlanMejoraDto } from './plan-mejora.dto.js';

const BASE = {
  nombre: '',
  causaRaiz: '',
  justificacion: '',
  plazo: new Date(0).toISOString(),
  recursos: '',
  metas: '',
  responsable: '',
};

function fallos(plano: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(DefinicionPlanMejoraDto, plano)).map((e) => e.property);
}

describe('RF-PJ-006 a RF-PJ-013 — la definición nace vacía y se completa de a un campo', () => {
  it('acepta el objeto de un plan recién creado, todo vacío salvo el campo que se guarda', () => {
    expect(fallos({ ...BASE, nombre: 'Reforzar el syllabus del curso' })).toEqual([]);
  });

  it('acepta guardar cualquier campo sin que los demás estén llenos todavía', () => {
    expect(
      fallos({ ...BASE, causaRaiz: 'Bajo desempeño en la encuesta de egresados' }),
    ).toEqual([]);
  });

  it('acepta el objeto completamente vacío (justo tras crear el plan, sin editar nada aún)', () => {
    expect(fallos(BASE)).toEqual([]);
  });

  it('sigue exigiendo el tipo y el máximo de longitud de cada campo', () => {
    expect(fallos({ ...BASE, nombre: 'x'.repeat(301) })).toContain('nombre');
    expect(fallos({ ...BASE, causaRaiz: 'x'.repeat(4001) })).toContain('causaRaiz');
  });

  it('sigue exigiendo que `plazo` sea una fecha', () => {
    expect(fallos({ ...BASE, plazo: 'no-es-una-fecha' })).toContain('plazo');
  });
});
