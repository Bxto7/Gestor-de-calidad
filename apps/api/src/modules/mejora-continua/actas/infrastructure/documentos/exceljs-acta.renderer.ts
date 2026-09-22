/**
 * Renderizador Excel del Acta de Aprobación (RF-AC-018), con ExcelJS
 * directo — Opción B, mismo motivo que `pdfkit-acta.renderer.ts`.
 *
 * Dos hojas (§7 de la especificación): `ACTA` (réplica visual, esta tarea)
 * y `ACCIONES (datos)` (tabla plana, Task 11).
 */

import ExcelJS from 'exceljs';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import type { RenderizadorExcelActaPort } from '../../application/ports/documentos-acta.port.js';

const COLOR = {
  navy: 'FF57019F',
  blue: 'FF6802C1',
  light: 'FFE9E1FB',
  zebra: 'FFF7F5FB',
  grid: 'FFE2E1EA',
  okBg: 'FFE7F6EE',
  okFg: 'FF157D4C',
  koBg: 'FFFEF3F2',
  koFg: 'FFB42318',
  muted: 'FF565269',
  blanco: 'FFFFFFFF',
  entrada: 'FFFFF2CC',
} as const;

const BORDE_FINO: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR.grid } },
  left: { style: 'thin', color: { argb: COLOR.grid } },
  bottom: { style: 'thin', color: { argb: COLOR.grid } },
  right: { style: 'thin', color: { argb: COLOR.grid } },
};

export class RenderizadorExcelActaJs implements RenderizadorExcelActaPort {
  async render(acta: ActaParaDocumento): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Sistema de Gestión de la Calidad';
    libro.created = new Date();

    hojaActa(libro, acta);
    hojaAccionesDatos(libro, acta);

    const bytes = await libro.xlsx.writeBuffer();
    return Buffer.from(bytes);
  }
}

