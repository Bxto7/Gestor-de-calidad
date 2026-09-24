/**
 * Renderizador PDF del Acta de Aprobación (RF-AC-018/019), con PDFKit
 * directo — no pasa por el `Documento` genérico de `platform/documentos/`
 * (Opción B, ver el plan 2026-09-20: ese modelo es deliberadamente pobre y
 * no alcanza para la cabecera en 3 zonas, las barras de sección con color,
 * el zebra ni los bloques que no se parten entre páginas que pide la
 * especificación institucional del acta).
 *
 * A4 horizontal, no vertical como el resto de documentos del proyecto: la
 * especificación (`d:\Descargas\ESPEC_Exportacion_Acta_Plan_de_Mejora.md`
 * §2) lo pide así porque las tablas de acciones tienen muchas columnas.
 */

import PDFDocument from 'pdfkit';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import type { RenderizadorPdfActaPort } from '../../application/ports/documentos-acta.port.js';

/** 1 mm en puntos PDF (1 pt = 1/72 in, 1 in = 25.4 mm). */
function mm(valor: number): number {
  return (valor / 25.4) * 72;
}

const MARGEN = mm(14);
const ALTO_CABECERA = mm(22);
const ALTO_PIE = mm(10);

/** Y máxima donde puede terminar el contenido: por encima del pie. */
function limiteInferior(doc: PDFKit.PDFDocument): number {
  return doc.page.height - MARGEN - ALTO_PIE;
}

/** Colores reales del proyecto — ver §"Decisiones de arquitectura" del plan. */
const COLOR = {
  navy: '#57019f',
  blue: '#6802c1',
  light: '#e9e1fb',
  zebra: '#f7f5fb',
  grid: '#e2e1ea',
  okBg: '#e7f6ee',
  okFg: '#157d4c',
  koBg: '#fef3f2',
  koFg: '#b42318',
  muted: '#565269',
  blanco: '#ffffff',
  texto: '#1a1526',
} as const;

export class RenderizadorPdfActaKit implements RenderizadorPdfActaPort {
  async render(acta: ActaParaDocumento): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: MARGEN + ALTO_CABECERA, bottom: MARGEN + ALTO_PIE, left: MARGEN, right: MARGEN },
      bufferPages: true,
      info: { Title: acta.titulo, Subject: acta.numeroActa },
    });

    const partes: Buffer[] = [];
    const terminado = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (parte: Buffer) => partes.push(parte));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);
    });

    // La cabecera se redibuja en cada página nueva, incluida la primera:
    // `pageAdded` no dispara para la página inicial que el constructor ya
    // creó, así que se llama una vez a mano antes de empezar a escribir.
    doc.on('pageAdded', () => dibujarCabeceraInstitucional(doc, acta));
    dibujarCabeceraInstitucional(doc, acta);

    dibujarCuerpo(doc, acta);

    dibujarPieEnTodasLasPaginas(doc, acta.codigoVerificacion, acta.generadoEn);

    doc.end();
    return terminado;
  }
}

/**
 * Caja de 3 zonas (§3 de la especificación): logo a la izquierda, nombre de
 * la institución al centro, control de documento a la derecha. `doc.y` se
 * deja justo debajo de la caja para que el cuerpo empiece ahí.
 */
