/**
 * Pruebas del generador de documentos del plan de medición (RF-PM-027).
 *
 * El caso de uso cruza dos procesos: `encolar` corre en la API y `ejecutar` en
 * el worker. Lo que se afirma aquí es lo que ninguna pieza suelta puede saber:
 * el orden entre persistir y encolar, qué renderizador toca según el tipo, y
 * que un fallo del worker acabe guardado en vez de perdido.
 */

import { describe, expect, it } from 'vitest';

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
  RenderizadorHojaPort,
  RenderizadorPdfPort,
} from '../../../../platform/documentos/puertos.js';
import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type { DatosParaDocumentoMedicion } from '../../domain/documentos/armar-documento-medicion.js';
import type {
  RepositorioDatosDocumentoMedicionPort,
  RepositorioDocumentosMedicionPort,
  TrabajoDocumentoMedicion,
} from '../ports/documentos-medicion.port.js';

import {
  ConsultarDocumentoMedicion,
  GenerarDocumentoMedicion,
} from './generar-documento-medicion.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function trabajo(sobre: Partial<TrabajoDocumentoMedicion> = {}): TrabajoDocumentoMedicion {
  return {
    id: 't-1',
    planMedicionId: 'pm-1',
    tipo: 'PLAN_MEDICION_PDF',
    estado: 'En cola',
    nombreArchivo: null,
    tipoMime: null,
    bytes: null,
    error: null,
    solicitadoPor: ACTOR.id,
    solicitadoEn: new Date('2026-09-04'),
    terminadoEn: null,
    ...sobre,
  };
}

function datos(): Omit<DatosParaDocumentoMedicion, 'generadoEn'> {
  return {
    codigo: 'PM-PE-ISI-2026-v2-D-v1',
    tipo: 'DIRECTA',
    metaPorcentaje: 70,
    estado: 'Vigente',
    planEstudiosCodigo: 'PE-ISI-2026-v2',
    carreraNombre: 'Sistemas',
    aprobadoPor: null,
    aprobadoEn: null,
    grupos: [
      {
        atributo: 'AG-I08 — Análisis de Problema',
        competencias: [{ codigo: 'CPE-01', nombre: 'Resolver problemas' }],
      },
    ],
    periodos: [{ etiqueta: '2026-I', fechaCierre: null }],
    celdas: [{ competenciaCodigo: 'CPE-01', periodoEtiqueta: '2026-I', realizada: false }],
  };
}

interface Dobles {
  repo?: Partial<RepositorioDocumentosMedicionPort>;
  datos?: Partial<RepositorioDatosDocumentoMedicionPort>;
  cola?: Partial<ColaDeDocumentosPort>;
  almacen?: Partial<AlmacenDeArchivosPort>;
  renderizadores?: {
    pdf?: RenderizadorPdfPort['render'];
    hoja?: RenderizadorHojaPort['render'];
  };
  autorizacion?: AuthorizationPort;
}

function montar(dobles: Dobles = {}) {
  const publicados: DomainEvent[] = [];
  const eventos: PublicadorDeEventos = {
    publicar: async (es) => void publicados.push(...es),
  };

  const repo: RepositorioDocumentosMedicionPort = {
    crear: async () => trabajo(),
    porId: async () => trabajo(),
    listarDePlan: async () => [],
    marcarGenerando: async () => {},
    marcarListo: async () => {},
    marcarFallido: async () => {},
    ubicacionDe: async () => null,
    ...dobles.repo,
  };

  const caso = new GenerarDocumentoMedicion(
    repo,
    { datosDe: async () => datos(), ...dobles.datos },
    { encolar: async () => {}, ...dobles.cola },
    {
      guardar: async () => '/documentos/t-1.pdf',
      leer: async () => Buffer.alloc(0),
      ...dobles.almacen,
    },
    { render: dobles.renderizadores?.pdf ?? (async () => Buffer.from('pdf')) },
    { render: dobles.renderizadores?.hoja ?? (async () => Buffer.from('hoja')) },
    dobles.autorizacion ?? permitirTodo(),
    eventos,
    { ahora: () => new Date('2026-09-04T12:00:00Z') },
  );

  return { caso, publicados };
}

