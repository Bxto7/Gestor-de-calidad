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
    const valores = (hoja.getSheetValues() as unknown[]).flat().filter((v): v is string => typeof v === 'string');

    expect(valores.join(' ')).toContain('UNIVERSIDAD CONTINENTAL');
    expect(valores.join(' ')).toContain('Directora de Escuela');
    expect(valores.join(' ')).toContain('Ana Pérez');
    expect(valores.join(' ')).toContain('Se deja constancia de la revisión.');
  });

  it('el resultado de Competencias es una fórmula IF, no un texto fijo', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    const filas = hoja.getRows(1, hoja.rowCount) ?? [];
    const celdaFormula = (filas.flatMap((fila) => fila.values as unknown[]))
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

  it('agrega una segunda hoja ACCIONES (datos), plana y con autofiltro', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    expect(libro.worksheets.map((h) => h.name)).toEqual(['ACTA', 'ACCIONES (datos)']);

    const hoja = libro.getWorksheet('ACCIONES (datos)')!;
    expect(hoja.autoFilter).toBeDefined();
    expect(hoja.views.some((v) => v.state === 'frozen' && v.ySplit === 1)).toBe(true);
  });

  it('C-1: Estado escribe el texto literal "—" (sin fórmula) cuando falta resultado o meta', async () => {
    const xlsx = await new RenderizadorExcelActaJs().render(
      acta({
        competencias: [
          {
            codigo: 'SIN-01', nombre: 'Sin resultado', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: null, meta: 70, logrado: null,
          },
          {
            codigo: 'SIN-02', nombre: 'Sin meta', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 80, meta: null, logrado: null,
          },
        ],
      }),
    );
    const libro = await abrir(xlsx);
    const hoja = libro.getWorksheet('ACTA')!;

    function filaDe(codigo: string): ExcelJS.Row | undefined {
      let encontrada: ExcelJS.Row | undefined;
      hoja.eachRow((fila) => {
        if (fila.getCell(1).value === codigo) encontrada = fila;
      });
      return encontrada;
    }

    expect(filaDe('SIN-01')?.getCell(6).value).toBe('—');
    expect(filaDe('SIN-02')?.getCell(6).value).toBe('—');
  });

  it('C-1: dos competencias con metas distintas producen fórmulas IF distintas, cada una con su propia celda de Meta', async () => {
    const xlsx = await new RenderizadorExcelActaJs().render(
      acta({
        competencias: [
          {
            codigo: 'COMP-A', nombre: 'Competencia A', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 60, meta: 50, logrado: true,
          },
          {
            codigo: 'COMP-B', nombre: 'Competencia B', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 60, meta: 80, logrado: false,
          },
        ],
      }),
    );
    const libro = await abrir(xlsx);
    const hoja = libro.getWorksheet('ACTA')!;

    function filaDe(codigo: string): ExcelJS.Row | undefined {
      let encontrada: ExcelJS.Row | undefined;
      hoja.eachRow((fila) => {
        if (fila.getCell(1).value === codigo) encontrada = fila;
      });
      return encontrada;
    }

    const filaA = filaDe('COMP-A')!;
    const filaB = filaDe('COMP-B')!;
    const estadoA = filaA.getCell(6).value as ExcelJS.CellFormulaValue;
    const estadoB = filaB.getCell(6).value as ExcelJS.CellFormulaValue;

    expect(String(estadoA.formula)).toContain(`E${filaA.number}`);
    expect(String(estadoB.formula)).toContain(`E${filaB.number}`);
    expect(String(estadoA.formula)).not.toBe(String(estadoB.formula));
  });

  it('C-1: la columna Meta lleva la meta propia de cada fila, no una única celda compartida', async () => {
    const xlsx = await new RenderizadorExcelActaJs().render(
      acta({
        competencias: [
          {
            codigo: 'COMP-A', nombre: 'Competencia A', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 60, meta: 50, logrado: true,
          },
          {
            codigo: 'COMP-B', nombre: 'Competencia B', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 60, meta: 80, logrado: false,
          },
        ],
      }),
    );
    const libro = await abrir(xlsx);
    const hoja = libro.getWorksheet('ACTA')!;

    function filaDe(codigo: string): ExcelJS.Row | undefined {
      let encontrada: ExcelJS.Row | undefined;
      hoja.eachRow((fila) => {
        if (fila.getCell(1).value === codigo) encontrada = fila;
      });
      return encontrada;
    }

    expect(filaDe('COMP-A')?.getCell(5).value).toBeCloseTo(0.5);
    expect(filaDe('COMP-B')?.getCell(5).value).toBeCloseTo(0.8);
  });

  it('M-2: la cabecera de la hoja ACTA lleva el código de verificación', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta({ codigoVerificacion: 'zzz999yyy888' })));
    const hoja = libro.getWorksheet('ACTA')!;
    const valores = (hoja.getSheetValues() as unknown[]).flat().filter((v): v is string => typeof v === 'string');

    expect(valores.some((v) => v.includes('zzz999yyy888'))).toBe(true);
  });

  it('la hoja de datos trae una fila por acción, con periodo, tipo y responsable', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACCIONES (datos)')!;
    const valores = hoja
      .getSheetValues()
      .slice(1)
      .flatMap((fila) => (Array.isArray(fila) ? fila : []));

    expect(valores).toContain('CA-01');
    expect(valores).toContain('COMP-01');
    expect(valores).toContain('2025-10');
  });
});
