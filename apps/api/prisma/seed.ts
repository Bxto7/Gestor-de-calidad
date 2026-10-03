/**
 * Semilla de roles y permisos.
 *
 * §3.5 exige que los roles y sus permisos vivan **como datos y no como código**,
 * para que agregar un rol nuevo no requiera un despliegue. Por eso este archivo
 * solo carga el catálogo base; el resto se administra desde la aplicación.
 *
 * Es idempotente: se puede volver a ejecutar sin duplicar nada, y añade lo que
 * falte cuando el catálogo crezca.
 *
 * NO crea usuarios. §6.5 prohíbe datos reales de personas fuera de producción,
 * y sembrar un usuario con contraseña conocida sería peor: acabaría en el VPS.
 * El primer administrador se crea con un comando explícito, no por semilla.
 */

import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/platform/database/generated/client.js';
import { PERMISOS, ROLES } from '../src/modules/auth/domain/matriz-de-accesos.js';

// Prisma 7 ya no abre la conexion por su cuenta desde DATABASE_URL: exige un
// driver adapter explicito. El cargador de .env es el nativo de Node, igual
// que en prisma.config.ts, para no depender de `dotenv`.
if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('Falta DATABASE_URL.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log('Sembrando catálogo de permisos y roles…\n');

  for (const [codigo, descripcion, modulo] of PERMISOS) {
    await prisma.permiso.upsert({
      where: { codigo },
      update: { descripcion, modulo },
      create: { codigo, descripcion, modulo },
    });
  }
  console.log(`  permisos: ${PERMISOS.length}`);

  for (const rol of ROLES) {
    const registro = await prisma.rol.upsert({
      where: { codigo: rol.codigo },
      update: { nombre: rol.nombre, descripcion: rol.descripcion, esDelSistema: true },
      create: {
        codigo: rol.codigo,
        nombre: rol.nombre,
        descripcion: rol.descripcion,
        esDelSistema: true,
      },
    });

    const permisos = await prisma.permiso.findMany({
      where: { codigo: { in: [...rol.permisos] } },
      select: { id: true, codigo: true },
    });

    // Si un código del listado no existe, es un error tipográfico que dejaría
    // al rol sin ese permiso en silencio. Mejor detenerse.
    if (permisos.length !== rol.permisos.length) {
      const encontrados = new Set(permisos.map((p) => p.codigo));
      const faltantes = rol.permisos.filter((c) => !encontrados.has(c));
      throw new Error(
        `El rol ${rol.codigo} referencia permisos inexistentes: ${faltantes.join(', ')}`,
      );
    }

    // Se reemplaza el conjunto completo en vez de añadir: así, quitar un
    // permiso de este archivo lo quita también de la base.
    await prisma.rolPermiso.deleteMany({ where: { rolId: registro.id } });
    await prisma.rolPermiso.createMany({
      data: permisos.map((p) => ({ rolId: registro.id, permisoId: p.id })),
    });

    console.log(`  ${rol.codigo.padEnd(24)} ${String(permisos.length).padStart(2)} permisos`);
  }

  // Los atributos del graduado ya no se siembran aquí (Bloque 5): cada carrera
  // tiene los suyos. La migración copió los existentes a cada carrera; las
  // siembras de desarrollo y e2e usan `sembrarAtributosIcacit`.

  console.log('\nListo. No se creó ningún usuario: el primer administrador se');
  console.log('registra con un comando explícito, nunca por semilla (§6.5).');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
