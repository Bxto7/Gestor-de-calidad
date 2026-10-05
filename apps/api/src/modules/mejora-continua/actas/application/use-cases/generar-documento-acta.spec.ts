// apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts

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
import type { AlcanceDeLecturaPort } from '../../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import type {
  AccionActaDato,
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

const alcanceTotal: AlcanceDeLecturaPort = {
  alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
  puedeLeerCarrera: async () => true,
};
/** Lee solo `carrera-1`, la del acta de prueba; con otra carrera, el acta es ajena. */
const alcanceDeCarrera = (carreraId: string | null): AlcanceDeLecturaPort => ({
  alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
  puedeLeerCarrera: async (_u, carrera) => carreraId !== null && carrera === carreraId,
});

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

function permitirTodo(): AuthorizationPort {
  return { puede: async () => ({ permitido: true }), permisosDe: async () => new Set(), carreraACargoDe: async () => null, rolesDe: async () => [] };
}
function denegar(): AuthorizationPort {
  return { puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }), permisosDe: async () => new Set(), carreraACargoDe: async () => null, rolesDe: async () => [] };
}

function trabajo(sobre: Partial<TrabajoDocumentoActa> = {}): TrabajoDocumentoActa {
  return {
    id: 't-1', actaId: 'acta-1', tipo: 'ACTA_PDF', estado: 'En cola',
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
    plazo: new Date('2026-12-01'), recursos: 'r', metas: 'm', responsable: 'resp', responsableId: null,
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
  alcance?: AlcanceDeLecturaPort;
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
    eliminar: async () => ({ tipo: 'eliminado' as const }),
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
    eliminar: async () => ({ tipo: 'eliminado' }) as const, cambiarEstado: async () => plan(), actualizarImplementacion: async () => plan(),
    actualizarRetroalimentacion: async () => plan(), agregarEvidencia: async () => plan().evidencias[0]!,
    planDeEvidencia: async () => null, eliminarEvidencia: async () => {}, codigosDe: async () => [],
    parametros: async () => ({ minimoAccionesCriterio: 1, minimoAccionesObjetivo: 1 }),
    registrarImpactoEnMedicion: async () => plan(), copiar: async () => plan(), linajeDe: async () => [],
    listar: async () => [],
    listarDeCarrera: async () => [],
    planesPorIds: async () => [plan()],
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
    dobles.alcance ?? alcanceTotal,
    { ahora: () => new Date('2026-09-20T12:00:00Z') },
  );

  return { caso, publicados, estadoCambiadoA: () => estadoCambiadoA };
}

