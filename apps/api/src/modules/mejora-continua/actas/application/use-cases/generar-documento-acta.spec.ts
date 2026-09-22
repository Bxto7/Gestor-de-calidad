import { describe, expect, it } from 'vitest';

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
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
import { ActaTransicionada } from '../../domain/events/eventos-actas.js';
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import type {
  DatosActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
import type {
  RenderizadorExcelActaPort,
  RenderizadorPdfActaPort,
  RepositorioDocumentosActaPort,
  TrabajoDocumentoActa,
} from '../ports/documentos-acta.port.js';
import {
  ConsultarDocumentoActa,
  GenerarDocumentoActa,
} from './generar-documento-acta.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

function permitirTodo(): AuthorizationPort {
  return { puede: async () => ({ permitido: true }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}
function denegar(): AuthorizationPort {
  return { puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}
/** I-2: actor con `actas.leer` pero sin `actas.aprobar` — un rol de solo lectura. */
function soloLeer(): AuthorizationPort {
  return {
    puede: async (_id, permiso) =>
      permiso === 'actas.leer' ? { permitido: true } : { permitido: false, motivo: 'Falta el permiso.' },
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => null,
  };
}

function trabajo(sobre: Partial<TrabajoDocumentoActa> = {}): TrabajoDocumentoActa {
  return {
    id: 't-1', actaId: 'acta-1', tipo: 'ACTA_PDF', estado: 'En cola',
    solicitadoPor: 'u-1',
    nombreArchivo: null, tipoMime: null, bytes: null, error: null,
    solicitadoEn: new Date('2026-09-20'), terminadoEn: null,
    ...sobre,
  };
}

function acta(sobre: Partial<DatosActa> = {}): DatosActa {
  return {
    id: 'acta-1', carreraId: 'carrera-1', correlativo: 2, codigo: 'ACTA N° 002 – EAP-ISI',
    periodoAcademico: '2025-10', periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    textoIntroduccion: 'x', textoAcuerdoCierre: 'y',
    convocadaPor: 'Directora de Escuela', fechaReunion: new Date('2026-03-09'), lugarReunion: 'Sala',
    comentario: null, lugarEmision: 'Huancayo', fechaEmision: new Date('2026-03-20'),
    aprobadoPorId: 'u-2', aprobadoEn: new Date('2026-03-15'),
    estado: 'Aprobada', creadoEn: new Date('2026-03-01'),
    asistentes: [{ id: 'as-1', nombre: 'Ana Pérez' }],
    ...sobre,
  };
}

function plan(sobre: Partial<DatosPlanMejora> = {}): DatosPlanMejora {
  return {
    id: 'plan-1', codigo: 'CA-01', aspecto: 'CRITERIO_ACREDITACION', carreraId: 'carrera-1',
    criterioAcreditacionId: 'cri-1', objetivoEducacionalId: null, competenciaId: null, periodoId: null,
    planEvaluacionId: null, planMedicionAfectadoId: null, estado: 'Aprobado', estadoImplementacion: 'Pendiente',
    nombre: 'Reforzar bibliografía', causaRaiz: 'x', justificacion: 'x', input: null,
    plazo: new Date('2026-12-01'), recursos: 'r', metas: 'm', responsable: 'resp',
    logroMeta: null, impacto: null, creadoEn: new Date('2026-01-01'), evidencias: [], version: 1, derivadoDeId: null,
    ...sobre,
  };
}

interface Dobles {
  repo?: Partial<RepositorioDocumentosActaPort>;
  actas?: Partial<RepositorioActaAprobacionPort>;
  planes?: Partial<RepositorioPlanMejoraPort>;
  cola?: Partial<ColaDeDocumentosPort>;
  almacen?: Partial<AlmacenDeArchivosPort>;
  pdf?: RenderizadorPdfActaPort['render'];
  excel?: RenderizadorExcelActaPort['render'];
  autorizacion?: AuthorizationPort;
}

function montar(dobles: Dobles = {}) {
  const publicados: DomainEvent[] = [];
  const eventos: PublicadorDeEventos = { publicar: async (es) => void publicados.push(...es) };

  let estadoCambiadoA: string | undefined;
  const repoActas: RepositorioActaAprobacionPort = {
    crear: async () => acta(),
    porId: async () => acta(),
    listar: async () => [],
    editarCabecera: async () => acta(),
    reemplazarAsistentes: async () => acta(),
    accionesDe: async () => [
      { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0, codigoSnapshot: 'CA-01', nombreSnapshot: 'Reforzar bibliografía', plazoSnapshot: new Date('2026-12-01'), recursosSnapshot: 'r', metasSnapshot: 'm', responsableSnapshot: 'resp', metaCompetenciaSnapshot: null },
    ],
    agregarAcciones: async () => {},
    actualizarSeleccion: async () => {},
    editarTextos: async () => acta(),
    planesYaEmitidos: async () => new Set(),
    cambiarEstado: async (_id, estado) => {
      estadoCambiadoA = estado;
      return acta({ estado });
    },
    eliminar: async () => {},
    correlativosDe: async () => [],
    ...dobles.actas,
  };

  const repo: RepositorioDocumentosActaPort = {
    crear: async () => trabajo(),
    porId: async () => trabajo(),
    listarDeActa: async () => [],
    marcarGenerando: async () => {},
    marcarListo: async () => {},
    marcarFallido: async () => {},
    ubicacionDe: async () => null,
    ...dobles.repo,
  };

  const planes: RepositorioPlanMejoraPort = {
    crear: async () => plan(), porId: async () => plan(), editarDefinicion: async () => plan(),
    eliminar: async () => {}, cambiarEstado: async () => plan(), actualizarImplementacion: async () => plan(),
    actualizarRetroalimentacion: async () => plan(), agregarEvidencia: async () => plan().evidencias[0]!,
    planDeEvidencia: async () => null, eliminarEvidencia: async () => {}, codigosDe: async () => [],
    parametros: async () => ({ minimoAccionesCriterio: 1, minimoAccionesObjetivo: 1 }),
    registrarImpactoEnMedicion: async () => plan(), copiar: async () => plan(), linajeDe: async () => [],
    listarDeCarrera: async () => [], planesPorIds: async () => [plan()],
    ...dobles.planes,
  };

  const caso = new GenerarDocumentoActa(
    repo,
    repoActas,
    planes,
    { encolar: async () => {}, ...dobles.cola },
    { guardar: async () => '/documentos/t-1.pdf', leer: async () => Buffer.alloc(0), ...dobles.almacen },
    { render: dobles.pdf ?? (async () => Buffer.from('pdf')) },
    { render: dobles.excel ?? (async () => Buffer.from('excel')) },
    dobles.autorizacion ?? permitirTodo(),
    eventos,
    { ahora: () => new Date('2026-09-20T12:00:00Z') },
  );

  return { caso, publicados, estadoCambiadoA: () => estadoCambiadoA };
}

describe('RF-AC-018/019 — encolar', () => {
  it('crea el trabajo y después lo encola', async () => {
    const orden: string[] = [];
    const { caso } = montar({
      repo: { crear: async () => (orden.push('base'), trabajo()) },
      cola: { encolar: async () => void orden.push('cola') },
    });

    await caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF');

    expect(orden).toEqual(['base', 'cola']);
  });

  it('encola diciendo de qué módulo es', async () => {
    const encolados: { id: string; modulo: string }[] = [];
    const { caso } = montar({ cola: { encolar: async (id, modulo) => void encolados.push({ id, modulo }) } });

    await caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF');

    expect(encolados).toEqual([{ id: 't-1', modulo: 'mejora-continua-actas' }]);
  });

  it('exige actas.leer: exportar es leer', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF')).rejects.toThrow(AccesoDenegado);
  });

  it('un acta que no existe no deja un trabajo huérfano en la cola', async () => {
    const encolados: string[] = [];
    const { caso } = montar({
      actas: { porId: async () => null },
      cola: { encolar: async (id) => void encolados.push(id) },
    });

    await expect(caso.encolar(ACTOR, 'acta-desconocida', 'ACTA_PDF')).rejects.toThrow(NoEncontrado);
    expect(encolados).toEqual([]);
  });

  it('I-2: exportar un acta Aprobada con solo actas.leer se rechaza — puede disparar Emitida', async () => {
    const { caso } = montar({
      actas: { porId: async () => acta({ estado: 'Aprobada' }) },
      autorizacion: soloLeer(),
    });

    await expect(caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF')).rejects.toThrow(AccesoDenegado);
  });

  it('I-2: exportar un acta Aprobada con actas.leer + actas.aprobar funciona (camino feliz)', async () => {
    const { caso } = montar({
      actas: { porId: async () => acta({ estado: 'Aprobada' }) },
      autorizacion: permitirTodo(),
    });

    await expect(caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF')).resolves.toBeDefined();
  });

  it('I-2: exportar un acta en otro estado con solo actas.leer no exige actas.aprobar', async () => {
    const { caso } = montar({
      actas: { porId: async () => acta({ estado: 'Emitida' }) },
      autorizacion: soloLeer(),
    });

    await expect(caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF')).resolves.toBeDefined();

    const { caso: casoBorrador } = montar({
      actas: { porId: async () => acta({ estado: 'Borrador' }) },
      autorizacion: soloLeer(),
    });

    await expect(casoBorrador.encolar(ACTOR, 'acta-1', 'ACTA_PDF')).resolves.toBeDefined();
  });
});

describe('RF-AC-018/019 — generar', () => {
  it('el PDF usa el renderizador de PDF y el Excel el de Excel', async () => {
    const usados: string[] = [];
    const pdf = async () => (usados.push('pdf'), Buffer.from('x'));
    const excel = async () => (usados.push('excel'), Buffer.from('x'));

    const casoExcel = montar({ repo: { porId: async () => trabajo({ tipo: 'ACTA_EXCEL' }) }, pdf, excel });
    await casoExcel.caso.ejecutar('t-1');
    expect(usados).toEqual(['excel']);

    usados.length = 0;
    const casoPdf = montar({ pdf, excel });
    await casoPdf.caso.ejecutar('t-1');
    expect(usados).toEqual(['pdf']);
  });

  it('guarda el archivo y marca Listo con sus bytes', async () => {
    const marcados: { nombreArchivo: string; bytes: number }[] = [];
    const { caso } = montar({ repo: { marcarListo: async (_id, d) => void marcados.push(d) } });

    await caso.ejecutar('t-1');

    expect(marcados[0]?.bytes).toBeGreaterThan(0);
    expect(marcados[0]?.nombreArchivo).toContain('ACTA');
  });

  it('un acta Aprobada pasa a Emitida tras la primera exportación exitosa', async () => {
    const { caso, estadoCambiadoA } = montar({ actas: { porId: async () => acta({ estado: 'Aprobada' }) } });

    await caso.ejecutar('t-1');

    expect(estadoCambiadoA()).toBe('Emitida');
  });

  it('I-1: la transición Aprobada→Emitida publica ActaTransicionada en la bitácora', async () => {
    const { caso, publicados } = montar({ actas: { porId: async () => acta({ estado: 'Aprobada' }) } });

    await caso.ejecutar('t-1');

    const transicion = publicados.find((e): e is ActaTransicionada => e instanceof ActaTransicionada);
    expect(transicion).toBeDefined();
    expect(transicion?.detalle).toContain('Aprobada');
    expect(transicion?.detalle).toContain('Emitida');
    expect(transicion?.entidadId).toBe('acta-1');
  });

  it('un acta ya Emitida no vuelve a transicionar', async () => {
    const { caso, estadoCambiadoA } = montar({ actas: { porId: async () => acta({ estado: 'Emitida' }) } });

    await caso.ejecutar('t-1');

    expect(estadoCambiadoA()).toBeUndefined();
  });

  it('un acta en Borrador se exporta igual (contenido en vivo), sin transicionar', async () => {
    const { caso, estadoCambiadoA } = montar({
      actas: { porId: async () => acta({ estado: 'Borrador' }) },
    });

    await expect(caso.ejecutar('t-1')).resolves.toBeUndefined();
    expect(estadoCambiadoA()).toBeUndefined();
  });

  it('un fallo se guarda como estado y no se relanza', async () => {
    const fallos: string[] = [];
    const { caso } = montar({
      actas: { porId: async () => null },
      repo: { marcarFallido: async (_id, e) => void fallos.push(e) },
    });

    await expect(caso.ejecutar('t-1')).resolves.toBeUndefined();
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toMatch(/no se pudo generar/i);
  });

  it('un trabajo ya Listo no se rehace', async () => {
    const guardados: string[] = [];
    const { caso } = montar({
      repo: { porId: async () => trabajo({ estado: 'Listo' }) },
      almacen: { guardar: async (clave) => (guardados.push(clave), '/x') },
    });

    await caso.ejecutar('t-1');

    expect(guardados).toEqual([]);
  });
});

describe('RF-AC-018/019 — consultar y descargar', () => {
  function montarConsulta(dobles: { repo?: Partial<RepositorioDocumentosActaPort>; almacen?: Partial<AlmacenDeArchivosPort>; autorizacion?: AuthorizationPort } = {}) {
    const repo: RepositorioDocumentosActaPort = {
      crear: async () => trabajo(), porId: async () => trabajo(), listarDeActa: async () => [],
      marcarGenerando: async () => {}, marcarListo: async () => {}, marcarFallido: async () => {},
      ubicacionDe: async () => '/documentos/t-1.pdf',
      ...dobles.repo,
    };
    return new ConsultarDocumentoActa(
      repo,
      { guardar: async () => '/x', leer: async () => Buffer.from('contenido'), ...dobles.almacen },
      dobles.autorizacion ?? permitirTodo(),
    );
  }

  it('descarga un trabajo Listo con su nombre y su tipo', async () => {
    const caso = montarConsulta({ repo: { porId: async () => trabajo({ estado: 'Listo', nombreArchivo: 'a.pdf', tipoMime: 'application/pdf' }) } });

    const archivo = await caso.descargar(ACTOR, 't-1');

    expect(archivo.nombreArchivo).toBe('a.pdf');
    expect(archivo.contenido.toString()).toBe('contenido');
  });

  it('descargar uno que falló devuelve su motivo', async () => {
    const caso = montarConsulta({ repo: { porId: async () => trabajo({ estado: 'Fallido', error: 'El acta ya no existe.' }) } });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow('El acta ya no existe.');
  });

  it('descargar uno que aún se genera dice en qué estado va', async () => {
    const caso = montarConsulta({ repo: { porId: async () => trabajo({ estado: 'Generando' }) } });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('sin actas.leer no se consulta ni se descarga', async () => {
    const caso = montarConsulta({ autorizacion: denegar() });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.listarDeActa(ACTOR, 'acta-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
  });
});
