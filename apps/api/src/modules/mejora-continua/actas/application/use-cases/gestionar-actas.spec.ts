/**
 * Pruebas de `GestionarActas` (2c-AC-A). Mismo patrón que
 * `gestionar-planes-mejora.spec.ts`: dobles de puerto,
 * `permitirTodo()`/`denegarRegistrando()` para la autorización, un
 * `montar()` que arma el caso de uso con esos dobles.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, ReglaDeNegocioViolada } from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  CarreraBase,
  ContenidoCurricularPort,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { DatosActa, RepositorioActaAprobacionPort } from '../ports/acta-aprobacion.port.js';
import { GestionarActas } from './gestionar-actas.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const CARRERA = 'carrera-1';

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
  };
}

function denegarRegistrando(pedidos: string[]): AuthorizationPort {
  return {
    puede: async (_id, permiso) => {
      pedidos.push(permiso);
      return { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
  };
}

function acta(sobre: Partial<DatosActa> = {}): DatosActa {
  return {
    id: 'acta-1',
    carreraId: CARRERA,
    correlativo: 1,
    codigo: 'ACTA N° 001 – EAP-ISI',
    periodoAcademico: '2025-10',
    periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    textoIntroduccion: 'Se deja constancia de la revisión y deliberación de las siguientes acciones.',
    textoAcuerdoCierre: 'Se aprueban las acciones de mejora del programa para el periodo 2025-10.',
    convocadaPor: '',
    fechaReunion: new Date(0),
    lugarReunion: '',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    estado: 'Borrador',
    creadoEn: new Date('2026-03-01'),
    asistentes: [],
    ...sobre,
  };
}

function repoActas(overrides: Partial<RepositorioActaAprobacionPort> = {}): RepositorioActaAprobacionPort {
  return {
    crear: async () => acta(),
    porId: async () => acta(),
    editarCabecera: async () => acta(),
    reemplazarAsistentes: async () => acta(),
    eliminar: async () => {},
    correlativosDe: async () => [],
    accionesDe: async () => [],
    agregarAcciones: async () => {},
    actualizarSeleccion: async () => {},
    editarTextos: async (_id, datos) => acta(datos),
    planesYaEmitidos: async () => new Set(),
    ...overrides,
  };
}

function carreraBase(sobre: Partial<CarreraBase> = {}): CarreraBase {
  return { id: CARRERA, codigo: 'EAP-ISI', nombre: 'Ingeniería de Software', ...sobre };
}

function curricular(overrides: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [],
    planPorId: async () => null,
    competenciasDelPlan: async () => [],
    asignaturasDelPlan: async () => [],
    carreraPorId: async () => carreraBase(),
    ...overrides,
  };
}

function capturarEventos(): { eventos: DomainEvent[]; publicador: PublicadorDeEventos } {
  const eventos: DomainEvent[] = [];
  return {
    eventos,
    publicador: {
      publicar: async (nuevos) => {
        eventos.push(...nuevos);
      },
    },
  };
}

function cabecera(sobre: Partial<import('../ports/acta-aprobacion.port.js').CabeceraActa> = {}) {
  return {
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    convocadaPor: 'Directora de Escuela',
    fechaReunion: new Date('2026-03-09'),
    lugarReunion: 'Sala de reuniones',
    comentario: null,
    lugarEmision: null,
    fechaEmision: null,
    ...sobre,
  };
}

function montar(opciones: {
  actas?: RepositorioActaAprobacionPort;
  curricular?: ContenidoCurricularPort;
  autorizacion?: AuthorizationPort;
  eventos?: PublicadorDeEventos;
} = {}): GestionarActas {
  return new GestionarActas(
    opciones.actas ?? repoActas(),
    opciones.curricular ?? curricular(),
    opciones.autorizacion ?? permitirTodo(),
    opciones.eventos ?? { publicar: async () => {} },
  );
}

describe('crear', () => {
  it('resuelve la carrera del actor, genera correlativo/código y precarga título/objetivo', async () => {
    const actas = repoActas({
      correlativosDe: async () => [1, 2],
      crear: async (datos) => acta({ ...datos, id: 'acta-2' }),
    });
    const casos = montar({ actas });

    const creada = await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(creada.correlativo).toBe(3);
    expect(creada.codigo).toBe('ACTA N° 003 – EAP-ISI');
    expect(creada.titulo).toContain('2025-10');
    expect(creada.titulo).toContain('Ingeniería de Software');
    expect(creada.objetivo).toBe('Elaborar y aprobar el Plan de Mejora 2025-10');
  });

  it('rechaza si el usuario no dirige ninguna carrera', async () => {
    const autorizacion: AuthorizationPort = {
      puede: async () => ({ permitido: true }),
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
    };
    const casos = montar({ autorizacion });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(AccesoDenegado);
  });

  it('exige actas.crear acotado a la carrera del actor', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.crear(ACTOR, { periodoAcademico: '2025-10' })).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.crear');
  });

  it('rechaza un periodo académico vacío (RF-AC-001)', async () => {
    const casos = montar();
    await expect(casos.crear(ACTOR, { periodoAcademico: '   ' })).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('publica ActaCreada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.nombre).toBe('actas.creada');
  });

  it('compone los textos institucionales de introducción y cierre (RF-AC-011)', async () => {
    const actas = repoActas({
      correlativosDe: async () => [],
      crear: async (datos) => acta({ ...datos, id: 'acta-2' }),
    });
    const casos = montar({ actas });

    const creada = await casos.crear(ACTOR, { periodoAcademico: '2025-10' });

    expect(creada.textoIntroduccion).toContain('2025-10');
    expect(creada.textoAcuerdoCierre).toContain('2025-10');
  });
});

describe('editarCabecera', () => {
  it('edita cuando el acta está en Borrador', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      editarCabecera: async (_id, datos) => acta({ ...datos }),
    });
    const casos = montar({ actas });

    const editada = await casos.editarCabecera(ACTOR, 'acta-1', cabecera());

    expect(editada.convocadaPor).toBe('Directora de Escuela');
  });

  it('rechaza editar un acta que no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'En revisión' }) });
    const casos = montar({ actas });

    await expect(casos.editarCabecera(ACTOR, 'acta-1', cabecera())).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('exige actas.editar acotado a la carrera del acta', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.editarCabecera(ACTOR, 'acta-1', cabecera())).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.editar');
  });

  it('publica ActaCabeceraEditada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.editarCabecera(ACTOR, 'acta-1', cabecera());

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.cabecera_editada']);
  });
});

describe('reemplazarAsistentes', () => {
  it('recorta espacios y descarta nombres vacíos', async () => {
    let recibidos: readonly string[] = [];
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      reemplazarAsistentes: async (_id, nombres) => {
        recibidos = nombres;
        return acta({ asistentes: nombres.map((n, i) => ({ id: `a-${i}`, nombre: n })) });
      },
    });
    const casos = montar({ actas });

    await casos.reemplazarAsistentes(ACTOR, 'acta-1', ['  Ana Pérez  ', '', 'Luis Gómez']);

    expect(recibidos).toEqual(['Ana Pérez', 'Luis Gómez']);
  });

  it('rechaza si el acta no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Aprobada' }) });
    const casos = montar({ actas });

    await expect(casos.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez'])).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('publica ActaAsistentesReemplazados', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador });

    await casos.reemplazarAsistentes(ACTOR, 'acta-1', ['Ana Pérez']);

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.asistentes_reemplazados']);
  });
});

describe('eliminar', () => {
  it('elimina un acta en Borrador', async () => {
    let eliminado = false;
    const actas = repoActas({
      porId: async () => acta({ estado: 'Borrador' }),
      eliminar: async () => {
        eliminado = true;
      },
    });
    const casos = montar({ actas });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eliminado).toBe(true);
  });

  it('rechaza eliminar un acta que no está en Borrador (RF-AC-017)', async () => {
    const actas = repoActas({ porId: async () => acta({ estado: 'Emitida' }) });
    const casos = montar({ actas });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige actas.eliminar acotado a la carrera del acta', async () => {
    const pedidos: string[] = [];
    const casos = montar({ autorizacion: denegarRegistrando(pedidos) });

    await expect(casos.eliminar(ACTOR, 'acta-1')).rejects.toThrow(AccesoDenegado);
    expect(pedidos).toContain('actas.eliminar');
  });

  it('publica ActaEliminada', async () => {
    const { eventos, publicador } = capturarEventos();
    const casos = montar({ eventos: publicador, actas: repoActas({ porId: async () => acta({ estado: 'Borrador' }) }) });

    await casos.eliminar(ACTOR, 'acta-1');

    expect(eventos.map((e) => e.nombre)).toEqual(['actas.eliminada']);
  });
});
