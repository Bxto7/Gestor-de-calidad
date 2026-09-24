/* eslint-disable @typescript-eslint/unbound-method -- los métodos de los puertos son vi.fn() y se inspeccionan sueltos */
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { ContenidoCurricularPort } from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type { PlanVigenteDeCarreraPort } from '../../../../plan-estudios/application/ports/plan-vigente.port.js';
import type { LecturaResumenCarreraPort } from '../ports/lectura-resumen-carrera.port.js';
import { ConsultarResumenDeCarrera } from './consultar-resumen-de-carrera.use-case.js';

const ACTOR: Actor = { id: 'u-director', nombre: 'María Rojas' };
const AHORA = new Date('2026-09-24T15:00:00Z');

function montar(
  opciones: {
    permitido?: boolean;
    carreraACargo?: string | null;
    plan?: { id: string; codigo: string; version: number; fechaVigencia: Date | null } | null;
    carrera?: { id: string; codigo: string; nombre: string } | null;
    ahora?: Date;
  } = {},
) {
  const o = {
    permitido: true,
    carreraACargo: 'c1' as string | null,
    plan: { id: 'pe1', codigo: 'PE-1', version: 1, fechaVigencia: new Date('2026-01-15') },
    carrera: { id: 'c1', codigo: 'ISI', nombre: 'Ingeniería de Sistemas' },
    ahora: AHORA,
    ...opciones,
  };

  const autorizacion: AuthorizationPort = {
    puede: vi.fn(async () =>
      o.permitido ? { permitido: true as const } : { permitido: false as const, motivo: 'no' },
    ),
    permisosDe: vi.fn(async () => new Set<string>()),
    carreraACargoDe: vi.fn(async () => o.carreraACargo),
    rolesDe: vi.fn(async () => []),
  };
  const lectura: LecturaResumenCarreraPort = {
    medicionDirectaVigente: vi.fn(async () => null),
    planesMejoraDeCarrera: vi.fn(async () => []),
    actasPorCerrarDeCarrera: vi.fn(async () => []),
    sinResponsableDe: vi.fn(async () => []),
  };
  const planVigente: PlanVigenteDeCarreraPort = {
    planVigenteDeCarrera: vi.fn(async () => o.plan),
  };
  const contenido: ContenidoCurricularPort = {
    planesElegibles: vi.fn(async () => []),
    planPorId: vi.fn(async () => null),
    competenciasDelPlan: vi.fn(async () => []),
    asignaturasDelPlan: vi.fn(async () => []),
    carreraPorId: vi.fn(async () => o.carrera),
  };

  const caso = new ConsultarResumenDeCarrera(
    lectura,
    planVigente,
    contenido,
    autorizacion,
    () => o.ahora,
  );
  return { caso, autorizacion, lectura, planVigente, contenido };
}

