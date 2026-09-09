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
  ['atributo.leer', 'Consultar atributos del graduado', 'plan-estudios'],
  ['atributo.gestionar', 'Crear, editar e inactivar atributos del graduado', 'plan-estudios'],
  ['criterio.leer', 'Consultar criterios de acreditación', 'plan-estudios'],
  ['criterio.gestionar', 'Crear, editar e inactivar criterios de acreditación', 'plan-estudios'],
  ['asignatura.leer', 'Consultar asignaturas', 'plan-estudios'],
  ['asignatura.gestionar', 'Crear, editar e inactivar asignaturas', 'plan-estudios'],
  ['malla.editar', 'Ubicar asignaturas en los ciclos', 'plan-estudios'],

  // Mejora continua — Planes de Medición
  ['medicion.leer', 'Consultar planes de medición', 'mejora-continua'],
  ['medicion.crear', 'Crear un plan de medición', 'mejora-continua'],
  ['medicion.editar', 'Editar un plan de medición en Borrador', 'mejora-continua'],
  ['medicion.eliminar', 'Eliminar un plan de medición en Borrador', 'mejora-continua'],
  ['medicion.aprobar', 'Aprobar, observar y dar vigencia a un plan de medición', 'mejora-continua'],

  // Mejora continua — Planes de Evaluación
  ['evaluacion.leer', 'Consultar planes de evaluación', 'mejora-continua'],
  ['evaluacion.crear', 'Crear un plan de evaluación', 'mejora-continua'],
  ['evaluacion.editar', 'Editar un plan de evaluación en Borrador', 'mejora-continua'],
  ['evaluacion.eliminar', 'Eliminar un plan de evaluación en Borrador', 'mejora-continua'],
  [
    'evaluacion.aprobar',
    'Aprobar, observar y dar vigencia a un plan de evaluación',
    'mejora-continua',
  ],

  // Mejora continua — Planes de Mejora
  ['mejora.leer', 'Consultar planes de mejora', 'mejora-continua'],
  ['mejora.crear', 'Crear un plan de mejora', 'mejora-continua'],
  ['mejora.editar', 'Editar un plan de mejora en Borrador', 'mejora-continua'],
  ['mejora.eliminar', 'Eliminar un plan de mejora en Borrador', 'mejora-continua'],
  ['mejora.aprobar', 'Aprobar, observar y dar vigencia a un plan de mejora', 'mejora-continua'],

  // Transversales
  ['reporte.generar', 'Generar PDF y Excel del plan', 'plan-estudios'],
  ['auditoria.leer', 'Consultar el histórico de cambios', 'auditoria'],
  ['auditoria.leer_entidad', 'Consultar el historial de una entidad concreta', 'auditoria'],
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
    // Dueño de la estructura y de las cuentas. **Lee todo, no decide nada
    // académico**: esa separación es la que define el rol.
    //
    // Los tres `.leer` de contenido curricular estaban fuera y se añadieron
    // después de comprobar el resultado: con `plan.leer` pero sin
    // `asignatura.leer`, el administrador abría un plan y encontraba la mitad
    // vacía —sin créditos, sin malla, sin validaciones— sobre un plan que sí
    // existe. Puede administrar cuentas y estructura de una universidad cuyo
    // contenido no podía consultar.
    //
    // Lo que sigue fuera, y a propósito: no crea ni edita contenido, no aprueba
    // planes y **no tiene `reporte.generar`**. Ese permiso no es de lectura:
    // produce evidencia documental que sale de la universidad hacia un
    // expediente de acreditación, y eso es una responsabilidad académica.
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
      'objetivo.leer',
      'competencia.leer',
      'atributo.leer',
      'criterio.leer',
      'asignatura.leer',
      // Solo lectura, como con el resto del contenido académico: decidir qué se
      // mide y aprobarlo es una responsabilidad académica, no de administración.
      'medicion.leer',
      'evaluacion.leer',
      'mejora.leer',
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
      // RF120 y RF129 nombran al Director como quien registra atributos del
      // graduado y criterios de acreditación de su carrera.
      'atributo.leer',
      'atributo.gestionar',
      'criterio.leer',
      'criterio.gestionar',
      'asignatura.leer',
      'asignatura.gestionar',
      'malla.editar',
      // RF-PM-006 le reserva la aprobación: «el Coordinador académico envía a
      // revisión, y el Director de carrera aprueba, rechaza u observa».
      'medicion.leer',
      'medicion.crear',
      'medicion.editar',
      'medicion.eliminar',
      'medicion.aprobar',
      // RF-PE-046: la misma separación que en medición. Quien construye no da
      // el visto bueno, pero el Director sí hace ambas cosas.
      'evaluacion.leer',
      'evaluacion.crear',
      'evaluacion.editar',
      'evaluacion.eliminar',
      'evaluacion.aprobar',
      // RF-PJ-044: misma separación que medición y evaluación. Quien
      // construye no da el visto bueno, pero el Director sí hace ambas cosas.
      'mejora.leer',
      'mejora.crear',
      'mejora.editar',
      'mejora.eliminar',
      'mejora.aprobar',
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
      // RF120 y RF129 listan al Coordinador junto al Director como actor de
      // registro y edición; lo que no tiene, aquí como en el plan, es aprobar.
      'atributo.leer',
      'atributo.gestionar',
      'criterio.leer',
      'criterio.gestionar',
      'asignatura.leer',
      'asignatura.gestionar',
      'malla.editar',
      // Configura y envía a revisión, pero no aprueba: la misma separación que
      // ya lo deja fuera de `plan.aprobar`. Quien construye no da el visto bueno.
      'medicion.leer',
      'medicion.crear',
      'medicion.editar',
      'medicion.eliminar',
      // Igual que en medición y por la misma razón (RF-PE-046): sin
      // `evaluacion.aprobar`.
      'evaluacion.leer',
      'evaluacion.crear',
      'evaluacion.editar',
      'evaluacion.eliminar',
      // Misma separación otra vez (RF-PJ-044): arma y edita, no aprueba.
      'mejora.leer',
      'mejora.crear',
      'mejora.editar',
      'mejora.eliminar',
      // Solo el historial de una entidad concreta, no la bitácora entera: quien
      // edita un plan tiene que poder ver qué se hizo sobre él (RF-PM-032), y
      // eso no exige darle acceso a los accesos de todos ni a los demás módulos.
      'auditoria.leer_entidad',
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
      // RF122 y RF131 incluyen al consultor entre quienes visualizan; el docente
      // ya ve el detalle curricular, y el atributo es parte de él.
      'atributo.leer',
      'criterio.leer',
      'asignatura.leer',
      // Ve en qué periodos se mide la competencia de la asignatura que dicta.
      'medicion.leer',
      'evaluacion.leer',
      'mejora.leer',
      'reporte.generar',
    ],
  },
  {
    codigo: 'USUARIO_CONSULTOR',
    nombre: 'Usuario consultor',
    descripcion: 'Consulta de planes de estudio vigentes.',
    // El más restringido: solo planes vigentes. Sin `plan.leer_historico`,
    // porque su definición dice "vigentes" y no "todos".
    // RF122 y RF131 lo nombran entre quienes visualizan atributos y criterios:
    // ambos listados llevan indicador de estado y son solo de lectura.
    permisos: [
      'facultad.leer',
      'carrera.leer',
      'plan.leer',
      'atributo.leer',
      'criterio.leer',
      'medicion.leer',
      'evaluacion.leer',
      'mejora.leer',
    ],
  },
];

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