function dibujarCabeceraInstitucional(doc: PDFKit.PDFDocument, acta: ActaParaDocumento): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const y = MARGEN;

  doc.save();
  doc.lineWidth(1).strokeColor(COLOR.navy).rect(MARGEN, y, anchoUtil, ALTO_CABECERA).stroke();

  const anchoLogo = mm(45);
  const anchoControl = mm(58);
  const anchoCentro = anchoUtil - anchoLogo - anchoControl;

  // Zona izquierda: recuadro punteado "LOGO INSTITUCIONAL" — no hay logo
  // configurado en este ciclo (§3: "configurable en el sistema; si no hay,
  // recuadro punteado").
  doc
    .dash(3, { space: 2 })
    .rect(MARGEN + mm(2), y + mm(2), anchoLogo - mm(4), ALTO_CABECERA - mm(4))
    .stroke(COLOR.grid)
    .undash();
  doc
    .fontSize(6)
    .fillColor(COLOR.muted)
    .text('LOGO INSTITUCIONAL', MARGEN + mm(2), y + ALTO_CABECERA / 2 - 3, {
      width: anchoLogo - mm(4),
      align: 'center',
    });

  // Zona centro.
  const xCentro = MARGEN + anchoLogo;
  doc
    .fontSize(12)
    .fillColor(COLOR.texto)
    .font('Helvetica-Bold')
    .text('UNIVERSIDAD CONTINENTAL', xCentro, y + mm(2), { width: anchoCentro, align: 'center' });
  doc
    .fontSize(8.5)
    .text('FACULTAD DE INGENIERÍA', xCentro, y + mm(9), { width: anchoCentro, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(acta.titulo, xCentro, y + mm(13.5), { width: anchoCentro, align: 'center' });
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLOR.blue)
    .text('SISTEMA DE GESTIÓN DE LA CALIDAD', xCentro, y + mm(18), {
      width: anchoCentro,
      align: 'center',
    });

  // Zona derecha: control de documento.
  const xControl = MARGEN + anchoLogo + anchoCentro;
  const filas: [string, string][] = [
    ['Código', acta.numeroActa],
    ['Versión', '1'],
    ['Fecha', formatearFecha(acta.generadoEn)],
  ];
  let yFila = y + mm(1);
  const altoFila = (ALTO_CABECERA - mm(2)) / (filas.length + 1);
  for (const [etiqueta, valor] of filas) {
    doc.rect(xControl, yFila, mm(20), altoFila).fill(COLOR.light);
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text(etiqueta, xControl + 2, yFila + 2, { width: mm(20) - 4 });
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .text(valor, xControl + mm(20), yFila + 2, { width: anchoControl - mm(20) - 2 });
    yFila += altoFila;
  }
  doc.rect(xControl, yFila, mm(20), altoFila).fill(COLOR.light);
  doc
    .fillColor(COLOR.texto)
    .font('Helvetica-Bold')
    .fontSize(6.5)
    .text('Página', xControl + 2, yFila + 2, { width: mm(20) - 4 });
  // El valor ("N de M") se escribe en el pase final de `dibujarPieEnTodasLasPaginas`,
  // cuando ya se sabe M.

  doc.restore();
  doc.font('Helvetica').fillColor(COLOR.texto);
  doc.y = y + ALTO_CABECERA + mm(3);
}

/**
 * Línea azul + texto mudo, en cada página. La numeración "Página X de Y"
 * necesita saber Y, que no se sabe hasta terminar de escribir — por eso se
 * hace en un segundo pase sobre `doc.bufferedPageRange()`, igual que
 * `pieEnTodasLasPaginas` del renderer genérico (`pdfkit.renderer.ts`).
 */
/** Escribe el valor de «Página» en la caja de control; la posición debe coincidir con `dibujarCabeceraInstitucional`. */
function dibujarNumeroDePaginaEnCabecera(doc: PDFKit.PDFDocument, numero: number, total: number): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const anchoControl = mm(58);
  const xControl = MARGEN + anchoUtil - anchoControl;
  const altoFila = (ALTO_CABECERA - mm(2)) / 4;
  const yFila = MARGEN + mm(1) + altoFila * 3;
  doc
    .fillColor(COLOR.texto)
    .font('Helvetica')
    .fontSize(6.5)
    .text(`${numero} de ${total}`, xControl + mm(20), yFila + 2, { width: anchoControl - mm(20) - 2 });
}

