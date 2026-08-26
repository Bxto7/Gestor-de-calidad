import { describe, expect, it } from 'vitest';

import {
  armarEvidenciaDeAprobacion,
  armarHistoricoDeCambios,
  armarMallaParaHojaDeCalculo,
  armarResumenDelPlan,
  type AsignaturaParaDocumento,
  type DatosParaDocumento,
} from './armar-documentos.js';
import type { Seccion } from './documento.js';

const GENERADO = new Date('2026-08-25T15:30:00Z');

function asignatura(sobre: Partial<AsignaturaParaDocumento> = {}): AsignaturaParaDocumento {
  return {
    id: 'a-1',
    codigo: 'ASUC01113',
    nombre: 'Cálculo I',
    creditos: 4,
    horasTeoricas: 2,
    competenciaIds: [],
    cicloNumero: 1,
    activa: true,
    condicion: 'Obligatoria',
    tipo: 'Especialidad',
    grupoElectivo: null,
    grupoNombre: null,
    prerrequisitos: [],
    correquisitos: [],
    ...sobre,
  };
}

function datos(sobre: Partial<DatosParaDocumento> = {}): DatosParaDocumento {
  return {
    plan: {
      codigo: 'PE-ISI-2018-v1',
      version: 1,
      estado: 'Histórico',
      duracionAnios: 2,
      fechaVigencia: new Date('2018-03-01T00:00:00Z'),
    },
    carrera: { nombre: 'Ingeniería de Sistemas e Informática', codigo: 'ISI' },
    facultad: 'Ingeniería',
    asignaturas: [asignatura()],
    objetivos: [{ codigo: 'OE-01', nombre: 'Ejercer la profesión', descripcion: 'Descripción.' }],
    competencias: [{ codigo: 'CPE-ISI01', nombre: 'Aprendizaje autónomo', atributos: ['AG-I06'] }],
    aprobaciones: [],
    generadoEn: GENERADO,
    ...sobre,
  };
}

/** Todo el texto del documento junto: para afirmar «esto aparece», sin más. */
function texto(secciones: readonly Seccion[]): string {
  return secciones
    .flatMap((s) => [
      s.titulo,
      ...(s.parrafos ?? []),
      ...(s.tabla?.filas.flat() ?? []),
      s.tabla?.siVacia ?? '',
    ])
    .join('\n');
}

