import { describe, expect, it } from 'vitest';

import {
  calcularEstructuraInstitucional,
  codigoDeFacultad,
  type CarreraEntrada,
  type ConteoDeCarrera,
  type FacultadEntrada,
} from './estructura-institucional.js';

const dia = (n: number) => new Date(`2026-09-${String(n).padStart(2, '0')}T00:00:00Z`);

function facultad(sobre: Partial<FacultadEntrada> & { id: string }): FacultadEntrada {
  return { nombre: `Facultad de ${sobre.id}`, activa: true, creadoEn: dia(1), ...sobre };
}

function carrera(
  sobre: Partial<CarreraEntrada> & { id: string; facultadId: string },
): CarreraEntrada {
  return { nombre: `Carrera ${sobre.id}`, activa: true, creadoEn: dia(1), ...sobre };
}

function conteos(pares: Record<string, ConteoDeCarrera>): Map<string, ConteoDeCarrera> {
  return new Map(Object.entries(pares));
}

describe('codigoDeFacultad', () => {
  it.each([
    ['Facultad de Ingeniería', 'ING'],
    ['Facultad de Ciencias de la Empresa', 'EMP'],
    ['Facultad de Ciencias de la Salud', 'SAL'],
    ['Facultad de Humanidades', 'HUM'],
    ['Facultad de Derecho', 'DER'],
    ['Facultad de Educación', 'EDU'],
    ['Facultad Ñandú', 'NAN'],
    ['Facultad de TI', 'TI'],
  ])('%s → %s', (nombre, esperado) => {
    expect(codigoDeFacultad(nombre)).toBe(esperado);
  });
});

