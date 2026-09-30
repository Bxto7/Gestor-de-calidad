import { describe, expect, it } from 'vitest';

import type { Actor, DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../ports/authorization.port.js';
import type { DocenteEnUsoPort, UsoDeDocente } from '../ports/docente-en-uso.port.js';
import type {
  DatosUsuario,
  FiltroUsuarios,
  RepositorioGestionUsuariosPort,
} from '../ports/gestion-usuarios.port.js';
import type { SeguridadPort } from '../ports/sesion.port.js';
import { GestionarDocentes } from './gestionar-docentes.use-case.js';

const DIRECTOR: Actor = { id: 'dir-1', nombre: 'Rosa Vidal' };
const ISI = 'carrera-isi';
const IIN = 'carrera-iin';

function docente(sobre: Partial<DatosUsuario> = {}): DatosUsuario {
  return {
    id: 'doc-1',
    email: 'luis@sgc.local',
    nombreCompleto: 'Luis Ramos',
    activo: true,
    roles: [{ codigo: 'DOCENTE', nombre: 'Docente' }],
    carreraId: ISI,
    creadoEn: new Date('2026-01-01'),
    ultimaActividad: null,
    ...sobre,
  };
}

const COORDINADOR_Y_DOCENTE = [
  { codigo: 'DOCENTE', nombre: 'Docente' },
  { codigo: 'COORDINADOR_ACADEMICO', nombre: 'Coordinador académico' },
];

function montar(
  opciones: {
    existente?: DatosUsuario | null;
    carreraDelDirector?: string | null;
    permitido?: boolean;
    tienePermiso?: boolean;
    emailDuplicado?: boolean;
    uso?: UsoDeDocente;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const filtros: FiltroUsuarios[] = [];
  const creados: unknown[] = [];
  const passwords: { id: string; hash: string }[] = [];
  const estados: { id: string; activo: boolean }[] = [];
  const eliminados: string[] = [];

  // Solo lo que este caso de uso toca del repositorio.
  const repo = {
    listar: async (filtro: FiltroUsuarios) => {
      filtros.push(filtro);
      return [docente(), docente({ id: 'otro-rol', roles: COORDINADOR_Y_DOCENTE })];
    },
    porId: async () => (opciones.existente === undefined ? docente() : opciones.existente),
    existeEmail: async () => opciones.emailDuplicado ?? false,
    crear: async (datos: { email: string; nombreCompleto: string; carreraId: string | null }) => {
      creados.push(datos);
      return docente({
        id: 'nuevo',
        email: datos.email,
        nombreCompleto: datos.nombreCompleto,
        carreraId: datos.carreraId,
      });
    },
    cambiarEstado: async (id: string, activo: boolean) => {
      estados.push({ id, activo });
      return docente({ activo });
    },
    cambiarPassword: async (id: string, hash: string) => void passwords.push({ id, hash }),
    eliminar: async (id: string) => void eliminados.push(id),
  } as unknown as RepositorioGestionUsuariosPort;

  const seguridad = {
    hashearPassword: async (p: string) => `hash-de-${p}`,
  } as unknown as SeguridadPort;

  const autorizacion = {
    carreraACargoDe: async () =>
      opciones.carreraDelDirector === undefined ? ISI : opciones.carreraDelDirector,
    permisosDe: async () => new Set(opciones.tienePermiso === false ? [] : ['docente.gestionar']),
    puede: async () =>
      (opciones.permitido ?? true)
        ? { permitido: true as const }
        : { permitido: false as const, motivo: 'Falta el permiso docente.gestionar.' },
  } as unknown as AuthorizationPort;

  const enUso: DocenteEnUsoPort = {
    enUso: async () => opciones.uso ?? { enUso: false, motivos: [] },
  };

  const caso = new GestionarDocentes(repo, seguridad, autorizacion, enUso, {
    publicar: async (e) => void publicados.push(...e),
  });

  return { caso, publicados, filtros, creados, passwords, estados, eliminados };
}

describe('listar', () => {
  it('pide los docentes de la carrera del Director y descarta cuentas con más de un rol', async () => {
    const { caso, filtros } = montar();

    const r = await caso.listar(DIRECTOR);

    expect(filtros).toEqual([{ rol: 'DOCENTE', carreraId: ISI }]);
    expect(r.map((d) => d.id)).toEqual(['doc-1']);
  });

  it('sin el permiso docente.gestionar es AccesoDenegado', async () => {
    const { caso } = montar({ permitido: false });
    await expect(caso.listar(DIRECTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('con el permiso pero sin carrera asignada explica qué falta', async () => {
    const { caso } = montar({ carreraDelDirector: null });
    await expect(caso.listar(DIRECTOR)).rejects.toThrow(/carrera asignada/);
  });

  it('sin permiso y sin carrera es AccesoDenegado, no un aviso de carrera', async () => {
    const { caso } = montar({ carreraDelDirector: null, tienePermiso: false });
    await expect(caso.listar(DIRECTOR)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('crear (RF-CH-011 y RF-CH-012)', () => {
  const datos = {
    nombreCompleto: '  Nuevo Docente ',
    email: ' Nuevo@SGC.local ',
    password: 'Clave.Docente.1',
  };

  it('asocia al docente a la carrera del Director, con el rol DOCENTE y el correo normalizado', async () => {
    const { caso, creados } = montar();

    const r = await caso.crear(DIRECTOR, datos);

    expect(creados).toEqual([
      {
        email: 'nuevo@sgc.local',
        nombreCompleto: 'Nuevo Docente',
        rolCodigos: ['DOCENTE'],
        carreraId: ISI,
        passwordHash: 'hash-de-Clave.Docente.1',
      },
    ]);
    expect(r.email).toBe('nuevo@sgc.local');
  });

  it('publica DocenteCreado y la contraseña no aparece en ningún evento', async () => {
    const { caso, publicados } = montar();

    await caso.crear(DIRECTOR, datos);

    expect(publicados.map((e) => e.nombre)).toEqual(['docente.creado']);
    expect(JSON.stringify(publicados)).not.toContain('Clave.Docente.1');
  });

  it('rechaza un usuario que ya existe', async () => {
    const { caso, creados } = montar({ emailDuplicado: true });
    await expect(caso.crear(DIRECTOR, datos)).rejects.toThrow(/nuevo@sgc.local/);
    expect(creados).toEqual([]);
  });

  it('exige nombre, usuario y contraseña', async () => {
    const { caso } = montar();
    await expect(caso.crear(DIRECTOR, { ...datos, nombreCompleto: '   ' })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    await expect(caso.crear(DIRECTOR, { ...datos, email: '' })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
    await expect(caso.crear(DIRECTOR, { ...datos, password: '' })).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
  });

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const { caso, creados } = montar();
    await expect(caso.crear(DIRECTOR, { ...datos, password: '1234567' })).rejects.toThrow(
      /al menos 8 caracteres/,
    );
    expect(creados).toEqual([]);
  });
});

describe('cambiarPassword (RF-CH-013)', () => {
  it('guarda el hash de la nueva contraseña y deja constancia sin ella', async () => {
    const { caso, passwords, publicados } = montar();

    await caso.cambiarPassword(DIRECTOR, 'doc-1', 'Otra.Clave.Docente.2');

    expect(passwords).toEqual([{ id: 'doc-1', hash: 'hash-de-Otra.Clave.Docente.2' }]);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.password_cambiada']);
    expect(JSON.stringify(publicados)).not.toContain('Otra.Clave.Docente.2');
  });

  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    const { caso, passwords } = montar();
    await expect(caso.cambiarPassword(DIRECTOR, 'doc-1', 'corta')).rejects.toThrow(
      /al menos 8 caracteres/,
    );
    expect(passwords).toEqual([]);
  });
});

describe('solo se gestionan los docentes de la propia carrera', () => {
  it('un docente de otra carrera responde NoEncontrado en todas las operaciones', async () => {
    const { caso, passwords, estados, eliminados } = montar({
      existente: docente({ carreraId: IIN }),
    });

    await expect(caso.cambiarPassword(DIRECTOR, 'doc-1', 'Clave.Docente.1')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    await expect(caso.cambiarEstado(DIRECTOR, 'doc-1', false)).rejects.toBeInstanceOf(NoEncontrado);
    await expect(caso.eliminar(DIRECTOR, 'doc-1')).rejects.toBeInstanceOf(NoEncontrado);

    expect([passwords, estados, eliminados]).toEqual([[], [], []]);
  });

  it('una cuenta con DOCENTE y otro rol no se puede tocar desde aquí', async () => {
    const { caso, eliminados } = montar({ existente: docente({ roles: COORDINADOR_Y_DOCENTE }) });

    await expect(caso.eliminar(DIRECTOR, 'doc-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(eliminados).toEqual([]);
  });

  it('un id que no existe responde NoEncontrado', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.eliminar(DIRECTOR, 'nadie')).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('inactivar y reactivar (RF-CH-014)', () => {
  it('inactivar cambia el estado y publica DocenteInactivado', async () => {
    const { caso, estados, publicados } = montar();

    const r = await caso.cambiarEstado(DIRECTOR, 'doc-1', false);

    expect(estados).toEqual([{ id: 'doc-1', activo: false }]);
    expect(r.activo).toBe(false);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.inactivado']);
  });

  it('reactivar publica DocenteReactivado', async () => {
    const { caso, estados, publicados } = montar({ existente: docente({ activo: false }) });

    await caso.cambiarEstado(DIRECTOR, 'doc-1', true);

    expect(estados).toEqual([{ id: 'doc-1', activo: true }]);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.reactivado']);
  });
});

describe('eliminar (RF-CH-014)', () => {
  it('sin referencias en otros módulos, borra la cuenta y publica DocenteEliminado', async () => {
    const { caso, eliminados, publicados } = montar();

    await caso.eliminar(DIRECTOR, 'doc-1');

    expect(eliminados).toEqual(['doc-1']);
    expect(publicados.map((e) => e.nombre)).toEqual(['docente.eliminado']);
  });

  it('en uso, bloquea el borrado, dice por qué y sugiere inactivar', async () => {
    const { caso, eliminados, publicados } = montar({
      uso: { enUso: true, motivos: ['tiene 2 evidencia(s) registrada(s)'] },
    });

    await expect(caso.eliminar(DIRECTOR, 'doc-1')).rejects.toThrow(
      /Luis Ramos.*2 evidencia\(s\) registrada\(s\).*Inactívalo/s,
    );
    expect(eliminados).toEqual([]);
    expect(publicados).toEqual([]);
  });
});
