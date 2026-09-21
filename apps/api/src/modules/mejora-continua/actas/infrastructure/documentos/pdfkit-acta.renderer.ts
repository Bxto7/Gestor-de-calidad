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

    // El cuerpo se agrega en Task 9. Por ahora el documento solo tiene el
    // marco — suficiente para que este Task quede verde por sí solo.

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
  // El número de página real se rellena en el pase final de `dibujarPieEnTodasLasPaginas`.

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
