import { describe, expect, it } from 'vitest';

import type { Actor, DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../ports/authorization.port.js';
import type {
  DatosUsuario,
  RepositorioGestionUsuariosPort,
} from '../ports/gestion-usuarios.port.js';
import type { SeguridadPort } from '../ports/sesion.port.js';
import { GestionarUsuarios } from './gestionar-usuarios.use-case.js';

const ADMIN: Actor = { id: 'admin-1', nombre: 'Ana Quispe' };
const OTRO = 'usuario-2';
const CARRERA = '11111111-1111-4111-8111-111111111111';

function usuario(sobre: Partial<DatosUsuario> = {}): DatosUsuario {
  return {
    id: OTRO,
    email: 'luis@sgc.local',
    nombreCompleto: 'Luis Ramos',
    activo: true,
    roles: [{ codigo: 'DOCENTE', nombre: 'Docente' }],
    carreraId: null,
    creadoEn: new Date('2026-01-01'),
    ultimaActividad: null,
    ...sobre,
  };
}

function montar(
  opciones: {
    existente?: DatosUsuario | null;
    emailDuplicado?: boolean;
    catalogoDeRoles?: Record<string, string[]>;
    administradoresActivos?: number;
    permitido?: boolean;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const hasheadas: string[] = [];
  const passwordsCambiadas: string[] = [];
  let guardado: DatosUsuario | null = null;

  const repo: RepositorioGestionUsuariosPort = {
    listar: async () => [usuario()],
    porId: async () => (opciones.existente === undefined ? usuario() : opciones.existente),
    existeEmail: async () => opciones.emailDuplicado ?? false,
    crear: async (d) => {
      guardado = usuario({
        email: d.email,
        nombreCompleto: d.nombreCompleto,
        roles: d.rolCodigos.map((codigo) => ({ codigo, nombre: codigo })),
        carreraId: d.carreraId,
      });
      return guardado;
    },
    actualizar: async (_id, d) => {
      guardado = usuario({
        nombreCompleto: d.nombreCompleto,
        roles: d.rolCodigos.map((codigo) => ({ codigo, nombre: codigo })),
        carreraId: d.carreraId,
      });
      return guardado;
    },
    cambiarEstado: async (_id, activo) => usuario({ activo }),
    cambiarPassword: async (_id, hash) => void passwordsCambiadas.push(hash),
    cuantosActivosConRol: async () => opciones.administradoresActivos ?? 2,
    roles: async () => [],
    permisos: async () => [],
    // Los permisos de cada rol, tal como los siembra `prisma/seed.ts`. Solo se
    // listan los que deciden si hace falta carrera; el resto no cambia nada.
    rolesConPermisos: async (codigos) => {
      const catalogo: Record<string, string[]> = opciones.catalogoDeRoles ?? {
        ADMIN_SISTEMA: ['usuario.gestionar', 'plan.leer'],
        DIRECTOR_CARRERA: ['plan.aprobar', 'plan.editar', 'malla.editar'],
        COORDINADOR_ACADEMICO: ['plan.editar', 'malla.editar', 'asignatura.gestionar'],
        DOCENTE: ['plan.leer', 'competencia.leer'],
        USUARIO_CONSULTOR: ['plan.leer'],
      };
      return codigos
        .filter((c) => c in catalogo)
        .map((codigo) => ({ codigo, permisos: catalogo[codigo] ?? [] }));
    },
  };

  const seguridad = {
    hashearPassword: async (p: string) => {
      hasheadas.push(p);
      return `hash-de-${p}`;
    },
  } as unknown as SeguridadPort;

  const autorizacion = {
    puede: async () => ({
      permitido: opciones.permitido ?? true,
      motivo: 'Falta el permiso usuario.gestionar.',
    }),
  } as unknown as AuthorizationPort;

  const caso = new GestionarUsuarios(
    repo,
    seguridad,
    autorizacion,
    { publicar: async (e) => void publicados.push(...e) },
    { generar: () => 'ContraseñaGenerada1' },
  );

  return {
    caso,
    publicados,
    hasheadas,
    passwordsCambiadas,
    guardadoRef: () => guardado,
  };
}

describe('crear una cuenta', () => {
  it('genera la contraseña y la devuelve una sola vez', async () => {
    // La elige el sistema, no el administrador: así no aparece «Temporal123»
    // ni nadie acaba conociendo la credencial de otro más de lo justo.
    const { caso, hasheadas } = montar();
    const r = await caso.crear(ADMIN, {
      email: 'nuevo@sgc.local',
      nombreCompleto: 'Nueva Persona',
      rolCodigos: ['DOCENTE'],
      carreraId: null,
    });

    expect(r.passwordTemporal).toBe('ContraseñaGenerada1');
    expect(hasheadas).toEqual(['ContraseñaGenerada1']);
  });

  it('normaliza el correo a minúsculas', async () => {
    // Sin esto, «Ana@uc.pe» y «ana@uc.pe» serían dos cuentas para el mismo
    // buzón y la comprobación de unicidad no lo vería.
    const { caso, guardadoRef } = montar();
    await caso.crear(ADMIN, {
      email: '  Ana.Quispe@Continental.EDU.PE ',
      nombreCompleto: 'Ana',
      rolCodigos: ['DOCENTE'],
      carreraId: null,
    });

    expect(guardadoRef()?.email).toBe('ana.quispe@continental.edu.pe');
  });

  it('rechaza un correo ya registrado', async () => {
    const { caso } = montar({ emailDuplicado: true });
    await expect(
      caso.crear(ADMIN, {
        email: 'luis@sgc.local',
        nombreCompleto: 'Otro Luis',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      }),
    ).rejects.toThrow(/Ya existe una cuenta/);
  });

  it('una cuenta sin rol no se crea', async () => {
    // Entraría y no podría hacer nada: solo genera un ticket de soporte.
    const { caso } = montar();
    await expect(
      caso.crear(ADMIN, {
        email: 'x@sgc.local',
        nombreCompleto: 'Sin Rol',
        rolCodigos: [],
        carreraId: null,
      }),
    ).rejects.toThrow(/al menos un rol/);
  });

  it('nombra los roles que no existen en vez de fallar en seco', async () => {
    const { caso } = montar();
    await expect(
      caso.crear(ADMIN, {
        email: 'x@sgc.local',
        nombreCompleto: 'X',
        rolCodigos: ['DOCENTE', 'INVENTADO'],
        carreraId: null,
      }),
    ).rejects.toThrow(/INVENTADO/);
  });

  it('exige el permiso de gestión', async () => {
    const { caso } = montar({ permitido: false });
    await expect(
      caso.crear(ADMIN, {
        email: 'x@sgc.local',
        nombreCompleto: 'X',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('la bitácora registra el alta con sus roles, nunca la contraseña', async () => {
    const { caso, publicados } = montar();
    await caso.crear(ADMIN, {
      email: 'nuevo@sgc.local',
      nombreCompleto: 'Nueva',
      rolCodigos: ['COORDINADOR_ACADEMICO'],
      carreraId: CARRERA,
    });

    expect(publicados[0]?.detalle).toContain('nuevo@sgc.local');
    expect(publicados[0]?.detalle).toContain('COORDINADOR_ACADEMICO');
    expect(publicados[0]?.detalle).not.toContain('ContraseñaGenerada1');
  });
});

describe('alcance por carrera', () => {
  it('un director sin carrera no se puede dar de alta', async () => {
    // `plan.aprobar` dice qué puede hacer, no sobre cuál. Sin carrera el
    // permiso no alcanza a ningún plan y el rol sería decorativo.
    const { caso } = montar();
    await expect(
      caso.crear(ADMIN, {
        email: 'dir@sgc.local',
        nombreCompleto: 'Directora',
        rolCodigos: ['DIRECTOR_CARRERA'],
        carreraId: null,
      }),
    ).rejects.toThrow(/acotados a una carrera/);
  });

  it('una carrera que ningún rol usa también se rechaza', async () => {
    // Guardarla dejaría un dato que nadie mantiene y que reaparece con efectos
    // el día que se le añada el rol.
    const { caso } = montar();
    await expect(
      caso.crear(ADMIN, {
        email: 'doc@sgc.local',
        nombreCompleto: 'Docente',
        rolCodigos: ['DOCENTE'],
        carreraId: CARRERA,
      }),
    ).rejects.toThrow(/Ninguno de los roles/);
  });

  it('director con carrera se acepta', async () => {
    const { caso, guardadoRef } = montar();
    await caso.crear(ADMIN, {
      email: 'dir@sgc.local',
      nombreCompleto: 'Directora',
      rolCodigos: ['DIRECTOR_CARRERA'],
      carreraId: CARRERA,
    });
    expect(guardadoRef()?.carreraId).toBe(CARRERA);
  });
});

describe('nadie se administra a sí mismo', () => {
  it('no puede editarse su propia cuenta', async () => {
    const { caso } = montar({ existente: usuario({ id: ADMIN.id }) });
    await expect(
      caso.editar(ADMIN, ADMIN.id, {
        nombreCompleto: 'Ana',
        rolCodigos: ['ADMIN_SISTEMA'],
        carreraId: null,
      }),
    ).rejects.toThrow(/tu propia cuenta/);
  });

  it('no puede desactivarse a sí mismo', async () => {
    // Quedaría sin acceso para revertirlo.
    const { caso } = montar({ existente: usuario({ id: ADMIN.id }) });
    await expect(caso.cambiarEstado(ADMIN, ADMIN.id, false)).rejects.toThrow(/tu propia cuenta/);
  });

  it('sí puede restablecerse la contraseña', async () => {
    // Aquí no hay riesgo de perder el acceso —la credencial se devuelve en el
    // acto— y es el camino natural si cree que la suya está comprometida.
    const { caso } = montar({ existente: usuario({ id: ADMIN.id }) });
    await expect(caso.restablecerPassword(ADMIN, ADMIN.id)).resolves.toBeTruthy();
  });
});

describe('siempre queda un administrador', () => {
  const soloAdmin = usuario({
    roles: [{ codigo: 'ADMIN_SISTEMA', nombre: 'Administrador' }],
  });

  it('no se le puede retirar el rol al último administrador activo', async () => {
    // Sin nadie con `usuario.gestionar` no hay forma de volver a concederlo
    // desde la aplicación: solo tocando la base de datos.
    const { caso } = montar({ existente: soloAdmin, administradoresActivos: 1 });
    await expect(
      caso.editar(ADMIN, OTRO, {
        nombreCompleto: 'Luis Ramos',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      }),
    ).rejects.toThrow(/única cuenta activa con el rol de administrador/);
  });

  it('tampoco se le puede desactivar', async () => {
    const { caso } = montar({ existente: soloAdmin, administradoresActivos: 1 });
    await expect(caso.cambiarEstado(ADMIN, OTRO, false)).rejects.toThrow(/única cuenta activa/);
  });

  it('con otro administrador activo, sí se permite', async () => {
    const { caso } = montar({ existente: soloAdmin, administradoresActivos: 2 });
    await expect(caso.cambiarEstado(ADMIN, OTRO, false)).resolves.toBeTruthy();
  });

  it('conservarle el rol no dispara la regla', async () => {
    const { caso } = montar({ existente: soloAdmin, administradoresActivos: 1 });
    await expect(
      caso.editar(ADMIN, OTRO, {
        nombreCompleto: 'Luis Ramos Actualizado',
        rolCodigos: ['ADMIN_SISTEMA', 'DOCENTE'],
        carreraId: null,
      }),
    ).resolves.toBeTruthy();
  });

  it('una cuenta ya inactiva no cuenta como el último administrador', async () => {
    // Ya no administraba nada: bloquear aquí impediría limpiar cuentas viejas
    // sin ningún beneficio.
    const { caso } = montar({
      existente: usuario({
        activo: false,
        roles: [{ codigo: 'ADMIN_SISTEMA', nombre: 'Administrador' }],
      }),
      administradoresActivos: 0,
    });
    await expect(
      caso.editar(ADMIN, OTRO, {
        nombreCompleto: 'Luis',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      }),
    ).resolves.toBeTruthy();
  });
});

describe('editar y restablecer', () => {
  it('404 al editar una cuenta que no existe', async () => {
    const { caso } = montar({ existente: null });
    await expect(
      caso.editar(ADMIN, OTRO, {
        nombreCompleto: 'X',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('la bitácora detalla qué cambió, no solo que se editó', async () => {
    const { caso, publicados } = montar({
      existente: usuario({ nombreCompleto: 'Luis Ramos' }),
    });
    await caso.editar(ADMIN, OTRO, {
      nombreCompleto: 'Luis Ramos Vega',
      rolCodigos: ['COORDINADOR_ACADEMICO'],
      carreraId: CARRERA,
    });

    expect(publicados[0]?.detalle).toContain('«Luis Ramos» → «Luis Ramos Vega»');
    expect(publicados[0]?.detalle).toContain('DOCENTE → COORDINADOR_ACADEMICO');
  });

  it('guardar sin cambios lo dice en vez de inventar uno', async () => {
    const { caso, publicados } = montar();
    await caso.editar(ADMIN, OTRO, {
      nombreCompleto: 'Luis Ramos',
      rolCodigos: ['DOCENTE'],
      carreraId: null,
    });
    expect(publicados[0]?.detalle).toContain('sin cambios');
  });

  it('restablecer deja constancia de que se cortaron las sesiones', async () => {
    // Si el usuario avisa de que «se le cerró la sesión sola», aquí está la
    // explicación.
    const { caso, publicados, passwordsCambiadas } = montar();
    const r = await caso.restablecerPassword(ADMIN, OTRO);

    expect(r.passwordTemporal).toBe('ContraseñaGenerada1');
    expect(passwordsCambiadas).toEqual(['hash-de-ContraseñaGenerada1']);
    expect(publicados[0]?.detalle).toContain('revocaron sus sesiones');
  });

  it('restablecer una cuenta inexistente da 404', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.restablecerPassword(ADMIN, OTRO)).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe('la contraseña generada por defecto', () => {
  it('es larga y no repite entre llamadas', async () => {
    // El generador real, no el doble: es el que acaba en producción.
    const repo = {
      existeEmail: async () => false,
      crear: async () => usuario(),
      rolesConPermisos: async (c: readonly string[]) =>
        c.map((codigo) => ({ codigo, permisos: ['plan.leer'] })),
    } as unknown as RepositorioGestionUsuariosPort;

    const caso = new GestionarUsuarios(
      repo,
      { hashearPassword: async (p: string) => p } as unknown as SeguridadPort,
      { puede: async () => ({ permitido: true, motivo: '' }) } as unknown as AuthorizationPort,
      { publicar: async () => undefined },
    );

    const generadas = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const r = await caso.crear(ADMIN, {
        email: `x${i}@sgc.local`,
        nombreCompleto: 'X',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      });
      expect(r.passwordTemporal).toHaveLength(18);
      generadas.add(r.passwordTemporal);
    }

    expect(generadas.size).toBe(20);
  });

  it('no usa caracteres que se confundan al dictarla', async () => {
    // 0/O y 1/l/I fuera: la credencial se transmite a mano o por teléfono.
    const repo = {
      existeEmail: async () => false,
      crear: async () => usuario(),
      rolesConPermisos: async (c: readonly string[]) =>
        c.map((codigo) => ({ codigo, permisos: ['plan.leer'] })),
    } as unknown as RepositorioGestionUsuariosPort;

    const caso = new GestionarUsuarios(
      repo,
      { hashearPassword: async (p: string) => p } as unknown as SeguridadPort,
      { puede: async () => ({ permitido: true, motivo: '' }) } as unknown as AuthorizationPort,
      { publicar: async () => undefined },
    );

    for (let i = 0; i < 30; i += 1) {
      const r = await caso.crear(ADMIN, {
        email: `y${i}@sgc.local`,
        nombreCompleto: 'Y',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      });
      expect(r.passwordTemporal).not.toMatch(/[0O1lI]/);
    }
  });
});

describe('el alcance se deriva de los permisos, no de una lista de roles', () => {
  it('un coordinador sin carrera tampoco se admite', async () => {
    // Fue un fallo real: la validación solo miraba DIRECTOR_CARRERA, pero un
    // coordinador tiene `plan.editar` y `malla.editar`, igual de acotados. La
    // cuenta se creaba, entraba y no podía tocar nada.
    const { caso } = montar();
    await expect(
      caso.crear(ADMIN, {
        email: 'coord@sgc.local',
        nombreCompleto: 'Coordinador',
        rolCodigos: ['COORDINADOR_ACADEMICO'],
        carreraId: null,
      }),
    ).rejects.toThrow(/acotados a una carrera/);
  });

  it('el mensaje nombra los permisos que lo exigen', async () => {
    const { caso } = montar();
    await expect(
      caso.crear(ADMIN, {
        email: 'coord@sgc.local',
        nombreCompleto: 'Coordinador',
        rolCodigos: ['COORDINADOR_ACADEMICO'],
        carreraId: null,
      }),
    ).rejects.toThrow(/malla\.editar/);
  });

  it('un administrador no necesita carrera: ninguno de sus permisos está acotado', async () => {
    const { caso } = montar();
    await expect(
      caso.crear(ADMIN, {
        email: 'admin2@sgc.local',
        nombreCompleto: 'Otro Admin',
        rolCodigos: ['ADMIN_SISTEMA'],
        carreraId: null,
      }),
    ).resolves.toBeTruthy();
  });

  it('si un rol cambia sus permisos, la regla cambia con él', async () => {
    // §3.5: los permisos de un rol son datos y se cambian sin desplegar. Con
    // una lista de «roles que exigen carrera» esto se quedaría desactualizado
    // en silencio.
    const { caso } = montar({ catalogoDeRoles: { DOCENTE: ['plan.editar'] } });
    await expect(
      caso.crear(ADMIN, {
        email: 'doc@sgc.local',
        nombreCompleto: 'Docente con más permisos',
        rolCodigos: ['DOCENTE'],
        carreraId: null,
      }),
    ).rejects.toThrow(/acotados a una carrera/);
  });
});