function dibujarPieEnTodasLasPaginas(
  doc: PDFKit.PDFDocument,
  codigoVerificacion: string,
  generadoEn: Date,
): void {
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    const y = doc.page.height - MARGEN - ALTO_PIE + mm(2);
    const anchoUtil = doc.page.width - MARGEN * 2;

    // El margen inferior hace que PDFKit añada una página nueva en cuanto se
    // escribe por debajo de él. Se levanta mientras se escribe el pie y se
    // restaura después, o cada pie generaría una página fantasma — mismo
    // patrón que `pieEnTodasLasPaginas` en platform/documentos/pdfkit.renderer.ts.
    const margenOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    dibujarNumeroDePaginaEnCabecera(doc, i + 1, rango.count);

    doc
      .save()
      .lineWidth(0.8)
      .strokeColor(COLOR.blue)
      .moveTo(MARGEN, y)
      .lineTo(MARGEN + anchoUtil, y)
      .stroke()
      .restore();

    doc
      .fontSize(6.8)
      .fillColor(COLOR.muted)
      .text(
        `Documento generado por el Sistema de Gestión de la Calidad · ${formatearFechaHora(generadoEn)} · Código de verificación: ${codigoVerificacion}`,
        MARGEN,
        y + 2,
        { width: anchoUtil * 0.7 },
      );
    doc.text(`Página ${i + 1} de ${rango.count}`, MARGEN + anchoUtil * 0.7, y + 2, {
      width: anchoUtil * 0.3,
      align: 'right',
    });

    doc.page.margins.bottom = margenOriginal;
  }
}

/** dd/mm/aaaa — §6 de la especificación. */
function formatearFecha(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  const mmv = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mmv}/${fecha.getUTCFullYear()}`;
}

function formatearFechaHora(fecha: Date): string {
  return `${formatearFecha(fecha)} ${String(fecha.getUTCHours()).padStart(2, '0')}:${String(fecha.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function dibujarCuerpo(doc: PDFKit.PDFDocument, acta: ActaParaDocumento): void {
  dibujarBarraDeSeccion(doc, 'I', 'DATOS DE LA REUNIÓN');
  dibujarTablaClaveValor(doc, [
    ['Reunión convocada por', acta.cabecera.convocadaPor],
    ['Fecha', formatearFecha(acta.cabecera.fecha)],
    ['Lugar / modalidad', acta.cabecera.lugar],
    ['Periodo académico', acta.cabecera.periodoAcademico],
    ['Objetivo', acta.cabecera.objetivo],
  ]);

  dibujarBarraDeSeccion(doc, 'II', 'ASISTENTES');
  dibujarTablaAsistentes(doc, acta.asistentes);

  dibujarBarraDeSeccion(doc, 'III', 'ACUERDO');
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto).text(acta.acuerdo, { align: 'justify' });
  doc.moveDown();

  // Reserva para el bloque inicial de 4.1 (título + cabecera + una fila típica).
  dibujarBarraDeSeccion(doc, 'IV', `PLAN DE MEJORA APROBADO (${acta.resumen.total} acciones)`, mm(45));
  dibujarSubtabla(doc, `4.1 Criterios de Acreditación (${acta.criterios.length})`, [
    { titulo: 'Código', peso: 16 },
    { titulo: 'Acción de mejora', peso: 62 },
    { titulo: 'Criterio de acreditación', peso: 28 },
    { titulo: 'Plazo', peso: 14 },
    { titulo: 'Recursos necesarios', peso: 24 },
    { titulo: 'Metas establecidas', peso: 40 },
    { titulo: 'Responsable', peso: 26 },
  ], acta.criterios.map((c) => [c.codigo, c.nombre, c.codigo, formatearFecha(c.plazo), c.recursos, c.metas, c.responsable]));

  dibujarSubtabla(doc, `4.2 Objetivos Educacionales (${acta.objetivos.length})`, [
    { titulo: 'Código', peso: 16 },
    { titulo: 'Acción de mejora', peso: 62 },
    { titulo: 'Objetivo educacional', peso: 28 },
    { titulo: 'Plazo', peso: 14 },
    { titulo: 'Recursos necesarios', peso: 24 },
    { titulo: 'Metas establecidas', peso: 40 },
    { titulo: 'Responsable', peso: 26 },
  ], acta.objetivos.map((o) => [o.codigo, o.nombre, o.codigo, formatearFecha(o.plazo), o.recursos, o.metas, o.responsable]));

  dibujarSubtabla(doc, `4.3 Competencias del Perfil de Egreso (${acta.competencias.length})`, [
    { titulo: 'Código', peso: 15 },
    { titulo: 'Competencia', peso: 30 },
    { titulo: 'Acción de mejora', peso: 52 },
    { titulo: 'Resultado', peso: 13 },
    { titulo: 'Estado', peso: 15 },
    { titulo: 'Plazo', peso: 14 },
    { titulo: 'Recursos', peso: 22 },
    { titulo: 'Metas establecidas', peso: 38 },
    { titulo: 'Responsable', peso: 20 },
  ], acta.competencias.map((c) => [
    c.codigo,
    c.codigo,
    c.nombre,
    c.resultado === null ? '—' : `${c.resultado}%`,
    c.logrado === null ? '—' : c.logrado ? 'LOGRADO' : 'NO LOGRADO',
    formatearFecha(c.plazo),
    c.recursos,
    c.metas,
    c.responsable,
  ]), acta.competencias.map((c) => c.logrado));

  dibujarBarraDeSeccion(doc, 'V', 'RESUMEN DEL PLAN DE MEJORA');
  dibujarResumen(doc, acta.resumen);

  dibujarBarraDeSeccion(doc, 'VI', 'CONSTANCIA Y RESOLUCIÓN');
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto).text(acta.constanciaYResolucion, { align: 'justify' });
  doc.moveDown();
  if (acta.ciudadYFecha) {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`${acta.ciudadYFecha.lugar}, ${formatearFecha(acta.ciudadYFecha.fecha)}`, { align: 'right' });
  }
}

