/**
 * Pruebas de los casos de uso de carreras.
 *
 * El foco está en las reglas de unicidad y en RF012, que es la única con
 * consecuencias destructivas: reducir los ciclos de una carrera puede dejar
 * asignaturas apuntando a ciclos que ya no existen.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  DatosCarreraCompleta,
  DatosFacultad,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../ports/academico.port.js';
import { GestionarCarreras } from './gestionar-carreras.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Administrador del sistema' };

function facultad(sobre: Partial<DatosFacultad> = {}): DatosFacultad {
  return {
    id: 'fac-1',
    nombre: 'Ingeniería',
    activa: true,
    creadoEn: new Date('2026-01-01'),
    totalCarreras: 2,
    ...sobre,
  };
}

function carrera(sobre: Partial<DatosCarreraCompleta> = {}): DatosCarreraCompleta {
  return {
    id: 'car-1',
    facultadId: 'fac-1',
    nombre: 'Ingeniería de Sistemas',
    codigo: 'ISI',
    duracionAnios: 5,
    activa: true,
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };
}

function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };
}

/* ── Carreras ─────────────────────────────────────────────────────────── */

function montarCarreras(opciones: {
  facultad?: DatosFacultad | null;
  carrera?: DatosCarreraCompleta | null;
  nombreDuplicado?: boolean;
  codigoDuplicado?: boolean;
  asignaturasHuerfanas?: number;
  autorizacion?: AuthorizationPort;
}) {
  const publicados: DomainEvent[] = [];
  const ciclosSincronizados: number[] = [];
  const creadas: unknown[] = [];
  const filtrosCarrera: unknown[] = [];

  const repoCarrera: RepositorioCarreraPort = {
    listar: async (filtro) => {
      filtrosCarrera.push(filtro);
      return [carrera()];
    },
    porId: async () => opciones.carrera ?? null,
    crear: async (d) => {
      creadas.push(d);
      return carrera({ ...d });
    },
    actualizar: async (_id, d) => carrera({ ...d }),
    cambiarEstado: async (_id, activa) => carrera({ activa }),
    existeNombreEnFacultad: async () => opciones.nombreDuplicado ?? false,
    existeCodigo: async () => opciones.codigoDuplicado ?? false,
    asignaturasSobreCiclo: async () => opciones.asignaturasHuerfanas ?? 0,
    sincronizarCiclos: async (_id, total) => void ciclosSincronizados.push(total),
  };

  const repoFacultad = {
    porId: async () => (opciones.facultad === undefined ? facultad() : opciones.facultad),
  } as unknown as RepositorioFacultadPort;

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarCarreras(
    repoCarrera,
    repoFacultad,
    opciones.autorizacion ?? permitirTodo(),
    eventos,
  );
  return { caso, publicados, ciclosSincronizados, creadas, filtrosCarrera };
}

const DATOS = { nombre: 'Ingeniería de Sistemas', codigo: 'ISI', duracionAnios: 5 };