function montarConsulta(
  dobles: {
    repo?: Partial<RepositorioDocumentosActaPort>;
    almacen?: Partial<AlmacenDeArchivosPort>;
    autorizacion?: AuthorizationPort;
    actas?: Partial<RepositorioActaAprobacionPort>;
    alcance?: AlcanceDeLecturaPort;
  } = {},
) {
  const repo: RepositorioDocumentosActaPort = {
    crear: async () => trabajo(), porId: async () => trabajo(), listarDeActa: async () => [],
    marcarGenerando: async () => {}, marcarListo: async () => {}, marcarFallido: async () => {},
    ubicacionDe: async () => '/documentos/t-1.pdf',
    ...dobles.repo,
  };
  const actas = {
    crear: async () => acta(), porId: async () => acta(), listar: async () => [],
    editarCabecera: async () => acta(), reemplazarAsistentes: async () => acta(),
    accionesDe: async () => [], agregarAcciones: async () => {}, actualizarSeleccion: async () => {},
    editarTextos: async () => acta(), planesYaEmitidos: async () => new Set<string>(),
    cambiarEstado: async () => acta(), eliminar: async () => ({ tipo: 'eliminado' }) as const,
    correlativosDe: async () => [], ...dobles.actas,
  } satisfies RepositorioActaAprobacionPort;
  return new ConsultarDocumentoActa(
    repo,
    { guardar: async () => '/x', leer: async () => Buffer.from('contenido'), ...dobles.almacen },
    dobles.autorizacion ?? permitirTodo(),
    actas,
    dobles.alcance ?? alcanceTotal,
  );
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

describe('RF-CH-049 — encolar acotado a la carrera', () => {
  it('un acta de otra carrera es 404 y no crea trabajo ni encola', async () => {
    let creado = false;
    const encolados: string[] = [];
    const { caso } = montar({
      alcance: alcanceDeCarrera('carrera-9'),
      repo: { crear: async () => ((creado = true), trabajo()) },
      cola: { encolar: async (id) => void encolados.push(id) },
    });

    const fallo = await caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(creado).toBe(false);
    expect(encolados).toEqual([]);
  });

  it('sin actas.leer es 403 aunque el acta no exista (primero el permiso, después la existencia)', async () => {
    const { caso } = montar({ autorizacion: denegar(), actas: { porId: async () => null } });

    await expect(caso.encolar(ACTOR, 'acta-x', 'ACTA_PDF')).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-CH-049 — el worker no lee planes de otra carrera', () => {
  const vinculo = (planMejoraId: string, orden: number): AccionActaDato => ({
    id: `aa-${orden}`, planMejoraId, aspecto: 'CRITERIO_ACREDITACION', incluida: true,
    porcentajeMedicionCompetencia: null, orden, codigoSnapshot: null, nombreSnapshot: null,
    plazoSnapshot: null, recursosSnapshot: null, metasSnapshot: null, responsableSnapshot: null,
    metaCompetenciaSnapshot: null,
  });

  it('un acta en vivo exporta el plan propio y deja fuera el ajeno', async () => {
    let recibido: unknown;
    const { caso } = montar({
      actas: {
        porId: async () => acta({ estado: 'Borrador' }),
        accionesDe: async () => [vinculo('plan-propio', 0), vinculo('plan-ajeno', 1)],
      },
      planes: {
        planesPorIds: async () => [
          plan({ id: 'plan-propio', nombre: 'Reforzar bibliografía' }),
          plan({ id: 'plan-ajeno', carreraId: 'carrera-9', nombre: 'Plan de otra carrera' }),
        ],
      },
      pdf: async (documento) => ((recibido = documento), Buffer.from('pdf')),
    });

    await caso.ejecutar('t-1');

    const texto = JSON.stringify(recibido);
    expect(texto).toContain('Reforzar bibliografía');
    expect(texto).not.toContain('Plan de otra carrera');
  });
});

describe('RF-CH-049 — consultar y descargar acotado a la carrera', () => {
  const ajena = { alcance: alcanceDeCarrera('carrera-9') };
  const listo = trabajo({ estado: 'Listo', nombreArchivo: 'a.pdf', tipoMime: 'application/pdf' });

  it('el estado de un trabajo de un acta ajena es 404', async () => {
    const caso = montarConsulta({ ...ajena, repo: { porId: async () => listo } });

    const fallo = await caso.estado(ACTOR, 't-1').catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(NoEncontrado);
    expect(fallo).not.toBeInstanceOf(AccesoDenegado);
  });

  it('descargar un trabajo Listo de un acta ajena es 404 y no lee el archivo', async () => {
    let leyo = false;
    const caso = montarConsulta({
      ...ajena,
      repo: { porId: async () => listo },
      almacen: { leer: async () => ((leyo = true), Buffer.from('x')) },
    });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(leyo).toBe(false);
  });

  it('un trabajo cuya acta ya no existe es 404', async () => {
    const caso = montarConsulta({ actas: { porId: async () => null }, repo: { porId: async () => listo } });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('listarDeActa de un acta ajena es 404 y no consulta los trabajos', async () => {
    let consulto = false;
    const caso = montarConsulta({
      ...ajena,
      repo: { listarDeActa: async () => ((consulto = true), []) },
    });

    await expect(caso.listarDeActa(ACTOR, 'acta-1')).rejects.toBeInstanceOf(NoEncontrado);
    expect(consulto).toBe(false);
  });

  it('el 403 va antes que el 404: sin actas.leer ni se mira el acta', async () => {
    const caso = montarConsulta({ autorizacion: denegar(), actas: { porId: async () => null } });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.listarDeActa(ACTOR, 'acta-x')).rejects.toThrow(AccesoDenegado);
  });

  it('quien lee todas (Consultor) descarga el de cualquier carrera', async () => {
    const caso = montarConsulta({ repo: { porId: async () => listo } });

    expect((await caso.descargar(ACTOR, 't-1')).nombreArchivo).toBe('a.pdf');
  });
});