describe('RF072 — resumen del plan en PDF', () => {
  it('un plan sin asignaturas se genera igual, declarando la ausencia', async () => {
    // El requisito lo pide con estas palabras: «Si el plan no tiene asignaturas
    // registradas, el sistema genera el PDF indicando la ausencia de contenido».
    // Negarse a generarlo dejaría sin evidencia a un plan en construcción.
    const doc = armarResumenDelPlan(datos({ asignaturas: [] }));

    expect(doc.secciones.length).toBeGreaterThan(0);
    expect(texto(doc.secciones)).toContain('Sin asignaturas ubicadas en este ciclo.');
  });

  it('los ciclos vacíos siguen apareciendo', async () => {
    // Un ciclo que desaparece del documento no se distingue de un ciclo que la
    // carrera no tiene. Quien revisa el expediente necesita ver el hueco.
    const doc = armarResumenDelPlan(datos({ asignaturas: [asignatura({ cicloNumero: 1 })] }));
    const titulos = doc.secciones.map((s) => s.titulo);

    expect(titulos).toContain('Ciclo 1 — 4 créditos');
    expect(titulos).toContain('Ciclo 4 — 0 créditos');
  });

  it('el total de créditos no suma todas las opciones de un grupo de electivos', async () => {
    // Es el error que hacía declarar 249 créditos donde hay 210.
    const grupo = { codigo: 'GE-9', cantidadAElegir: 1 };
    const doc = armarResumenDelPlan(
      datos({
        asignaturas: [
          asignatura({ id: 'o1', codigo: 'OBL', creditos: 4, grupoElectivo: null }),
          asignatura({ id: 'e1', codigo: 'EL1', creditos: 3, grupoElectivo: grupo }),
          asignatura({ id: 'e2', codigo: 'EL2', creditos: 3, grupoElectivo: grupo }),
          asignatura({ id: 'e3', codigo: 'EL3', creditos: 3, grupoElectivo: grupo }),
        ],
      }),
    );

    // 4 obligatorios + 3 del único electivo que se elige = 7, no 13.
    expect(texto(doc.secciones)).toContain('un total de 7 créditos');
  });

  it('una opción electiva dice que se elige, no que se lleva', async () => {
    const doc = armarResumenDelPlan(
      datos({
        asignaturas: [
          asignatura({
            grupoElectivo: { codigo: 'GE-9', cantidadAElegir: 1 },
            grupoNombre: 'Electivo de noveno ciclo',
          }),
        ],
      }),
    );

    expect(texto(doc.secciones)).toContain('Electivo · Electivo de noveno ciclo (elegir 1)');
  });

  it('las competencias sin mapear se declaran dentro del documento', async () => {
    // Si el PDF acaba en un expediente, la brecha tiene que viajar con él y no
    // quedarse en un panel de la aplicación que el evaluador no ve.
    const doc = armarResumenDelPlan(
      datos({
        competencias: [
          { codigo: 'CPE-01', nombre: 'Con mapeo', atributos: ['AG-I06'] },
          { codigo: 'CPE-02', nombre: 'Sin mapeo', atributos: [] },
        ],
      }),
    );

    const contenido = texto(doc.secciones);
    expect(contenido).toContain('1 de 2 competencias no están mapeadas');
    expect(contenido).toContain('Sin mapear');
  });

  it('no anuncia una brecha cuando no la hay', async () => {
    const doc = armarResumenDelPlan(datos());
    const competencias = doc.secciones.find((s) => s.titulo.startsWith('Competencias'));
    expect(competencias?.parrafos).toBeUndefined();
  });

  it('el apartado de asignaturas sin ubicar solo aparece si hay alguna', async () => {
    const conTodas = armarResumenDelPlan(datos());
    expect(conTodas.secciones.map((s) => s.titulo)).not.toContain(
      'Asignaturas sin ubicar en la malla',
    );

    const conSueltas = armarResumenDelPlan(
      datos({ asignaturas: [asignatura({ cicloNumero: null })] }),
    );
    expect(conSueltas.secciones.map((s) => s.titulo)).toContain(
      'Asignaturas sin ubicar en la malla',
    );
  });

  it('las asignaturas inactivas no cuentan', async () => {
    const doc = armarResumenDelPlan(
      datos({
        asignaturas: [asignatura({ creditos: 4 }), asignatura({ id: 'a-2', creditos: 9, activa: false })],
      }),
    );
    expect(texto(doc.secciones)).toContain('un total de 4 créditos');
  });

  it('el pie declara de dónde sale el documento y cuándo', async () => {
    // Sin esto no vale como evidencia: un PDF suelto no dice quién lo produjo.
    const doc = armarResumenDelPlan(datos());
    expect(doc.pie).toContain('Sistema de Gestión de la Calidad');
    expect(doc.pie).toContain('25/08/2026');
    expect(doc.pie).toContain('PE-ISI-2018-v1 v1 (Histórico)');
  });
});