/**
 * `reservaDespues`: alto que debe caber además de la barra, para que la barra
 * no quede sola al pie de una página con su contenido en la siguiente.
 */
function dibujarBarraDeSeccion(
  doc: PDFKit.PDFDocument,
  numero: string,
  titulo: string,
  reservaDespues = mm(10),
): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  if (doc.y + mm(9) + reservaDespues > limiteInferior(doc)) doc.addPage();
  doc.rect(MARGEN, doc.y, anchoUtil, mm(7)).fill(COLOR.navy);
  doc
    .fillColor(COLOR.blanco)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`${numero}. ${titulo}`, MARGEN + 6, doc.y + mm(1.5));
  doc.y += mm(9);
  doc.fillColor(COLOR.texto).font('Helvetica');
}

function dibujarTablaClaveValor(doc: PDFKit.PDFDocument, filas: readonly [string, string][]): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const anchoClave = anchoUtil * 0.25;
  for (const [clave, valor] of filas) {
    const alto = Math.max(mm(6), doc.heightOfString(valor, { width: anchoUtil - anchoClave - 8 }) + 6);
    if (doc.y + alto > limiteInferior(doc)) doc.addPage();
    doc.rect(MARGEN, doc.y, anchoClave, alto).fill(COLOR.light);
    doc.rect(MARGEN + anchoClave, doc.y, anchoUtil - anchoClave, alto).stroke(COLOR.grid);
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(clave, MARGEN + 4, doc.y + 3, { width: anchoClave - 8 });
    doc.font('Helvetica').text(valor, MARGEN + anchoClave + 4, doc.y + 3, { width: anchoUtil - anchoClave - 8 });
    doc.y += alto;
  }
  doc.moveDown();
}

function dibujarTablaAsistentes(doc: PDFKit.PDFDocument, asistentes: readonly string[]): void {
  const columnas = [
    { titulo: 'N.º', peso: 8 },
    { titulo: 'Nombres y apellidos', peso: 92 },
  ];
  const filas = asistentes.length > 0 ? asistentes.map((n, i) => [String(i + 1), n]) : [];
  dibujarTabla(doc, columnas, filas, 'Sin asistentes registrados.');
}

