/**
 * Alta de usuarios desde la línea de comandos.
 *
 * Existe porque el seed no crea ninguno y lo dice explícitamente: una cuenta
 * sembrada con contraseña conocida acabaría en el VPS, y §6.5 no lo admite. El
 * primer administrador entra por aquí, a mano, en el despliegue.
 *
 * La contraseña **no** se pasa como argumento. Los argumentos quedan en el
 * historial del shell y son visibles en la lista de procesos de la máquina; se
 * lee de la variable de entorno `SGC_PASSWORD`, o de la entrada estándar si no
 * está definida.
 *
 *   SGC_PASSWORD='...' npx tsx scripts/crear-usuario.ts \
 *     --email director@continental.edu.pe \
 *     --nombre "Nombre Apellido" \
 *     --rol DIRECTOR_CARRERA \
 *     --carrera ISI
 *
 * Es idempotente sobre el correo: si el usuario ya existe, actualiza su
 * contraseña y sus asignaciones en vez de fallar.
 */

import { createInterface } from 'node:readline/promises';

import * as argon2 from 'argon2';

import { PrismaClient } from '../src/platform/database/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

/** Roles acotados a una carrera: §3.5 y la regla confirmada de dirección única. */
const ROLES_CON_CARRERA = new Set(['DIRECTOR_CARRERA', 'COORDINADOR_ACADEMICO', 'DOCENTE']);

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function leerPassword(): Promise<string> {
  const deEntorno = process.env['SGC_PASSWORD'];
  if (deEntorno) return deEntorno;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question('Contraseña: ')).trim();
  } finally {
    rl.close();
  }
}

/**
 * Mismos parámetros que `Seguridad.hashearPassword` (recomendación de OWASP
 * para argon2id). Si allí cambian, aquí también: un hash generado con otro
 * coste sigue verificándose, pero conviene que las cuentas nazcan iguales.
 */
function hashear(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function main(): Promise<void> {
  const email = argumento('email')?.trim().toLowerCase();
  const nombre = argumento('nombre')?.trim();
  const rol = argumento('rol')?.trim().toUpperCase();
  const carrera = argumento('carrera')?.trim().toUpperCase();

  if (!email || !nombre || !rol) {
    throw new Error(
      'Faltan datos. Uso:\n' +
        '  npx tsx scripts/crear-usuario.ts --email <correo> --nombre "<nombre>" ' +
        '--rol <CODIGO_ROL> [--carrera <CODIGO_CARRERA>]',
    );
  }

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('Falta DATABASE_URL.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const rolFila = await prisma.rol.findUnique({ where: { codigo: rol } });
    if (!rolFila) {
      const existentes = await prisma.rol.findMany({ select: { codigo: true } });
      throw new Error(
        `No existe el rol ${rol}. Disponibles: ${existentes.map((r) => r.codigo).join(', ')}. ` +
          '¿Se ejecutó el seed?',
      );
    }

    if (ROLES_CON_CARRERA.has(rol) && !carrera) {
      throw new Error(`El rol ${rol} trabaja sobre una carrera concreta: indica --carrera.`);
    }

    const carreraFila = carrera
      ? await prisma.carrera.findFirst({ where: { codigo: carrera } })
      : null;
    if (carrera && !carreraFila) throw new Error(`No existe la carrera ${carrera}.`);

    const password = await leerPassword();
    // No se valida la fortaleza aquí: quien ejecuta este comando tiene acceso a
    // la base de todos modos. Lo que sí se impide es una contraseña vacía.
    if (!password) throw new Error('La contraseña no puede estar vacía.');

    const passwordHash = await hashear(password);

    const usuario = await prisma.usuario.upsert({
      where: { email },
      create: { email, nombreCompleto: nombre, passwordHash },
      update: { nombreCompleto: nombre, passwordHash, estado: 'ACTIVO' },
    });

    await prisma.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rolFila.id } },
      create: { usuarioId: usuario.id, rolId: rolFila.id },
      update: {},
    });

    if (carreraFila) {
      // Un usuario dirige una sola carrera: el upsert por `usuarioId` reasigna
      // en vez de acumular. La restricción está también en la base.
      await prisma.usuarioCarrera.upsert({
        where: { usuarioId: usuario.id },
        create: { usuarioId: usuario.id, carreraId: carreraFila.id },
        update: { carreraId: carreraFila.id },
      });
    }

    console.log(`Usuario ${email} listo con rol ${rol}${carrera ? ` sobre ${carrera}` : ''}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