describe('RF-PM-027 — encolar', () => {
  it('crea el trabajo en la base y lo manda a la cola, en ese orden', async () => {
    // Al revés, el worker podría tomar el trabajo antes de que exista su fila y
    // fallar buscando un identificador que aún no está en la base.
    const orden: string[] = [];
    const { caso } = montar({
      repo: {
        crear: async () => {
          orden.push('base');
          return trabajo();
        },
      },
      cola: {
        encolar: async () => {
          orden.push('cola');
        },
      },
    });

    await caso.encolar(ACTOR, 'pm-1', 'PLAN_MEDICION_PDF');

    expect(orden).toEqual(['base', 'cola']);
  });

  it('encola diciendo de qué módulo es', async () => {
    // El worker enruta por este dato: sin él buscaría el trabajo en la tabla de
    // Plan de Estudios, donde no está, y lo daría por inexistente.
    const encolados: { id: string; modulo: string }[] = [];
    const { caso } = montar({
      cola: { encolar: async (id, modulo) => void encolados.push({ id, modulo }) },
    });

    await caso.encolar(ACTOR, 'pm-1', 'PLAN_MEDICION_PDF');

    expect(encolados).toEqual([{ id: 't-1', modulo: 'mejora-continua' }]);
  });

  it('exige `medicion.leer`: exportar es leer', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.encolar(ACTOR, 'pm-1', 'PLAN_MEDICION_PDF')).rejects.toThrow(AccesoDenegado);
  });

  it('un plan que no existe no deja un trabajo huérfano en la cola', async () => {
    const encolados: string[] = [];
    const { caso } = montar({
      datos: { datosDe: async () => null },
      cola: { encolar: async (id) => void encolados.push(id) },
    });

    await expect(caso.encolar(ACTOR, 'pm-desconocido', 'PLAN_MEDICION_PDF')).rejects.toThrow();
    expect(encolados).toEqual([]);
  });
});

describe('RF-PM-027 — generar', () => {
  it('el PDF usa el renderizador de PDF y el Excel el de hoja', async () => {
    const usados: string[] = [];
    const renderizadores = {
      pdf: async () => {
        usados.push('pdf');
        return Buffer.from('x');
      },
      hoja: async () => {
        usados.push('hoja');
        return Buffer.from('x');
      },
    };

    const excel = montar({
      repo: { porId: async () => trabajo({ tipo: 'PLAN_MEDICION_EXCEL' }) },
      renderizadores,
    });
    await excel.caso.ejecutar('t-1');
    expect(usados).toEqual(['hoja']);

    usados.length = 0;
    const pdf = montar({ renderizadores });
    await pdf.caso.ejecutar('t-1');
    expect(usados).toEqual(['pdf']);
  });

  it('guarda el archivo y marca listo con sus bytes y su extensión', async () => {
    const marcados: { nombreArchivo: string; bytes: number; tipoMime: string }[] = [];
    const { caso } = montar({
      repo: { marcarListo: async (_id, d) => void marcados.push(d) },
    });

    await caso.ejecutar('t-1');

    expect(marcados[0]?.bytes).toBeGreaterThan(0);
    expect(marcados[0]?.nombreArchivo).toMatch(/^plan-medicion-PM-.*\.pdf$/);
    expect(marcados[0]?.tipoMime).toBe('application/pdf');
  });

  it('el Excel se llama .xlsx y no .pdf', async () => {
    const marcados: { nombreArchivo: string }[] = [];
    const { caso } = montar({
      repo: {
        porId: async () => trabajo({ tipo: 'PLAN_MEDICION_EXCEL' }),
        marcarListo: async (_id, d) => void marcados.push(d),
      },
    });

    await caso.ejecutar('t-1');

    expect(marcados[0]?.nombreArchivo).toMatch(/\.xlsx$/);
  });

  it('un fallo se guarda como estado y NO se relanza', async () => {
    // Relanzar haría que BullMQ reintentara tres veces algo que va a fallar
    // igual —un plan sin datos no se arregla solo— y dejaría la pantalla
    // esperando durante los tres intentos.
    const fallos: string[] = [];
    const { caso } = montar({
      datos: { datosDe: async () => null },
      repo: { marcarFallido: async (_id, e) => void fallos.push(e) },
    });

    await expect(caso.ejecutar('t-1')).resolves.toBeUndefined();
    expect(fallos).toHaveLength(1);
    // Redactado para quien pidió el documento, no para quien mantiene el worker.
    expect(fallos[0]).toMatch(/no se pudo generar/i);
  });

  it('un trabajo que no existe no revienta el worker', async () => {
    const { caso } = montar({ repo: { porId: async () => null } });

    await expect(caso.ejecutar('t-desconocido')).resolves.toBeUndefined();
  });

  it('un trabajo ya listo no se rehace', async () => {
    // BullMQ puede reentregar un job tras una caída del worker, y regenerar
    // sobreescribiría un archivo que quizá ya se descargó.
    const guardados: string[] = [];
    const { caso } = montar({
      repo: { porId: async () => trabajo({ estado: 'Listo' }) },
      almacen: { guardar: async (clave) => (guardados.push(clave), '/x') },
    });

    await caso.ejecutar('t-1');

    expect(guardados).toEqual([]);
  });
});

