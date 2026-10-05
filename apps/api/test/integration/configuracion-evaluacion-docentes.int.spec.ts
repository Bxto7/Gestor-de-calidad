/**
 * Docentes y responsables de Evaluación validados contra la carrera del plan
 * (RF-CH-045, RF-CH-046) contra la base real: el catálogo trae solo los docentes
 * activos de la carrera del plan, un responsable de otra carrera se rechaza sin
 * guardar nada, y un responsable heredado (de «cualquier rol») sigue aceptándose.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { DirectorioDeUsuariosAdapter } from '../../src/modules/auth/infrastructure/directorio-usuarios.adapter.js';
import { ConfigurarPlanEvaluacion } from '../../src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const curricular = new ContenidoCurricularAdapter(
  prisma,
  new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
);
const publicador: PublicadorDeEventos = { publicar: async () => undefined };

function casos(): ConfigurarPlanEvaluacion {
  return new ConfigurarPlanEvaluacion(
    new PlanEvaluacionRepositoryPrisma(prisma),
    new PlanMedicionRepositoryPrisma(prisma),
    curricular,
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    new DirectorioDeUsuariosAdapter(prisma),
    adaptador,
    publicador,
    adaptador,
  );
}

let isi: string;
let otraCarrera: string;
let coordinador: Actor;
let evaluacionId: string;
const competenciaId = randomUUID();

async function docente(
  nombre: string,
  carreraId: string,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: 'DOCENTE' } });
  const u = await prisma.usuario.create({
    data: {
      email: `${randomUUID()}@x.pe`,
      nombreCompleto: nombre,
      passwordHash: 'x',
      estado,
      roles: { create: { rolId: rol.id } },
      carreras: { create: { carreraId } },
    },
  });
  return u.id;
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
             mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
             mejora_continua.periodos_medicion, mejora_continua.planes_medicion
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, plan_estudios.planes_estudio, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);

  const f = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  isi = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  otraCarrera = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Civil', codigo: 'ICI', duracionAnios: 5 },
    })
  ).id;
  const pe = await prisma.planEstudios.create({
    data: { carreraId: isi, codigo: 'PE-ISI-v1', version: 1, estado: 'VIGENTE', duracionAnios: 5 },
  });
  const pm = await prisma.planMedicion.create({
    data: {
      planEstudiosId: pe.id,
      carreraId: isi,
      tipo: 'INDIRECTA',
      codigo: 'PM-1',
      meta: 0.7,
      estado: 'APROBADO',
    },
  });
  await prisma.competenciaDelPlan.create({ data: { planMedicionId: pm.id, competenciaId } });
  evaluacionId = (
    await prisma.planEvaluacion.create({
      data: { planMedicionId: pm.id, carreraId: isi, codigo: 'EV-1', estado: 'BORRADOR' },
    })
  ).id;

  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: 'COORDINADOR_ACADEMICO' } });
  const u = await prisma.usuario.create({
    data: {
      email: 'coo@x.pe',
      nombreCompleto: 'Coordinadora',
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      carreras: { create: { carreraId: isi } },
    },
  });
  coordinador = { id: u.id, nombre: 'Coordinadora' };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-046 contra la base real', () => {
  it('docentes(): solo los activos de la carrera del plan', async () => {
    const mia = await docente('Ana Docente', isi);
    await docente('Beto Otra', otraCarrera);
    await docente('Carla Inactiva', isi, 'INACTIVO');

    expect(await casos().docentes(coordinador, evaluacionId)).toEqual([
      { id: mia, nombre: 'Ana Docente' },
    ]);
  });

  it('responsable de una competencia: un docente de otra carrera es 409 y no se guarda; uno de la carrera se guarda', async () => {
    const mia = await docente('Ana Docente', isi);
    const ajena = await docente('Beto Otra', otraCarrera);

    await expect(
      casos().guardarCompetencia(coordinador, evaluacionId, competenciaId, {
        instrumento: null,
        frecuencia: null,
        responsableId: ajena,
      }),
    ).rejects.toBeInstanceOf(ReglaDeNegocioViolada);
    expect(
      await prisma.configuracionCompetencia.count({ where: { planEvaluacionId: evaluacionId } }),
    ).toBe(0);

    await casos().guardarCompetencia(coordinador, evaluacionId, competenciaId, {
      instrumento: null,
      frecuencia: null,
      responsableId: mia,
    });
    expect(
      (
        await prisma.configuracionCompetencia.findFirstOrThrow({
          where: { planEvaluacionId: evaluacionId },
        })
      ).responsableId,
    ).toBe(mia);
  });

  it('un responsable heredado (un coordinador, como permitía el código anterior) se acepta de nuevo al volver a guardar', async () => {
    await prisma.configuracionCompetencia.create({
      data: { planEvaluacionId: evaluacionId, competenciaId, responsableId: coordinador.id },
    });

    await expect(
      casos().guardarCompetencia(coordinador, evaluacionId, competenciaId, {
        instrumento: 'Encuesta',
        frecuencia: null,
        responsableId: coordinador.id,
      }),
    ).resolves.toBeUndefined();
  });
});
