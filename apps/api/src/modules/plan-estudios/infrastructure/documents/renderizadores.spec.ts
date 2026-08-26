/**
 * Pruebas de los renderizadores.
 *
 * Van más allá de «no lanza excepción»: abren el archivo generado y comprueban
 * qué dice. Un PDF que se produce sin fallar pero sale con los acentos rotos, o
 * un Excel con los créditos guardados como texto, pasarían cualquier prueba que
 * solo mire que hay bytes — y son exactamente los dos fallos que hacen inútil
 * un documento de acreditación.
 *
 * No necesitan base de datos ni contenedores: entra un `Documento` de dominio y
 * sale un búfer. Por eso están aquí y no en la suite de integración.
 */

import ExcelJS from 'exceljs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import type { Documento } from '../../domain/documentos/documento.js';
import { RenderizadorExcelJs } from './exceljs.renderer.js';
import { RenderizadorPdfKit } from './pdfkit.renderer.js';

function documento(sobre: Partial<Documento> = {}): Documento {
  return {
    nombreArchivo: 'prueba',
    titulo: 'Plan de estudios',
    subtitulo: 'Ingeniería de Sistemas e Informática · PE-ISI-2018-v1 v1',
    metadatos: [{ etiqueta: 'Facultad', valor: 'Ingeniería' }],
    secciones: [
      {
        titulo: 'Ciclo 1 — 21 créditos',
        tabla: {
          columnas: [
            { titulo: 'Código', peso: 2 },
            { titulo: 'Asignatura', peso: 5 },
            { titulo: 'Cr.', peso: 1, alineacion: 'derecha' },
          ],
          filas: [['ASUC01113', 'Diseño de Software Ágil', '4']],
          siVacia: 'Sin asignaturas ubicadas en este ciclo.',
        },
      },
    ],
    pie: 'Generado por el Sistema de Gestión de la Calidad el 25/08/2026 15:30 UTC',
    ...sobre,
  };
}

/**
 * Texto visible de un PDF.
 *
 * Dos detalles que hay que respetar o la extracción devuelve vacío y la prueba
 * pasa sin comprobar nada:
 *
 *  1. PDFKit no escribe `(texto) Tj` sino `[<hex> 0] TJ` — cadenas en
 *     hexadecimal dentro de un array, para poder ajustar el interletraje.
 *  2. Esos bytes van en la codificación de la fuente, WinAnsi en las estándar,
 *     que coincide con latin1. Decodificarlos como UTF-8 daría por rotos
 *     acentos que en realidad están bien.
 */
function textoDelPdf(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const piezas: string[] = [];

  for (const bloque of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const datos = Buffer.from(bloque[1] ?? '', 'latin1');

    let contenido: string;
    try {
      contenido = inflateSync(datos).toString('latin1');
    } catch {
      // Los flujos que no son de contenido comprimido (fuentes incrustadas,
      // imágenes) se ignoran en vez de hacer fallar la extracción entera.
      continue;
    }

    for (const cadena of contenido.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      piezas.push(Buffer.from(cadena[1] ?? '', 'hex').toString('latin1'));
    }
  }

  return piezas.join('');
}

