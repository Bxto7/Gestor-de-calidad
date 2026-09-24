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
