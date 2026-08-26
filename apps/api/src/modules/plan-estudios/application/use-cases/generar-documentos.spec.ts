/**
 * Pruebas del ciclo de solicitud y consulta de documentos.
 *
 * Lo que se comprueba aquí son requisitos, no fontanería: RF092 dice desde qué
 * estado puede pedirse una evidencia de aprobación y RF084 qué pasa cuando no
 * hay nada que exportar. Son reglas que un evaluador puede llegar a preguntar,
 * y por eso están afirmadas donde se leen.
 */

import { describe, expect, it } from 'vitest';

import type { Actor, DomainEvent } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import { PlanDeEstudios } from '../../domain/entities/plan-de-estudios.js';
import type { EstadoPlan } from '../../domain/value-objects/estado-plan.js';
import type {
  AlmacenDeArchivosPort,
  RepositorioDocumentosPort,
  TipoDocumento,
  TrabajoDocumento,
} from '../ports/documentos.port.js';
import type {
  EventoDeAprobacion,
  RepositorioAprobacionesPort,
  RepositorioPlanPort,
} from '../ports/repositorios.port.js';
import { ConsultarDocumento, SolicitarDocumento } from './generar-documentos.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Ana Quispe' };
const PLAN_ID = 'plan-1';

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true, motivo: '' }),
    permisosDe: async () => [],
    carrerasDe: async () => [],
  } as unknown as AuthorizationPort;
}

function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso reporte.generar.' }),
    permisosDe: async () => [],
    carrerasDe: async () => [],
  } as unknown as AuthorizationPort;
}

function plan(estado: EstadoPlan = 'Aprobado'): PlanDeEstudios {
  return PlanDeEstudios.desde({
    id: PLAN_ID,
    carreraId: 'car-1',
    codigo: 'PE-ISI-2018-v1',
    version: 1,
    estado,
    duracionAnios: 5,
    fechaVigencia: null,
    derivadoDeId: null,
  });
}

function trabajo(sobre: Partial<TrabajoDocumento> = {}): TrabajoDocumento {
  return {
    id: 'trab-1',
    planId: PLAN_ID,
    tipo: 'RESUMEN_PLAN',
    estado: 'En cola',
    nombreArchivo: null,
    tipoMime: null,
    bytes: null,
    error: null,
    solicitadoPor: ACTOR.id,
    solicitadoEn: new Date('2026-08-25T15:00:00Z'),
    terminadoEn: null,
    ...sobre,
  };
}

function montar(
  opciones: {
    estado?: EstadoPlan;
    planExiste?: boolean;
    aprobaciones?: EventoDeAprobacion[];
    autorizacion?: AuthorizationPort;
  } = {},
) {
  const encolados: string[] = [];
  const publicados: DomainEvent[] = [];
  const creados: { tipo: TipoDocumento }[] = [];

  const planes = {
    porId: async () => (opciones.planExiste === false ? null : plan(opciones.estado)),
  } as unknown as RepositorioPlanPort;

  const aprobaciones = {
    listar: async () => opciones.aprobaciones ?? [],
  } as unknown as RepositorioAprobacionesPort;

  const documentos = {
    crear: async ({ tipo }: { tipo: TipoDocumento }) => {
      creados.push({ tipo });
      return trabajo({ tipo });
    },
  } as unknown as RepositorioDocumentosPort;

  const caso = new SolicitarDocumento(
    planes,
    aprobaciones,
    documentos,
    {
      encolar: async (id) => {
        // Se registra el orden: encolar antes de que el trabajo exista en la
        // base haría que el worker buscara una fila que todavía no está.
        if (creados.length === 0) throw new Error('Se encoló antes de persistir el trabajo.');
        encolados.push(id);
      },
    },
    opciones.autorizacion ?? permitirTodo(),
    { publicar: async (e) => void publicados.push(...e) },
  );

  return { caso, encolados, publicados, creados };
}

describe('solicitar un documento', () => {
  it('devuelve el trabajo encolado, no el archivo', async () => {
    // 202 y no 201: el documento no existe todavía.
    const { caso, encolados } = montar();
    const t = await caso.ejecutar(ACTOR, PLAN_ID, 'RESUMEN_PLAN');

    expect(t.estado).toBe('En cola');
    expect(encolados).toEqual([t.id]);
  });

  it('404 si el plan no existe', async () => {
    const { caso } = montar({ planExiste: false });
    await expect(caso.ejecutar(ACTOR, PLAN_ID, 'RESUMEN_PLAN')).rejects.toBeInstanceOf(
      NoEncontrado,
    );
  });

  it('exige el permiso de generar reportes', async () => {
    const { caso, encolados } = montar({ autorizacion: denegar() });
    await expect(caso.ejecutar(ACTOR, PLAN_ID, 'RESUMEN_PLAN')).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    expect(encolados).toHaveLength(0);
  });

  it('deja constancia en la bitácora de quién lo pidió', async () => {
    // El PDF puede acabar en un expediente de acreditación: tiene que poder
    // responderse quién lo generó.
    const { caso, publicados } = montar();
    await caso.ejecutar(ACTOR, PLAN_ID, 'EVIDENCIA_APROBACION');

    expect(publicados[0]?.detalle).toContain('PE-ISI-2018-v1');
    expect(publicados[0]?.detalle).toContain('Evidencia de aprobación');
    expect(publicados[0]?.usuarioNombre).toBe('Ana Quispe');
  });

  it('el PDF del plan se puede pedir en cualquier estado', async () => {
    // RF072 no pone precondición de estado: un plan en Borrador también se
    // documenta, indicando lo que le falta.
    const { caso } = montar({ estado: 'Borrador' });
    await expect(caso.ejecutar(ACTOR, PLAN_ID, 'RESUMEN_PLAN')).resolves.toBeTruthy();
  });
});

