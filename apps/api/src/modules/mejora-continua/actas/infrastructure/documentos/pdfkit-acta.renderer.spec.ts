// apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts

import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import { RenderizadorPdfActaKit } from './pdfkit-acta.renderer.js';

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
    asistentes: ['Ana Pérez'],
    acuerdo: 'Se deja constancia de la revisión.',
    criterios: [],
    objetivos: [],
    competencias: [],
    resumen: { criterios: 0, objetivos: 0, competencias: 0, total: 0 },
    constanciaYResolucion: 'Se resuelve aprobar las acciones.',
    ciudadYFecha: { lugar: 'Huancayo', fecha: new Date('2026-03-20') },
    codigoVerificacion: 'abc123def456',
    generadoEn: new Date('2026-09-20T15:00:00Z'),
    ...sobre,
  };
}

/** Mismo extractor que `renderizadores.spec.ts` (platform/documentos) — ver su comentario para el porqué de cada paso. */
function textoDelPdf(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const piezas: string[] = [];
  for (const bloque of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const datos = Buffer.from(bloque[1] ?? '', 'latin1');
    let contenido: string;
    try {
      contenido = inflateSync(datos).toString('latin1');
    } catch {
      continue;
    }
    for (const cadena of contenido.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      piezas.push(Buffer.from(cadena[1] ?? '', 'hex').toString('latin1'));
    }
  }
  return piezas.join('');
}

describe('RenderizadorPdfActaKit', () => {
  it('produce un PDF válido en A4 horizontal', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // A4 horizontal en puntos: 841.89 x 595.28. PDFKit lo declara en el
    // MediaBox de cada página.
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+841\.89\s+595\.28\s*\]/);
  });

  it('la cabecera institucional aparece en la primera página', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta());
    const texto = textoDelPdf(pdf);
    expect(texto).toContain('UNIVERSIDAD CONTINENTAL');
    expect(texto).toContain('SISTEMA DE GESTIÓN DE LA CALIDAD');
    expect(texto).toContain('ACTA N° 002');
  });

  it('el pie lleva el código de verificación y la paginación', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta());
    const texto = textoDelPdf(pdf);
    expect(texto).toContain('abc123def456');
    expect(texto).toContain('Página 1 de');
  });

  it('produce exactamente 2 páginas para el acta por defecto — el pie no debe generar páginas fantasma', async () => {
    // Regresión: `dibujarPieEnTodasLasPaginas` escribía el pie dentro de la
    // franja del margen inferior sin levantar `doc.page.margins.bottom`
    // primero. PDFKit interpreta cualquier escritura por debajo del margen
    // como "hay que añadir una página", así que con eso roto el `render()`
    // terminaba con páginas de más, con el pie partido en páginas huérfanas
    // sin cabecera con sentido. Los otros tests de este archivo comprueban
    // texto sobre el PDF completo sin distinguir de qué página sale, así que
    // no detectan esta clase de regresión: solo un conteo real de páginas
    // la atrapa.
    //
    // La cifra exacta cambió con Task 9: cuando este test se escribió
    // (Task 8) el cuerpo era un comentario vacío, así que 1 página era lo
    // correcto. Con las siete secciones reales, este acta por defecto (sin
    // criterios/objetivos/competencias, un asistente) ya no cabe en una sola
    // página A4 horizontal bajo la cabecera de 3 zonas — se verificó con
    // `pdftotext` que la página 1 llega hasta "4.3 Competencias..." y la
    // página 2 contiene "V. RESUMEN..." y "VI. CONSTANCIA...": son dos
    // páginas con contenido real, no una fantasma. Si esta cifra volviera a
    // subir (p. ej. a 3 o más) sin que el contenido de la fixture haya
    // crecido, es la misma familia de bug que el comentario de arriba
    // describe — reaparecido en el cuerpo en vez de en el pie.
    const pdf = await new RenderizadorPdfActaKit().render(acta());
    const crudo = pdf.toString('latin1');
    const paginas = crudo.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(paginas).toHaveLength(2);
  });

  it('escribe las siete secciones con numeración romana', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({
        criterios: [
          {
            codigo: 'CA-01',
            nombre: 'Reforzar bibliografía',
            plazo: new Date('2026-12-01'),
            recursos: 'Presupuesto adicional',
            metas: 'Elevar el indicador',
            responsable: 'Coordinación académica',
          },
        ],
        competencias: [
          {
            codigo: 'COMP-01',
            nombre: 'Diseñar soluciones',
            plazo: new Date('2026-12-01'),
            recursos: 'Taller adicional',
            metas: 'Elevar el logro',
            responsable: 'Docente responsable',
            resultado: 75,
            meta: 70,
            logrado: true,
          },
        ],
      }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('I.');
    expect(texto).toContain('DATOS DE LA REUNIÓN');
    expect(texto).toContain('II.');
    expect(texto).toContain('ASISTENTES');
    expect(texto).toContain('III.');
    expect(texto).toContain('ACUERDO');
    expect(texto).toContain('IV.');
    expect(texto).toContain('PLAN DE MEJORA APROBADO');
    expect(texto).toContain('V.');
    expect(texto).toContain('RESUMEN');
    expect(texto).toContain('VI.');
    expect(texto).toContain('CONSTANCIA Y RESOLUCIÓN');
  });

  it('las acciones y sus datos aparecen en la tabla de Criterios', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({
        criterios: [
          {
            codigo: 'CA-01',
            nombre: 'Reforzar bibliografía',
            plazo: new Date('2026-12-01'),
            recursos: 'Presupuesto adicional',
            metas: 'Elevar el indicador',
            responsable: 'Coordinación académica',
          },
        ],
      }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('CA-01');
    expect(texto).toContain('Reforzar bibliografía');
    expect(texto).toContain('Coordinación académica');
  });

  it('una sección sin acciones muestra la fila "Sin acciones registradas"', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta({ criterios: [], objetivos: [], competencias: [] }));
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('Sin acciones registradas para este periodo');
  });

  it('LOGRADO y NO LOGRADO aparecen en la tabla de Competencias, según corresponda', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({
        competencias: [
          {
            codigo: 'COMP-01', nombre: 'Lograda', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 80, meta: 70, logrado: true,
          },
          {
            codigo: 'COMP-02', nombre: 'No lograda', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 50, meta: 70, logrado: false,
          },
        ],
      }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('LOGRADO');
    expect(texto).toContain('NO LOGRADO');
  });

  it('sin lugar/fecha de emisión, la sección VI no lleva ciudad y fecha', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta({ ciudadYFecha: null }));
    const texto = textoDelPdf(pdf);

    expect(texto).not.toContain('Huancayo');
  });

  it('la lista de asistentes aparece completa', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({ asistentes: ['Ana Pérez', 'Luis Gómez'] }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('Ana Pérez');
    expect(texto).toContain('Luis Gómez');
  });
});
