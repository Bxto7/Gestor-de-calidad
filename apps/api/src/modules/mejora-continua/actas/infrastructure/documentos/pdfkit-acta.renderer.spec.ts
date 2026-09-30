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

  describe('paginación con celdas largas', () => {
    const largo =
      'Se contratará personal de apoyo para la revisión sistemática de sílabos, la capacitación docente en metodologías activas, la adquisición de licencias de software especializado y la organización de talleres de retroalimentación con egresados y empleadores del sector tecnológico de la región Junín. ';
    const accion = (prefijo: string, i: number) => ({
      codigo: `${prefijo}-${String(i).padStart(2, '0')}`,
      nombre: `Acción número ${i}: fortalecimiento de la enseñanza y evaluación por competencias`,
      plazo: new Date('2026-12-15'),
      recursos: largo.repeat(1 + (i % 3)),
      metas: `Alcanzar al menos el 85 % de cumplimiento en el año. ${largo}`,
      responsable: 'Dra. Ñusta Quispe Huamán — Coordinadora de Calidad',
    });
    const densa = (relleno: number): ActaParaDocumento =>
      acta({
        asistentes: ['Ana Pérez', 'José Ñahui', 'Lucía Ávila', 'Óscar Núñez', 'Carmen Poma', 'Miguel Sáenz', 'Rocío Béjar'],
        acuerdo: largo.repeat(relleno).trim(),
        criterios: [1, 2, 3, 4].map((i) => accion('CRIT', i)),
        objetivos: [1, 2, 3, 4].map((i) => accion('OBJ', i)),
        competencias: [1, 2, 3, 4, 5].map((i) => ({
          ...accion('COMP', i),
          resultado: 60 + i * 5,
          meta: 70,
          logrado: i % 2 === 0,
        })),
        resumen: { criterios: 4, objetivos: 4, competencias: 5, total: 13 },
      });

    /** Texto de cada página, en orden, sin el pie ni la cabecera repetidos. */
    function textoPorPagina(pdf: Buffer): string[] {
      const s = pdf.toString('latin1');
      const objetos = new Map<string, string>();
      for (const m of s.matchAll(/(?:^|\n)(\d+) 0 obj([\s\S]*?)endobj/g)) objetos.set(m[1]!, m[2]!);
      const paginas: string[] = [];
      for (const cuerpo of objetos.values()) {
        if (!/\/Type\s*\/Page\b(?!s)/.test(cuerpo)) continue;
        const ref = (/\/Contents\s+(\d+) 0 R/.exec(cuerpo))?.[1];
        const flujo = ref ? objetos.get(ref)?.match(/stream\n([\s\S]*?)\nendstream/) : null; // PDFKit separa con \n; tolerar \r? recortaría un 0x0D final del flujo comprimido.
        let texto = '';
        if (flujo) {
          const datos = inflateSync(Buffer.from(flujo[1]!, 'latin1')).toString('latin1');
          texto = [...datos.matchAll(/<([0-9A-Fa-f]+)>/g)]
            .map((x) => Buffer.from(x[1]!, 'hex').toString('latin1'))
            .join('');
        }
        paginas.push(texto);
      }
      return paginas;
    }

    /**
     * Cuerpo de la página: lo que hay entre la caja de control de la cabecera
     * (que termina en su etiqueta «Página») y el pie («N de M» + «Documento
     * generado…»). PDFKit escribe en ese orden.
     */
    function cuerpoDe(pagina: string): string {
      const desde = pagina.indexOf('Página') + 'Página'.length;
      const hasta = pagina.search(/\d+ de \d+Documento generado/);
      return pagina.slice(desde, hasta);
    }

    // Se varía el relleno previo para que los saltos de página caigan en
    // puntos distintos; cada variante debe cumplir las mismas reglas.
    const variantes = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    it('ninguna página posterior a la portada queda casi vacía (fila partida con resto mínimo)', async () => {
      for (const relleno of variantes) {
        const paginas = textoPorPagina(await new RenderizadorPdfActaKit().render(densa(relleno)));
        paginas.slice(1).forEach((p, i) => {
          expect(cuerpoDe(p).length, `relleno ${relleno}, página ${i + 2}`).toBeGreaterThan(150);
        });
      }
    });

    it('cada fila de acción queda entera en una sola página', async () => {
      for (const relleno of variantes) {
        const paginas = textoPorPagina(await new RenderizadorPdfActaKit().render(densa(relleno)));
        // Cada responsable empieza con "Dra." y termina en "Calidad": si la
        // fila se parte entre páginas, una página tiene más de un extremo.
        let inicios = 0;
        paginas.forEach((p, i) => {
          const c = cuerpoDe(p);
          const a = c.split('Dra.').length - 1;
          const f = c.split('Calidad').length - 1;
          expect(f, `relleno ${relleno}, página ${i + 1}`).toBe(a);
          inicios += a;
        });
        expect(inicios, `relleno ${relleno}`).toBe(13);
      }
    });

    it('un título de subtabla nunca queda solo al final de una página, sin su primera fila', async () => {
      for (const relleno of variantes) {
        const paginas = textoPorPagina(await new RenderizadorPdfActaKit().render(densa(relleno)));
        for (const [titulo, primera] of [
          ['4.1 Criterios', 'CRIT-01'],
          ['4.2 Objetivos', 'OBJ-01'],
          ['4.3 Competencias', 'COMP-01'],
        ] as const) {
          const pagina = paginas.find((p) => p.includes(titulo));
          expect(pagina, `${titulo} (relleno ${relleno})`).toBeDefined();
          expect(pagina, `${titulo} sin ${primera} (relleno ${relleno})`).toContain(primera);
        }
      }
    });

    it('la cabecera muestra el número de página real, "N de M"', async () => {
      const paginas = textoPorPagina(await new RenderizadorPdfActaKit().render(densa(3)));
      expect(paginas.length).toBeGreaterThan(2);
      paginas.forEach((p, i) => {
        // Una vez en la cabecera y otra en el pie ("Página N de M").
        const veces = p.split(`${i + 1} de ${paginas.length}`).length - 1;
        expect(veces, `página ${i + 1}`).toBe(2);
      });
    });
  });
});
