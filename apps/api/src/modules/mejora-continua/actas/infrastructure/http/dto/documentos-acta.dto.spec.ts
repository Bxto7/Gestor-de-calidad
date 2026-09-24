import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { GenerarDocumentoActaDto } from './documentos-acta.dto.js';

function fallos(plano: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(GenerarDocumentoActaDto, plano)).map((e) => e.property);
}

describe('GenerarDocumentoActaDto (RF-AC-018/019)', () => {
  it.each(['ACTA_PDF', 'ACTA_EXCEL'])('acepta el tipo %s', (tipo) => {
    expect(fallos({ tipo })).toEqual([]);
  });

  it('rechaza un tipo de otro módulo', () => {
    expect(fallos({ tipo: 'PLAN_MEJORA_PDF' })).toContain('tipo');
  });

  it('exige el tipo', () => {
    expect(fallos({})).toContain('tipo');
  });
});