/* ── Consulta y descarga ────────────────────────────────────────────────── */

function montarConsulta(dobles: {
  repo?: Partial<RepositorioDocumentosMedicionPort>;
  almacen?: Partial<AlmacenDeArchivosPort>;
  autorizacion?: AuthorizationPort;
}) {
  const repo: RepositorioDocumentosMedicionPort = {
    crear: async () => trabajo(),
    porId: async () => trabajo(),
    listarDePlan: async () => [],
    marcarGenerando: async () => {},
    marcarListo: async () => {},
    marcarFallido: async () => {},
    ubicacionDe: async () => '/documentos/t-1.pdf',
    ...dobles.repo,
  };

  return new ConsultarDocumentoMedicion(
    repo,
    {
      guardar: async () => '/x',
      leer: async () => Buffer.from('contenido'),
      ...dobles.almacen,
    },
    dobles.autorizacion ?? permitirTodo(),
  );
}

describe('RF-PM-027 — consultar y descargar', () => {
  it('descarga un trabajo listo con su nombre y su tipo', async () => {
    const caso = montarConsulta({
      repo: {
        porId: async () =>
          trabajo({ estado: 'Listo', nombreArchivo: 'plan.pdf', tipoMime: 'application/pdf' }),
      },
    });

    const archivo = await caso.descargar(ACTOR, 't-1');

    expect(archivo.nombreArchivo).toBe('plan.pdf');
    expect(archivo.contenido.toString()).toBe('contenido');
  });

  it('descargar uno que falló devuelve su motivo, no un archivo vacío', async () => {
    const caso = montarConsulta({
      repo: {
        porId: async () => trabajo({ estado: 'Fallido', error: 'El plan no tiene competencias.' }),
      },
    });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow('El plan no tiene competencias.');
  });

  it('descargar uno que aún se genera dice en qué estado va', async () => {
    const caso = montarConsulta({ repo: { porId: async () => trabajo({ estado: 'Generando' }) } });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('un trabajo Listo al que le falta el archivo se nombra, no devuelve 0 bytes', async () => {
    // Incoherencia de datos: la fila dice que está, el almacén dice que no.
    const caso = montarConsulta({
      repo: {
        porId: async () =>
          trabajo({ estado: 'Listo', nombreArchivo: 'p.pdf', tipoMime: 'application/pdf' }),
        ubicacionDe: async () => null,
      },
    });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(NoEncontrado);
  });

  it('sin `medicion.leer` no se consulta ni se descarga', async () => {
    const caso = montarConsulta({ autorizacion: denegar() });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.listarDePlan(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
  });

  it('un trabajo que no existe es 404, no null', async () => {
    const caso = montarConsulta({ repo: { porId: async () => null } });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(NoEncontrado);
  });
});
