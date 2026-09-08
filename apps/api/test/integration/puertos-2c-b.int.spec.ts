/**
 * Los dos puertos que 2c-B amplía, contra la base real.
 *
 * Se prueban aquí y no con dobles porque lo que puede fallar es la consulta:
 * que el filtro por plan de estudios no filtre, que el rol no case, o que un
 * usuario inactivo se cuele en una lista de candidatos.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DirectorioDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/directorio-usuarios.adapter.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const curricular = new ContenidoCurricularAdapter(prisma);
const directorio = new DirectorioDeUsuariosAdapter(prisma);

let carreraId: string;
let planEstudiosId: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE plan_estudios.asignaturas, plan_estudios.ciclos, plan_estudios.planes_estudio,
             plan_estudios.carreras, plan_estudios.facultades
    RESTART IDENTITY CASCADE`);
  // No está en el beforeEach que copia el pliego (plan-evaluacion.int.spec.ts
  // no toca usuarios), pero RF-PE-018 sí crea usuarios con email fijo en cada
  // test: sin vaciar la tabla, el segundo test vería al "Ana Docente" del
  // primero y "los inactivos no salen" fallaría por datos ajenos, no por el
  // comportamiento que prueba.
  await prisma.$executeRawUnsafe(`TRUNCATE auth.usuarios RESTART IDENTITY CASCADE`);

  const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  const carrera = await prisma.carrera.create({
    data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
  });
  const pe = await prisma.planEstudios.create({
    data: {
      carreraId: carrera.id,
      codigo: 'PE-ISI-2026-v1',
      version: 1,
      estado: 'VIGENTE',
      duracionAnios: 5,
    },
  });
  carreraId = carrera.id;
  planEstudiosId = pe.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearAsignatura(
  planId: string,
  codigo: string,
  nombre: string,
  cicloId: string | null = null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  return prisma.asignatura.create({
    data: {
      planId,
      codigo,
      nombre,
      descripcion: 'Sumilla pendiente.',
      tipo: 'ESPECIALIDAD',
      condicion: 'OBLIGATORIA',
      creditos: 3,
      horasTeoricas: 2,
      cicloId,
      estado,
    },
  });
}

async function crearUsuario(
  email: string,
  nombreCompleto: string,
  codigoRol: string,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto,
      passwordHash: 'x',
      estado,
      ...(rol ? { roles: { create: { rolId: rol.id } } } : {}),
    },
  });
}

describe('RF-PE-016 — las asignaturas del plan de estudios', () => {
  it('devuelve las del plan pedido y ninguna más', async () => {
    // `version: 2` y no 1: el plan del beforeEach ya ocupa (carreraId, 1), por
    // `@@unique([carreraId, version])`. Y `BORRADOR` y no `VIGENTE`: el plan
    // del beforeEach ya es el Vigente de esta carrera, y el índice parcial de
    // §3.3 (única versión Vigente por carrera) rechazaría un segundo. Ninguno
    // de los dos es relevante para lo que prueba este caso: el filtro de
    // `asignaturasDelPlan` es por `planId`, no por estado.
    const otroPlan = await prisma.planEstudios.create({
      data: { carreraId, codigo: 'PE-OTRO-v1', version: 2, estado: 'BORRADOR', duracionAnios: 5 },
    });
    await crearAsignatura(planEstudiosId, 'ASUC001', 'Cálculo I');
    await crearAsignatura(otroPlan.id, 'ASUC999', 'De otro plan');

    const asignaturas = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(asignaturas.map((a) => a.codigo)).toEqual(['ASUC001']);
  });

  it('trae el número de ciclo, para poder agrupar el desplegable', async () => {
    const ciclo = await prisma.ciclo.create({ data: { carreraId, numero: 3 } });
    await crearAsignatura(planEstudiosId, 'ASUC002', 'Física', ciclo.id);

    const [a] = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(a?.cicloNumero).toBe(3);
  });

  it('una asignatura sin ciclo no rompe: su ciclo es null', async () => {
    // RF068 admite asignaturas sin ciclo asignado todavía; son las que la
    // alerta de consistencia señala, no un caso imposible.
    await crearAsignatura(planEstudiosId, 'ASUC003', 'Sin ciclo');

    const [a] = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(a?.cicloNumero).toBeNull();
  });

  it('las inactivas se devuelven marcadas, y las activas también', async () => {
    // Esconderlas dejaría sin explicación una asignatura que ya está asociada
    // a una competencia y de pronto desaparece del listado.
    //
    // Las dos, y no solo la inactiva: con una sola fila, fijar `activa: false`
    // a pelo en el adaptador dejaba la prueba en verde, y la pantalla usa ese
    // campo para escribir «(inactiva)» junto al nombre. Un desplegable que
    // marca como retiradas las 74 asignaturas de la carrera es peor que uno
    // que no marca ninguna.
    await crearAsignatura(planEstudiosId, 'ASUC004', 'Retirada', null, 'INACTIVO');
    await crearAsignatura(planEstudiosId, 'ASUC005', 'En curso', null, 'ACTIVO');

    const encontradas = await curricular.asignaturasDelPlan(planEstudiosId);

    expect(new Map(encontradas.map((a) => [a.codigo, a.activa]))).toEqual(
      new Map([
        ['ASUC004', false],
        ['ASUC005', true],
      ]),
    );
  });
});

describe('RF-PE-018 — los usuarios de un rol', () => {
  it('devuelve solo los del rol pedido', async () => {
    const docente = await crearUsuario('docente@sgc.local', 'Ana Docente', 'DOCENTE');
    await crearUsuario('otro@sgc.local', 'Otro Alguien', 'COORDINADOR_ACADEMICO');

    const encontrados = await directorio.porRol('DOCENTE');

    expect(encontrados.map((u) => u.id)).toEqual([docente.id]);
    expect(encontrados[0]?.nombre).toBe('Ana Docente');
  });

  it('los inactivos no salen: no se puede responsabilizar a una cuenta apagada', async () => {
    await crearUsuario('baja@sgc.local', 'De baja', 'DOCENTE', 'INACTIVO');

    expect(await directorio.porRol('DOCENTE')).toEqual([]);
  });

  it('un rol que no existe devuelve lista vacía, no una excepción', async () => {
    expect(await directorio.porRol('NO_EXISTE')).toEqual([]);
  });
});