function hojaActa(libro: ExcelJS.Workbook, acta: ActaParaDocumento): void {
  const hoja = libro.addWorksheet('ACTA', {
    views: [{ showGridLines: false }],
    pageSetup: { fitToWidth: 1, fitToHeight: 0, orientation: 'landscape', margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } },
  });
  // §2: la cabecera institucional se repite en cada hoja impresa.
  hoja.pageSetup.printTitlesRow = '1:4';

  for (let i = 1; i <= 12; i++) hoja.getColumn(i).width = 12;

  let fila = 1;
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, 'UNIVERSIDAD CONTINENTAL', { negrita: true, tamano: 14, alineacion: 'center' });
  fila++;
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, acta.titulo, { alineacion: 'center' });
  fila++;
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, 'SISTEMA DE GESTIÓN DE LA CALIDAD', { negrita: true, color: COLOR.blue, alineacion: 'center' });
  fila++;
  celda(hoja, fila, 1, acta.numeroActa, { tamano: 8, color: COLOR.muted });
  celda(hoja, fila, 5, `Código de verificación: ${acta.codigoVerificacion}`, { tamano: 8, color: COLOR.muted });
  celda(hoja, fila, 9, `Generado: ${formatearFecha(acta.generadoEn)}`, { tamano: 8, color: COLOR.muted });
  fila++;

  fila = barraDeSeccion(hoja, fila, 'I. DATOS DE LA REUNIÓN');
  fila = tablaClaveValor(hoja, fila, [
    ['Reunión convocada por', acta.cabecera.convocadaPor],
    ['Fecha', formatearFecha(acta.cabecera.fecha)],
    ['Lugar / modalidad', acta.cabecera.lugar],
    ['Periodo académico', acta.cabecera.periodoAcademico],
    ['Objetivo', acta.cabecera.objetivo],
  ]);

  fila = barraDeSeccion(hoja, fila, 'II. ASISTENTES');
  celda(hoja, fila, 1, 'N.º', { negrita: true, fondo: COLOR.blue, color: COLOR.blanco });
  celda(hoja, fila, 2, 'Nombres y apellidos', { negrita: true, fondo: COLOR.blue, color: COLOR.blanco });
  fila++;
  acta.asistentes.forEach((nombre, i) => {
    celda(hoja, fila, 1, i + 1, { fondo: i % 2 === 1 ? COLOR.zebra : undefined });
    celda(hoja, fila, 2, nombre, { fondo: i % 2 === 1 ? COLOR.zebra : undefined });
    fila++;
  });
  fila++;

  fila = barraDeSeccion(hoja, fila, 'III. ACUERDO');
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, acta.acuerdo, {});
  hoja.getRow(fila).alignment = { wrapText: true, vertical: 'top' };
  fila += 2;

  fila = barraDeSeccion(hoja, fila, `IV. PLAN DE MEJORA APROBADO (${acta.resumen.total} acciones)`);
  fila = subtabla(hoja, fila, `4.1 Criterios de Acreditación (${acta.criterios.length})`,
    ['Código', 'Acción de mejora', 'Criterio de acreditación', 'Plazo', 'Recursos necesarios', 'Metas establecidas', 'Responsable'],
    acta.criterios.map((c) => [c.codigo, c.nombre, c.codigo, formatearFecha(c.plazo), c.recursos, c.metas, c.responsable]));

  fila = subtabla(hoja, fila, `4.2 Objetivos Educacionales (${acta.objetivos.length})`,
    ['Código', 'Acción de mejora', 'Objetivo educacional', 'Plazo', 'Recursos necesarios', 'Metas establecidas', 'Responsable'],
    acta.objetivos.map((o) => [o.codigo, o.nombre, o.codigo, formatearFecha(o.plazo), o.recursos, o.metas, o.responsable]));

  fila = subtablaCompetencias(hoja, fila, acta.competencias);

  fila = barraDeSeccion(hoja, fila, 'V. RESUMEN DEL PLAN DE MEJORA');
  fila = filaResumen(hoja, fila, acta);

  fila = barraDeSeccion(hoja, fila, 'VI. CONSTANCIA Y RESOLUCIÓN');
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, acta.constanciaYResolucion, {});
  hoja.getRow(fila).alignment = { wrapText: true, vertical: 'top' };
  fila += 2;
  if (acta.ciudadYFecha) {
    hoja.mergeCells(fila, 1, fila, 12);
    celda(hoja, fila, 1, `${acta.ciudadYFecha.lugar}, ${formatearFecha(acta.ciudadYFecha.fecha)}`, {
      negrita: true,
      alineacion: 'right',
    });
  }
}

interface EstiloCelda {
  readonly negrita?: boolean;
  readonly tamano?: number;
  readonly color?: string;
  readonly fondo?: string;
  readonly alineacion?: 'left' | 'center' | 'right';
}

function celda(hoja: ExcelJS.Worksheet, fila: number, columna: number, valor: unknown, estilo: EstiloCelda): void {
  const c = hoja.getCell(fila, columna);
  c.value = valor as ExcelJS.CellValue;
  c.font = { bold: estilo.negrita ?? false, size: estilo.tamano ?? 9.5, color: { argb: estilo.color ?? 'FF1A1526' } };
  if (estilo.fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estilo.fondo } };
  c.alignment = { horizontal: estilo.alineacion ?? 'left', vertical: 'middle' };
  c.border = BORDE_FINO;
}

function barraDeSeccion(hoja: ExcelJS.Worksheet, fila: number, titulo: string): number {
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, titulo, { negrita: true, tamano: 10, color: COLOR.blanco, fondo: COLOR.navy });
  return fila + 1;
}

function tablaClaveValor(hoja: ExcelJS.Worksheet, filaInicial: number, filas: readonly [string, string][]): number {
  let fila = filaInicial;
  for (const [clave, valor] of filas) {
    celda(hoja, fila, 1, clave, { negrita: true, fondo: COLOR.light });
    hoja.mergeCells(fila, 2, fila, 12);
    celda(hoja, fila, 2, valor, {});
    fila++;
  }
  return fila + 1;
}

