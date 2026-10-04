/**
 * Eliminar atributos y criterios (RF-CH-029, RF-CH-032, D-15) contra la base real.
 *
 * Lo que los dobles no pueden decir: que un borrado bloqueado **no toca nada** —
 * `competencia_atributo` cae en cascada con el atributo, así que un orden de
 * comprobación equivocado perdería vínculos sin avisar—, que la comprobación de
 * la transacción detiene un borrado cuando el vínculo aparece entre la consulta
 * previa y el borrado, y que un criterio referenciado por un plan de mejora de
 * **cualquier estado** no se elimina (no hay clave foránea que lo impida).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../src/shared-kernel/errors/errores.js';
import { AcademicoCrossModuloAdapter } from '../../src/modules/academico/infrastructure/academico-cross-modulo.adapter.js';
import { CarreraRepositoryPrisma } from '../../src/modules/academico/infrastructure/persistence/academico.repository.js';
import { GestionarAtributos } from '../../src/modules/acreditacion/application/use-cases/gestionar-atributos.use-case.js';
import { GestionarCriterios } from '../../src/modules/acreditacion/application/use-cases/gestionar-criterios.use-case.js';
import { AtributoRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/atributos.repository.js';
import { CriterioRepositoryPrisma } from '../../src/modules/acreditacion/infrastructure/persistence/criterio.repository.js';
import { sembrarAtributosIcacit } from '../../src/modules/acreditacion/infrastructure/persistence/sembrar-atributos-icacit.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { CriterioEnUsoAdapter } from '../../src/modules/mejora-continua/mejora/infrastructure/criterio-en-uso.adapter.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { PlanParaAcreditacionAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-para-acreditacion.adapter.js';
import { PlanRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/plan.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);
const atributosRepo = new AtributoRepositoryPrisma(prisma);
const criteriosRepo = new CriterioRepositoryPrisma(prisma);
const planesMejora = new PlanMejoraRepositoryPrisma(prisma);
const eventosPublicados: string[] = [];
const bitacora: PublicadorDeEventos = {
  publicar: async (e) => void eventosPublicados.push(...e.map((x) => x.detalle)),
};

function atributos(): GestionarAtributos {
  return new GestionarAtributos(
    atributosRepo,
    new PlanParaAcreditacionAdapter(new PlanRepositoryPrisma(prisma)),
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    adaptador,
    bitacora,
    adaptador,
  );
}

function criterios(): GestionarCriterios {
  return new GestionarCriterios(
    criteriosRepo,
    new AcademicoCrossModuloAdapter(new CarreraRepositoryPrisma(prisma)),
    new CriterioEnUsoAdapter(planesMejora),
    adaptador,
    bitacora,
    adaptador,
  );
}

let isi: string;
let civ: string;
let planIsi: string;
let coordinador: Actor;

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearCoordinador(email: string, carreraId: string): Promise<Actor> {
  const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: 'COORDINADOR_ACADEMICO' } });
  const u = await prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado: 'ACTIVO',
      roles: { create: { rolId: rol.id } },
      carreras: { create: { carreraId } },
    },
  });
  return { id: u.id, nombre: 'Coordinadora' };
}

function atributoDe(carreraId: string, codigo: string) {
  return prisma.atributoGraduado.findFirstOrThrow({ where: { carreraId, codigo } });
}

async function competenciaConAtributo(carreraId: string, atributoId: string) {
  const sufijo = Math.random().toString(36).slice(2, 8).toUpperCase();
  return prisma.competencia.create({
    data: {
      codigo: `CPE-${sufijo}`,
      // El nombre es único por carrera (sin distinguir mayúsculas): dos competencias iguales chocarían.
      nombre: `Competencia de prueba ${sufijo}`,
      carreraId,
      atributos: { create: { atributoId } },
    },
  });
}

async function planDeMejoraSobre(criterioId: string, carreraId: string, codigo: string) {
  return planesMejora.crear({
    codigo,
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId,
    criterioAcreditacionId: criterioId,
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
  });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(
    `TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora RESTART IDENTITY CASCADE`,
  );
  eventosPublicados.length = 0;

  isi = await crearCarrera('ISI');
  civ = await crearCarrera('CIV');
  await sembrarAtributosIcacit(prisma, isi);
  await sembrarAtributosIcacit(prisma, civ);
  planIsi = (
    await prisma.planEstudios.create({
      data: {
        carreraId: isi,
        codigo: 'PE-ISI-2026-v1',
        version: 1,
        estado: 'BORRADOR',
        duracionAnios: 5,
      },
    })
  ).id;
  coordinador = await crearCoordinador('coo@x.pe', isi);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RF-CH-029 — eliminar un atributo', () => {
  it('un atributo libre se borra de verdad, solo el de su carrera, y queda auditado', async () => {
    const libre = await atributoDe(isi, 'AG-I09');

    await atributos().eliminar(coordinador, libre.id);

    expect(await prisma.atributoGraduado.count({ where: { carreraId: isi } })).toBe(10);
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
    expect(eventosPublicados).toEqual([
      'Atributo del graduado AG-I09 «Diseño y Desarrollo de Soluciones» eliminado.',
    ]);
  });

  it('con competencias vinculadas: 409 con el motivo, y ni el atributo ni sus vínculos se tocan', async () => {
    const atributo = await atributoDe(isi, 'AG-I08');
    await competenciaConAtributo(isi, atributo.id);
    await competenciaConAtributo(isi, atributo.id);
    const antes = await prisma.competenciaAtributo.count();

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toThrow(
      'No se puede eliminar el atributo AG-I08: está en uso (2 competencias). Inactívalo si ya no debe usarse.',
    );

    expect(await prisma.atributoGraduado.count({ where: { id: atributo.id } })).toBe(1);
    // El `onDelete: Cascade` de la tabla puente habría borrado estos dos en silencio.
    expect(await prisma.competenciaAtributo.count()).toBe(antes);
    expect(eventosPublicados).toEqual([]);
  });

  it('adoptado por un plan de estudios (sin competencias): 409 y el vínculo del plan intacto', async () => {
    const atributo = await atributoDe(isi, 'AG-I02');
    await atributos().declararEnPlan(coordinador, planIsi, [atributo.id]);

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toThrow(
      'No se puede eliminar el atributo AG-I02: está en uso (1 plan de estudio). Inactívalo si ya no debe usarse.',
    );

    expect(await prisma.planAtributo.count({ where: { atributoId: atributo.id } })).toBe(1);
  });

  it('en uso por ambos: el motivo los cuenta a los dos', async () => {
    const atributo = await atributoDe(isi, 'AG-I03');
    await competenciaConAtributo(isi, atributo.id);
    await atributos().declararEnPlan(coordinador, planIsi, [atributo.id]);

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toThrow(
      'está en uso (1 competencia, 1 plan de estudio)',
    );
  });

  it('inactivarlo no lo libera: un atributo inactivo con competencias tampoco se elimina', async () => {
    const atributo = await atributoDe(isi, 'AG-I04');
    await competenciaConAtributo(isi, atributo.id);
    await atributos().cambiarEstado(coordinador, atributo.id, false);

    await expect(atributos().eliminar(coordinador, atributo.id)).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
  });

  it('el atributo de otra carrera: el Coordinador recibe AccesoDenegado y nada se borra', async () => {
    const deCiv = await atributoDe(civ, 'AG-I09');

    await expect(atributos().eliminar(coordinador, deCiv.id)).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(await prisma.atributoGraduado.count({ where: { carreraId: civ } })).toBe(11);
  });

  it('un identificador inexistente es NoEncontrado', async () => {
    await expect(
      atributos().eliminar(coordinador, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('carrera crítica: si el vínculo aparece antes de borrar, el repositorio no borra y los vínculos quedan', async () => {
    const atributo = await atributoDe(isi, 'AG-I05');
    // Simula el vínculo que otro usuario confirmó entre la consulta previa del
    // caso de uso y el borrado: se llama al repositorio directamente.
    await competenciaConAtributo(isi, atributo.id);

    expect(await atributosRepo.eliminar(atributo.id)).toBe(false);

    expect(await prisma.atributoGraduado.count({ where: { id: atributo.id } })).toBe(1);
    expect(await prisma.competenciaAtributo.count({ where: { atributoId: atributo.id } })).toBe(1);
  });

  it('el repositorio borra el atributo libre y dice false si ya no existe', async () => {
    const libre = await atributoDe(isi, 'AG-I06');

    expect(await atributosRepo.eliminar(libre.id)).toBe(true);
    expect(await atributosRepo.eliminar(libre.id)).toBe(false);
  });
});

describe('RF-CH-032 — eliminar un criterio', () => {
  it('un criterio sin planes de mejora se borra, y el homónimo de otra carrera no se entera', async () => {
    const otro = await crearCoordinador('coo2@x.pe', civ);
    const mio = await criterios().crear(coordinador, isi, 'C-01', 'Estudiantes');
    await criterios().crear(otro, civ, 'C-01', 'Estudiantes de Civil');

    await criterios().eliminar(coordinador, mio.id);

    expect(await criteriosRepo.porId(mio.id)).toBeNull();
    expect(await prisma.criterioAcreditacion.count({ where: { carreraId: civ } })).toBe(1);
    expect(eventosPublicados).toContain('Criterio de acreditación C-01 «Estudiantes» eliminado.');
  });

  it.each([['BORRADOR'], ['VIGENTE'], ['HISTORICO']] as const)(
    'un plan de mejora en estado %s lo bloquea: no hay clave foránea, solo esta comprobación',
    async (estado) => {
      const criterio = await criterios().crear(coordinador, isi, 'C-01', 'Estudiantes');
      await planDeMejoraSobre(criterio.id, isi, 'PJ-1');
      await prisma.planMejora.updateMany({
        where: { criterioAcreditacionId: criterio.id },
        data: { estado },
      });

      await expect(criterios().eliminar(coordinador, criterio.id)).rejects.toThrow(
        'No se puede eliminar el criterio C-01: está en uso (1 plan de mejora). Inactívalo si ya no debe usarse.',
      );
      expect(await criteriosRepo.porId(criterio.id)).not.toBeNull();
    },
  );

  it('con dos planes de mejora el motivo los cuenta; al borrarlos, el criterio ya se elimina', async () => {
    const criterio = await criterios().crear(coordinador, isi, 'C-01', 'Estudiantes');
    await planDeMejoraSobre(criterio.id, isi, 'PJ-1');
    await planDeMejoraSobre(criterio.id, isi, 'PJ-2');

    await expect(criterios().eliminar(coordinador, criterio.id)).rejects.toThrow(
      'está en uso (2 planes de mejora)',
    );

    await prisma.planMejora.deleteMany({ where: { criterioAcreditacionId: criterio.id } });
    await criterios().eliminar(coordinador, criterio.id);
    expect(await criteriosRepo.porId(criterio.id)).toBeNull();
  });

  it('el criterio de otra carrera: el Coordinador recibe AccesoDenegado y nada se borra', async () => {
    const otro = await crearCoordinador('coo2@x.pe', civ);
    const ajeno = await criterios().crear(otro, civ, 'C-01', 'De Civil');

    await expect(criterios().eliminar(coordinador, ajeno.id)).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(await criteriosRepo.porId(ajeno.id)).not.toBeNull();
  });
});