describe('RF092 — precondición de la evidencia de aprobación', () => {
  it('se niega mientras el plan no haya sido aprobado', async () => {
    const { caso } = montar({ estado: 'En revisión' });
    await expect(caso.ejecutar(ACTOR, PLAN_ID, 'EVIDENCIA_APROBACION')).rejects.toBeInstanceOf(
      ReglaDeNegocioViolada,
    );
  });

  it('el mensaje dice en qué estado está, no solo que no se puede', async () => {
    const { caso } = montar({ estado: 'Borrador' });
    await expect(caso.ejecutar(ACTOR, PLAN_ID, 'EVIDENCIA_APROBACION')).rejects.toThrow(
      /estado Borrador/,
    );
  });

  it.each<EstadoPlan>(['Aprobado', 'Vigente', 'Histórico'])(
    'se permite desde %s',
    async (estado) => {
      // RF092 dice literalmente «Aprobado». Se aceptan también los dos estados
      // posteriores: la lectura estricta dejaría sin evidencia a los planes
      // archivados, que son justo los que pide un evaluador.
      const { caso } = montar({ estado });
      await expect(caso.ejecutar(ACTOR, PLAN_ID, 'EVIDENCIA_APROBACION')).resolves.toBeTruthy();
    },
  );
});

describe('RF084 — precondición del histórico de cambios', () => {
  it('sin cambios registrados avisa en vez de generar un documento vacío', async () => {
    // El requisito lo pide así: «Si no existen cambios registrados, el sistema
    // informa que no hay datos para exportar». Un PDF vacío parece un fallo.
    const { caso, encolados } = montar({ aprobaciones: [] });

    await expect(caso.ejecutar(ACTOR, PLAN_ID, 'HISTORICO_CAMBIOS')).rejects.toThrow(
      /no hay nada que exportar/,
    );
    expect(encolados).toHaveLength(0);
  });

  it('con al menos un cambio se genera', async () => {
    const { caso } = montar({
      aprobaciones: [
        {
          id: 'e-1',
          planId: PLAN_ID,
          accion: 'Aprobado',
          comentario: null,
          usuarioNombre: 'Ana',
          fecha: new Date('2026-01-01'),
        },
      ],
    });
    await expect(caso.ejecutar(ACTOR, PLAN_ID, 'HISTORICO_CAMBIOS')).resolves.toBeTruthy();
  });
});

describe('consultar y descargar', () => {
  function montarConsulta(
    t: TrabajoDocumento | null,
    opciones: { ubicacion?: string | null; autorizacion?: AuthorizationPort } = {},
  ) {
    const documentos = {
      porId: async () => t,
      // `in` y no `??`: con `?? 'trab-1.pdf'`, pasar `ubicacion: null` —que es
      // justo el caso que se quiere probar— devolvería la ruta por defecto.
      ubicacionDe: async () => ('ubicacion' in opciones ? opciones.ubicacion : 'trab-1.pdf'),
      listarDePlan: async () => (t ? [t] : []),
    } as unknown as RepositorioDocumentosPort;

    const almacen: AlmacenDeArchivosPort = {
      guardar: async () => 'x',
      leer: async () => Buffer.from('%PDF-1.3'),
    };

    return new ConsultarDocumento(
      documentos,
      { porId: async () => plan() } as unknown as RepositorioPlanPort,
      almacen,
      opciones.autorizacion ?? permitirTodo(),
    );
  }

  it('descarga el archivo cuando está listo', async () => {
    const caso = montarConsulta(
      trabajo({ estado: 'Listo', nombreArchivo: 'plan.pdf', tipoMime: 'application/pdf' }),
    );
    const archivo = await caso.descargar(ACTOR, 'trab-1');

    expect(archivo.nombreArchivo).toBe('plan.pdf');
    expect(archivo.contenido.toString()).toContain('%PDF');
  });

  it('mientras se genera, dice en qué punto va', async () => {
    const caso = montarConsulta(trabajo({ estado: 'Generando' }));
    await expect(caso.descargar(ACTOR, 'trab-1')).rejects.toThrow(/todavía se está generando/);
  });

  it('si falló, la descarga devuelve el motivo del fallo', async () => {
    // No un error genérico: el motivo se guardó precisamente para esto.
    const caso = montarConsulta(
      trabajo({ estado: 'Fallido', error: 'No se pudo generar: el plan ya no existe.' }),
    );
    await expect(caso.descargar(ACTOR, 'trab-1')).rejects.toThrow(/el plan ya no existe/);
  });

  it('un trabajo listo sin archivo se denuncia, no devuelve cero bytes', async () => {
    const caso = montarConsulta(
      trabajo({ estado: 'Listo', nombreArchivo: 'plan.pdf', tipoMime: 'application/pdf' }),
      { ubicacion: null },
    );
    await expect(caso.descargar(ACTOR, 'trab-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('404 si el trabajo no existe', async () => {
    const caso = montarConsulta(null);
    await expect(caso.estado(ACTOR, 'trab-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('descargar exige el mismo permiso que generar', async () => {
    // Si bastara con poder leer el plan, cualquiera con acceso de consulta se
    // llevaría la evidencia que otro generó, saltándose el control de origen.
    const caso = montarConsulta(trabajo({ estado: 'Listo' }), { autorizacion: denegar() });
    await expect(caso.descargar(ACTOR, 'trab-1')).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
