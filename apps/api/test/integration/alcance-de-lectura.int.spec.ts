import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  Actor,
  PublicadorDeEventos,
} from '../../src/shared-kernel/domain-events/domain-event.js';
import { NoEncontrado } from '../../src/shared-kernel/errors/errores.js';
import { GestionarCompetencias } from '../../src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.js';
import { CompetenciaRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.js';
import { GestionarAsignaturas } from '../../src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.js';
import { AsignaturaRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/asignatura.repository.js';
import {
  ContenidoRepositoryPrisma,
  PlanRepositoryPrisma,
} from '../../src/modules/plan-estudios/infrastructure/persistence/plan.repository.js';
import { GestionarObjetivos } from '../../src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.js';
import { ObjetivoRepositoryPrisma } from '../../src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';
import { PlanParaObjetivosAdapter } from '../../src/modules/plan-estudios/infrastructure/plan-para-objetivos.adapter.js';
import { ElementoCurricularEnUsoAdapter } from '../../src/modules/mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { sembrarAtributosIcacit } from '../../src/modules/acreditacion/infrastructure/persistence/sembrar-atributos-icacit.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(
  email: string,
  codigoRol: string,
  carreraId: string | null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado,
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('AuthorizationAdapter.alcanceDeLectura', () => {
  it('un Director con carrera queda restringido a ella', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: sis,
    });
  });

  it('un Director sin carrera queda restringido y sin carrera: no lee ninguna', async () => {
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', null);

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: null,
    });
  });

  it('un Consultor no está restringido', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await adaptador.alcanceDeLectura(consultor.id)).toEqual({ tipo: 'TODAS' });
  });

  it('un Coordinador con carrera a cargo tampoco: la marca es solo del Director', async () => {
    const sis = await crearCarrera('SIS');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);

    expect(await adaptador.alcanceDeLectura(coordinador.id)).toEqual({ tipo: 'TODAS' });
  });

  it('una cuenta inactiva se queda sin permisos, y sin la marca: TODAS (su permiso de lectura ya falla)', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis, 'INACTIVO');

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({ tipo: 'TODAS' });
  });
});

describe('AuthorizationAdapter.puedeLeerCarrera', () => {
  it('el Director lee su carrera y no otra', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);

    expect(await adaptador.puedeLeerCarrera(director.id, sis)).toBe(true);
    expect(await adaptador.puedeLeerCarrera(director.id, civ)).toBe(false);
  });

  it('el Director sin carrera no lee ninguna', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', null);

    expect(await adaptador.puedeLeerCarrera(director.id, sis)).toBe(false);
  });

  it('el Consultor lee cualquiera', async () => {
    const sis = await crearCarrera('SIS');
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await adaptador.puedeLeerCarrera(consultor.id, sis)).toBe(true);
  });
});

/* ── Bloque 4b: el catálogo según el alcance (RF-CH-015 a 018) ─────────── */

const sinBitacora: PublicadorDeEventos = { publicar: async () => undefined };

function como(usuario: { id: string }): Actor {
  return { id: usuario.id, nombre: 'Usuario de prueba' };
}

async function planDe(carreraId: string, codigo: string): Promise<string> {
  const p = await prisma.planEstudios.create({
    data: { carreraId, codigo, version: 1, estado: 'BORRADOR', duracionAnios: 5 },
  });
  return p.id;
}

async function competenciaEn(
  codigo: string,
  carreraId: string | null,
  planId?: string,
): Promise<string> {
  const c = await prisma.competencia.create({
    data: {
      codigo,
      nombre: `Competencia ${codigo}`,
      carreraId,
      ...(planId ? { planes: { create: { planId } } } : {}),
    },
  });
  return c.id;
}