describe('RenderizadorPdfKit', () => {
  it('produce un PDF válido', async () => {
    const pdf = await new RenderizadorPdfKit().render(documento());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(500);
  });

  it('conserva los acentos y los signos que usa el documento', async () => {
    // Lo que las fuentes estándar sí dibujan: á/é/í/ó/ú/ñ, «», ·, ¿¡. Si una
    // actualización de PDFKit cambiara la codificación, los acentos saldrían
    // como basura y esta prueba es lo que lo detectaría.
    const pdf = await new RenderizadorPdfKit().render(documento());
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('Ingeniería de Sistemas e Informática');
    expect(texto).toContain('Diseño de Software Ágil');
    expect(texto).toContain('·');
  });

  it('sustituye los caracteres que la fuente no dibuja, sin dejarlos en blanco', async () => {
    // PDFKit no falla con un guion largo: lo omite. El documento sale con un
    // hueco donde debía haber un separador y nadie se entera hasta abrirlo.
    const pdf = await new RenderizadorPdfKit().render(
      documento({ secciones: [{ titulo: 'Ciclo 1 — 21 créditos', parrafos: ['Uno… y dos •'] }] }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('Ciclo 1 - 21 créditos');
    expect(texto).toContain('Uno... y dos ·');
  });

  it('lo que no cabe en la fuente se marca, no se pierde', async () => {
    const pdf = await new RenderizadorPdfKit().render(
      documento({ secciones: [{ titulo: 'Idioma 日本語', parrafos: [] }] }),
    );
    expect(textoDelPdf(pdf)).toContain('Idioma ???');
  });

  it('el pie y la numeración salen en todas las páginas', async () => {
    // Muchas filas para forzar el salto de página.
    const filas = Array.from({ length: 120 }, (_, i) => [`COD${i}`, `Asignatura ${i}`, '3']);
    const pdf = await new RenderizadorPdfKit().render(
      documento({
        secciones: [
          {
            titulo: 'Malla',
            tabla: {
              columnas: [
                { titulo: 'Código', peso: 2 },
                { titulo: 'Asignatura', peso: 5 },
                { titulo: 'Cr.', peso: 1, alineacion: 'derecha' },
              ],
              filas,
              siVacia: '',
            },
          },
        ],
      }),
    );

    const texto = textoDelPdf(pdf);
    expect(texto).toContain('Página 1 de');
    expect(texto).toContain('Página 2 de');

    // La cabecera se repite: sin eso, en la página 2 las columnas no se sabe
    // qué son. El texto extraído va sin separadores, así que se busca la
    // secuencia entera de títulos.
    const cabeceras = [...texto.matchAll(/CódigoAsignaturaCr\./g)].length;
    expect(cabeceras).toBeGreaterThanOrEqual(2);
  });

  it('una tabla vacía escribe su motivo en vez de quedarse en blanco', async () => {
    const pdf = await new RenderizadorPdfKit().render(
      documento({
        secciones: [
          {
            titulo: 'Ciclo 7 — 0 créditos',
            tabla: {
              columnas: [{ titulo: 'Código', peso: 1 }],
              filas: [],
              siVacia: 'Sin asignaturas ubicadas en este ciclo.',
            },
          },
        ],
      }),
    );

    expect(textoDelPdf(pdf)).toContain('Sin asignaturas ubicadas en este ciclo.');
  });
});

describe('RenderizadorExcelJs', () => {
  async function abrir(xlsx: Buffer): Promise<ExcelJS.Workbook> {
    const libro = new ExcelJS.Workbook();
    // El tipo de `load` pide un ArrayBuffer del DOM; el Buffer de Node cumple
    // en tiempo de ejecución y ExcelJS lo documenta así.
    await libro.xlsx.load(xlsx as unknown as ArrayBuffer);
    return libro;
  }

  it('produce un .xlsx que se puede volver a abrir', async () => {
    const xlsx = await new RenderizadorExcelJs().render(documento());
    // PK: es un zip, que es lo que un .xlsx es por dentro.
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');

    const libro = await abrir(xlsx);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Información', 'Ciclo 1 — 21 créditos']);
  });

  it('los créditos se guardan como número, no como texto', async () => {
    // RF073 justifica el Excel por los «análisis externos». Una columna de
    // créditos en texto no se puede sumar: el archivo abriría bien y no serviría.
    const libro = await abrir(await new RenderizadorExcelJs().render(documento()));
    const hoja = libro.getWorksheet('Ciclo 1 — 21 créditos');

    expect(hoja?.getRow(2).getCell(3).value).toBe(4);
    expect(hoja?.getRow(2).getCell(1).value).toBe('ASUC01113');
  });

  it('un guion en una columna numérica no se convierte en cero', async () => {
    const libro = await abrir(
      await new RenderizadorExcelJs().render(
        documento({
          secciones: [
            {
              titulo: 'Datos',
              tabla: {
                columnas: [{ titulo: 'Cr.', peso: 1, alineacion: 'derecha' }],
                filas: [['—'], ['']],
                siVacia: '',
              },
            },
          ],
        }),
      ),
    );

    const hoja = libro.getWorksheet('Datos');
    expect(hoja?.getRow(2).getCell(1).value).toBe('—');
    // ExcelJS devuelve null en una celda vacía; lo que importa es que no sea 0.
    expect(hoja?.getRow(3).getCell(1).value ?? '').not.toBe(0);
  });

  it('la primera hoja dice de dónde salió el archivo', async () => {
    const libro = await abrir(await new RenderizadorExcelJs().render(documento()));
    const info = libro.getWorksheet('Información');
    // ExcelJS tipa los valores como `any`; se filtra a cadenas en vez de
    // convertir a ciegas, o una celda con fórmula saldría como «[object Object]».
    const textos = (info?.getSheetValues() ?? []).flatMap((fila) =>
      Array.isArray(fila) ? fila.filter((c): c is string => typeof c === 'string') : [],
    );

    expect(textos.join(' ')).toContain('Sistema de Gestión de la Calidad');
  });

  it('recorta los nombres de hoja que Excel no admite', async () => {
    // Excel rechaza más de 31 caracteres y los caracteres []:*?/\ — un título de
    // sección largo haría fallar el libro entero al guardarlo.
    const largo = 'Competencias del perfil de egreso [ICACIT] / 2018';
    const libro = await abrir(
      await new RenderizadorExcelJs().render(
        documento({
          secciones: [
            {
              titulo: largo,
              tabla: { columnas: [{ titulo: 'A', peso: 1 }], filas: [['x']], siVacia: '' },
            },
          ],
        }),
      ),
    );

    const nombre = libro.worksheets[1]?.name ?? '';
    expect(nombre.length).toBeLessThanOrEqual(31);
    expect(nombre).not.toMatch(/[[\]:*?/\\]/);
  });

  it('dos secciones con el mismo título no rompen el libro', async () => {
    const tabla = { columnas: [{ titulo: 'A', peso: 1 }], filas: [['x']], siVacia: '' };
    const libro = await abrir(
      await new RenderizadorExcelJs().render(
        documento({
          secciones: [
            { titulo: 'Resumen', tabla },
            { titulo: 'Resumen', tabla },
          ],
        }),
      ),
    );

    expect(libro.worksheets.map((h) => h.name)).toEqual(['Información', 'Resumen', 'Resumen (2)']);
  });
});
