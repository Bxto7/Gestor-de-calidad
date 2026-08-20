/**
 * Exportación de documentos: RF072 (PDF del plan), RF073 (Excel de la malla),
 * RF084 (histórico de cambios).
 *
 * IMPLEMENTACIÓN PROVISIONAL — leer antes de usar en producción.
 *
 * CLAUDE.md §3.4 sitúa la generación de PDF y Excel en la capa de
 * infraestructura del backend, ejecutada como job en cola para cumplir el RNF
 * de < 5s bajo carga. Nada de eso existe todavía, así que aquí se resuelve con
 * lo que el navegador da por sí solo:
 *
 *   - "PDF"   -> `window.print()` sobre una vista preparada para impresión. El
 *                usuario elige "Guardar como PDF". No es el documento con
 *                formato institucional que pide RF092.
 *   - "Excel" -> CSV con BOM UTF-8, que Excel abre correctamente. No es un
 *                .xlsx real: sin formato, sin fórmulas, sin varias hojas.
 *
 * Cuando exista el worker de BullMQ, estas funciones se reemplazan por una
 * llamada que encola el job y descarga el archivo resultante.
 */

import type { EventoAprobacion } from '../domain/tipos';

type Fila = readonly (string | number)[];

/**
 * Escapa según RFC 4180. Sin esto, un nombre de asignatura con coma parte la
 * fila en dos columnas y el archivo llega corrupto.
 */
function celda(valor: string | number): string {
  const texto = String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function descargarCsv(nombreArchivo: string, filas: readonly Fila[]): void {
  const contenido = filas.map((f) => f.map(celda).join(',')).join('\r\n');
  // El BOM es lo que hace que Excel respete los acentos en vez de mostrar "Ã³".
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

/** RF084: filas del histórico de aprobaciones. */
export function filasHistorico(eventos: readonly EventoAprobacion[]): Fila[] {
  return [
    ['Fecha', 'Acción', 'Responsable', 'Comentario'],
    ...eventos.map((e) => [e.fecha, e.accion, e.usuario, e.comentario ?? '']),
  ];
}

/**
 * RF072: abre el diálogo de impresión del navegador. La pantalla que lo invoca
 * debe tener aplicadas las reglas `@media print`, que ocultan sidebar, header y
 * controles para que el resultado sea legible.
 */
export function imprimirVista(): void {
  window.print();
}
