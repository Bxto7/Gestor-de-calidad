/**
 * Carga el plan de estudios 201910 de Ingeniería de Sistemas e Informática.
 *
 *   npx tsx scripts/cargar-plan-isi-2018.ts
 *
 * ── Por qué escribe en la base y no llama a la API ────────────────────────
 *
 * RF053 y RF041 dicen que los códigos de asignatura y competencia los genera el
 * sistema y no son editables: `ISI-101`, `CPE-01`… Es la regla correcta para dar
 * de alta un curso nuevo desde la aplicación. Pero esto no es un alta: es la
 * carga de un plan que ya existe, con los códigos institucionales reales
 * —`ASUC01113`, `CPE-ISI07`— que aparecen en el récord de cada estudiante y en
 * los expedientes de acreditación. Perderlos para que el sistema invente unos
 * suyos haría el dato inservible.
 *
 * Una migración de datos históricos entra por debajo de la aplicación, igual
 * que el seed. Lo que sí se respeta es todo lo demás: la máquina de estados, la
 * unicidad, las claves foráneas y los triggers de inmutabilidad.
 *
 * ── Lo que NO carga, a propósito ──────────────────────────────────────────
 *
 * El PDF de origen es el récord académico de una persona: trae estado por
 * asignatura, notas y veces llevada. Nada de eso entra aquí. §6.5 prohíbe datos
 * personales fuera de producción, y además no son del plan: son de quien lo
 * cursó. Lo que se carga es el currículo, que es información institucional.
 *
 * Es idempotente: se puede volver a ejecutar y deja el mismo resultado.
 */

import { existsSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/platform/database/generated/client.js';
import {
  ASIGNATURAS,
  COMPETENCIAS,
  COMPETENCIAS_POR_ASIGNATURA,
  OBJETIVOS,
} from './datos/isi-2018.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) throw new Error('Falta DATABASE_URL. Copia .env.example a .env.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const FACULTAD = 'Ingeniería';
const CARRERA = { nombre: 'Ingeniería de Sistemas e Informática', codigo: 'ISI', anios: 5 };
const CODIGO_PLAN = 'PE-ISI-2018-v1';

/**
 * Identificador nulo para lo que no ejecuta una persona.
 *
 * Las tablas de evidencia guardan el identificador y también el nombre, y no
 * tienen clave foránea a usuarios: el histórico debe seguir siendo legible
 * aunque la cuenta desaparezca. Aquí no hay cuenta que apuntar, y poner la de
 * quien lanza el comando haría parecer que esa persona aprobó el plan.
 */
const USUARIO_DE_CARGA = '00000000-0000-0000-0000-000000000000';

/**
 * El plan no trae horas teóricas ni sumillas, y el esquema las exige.
 *
 * Se cargan en cero y con un texto que dice que faltan, en vez de inventar
 * valores plausibles: un 3 puesto a ojo es indistinguible de un dato real y
 * nadie volvería a revisarlo. Un cero y un "pendiente" se ven.
 */
const HORAS_DESCONOCIDAS = 0;
const SUMILLA_PENDIENTE = 'Sumilla pendiente de cargar desde el sílabo oficial de la asignatura.';

async function main(): Promise<void> {
  const resumen: string[] = [];

  /* ── Estructura académica ──────────────────────────────────────────── */

  const facultad =
    (await prisma.facultad.findFirst({ where: { nombre: FACULTAD } })) ??
    (await prisma.facultad.create({ data: { nombre: FACULTAD } }));

  const carrera =
    (await prisma.carrera.findFirst({ where: { codigo: CARRERA.codigo } })) ??
    (await prisma.carrera.create({
      data: {
        facultadId: facultad.id,
        nombre: CARRERA.nombre,
        codigo: CARRERA.codigo,
        duracionAnios: CARRERA.anios,
      },
    }));

  // RF011: dos ciclos por año. Se crean los que falten, sin tocar los que ya
  // estén, para no romper las asignaturas ya ubicadas.
  const totalCiclos = CARRERA.anios * 2;
  const existentes = new Set(
    (
      await prisma.ciclo.findMany({ where: { carreraId: carrera.id }, select: { numero: true } })
    ).map((c) => c.numero),
  );
  const faltantes = Array.from({ length: totalCiclos }, (_, i) => i + 1).filter(
    (n) => !existentes.has(n),
  );
  if (faltantes.length > 0) {
    await prisma.ciclo.createMany({
      data: faltantes.map((numero) => ({ carreraId: carrera.id, numero })),
    });
  }
  const ciclos = new Map(
    (await prisma.ciclo.findMany({ where: { carreraId: carrera.id } })).map((c) => [
      c.numero,
      c.id,
    ]),
  );
  resumen.push(`${totalCiclos} ciclos`);

  /* ── Catálogo institucional ────────────────────────────────────────── */

  const competencias = new Map<string, string>();
  for (const c of COMPETENCIAS) {
    const fila = await prisma.competencia.upsert({
      where: { codigo: c.codigo },
      create: { codigo: c.codigo, nombre: c.nombre },
      update: { nombre: c.nombre },
    });
    competencias.set(c.codigo, fila.id);
  }
  resumen.push(`${COMPETENCIAS.length} competencias`);

  const objetivos: string[] = [];
  for (const o of OBJETIVOS) {
    const fila = await prisma.objetivoEducacional.upsert({
      where: { codigo: o.codigo },
      create: { codigo: o.codigo, nombre: o.nombre, descripcion: o.descripcion },
      update: { nombre: o.nombre, descripcion: o.descripcion },
    });
    objetivos.push(fila.id);
  }
  resumen.push(`${OBJETIVOS.length} objetivos educacionales`);

  /* ── El plan ───────────────────────────────────────────────────────── */

  // Nace en Borrador aunque acabe en Histórico: el trigger de inmutabilidad
  // impide escribir sobre un plan ya archivado, así que primero se llena y al
  // final se archiva.
  let plan = await prisma.planEstudios.findUnique({ where: { codigo: CODIGO_PLAN } });
  if (plan?.estado === 'HISTORICO') {
    console.log(`El plan ${CODIGO_PLAN} ya está cargado y archivado. Nada que hacer.`);
    return;
  }
  plan ??= await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: CODIGO_PLAN,
      version: 1,
      estado: 'BORRADOR',
      duracionAnios: CARRERA.anios,
    },
  });

  await prisma.planObjetivo.deleteMany({ where: { planId: plan.id } });
  await prisma.planObjetivo.createMany({
    data: objetivos.map((objetivoId) => ({ planId: plan.id, objetivoId })),
  });

  await prisma.planCompetencia.deleteMany({ where: { planId: plan.id } });
  await prisma.planCompetencia.createMany({
    data: [...competencias.values()].map((competenciaId) => ({ planId: plan.id, competenciaId })),
  });

  /* ── Grupos de electivos ───────────────────────────────────────────── */

  // De cada grupo se lleva UNA asignatura. Sin esto, las dieciséis opciones
  // contarían como dieciséis cursos del plan y el total daría 249 créditos en
  // vez de los 210 que declara el plan oficial.
  const GRUPOS = [
    { codigo: 'ELEC GENER', nombre: 'Electivos generales', ciclo: 5 },
    { codigo: 'ELECT ESP1', nombre: 'Electivos de especialidad 1', ciclo: 9 },
    { codigo: 'ELECT ESP2', nombre: 'Electivos de especialidad 2', ciclo: 10 },
  ] as const;

  const grupos = new Map<string, string>();
  for (const g of GRUPOS) {
    const fila = await prisma.grupoElectivo.upsert({
      where: { planId_codigo: { planId: plan.id, codigo: g.codigo } },
      create: {
        planId: plan.id,
        codigo: g.codigo,
        nombre: g.nombre,
        cicloId: ciclos.get(g.ciclo)!,
        cantidadAElegir: 1,
      },
      update: { nombre: g.nombre, cicloId: ciclos.get(g.ciclo)!, cantidadAElegir: 1 },
    });
    grupos.set(g.codigo, fila.id);
  }
  resumen.push(`${GRUPOS.length} grupos de electivos (se elige 1 de cada uno)`);

  /* ── Asignaturas ───────────────────────────────────────────────────── */

  const porCodigo = new Map<string, string>();
  for (const [indice, a] of ASIGNATURAS.entries()) {
    const datos = {
      planId: plan.id,
      codigo: a.codigo,
      nombre: a.nombre,
      descripcion: SUMILLA_PENDIENTE,
      // El plan no clasifica en General/Transversal/Especialidad, solo en
      // obligatoria/electiva. Se marca todo como Especialidad salvo los
      // electivos generales, que sí son claramente transversales.
      tipo: a.grupoElectivo === 'ELEC GENER' ? ('TRANSVERSAL' as const) : ('ESPECIALIDAD' as const),
      condicion: a.electiva ? ('ELECTIVA' as const) : ('OBLIGATORIA' as const),
      creditos: a.creditos,
      horasTeoricas: HORAS_DESCONOCIDAS,
      cicloId: ciclos.get(a.ciclo)!,
      grupoElectivoId: a.grupoElectivo ? grupos.get(a.grupoElectivo)! : null,
      orden: indice,
    };

    const fila = await prisma.asignatura.upsert({
      where: { planId_codigo: { planId: plan.id, codigo: a.codigo } },
      create: datos,
      update: datos,
    });
    porCodigo.set(a.codigo, fila.id);
  }
  resumen.push(`${ASIGNATURAS.length} asignaturas`);

  /* ── Prerrequisitos ────────────────────────────────────────────────── */

  await prisma.dependencia.deleteMany({
    where: { asignatura: { planId: plan.id } },
  });

  const dependencias = ASIGNATURAS.flatMap((a) =>
    (a.prerrequisitos ?? []).map((requiere) => ({
      asignaturaId: porCodigo.get(a.codigo)!,
      requiereId: porCodigo.get(requiere)!,
      tipo: 'PRERREQUISITO' as const,
    })),
  );
  await prisma.dependencia.createMany({ data: dependencias });
  resumen.push(`${dependencias.length} prerrequisitos entre asignaturas`);

  /* ── Competencias por asignatura ───────────────────────────────────── */

  await prisma.asignaturaCompetencia.deleteMany({
    where: { asignatura: { planId: plan.id } },
  });

  const vinculos = Object.entries(COMPETENCIAS_POR_ASIGNATURA).flatMap(([codigo, cs]) =>
    cs.map((c) => ({
      asignaturaId: porCodigo.get(codigo)!,
      competenciaId: competencias.get(c)!,
    })),
  );
  await prisma.asignaturaCompetencia.createMany({ data: vinculos });
  resumen.push(`${vinculos.length} vínculos asignatura-competencia`);

  /* ── Procedencia y archivado ───────────────────────────────────────── */

  // Un plan en Histórico sin un solo evento de aprobación es un registro que se
  // contradice: dice haber recorrido el flujo y no tiene rastro de haberlo
  // hecho. En un sistema de acreditación eso es peor que no tener el plan.
  //
  // Pero este plan se aprobó en la universidad, hace años, en un proceso que
  // este sistema no presenció. No se sabe quién lo aprobó ni cuándo, y
  // rellenarlo con un nombre y una fecha plausibles sería fabricar evidencia de
  // acreditación, que es justo lo que este software existe para evitar.
  //
  // Así que se registra lo único que sí ocurrió aquí: que entró como plan ya
  // cerrado, y de dónde salió. Quien lea el historial verá que la aprobación es
  // anterior al sistema, en vez de creerse una que nadie firmó.
  await prisma.eventoAprobacion.deleteMany({ where: { planId: plan.id } });
  await prisma.eventoAprobacion.create({
    data: {
      planId: plan.id,
      accion: 'Cargado como histórico',
      comentario:
        'Plan aprobado y cerrado por la universidad antes de existir este sistema. Se carga ' +
        'desde el plan de estudios 201910 publicado, como registro histórico. El sistema no ' +
        'presenció su aprobación y por eso no consta quién la firmó ni en qué fecha.',
      // Sin usuario real: la carga no la ejecuta una persona del flujo de
      // aprobación. El nombre queda descriptivo porque es lo que se muestra, y
      // la tabla no tiene clave foránea a usuarios justamente para esto.
      usuarioId: USUARIO_DE_CARGA,
      usuarioNombre: 'Carga de datos institucionales',
    },
  });

  // La misma constancia en la bitácora general (§3.4): una carga de 74
  // asignaturas que no deja rastro convierte en mentira el "toda mutación
  // relevante queda registrada".
  await prisma.eventoAuditoria.create({
    data: {
      entidad: 'Plan',
      entidadId: plan.id,
      accion: 'plan.cargado',
      detalle:
        `Plan ${CODIGO_PLAN} cargado como histórico desde el plan oficial 201910: ` +
        `${ASIGNATURAS.length} asignaturas, ${COMPETENCIAS.length} competencias y ` +
        `${OBJETIVOS.length} objetivos educacionales.`,
      usuarioId: USUARIO_DE_CARGA,
      usuarioNombre: 'Carga de datos institucionales',
    },
  });

  // El 2018 es un plan cerrado: su sitio es Histórico. Se hace al final porque
  // a partir de aquí la base rechaza cualquier escritura sobre él.
  await prisma.planEstudios.update({
    where: { id: plan.id },
    data: { estado: 'HISTORICO' },
  });

  /* ── Informe ───────────────────────────────────────────────────────── */

  const obligatorias = ASIGNATURAS.filter((a) => !a.electiva);
  const creditosObligatorios = obligatorias.reduce((s, a) => s + a.creditos, 0);
  const sinModelar = ASIGNATURAS.filter((a) => a.requisitoNoModelable);

  console.log(`\nPlan ${CODIGO_PLAN} cargado y archivado como Histórico.\n`);
  for (const linea of resumen) console.log(`  · ${linea}`);

  // El plan son los obligatorios más UN electivo de cada grupo, no los dieciséis
  // que se ofrecen. Contarlos todos daba 249 créditos: un plan aparentemente un
  // 19 % más largo del que cursa nadie.
  const creditosElectivos = GRUPOS.reduce((suma, g) => {
    const opcion = ASIGNATURAS.find((a) => a.grupoElectivo === g.codigo);
    return suma + (opcion?.creditos ?? 0) * 1;
  }, 0);

  console.log(`\n  Créditos obligatorios: ${creditosObligatorios} (el plan oficial declara 201)`);
  console.log(`  Créditos electivos:    ${creditosElectivos} (uno de cada grupo)`);
  console.log(
    `  Total del plan:        ${creditosObligatorios + creditosElectivos} ` +
      '(el plan oficial declara 210)',
  );
  console.log(
    `  Obligatorias: ${obligatorias.length} · ` +
      `Opciones electivas ofrecidas: ${ASIGNATURAS.length - obligatorias.length}`,
  );

  console.log('\nLo que el modelo actual no puede representar:');
  console.log(
    `  · ${sinModelar.length} requisitos que no son una asignatura ("140 créditos aprobados",\n` +
      '    "certificado de inglés B1"). El grafo de dependencias solo enlaza asignaturas.',
  );
  console.log(
    '  · La correspondencia de cada competencia con su atributo del graduado\n' +
      '    ICACIT (AG-I01…AG-I11), que es justo la trazabilidad que pide una acreditación.',
  );
  console.log(
    `  · Horas teóricas (cargadas en ${HORAS_DESCONOCIDAS}) y sumillas: no están en la fuente.\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
