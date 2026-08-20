/**
 * Pruebas del caso de uso de asignaturas.
 *
 * El foco está en dos sitios: las precondiciones compartidas —que ninguna
 * escritura se cuele con el plan ya aprobado— y el detalle del evento de
 * auditoría, porque RF059 no pide "registrar que hubo un cambio" sino registrar
 * el cambio, y esa diferencia solo se comprueba mirando el texto.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import { AccesoDenegado, NoEncontrado } from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  DatosAsignatura,
  DatosAsignaturaEntrada,
  FiltroAsignaturas,
  RepositorioAsignaturaPort,
} from '../ports/asignatura.port.js';
import type { RepositorioContenidoPort, RepositorioPlanPort } from '../ports/repositorios.port.js';
import { GestionarAsignaturas } from './gestionar-asignaturas.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const ISI = 'car-isi';

const ENTRADA: DatosAsignaturaEntrada = {
  nombre: 'Álgebra Lineal',
  descripcion: 'Sumilla sintética del curso de álgebra lineal.',
  tipo: 'General',
  condicion: 'Obligatoria',
  creditos: 4,
  horasTeoricas: 3,
  competenciaIds: [],
};

function asignatura(sobre: Partial<DatosAsignatura> = {}): DatosAsignatura {
  return {
    id: 'asig-1',
    planId: 'plan-1',
    codigo: 'ISI-101',
    nombre: 'Álgebra Lineal',
    descripcion: 'Sumilla sintética del curso de álgebra lineal.',
    tipo: 'General',
    condicion: 'Obligatoria',
    creditos: 4,
    horasTeoricas: 3,
    cicloNumero: 1,
    orden: 0,
    activa: true,
    competencias: [],
    creadoEn: new Date('2026-01-01'),
    ...sobre,
  };
}

function plan(estado: EstadoPlan): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: 'plan-1',
    carreraId: ISI,
    codigo: 'PE-ISI-2026-v1',
    version: 1,
    estado,
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function montar(
  opciones: {
    existente?: DatosAsignatura | null;
    plan?: PlanDeEstudios | null;
    nombreDuplicado?: boolean;
    competenciasValidas?: string[];
    codigos?: string[];
    dependientes?: string[];
    permitido?: boolean;
  } = {},
) {
  const publicados: DomainEvent[] = [];
  const creadas: { codigo: string; datos: DatosAsignaturaEntrada }[] = [];
  const actualizadas: DatosAsignaturaEntrada[] = [];
  const estados: boolean[] = [];
  const filtros: (FiltroAsignaturas | undefined)[] = [];

  const repo: RepositorioAsignaturaPort = {
    listar: async (_planId, filtro) => {
      filtros.push(filtro);
      return [asignatura()];
    },
    porId: async () => (opciones.existente === undefined ? asignatura() : opciones.existente),
    codigosDe: async () => opciones.codigos ?? [],
    crear: async (_planId, codigo, datos) => {
      creadas.push({ codigo, datos });
      return asignatura({ codigo, ...datos, competencias: [] });
    },
    actualizar: async (_id, datos) => {
      actualizadas.push(datos);
      return asignatura({ ...datos, competencias: [] });
    },
    cambiarEstado: async (_id, activa) => {
      estados.push(activa);
      return asignatura({ activa });
    },
    existeNombreEnPlan: async () => opciones.nombreDuplicado ?? false,
    competenciasValidas: async (ids) => opciones.competenciasValidas ?? [...ids],
    impactoDeInactivar: async () => ({
      dependientes: opciones.dependientes ?? [],
      cicloNumero: 1,
    }),
  };

  const planes = {
    porId: async () => (opciones.plan === undefined ? plan('Borrador') : opciones.plan),
  } as unknown as RepositorioPlanPort;

  const contenido = {
    carreraDe: async () => ({ id: ISI, codigo: 'ISI', duracionAnios: 5 }),
  } as unknown as RepositorioContenidoPort;

  const autorizacion: AuthorizationPort = {
    puede: async () =>
      opciones.permitido === false
        ? { permitido: false, motivo: 'No dirige la carrera.' }
        : { permitido: true },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => ISI,
  };

  const eventos: PublicadorDeEventos = { publicar: async (e) => void publicados.push(...e) };
  const caso = new GestionarAsignaturas(repo, planes, contenido, autorizacion, eventos);

  return { caso, publicados, creadas, actualizadas, estados, filtros };
}

describe('RF047 — registrar asignatura', () => {
  it('recorta y colapsa el nombre antes de guardar', async () => {
    const { caso, creadas } = montar();
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, nombre: '  Álgebra   Lineal  ' });
    expect(creadas[0]?.datos.nombre).toBe('Álgebra Lineal');
  });

  it('RN1: exige nombre', async () => {
    const { caso } = montar();
    await expect(caso.crear(ACTOR, 'plan-1', { ...ENTRADA, nombre: '   ' })).rejects.toThrow(
      /nombre .* obligatorio/,
    );
  });

  it('RN1: exige descripción', async () => {
    // La descripción es la sumilla: sin ella el plan queda formalmente completo
    // y materialmente inservible para una acreditación.
    const { caso } = montar();
    await expect(caso.crear(ACTOR, 'plan-1', { ...ENTRADA, descripcion: '  ' })).rejects.toThrow(
      /descripción .* obligatoria/,
    );
  });

  it('rechaza un nombre repetido en el mismo plan', async () => {
    const { caso, creadas } = montar({ nombreDuplicado: true });
    await expect(caso.crear(ACTOR, 'plan-1', ENTRADA)).rejects.toThrow(/Ya existe otra asignatura/);
    expect(creadas).toHaveLength(0);
  });

  it('404 si el plan no existe', async () => {
    const { caso } = montar({ plan: null });
    await expect(caso.crear(ACTOR, 'plan-x', ENTRADA)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('deniega sin permiso, antes de tocar nada', async () => {
    const { caso, creadas } = montar({ permitido: false });
    await expect(caso.crear(ACTOR, 'plan-1', ENTRADA)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(creadas).toHaveLength(0);
  });
});

describe('RF053 — código autogenerado', () => {
  it('la primera asignatura del plan arranca en 101', async () => {
    const { caso, creadas } = montar({ codigos: [] });
    await caso.crear(ACTOR, 'plan-1', ENTRADA);
    expect(creadas[0]?.codigo).toBe('ISI-101');
  });

  it('continúa el correlativo del plan', async () => {
    const { caso, creadas } = montar({ codigos: ['ISI-101', 'ISI-102'] });
    await caso.crear(ACTOR, 'plan-1', ENTRADA);
    expect(creadas[0]?.codigo).toBe('ISI-103');
  });

  it('RN1: el código enviado por el cliente se ignora', async () => {
    // La firma no lo admite, y esta prueba fija esa decisión: si alguien
    // añadiera `codigo` a la entrada, aquí se notaría.
    const { caso, creadas } = montar({ codigos: ['ISI-101'] });
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, ...{ codigo: 'HACK-999' } });
    expect(creadas[0]?.codigo).toBe('ISI-102');
  });
});

describe('RF048 / RF056 — listas cerradas', () => {
  it('rechaza un tipo fuera de la lista', async () => {
    const { caso } = montar();
    await expect(
      caso.crear(ACTOR, 'plan-1', { ...ENTRADA, tipo: 'Optativa' as never }),
    ).rejects.toThrow(/Tipo de asignatura no válido/);
  });

  it('rechaza una condición fuera de la lista', async () => {
    const { caso } = montar();
    await expect(
      caso.crear(ACTOR, 'plan-1', { ...ENTRADA, condicion: 'Libre' as never }),
    ).rejects.toThrow(/Condición no válida/);
  });

  it('acepta los tres tipos previstos', async () => {
    for (const tipo of ['General', 'Transversal', 'Especialidad'] as const) {
      const { caso, creadas } = montar();
      await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, tipo });
      expect(creadas[0]?.datos.tipo, tipo).toBe(tipo);
    }
  });
});

describe('RF054 / RF055 — créditos y horas', () => {
  it('RF054 RN1: los créditos deben ser mayores a cero', async () => {
    const { caso } = montar();
    for (const creditos of [0, -1]) {
      await expect(
        caso.crear(ACTOR, 'plan-1', { ...ENTRADA, creditos }),
        String(creditos),
      ).rejects.toThrow(/mayor a cero/);
    }
  });

  it('rechaza créditos fraccionarios', async () => {
    const { caso } = montar();
    await expect(caso.crear(ACTOR, 'plan-1', { ...ENTRADA, creditos: 3.5 })).rejects.toThrow(
      /entero/,
    );
  });

  it('RF055 RN1: cero horas teóricas es válido', async () => {
    // Un curso íntegramente práctico existe; el requisito dice "no negativo",
    // no "positivo".
    const { caso, creadas } = montar();
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, horasTeoricas: 0 });
    expect(creadas[0]?.datos.horasTeoricas).toBe(0);
  });

  it('RF055 RN1: rechaza horas negativas', async () => {
    const { caso } = montar();
    await expect(caso.crear(ACTOR, 'plan-1', { ...ENTRADA, horasTeoricas: -1 })).rejects.toThrow(
      /no negativo/,
    );
  });
});

describe('RF049 — competencias vinculadas', () => {
  it('permite crear sin ninguna competencia', async () => {
    // RN1 la exige "antes de aprobarse el plan", y eso lo comprueba RF094. Aquí
    // impediría registrar el catálogo antes de definir las competencias, que es
    // el orden en que se trabaja.
    const { caso, creadas } = montar();
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, competenciaIds: [] });
    expect(creadas[0]?.datos.competenciaIds).toEqual([]);
  });

  it('rechaza identificadores que no existen', async () => {
    const { caso } = montar({ competenciasValidas: ['c-1'] });
    await expect(
      caso.crear(ACTOR, 'plan-1', { ...ENTRADA, competenciaIds: ['c-1', 'c-fantasma'] }),
    ).rejects.toThrow(/No existen o están inactivas 1/);
  });

  it('descarta duplicados antes de guardar', async () => {
    const { caso, creadas } = montar();
    await caso.crear(ACTOR, 'plan-1', { ...ENTRADA, competenciaIds: ['c-1', 'c-1', 'c-2'] });
    expect(creadas[0]?.datos.competenciaIds).toEqual(['c-1', 'c-2']);
  });
});

describe('RF050 / RF027 — el contenido se congela con el plan', () => {
  it('rechaza crear, editar e inactivar en Aprobado, Vigente e Histórico', async () => {
    for (const estado of ['Aprobado', 'Vigente', 'Histórico'] as const) {
      const { caso, creadas, actualizadas, estados } = montar({ plan: plan(estado) });

      await expect(caso.crear(ACTOR, 'plan-1', ENTRADA), estado).rejects.toThrow(
        /no admiten cambios/,
      );
      await expect(caso.editar(ACTOR, 'asig-1', ENTRADA), estado).rejects.toThrow(
        /no admiten cambios/,
      );
      await expect(caso.cambiarEstado(ACTOR, 'asig-1', false), estado).rejects.toThrow(
        /no admiten cambios/,
      );

      expect([...creadas, ...actualizadas, ...estados], estado).toHaveLength(0);
    }
  });

  it('permite editar en Borrador y En revisión', async () => {
    for (const estado of ['Borrador', 'En revisión'] as const) {
      const { caso, actualizadas } = montar({ plan: plan(estado) });
      await caso.editar(ACTOR, 'asig-1', ENTRADA);
      expect(actualizadas, estado).toHaveLength(1);
    }
  });

  it('leer un plan congelado sí se permite', async () => {
    // Para eso existe el histórico: consultarlo no es editarlo.
    const { caso } = montar({ plan: plan('Histórico') });
    await expect(caso.listar(ACTOR, 'plan-1')).resolves.toHaveLength(1);
  });

  it('404 si la asignatura no existe', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.editar(ACTOR, 'x', ENTRADA)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('al editar, el nombre no choca consigo mismo', async () => {
    const { caso, actualizadas } = montar();
    await caso.editar(ACTOR, 'asig-1', ENTRADA);
    expect(actualizadas).toHaveLength(1);
  });
});

describe('RF059 — la auditoría dice qué cambió', () => {
  it('el alta registra código, nombre y créditos', async () => {
    const { caso, publicados } = montar();
    await caso.crear(ACTOR, 'plan-1', ENTRADA);
    expect(publicados[0]?.nombre).toBe('asignatura.creada');
    expect(publicados[0]?.detalle).toContain('ISI-101');
    expect(publicados[0]?.detalle).toContain('4 crédito(s)');
  });

  it('la edición enumera los campos que se movieron, con sus valores', async () => {
    const { caso, publicados } = montar({ existente: asignatura({ creditos: 4 }) });
    await caso.editar(ACTOR, 'asig-1', { ...ENTRADA, creditos: 5, condicion: 'Electiva' });

    const detalle = publicados[0]?.detalle ?? '';
    expect(detalle).toContain('créditos «4» → «5»');
    expect(detalle).toContain('condición «Obligatoria» → «Electiva»');
    // Lo que no cambió no aparece: un detalle que lo repita todo es ilegible.
    expect(detalle).not.toContain('nombre');
  });

  it('la descripción se registra como cambiada, sin volcar el texto', async () => {
    const { caso, publicados } = montar();
    await caso.editar(ACTOR, 'asig-1', { ...ENTRADA, descripcion: 'Otra sumilla distinta.' });
    expect(publicados[0]?.detalle).toContain('se actualizó la descripción');
    expect(publicados[0]?.detalle).not.toContain('Otra sumilla distinta');
  });

  it('cuenta las competencias vinculadas y desvinculadas', async () => {
    const { caso, publicados } = montar({
      existente: asignatura({
        competencias: [{ id: 'c-1', codigo: 'CPE-01', nombre: 'Una' }],
      }),
    });
    await caso.editar(ACTOR, 'asig-1', { ...ENTRADA, competenciaIds: ['c-2', 'c-3'] });

    const detalle = publicados[0]?.detalle ?? '';
    expect(detalle).toContain('se vincularon 2 competencia(s)');
    expect(detalle).toContain('se desvincularon 1 competencia(s)');
  });

  it('guardar sin cambios lo dice, en vez de fingir una edición', async () => {
    const { caso, publicados } = montar();
    await caso.editar(ACTOR, 'asig-1', ENTRADA);
    expect(publicados[0]?.detalle).toContain('sin cambios');
  });
});

describe('RF052 — inactivar', () => {
  it('informa del impacto antes de confirmar', async () => {
    const { caso } = montar({ dependientes: ['ISI-201', 'ISI-305'] });
    const impacto = await caso.impactoDeInactivar(ACTOR, 'asig-1');
    expect(impacto.dependientes).toEqual(['ISI-201', 'ISI-305']);
  });

  it('deja constancia en la bitácora de a quién afectaba', async () => {
    // Después de inactivar, el motivo de la decisión ya no se puede reconstruir.
    const { caso, publicados } = montar({ dependientes: ['ISI-201'] });
    await caso.cambiarEstado(ACTOR, 'asig-1', false);
    expect(publicados[0]?.detalle).toContain('inactivada');
    expect(publicados[0]?.detalle).toContain('ISI-201');
  });

  it('reactivar también queda registrado', async () => {
    const { caso, publicados } = montar();
    await caso.cambiarEstado(ACTOR, 'asig-1', true);
    expect(publicados[0]?.detalle).toContain('reactivada');
  });

  it('reactivar no consulta dependientes: no rompe nada', async () => {
    const { caso, publicados } = montar({ dependientes: ['ISI-201'] });
    await caso.cambiarEstado(ACTOR, 'asig-1', true);
    expect(publicados[0]?.detalle).not.toContain('ISI-201');
  });
});

describe('RF051 / RF057 / RF058 — consulta', () => {
  it('traslada los filtros combinados al repositorio', async () => {
    const { caso, filtros } = montar();
    await caso.listar(ACTOR, 'plan-1', { tipo: 'General', condicion: 'Electiva', texto: 'álg' });
    expect(filtros[0]).toEqual({ tipo: 'General', condicion: 'Electiva', texto: 'álg' });
  });

  it('RF058 pide solo las activas sin ciclo', async () => {
    const { caso, filtros } = montar();
    await caso.sinCiclo(ACTOR, 'plan-1');
    expect(filtros[0]).toEqual({ sinCiclo: true, activa: true });
  });

  it('leer exige permiso', async () => {
    const { caso } = montar({ permitido: false });
    await expect(caso.listar(ACTOR, 'plan-1')).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it('el detalle da 404 en vez de null', async () => {
    const { caso } = montar({ existente: null });
    await expect(caso.porId(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('listar un plan inexistente da 404, no una lista vacía', async () => {
    // Devolver [] escondería un identificador equivocado detrás de un resultado
    // que parece legítimo: "este plan no tiene asignaturas".
    const { caso } = montar({ plan: null });
    await expect(caso.listar(ACTOR, 'plan-x')).rejects.toBeInstanceOf(NoEncontrado);
  });
});