describe('calcularEstructuraInstitucional', () => {
  const base = {
    facultades: [
      facultad({ id: 'ing', nombre: 'Facultad de Ingeniería' }),
      facultad({ id: 'der', nombre: 'Facultad de Derecho' }),
    ],
    carreras: [
      carrera({ id: 'c-sis', facultadId: 'ing', nombre: 'Ing. de Sistemas' }),
      carrera({ id: 'c-civ', facultadId: 'ing', nombre: 'Ing. Civil' }),
      carrera({ id: 'c-der', facultadId: 'der', nombre: 'Derecho' }),
    ],
    conteos: conteos({
      'c-sis': { usuarios: 3, directores: 1 },
      'c-civ': { usuarios: 1, directores: 0 },
      'c-der': { usuarios: 2, directores: 1 },
    }),
    usuariosConAcceso: 9,
  };

  it('deriva código, conteos, progreso y estado por facultad, ordenadas por nombre', () => {
    const { facultades } = calcularEstructuraInstitucional(base);

    expect(facultades.map((f) => f.nombre)).toEqual([
      'Facultad de Derecho',
      'Facultad de Ingeniería',
    ]);
    expect(facultades[0]).toMatchObject({
      codigo: 'DER',
      carreras: 1,
      usuarios: 2,
      carrerasSinDirector: 0,
      progreso: 100,
      estado: 'ACTIVA',
    });
    expect(facultades[1]).toMatchObject({
      codigo: 'ING',
      carreras: 2,
      usuarios: 4,
      carrerasSinDirector: 1,
      progreso: 50,
      estado: 'REVISAR',
    });
  });

  it('el KPI de carreras sin director es la longitud de la lista, y el de carreras la suma', () => {
    const r = calcularEstructuraInstitucional(base);

    expect(r.kpis.carrerasSinDirector).toBe(r.carrerasSinDirector.length);
    expect(r.kpis.carreras).toBe(
      r.facultades.filter((f) => f.activa).reduce((suma, f) => suma + f.carreras, 0),
    );
    expect(r.kpis).toMatchObject({ facultadesActivas: 2, carreras: 3, usuariosConAcceso: 9 });
    expect(r.carrerasSinDirector).toEqual([
      { id: 'c-civ', nombre: 'Ing. Civil', facultad: 'Facultad de Ingeniería' },
    ]);
  });

  it('una carrera inactiva no cuenta en nada', () => {
    const r = calcularEstructuraInstitucional({
      ...base,
      carreras: [...base.carreras, carrera({ id: 'c-vieja', facultadId: 'ing', activa: false })],
      conteos: conteos({
        ...Object.fromEntries(base.conteos),
        'c-vieja': { usuarios: 5, directores: 0 },
      }),
    });

    const ing = r.facultades.find((f) => f.id === 'ing');
    expect(ing).toMatchObject({ carreras: 2, usuarios: 4, carrerasSinDirector: 1, progreso: 50 });
    expect(r.carrerasSinDirector.map((c) => c.id)).toEqual(['c-civ']);
    expect(r.altasRecientes.map((a) => a.id)).not.toContain('c-vieja');
  });

  it('una facultad sin carreras activas es REVISAR con progreso 0 y sale en facultadesSinCarreras', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [facultad({ id: 'sal', nombre: 'Facultad de Ciencias de la Salud' })],
      carreras: [],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.facultades[0]).toMatchObject({ estado: 'REVISAR', progreso: 0, carreras: 0 });
    expect(r.facultadesSinCarreras).toEqual([
      { id: 'sal', nombre: 'Facultad de Ciencias de la Salud' },
    ]);
    expect(r.altasRecientes[0]).toMatchObject({
      tipo: 'FACULTAD',
      contexto: 'Sin carreras aún',
    });
  });

  it('una facultad inactiva es INACTIVA y queda fuera de KPIs, listas y altas', () => {
    const r = calcularEstructuraInstitucional({
      ...base,
      facultades: [
        ...base.facultades,
        facultad({
          id: 'hum',
          nombre: 'Facultad de Humanidades',
          activa: false,
          creadoEn: dia(20),
        }),
      ],
      carreras: [
        ...base.carreras,
        carrera({ id: 'c-hum', facultadId: 'hum', nombre: 'Filosofía', creadoEn: dia(21) }),
      ],
      conteos: conteos({
        ...Object.fromEntries(base.conteos),
        'c-hum': { usuarios: 1, directores: 0 },
      }),
    });

    expect(r.facultades.find((f) => f.id === 'hum')).toMatchObject({
      estado: 'INACTIVA',
      activa: false,
    });
    expect(r.kpis).toMatchObject({ facultadesActivas: 2, carreras: 3, carrerasSinDirector: 1 });
    expect(r.carrerasSinDirector.map((c) => c.id)).not.toContain('c-hum');
    expect(r.facultadesSinCarreras.map((f) => f.id)).not.toContain('hum');
    expect(r.altasRecientes.map((a) => a.id)).not.toContain('hum');
    expect(r.altasRecientes.map((a) => a.id)).not.toContain('c-hum');
  });

  it('una carrera sin entrada en el mapa de conteos cuenta como sin director', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [facultad({ id: 'ing', nombre: 'Facultad de Ingeniería' })],
      carreras: [carrera({ id: 'c-x', facultadId: 'ing' })],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.kpis.carrerasSinDirector).toBe(1);
  });

  it('las altas recientes mezclan facultades y carreras, tope de 4, más nueva primero, empate por nombre', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [
        facultad({ id: 'f1', nombre: 'Facultad de Arte', creadoEn: dia(10) }),
        facultad({ id: 'f2', nombre: 'Facultad de Bio', creadoEn: dia(2) }),
      ],
      carreras: [
        carrera({ id: 'c1', facultadId: 'f1', nombre: 'Zoología', creadoEn: dia(12) }),
        carrera({ id: 'c2', facultadId: 'f1', nombre: 'Astronomía', creadoEn: dia(12) }),
        carrera({ id: 'c3', facultadId: 'f2', nombre: 'Botánica', creadoEn: dia(5) }),
        carrera({ id: 'c4', facultadId: 'f2', nombre: 'Ecología', creadoEn: dia(1) }),
      ],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.altasRecientes.map((a) => a.id)).toEqual(['c2', 'c1', 'f1', 'c3']);
    expect(r.altasRecientes[0]).toMatchObject({
      tipo: 'CARRERA',
      contexto: 'Facultad de Arte',
      creadoEn: '2026-09-12T00:00:00.000Z',
    });
    expect(r.altasRecientes[2]).toMatchObject({ tipo: 'FACULTAD', contexto: '2 carreras' });
  });

  it('carrerasSinDirector se ordena por facultad y luego por nombre', () => {
    const r = calcularEstructuraInstitucional({
      facultades: [
        facultad({ id: 'b', nombre: 'Facultad de Bio' }),
        facultad({ id: 'a', nombre: 'Facultad de Arte' }),
      ],
      carreras: [
        carrera({ id: 'c1', facultadId: 'b', nombre: 'Zeta' }),
        carrera({ id: 'c2', facultadId: 'a', nombre: 'Beta' }),
        carrera({ id: 'c3', facultadId: 'a', nombre: 'Alfa' }),
      ],
      conteos: new Map(),
      usuariosConAcceso: 0,
    });

    expect(r.carrerasSinDirector.map((c) => c.id)).toEqual(['c3', 'c2', 'c1']);
  });
});
