import { describe, expect, it } from 'vitest';

import type { EstructuraInstitucional, FacultadResumen } from '../api/estructura.api';
import { filaDeFacultad, pendientesDe, plural, tarjetasDeAltas } from './vista-admin';

const facultad = (sobre: Partial<FacultadResumen> = {}): FacultadResumen => ({
  id: 'f1',
  nombre: 'Facultad de Ingeniería',
  codigo: 'ING',
  activa: true,
  carreras: 3,
  usuarios: 1,
  carrerasSinDirector: 0,
  progreso: 100,
  estado: 'ACTIVA',
  ...sobre,
});

const estructura = (sobre: Partial<EstructuraInstitucional> = {}): EstructuraInstitucional => ({
  kpis: { facultadesActivas: 0, carreras: 0, usuariosConAcceso: 0, carrerasSinDirector: 0 },
  facultades: [],
  carrerasSinDirector: [],
  facultadesSinCarreras: [],
  altasRecientes: [],
  ...sobre,
});

describe('plural', () => {
  it('singular con 1, plural con el resto (incluido 0)', () => {
    expect(plural(1, 'carrera', 'carreras')).toBe('1 carrera');
    expect(plural(0, 'carrera', 'carreras')).toBe('0 carreras');
    expect(plural(4, 'carrera', 'carreras')).toBe('4 carreras');
  });
});

describe('filaDeFacultad', () => {
  it('mapea código, meta, progreso, enlace y chip', () => {
    expect(filaDeFacultad(facultad())).toEqual({
      id: 'f1',
      tag: 'ING',
      titulo: 'Facultad de Ingeniería',
      meta: '3 carreras · 1 usuario',
      progreso: 100,
      chip: { texto: 'Activa', tono: 'activo' },
      href: '/plan-estudios',
    });
  });

  it.each([
    ['REVISAR', 'Revisar', 'progreso'],
    ['INACTIVA', 'Inactiva', 'inactivo'],
  ] as const)('estado %s → chip %s / tono %s', (estado, texto, tono) => {
    expect(filaDeFacultad(facultad({ estado })).chip).toEqual({ texto, tono });
  });
});

describe('pendientesDe', () => {
  it('lista primero las carreras sin director y luego las facultades sin carreras', () => {
    const items = pendientesDe(
      estructura({
        carrerasSinDirector: [
          { id: 'c1', nombre: 'Ing. Civil', facultad: 'Facultad de Ingeniería' },
        ],
        facultadesSinCarreras: [{ id: 'f2', nombre: 'Facultad de Salud' }],
      }),
    );

    expect(items).toEqual([
      {
        id: 'carrera-c1',
        texto: 'Asignar director a Ing. Civil · Carrera sin responsable',
        urgente: true,
        href: '/usuarios',
      },
      {
        id: 'facultad-f2',
        texto: 'Registrar carreras de Facultad de Salud · Facultad creada sin carreras',
        href: '/plan-estudios',
      },
    ]);
  });

  it('respeta el máximo de 5, conservando las carreras primero', () => {
    const carreras = Array.from({ length: 4 }, (_, i) => ({
      id: `c${i}`,
      nombre: `Carrera ${i}`,
      facultad: 'F',
    }));
    const facultades = Array.from({ length: 3 }, (_, i) => ({ id: `f${i}`, nombre: `Fac ${i}` }));

    const items = pendientesDe(
      estructura({ carrerasSinDirector: carreras, facultadesSinCarreras: facultades }),
    );

    expect(items).toHaveLength(5);
    expect(items.slice(0, 4).every((i) => i.id.startsWith('carrera-'))).toBe(true);
    expect(items[4]?.id).toBe('facultad-f0');
  });

  it('sin pendientes devuelve una lista vacía', () => {
    expect(pendientesDe(estructura())).toEqual([]);
  });
});

describe('tarjetasDeAltas', () => {
  it('etiqueta el tipo, muestra el nombre y une contexto y fecha', () => {
    const [tarjeta] = tarjetasDeAltas([
      {
        tipo: 'CARRERA',
        id: 'c1',
        nombre: 'Ing. Civil',
        contexto: 'Facultad de Ingeniería',
        creadoEn: '2026-09-12T12:00:00.000Z',
      },
    ]);

    expect(tarjeta).toMatchObject({
      id: 'CARRERA-c1',
      titulo: 'Carrera',
      valor: 'Ing. Civil',
    });
    expect(tarjeta?.detalle).toMatch(/^Facultad de Ingeniería · /);
  });
});