function subtabla(
  hoja: ExcelJS.Worksheet,
  filaInicial: number,
  titulo: string,
  columnas: readonly string[],
  filas: readonly unknown[][],
): number {
  let fila = filaInicial;
  celda(hoja, fila, 1, titulo, { negrita: true, color: COLOR.navy });
  fila++;
  columnas.forEach((c, i) => celda(hoja, fila, i + 1, c, { negrita: true, fondo: COLOR.blue, color: COLOR.blanco }));
  fila++;
  if (filas.length === 0) {
    hoja.mergeCells(fila, 1, fila, columnas.length);
    celda(hoja, fila, 1, 'Sin acciones registradas para este periodo.', { color: COLOR.muted });
    return fila + 2;
  }
  filas.forEach((valores, i) => {
    valores.forEach((v, j) => celda(hoja, fila, j + 1, v, { fondo: i % 2 === 1 ? COLOR.zebra : undefined }));
    fila++;
  });
  return fila + 1;
}

/**
 * §6: el Resultado se toma de la medición (no se digita) y el Estado es una
 * fórmula `=IF(...)` con la meta en una celda de entrada propia de CADA fila
 * (fondo distinto) — no una meta institucional única ni un `0.70` fijo en la
 * fórmula. Cada competencia se congela con su propia meta al aprobar el acta
 * (`metaCompetenciaSnapshot`, RNF24), y puede diferir entre competencias con
 * planes de medición distintos: comparar todas contra la meta de la primera
 * fila producía un veredicto LOGRADO/NO LOGRADO distinto del que calcula el
 * PDF a partir del mismo dato (hallazgo C-1 de la revisión final de rama).
 */
function subtablaCompetencias(
  hoja: ExcelJS.Worksheet,
  filaInicial: number,
  filas: readonly ActaParaDocumento['competencias'][number][],
): number {
  let fila = filaInicial;
  celda(hoja, fila, 1, `4.3 Competencias del Perfil de Egreso (${filas.length})`, { negrita: true, color: COLOR.navy });
  fila++;

  const columnas = ['Código', 'Competencia', 'Acción de mejora', 'Resultado', 'Meta', 'Estado', 'Plazo', 'Recursos', 'Metas establecidas', 'Responsable'];
  columnas.forEach((c, i) => celda(hoja, fila, i + 1, c, { negrita: true, fondo: COLOR.blue, color: COLOR.blanco }));
  fila++;

  if (filas.length === 0) {
    hoja.mergeCells(fila, 1, fila, columnas.length);
    celda(hoja, fila, 1, 'Sin acciones registradas para este periodo.', { color: COLOR.muted });
    return fila + 2;
  }

  filas.forEach((f, i) => {
    const zebra = i % 2 === 1 ? COLOR.zebra : undefined;
    celda(hoja, fila, 1, f.codigo, { fondo: zebra });
    celda(hoja, fila, 2, f.codigo, { fondo: zebra });
    celda(hoja, fila, 3, f.nombre, { fondo: zebra });

    const celdaResultado = hoja.getCell(fila, 4);
    celdaResultado.value = f.resultado === null ? null : f.resultado / 100;
    celdaResultado.numFmt = '0%';
    celdaResultado.border = BORDE_FINO;
    if (zebra) celdaResultado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra } };

    const celdaMeta = hoja.getCell(fila, 5);
    celdaMeta.value = f.meta === null ? null : f.meta / 100;
    celdaMeta.numFmt = '0%';
    celdaMeta.font = { bold: false, size: 9.5, color: { argb: 'FF1A1526' } };
    celdaMeta.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.entrada } };
    celdaMeta.border = BORDE_FINO;

    const celdaEstado = hoja.getCell(fila, 6);
    if (f.resultado === null || f.meta === null) {
      celdaEstado.value = '—';
    } else {
      celdaEstado.value = { formula: `IF(D${fila}>=E${fila},"LOGRADO","NO LOGRADO")` };
      hoja.addConditionalFormatting({
        ref: celdaEstado.address,
        rules: [
          { type: 'containsText', operator: 'containsText', text: 'NO LOGRADO', priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.koBg } }, font: { color: { argb: COLOR.koFg } } } },
          { type: 'containsText', operator: 'containsText', text: 'LOGRADO', priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.okBg } }, font: { color: { argb: COLOR.okFg } } } },
        ],
      });
    }
    celdaEstado.border = BORDE_FINO;

    celda(hoja, fila, 7, formatearFecha(f.plazo), { fondo: zebra });
    celda(hoja, fila, 8, f.recursos, { fondo: zebra });
    celda(hoja, fila, 9, f.metas, { fondo: zebra });
    celda(hoja, fila, 10, f.responsable, { fondo: zebra });
    fila++;
  });

  hoja.mergeCells(fila, 1, fila, columnas.length);
  celda(hoja, fila, 1, 'El resultado corresponde a la medición directa del periodo anterior. La meta se congela por competencia al aprobar el acta.', { color: COLOR.muted, tamano: 7.5 });
  fila++;

  return fila + 1;
}

