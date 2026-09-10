/**
 * Qué dice el documento de un plan de evaluación.
 *
 * Es dominio puro y se prueba sin abrir un PDF: lo que decide este archivo es
 * el CONTENIDO —qué se cuenta, cómo se agrupa, qué se declara cuando falta
 * algo— y eso es material de acreditación. El dibujo lo hacen los
 * renderizadores de `platform/`, que no saben de qué hablan.
 */

import { describe, expect, it } from 'vitest';

import {
  armarDocumentoEvaluacion,
  type DatosParaDocumentoEvaluacion,
} from './armar-documento-evaluacion.js';

const BASE: DatosParaDocumentoEvaluacion = {
  codigo: 'EV-PE-ISI-2026-v1-D-v1',
  version: 1,
  estado: 'Vigente',
  tipo: 'DIRECTA',
  carreraNombre: 'Ingeniería de Sistemas',
  planBaseCodigo: 'PM-ISI-2026-D-v1',
  competencias: [
    {
      id: 'c-1',
      codigo: 'CPE-01',
      nombre: 'Resolver problemas',
      instrumento: 'Rúbrica',
      frecuencia: 'Semestral',
      responsableNombre: null,
    },
  ],
  periodos: [{ id: 'p-1', etiqueta: '2026-I' }],
  mediciones: [
    {
      competenciaId: 'c-1',
      periodoId: 'p-1',
      porcentajeAlcanzado: 80,
      asignaturas: [
        {
          codigo: 'ISI-101',
          nombre: 'Algoritmos',
          entregable: 'Proyecto',
          docenteNombre: 'Ana Docente',
          evidencias: 2,
        },
      ],
    },
  ],
  indicaciones: [],
  generadoEn: new Date('2026-09-10T12:00:00Z'),
};

it('la cabecera lleva el código, el tipo y el estado', () => {
  // RF-PE-033 RN1, literal.
  const d = armarDocumentoEvaluacion(BASE, 'pdf');
  const etiquetas = d.metadatos.map((m) => m.etiqueta);
  expect(etiquetas).toEqual(expect.arrayContaining(['Código', 'Tipo', 'Estado']));
  expect(d.metadatos.find((m) => m.etiqueta === 'Estado')?.valor).toBe('Vigente');
  expect(d.metadatos.find((m) => m.etiqueta === 'Tipo')?.valor).toBe('Directa');
});

it('un plan directo lleva sus asignaturas y ninguna sección de indicaciones', () => {
  const d = armarDocumentoEvaluacion(BASE, 'pdf');
  const titulos = d.secciones.map((s) => s.titulo);
  expect(titulos).toContain('Asignaturas evaluadas');
  expect(titulos).not.toContain('Indicaciones de medición');
});

it('un plan indirecto lleva sus indicaciones y ninguna sección de asignaturas', () => {
  const d = armarDocumentoEvaluacion(
    {
      ...BASE,
      tipo: 'INDIRECTA',
      mediciones: [{ ...BASE.mediciones[0]!, asignaturas: [] }],
      indicaciones: [
        {
          periodoId: 'p-1',
          grupoObjetivo: 'EGRESADOS',
          instruccion: 'Encuesta anual',
          enlaceInstrumento: 'https://e.test/f',
          enlaceResultados: null,
        },
      ],
    },
    'pdf',
  );
  const titulos = d.secciones.map((s) => s.titulo);
  expect(titulos).toContain('Indicaciones de medición');
  expect(titulos).not.toContain('Asignaturas evaluadas');
});

it('un periodo sin porcentaje se exporta igual, diciendo que falta', () => {
  // RF-PE-031 RN1 y RF-PE-032 RN1: se exporta lo que hay, incompleto incluido.
  const d = armarDocumentoEvaluacion(
    { ...BASE, mediciones: [{ ...BASE.mediciones[0]!, porcentajeAlcanzado: null }] },
    'excel',
  );
  const matriz = d.secciones.find((s) => s.titulo === 'Medición alcanzada')!;
  expect(matriz.tabla!.filas.flat()).toContain('Sin registrar');
});

it('un plan sin competencias produce documento, no una tabla muda', () => {
  const d = armarDocumentoEvaluacion({ ...BASE, competencias: [], mediciones: [] }, 'pdf');
  const comp = d.secciones.find((s) => s.titulo === 'Competencias')!;
  expect(comp.tabla!.filas).toEqual([]);
  expect(comp.tabla!.siVacia).toMatch(/competencia/i);
});

it('el pie declara de dónde salió y cuándo', () => {
  // Un PDF que acaba en un expediente de acreditación tiene que poder decirlo.
  const d = armarDocumentoEvaluacion(BASE, 'pdf');
  expect(d.pie).toMatch(/SGC/);
  expect(d.pie).toMatch(/2026/);
});

it('el nombre del archivo lleva el código, sin extensión', () => {
  expect(armarDocumentoEvaluacion(BASE, 'pdf').nombreArchivo).toBe(
    'plan-evaluacion-EV-PE-ISI-2026-v1-D-v1',
  );
});

describe('lo que los dos tipos comparten', () => {
  it('el resumen, las competencias y los periodos se arman igual para los dos tipos', () => {
    for (const tipo of ['DIRECTA', 'INDIRECTA'] as const) {
      const d = armarDocumentoEvaluacion({ ...BASE, tipo }, 'pdf');
      const titulos = d.secciones.map((s) => s.titulo);
      expect(titulos).toEqual(
        expect.arrayContaining(['Resumen', 'Competencias', 'Periodos académicos', 'Medición alcanzada']),
      );
    }
  });

  it('un plan vacío se exporta igual y lo declara', () => {
    const d = armarDocumentoEvaluacion(
      { ...BASE, competencias: [], periodos: [], mediciones: [], indicaciones: [] },
      'excel',
    );
    const medicion = d.secciones.find((s) => s.titulo === 'Medición alcanzada')!;

    expect(medicion.tabla!.filas).toHaveLength(0);
    expect(medicion.tabla!.siVacia).toMatch(/competencia/i);
  });
});
