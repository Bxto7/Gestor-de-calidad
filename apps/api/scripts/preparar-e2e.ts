/**
 * Prepara los datos que necesita la suite E2E.
 *
 *   npx tsx scripts/preparar-e2e.ts
 *
 * Crea una carrera propia con código `E2E` y su plan de estudios VIGENTE. No
 * reutiliza ISI por dos razones: `cargar-plan-isi-2018.ts` deja su plan en
 * HISTORICO —que RF-PM-001 RN2 no admite como base de un plan de medición— y
 * colgar las pruebas de datos institucionales reales las ataría a algo que
 * existe para otro fin. El día que alguien recargue el plan de ISI, la suite se
 * rompería sin que nada estuviera mal.
 *
 * El plan nace VIGENTE de un `upsert` y no recorriendo la aprobación por la
 * aplicación, porque esa es la máquina de estados de Plan de Estudios y probarla
 * es otra suite. Aquí el plan Vigente es el punto de partida, no lo que se
 * prueba.
 *
 * Es idempotente, y además **reinicia** los planes de medición de esta carrera:
 * la suite crea uno en cada ejecución y sin esto el correlativo de versión
 * crecería sin fin entre corridas locales.
 */

import { existsSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/platform/database/generated/client.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('Falta DATABASE_URL.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Códigos propios: `Competencia.codigo` es único en toda la base, no por plan. */
const COMPETENCIAS = [
  { codigo: 'CPE-E2E01', nombre: 'Análisis de problemas de prueba', atributo: 'AG-I08' },
  { codigo: 'CPE-E2E02', nombre: 'Diseño de soluciones de prueba', atributo: 'AG-I09' },
  { codigo: 'CPE-E2E03', nombre: 'Comunicación de prueba', atributo: 'AG-I04' },
  { codigo: 'CPE-E2E04', nombre: 'Ética de prueba', atributo: 'AG-I02' },
];

async function main(): Promise<void> {
  const facultad = await prisma.facultad.upsert({
    where: { nombre: 'Facultad de Pruebas' },
    update: {},
    create: { nombre: 'Facultad de Pruebas' },
  });

  const carrera = await prisma.carrera.upsert({
    where: { codigo: 'E2E' },
    update: { facultadId: facultad.id },
    create: {
      facultadId: facultad.id,
      codigo: 'E2E',
      nombre: 'Carrera de Pruebas Automatizadas',
      // Dos años y no cinco: RF-PM-016 propone dos periodos por año, así que
      // esto da cuatro. RF-PM-017 exige fecha de cierre en TODOS antes de
      // aprobar, y con diez la prueba pasaría más tiempo rellenando fechas que
      // ejercitando la matriz. Cuatro bastan para tener un primero, un último y
      // algo en medio.
      duracionAnios: 2,
    },
  });

  // Los planes de medición de esta carrera se borran en cada preparación: la
  // suite crea uno por ejecución y el correlativo de versión no debe arrastrar
  // el histórico de corridas anteriores.
  const planesPrevios = await prisma.planEstudios.findMany({
    where: { carreraId: carrera.id },
    select: { id: true },
  });
  if (planesPrevios.length > 0) {
    const medicionesPrevias = await prisma.planMedicion.findMany({
      where: { planEstudiosId: { in: planesPrevios.map((p) => p.id) } },
      select: { id: true },
    });

    if (medicionesPrevias.length > 0) {
      // `PlanEvaluacion.plan` es `onDelete: Restrict` a propósito (ver el
      // comentario junto al modelo en `schema.prisma`): sin este borrado
      // explícito primero, `planMedicion.deleteMany` de abajo revienta con una
      // violación de clave foránea en cuanto la suite E2E ha creado al menos
      // un plan de evaluación sobre uno de estos planes de medición —es decir,
      // desde la segunda ejecución en adelante.
      await prisma.planEvaluacion.deleteMany({
        where: { planMedicionId: { in: medicionesPrevias.map((m) => m.id) } },
      });
    }

    await prisma.planMedicion.deleteMany({
      where: { planEstudiosId: { in: planesPrevios.map((p) => p.id) } },
    });
  }

  const plan = await prisma.planEstudios.upsert({
    where: { codigo: 'PE-E2E-v1' },
    update: { estado: 'VIGENTE' },
    create: {
      carreraId: carrera.id,
      codigo: 'PE-E2E-v1',
      version: 1,
      estado: 'VIGENTE',
      // El mismo dos de la carrera: de aquí sale la propuesta de periodos.
      duracionAnios: 2,
      fechaVigencia: new Date('2026-01-01'),
    },
  });

  const atributos = new Map(
    (await prisma.atributoGraduado.findMany({ where: { marco: 'ICACIT' } })).map((a) => [
      a.codigo,
      a.id,
    ]),
  );

  for (const c of COMPETENCIAS) {
    const atributoId = atributos.get(c.atributo);
    if (!atributoId) {
      throw new Error(
        `El atributo ${c.atributo} no existe. Ejecuta antes \`npx tsx prisma/seed.ts\`.`,
      );
    }

    const fila = await prisma.competencia.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre, estado: 'ACTIVO' },
      create: { codigo: c.codigo, nombre: c.nombre },
    });

    // El upsert no puede reemplazar el conjunto de atributos en un solo paso.
    await prisma.competenciaAtributo.deleteMany({ where: { competenciaId: fila.id } });
    await prisma.competenciaAtributo.create({
      data: { competenciaId: fila.id, atributoId },
    });

    await prisma.planCompetencia.upsert({
      where: { planId_competenciaId: { planId: plan.id, competenciaId: fila.id } },
      update: {},
      create: { planId: plan.id, competenciaId: fila.id },
    });
  }

  await planDeMedicionVigente(plan.id);

  console.log(
    `Carrera E2E lista: plan ${plan.codigo} VIGENTE con ${COMPETENCIAS.length} competencias, ` +
      'y un plan de medición vigente de partida.',
  );
}