function filaResumen(hoja: ExcelJS.Worksheet, filaInicial: number, acta: ActaParaDocumento): number {
  const fila = filaInicial;
  celda(hoja, fila, 1, 'Criterios', { negrita: true });
  celda(hoja, fila, 2, acta.resumen.criterios, {});
  celda(hoja, fila, 3, 'Objetivos', { negrita: true });
  celda(hoja, fila, 4, acta.resumen.objetivos, {});
  celda(hoja, fila, 5, 'Competencias', { negrita: true });
  celda(hoja, fila, 6, acta.resumen.competencias, {});
  celda(hoja, fila, 7, 'TOTAL DE ACCIONES', { negrita: true, fondo: COLOR.light });
  const totalCelda = hoja.getCell(fila, 8);
  totalCelda.value = { formula: `SUM(B${fila},D${fila},F${fila})` };
  totalCelda.font = { bold: true, size: 13, color: { argb: 'FF1A1526' } };
  totalCelda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.light } };
  totalCelda.border = BORDE_FINO;
  return fila + 2;
}

function formatearFecha(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getUTCFullYear()}`;
}

const ETIQUETA_ASPECTO = {
  CRITERIO_ACREDITACION: 'Criterio de acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo educacional',
  COMPETENCIA: 'Competencia',
} as const;

/** §7: tabla plana para análisis externo (RF073) — no es una réplica visual. */
function hojaAccionesDatos(libro: ExcelJS.Workbook, acta: ActaParaDocumento): void {
  const hoja = libro.addWorksheet('ACCIONES (datos)', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const columnas = [
    'N.º', 'Acta', 'Periodo', 'Tipo', 'Código', 'Entidad evaluada', 'Acción',
    'Resultado medición', 'Plazo', 'Recursos', 'Metas', 'Responsable',
  ];
  columnas.forEach((c, i) => celda(hoja, 1, i + 1, c, { negrita: true, fondo: COLOR.navy, color: COLOR.blanco }));

  const filas: { tipo: keyof typeof ETIQUETA_ASPECTO; datos: ActaParaDocumento['criterios'][number]; resultado: string }[] = [
    ...acta.criterios.map((c) => ({ tipo: 'CRITERIO_ACREDITACION' as const, datos: c, resultado: '' })),
    ...acta.objetivos.map((o) => ({ tipo: 'OBJETIVO_EDUCACIONAL' as const, datos: o, resultado: '' })),
    ...acta.competencias.map((c) => ({
      tipo: 'COMPETENCIA' as const,
      datos: c,
      resultado: c.resultado === null ? '' : `${c.resultado}%`,
    })),
  ];

  filas.forEach((f, i) => {
    const fila = i + 2;
    celda(hoja, fila, 1, i + 1, {});
    celda(hoja, fila, 2, acta.numeroActa, {});
    celda(hoja, fila, 3, acta.periodoAcademico, {});
    celda(hoja, fila, 4, ETIQUETA_ASPECTO[f.tipo], {});
    celda(hoja, fila, 5, f.datos.codigo, {});
    celda(hoja, fila, 6, f.datos.codigo, {});
    celda(hoja, fila, 7, f.datos.nombre, {});
    celda(hoja, fila, 8, f.resultado, {});
    celda(hoja, fila, 9, formatearFecha(f.datos.plazo), {});
    celda(hoja, fila, 10, f.datos.recursos, {});
    celda(hoja, fila, 11, f.datos.metas, {});
    celda(hoja, fila, 12, f.datos.responsable, {});
  });

  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  hoja.columns.forEach((c) => (c.width = 18));
}
