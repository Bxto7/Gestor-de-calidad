/**
 * Qué dice el documento de un plan de medición.
 *
 * Es dominio puro y se prueba sin abrir un PDF: lo que decide este archivo es
 * el CONTENIDO —qué se cuenta, cómo se agrupa, qué se declara cuando falta
 * algo— y eso es material de acreditación. El dibujo lo hacen los
 * renderizadores de `platform/`, que no saben de qué hablan.
 */

import { describe, expect, it } from 'vitest';

import type { Documento, Tabla } from '../../../../platform/documentos/documento.js';

import {
  armarDocumentoMedicion,
  type DatosParaDocumentoMedicion,
} from './armar-documento-medicion.js';

function datos(sobre: Partial<DatosParaDocumentoMedicion> = {}): DatosParaDocumentoMedicion {
  return {
    codigo: 'PM-PE-ISI-2026-v2-D-v1',
    tipo: 'DIRECTA',
    metaPorcentaje: 70,
    estado: 'Vigente',
    planEstudiosCodigo: 'PE-ISI-2026-v2',
    carreraNombre: 'Ingeniería de Sistemas e Informática',
    aprobadoPor: 'Ana Quispe',
    aprobadoEn: new Date('2026-08-01'),
    generadoEn: new Date('2026-09-04'),
    grupos: [
      {
        atributo: 'AG-I08 — Análisis de Problema',
        competencias: [
          { codigo: 'CPE-01', nombre: 'Resolver problemas' },
          { codigo: 'CPE-02', nombre: 'Modelar sistemas' },
        ],
      },
    ],
    periodos: [
      { etiqueta: '2026-I', fechaCierre: new Date('2026-07-15') },
      { etiqueta: '2026-II', fechaCierre: null },
    ],
    celdas: [
      { competenciaCodigo: 'CPE-01', periodoEtiqueta: '2026-I', realizada: true },
      { competenciaCodigo: 'CPE-02', periodoEtiqueta: '2026-II', realizada: false },
    ],
    ...sobre,
  };
}

/**
 * La matriz, buscada por su título.
 *
 * Buscarla por «la tabla con más columnas» no sirve: la de periodos también
 * tiene tres, sale antes en el documento, y con dos periodos la matriz tiene
 * exactamente ese mismo ancho. Una prueba que la encuentre así pasa aunque la
 * matriz no se haya generado —comprobado borrándola—, que es lo mismo que no
 * probar nada.
 */
function matriz(d: Documento): Tabla {
  const seccion = d.secciones.find((s) => s.titulo === 'Matriz de medición');
  expect(seccion?.tabla, 'el documento no trae matriz de medición').toBeDefined();
  return seccion!.tabla!;
}

describe('la cabecera', () => {
  it('identifica el plan, su base y su meta', () => {
    const d = armarDocumentoMedicion(datos(), 'pdf');
    const texto = JSON.stringify(d);

    expect(texto).toContain('PM-PE-ISI-2026-v2-D-v1');
    expect(texto).toContain('PE-ISI-2026-v2');
    expect(texto).toContain('70');
  });

  it('dice quién aprobó y cuándo, si está aprobado (RF-PM-039)', () => {
    const d = armarDocumentoMedicion(datos(), 'pdf');

    expect(d.metadatos).toContainEqual({
      etiqueta: 'Aprobado por',
      valor: 'Ana Quispe · 01/08/2026',
    });
  });

  it('un plan sin aprobar no inventa un aprobador', () => {
    const d = armarDocumentoMedicion(datos({ aprobadoPor: null, aprobadoEn: null }), 'pdf');

    // La fila entera desaparece: ni el nombre, ni un «—» que insinúe que hubo
    // una aprobación sin registrar, ni un `null` colado en el documento.
    expect(d.metadatos.map((m) => m.etiqueta)).not.toContain('Aprobado por');
    expect(JSON.stringify(d)).not.toContain('null');
  });
});

describe('RF-PM-029 — la matriz en PDF va por competencia', () => {
  it('una fila por competencia, listando sus periodos en una sola columna', () => {
    // Quince columnas no caben en una página vertical, y el renderizador de PDF
    // ya avisa de ese límite en su propio código. Por eso se transpone a texto.
    const t = matriz(armarDocumentoMedicion(datos(), 'pdf'));

    expect(t.columnas).toHaveLength(2);
    expect(t.filas).toHaveLength(2);
    expect(t.filas[0]?.[1]).toBe('2026-I (realizada)');
    expect(t.filas[1]?.[1]).toBe('2026-II');
  });

  it('una competencia sin programar lo dice, en vez de salir vacía', () => {
    const t = matriz(armarDocumentoMedicion(datos({ celdas: [] }), 'pdf'));

    expect(t.filas.map((f) => f[1])).toEqual(['Sin programar', 'Sin programar']);
  });
});

describe('RF-PM-028 — la matriz en Excel va como cuadrícula', () => {
  it('una columna por periodo', () => {
    const t = matriz(armarDocumentoMedicion(datos(), 'excel'));

    // Una columna de competencia más una por cada uno de los dos periodos.
    expect(t.columnas.map((c) => c.titulo)).toEqual(['Competencia', '2026-I', '2026-II']);
  });

  it('distingue programada de ya medida, y ambas de la celda vacía', () => {
    // La celda medida y la solo programada no pueden verse igual: una es
    // evidencia de que la medición ocurrió y la otra una intención. Y ninguna
    // de las dos puede confundirse con un cruce que nadie programó.
    const t = matriz(armarDocumentoMedicion(datos(), 'excel'));

    expect(t.filas[0]?.slice(1)).toEqual(['Realizada', '']);
    expect(t.filas[1]?.slice(1)).toEqual(['', 'Programada']);
  });
});

describe('lo que los dos formatos comparten', () => {
  it('las competencias van agrupadas por atributo del graduado', () => {
    for (const formato of ['pdf', 'excel'] as const) {
      expect(JSON.stringify(armarDocumentoMedicion(datos(), formato))).toContain('AG-I08');
    }
  });

  it('los periodos llevan su fecha de cierre, y su ausencia se dice', () => {
    for (const formato of ['pdf', 'excel'] as const) {
      const d = armarDocumentoMedicion(datos(), formato);
      const periodos = d.secciones.find((s) => s.titulo === 'Periodos académicos')?.tabla;

      expect(periodos?.filas).toEqual([
        ['1', '2026-I', '15/07/2026'],
        ['2', '2026-II', 'Sin fecha de cierre'],
      ]);
    }
  });

  it('un plan vacío se exporta igual y lo declara', () => {
    // Un documento que dice «este plan no tiene competencias» es información;
    // uno que falla al generarse, no.
    const d = armarDocumentoMedicion(datos({ grupos: [], periodos: [], celdas: [] }), 'pdf');

    expect(matriz(d).filas).toHaveLength(0);
    expect(matriz(d).siVacia).toMatch(/no tiene competencias|sin competencias/i);
  });
});
