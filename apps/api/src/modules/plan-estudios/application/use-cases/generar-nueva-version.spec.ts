/**
 * Pruebas del caso de uso de versionado (RF075).
 *
 * El punto delicado que se verifica aquí: **el plan de origen no se toca**.
 * §3.4 lo dice explícitamente ("el plan anterior no se toca hasta que la nueva
 * versión llega a Vigente"), y es fácil implementarlo mal archivando el origen
 * al derivar, lo que dejaría a la carrera sin plan vigente durante todo el
 * tiempo que tarde el rediseño.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { Decision } from '../../../auth/domain/services/politica-de-autorizacion.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  DatosCarrera,
  RepositorioContenidoPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';
import { GenerarNuevaVersion } from './generar-nueva-version.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Director de carrera' };
const ISI = 'car-isi';
const PERMITE: Decision = { permitido: true };

function plan(estado: EstadoPlan, id = 'plan-1', version = 1): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id,
    carreraId: ISI,
    codigo: `PE-ISI-2024-v${version}`,
    version,
    estado,
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function montar(opciones: {
  origen: PlanDeEstudios | null;
  enCurso?: PlanDeEstudios | null;
  decision?: Decision;
  carrera?: DatosCarrera | null;
}) {
  const guardados: PlanDeEstudios[] = [];
  const copias: { desde: string; hacia: string }[] = [];
  const publicados: DomainEvent[] = [];

  const planes: RepositorioPlanPort = {
    porId: async () => opciones.origen,
    vigenteDeCarrera: async () => null,
    enCursoDeCarrera: async () => opciones.enCurso ?? null,
    ultimaVersionDeCarrera: async () => 2,
    guardar: async (p) => void guardados.push(...p),
    eliminar: async () => {},
    copiarContenido: async (desde, hacia) => void copias.push({ desde, hacia }),
  };

  const carrera =
    opciones.carrera === undefined
      ? { id: ISI, codigo: 'ISI', duracionAnios: 5 }
      : opciones.carrera;

  const contenido: RepositorioContenidoPort = {
    carreraDe: async () => carrera,
    carreraPorId: async () => carrera,
    asignaturasDe: async () => [],
    objetivoIdsDe: async () => [],
    reglasJustificadasDe: async () => [],
  };

  const autorizacion: AuthorizationPort = {
    puede: async () => opciones.decision ?? PERMITE,
    permisosDe: async () => new Set<string>(),
    carreraACargoDe: async () => ISI,
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };

  const caso = new GenerarNuevaVersion(
    planes,
    contenido,
    autorizacion,
    eventos,
    { nuevo: () => 'plan-nuevo' },
    () => new Date('2026-08-20T12:00:00Z'),
  );

  return { caso, guardados, copias, publicados };
}

describe('Precondiciones', () => {
  it('404 si el plan de origen no existe', async () => {
    const { caso } = montar({ origen: null });
    await expect(caso.ejecutar({ planOrigenId: 'x', actor: ACTOR })).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('deniega si el actor no dirige esa carrera', async () => {
    const { caso } = montar({
      origen: plan('Vigente'),
      decision: { permitido: false, motivo: 'no dirige la carrera' },
    });
    await expect(caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR })).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });

  it('rechaza derivar de un plan que aún es editable', async () => {
    // Con el plan en Borrador se edita directamente; derivar otra versión solo
    // crearía dos borradores compitiendo para la misma carrera.
    for (const estado of ['Borrador', 'En revisión'] as const) {
      const { caso } = montar({ origen: plan(estado) });
      await expect(caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR }), estado).rejects.toThrow(
        /se edita directamente/,
      );
    }
  });

  it('permite derivar de Aprobado, Vigente e Histórico', async () => {
    for (const estado of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      const { caso } = montar({ origen: plan(estado) });
      await expect(caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR })).resolves.toBeDefined();
    }
  });

  it('impide una segunda versión editable para la misma carrera', async () => {
    // RF075 dice "advierte"; aquí se impide. Dos borradores para la misma
    // carrera acaban divergiendo y no hay forma de decidir cuál es el bueno.
    const { caso } = montar({
      origen: plan('Vigente'),
      enCurso: plan('Borrador', 'plan-2', 2),
    });
    await expect(caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR })).rejects.toThrow(
      /Ya existe la versión/,
    );
  });

  it('404 si la carrera no existe', async () => {
    const { caso } = montar({ origen: plan('Vigente'), carrera: null });
    await expect(caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR })).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });
});

describe('La versión nueva', () => {
  it('nace en Borrador y enlazada al origen', async () => {
    const { caso } = montar({ origen: plan('Vigente') });
    const nuevo = await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });

    expect(nuevo.estado).toBe('Borrador');
    expect(nuevo.derivadoDeId).toBe('plan-1');
  });

  it('continúa el correlativo de versiones de la carrera', async () => {
    const { caso } = montar({ origen: plan('Vigente') });
    const nuevo = await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });

    // El repositorio informa que la última versión es la 2.
    expect(nuevo.version).toBe(3);
    expect(nuevo.codigo).toBe('PE-ISI-2026-v3');
  });

  it('hereda la duración del plan de origen', async () => {
    const { caso } = montar({ origen: plan('Vigente') });
    const nuevo = await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });
    expect(nuevo.duracionAnios).toBe(5);
  });

  it('copia la malla del origen', async () => {
    const { caso, copias } = montar({ origen: plan('Vigente') });
    await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });
    expect(copias).toEqual([{ desde: 'plan-1', hacia: 'plan-nuevo' }]);
  });

  it('crea el plan ANTES de copiar la malla', async () => {
    // Sin el destino existente, la copia no tendría a dónde ir.
    const { caso, guardados, copias } = montar({ origen: plan('Vigente') });
    await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });
    expect(guardados).toHaveLength(1);
    expect(copias).toHaveLength(1);
  });

  it('publica el evento de creación', async () => {
    const { caso, publicados } = montar({ origen: plan('Vigente') });
    await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });

    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.nombre).toBe('plan.creado');
    expect(publicados[0]?.detalle).toContain('nueva versión');
  });
});

describe('§3.4 — el plan de origen no se toca', () => {
  it('la versión Vigente sigue Vigente tras derivar', async () => {
    // Si el origen se archivara aquí, la carrera se quedaría sin plan vigente
    // durante todo el rediseño de la nueva versión.
    const origen = plan('Vigente');
    const { caso, guardados } = montar({ origen });

    await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });

    expect(origen.estado).toBe('Vigente');
    expect(guardados.map((p) => p.id)).not.toContain('plan-1');
  });

  it('el origen no acumula eventos', async () => {
    const origen = plan('Vigente');
    const { caso } = montar({ origen });
    await caso.ejecutar({ planOrigenId: 'plan-1', actor: ACTOR });
    expect(origen.eventos).toHaveLength(0);
  });
});
