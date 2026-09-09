/**
 * Pruebas de integración del repositorio Prisma de planes de mejora (§6.4,
 * ciclo 2c-J-A cerrado con Docker disponible — ver Task 2/Step 4 del plan de
 * ejecución, que dejó este archivo pendiente a propósito).
 *
 * `PlanMejora` no lleva clave foránea hacia `plan_estudios` ni hacia los
 * criterios de acreditación (§3.2 de CLAUDE.md: los módulos no comparten
 * tablas; la validación de que el elemento exista es 2c-J-B) — a diferencia
 * de `plan-evaluacion.int.spec.ts` o `indicaciones.int.spec.ts`, no hace
 * falta sembrar facultad/carrera/plan de estudios, solo UUIDs sueltos.
 *
 * Lo que aquí se comprueba y con dobles de puerto no se puede: que el
 * borrado de un plan arrastre sus evidencias (`onDelete: Cascade`), que el
 * estado documental y el de implementación viajen traducidos al vocabulario
 * del dominio, y que el `codigo` de un plan de mejora **no** tenga una
 * restricción `@@unique` real en la base — la unicidad la garantiza
 * `codigosDe(ámbito)` más la función pura `siguienteCodigoMejora`, tal como
 * declara el diseño (§4), no un índice. Se verifica contra Postgres real en
 * vez de asumirlo.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { PublicadorDeEventos } from '../../src/shared-kernel/domain-events/domain-event.js';
import type { NuevoPlanMejora } from '../../src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.js';
import { PlanMejoraRepositoryPrisma } from '../../src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.js';
import { GestionarPlanesMejora } from '../../src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.js';
import { PlanEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/plan-evaluacion.repository.js';
import { ConfiguracionEvaluacionRepositoryPrisma } from '../../src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.js';
import { PlanMedicionRepositoryPrisma } from '../../src/modules/mejora-continua/medicion/infrastructure/persistence/plan-medicion.repository.js';
import { AcreditacionAdapter } from '../../src/modules/plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.js';
import { ContenidoCurricularAdapter } from '../../src/modules/plan-estudios/infrastructure/contenido-curricular.adapter.js';
import { CriterioRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/criterio.repository.js';
import { ObjetivoRepositoryPrisma } from '../../src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.js';
import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';
import { ReglaDeNegocioViolada } from '../../src/shared-kernel/errors/errores.js';

const prisma = new PrismaService();
const repo = new PlanMejoraRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE mejora_continua.evidencia_plan_mejora, mejora_continua.planes_mejora
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function crearPlan(overrides: Partial<NuevoPlanMejora> = {}) {
  return repo.crear({
    codigo: 'PJ-1',
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: randomUUID(),
    criterioAcreditacionId: randomUUID(),
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    ...overrides,
  });
}

const DEFINICION = {
  nombre: 'Reforzar prácticas de laboratorio',
  causaRaiz: 'Falta de horas de práctica supervisada',
  justificacion: 'El indicador de la competencia bajó del umbral dos periodos seguidos',
  input: 'Resultados de la última reunión con constituyentes',
  plazo: new Date('2027-03-01T00:00:00.000Z'),
  recursos: 'Dos ayudantes de laboratorio adicionales',
  metas: 'Elevar el indicador sobre el umbral en el siguiente periodo',
  responsable: 'Coordinador de laboratorios',
};

describe('el repositorio', () => {
  it('crea en Borrador y Pendiente, con la definición vacía', async () => {
    const p = await crearPlan({ codigo: 'PJ-1' });

    expect(p.codigo).toBe('PJ-1');
    expect(p.aspecto).toBe('CRITERIO_ACREDITACION');
    expect(p.estado).toBe('Borrador');
    expect(p.estadoImplementacion).toBe('Pendiente');
    expect(p.nombre).toBe('');
    expect(p.evidencias).toEqual([]);
  });

  it('el estado documental viaja al vocabulario del dominio, no en MAYÚSCULAS', async () => {
    const p = await crearPlan();

    const tras = await repo.cambiarEstado(p.id, 'En revisión');

    expect(tras.estado).toBe('En revisión');
    expect((await repo.porId(p.id))?.estado).toBe('En revisión');
  });

  it('editarDefinicion reemplaza el bloque entero, sin tocar aspecto ni código', async () => {
    const p = await crearPlan({
      codigo: 'PJ-2',
      aspecto: 'OBJETIVO_EDUCACIONAL',
      criterioAcreditacionId: null,
      objetivoEducacionalId: randomUUID(),
    });

    const tras = await repo.editarDefinicion(p.id, DEFINICION);

    expect(tras.nombre).toBe(DEFINICION.nombre);
    expect(tras.causaRaiz).toBe(DEFINICION.causaRaiz);
    expect(tras.justificacion).toBe(DEFINICION.justificacion);
    expect(tras.plazo.toISOString()).toBe(DEFINICION.plazo.toISOString());
    expect(tras.recursos).toBe(DEFINICION.recursos);
    expect(tras.metas).toBe(DEFINICION.metas);
    expect(tras.responsable).toBe(DEFINICION.responsable);
    expect(tras.codigo).toBe('PJ-2');
    expect(tras.aspecto).toBe('OBJETIVO_EDUCACIONAL');
  });

  it('actualizarImplementacion traduce el enum de seguimiento', async () => {
    const p = await crearPlan();

    const tras = await repo.actualizarImplementacion(p.id, 'En proceso');

    expect(tras.estadoImplementacion).toBe('En proceso');
    expect((await repo.porId(p.id))?.estadoImplementacion).toBe('En proceso');
  });

  it('actualizarRetroalimentacion guarda logro de meta e impacto', async () => {
    const p = await crearPlan();

    const tras = await repo.actualizarRetroalimentacion(
      p.id,
      'Meta superada en 12%',
      'Mejoró la tasa de aprobación en el siguiente periodo',
    );

    expect(tras.logroMeta).toBe('Meta superada en 12%');
    expect(tras.impacto).toBe('Mejoró la tasa de aprobación en el siguiente periodo');
  });

  describe('evidencias', () => {
    it('agregarEvidencia la deja visible en porId, y eliminarEvidencia la retira', async () => {
      const p = await crearPlan();

      const ev = await repo.agregarEvidencia(p.id, {
        referencia: 'https://drive.example.com/informe.pdf',
        nombreArchivo: 'informe.pdf',
        subidoPor: randomUUID(),
      });

      expect((await repo.porId(p.id))?.evidencias.map((e) => e.id)).toEqual([ev.id]);

      await repo.eliminarEvidencia(ev.id);

      expect((await repo.porId(p.id))?.evidencias).toEqual([]);
    });

    it('planDeEvidencia resuelve el plan dueño, y null si la evidencia no existe', async () => {
      const p = await crearPlan();
      const ev = await repo.agregarEvidencia(p.id, {
        referencia: 'https://drive.example.com/otro.pdf',
        nombreArchivo: null,
        subidoPor: randomUUID(),
      });

      expect(await repo.planDeEvidencia(ev.id)).toBe(p.id);
      expect(await repo.planDeEvidencia(randomUUID())).toBeNull();
    });

    it('borrar el plan arrastra sus evidencias (onDelete: Cascade)', async () => {
      const p = await crearPlan();
      await repo.agregarEvidencia(p.id, {
        referencia: 'https://drive.example.com/uno.pdf',
        nombreArchivo: null,
        subidoPor: randomUUID(),
      });
      await repo.agregarEvidencia(p.id, {
        referencia: 'https://drive.example.com/dos.pdf',
        nombreArchivo: null,
        subidoPor: randomUUID(),
      });
      expect(await prisma.evidenciaPlanMejora.count()).toBe(2);

      await repo.eliminar(p.id);

      expect(await prisma.evidenciaPlanMejora.count()).toBe(0);
    });
  });

  describe('codigosDe — el ámbito de unicidad varía por aspecto (RF-PJ-003 RN2)', () => {
    it('un criterio no ve los códigos de otro criterio', async () => {
      const critX = randomUUID();
      const critY = randomUUID();
      await crearPlan({ codigo: 'PJ-1', criterioAcreditacionId: critX });
      await crearPlan({ codigo: 'PJ-9', criterioAcreditacionId: critY });

      expect(await repo.codigosDe('CRITERIO_ACREDITACION', critX)).toEqual(['PJ-1']);
      expect(await repo.codigosDe('CRITERIO_ACREDITACION', critY)).toEqual(['PJ-9']);
    });

    it('competencia se acota por periodo, no por competencia (§4 del diseño)', async () => {
      const periodo = randomUUID();
      const otroPeriodo = randomUUID();
      await crearPlan({
        codigo: 'PJ-C1',
        aspecto: 'COMPETENCIA',
        criterioAcreditacionId: null,
        competenciaId: randomUUID(),
        periodoId: periodo,
      });
      await crearPlan({
        codigo: 'PJ-C2',
        aspecto: 'COMPETENCIA',
        criterioAcreditacionId: null,
        competenciaId: randomUUID(),
        periodoId: periodo,
      });
      await crearPlan({
        codigo: 'PJ-C3',
        aspecto: 'COMPETENCIA',
        criterioAcreditacionId: null,
        competenciaId: randomUUID(),
        periodoId: otroPeriodo,
      });

      expect(await repo.codigosDe('COMPETENCIA', periodo)).toEqual(
        expect.arrayContaining(['PJ-C1', 'PJ-C2']),
      );
      expect(await repo.codigosDe('COMPETENCIA', periodo)).toHaveLength(2);
      expect(await repo.codigosDe('COMPETENCIA', otroPeriodo)).toEqual(['PJ-C3']);
    });

    it('un código repetido dentro del mismo ámbito no es un P2002: no hay @@unique sobre codigo', async () => {
      // El diseño (§4) es explícito: la unicidad la garantiza la función pura
      // `siguienteCodigoMejora` contra `codigosDe(ámbito)`, no un índice de
      // base de datos — a diferencia del Vigente único de plan-evaluacion
      // (ese sí es un índice parcial real, ver plan-evaluacion.int.spec.ts).
      // Esta prueba confirma contra Postgres real que la base no rechaza la
      // colisión: si algún día se agrega un `@@unique` sobre `codigo`, esta
      // prueba es la que debe empezar a fallar y avisar del cambio de
      // contrato — no se asume el mensaje de un P2002 que hoy no existe.
      const critX = randomUUID();
      await crearPlan({ codigo: 'PJ-DUP', criterioAcreditacionId: critX });

      await expect(
        crearPlan({ codigo: 'PJ-DUP', criterioAcreditacionId: critX }),
      ).resolves.toBeDefined();
      expect(await repo.codigosDe('CRITERIO_ACREDITACION', critX)).toEqual(['PJ-DUP', 'PJ-DUP']);
    });
  });
});

/**
 * 2c-J-B, Tarea 5 Step 1: lo de arriba solo prueba el repositorio crudo, con
 * UUIDs sueltos y sin `AuthorizationPort`. Lo que falta —y es justo lo que
 * `repo.crear` no puede exponer— es el caso de uso completo
 * (`GestionarPlanesMejora.crear`) contra Postgres real: la resolución de
 * `carreraId` vía `AuthorizationPort.carreraACargoDe` (§2a del diseño), el
 * rechazo cuando el elemento elegido no pertenece a esa carrera, y el
 * ensamblaje real de `porcentajeAnteriorDeCompetencia` (§2e), que con dobles
 * de puerto solo confirmaría que el doble responde lo que se le programó.
 */
