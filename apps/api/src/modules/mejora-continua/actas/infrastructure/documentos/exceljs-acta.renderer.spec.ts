// apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import { RenderizadorExcelActaJs } from './exceljs-acta.renderer.js';

function acta(sobre: Partial<ActaParaDocumento> = {}): ActaParaDocumento {
  return {
    numeroActa: 'ACTA N° 002 – EAP-ISI',
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    periodoAcademico: '2025-10',
    cabecera: {
      convocadaPor: 'Directora de Escuela',
      fecha: new Date('2026-03-09'),
      lugar: 'Sala de reuniones',
      periodoAcademico: '2025-10',
      objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    },
    asistentes: ['Ana Pérez', 'Luis Gómez'],
    acuerdo: 'Se deja constancia de la revisión.',
    criterios: [
      {
        codigo: 'CA-01', nombre: 'Reforzar bibliografía', plazo: new Date('2026-12-01'),
        recursos: 'Presupuesto adicional', metas: 'Elevar el indicador', responsable: 'Coordinación académica',
      },
    ],
    objetivos: [],
    competencias: [
      {
        codigo: 'COMP-01', nombre: 'Diseñar soluciones', plazo: new Date('2026-12-01'),
        recursos: 'Taller adicional', metas: 'Elevar el logro', responsable: 'Docente responsable',
        resultado: 75, meta: 70, logrado: true,
      },
    ],
    resumen: { criterios: 1, objetivos: 0, competencias: 1, total: 2 },
    constanciaYResolucion: 'Se resuelve aprobar las acciones.',
    ciudadYFecha: { lugar: 'Huancayo', fecha: new Date('2026-03-20') },
    codigoVerificacion: 'abc123def456',
    generadoEn: new Date('2026-09-20T15:00:00Z'),
    ...sobre,
  };
}

async function abrir(xlsx: Buffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(xlsx as unknown as ArrayBuffer);
  return libro;
}

describe('RenderizadorExcelActaJs — hoja ACTA', () => {
  it('produce un .xlsx válido con la hoja ACTA primero', async () => {
    const xlsx = await new RenderizadorExcelActaJs().render(acta());
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
    const libro = await abrir(xlsx);
    expect(libro.worksheets[0]?.name).toBe('ACTA');
  });

  it('la hoja ACTA no tiene cuadrícula y ajusta a una página de ancho', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    expect(hoja.views[0]?.showGridLines).toBe(false);
    expect(hoja.pageSetup.fitToWidth).toBe(1);
    expect(hoja.pageSetup.fitToHeight).toBe(0);
    expect(hoja.pageSetup.orientation).toBe('landscape');
  });

  it('escribe la cabecera institucional, el acuerdo y la lista de asistentes', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    const valores = hoja.getSheetValues().flat().filter((v): v is string => typeof v === 'string');

    expect(valores.join(' ')).toContain('UNIVERSIDAD CONTINENTAL');
    expect(valores.join(' ')).toContain('Directora de Escuela');
    expect(valores.join(' ')).toContain('Ana Pérez');
    expect(valores.join(' ')).toContain('Se deja constancia de la revisión.');
  });

  it('el resultado de Competencias es una fórmula IF, no un texto fijo', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    const celdaFormula = hoja
      .getRows(1, hoja.rowCount)
      ?.flatMap((fila) => (Array.isArray(fila.values) ? fila.values : []))
      .find(
        (v): v is ExcelJS.CellFormulaValue =>
          typeof v === 'object' && v !== null && 'formula' in v && String(v.formula).includes('IF'),
      );

    expect(celdaFormula).toBeDefined();
    expect(String(celdaFormula?.formula)).toContain('LOGRADO');
  });

  it('la celda de meta tiene el color de entrada distinto (#FFF2CC)', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    let encontrada = false;
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const relleno = celda.fill;
        if (relleno?.type === 'pattern' && relleno.fgColor?.argb === 'FFFFF2CC') encontrada = true;
      });
    });
    expect(encontrada).toBe(true);
  });

  it('el resumen usa fórmulas COUNTA/SUMA, no números fijos', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    const formulas: string[] = [];
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const v = celda.value;
        if (typeof v === 'object' && v !== null && 'formula' in v) formulas.push(String(v.formula));
      });
    });
    expect(formulas.some((f) => f.includes('COUNTA') || f.includes('SUM'))).toBe(true);
  });
});