describe('ConsultarResumenDeCarrera', () => {
  it('sin el permiso mejora.leer lanza AccesoDenegado y no consulta nada más', async () => {
    const { caso, autorizacion, lectura, planVigente } = montar({ permitido: false });

    await expect(caso.ejecutar(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);

    expect(autorizacion.puede).toHaveBeenCalledWith('u-director', 'mejora.leer', null);
    expect(autorizacion.carreraACargoDe).not.toHaveBeenCalled();
    expect(planVigente.planVigenteDeCarrera).not.toHaveBeenCalled();
    expect(lectura.planesMejoraDeCarrera).not.toHaveBeenCalled();
  });

  it('sin carrera a cargo lanza el 409 con el mensaje esperado y no lee datos', async () => {
    const { caso, lectura } = montar({ carreraACargo: null });

    const fallo = await caso.ejecutar(ACTOR).catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(ReglaDeNegocioViolada);
    expect((fallo as Error).message).toBe('Esta vista necesita una carrera asignada.');
    expect(lectura.planesMejoraDeCarrera).not.toHaveBeenCalled();
  });

  it('si la carrera a cargo ya no existe lanza NoEncontrado', async () => {
    const { caso } = montar({ carrera: null });
    await expect(caso.ejecutar(ACTOR)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('lee siempre de la carrera a cargo del actor', async () => {
    const { caso, lectura, planVigente } = montar({ carreraACargo: 'carrera-del-actor' });

    await caso.ejecutar(ACTOR);

    expect(planVigente.planVigenteDeCarrera).toHaveBeenCalledWith('carrera-del-actor');
    expect(lectura.planesMejoraDeCarrera).toHaveBeenCalledWith('carrera-del-actor');
    expect(lectura.actasPorCerrarDeCarrera).toHaveBeenCalledWith('carrera-del-actor');
  });

  it('sin plan de estudios vigente devuelve plan nulo y no lee mediciones ni evaluación', async () => {
    const { caso, lectura, contenido } = montar({ plan: null });

    const r = await caso.ejecutar(ACTOR);

    expect(r.plan).toBeNull();
    expect(r.kpis.medicionesTotal).toBe(0);
    expect(lectura.medicionDirectaVigente).not.toHaveBeenCalled();
    expect(lectura.sinResponsableDe).not.toHaveBeenCalled();
    expect(contenido.competenciasDelPlan).not.toHaveBeenCalled();
  });

  it('usa la fecha de Lima como hoy: a las 22:00 de Lima un plazo de hoy es POR_VENCER', async () => {
    // 2026-09-25T03:00Z = 24 de septiembre, 22:00 en Lima.
    const { caso, lectura } = montar({ ahora: new Date('2026-09-25T03:00:00Z') });
    vi.mocked(lectura.planesMejoraDeCarrera).mockResolvedValue([
      {
        id: '1',
        codigo: 'PM-1',
        nombre: 'Acción',
        aspecto: 'CRITERIO_ACREDITACION',
        competenciaId: null,
        estado: 'VIGENTE',
        estadoImplementacion: 'PENDIENTE',
        responsable: 'X',
        plazo: new Date('2026-09-24'),
      },
    ]);

    const r = await caso.ejecutar(ACTOR);

    expect(r.planesMejoraAbiertos[0]?.chip).toBe('POR_VENCER');
  });

  it('resuelve los nombres de competencias y asignaturas sin responsable con el puerto curricular', async () => {
    const { caso, lectura, contenido } = montar();
    vi.mocked(lectura.sinResponsableDe).mockResolvedValue([
      { tipo: 'COMPETENCIA', referenciaId: 'k4' },
      { tipo: 'ASIGNATURA', referenciaId: 'a1' },
      { tipo: 'ASIGNATURA', referenciaId: 'desconocida' },
    ]);
    vi.mocked(contenido.competenciasDelPlan).mockResolvedValue([
      { id: 'k4', codigo: 'CPE-04', nombre: 'Comunicación efectiva', activa: true, atributos: [] },
    ]);
    vi.mocked(contenido.asignaturasDelPlan).mockResolvedValue([
      { id: 'a1', codigo: 'RC', nombre: 'Redes de Computadoras', cicloNumero: 7, activa: true },
    ]);

    const r = await caso.ejecutar(ACTOR);

    expect(r.pendientes.map((p) => p.texto)).toEqual([
      'Asignar responsable a CPE-04 · Comunicación efectiva',
      'Asignar responsable a Redes de Computadoras',
      // Lo que ya no está en el plan se sigue contando, con un nombre que no engaña.
      'Asignar responsable a una asignatura que ya no está en el plan',
    ]);
    expect(r.mejoraContinua.evaluacionesSinResponsable).toBe(3);
  });

  it('arma las competencias bajo la meta con el nombre que da el puerto curricular', async () => {
    const { caso, lectura, contenido } = montar();
    vi.mocked(lectura.medicionDirectaVigente).mockResolvedValue({
      meta: 0.7,
      periodos: [
        {
          id: 'p1',
          etiqueta: '2026-10',
          orden: 1,
          fechaCierre: null,
          programadas: 18,
          realizadas: 12,
        },
      ],
      resultados: [{ competenciaId: 'k1', periodoId: 'p1', porcentaje: 55 }],
    });
    vi.mocked(contenido.competenciasDelPlan).mockResolvedValue([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', activa: true, atributos: [] },
    ]);

    const r = await caso.ejecutar(ACTOR);

    expect(r.kpis).toMatchObject({ medicionesCerradas: 12, medicionesTotal: 18 });
    expect(r.competenciasBajoMeta).toEqual([
      { id: 'k1', codigo: 'CPE-01', nombre: 'Comunicación efectiva', alcanzado: 55, meta: 70 },
    ]);
  });
});