describe('el caso de uso completo — creación real por aspecto (Tarea 5)', () => {
  const criterios = new CriterioRepositoryPrisma(prisma, repo);
  const objetivos = new ObjetivoRepositoryPrisma(prisma);
  const acreditacion = new AcreditacionAdapter(criterios, objetivos);
  const evaluaciones = new PlanEvaluacionRepositoryPrisma(prisma);
  const mediciones = new PlanMedicionRepositoryPrisma(prisma);
  const configuraciones = new ConfiguracionEvaluacionRepositoryPrisma(prisma);
  const curricular = new ContenidoCurricularAdapter(prisma);
  const autorizacion = new AuthorizationAdapter(prisma);
  const eventos: PublicadorDeEventos = { async publicar() {} };
  const casos = new GestionarPlanesMejora(
    repo,
    acreditacion,
    evaluaciones,
    mediciones,
    configuraciones,
    curricular,
    autorizacion,
    eventos,
  );

  let carreraA: string;
  let carreraB: string;
  let director: { id: string; nombre: string };

  beforeEach(async () => {
    // El `beforeEach` de arriba ya vacía `planes_mejora`/`evidencia_plan_mejora`.
    // Este añade lo que este bloque necesita: carreras, criterios, objetivos,
    // planes de evaluación/medición reales y un actor con permisos reales.
    await prisma.$executeRawUnsafe(`
      TRUNCATE mejora_continua.medicion_alcanzada, mejora_continua.configuracion_competencia,
               mejora_continua.planes_evaluacion, mejora_continua.competencias_del_plan,
               mejora_continua.periodos_medicion, mejora_continua.planes_medicion
      RESTART IDENTITY CASCADE`);
    await prisma.$executeRawUnsafe(`
      TRUNCATE plan_estudios.criterios_acreditacion, plan_estudios.objetivos_educacionales,
               plan_estudios.planes_estudio, plan_estudios.carreras, plan_estudios.facultades
      RESTART IDENTITY CASCADE`);
    await prisma.$executeRawUnsafe(
      `TRUNCATE auth.usuario_carrera, auth.usuarios RESTART IDENTITY CASCADE`,
    );

    const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
    const a = await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    });
    const b = await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Civil', codigo: 'ICO', duracionAnios: 5 },
    });
    carreraA = a.id;
    carreraB = b.id;

    const rol = await prisma.rol.findUnique({ where: { codigo: 'DIRECTOR_CARRERA' } });
    if (!rol) {
      throw new Error(
        'Falta el catálogo de roles/permisos en la base de pruebas — corre `npm run db:seed` contra sgc_test.',
      );
    }
    const usuario = await prisma.usuario.create({
      data: {
        email: 'director.sistemas@sgc.local',
        nombreCompleto: 'Directora de Sistemas',
        passwordHash: 'x',
        estado: 'ACTIVO',
        roles: { create: { rolId: rol.id } },
      },
    });
    await prisma.usuarioCarrera.create({ data: { usuarioId: usuario.id, carreraId: carreraA } });
    director = { id: usuario.id, nombre: usuario.nombreCompleto };
  });

  describe('aspecto Criterio de Acreditación (RF-PJ-020 a 022)', () => {
    it('resuelve carreraId del actor vía AuthorizationPort y crea el plan', async () => {
      const criterio = await criterios.crear(carreraA, 'C-01', 'Estudiantes');

      const creado = await casos.crear(director, {
        aspecto: 'CRITERIO_ACREDITACION',
        elementoId: criterio.id,
      });

      expect(creado.aspecto).toBe('CRITERIO_ACREDITACION');
      expect(creado.carreraId).toBe(carreraA);
      expect(creado.criterioAcreditacionId).toBe(criterio.id);
      expect(creado.estado).toBe('Borrador');
      expect(creado.codigo).toBe('PJ-CRI-1');
    });

    it('rechaza un criterio que no pertenece a la carrera del actor', async () => {
      const criterioDeOtraCarrera = await criterios.crear(carreraB, 'C-01', 'De la otra carrera');

      await expect(
        casos.crear(director, {
          aspecto: 'CRITERIO_ACREDITACION',
          elementoId: criterioDeOtraCarrera.id,
        }),
      ).rejects.toThrow(ReglaDeNegocioViolada);
    });
  });

  describe('aspecto Objetivo Educacional (RF-PJ-023 a 025)', () => {
    it('crea el plan sin exigir que el objetivo pertenezca a ninguna carrera (RN1)', async () => {
      const objetivo = await prisma.objetivoEducacional.create({
        data: { codigo: 'OE-01', nombre: 'Egresados competentes', descripcion: 'Descripción.' },
      });

      const creado = await casos.crear(director, {
        aspecto: 'OBJETIVO_EDUCACIONAL',
        elementoId: objetivo.id,
      });

      // La carrera sigue siendo la del actor (RBAC), aunque el objetivo sea
      // catálogo institucional sin carrera propia — §2c y §2a del diseño.
      expect(creado.carreraId).toBe(carreraA);
      expect(creado.objetivoEducacionalId).toBe(objetivo.id);
      expect(creado.codigo).toBe('PJ-OBJ-1');
    });
  });

  describe('aspecto Competencia (RF-PJ-026 a 029) — join real de periodos y mediciones', () => {
    async function sembrarBaseCompetencia(carreraId: string) {
      const planEstudios = await prisma.planEstudios.create({
        data: {
          carreraId,
          codigo: `PE-${carreraId.slice(0, 8)}-v1`,
          version: 1,
          estado: 'VIGENTE',
          duracionAnios: 5,
        },
      });
      const planMedicion = await prisma.planMedicion.create({
        data: {
          planEstudiosId: planEstudios.id,
          tipo: 'DIRECTA',
          codigo: `PM-${randomUUID()}`,
          meta: 0.7,
          estado: 'APROBADO',
        },
      });
      const competenciaId = randomUUID();
      await prisma.competenciaDelPlan.create({
        data: { planMedicionId: planMedicion.id, competenciaId },
      });
      const periodo1 = await prisma.periodoMedicion.create({
        data: { planMedicionId: planMedicion.id, etiqueta: '2026-I', orden: 1 },
      });
      const periodo2 = await prisma.periodoMedicion.create({
        data: { planMedicionId: planMedicion.id, etiqueta: '2026-II', orden: 2 },
      });
      const planEvaluacion = await prisma.planEvaluacion.create({
        data: { planMedicionId: planMedicion.id, codigo: `EV-${randomUUID()}`, estado: 'APROBADO' },
      });
      return { planEstudios, planMedicion, competenciaId, periodo1, periodo2, planEvaluacion };
    }

    it('crea el plan y calcula el porcentaje del periodo anterior con el join real', async () => {
      const base = await sembrarBaseCompetencia(carreraA);
      await prisma.medicionAlcanzada.create({
        data: {
          planEvaluacionId: base.planEvaluacion.id,
          competenciaId: base.competenciaId,
          periodoId: base.periodo1.id,
          porcentajeAlcanzado: 72,
        },
      });

      const creado = await casos.crear(director, {
        aspecto: 'COMPETENCIA',
        elementoId: base.competenciaId,
        periodoId: base.periodo2.id,
        planEvaluacionId: base.planEvaluacion.id,
      });

      expect(creado.carreraId).toBe(carreraA);
      expect(creado.competenciaId).toBe(base.competenciaId);
      expect(creado.periodoId).toBe(base.periodo2.id);
      expect(creado.planEvaluacionId).toBe(base.planEvaluacion.id);
      expect(creado.codigo).toBe('PJ-COM-1');

      // RF-PJ-028: el porcentaje del periodo *anterior* al 2 es el registrado
      // en el periodo 1 — el join real de periodos ordenados + medición.
      const porcentaje = await casos.porcentajeAnteriorDeCompetencia(
        director,
        base.planEvaluacion.id,
        base.competenciaId,
        base.periodo2.id,
      );
      expect(porcentaje).toBe(72);
    });

    it('el primer periodo no tiene anterior: null (RF-PJ-028 RN3)', async () => {
      const base = await sembrarBaseCompetencia(carreraA);

      const porcentaje = await casos.porcentajeAnteriorDeCompetencia(
        director,
        base.planEvaluacion.id,
        base.competenciaId,
        base.periodo1.id,
      );

      expect(porcentaje).toBeNull();
    });

    it('el periodo anterior existe pero no tiene medición registrada: null', async () => {
      const base = await sembrarBaseCompetencia(carreraA);
      // Sin `medicionAlcanzada` para `periodo1`: el periodo anterior existe,
      // pero no hay input de medición para él.

      const porcentaje = await casos.porcentajeAnteriorDeCompetencia(
        director,
        base.planEvaluacion.id,
        base.competenciaId,
        base.periodo2.id,
      );

      expect(porcentaje).toBeNull();
    });

    it('rechaza un plan de evaluación base que no pertenece a la carrera del actor', async () => {
      const baseAjena = await sembrarBaseCompetencia(carreraB);

      await expect(
        casos.crear(director, {
          aspecto: 'COMPETENCIA',
          elementoId: baseAjena.competenciaId,
          periodoId: baseAjena.periodo2.id,
          planEvaluacionId: baseAjena.planEvaluacion.id,
        }),
      ).rejects.toThrow(ReglaDeNegocioViolada);
    });
  });
});