function gestionarCompetencias(): GestionarCompetencias {
  return new GestionarCompetencias(
    new CompetenciaRepositoryPrisma(prisma),
    new PlanRepositoryPrisma(prisma),
    new ElementoCurricularEnUsoAdapter(prisma),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

describe('RF-CH-017 / RF-CH-009 — competencias según el alcance de lectura', () => {
  it('el Director lista sin planId solo las de su carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await competenciaEn('CPE-01', sis);
    await competenciaEn('CPE-02', civ);
    await competenciaEn('CPE-03', null);

    const r = await gestionarCompetencias().listar(como(director));
    expect(r.map((c) => c.codigo)).toEqual(['CPE-01']);
  });

  it('la cobertura sin planId del Director solo cuenta las competencias de su carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await sembrarAtributosIcacit(prisma, sis);
    const atributo = await prisma.atributoGraduado.findFirstOrThrow({ orderBy: { orden: 'asc' } });
    for (const [codigo, carreraId] of [
      ['CPE-01', sis],
      ['CPE-02', civ],
      ['CPE-03', null],
    ] as const) {
      const id = await competenciaEn(codigo, carreraId);
      await prisma.competenciaAtributo.create({
        data: { competenciaId: id, atributoId: atributo.id },
      });
    }

    const r = await gestionarCompetencias().cobertura(como(director));
    const codigos = r.flatMap((a) => a.competencias.map((c) => c.codigo));
    expect(codigos).toEqual(['CPE-01']);
  });

  it('la cobertura sin planId del Coordinador cuenta el catálogo entero', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);
    await sembrarAtributosIcacit(prisma, sis);
    const atributo = await prisma.atributoGraduado.findFirstOrThrow({ orderBy: { orden: 'asc' } });
    for (const [codigo, carreraId] of [
      ['CPE-01', sis],
      ['CPE-02', civ],
      ['CPE-03', null],
    ] as const) {
      const id = await competenciaEn(codigo, carreraId);
      await prisma.competenciaAtributo.create({
        data: { competenciaId: id, atributoId: atributo.id },
      });
    }

    const r = await gestionarCompetencias().cobertura(como(coordinador));
    const codigos = r.flatMap((a) => a.competencias.map((c) => c.codigo));
    expect(codigos).toEqual(['CPE-01', 'CPE-02', 'CPE-03']);
  });

  it('el Director recibe NoEncontrado al pedir las de un plan de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    await competenciaEn('CPE-02', civ, planCiv);

    await expect(
      gestionarCompetencias().listar(como(director), { planId: planCiv }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Director recibe NoEncontrado al leer por id una competencia de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const ajena = await competenciaEn('CPE-02', civ);

    await expect(gestionarCompetencias().porId(como(director), ajena)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el Coordinador sin planId recibe el catálogo entero, también las filas sin carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);
    await competenciaEn('CPE-01', sis);
    await competenciaEn('CPE-02', civ);
    await competenciaEn('CPE-03', null);

    const r = await gestionarCompetencias().listar(como(coordinador));
    expect(r.map((c) => c.codigo)).toEqual(['CPE-01', 'CPE-02', 'CPE-03']);
  });

  it('el Director no puede quitar una competencia de un plan de otra carrera: NoEncontrado y nada cambia', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    const ajena = await competenciaEn('CPE-02', civ, planCiv);

    await expect(
      gestionarCompetencias().quitarDelPlan(como(director), planCiv, ajena),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.planCompetencia.count({ where: { planId: planCiv } })).toBe(1);
  });
});

function gestionarObjetivos(): GestionarObjetivos {
  return new GestionarObjetivos(
    new ObjetivoRepositoryPrisma(prisma),
    new PlanParaObjetivosAdapter(new PlanRepositoryPrisma(prisma)),
    new ElementoCurricularEnUsoAdapter(prisma),
    adaptador,
    sinBitacora,
    adaptador,
  );
}

async function objetivoEn(
  codigo: string,
  carreraId: string | null,
  planId?: string,
): Promise<string> {
  const o = await prisma.objetivoEducacional.create({
    data: {
      codigo,
      nombre: `Objetivo ${codigo}`,
      descripcion: 'Descripción sintética.',
      carreraId,
      ...(planId ? { planes: { create: { planId } } } : {}),
    },
  });
  return o.id;
}

describe('RF-CH-015 / RF-CH-009 — objetivos según el alcance de lectura', () => {
  it('el Director lista sin planId solo los de su carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    await objetivoEn('OE-01', sis);
    await objetivoEn('OE-02', civ);
    await objetivoEn('OE-03', null);

    const r = await gestionarObjetivos().listar(como(director));
    expect(r.map((o) => o.codigo)).toEqual(['OE-01']);
  });

  it('el Director recibe NoEncontrado al pedir los de un plan de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    await objetivoEn('OE-02', civ, planCiv);

    await expect(
      gestionarObjetivos().listar(como(director), { planId: planCiv }),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el Director recibe NoEncontrado al leer por id un objetivo de otra carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const ajeno = await objetivoEn('OE-02', civ);

    await expect(gestionarObjetivos().porId(como(director), ajeno)).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('el Coordinador sin planId recibe el catálogo entero, también las filas sin carrera', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);
    await objetivoEn('OE-01', sis);
    await objetivoEn('OE-02', civ);
    await objetivoEn('OE-03', null);

    const r = await gestionarObjetivos().listar(como(coordinador));
    expect(r.map((o) => o.codigo)).toEqual(['OE-01', 'OE-02', 'OE-03']);
  });

  it('el Director no puede quitar un objetivo de un plan de otra carrera: NoEncontrado y nada cambia', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    const ajeno = await objetivoEn('OE-02', civ, planCiv);

    await expect(
      gestionarObjetivos().quitarDelPlan(como(director), planCiv, ajeno),
    ).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.planObjetivo.count({ where: { planId: planCiv } })).toBe(1);
  });
});

describe('RF-CH-019 / RF-CH-009 — eliminar asignaturas según el alcance', () => {
  it('el Director no puede eliminar una asignatura de otra carrera: NoEncontrado y nada cambia', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);
    const planCiv = await planDe(civ, 'PE-CIV-2026-v1');
    const ajena = await prisma.asignatura.create({
      data: {
        planId: planCiv,
        codigo: 'CIV-101',
        nombre: 'Estática',
        descripcion: 'Sumilla sintética.',
        tipo: 'GENERAL',
        condicion: 'OBLIGATORIA',
        creditos: 3,
      },
    });

    const caso = new GestionarAsignaturas(
      new AsignaturaRepositoryPrisma(prisma),
      new PlanRepositoryPrisma(prisma),
      new ContenidoRepositoryPrisma(prisma),
      adaptador,
      sinBitacora,
      new ElementoCurricularEnUsoAdapter(prisma),
      adaptador,
    );

    await expect(caso.eliminar(como(director), ajena.id)).rejects.toBeInstanceOf(NoEncontrado);
    expect(await prisma.asignatura.count({ where: { id: ajena.id } })).toBe(1);
  });
});
