/**
 * Renderizador de hoja de cálculo con ExcelJS.
 *
 * Adaptador de `RenderizadorHojaPort`. Genera un .xlsx de verdad y no un CSV
 * renombrado, que es lo que hacía la versión provisional del navegador: sin
 * varias hojas, sin tipos y con los acentos dependiendo de que Excel acertara
 * con la codificación.
 *
 * La diferencia que más importa es que los números se escriben como números.
 * RF073 justifica el Excel por los «análisis externos», y una columna de
 * créditos guardada como texto no se puede sumar ni promediar: el archivo se
 * abriría bien y sería inútil para lo único que se pidió.
 */

import ExcelJS from 'exceljs';

import type { Documento, Seccion } from '../../domain/documentos/documento.js';
import type { RenderizadorHojaPort } from '../../application/ports/documentos.port.js';

/** Excel rechaza estos caracteres en el nombre de una hoja, y el límite es 31. */
const PROHIBIDOS = /[[\]:*?/\\]/g;
const LARGO_MAXIMO_HOJA = 31;

export class RenderizadorExcelJs implements RenderizadorHojaPort {
  async render(documento: Documento): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Sistema de Gestión de la Calidad';
    libro.created = new Date();

    hojaDeInformacion(libro, documento);

    const usados = new Set<string>(['Información']);
    for (const seccion of documento.secciones) {
      if (!seccion.tabla) continue;
      hojaDeSeccion(libro, seccion, nombreDeHoja(seccion.titulo, usados));
    }

    // ExcelJS devuelve un ArrayBuffer de Node; `Buffer.from` sobre él no copia.
    const bytes = await libro.xlsx.writeBuffer();
    return Buffer.from(bytes);
  }
}

/**
 * Primera hoja: de qué plan es esto y de dónde salió.
 *
 * Va en su propia hoja y no como filas sueltas encima de la tabla porque unas
 * cabeceras por encima de los datos rompen el filtro y las tablas dinámicas,
 * que es justo para lo que se exporta.
 */
function hojaDeInformacion(libro: ExcelJS.Workbook, documento: Documento): void {
  const hoja = libro.addWorksheet('Información');
  hoja.columns = [
    { key: 'etiqueta', width: 26 },
    { key: 'valor', width: 70 },
  ];

  const titulo = hoja.addRow([documento.titulo, '']);
  titulo.font = { bold: true, size: 14 };
  hoja.addRow([documento.subtitulo, '']).font = { color: { argb: 'FF6B7280' } };
  hoja.addRow([]);

  for (const m of documento.metadatos) {
    const fila = hoja.addRow([m.etiqueta, m.valor]);
    fila.getCell(1).font = { bold: true };
  }

  hoja.addRow([]);
  hoja.addRow(['Procedencia', documento.pie]).getCell(1).font = { bold: true };
}

function hojaDeSeccion(libro: ExcelJS.Workbook, seccion: Seccion, nombre: string): void {
  const tabla = seccion.tabla;
  if (!tabla) return;

  const hoja = libro.addWorksheet(nombre);

  hoja.columns = tabla.columnas.map((c) => ({
    // El peso del dominio es relativo; aquí se traduce a caracteres. El mínimo
    // evita que «Cr.» quede tan estrecha que el propio título salga cortado.
    width: Math.max(10, Math.round(c.peso * 7)),
  }));

  const cabecera = hoja.addRow(tabla.columnas.map((c) => c.titulo));
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } };
  cabecera.alignment = { vertical: 'middle' };
  cabecera.height = 20;

  if (tabla.filas.length === 0) {
    // Se escribe el motivo en la hoja. Una pestaña con solo la cabecera no
    // distingue «este plan no tiene asignaturas» de «la exportación falló».
    hoja.addRow([tabla.siVacia]);
    hoja.getRow(2).font = { italic: true, color: { argb: 'FF6B7280' } };
    return;
  }

  for (const fila of tabla.filas) {
    hoja.addRow(tabla.columnas.map((columna, i) => valorDeCelda(fila[i] ?? '', columna.alineacion)));
  }

  // Filtro y cabecera congelada: con 74 asignaturas, desplazarse sin ellos deja
  // las columnas sin nombre a los pocos segundos.
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: tabla.columnas.length },
  };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Número donde el dominio dijo «esto se alinea a la derecha», texto en el resto.
 *
 * La alineación es la señal de que la columna es numérica: el modelo de dominio
 * no habla de tipos de dato porque no sabe si acabará en un PDF o en Excel, y
 * añadirle un campo `esNumero` sería describir la hoja de cálculo desde el
 * dominio. Se comprueba además que el texto sea realmente un número, para que
 * un «—» o un vacío no acaben convertidos en cero.
 */
function valorDeCelda(texto: string, alineacion: 'izquierda' | 'derecha' | undefined): string | number {
  if (alineacion !== 'derecha') return texto;
  if (texto.trim() === '') return texto;

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : texto;
}

/** Nombre de hoja válido y único, recortado a lo que Excel admite. */
function nombreDeHoja(titulo: string, usados: Set<string>): string {
  const limpio = titulo.replace(PROHIBIDOS, ' ').trim().slice(0, LARGO_MAXIMO_HOJA) || 'Hoja';

  if (!usados.has(limpio)) {
    usados.add(limpio);
    return limpio;
  }

  // Dos secciones con el mismo título harían fallar el libro entero. Se
  // desambigua recortando para dejar sitio al sufijo.
  for (let n = 2; ; n += 1) {
    const sufijo = ` (${n})`;
    const candidato = limpio.slice(0, LARGO_MAXIMO_HOJA - sufijo.length) + sufijo;
    if (!usados.has(candidato)) {
      usados.add(candidato);
      return candidato;
    }
  }
}