describe('RF009 / RF011 — registrar carrera', () => {
  it('crea los ciclos: dos por año', async () => {
    const { caso, ciclosSincronizados } = montarCarreras({});
    await caso.crear(ACTOR, 'fac-1', DATOS);
    expect(ciclosSincronizados).toEqual([10]);
  });

  it('normaliza el código a mayúsculas', async () => {
    // El código alimenta los de planes y asignaturas: si entrara en minúsculas
    // produciría "PE-isi-2026-v1" junto a "PE-ISI-2026-v1".
    const { caso, creadas } = montarCarreras({});
    await caso.crear(ACTOR, 'fac-1', { ...DATOS, codigo: ' isi ' });
    expect((creadas[0] as { codigo: string }).codigo).toBe('ISI');
  });

  it('404 si la facultad no existe', async () => {
    const { caso } = montarCarreras({ facultad: null });
    await expect(caso.crear(ACTOR, 'fac-x', DATOS)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('RF004: una facultad inactiva no admite carreras nuevas', async () => {
    const { caso, creadas } = montarCarreras({ facultad: facultad({ activa: false }) });
    await expect(caso.crear(ACTOR, 'fac-1', DATOS)).rejects.toThrow(/inactiva/);
    expect(creadas).toHaveLength(0);
  });

  it('RF015: rechaza nombre repetido dentro de la facultad', async () => {
    const { caso } = montarCarreras({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'fac-1', DATOS)).rejects.toThrow(/en esta facultad/);
  });

  it('RF017: rechaza código repetido en toda la universidad', async () => {
    const { caso } = montarCarreras({ codigoDuplicado: true });
    await expect(caso.crear(ACTOR, 'fac-1', DATOS)).rejects.toThrow(/en la universidad/);
  });

  it('RF011 RN1: rechaza una duración no entera o no positiva', async () => {
    const { caso } = montarCarreras({});
    for (const anios of [0, -1, 2.5]) {
      await expect(
        caso.crear(ACTOR, 'fac-1', { ...DATOS, duracionAnios: anios }),
        String(anios),
      ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    }
  });
});

describe('RF012 — editar carrera y reducir ciclos', () => {
  it('permite reducir si no hay asignaturas afectadas', async () => {
    const { caso, ciclosSincronizados } = montarCarreras({
      carrera: carrera({ duracionAnios: 5 }),
      asignaturasHuerfanas: 0,
    });
    await caso.editar(ACTOR, 'car-1', { ...DATOS, duracionAnios: 4 });
    expect(ciclosSincronizados).toEqual([8]);
  });

  it('RN1: rechaza la reducción si dejaría asignaturas huérfanas', async () => {
    // Se comprueba ANTES de tocar nada: hacerlo después obligaría a deshacer,
    // y los ciclos borrados se llevarían por delante la ubicación de los cursos.
    const { caso, ciclosSincronizados } = montarCarreras({
      carrera: carrera({ duracionAnios: 5 }),
      asignaturasHuerfanas: 3,
    });

    await expect(caso.editar(ACTOR, 'car-1', { ...DATOS, duracionAnios: 3 })).rejects.toThrow(
      /3 asignatura\(s\)/,
    );
    expect(ciclosSincronizados).toHaveLength(0);
  });

  it('ampliar ciclos no necesita la comprobación', async () => {
    // Añadir ciclos no puede dejar nada huérfano, así que ni se consulta.
    const { caso, ciclosSincronizados } = montarCarreras({
      carrera: carrera({ duracionAnios: 3 }),
      asignaturasHuerfanas: 99,
    });
    await caso.editar(ACTOR, 'car-1', { ...DATOS, duracionAnios: 5 });
    expect(ciclosSincronizados).toEqual([10]);
  });

  it('la unicidad al editar ignora la propia carrera', async () => {
    // Sin esto, guardar sin cambiar el nombre fallaría siempre con "ya existe".
    const { caso } = montarCarreras({ carrera: carrera(), nombreDuplicado: false });
    await expect(caso.editar(ACTOR, 'car-1', DATOS)).resolves.toBeDefined();
  });
});

describe('RF018 — inactivar carrera', () => {
  it('cambia el estado y lo registra', async () => {
    const { caso, publicados } = montarCarreras({ carrera: carrera() });
    const r = await caso.cambiarEstado(ACTOR, 'car-1', false);
    expect(r.activa).toBe(false);
    expect(publicados[0]?.nombre).toBe('carrera.estado');
  });
});

describe('RF013 / RF016 — consulta de carreras', () => {
  it('combina los filtros en una sola consulta', async () => {
    // La pantalla filtra por facultad y por texto a la vez; si el caso de uso
    // ignorara uno, el listado mostraría carreras de otras facultades.
    const { caso, filtrosCarrera } = montarCarreras({});
    await caso.listar(ACTOR, { facultadId: 'fac-1', texto: 'sist', activa: true });
    expect(filtrosCarrera).toEqual([{ facultadId: 'fac-1', texto: 'sist', activa: true }]);
  });

  it('leer exige permiso', async () => {
    const { caso } = montarCarreras({ autorizacion: denegar() });
    await expect(caso.listar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('porId devuelve la carrera pedida', async () => {
    const { caso } = montarCarreras({ carrera: carrera({ id: 'car-9' }) });
    await expect(caso.porId(ACTOR, 'car-9')).resolves.toMatchObject({ id: 'car-9' });
  });

  it('porId da 404 en vez de un resultado inventado', async () => {
    // Este método existe porque el controller resolvía el detalle filtrando el
    // listado y devolvía el primero que hubiera si no encontraba el id.
    const { caso } = montarCarreras({ carrera: null });
    await expect(caso.porId(ACTOR, 'car-x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});
