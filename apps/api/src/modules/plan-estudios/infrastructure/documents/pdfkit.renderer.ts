/**
 * Renderizador de PDF con PDFKit.
 *
 * Es el adaptador de `RenderizadorPdfPort`. §4.2 deja abiertas dos opciones —
 * PDFKit (dibujo programático) y Puppeteer (HTML→PDF) — y se eligió PDFKit para
 * el MVP: no arrastra Chromium a la imagen Docker (~300 MB) ni a la memoria del
 * VPS, que es un CPX21 de 4 GB compartido con PostgreSQL, Redis, la API y este
 * mismo worker. El precio es este archivo: la maquetación se construye a mano.
 *
 * Si más adelante hace falta más control visual, se escribe otro adaptador del
 * mismo puerto y no se toca nada de lo que el documento dice: eso vive en
 * `domain/documentos/`, que no sabe que existe el PDF.
 *
 * Sobre las fuentes: se usan las estándar de PDF (Helvetica). Cubren acentos,
 * «», · y las comillas tipográficas, pero **no** el guion largo, los puntos
 * suspensivos ni el símbolo de viñeta: PDFKit no los dibuja y tampoco falla —
 * los deja en blanco, que es peor que un error porque no se nota hasta que
 * alguien abre el documento. De ahí `paraFuenteEstandar`. Incrustar una fuente
 * completa lo resolvería, a cambio de cientos de KB en cada archivo.
 */

import PDFDocument from 'pdfkit';

import type { Documento, Seccion, Tabla } from '../../domain/documentos/documento.js';
import type { RenderizadorPdfPort } from '../../application/ports/documentos.port.js';

const MARGEN = 48;
/** A4 en puntos. */
const ANCHO_PAGINA = 595.28;
const ALTO_PAGINA = 841.89;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

/** Espacio reservado abajo para el pie; nada de contenido baja de aquí. */
const ALTO_PIE = 34;
const LIMITE_INFERIOR = ALTO_PAGINA - MARGEN - ALTO_PIE;

const TINTA = '#1f2937';
const TINTA_SUAVE = '#6b7280';
const ACENTO = '#4c1d95';
const LINEA = '#e5e7eb';
const FONDO_CABECERA = '#f3f4f6';

export class RenderizadorPdfKit implements RenderizadorPdfPort {
  async render(documento: Documento): Promise<Buffer> {
    // `bufferPages` mantiene las páginas en memoria para poder volver sobre
    // ellas al final y numerarlas: hasta que no se ha escrito todo no se sabe
    // cuántas hay, y «Página 3 de 7» necesita el total.
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
      bufferPages: true,
      info: { Title: documento.titulo, Subject: documento.subtitulo },
    });

    const partes: Buffer[] = [];
    const terminado = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (parte: Buffer) => partes.push(parte));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);
    });

    portada(doc, documento);
    for (const seccion of documento.secciones) dibujarSeccion(doc, seccion);
    pieEnTodasLasPaginas(doc, documento.pie);

    doc.end();
    return terminado;
  }
}

type Pdf = PDFKit.PDFDocument;

function portada(doc: Pdf, documento: Documento): void {
  doc
    .fillColor(ACENTO)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(t(documento.titulo), MARGEN, MARGEN);
  doc.moveDown(0.2);
  doc.fillColor(TINTA_SUAVE).font('Helvetica').fontSize(11).text(t(documento.subtitulo));
  doc.moveDown(0.8);

  for (const m of documento.metadatos) {
    const y = doc.y;
    doc.fillColor(TINTA_SUAVE).font('Helvetica-Bold').fontSize(9).text(t(m.etiqueta), MARGEN, y, {
      width: 110,
    });
    doc
      .fillColor(TINTA)
      .font('Helvetica')
      .fontSize(9)
      .text(t(m.valor), MARGEN + 115, y, {
        width: ANCHO_UTIL - 115,
      });
    doc.y = Math.max(doc.y, y) + 2;
  }

  doc.moveDown(0.6);
  linea(doc, doc.y);
  doc.y += 12;
}