interface ColumnaTabla {
  readonly titulo: string;
  readonly peso: number;
}

const TAM_CELDA = 7.8;
const ALTO_MIN_FILA = mm(6);
const RELLENO_VERTICAL_FILA = 4;
/** Alto que ocupa el título de una subtabla (9 pt + `moveDown(0.3)`), con holgura. */
const ALTO_TITULO_SUBTABLA = 9 * 1.15 * 1.3 + 2;

/**
 * Deja la fuente lista para una celda: negrita en la primera columna y en la
 * de estado, normal en el resto. Se usa tanto al medir como al dibujar — con
 * otra fuente o tamaño, `heightOfString` subestima la altura real y la fila
 * se sale de la página.
 */
function fuenteDeCelda(doc: PDFKit.PDFDocument, negrita: boolean): void {
  doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(TAM_CELDA);
}

/**
 * Altura real de una fila: la de su celda más alta, medida con el mismo ancho,
 * fuente y tamaño con los que luego se dibuja, más el relleno vertical.
 */
function altoDeFila(
  doc: PDFKit.PDFDocument,
  fila: readonly string[],
  anchos: readonly number[],
  esNegrita: (columna: number) => boolean,
): number {
  const alturas = fila.map((celda, i) => {
    fuenteDeCelda(doc, esNegrita(i));
    return doc.heightOfString(celda, { width: anchos[i]! - 4 });
  });
  return Math.max(ALTO_MIN_FILA, Math.max(...alturas) + RELLENO_VERTICAL_FILA);
}

/**
 * Tabla genérica con cabecera de color, zebra en filas pares, bordes finos
 * y anchos proporcionales al `peso` de cada columna (§5 de la
 * especificación). Repite la fila de cabecera si la tabla se parte entre
 * páginas.
 *
 * Paginación: la altura de cada fila se mide entera antes de dibujarla y, si
 * no cabe en lo que queda de página, se salta ANTES de dibujar, de modo que
 * una fila nunca se parte entre páginas. Lo mismo vale para el bloque inicial
 * (título de la subtabla + cabecera de columnas + primera fila): si no caben
 * juntos, se mueven juntos. Una fila más alta que una página entera no cabe
 * en ninguna; esa es la única que PDFKit seguiría partiendo.
 *
 * `coloreado`, si se pasa, tiñe la celda de Estado de cada fila (LOGRADO en
 * verde, NO LOGRADO en rojo). La columna se localiza por su título
 * «Estado», no por posición: en 4.3 la penúltima es «Metas».
 */
