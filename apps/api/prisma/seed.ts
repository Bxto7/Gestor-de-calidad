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

// Prisma 7 ya no abre la conexion por su cuenta desde DATABASE_URL: exige un
// driver adapter explicito. El cargador de .env es el nativo de Node, igual
// que en prisma.config.ts, para no depender de `dotenv`.
if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('Falta DATABASE_URL.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/* ── Catálogo de permisos ─────────────────────────────────────────────────
 * Patrón `recurso.accion`, para que el `AuthorizationPort` resuelva con una
 * comparación de cadena y no recorriendo una jerarquía.
 */
const PERMISOS = [
  // Estructura base
  ['facultad.leer', 'Consultar facultades', 'plan-estudios'],
  ['facultad.crear', 'Registrar una facultad', 'plan-estudios'],
  ['facultad.editar', 'Editar una facultad', 'plan-estudios'],
  ['facultad.inactivar', 'Inactivar una facultad', 'plan-estudios'],

  ['carrera.leer', 'Consultar carreras', 'plan-estudios'],
  ['carrera.crear', 'Registrar una carrera', 'plan-estudios'],
  ['carrera.editar', 'Editar una carrera', 'plan-estudios'],
  ['carrera.inactivar', 'Inactivar una carrera', 'plan-estudios'],

  // Plan de estudios
  ['plan.leer', 'Consultar planes de estudio', 'plan-estudios'],
  ['plan.leer_historico', 'Consultar versiones históricas', 'plan-estudios'],
  ['plan.crear', 'Crear un plan de estudios', 'plan-estudios'],
  ['plan.editar', 'Editar un plan en Borrador o En revisión', 'plan-estudios'],
  ['plan.eliminar', 'Eliminar un plan en Borrador', 'plan-estudios'],
  ['plan.enviar_revision', 'Enviar un plan a revisión', 'plan-estudios'],
  ['plan.aprobar', 'Aprobar un plan de estudios', 'plan-estudios'],
  ['plan.observar', 'Devolver un plan con observaciones', 'plan-estudios'],
  ['plan.nueva_version', 'Generar una nueva versión del plan', 'plan-estudios'],
  ['plan.justificar', 'Justificar una observación no bloqueante', 'plan-estudios'],

  // Contenido curricular
  ['objetivo.leer', 'Consultar objetivos educacionales', 'plan-estudios'],
  ['objetivo.gestionar', 'Crear, editar e inactivar objetivos', 'plan-estudios'],
  ['competencia.leer', 'Consultar competencias', 'plan-estudios'],
  ['competencia.gestionar', 'Crear, editar e inactivar competencias', 'plan-estudios'],
  ['asignatura.leer', 'Consultar asignaturas', 'plan-estudios'],
  ['asignatura.gestionar', 'Crear, editar e inactivar asignaturas', 'plan-estudios'],
  ['malla.editar', 'Ubicar asignaturas en los ciclos', 'plan-estudios'],

  // Transversales
  ['reporte.generar', 'Generar PDF y Excel del plan', 'plan-estudios'],
  ['auditoria.leer', 'Consultar el histórico de cambios', 'auditoria'],
  ['usuario.gestionar', 'Administrar usuarios y sus roles', 'auth'],
  ['rol.gestionar', 'Administrar roles y permisos', 'auth'],
] as const satisfies readonly (readonly [string, string, string])[];

/* ── Roles ────────────────────────────────────────────────────────────────
 * Los cinco definidos por la universidad. La descripción es la textual, para
 * que el permiso concedido se pueda contrastar con la intención declarada.
 */
const ROLES: {
  codigo: string;
  nombre: string;
  descripcion: string;
  permisos: readonly string[];
}[] = [
  {
    codigo: 'ADMIN_SISTEMA',
    nombre: 'Administrador del sistema',
    descripcion: 'Gestión de la estructura base (facultades, carreras).',
    // Dueño de la estructura y de las cuentas. No aprueba planes: esa decisión
    // es académica y corresponde al Director de carrera.
    permisos: [
      'facultad.leer',
      'facultad.crear',
      'facultad.editar',
      'facultad.inactivar',
      'carrera.leer',
      'carrera.crear',
      'carrera.editar',
      'carrera.inactivar',
      'plan.leer',
      'plan.leer_historico',
      'auditoria.leer',
      'usuario.gestionar',
      'rol.gestionar',
    ],
  },
  {
    codigo: 'DIRECTOR_CARRERA',
    nombre: 'Director de carrera',
    descripcion: 'Gestión y aprobación del plan de estudios de su carrera.',
    // Único rol con `plan.aprobar`. RF086 RN1 pide permiso explícito de
    // aprobación, y la definición del rol lo limita a "su carrera": ese alcance
    // lo aporta la tabla `usuario_carrera`, no este listado.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.leer',
      'plan.leer_historico',
      'plan.crear',
      'plan.editar',
      'plan.eliminar',
      'plan.enviar_revision',
      'plan.aprobar',
      'plan.observar',
      'plan.nueva_version',
      'plan.justificar',
      'objetivo.leer',
      'objetivo.gestionar',
      'competencia.leer',
      'competencia.gestionar',
      'asignatura.leer',
      'asignatura.gestionar',
      'malla.editar',
      'reporte.generar',
      'auditoria.leer',
    ],
  },
  {
    codigo: 'COORDINADOR_ACADEMICO',
    nombre: 'Coordinador académico',
    descripcion: 'Apoyo en la gestión operativa del plan de estudios.',
    // Arma el plan y lo envía a revisión, pero NO lo aprueba ni lo observa:
    // quien construye no puede ser quien da el visto bueno. Esa separación es
    // lo que hace que la aprobación signifique algo en una auditoría.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.leer',
      'plan.leer_historico',
      'plan.crear',
      'plan.editar',
      'plan.enviar_revision',
      'plan.justificar',
      'objetivo.leer',
      'objetivo.gestionar',
      'competencia.leer',
      'competencia.gestionar',
      'asignatura.leer',
      'asignatura.gestionar',
      'malla.editar',
      'reporte.generar',
    ],
  },
  {
    codigo: 'DOCENTE',
    nombre: 'Docente',
    descripcion: 'Consulta de la información curricular relacionada a su labor.',
    // Solo lectura, pero con acceso al detalle curricular: necesita ver las
    // competencias de las asignaturas que dicta.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.leer',
      'objetivo.leer',
      'competencia.leer',
      'asignatura.leer',
      'reporte.generar',
    ],
  },
  {
    codigo: 'USUARIO_CONSULTOR',
    nombre: 'Usuario consultor',
    descripcion: 'Consulta de planes de estudio vigentes.',
    // El más restringido: solo planes vigentes. Sin `plan.leer_historico`,
    // porque su definición dice "vigentes" y no "todos".
    permisos: ['facultad.leer', 'carrera.leer', 'plan.leer'],
  },
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

  console.log('\nListo. No se creó ningún usuario: el primer administrador se');
  console.log('registra con un comando explícito, nunca por semilla (§6.5).');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
