/**
 * Qué dice el documento de un plan de mejora — dominio puro, sin abrir un
 * PDF. RF-PJ-033 RN1 exige igualar el formato institucional; el repositorio
 * no trae esa plantilla (design §9), así que esta tabla es la mejor
 * aproximación disponible y se ajusta si la universidad la aporta.
 */

import { describe, expect, it } from 'vitest';

import { armarDocumentoMejora, type DatosParaDocumentoMejora } from './armar-documento-mejora.js';

function datos(sobre: Partial<DatosParaDocumentoMejora> = {}): DatosParaDocumentoMejora {
  return {
    codigo: 'PJ-CRI-3',
    aspecto: 'CRITERIO_ACREDITACION',
    elementoNombre: 'Criterio 4.2 — Infraestructura',
    estado: 'Vigente',
    estadoImplementacion: 'En proceso',
    nombre: 'Renovar equipos de laboratorio',
    causaRaiz: 'Equipos con más de 8 años de antigüedad',
    justificacion: 'El indicador de satisfacción bajó del umbral',
    input: 'Reporte de mantenimiento adjunto',
    plazo: new Date('2026-12-31'),
    recursos: 'Presupuesto de laboratorios 2027',
    metas: 'Renovar el 80% del equipo crítico',
    responsable: 'Director de Escuela',
    evidencias: [
      {
        referencia: 'https://drive/ev1',
        subidoPor: 'Ana Quispe',
        subidoEn: new Date('2026-08-01'),
      },
    ],
    logroMeta: null,
    impacto: null,
    generadoEn: new Date('2026-09-13'),
    ...sobre,
  };
}

describe('la cabecera', () => {
  it('identifica el plan, su aspecto y su elemento', () => {
    const texto = JSON.stringify(armarDocumentoMejora(datos(), 'pdf'));

    expect(texto).toContain('PJ-CRI-3');
    expect(texto).toContain('Criterio 4.2');
    expect(texto).toContain('Vigente');
  });

  it('muestra la etiqueta legible del aspecto, distinta del nombre del elemento asociado', () => {
    const documento = armarDocumentoMejora(datos(), 'pdf');

    expect(documento.metadatos).toContainEqual({
      etiqueta: 'Aspecto',
      valor: 'Criterio de acreditación',
    });
    expect(documento.metadatos).toContainEqual({
      etiqueta: 'Elemento asociado',
      valor: 'Criterio 4.2 — Infraestructura',
    });
  });
});

describe('la definición', () => {
  it('lleva los siete campos', () => {
    const texto = JSON.stringify(armarDocumentoMejora(datos(), 'pdf'));

    expect(texto).toContain('Renovar equipos de laboratorio');
    expect(texto).toContain('Equipos con más de 8 años');
    expect(texto).toContain('Presupuesto de laboratorios 2027');
    expect(texto).toContain('Director de Escuela');
  });

  it('un plan de Competencia no muestra "Input" — RF-PJ-028', () => {
    const texto = JSON.stringify(
      armarDocumentoMejora(datos({ aspecto: 'COMPETENCIA', input: null }), 'pdf'),
    );

    expect(texto).not.toMatch(/"Input"/);
  });
});

describe('el seguimiento (RF-PJ-033 RN2: incluye evidencias y retroalimentación)', () => {
  it('lista las evidencias con quién y cuándo', () => {
    const texto = JSON.stringify(armarDocumentoMejora(datos(), 'excel'));

    expect(texto).toContain('https://drive/ev1');
    expect(texto).toContain('Ana Quispe');
  });

  it('un plan sin evidencias lo declara, no sale vacío sin explicación', () => {
    const d = armarDocumentoMejora(datos({ evidencias: [] }), 'pdf');
    expect(JSON.stringify(d)).toMatch(/sin evidencias/i);
  });

  it('logro de meta e impacto, si están completos', () => {
    const texto = JSON.stringify(
      armarDocumentoMejora(
        datos({ logroMeta: '70% cumplido', impacto: 'Mejora observable' }),
        'pdf',
      ),
    );

    expect(texto).toContain('70% cumplido');
    expect(texto).toContain('Mejora observable');
  });
});

describe('formato', () => {
  it('pdf y excel comparten el mismo contenido', () => {
    for (const formato of ['pdf', 'excel'] as const) {
      const texto = JSON.stringify(armarDocumentoMejora(datos(), formato));
      expect(texto).toContain('PJ-CRI-3');
    }
  });
});
