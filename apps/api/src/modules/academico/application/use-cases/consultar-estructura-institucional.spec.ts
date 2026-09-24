import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { ConteoDeUsuariosPort } from '../../../auth/application/ports/conteo-usuarios.port.js';
import type {
  DatosCarreraCompleta,
  DatosFacultad,
  RepositorioCarreraPort,
  RepositorioFacultadPort,
} from '../ports/academico.port.js';
import { ConsultarEstructuraInstitucional } from './consultar-estructura-institucional.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Administrador del sistema' };

function autorizacion(
  permitido: boolean,
  consultados: [string, string, string | null | undefined][] = [],
): AuthorizationPort {
  return {
    puede: async (usuarioId, permiso, carreraId) => {
      consultados.push([usuarioId, permiso, carreraId]);
      return permitido ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' };
    },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
    rolesDe: async () => [],
  };
}

const facultad = (sobre: Partial<DatosFacultad> & { id: string }): DatosFacultad => ({
  nombre: 'Facultad de Ingeniería',
  activa: true,
  creadoEn: new Date('2026-09-01T00:00:00Z'),
  totalCarreras: 0,
  ...sobre,
});

const carrera = (
  sobre: Partial<DatosCarreraCompleta> & { id: string; facultadId: string },
): DatosCarreraCompleta => ({
  nombre: 'Ing. de Sistemas',
  codigo: 'SIS',
  duracionAnios: 5,
  activa: true,
  creadoEn: new Date('2026-09-02T00:00:00Z'),
  ...sobre,
});

function montar(opciones: { permitido: boolean }) {
  const consultados: [string, string, string | null | undefined][] = [];
  const llamadasAuth = { conteo: [] as (readonly string[])[], total: 0 };

  const facultades = {
    listar: async () => [facultad({ id: 'ing' })],
  } as unknown as RepositorioFacultadPort;
  const carreras = {
    listar: async () => [
      carrera({ id: 'c-activa', facultadId: 'ing' }),
      carrera({ id: 'c-inactiva', facultadId: 'ing', activa: false }),
    ],
  } as unknown as RepositorioCarreraPort;
  const conteo: ConteoDeUsuariosPort = {
    conteoPorCarrera: async (ids) => {
      llamadasAuth.conteo.push(ids);
      return new Map([['c-activa', { usuarios: 2, directores: 1 }]]);
    },
    totalUsuariosActivos: async () => {
      llamadasAuth.total += 1;
      return 7;
    },
  };

  const caso = new ConsultarEstructuraInstitucional(
    facultades,
    carreras,
    conteo,
    autorizacion(opciones.permitido, consultados),
  );
  return { caso, consultados, llamadasAuth };
}

describe('ConsultarEstructuraInstitucional', () => {
  it('sin el permiso lanza AccesoDenegado y no consulta a auth', async () => {
    const { caso, llamadasAuth } = montar({ permitido: false });

    await expect(caso.ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(llamadasAuth.conteo).toEqual([]);
    expect(llamadasAuth.total).toBe(0);
  });

  it('exige usuario.gestionar de forma institucional (sin carrera)', async () => {
    const { caso, consultados } = montar({ permitido: true });

    await caso.ejecutar(ACTOR);

    expect(consultados).toEqual([['u-1', 'usuario.gestionar', null]]);
  });

  it('pide los conteos solo de las carreras activas y devuelve el resumen calculado', async () => {
    const { caso, llamadasAuth } = montar({ permitido: true });

    const r = await caso.ejecutar(ACTOR);

    expect(llamadasAuth.conteo).toEqual([['c-activa']]);
    expect(r.kpis).toEqual({
      facultadesActivas: 1,
      carreras: 1,
      usuariosConAcceso: 7,
      carrerasSinDirector: 0,
    });
    expect(r.facultades[0]).toMatchObject({ usuarios: 2, progreso: 100, estado: 'ACTIVA' });
  });
});