/**
 * Un plan de medición ya VIGENTE, como punto de partida.
 *
 * Lo necesita el recorrido de RF-PM-030, que solo versiona planes cerrados. Sin
 * él esa prueba se salta siempre —incluso en CI— y una prueba que nunca corre no
 * protege nada.
 *
 * Nace vigente de un `create` y no recorriendo la máquina de estados, por lo
 * mismo que el plan de estudios de arriba: llegar hasta Vigente es lo que prueba
 * `flujo-medicion`, no esto. Aquí es el punto de partida.
 */
async function planDeMedicionVigente(planEstudiosId: string): Promise<void> {
  const codigo = 'PM-PE-E2E-v1-D-v1';

  const existente = await prisma.planMedicion.findUnique({ where: { codigo } });
  if (existente) return;

  const competencias = await prisma.competencia.findMany({
    where: { codigo: { in: COMPETENCIAS.map((c) => c.codigo) } },
    select: { id: true },
  });

  const creado = await prisma.planMedicion.create({
    data: {
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo,
      version: 1,
      meta: 0.7,
      estado: 'VIGENTE',
      periodoInicioAnio: 2026,
      periodoInicioMitad: 1,
    },
  });

  await prisma.competenciaDelPlan.createMany({
    data: competencias.slice(0, 2).map((c) => ({
      planMedicionId: creado.id,
      competenciaId: c.id,
    })),
  });

  await prisma.periodoMedicion.createMany({
    data: [
      {
        planMedicionId: creado.id,
        etiqueta: '2026-I',
        orden: 1,
        fechaCierre: new Date('2026-07-15'),
      },
      {
        planMedicionId: creado.id,
        etiqueta: '2026-II',
        orden: 2,
        fechaCierre: new Date('2026-12-18'),
      },
    ],
  });
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
