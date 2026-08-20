/**
 * Pruebas de los casos de uso de sesión.
 *
 * Las dos propiedades que más importan aquí no son funcionales sino de
 * seguridad, y por eso ocupan la mayor parte del archivo:
 *
 *  - el login **no distingue** correo inexistente de contraseña incorrecta;
 *  - el refresh token **rota**, y reutilizar uno consumido revoca la sesión.
 *
 * Ambas son fáciles de romper en un refactor bienintencionado —"devolvamos un
 * mensaje más útil"— y estas pruebas están para que eso falle en CI.
 */

import { describe, expect, it } from 'vitest';

import { AccesoDenegado } from '../../../../shared-kernel/errors/errores.js';
import type {
  RepositorioUsuarioPort,
  SeguridadPort,
  SesionRefresco,
  UsuarioAutenticable,
} from '../ports/sesion.port.js';
import { IniciarSesion, type RegistroDeSeguridad } from './iniciar-sesion.use-case.js';

const AHORA = new Date('2026-08-20T12:00:00Z');
const HASH_VALIDO = 'hash-de-la-contrasena-correcta';
const HASH_SENUELO = 'hash-de-descarte';

function usuario(sobre: Partial<UsuarioAutenticable> = {}): UsuarioAutenticable {
  return {
    id: 'u-1',
    passwordHash: HASH_VALIDO,
    nombreCompleto: 'Director de ISI',
    activo: true,
    ...sobre,
  };
}

function montar(opciones: {
  usuario?: UsuarioAutenticable | null;
  sesion?: SesionRefresco | null;
} = {}) {
  const verificados: string[] = [];
  const creados: { usuarioId: string; expiraEn: Date }[] = [];
  const revocados: string[] = [];
  const revocadosTodos: string[] = [];
  const incidentes: string[] = [];

  const usuarios: RepositorioUsuarioPort = {
    porEmail: async () => opciones.usuario ?? null,
    buscarRefresco: async () => opciones.sesion ?? null,
    crearRefresco: async (d) => void creados.push({ usuarioId: d.usuarioId, expiraEn: d.expiraEn }),
    revocarRefresco: async (id) => void revocados.push(id),
    revocarTodosDe: async (id) => void revocadosTodos.push(id),
  };

  const seguridad: SeguridadPort = {
    verificarPassword: async (hash, password) => {
      verificados.push(hash);
      return hash === HASH_VALIDO && password === 'correcta';
    },
    emitirAccessToken: async (c) => `access-de-${c.sub}`,
    generarRefreshToken: () => 'refresh-nuevo',
    hashearRefreshToken: (t) => `hash:${t}`,
    hashSenuelo: () => HASH_SENUELO,
  };

  const registro: RegistroDeSeguridad = {
    intentoFallido: (email) => void incidentes.push(`fallido:${email}`),
    reusoDeToken: (id) => void incidentes.push(`reuso:${id}`),
  };

  const caso = new IniciarSesion(usuarios, seguridad, registro, () => AHORA);
  return { caso, verificados, creados, revocados, revocadosTodos, incidentes };
}

