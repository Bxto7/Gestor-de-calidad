/**
 * Eliminar planes de medición y de evaluación (RF-CH-035, RF-CH-039) contra la
 * base real: el estado, el bloqueo por planes asociados de cualquier estado, que
 * un borrado bloqueado no toca nada, el doble borrado y la bitácora después.
 *
 * Un plan de medición en Borrador o En revisión no puede tener evaluaciones por
 * la aplicación (la base tiene que estar Aprobada o Vigente), y uno de evaluación
 * tampoco planes de mejora: aquí se fuerza el estado con Prisma para probar la
 * defensa, que existe porque no hay forma de impedirlo en la base.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado, ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { GestionarPlanesEvaluacion } from '../../src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { GestionarPlanesMedicion } from '../../src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const repoMedicion = new PlanMedicionRepositoryPrisma(prisma);
const repoEvaluacion = new PlanEvaluacionRepositoryPrisma(prisma);
const curricular = new ContenidoCurricularAdapter(
  prisma,
  new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
);
const bitacora: string[] = [];
const publicador: PublicadorDeEventos = {
  publicar: async (e) => void bitacora.push(...e.map((x) => x.detalle)),
};

function mediciones(): GestionarPlanesMedicion {
  return new GestionarPlanesMedicion(repoMedicion, curricular, adaptador, publicador, adaptador);
}

function evaluaciones(): GestionarPlanesEvaluacion {
  return new GestionarPlanesEvaluacion(
    repoEvaluacion,
    repoMedicion,
    curricular,
    new ConfiguracionEvaluacionRepositoryPrisma(prisma),
    adaptador,
    publicador,
    adaptador,
  );
}

let isi: string;
let pe: string;
let coordinador: Actor;

type Estado = 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';

async function medicion(codigo: string, estado: Estado = 'BORRADOR') {
  return prisma.planMedicion.create({
    data: { planEstudiosId: pe, carreraId: isi, tipo: 'DIRECTA', codigo, meta: 0.7, estado },
  });
}

async function evaluacionSobre(
  planMedicionId: string,
  codigo: string,
  estado: Estado = 'BORRADOR',
) {
  return prisma.planEvaluacion.create({
    data: { planMedicionId, carreraId: isi, codigo, estado },
  });
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
  bitacora.length = 0;

  const f = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
  isi = (
    await prisma.carrera.create({
      data: { facultadId: f.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    })
  ).id;
  pe = (
    await prisma.planEstudios.create({
      data: {
        carreraId: isi,
        codigo: 'PE-ISI-v1',
        version: 1,
        estado: 'VIGENTE',
        duracionAnios: 5,
      },
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

describe('RF-CH-035 — eliminar un plan de medición', () => {
  it.each([
    ['BORRADOR', 'Borrador', ' (guardia de regresión: el código anterior ya borraba en Borrador)'],
    ['EN_REVISION', 'En revisión', ''],
  ] as const)(
    'en %s se borra con sus periodos, y queda en la bitácora%s',
    async (estado, texto) => {
      const pm = await medicion('PM-1', estado);
      await prisma.periodoMedicion.create({
        data: { planMedicionId: pm.id, etiqueta: '2026-I', orden: 1 },
      });

      await mediciones().eliminar(coordinador, pm.id);

      expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(0);
      expect(await prisma.periodoMedicion.count({ where: { planMedicionId: pm.id } })).toBe(0);
      expect(bitacora).toEqual([`Plan de medición PM-1 eliminado en ${texto}.`]);
    },
  );

  it('Vigente: 409 con el texto completo, y el plan queda', async () => {
    const pm = await medicion('PM-1', 'VIGENTE');

    await expect(mediciones().eliminar(coordinador, pm.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de medición PM-1: está en Vigente. Solo se eliminan planes en Borrador o En revisión.',
      ),
    );
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(1);
  });

  it('con un plan de evaluación asociado: 409 con el motivo, y no se toca nada', async () => {
    const pm = await medicion('PM-1', 'APROBADO');
    await evaluacionSobre(pm.id, 'EV-1', 'VIGENTE');
    await prisma.planMedicion.update({ where: { id: pm.id }, data: { estado: 'BORRADOR' } });
    await prisma.periodoMedicion.create({
      data: { planMedicionId: pm.id, etiqueta: '2026-I', orden: 1 },
    });

    await expect(mediciones().eliminar(coordinador, pm.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de medición PM-1: tiene 1 plan de evaluación asociado.',
      ),
    );
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(1);
    expect(await prisma.periodoMedicion.count({ where: { planMedicionId: pm.id } })).toBe(1);
    expect(await prisma.planEvaluacion.count({ where: { planMedicionId: pm.id } })).toBe(1);
    expect(bitacora).toEqual([]);
  });

  it('el repositorio: eliminado, y la segunda vez no-existe, sin lanzar', async () => {
    const pm = await medicion('PM-1');

    expect(await repoMedicion.eliminar(pm.id)).toEqual({ tipo: 'eliminado' });
    expect(await repoMedicion.eliminar(pm.id)).toEqual({ tipo: 'no-existe' });
  });

  it('secuencial: un plan de evaluación ya existente lo detiene (no prueba el bloqueo de la fila)', async () => {
    const pm = await medicion('PM-1');
    await evaluacionSobre(pm.id, 'EV-1');

    expect(await repoMedicion.eliminar(pm.id)).toEqual({ tipo: 'en-uso', asociados: 1 });
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(1);
  });

  it('concurrencia: un plan de evaluación insertado en una transacción abierta, y confirmado durante el borrado, lo detiene', async () => {
    const pm = await medicion('PM-1');
    let confirmar!: () => void;
    const puedeConfirmar = new Promise<void>((r) => (confirmar = r));
    let insertada!: () => void;
    const yaInsertada = new Promise<void>((r) => (insertada = r));

    // La transacción inserta (sin confirmar) y toma el bloqueo compartido de la
    // fila del plan por su clave foránea.
    const abierta = prisma.$transaction(async (tx) => {
      await tx.planEvaluacion.create({
        data: { planMedicionId: pm.id, carreraId: isi, codigo: 'EV-1', estado: 'BORRADOR' },
      });
      insertada();
      await puedeConfirmar;
    });
    await yaInsertada;

    let terminado = false;
    const borrado = repoMedicion.eliminar(pm.id).finally(() => (terminado = true));
    await new Promise((r) => setTimeout(r, 400));
    // Con FOR UPDATE el borrado espera a la transacción; sin él ya habría terminado.
    expect(terminado).toBe(false);

    confirmar();
    await abierta;

    expect(await borrado).toEqual({ tipo: 'en-uso', asociados: 1 });
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(1);
    expect(await prisma.planEvaluacion.count({ where: { planMedicionId: pm.id } })).toBe(1);
  });

  it('concurrencia: dos borrados a la vez del mismo plan: uno elimina y el otro no-existe', async () => {
    const pm = await medicion('PM-1');

    const resultados = await Promise.all([
      repoMedicion.eliminar(pm.id),
      repoMedicion.eliminar(pm.id),
    ]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['eliminado', 'no-existe']);
    expect(await prisma.planMedicion.count({ where: { id: pm.id } })).toBe(0);
  });

  it('guardia de regresión: un plan que ya no existe es NoEncontrado y no deja evento (planGestionable ya lo daba)', async () => {
    await expect(mediciones().eliminar(coordinador, randomUUID())).rejects.toBeInstanceOf(
      NoEncontrado,
    );
    expect(bitacora).toEqual([]);
  });
});

describe('RF-CH-039 — eliminar un plan de evaluación', () => {
  async function planDeMejoraSobre(planEvaluacionId: string, codigo: string) {
    return new PlanMejoraRepositoryPrisma(prisma).crear({
      codigo,
      aspecto: 'COMPETENCIA',
      carreraId: isi,
      criterioAcreditacionId: null,
      objetivoEducacionalId: null,
      competenciaId: randomUUID(),
      periodoId: randomUUID(),
      planEvaluacionId,
    });
  }

  it.each([
    ['BORRADOR', 'Borrador'],
    ['EN_REVISION', 'En revisión'],
  ] as const)('en %s se borra, y queda en la bitácora', async (estado, texto) => {
    const base = await medicion('PM-1', 'APROBADO');
    const ev = await evaluacionSobre(base.id, 'EV-1', estado);

    await evaluaciones().eliminar(coordinador, ev.id);

    expect(await prisma.planEvaluacion.count({ where: { id: ev.id } })).toBe(0);
    expect(bitacora).toEqual([`Plan de evaluación EV-1 eliminado en ${texto}.`]);
  });

  it.each([['BORRADOR'], ['VIGENTE'], ['HISTORICO']] as const)(
    'un plan de mejora en %s lo bloquea: no hay clave foránea, solo esta cuenta',
    async (estadoMejora) => {
      const base = await medicion('PM-1', 'APROBADO');
      const ev = await evaluacionSobre(base.id, 'EV-1');
      const pj = await planDeMejoraSobre(ev.id, 'PJ-COM-1');
      await prisma.planMejora.update({ where: { id: pj.id }, data: { estado: estadoMejora } });

      await expect(evaluaciones().eliminar(coordinador, ev.id)).rejects.toThrow(
        'No se puede eliminar el plan de evaluación EV-1: tiene 1 plan de mejora asociado.',
      );
      expect(await prisma.planEvaluacion.count({ where: { id: ev.id } })).toBe(1);
      expect(bitacora).toEqual([]);
    },
  );

  it('Aprobado: 409 con el texto completo', async () => {
    const base = await medicion('PM-1', 'APROBADO');
    const ev = await evaluacionSobre(base.id, 'EV-1', 'APROBADO');

    await expect(evaluaciones().eliminar(coordinador, ev.id)).rejects.toThrow(
      new ReglaDeNegocioViolada(
        'No se puede eliminar el plan de evaluación EV-1: está en Aprobado. Solo se eliminan planes en Borrador o En revisión.',
      ),
    );
    expect(await prisma.planEvaluacion.count({ where: { id: ev.id } })).toBe(1);
  });

  // Sin prueba de concurrencia contra un plan de mejora que se inserta durante el
  // borrado: PlanMejora.planEvaluacionId no tiene clave foránea, así que la fila
  // del plan de evaluación no recibe ningún bloqueo compartido y esa ventana es
  // inevitable (el comentario del repositorio la declara). Un test sería aleatorio.
  it('concurrencia: dos borrados a la vez del mismo plan: uno elimina y el otro no-existe', async () => {
    const base = await medicion('PM-1', 'APROBADO');
    const ev = await evaluacionSobre(base.id, 'EV-1');

    const resultados = await Promise.all([
      repoEvaluacion.eliminar(ev.id),
      repoEvaluacion.eliminar(ev.id),
    ]);

    expect(resultados.map((r) => r.tipo).sort()).toEqual(['eliminado', 'no-existe']);
  });

  it('el repositorio: eliminado, y la segunda vez no-existe', async () => {
    const base = await medicion('PM-1', 'APROBADO');
    const ev = await evaluacionSobre(base.id, 'EV-1');

    expect(await repoEvaluacion.eliminar(ev.id)).toEqual({ tipo: 'eliminado' });
    expect(await repoEvaluacion.eliminar(ev.id)).toEqual({ tipo: 'no-existe' });
  });
});