describe('RF073 — malla en hoja de cálculo', () => {
  it('el ciclo es una columna y no una sección', async () => {
    // Una hoja de cálculo se usa para filtrar y ordenar; diez tablas separadas
    // con títulos entre medias no se pueden filtrar.
    const doc = armarMallaParaHojaDeCalculo(datos());
    const malla = doc.secciones.find((s) => s.titulo === 'Malla curricular');

    expect(malla?.tabla?.columnas[0]?.titulo).toBe('Ciclo');
  });

  it('las asignaturas sin ubicar van al final, no antes del ciclo 1', async () => {
    const doc = armarMallaParaHojaDeCalculo(
      datos({
        asignaturas: [
          asignatura({ id: 's', codigo: 'SIN', cicloNumero: null }),
          asignatura({ id: 'c1', codigo: 'UNO', cicloNumero: 1 }),
        ],
      }),
    );

    const filas = doc.secciones.find((s) => s.titulo === 'Malla curricular')?.tabla?.filas ?? [];
    expect(filas.map((f) => f[1])).toEqual(['UNO', 'SIN']);
  });

  it('sin asignaturas entrega igual la estructura de ciclos', async () => {
    // RF073: «Si el plan no tiene asignaturas, el sistema genera el archivo solo
    // con la estructura de ciclos».
    const doc = armarMallaParaHojaDeCalculo(datos({ asignaturas: [] }));
    const resumen = doc.secciones.find((s) => s.titulo === 'Resumen por ciclo');

    expect(resumen?.tabla?.filas).toHaveLength(4);
    expect(resumen?.tabla?.filas[0]).toEqual(['Ciclo 1', '0', '0']);
  });

  it('el resumen por ciclo aplica la regla de electivos', async () => {
    const grupo = { codigo: 'GE-1', cantidadAElegir: 1 };
    const doc = armarMallaParaHojaDeCalculo(
      datos({
        asignaturas: [
          asignatura({ id: 'e1', codigo: 'EL1', creditos: 3, cicloNumero: 1, grupoElectivo: grupo }),
          asignatura({ id: 'e2', codigo: 'EL2', creditos: 3, cicloNumero: 1, grupoElectivo: grupo }),
        ],
      }),
    );

    const resumen = doc.secciones.find((s) => s.titulo === 'Resumen por ciclo');
    expect(resumen?.tabla?.filas[0]).toEqual(['Ciclo 1', '2', '3']);
  });
});

describe('RF092 — evidencia de aprobación', () => {
  const flujo = [
    {
      fecha: new Date('2018-02-10T10:00:00Z'),
      accion: 'Aprobado',
      usuarioNombre: 'Ana Quispe',
      comentario: null,
    },
    {
      fecha: new Date('2018-01-05T09:00:00Z'),
      accion: 'Enviado a revisión',
      usuarioNombre: 'Luis Ramos',
      comentario: 'Primera versión',
    },
  ];

  it('ordena el flujo del más antiguo al más reciente', async () => {
    // El repositorio los devuelve al revés, que es lo que quiere la pantalla.
    // Una evidencia se lee como un relato del recorrido.
    const doc = armarEvidenciaDeAprobacion(datos({ aprobaciones: flujo }));
    const filas = doc.secciones[0]?.tabla?.filas ?? [];

    expect(filas.map((f) => f[1])).toEqual(['Enviado a revisión', 'Aprobado']);
  });

  it('un comentario ausente se escribe, no se deja en blanco', async () => {
    const doc = armarEvidenciaDeAprobacion(datos({ aprobaciones: flujo }));
    const filas = doc.secciones[0]?.tabla?.filas ?? [];
    expect(filas[1]?.[3]).toBe('—');
  });

  it('sin pasos registrados lo dice en vez de enseñar una tabla vacía', async () => {
    const doc = armarEvidenciaDeAprobacion(datos({ aprobaciones: [] }));
    expect(doc.secciones[0]?.tabla?.siVacia).toContain('No hay pasos de aprobación');
  });

  it('acompaña el flujo con objetivos y competencias del plan', async () => {
    // Es lo que hace útil la evidencia: el evaluador ve qué se aprobó, no solo
    // que alguien pulsó un botón.
    const doc = armarEvidenciaDeAprobacion(datos({ aprobaciones: flujo }));
    const titulos = doc.secciones.map((s) => s.titulo);

    expect(titulos).toContain('Objetivos educacionales');
    expect(titulos).toContain('Competencias del perfil de egreso');
  });
});

describe('RF084 — histórico de cambios', () => {
  it('conserva el orden cronológico', async () => {
    const doc = armarHistoricoDeCambios(
      datos({
        aprobaciones: [
          {
            fecha: new Date('2020-01-01T00:00:00Z'),
            accion: 'Archivado',
            usuarioNombre: 'Ana',
            comentario: null,
          },
          {
            fecha: new Date('2018-01-01T00:00:00Z'),
            accion: 'Aprobado',
            usuarioNombre: 'Ana',
            comentario: null,
          },
        ],
      }),
    );

    const filas = doc.secciones[0]?.tabla?.filas ?? [];
    expect(filas.map((f) => f[1])).toEqual(['Aprobado', 'Archivado']);
  });
});
