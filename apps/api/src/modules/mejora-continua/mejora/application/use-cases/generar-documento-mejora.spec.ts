/**
 * Pruebas del generador de documentos del plan de mejora (RF-PJ-032).
 *
 * Calca `generar-documento-medicion.spec.ts` a propósito. El caso de uso
 * cruza dos procesos: `encolar` corre en la API y `ejecutar` en el worker. Lo
 * que se afirma aquí es lo que ninguna pieza suelta puede saber: el orden
 * entre persistir y encolar, qué renderizador toca según el tipo, y que un
 * fallo del worker acabe guardado en vez de perdido.
 *
 * A diferencia del gemelo de medición, aquí no hay un puerto de «datos del
 * documento» aparte: `GenerarDocumentoMejora` lee directamente
 * `RepositorioPlanMejoraPort`, el mismo que ya usa `GestionarPlanesMejora`.
 */

import { describe, expect, it } from 'vitest';

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
  RenderizadorHojaPort,
  RenderizadorPdfPort,
} from '../../../../../platform/documentos/puertos.js';
import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  RepositorioDocumentosMejoraPort,
  TrabajoDocumentoMejora,
} from '../ports/documentos-mejora.port.js';
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../ports/plan-mejora.port.js';

import {
  ConsultarDocumentoMejora,
  GenerarDocumentoMejora,
} from './generar-documento-mejora.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const CARRERA = 'carrera-1';

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

function trabajo(sobre: Partial<TrabajoDocumentoMejora> = {}): TrabajoDocumentoMejora {
  return {
    id: 't-1',
    planMejoraId: 'pj-1',
    tipo: 'PLAN_MEJORA_PDF',
    estado: 'En cola',
    nombreArchivo: null,
    tipoMime: null,
    bytes: null,
    error: null,
    solicitadoEn: new Date('2026-09-13'),
    terminadoEn: null,
    ...sobre,
  };
}

function plan(sobre: Partial<DatosPlanMejora> = {}): DatosPlanMejora {
  return {
    id: 'pj-1',
    codigo: 'PJ-CRI-1',
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: CARRERA,
    criterioAcreditacionId: 'cri-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: null,
    estado: 'Vigente',
    estadoImplementacion: 'En proceso',
    nombre: 'Reforzar el taller de fundamentos',
    causaRaiz: 'Bajo desempeño en la evaluación diagnóstica.',
    justificacion: 'El indicador cayó por debajo de la meta dos periodos seguidos.',
    input: 'Resultados del periodo 2026-I.',
    plazo: new Date('2026-12-31'),
    recursos: 'Dos horas semanales de taller adicional.',
    metas: 'Elevar el logro al 70%.',
    responsable: 'Coordinación académica',
    logroMeta: null,
    impacto: null,
    creadoEn: new Date('2026-03-01'),
    evidencias: [
      {
        id: 'evi-1',
        planMejoraId: 'pj-1',
        referencia: 'https://drive.example/informe.pdf',
        nombreArchivo: 'informe.pdf',
        subidoPor: 'u-1',
        subidoEn: new Date('2026-06-01'),
      },
    ],
    version: 1,
    derivadoDeId: null,
    ...sobre,
  };
}

interface Dobles {
  repo?: Partial<RepositorioDocumentosMejoraPort>;
  planes?: Partial<RepositorioPlanMejoraPort>;
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

  const repo: RepositorioDocumentosMejoraPort = {
    crear: async () => trabajo(),
    porId: async () => trabajo(),
    listarDePlan: async () => [],
    marcarGenerando: async () => {},
    marcarListo: async () => {},
    marcarFallido: async () => {},
    ubicacionDe: async () => null,
    ...dobles.repo,
  };

  const planes: RepositorioPlanMejoraPort = {
    crear: async () => plan(),
    porId: async () => plan(),
    editarDefinicion: async () => plan(),
    eliminar: async () => {},
    cambiarEstado: async () => plan(),
    actualizarImplementacion: async () => plan(),
    actualizarRetroalimentacion: async () => plan(),
    agregarEvidencia: async () => plan().evidencias[0]!,
    planDeEvidencia: async () => null,
    eliminarEvidencia: async () => {},
    codigosDe: async () => [],
    parametros: async () => ({ minimoAccionesCriterio: 1, minimoAccionesObjetivo: 1 }),
    registrarImpactoEnMedicion: async () => plan(),
    copiar: async () => plan(),
    linajeDe: async () => [],
    listarDeCarrera: async () => [],
    ...dobles.planes,
  };

  const caso = new GenerarDocumentoMejora(
    repo,
    planes,
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
    { ahora: () => new Date('2026-09-13T12:00:00Z') },
  );

  return { caso, publicados };
}