describe('Login', () => {
  it('emite el par de tokens con las credenciales correctas', async () => {
    const { caso, creados } = montar({ usuario: usuario() });
    const r = await caso.ejecutar('director.isi@continental.edu.pe', 'correcta');

    expect(r.accessToken).toBe('access-de-u-1');
    expect(r.refreshToken).toBe('refresh-nuevo');
    expect(r.nombre).toBe('Director de ISI');
    expect(creados).toHaveLength(1);
  });

  it('normaliza el correo antes de buscarlo', async () => {
    // Sin esto, "Director@..." y "director@..." serían cuentas distintas.
    const { caso } = montar({ usuario: usuario() });
    await expect(caso.ejecutar('  DIRECTOR.ISI@CONTINENTAL.EDU.PE  ', 'correcta')).resolves.toBeDefined();
  });

  it('el refresco caduca a los 7 días', async () => {
    const { caso, creados } = montar({ usuario: usuario() });
    await caso.ejecutar('a@b.pe', 'correcta');
    const esperado = new Date(AHORA.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(creados[0]?.expiraEn).toEqual(esperado);
  });
});

describe('Login — no revela si el correo existe', () => {
  it('mismo mensaje con correo inexistente y con contraseña incorrecta', async () => {
    const sinUsuario = montar({ usuario: null });
    const conUsuario = montar({ usuario: usuario() });

    const mensajes = await Promise.all([
      sinUsuario.caso.ejecutar('nadie@continental.edu.pe', 'loquesea').catch((e: Error) => e.message),
      conUsuario.caso.ejecutar('director.isi@continental.edu.pe', 'mala').catch((e: Error) => e.message),
    ]);

    expect(mensajes[0]).toBe(mensajes[1]);
    expect(mensajes[0]).toBe('Correo o contraseña incorrectos.');
  });

  it('verifica contra un hash señuelo cuando el correo no existe', async () => {
    // Saltarse la verificación ahorraría milisegundos, y esa diferencia de
    // tiempo es exactamente lo que permite enumerar cuentas.
    const { caso, verificados } = montar({ usuario: null });
    await caso.ejecutar('nadie@continental.edu.pe', 'loquesea').catch(() => null);

    expect(verificados).toEqual([HASH_SENUELO]);
  });

  it('un usuario inactivo recibe el mismo mensaje', async () => {
    const { caso } = montar({ usuario: usuario({ activo: false }) });
    await expect(caso.ejecutar('a@b.pe', 'correcta')).rejects.toThrow(
      'Correo o contraseña incorrectos.',
    );
  });

  it('registra el intento fallido para poder detectar fuerza bruta', async () => {
    const { caso, incidentes } = montar({ usuario: null });
    await caso.ejecutar('nadie@continental.edu.pe', 'x').catch(() => null);
    expect(incidentes).toEqual(['fallido:nadie@continental.edu.pe']);
  });

  it('no emite ningún token cuando falla', async () => {
    const { caso, creados } = montar({ usuario: usuario() });
    await caso.ejecutar('a@b.pe', 'mala').catch(() => null);
    expect(creados).toHaveLength(0);
  });
});

describe('Refresco — rotación', () => {
  function sesion(sobre: Partial<SesionRefresco> = {}): SesionRefresco {
    return {
      id: 'rt-1',
      expiraEn: new Date('2026-08-27T12:00:00Z'),
      revocadoEn: null,
      usuario: { id: 'u-1', nombreCompleto: 'Director de ISI', activo: true },
      ...sobre,
    };
  }

  it('revoca el token usado y emite uno nuevo', async () => {
    const { caso, revocados, creados } = montar({ sesion: sesion() });
    const r = await caso.refrescar('refresh-viejo');

    expect(revocados).toEqual(['rt-1']);
    expect(creados).toHaveLength(1);
    expect(r.refreshToken).toBe('refresh-nuevo');
  });

  it('rechaza un token desconocido', async () => {
    const { caso } = montar({ sesion: null });
    await expect(caso.refrescar('inventado')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('rechaza un token expirado', async () => {
    const { caso } = montar({ sesion: sesion({ expiraEn: new Date('2026-08-01T00:00:00Z') }) });
    await expect(caso.refrescar('viejo')).rejects.toThrow(/expiró/);
  });

  it('rechaza si el usuario fue inactivado', async () => {
    // Inactivar a alguien debe cortarle la sesión, no solo impedirle entrar de
    // nuevo: si no, sigue operando hasta que su token caduque.
    const { caso } = montar({
      sesion: sesion({ usuario: { id: 'u-1', nombreCompleto: 'X', activo: false } }),
    });
    await expect(caso.refrescar('x')).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('Refresco — reuso de un token ya consumido', () => {
  const yaRevocado: SesionRefresco = {
    id: 'rt-1',
    expiraEn: new Date('2026-08-27T12:00:00Z'),
    revocadoEn: new Date('2026-08-20T11:00:00Z'),
    usuario: { id: 'u-1', nombreCompleto: 'Director de ISI', activo: true },
  };

  it('revoca TODA la sesión, no solo ese token', async () => {
    // El reuso significa que hay dos copias del token en circulación: o alguien
    // lo robó, o el legítimo se adelantó. Cortar todo y obligar a reautenticar
    // es la respuesta conservadora.
    const { caso, revocadosTodos } = montar({ sesion: yaRevocado });
    await caso.refrescar('robado').catch(() => null);

    expect(revocadosTodos).toEqual(['u-1']);
  });

  it('registra el incidente', async () => {
    const { caso, incidentes } = montar({ sesion: yaRevocado });
    await caso.refrescar('robado').catch(() => null);
    expect(incidentes).toEqual(['reuso:u-1']);
  });

  it('no emite tokens nuevos', async () => {
    const { caso, creados } = montar({ sesion: yaRevocado });
    await caso.refrescar('robado').catch(() => null);
    expect(creados).toHaveLength(0);
  });

  it('devuelve el mismo mensaje genérico que un token inválido', async () => {
    // Decirle al atacante "ese token ya se usó" le confirma que iba bien.
    const conReuso = montar({ sesion: yaRevocado });
    const sinSesion = montar({ sesion: null });

    const a = await conReuso.caso.refrescar('x').catch((e: Error) => e.message);
    const b = await sinSesion.caso.refrescar('y').catch((e: Error) => e.message);
    expect(a).toBe(b);
  });
});

describe('Cierre de sesión', () => {
  it('revoca todos los tokens del usuario', async () => {
    const { caso, revocadosTodos } = montar();
    await caso.cerrarSesion('u-1');
    expect(revocadosTodos).toEqual(['u-1']);
  });
});
