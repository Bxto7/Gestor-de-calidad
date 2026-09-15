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
});