function dibujarSeccion(doc: Pdf, seccion: Seccion): void {
  // Un título solo al final de la página, con su tabla en la siguiente, se lee
  // como si la sección estuviera vacía. Se reserva sitio para el título más las
  // dos primeras filas antes de decidir.
  reservar(doc, 70);

  doc.fillColor(ACENTO).font('Helvetica-Bold').fontSize(12).text(t(seccion.titulo), MARGEN, doc.y, {
    width: ANCHO_UTIL,
  });
  doc.y += 4;

  for (const parrafo of seccion.parrafos ?? []) {
    reservar(doc, 24);
    doc.fillColor(TINTA).font('Helvetica').fontSize(9.5).text(t(parrafo), MARGEN, doc.y, {
      width: ANCHO_UTIL,
      align: 'left',
    });
    doc.y += 3;
  }

  if (seccion.tabla) dibujarTabla(doc, seccion.tabla);
  doc.y += 14;
}

function dibujarTabla(doc: Pdf, tabla: Tabla): void {
  if (tabla.filas.length === 0) {
    reservar(doc, 24);
    doc
      .fillColor(TINTA_SUAVE)
      .font('Helvetica-Oblique')
      .fontSize(9)
      .text(t(tabla.siVacia), MARGEN, doc.y + 2, { width: ANCHO_UTIL });
    doc.y += 6;
    return;
  }

  const anchos = repartirAnchos(tabla);

  doc.y += 4;
  cabeceraDeTabla(doc, tabla, anchos);

  for (const fila of tabla.filas) {
    const alto = altoDeFila(doc, tabla, fila, anchos);

    // La cabecera se repite en cada página. Sin esto, a partir de la segunda
    // hoja las columnas de una malla de 74 asignaturas no significan nada.
    if (doc.y + alto > LIMITE_INFERIOR) {
      doc.addPage();
      cabeceraDeTabla(doc, tabla, anchos);
    }

    dibujarFila(doc, tabla, fila, anchos, alto);
  }

  linea(doc, doc.y);
}

function cabeceraDeTabla(doc: Pdf, tabla: Tabla, anchos: number[]): void {
  const alto = 18;
  doc.rect(MARGEN, doc.y, ANCHO_UTIL, alto).fill(FONDO_CABECERA);

  let x = MARGEN;
  tabla.columnas.forEach((columna, i) => {
    const ancho = anchos[i] ?? 0;
    doc
      .fillColor(TINTA)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(t(columna.titulo), x + 4, doc.y + 5, {
        width: ancho - 8,
        align: columna.alineacion === 'derecha' ? 'right' : 'left',
        lineBreak: false,
        ellipsis: true,
      });
    x += ancho;
  });

  doc.y += alto;
  linea(doc, doc.y);
}

function dibujarFila(
  doc: Pdf,
  tabla: Tabla,
  fila: readonly string[],
  anchos: number[],
  alto: number,
): void {
  const y = doc.y;
  let x = MARGEN;

  tabla.columnas.forEach((columna, i) => {
    const ancho = anchos[i] ?? 0;
    doc
      .fillColor(TINTA)
      .font('Helvetica')
      .fontSize(8)
      .text(t(fila[i] ?? ''), x + 4, y + 4, {
        width: ancho - 8,
        align: columna.alineacion === 'derecha' ? 'right' : 'left',
      });
    x += ancho;
  });

  doc.y = y + alto;
  linea(doc, doc.y, LINEA);
}

/**
 * Alto que necesita la fila más alta de la fila.
 *
 * Se mide antes de dibujar porque una celda con el nombre largo de una
 * asignatura ocupa dos líneas y las demás una: sin medir, la línea separadora
 * caería encima del texto.
 */
