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

/** Marco de acreditación vigente. §1 anticipa otros; hoy solo se siembra este. */
const MARCO = 'ICACIT';

/**
 * Los once atributos del graduado que exige ICACIT (CLAUDE.md §6.2).
 *
 * Van en la semilla y no en una carga de datos porque no pertenecen a ninguna
 * universidad ni a ningún plan: son el estándar contra el que se acredita, igual
 * que los roles y permisos son el andamiaje del sistema.
 *
 * Que estén los once —incluidos los que ninguna competencia cubra todavía— es
 * el requisito del que depende poder responder "¿qué atributo se nos quedó sin
 * cubrir?". Guardar el atributo como texto dentro de cada competencia diría qué
 * está mapeado y jamás qué falta, porque lo que falta no estaría escrito en
 * ninguna parte.
 */
const ATRIBUTOS_ICACIT: { codigo: string; nombre: string }[] = [
  { codigo: 'AG-I01', nombre: 'El Profesional y el Mundo' },
  { codigo: 'AG-I02', nombre: 'Ética' },
  { codigo: 'AG-I03', nombre: 'Trabajo Individual y en Equipo' },
  { codigo: 'AG-I04', nombre: 'Comunicación' },
  { codigo: 'AG-I05', nombre: 'Gestión de Proyectos' },
  { codigo: 'AG-I06', nombre: 'Aprendizaje a lo largo de la vida' },
  { codigo: 'AG-I07', nombre: 'Conocimientos de Ingeniería' },
  { codigo: 'AG-I08', nombre: 'Análisis de Problema' },
  { codigo: 'AG-I09', nombre: 'Diseño y Desarrollo de Soluciones' },
  { codigo: 'AG-I10', nombre: 'Indagación' },
  { codigo: 'AG-I11', nombre: 'Uso de Herramientas' },
];

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

  for (const [indice, a] of ATRIBUTOS_ICACIT.entries()) {
    await prisma.atributoGraduado.upsert({
      where: { marco_codigo: { marco: MARCO, codigo: a.codigo } },
      create: { marco: MARCO, codigo: a.codigo, nombre: a.nombre, orden: indice + 1 },
      update: { nombre: a.nombre, orden: indice + 1 },
    });
  }
  console.log(`\n  atributos del graduado (${MARCO}): ${ATRIBUTOS_ICACIT.length}`);

  console.log('\nListo. No se creó ningún usuario: el primer administrador se');
  console.log('registra con un comando explícito, nunca por semilla (§6.5).');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
