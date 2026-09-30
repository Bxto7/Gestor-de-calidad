import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  DatosReportePlan,
  FiltroBusqueda,
  RepositorioReportesPort,
} from '../ports/reportes.port.js';
import { ConsultarReportes } from './consultar-reportes.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Director de Sistemas' };
const ISI = 'car-isi';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

function datosDePlan(carreraId: string): DatosReportePlan {
  return {
    plan: { id: 'plan-1', codigo: 'PE-ISI-2026-v1', version: 1, estado: 'Vigente', carreraId },
    carrera: 'Sistemas',
    facultad: 'Ingeniería',
    asignaturas: [],
    ciclos: [],
  };
}

function montar(
  opciones: {
    alcance?: AlcanceDeLecturaPort;
    plan?: DatosReportePlan | null;
    permitido?: boolean;
  } = {},
) {
  const busquedas: FiltroBusqueda[] = [];
  let paneles = 0;

  // Solo lo que este caso de uso toca del repositorio.
  const reportes = {
    buscarPlanes: async (filtro: FiltroBusqueda) => {
      busquedas.push(filtro);
      return [];
    },
    datosDePlan: async () => (opciones.plan === undefined ? datosDePlan(ISI) : opciones.plan),
    panel: async () => {
      paneles += 1;
      return {
        facultades: 0,
        carreras: 0,
        planesPorEstado: [],
        asignaturas: 0,
        competencias: 0,
        objetivos: 0,
        carrerasSinPlanVigente: [],
        atributosSinCubrir: [],
        totalAtributos: 0,
      };
    },
  } as unknown as RepositorioReportesPort;

  const autorizacion = {
    puede: async () =>
      opciones.permitido === false
        ? { permitido: false as const, motivo: 'Falta el permiso plan.leer.' }
        : { permitido: true as const },
  } as unknown as AuthorizationPort;

  const caso = new ConsultarReportes(reportes, autorizacion, opciones.alcance ?? sinRestriccion());
  return { caso, busquedas, paneles: () => paneles };
}

describe('buscarPlanes', () => {
  it('sin restricción respeta el filtro que se pide', async () => {
    const { caso, busquedas } = montar();
    await caso.buscarPlanes(ACTOR, { carreraId: IIN });
    expect(busquedas[0]?.carreraId).toBe(IIN);
  });

  it('con alcance de carrera fuerza la carrera propia aunque se pida otra', async () => {
    const { caso, busquedas } = montar({ alcance: soloCarrera(ISI) });
    await caso.buscarPlanes(ACTOR, { carreraId: IIN, texto: 'sist' });
    expect(busquedas[0]).toMatchObject({ carreraId: ISI, texto: 'sist' });
  });

  it('con alcance de carrera y sin carrera asignada devuelve la lista vacía sin consultar', async () => {
    const { caso, busquedas } = montar({ alcance: soloCarrera(null) });
    expect(await caso.buscarPlanes(ACTOR, {})).toEqual([]);
    expect(busquedas).toEqual([]);
  });

  it('sin plan.leer es AccesoDenegado antes de mirar el alcance', async () => {
    const { caso } = montar({ permitido: false, alcance: soloCarrera(ISI) });
    await expect(caso.buscarPlanes(ACTOR, {})).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('reporteDePlan', () => {
  it('el plan de la carrera propia devuelve su reporte', async () => {
    const { caso } = montar({ alcance: soloCarrera(ISI) });
    await expect(caso.reporteDePlan(ACTOR, 'plan-1')).resolves.toMatchObject({
      plan: { id: 'plan-1' },
    });
  });

  it('el plan de otra carrera responde NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera(IIN) });
    await expect(caso.reporteDePlan(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('un plan inexistente responde NoEncontrado', async () => {
    const { caso } = montar({ plan: null });
    await expect(caso.reporteDePlan(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin restricción lee el reporte de cualquier plan', async () => {
    const { caso } = montar({ plan: datosDePlan(IIN) });
    await expect(caso.reporteDePlan(ACTOR, 'plan-1')).resolves.toBeDefined();
  });
});

describe('panel institucional', () => {
  it('sin restricción devuelve el panel', async () => {
    const { caso, paneles } = montar();
    await caso.panel(ACTOR);
    expect(paneles()).toBe(1);
  });

  it('con alcance de carrera responde AccesoDenegado y no consulta los agregados', async () => {
    const { caso, paneles } = montar({ alcance: soloCarrera(ISI) });
    await expect(caso.panel(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(paneles()).toBe(0);
  });
});