describe('RF-PJ-032 — encolar', () => {
  it('crea el trabajo y después lo encola, en ese orden', async () => {
    // Al revés, el worker podría tomar el trabajo antes de que exista su fila
    // y fallar buscando un identificador que aún no está en la base.
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

    await caso.encolar(ACTOR, 'pj-1', 'PLAN_MEJORA_PDF');

    expect(orden).toEqual(['base', 'cola']);
  });

  it('encola diciendo de qué módulo es', async () => {
    // El worker enruta por este dato: sin él buscaría el trabajo en la tabla
    // equivocada y lo daría por inexistente.
    const encolados: { id: string; modulo: string }[] = [];
    const { caso } = montar({
      cola: { encolar: async (id, modulo) => void encolados.push({ id, modulo }) },
    });

    await caso.encolar(ACTOR, 'pj-1', 'PLAN_MEJORA_PDF');

    expect(encolados).toEqual([{ id: 't-1', modulo: 'mejora-continua-mejora' }]);
  });

  it('exige mejora.leer: exportar es leer', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.encolar(ACTOR, 'pj-1', 'PLAN_MEJORA_PDF')).rejects.toThrow(AccesoDenegado);
  });

  it('un plan que no existe no deja un trabajo huérfano en la cola', async () => {
    const encolados: string[] = [];
    const { caso } = montar({
      planes: { porId: async () => null },
      cola: { encolar: async (id) => void encolados.push(id) },
    });

    await expect(caso.encolar(ACTOR, 'pj-desconocido', 'PLAN_MEJORA_PDF')).rejects.toThrow(
      NoEncontrado,
    );
    expect(encolados).toEqual([]);
  });
});

describe('RF-PJ-032 — generar', () => {
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
      repo: { porId: async () => trabajo({ tipo: 'PLAN_MEJORA_EXCEL' }) },
      renderizadores,
    });
    await excel.caso.ejecutar('t-1');
    expect(usados).toEqual(['hoja']);

    usados.length = 0;
    const pdf = montar({ renderizadores });
    await pdf.caso.ejecutar('t-1');
    expect(usados).toEqual(['pdf']);
  });

  it('guarda el archivo y marca listo con sus bytes', async () => {
    const marcados: { nombreArchivo: string; bytes: number; tipoMime: string }[] = [];
    const { caso } = montar({
      repo: { marcarListo: async (_id, d) => void marcados.push(d) },
    });

    await caso.ejecutar('t-1');

    expect(marcados[0]?.bytes).toBeGreaterThan(0);
    expect(marcados[0]?.nombreArchivo).toBe('PJ-CRI-1.pdf');
    expect(marcados[0]?.tipoMime).toBe('application/pdf');
  });

  it('el Excel se llama .xlsx y no .pdf', async () => {
    const marcados: { nombreArchivo: string }[] = [];
    const { caso } = montar({
      repo: {
        porId: async () => trabajo({ tipo: 'PLAN_MEJORA_EXCEL' }),
        marcarListo: async (_id, d) => void marcados.push(d),
      },
    });

    await caso.ejecutar('t-1');

    expect(marcados[0]?.nombreArchivo).toBe('PJ-CRI-1.xlsx');
  });

  it('un fallo se guarda como estado y NO se relanza', async () => {
    // Relanzar haría que BullMQ reintentara tres veces algo que va a fallar
    // igual —un plan sin datos no se arregla solo— y dejaría la pantalla
    // esperando durante los tres intentos.
    const fallos: string[] = [];
    const { caso } = montar({
      planes: { porId: async () => null },
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
  repo?: Partial<RepositorioDocumentosMejoraPort>;
  almacen?: Partial<AlmacenDeArchivosPort>;
  autorizacion?: AuthorizationPort;
}) {
  const repo: RepositorioDocumentosMejoraPort = {
    crear: async () => trabajo(),
    porId: async () => trabajo(),
    listarDePlan: async () => [],
    marcarGenerando: async () => {},
    marcarListo: async () => {},
    marcarFallido: async () => {},
    ubicacionDe: async () => '/documentos/t-1.pdf',
    ...dobles.repo,
  };

  return new ConsultarDocumentoMejora(
    repo,
    {
      guardar: async () => '/x',
      leer: async () => Buffer.from('contenido'),
      ...dobles.almacen,
    },
    dobles.autorizacion ?? permitirTodo(),
  );
}

describe('RF-PJ-032 — consultar y descargar', () => {
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
        porId: async () => trabajo({ estado: 'Fallido', error: 'El plan no tiene evidencias.' }),
      },
    });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow('El plan no tiene evidencias.');
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

  it('sin mejora.leer no se consulta ni se descarga', async () => {
    const caso = montarConsulta({ autorizacion: denegar() });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.listarDePlan(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
  });

  it('un trabajo que no existe es 404, no null', async () => {
    const caso = montarConsulta({ repo: { porId: async () => null } });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(NoEncontrado);
  });
});