function altoDeFila(doc: Pdf, tabla: Tabla, fila: readonly string[], anchos: number[]): number {
  doc.font('Helvetica').fontSize(8);

  const alturas = tabla.columnas.map((_, i) =>
    doc.heightOfString(t(fila[i] ?? ''), { width: (anchos[i] ?? 0) - 8 }),
  );

  return Math.max(...alturas, 10) + 8;
}

/** Reparte el ancho útil según los pesos que declara el dominio. */
function repartirAnchos(tabla: Tabla): number[] {
  const total = tabla.columnas.reduce((suma, c) => suma + c.peso, 0);
  return tabla.columnas.map((c) => (c.peso / total) * ANCHO_UTIL);
}

function linea(doc: Pdf, y: number, color = LINEA): void {
  doc
    .strokeColor(color)
    .lineWidth(0.5)
    .moveTo(MARGEN, y)
    .lineTo(ANCHO_PAGINA - MARGEN, y)
    .stroke();
}

/** Salta de página si no queda al menos `alto` libre. */
function reservar(doc: Pdf, alto: number): void {
  if (doc.y + alto > LIMITE_INFERIOR) doc.addPage();
}

/**
 * Pie y numeración, escritos al final sobre las páginas ya compuestas.
 *
 * El pie declara de dónde salió el documento. Un PDF que acaba en un expediente
 * de acreditación y no dice qué sistema lo produjo ni cuándo no sirve como
 * evidencia de nada.
 */
function pieEnTodasLasPaginas(doc: Pdf, pie: string): void {
  const { start, count } = doc.bufferedPageRange();

  for (let i = start; i < start + count; i += 1) {
    doc.switchToPage(i);

    // El margen inferior del documento hace que PDFKit añada una página nueva
    // en cuanto se escribe por debajo de él. Se levanta mientras se escribe el
    // pie y se restaura después, o cada pie generaría una página en blanco.
    const margenOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = ALTO_PAGINA - MARGEN - 16;
    linea(doc, y - 6);
    doc
      .fillColor(TINTA_SUAVE)
      .font('Helvetica')
      .fontSize(7.5)
      .text(t(pie), MARGEN, y, { width: ANCHO_UTIL - 70, lineBreak: false, ellipsis: true });

    doc
      .fillColor(TINTA_SUAVE)
      .font('Helvetica')
      .fontSize(7.5)
      .text(`Página ${i - start + 1} de ${count}`, ANCHO_PAGINA - MARGEN - 70, y, {
        width: 70,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.bottom = margenOriginal;
  }
}

/**
 * Sustituciones para lo que las fuentes estándar no dibujan.
 *
 * Comprobado carácter a carácter contra PDFKit: acentos, «», ·, ¿¡, °ºª±§ y las
 * comillas tipográficas salen bien; guion largo y corto, puntos suspensivos,
 * viñeta, € y ™ no. El dominio no tiene por qué saber esto —el mismo texto va a
 * un Excel donde todos existen—, así que la adaptación se queda aquí.
 */
const SUSTITUCIONES: readonly (readonly [RegExp, string])[] = [
  [/[—–]/g, '-'],
  [/…/g, '...'],
  [/•/g, '·'],
  [/€/g, 'EUR'],
  [/™/g, '(TM)'],
];

/** Los únicos caracteres sobre U+00FF que las fuentes estándar sí dibujan. */
const EXTRAS_ADMITIDOS = new Set(['‘', '’', '“', '”']);

/**
 * Deja un texto en lo que la fuente sabe dibujar.
 *
 * Lo que no encaja se marca con `?` en vez de dejarse pasar. Un interrogante se
 * ve y se corrige; un hueco en blanco pasa desapercibido hasta que el documento
 * ya está en un expediente.
 */
function t(texto: string): string {
  let salida = texto;
  for (const [patron, reemplazo] of SUSTITUCIONES) salida = salida.replace(patron, reemplazo);

  return [...salida]
    .map((c) => (c.codePointAt(0)! < 0x100 || EXTRAS_ADMITIDOS.has(c) ? c : '?'))
    .join('');
}