function dibujarTabla(
  doc: PDFKit.PDFDocument,
  columnas: readonly ColumnaTabla[],
  filas: readonly string[][],
  siVacia: string,
  coloreado?: readonly (boolean | null)[],
  titulo?: string,
): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const pesoTotal = columnas.reduce((s, c) => s + c.peso, 0);
  const anchos = columnas.map((c) => (c.peso / pesoTotal) * anchoUtil);
  const altoCabeceraTabla = ALTO_MIN_FILA;
  const indiceEstado = columnas.findIndex((c) => c.titulo === 'Estado');
  const esColumnaEstado = (i: number): boolean => coloreado !== undefined && i === indiceEstado;
  const esNegrita = (i: number): boolean => i === 0 || esColumnaEstado(i);
  const altos = filas.map((f) => altoDeFila(doc, f, anchos, esNegrita));
  const altoTitulo = titulo === undefined ? 0 : ALTO_TITULO_SUBTABLA;
  const altoPrimera = filas.length === 0 ? mm(8) : altos[0]!;

  // Bloque inicial indivisible: título + cabecera + primera fila.
  if (doc.y + altoTitulo + altoCabeceraTabla + altoPrimera > limiteInferior(doc)) doc.addPage();
  if (titulo !== undefined) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.navy).text(titulo);
    doc.moveDown(0.3);
  }

  function dibujarCabecera(): void {
    const y = doc.y;
    let x = MARGEN;
    for (let i = 0; i < columnas.length; i++) {
      doc.rect(x, y, anchos[i]!, altoCabeceraTabla).fill(COLOR.blue);
      doc
        .fillColor(COLOR.blanco)
        .font('Helvetica-Bold')
        .fontSize(TAM_CELDA)
        .text(columnas[i]!.titulo, x + 2, y + 2, { width: anchos[i]! - 4 });
      x += anchos[i]!;
    }
    doc.y = y + altoCabeceraTabla;
    doc.fillColor(COLOR.texto).font('Helvetica');
  }

  dibujarCabecera();

  if (filas.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text(siVacia, MARGEN + 4, doc.y + 4);
    doc.y += mm(8);
    doc.fillColor(COLOR.texto);
    doc.moveDown();
    return;
  }

  filas.forEach((fila, indiceFila) => {
    const alto = altos[indiceFila]!;

    if (doc.y + alto > limiteInferior(doc)) {
      doc.addPage();
      dibujarCabecera();
    }

    // Todas las celdas de la fila parten de la misma `y`: `text()` con
    // coordenadas explícitas mueve `doc.y`, y volver a leerlo en la celda
    // siguiente la dibujaría más abajo que la anterior.
    const yFila = doc.y;
    let x = MARGEN;
    const esLogrado = coloreado?.[indiceFila] ?? null;
    fila.forEach((celda, i) => {
      const estado = esColumnaEstado(i);
      const fondo = estado && esLogrado !== null ? (esLogrado ? COLOR.okBg : COLOR.koBg) : indiceFila % 2 === 1 ? COLOR.zebra : COLOR.blanco;
      const tinta = estado && esLogrado !== null ? (esLogrado ? COLOR.okFg : COLOR.koFg) : COLOR.texto;

      doc.rect(x, yFila, anchos[i]!, alto).fill(fondo).stroke(COLOR.grid);
      fuenteDeCelda(doc, esNegrita(i));
      doc.fillColor(tinta).text(celda, x + 2, yFila + 2, { width: anchos[i]! - 4 });
      x += anchos[i]!;
    });
    doc.y = yFila + alto;
  });

  doc.fillColor(COLOR.texto).font('Helvetica');
  doc.moveDown();
}

function dibujarSubtabla(
  doc: PDFKit.PDFDocument,
  titulo: string,
  columnas: readonly ColumnaTabla[],
  filas: readonly string[][],
  coloreado?: readonly (boolean | null)[],
): void {
  dibujarTabla(doc, columnas, filas, 'Sin acciones registradas para este periodo.', coloreado, titulo);
}

function dibujarResumen(
  doc: PDFKit.PDFDocument,
  resumen: ActaParaDocumento['resumen'],
): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const celdas: readonly [string, string][] = [
    ['Criterios', String(resumen.criterios)],
    ['Objetivos', String(resumen.objetivos)],
    ['Competencias', String(resumen.competencias)],
    ['TOTAL DE ACCIONES', String(resumen.total)],
  ];
  const anchoCelda = anchoUtil / celdas.length;
  const alto = mm(14);
  if (doc.y + alto > limiteInferior(doc)) doc.addPage();

  celdas.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + i * anchoCelda;
    const esTotal = i === celdas.length - 1;
    doc.rect(x, doc.y, anchoCelda, alto).fill(esTotal ? COLOR.light : COLOR.blanco).stroke(COLOR.grid);
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica')
      .fontSize(8)
      .text(etiqueta, x + 4, doc.y + 4, { width: anchoCelda - 8, align: 'center' });
    doc
      .font('Helvetica-Bold')
      .fontSize(esTotal ? 14 : 13)
      .fillColor(COLOR.navy)
      .text(valor, x + 4, doc.y + mm(6), { width: anchoCelda - 8, align: 'center' });
  });
  doc.y += alto;
  doc.fillColor(COLOR.texto).font('Helvetica');
  doc.moveDown();
}
