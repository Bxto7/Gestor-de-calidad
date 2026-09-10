/**
 * Pruebas del generador de documentos del plan de evaluación (RF-PE-032).
 *
 * Sigue el patrón de `generar-documento-medicion.spec.ts` y de
 * `gestionar-planes-evaluacion.spec.ts`: dobles de los puertos, un `montar()`
 * que arma los dos casos de uso con esos dobles, y `documentos` como un doble
 * con estado —un `Map` en memoria— porque varias pruebas necesitan leer lo
 * que un método de escritura anterior dejó (`marcarGenerando`,
 * `marcarListo`, `marcarFallido`), no solo que se haya llamado.
 *
 * Lo que se afirma aquí es lo que ninguna pieza suelta puede saber: el orden
 * entre persistir y encolar, la clave con la que se encola, que la carrera se
 * resuelve por la cadena evaluación → medición → plan de estudios, que un
 * fallo del worker acaba guardado y no perdido, y que los nombres que pide
 * `DatosParaDocumentoEvaluacion` salen del directorio y no de un UUID.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import type { DirectorioDeUsuariosPort } from '../../../../auth/application/ports/directorio-usuarios.port.js';
import type {
  AsignaturaBase,
  CompetenciaConAtributos,
  ContenidoCurricularPort,
  PlanBase,
} from '../../../../plan-estudios/application/ports/contenido-curricular.port.js';
import type {
  DatosPlanMedicion,
  RepositorioPlanMedicionPort,
} from '../../../medicion/application/ports/plan-medicion.port.js';
import type {
  ConfiguracionDelPlan,
  RepositorioConfiguracionEvaluacionPort,
} from '../ports/configuracion-evaluacion.port.js';
import type {
  RepositorioDocumentosEvaluacionPort,
  TipoDocEvaluacion,
  TrabajoDocumentoEvaluacion,
} from '../ports/documentos-evaluacion.port.js';
import type {
  DatosPlanEvaluacion,
  RepositorioPlanEvaluacionPort,
} from '../ports/plan-evaluacion.port.js';

import {
  ConsultarDocumentoEvaluacion,
  GenerarDocumentoEvaluacion,
} from './generar-documento-evaluacion.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

/* ── Dobles de autorización ─────────────────────────────────────────────── */

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

/* ── Dobles de los datos que se heredan ─────────────────────────────────── */

function planBase(sobre: Partial<PlanBase> = {}): PlanBase {
  return {
    id: 'pe-1',
    codigo: 'PE-ISI-2026-v2',
    carreraId: 'car-1',
    carreraNombre: 'Sistemas',
    version: 2,
    elegible: true,
    duracionAnios: 5,
    ...sobre,
  };
}

function competencia(sobre: Partial<CompetenciaConAtributos> = {}): CompetenciaConAtributos {
  return {
    id: 'c-1',
    codigo: 'CPE-01',
    nombre: 'Resolver problemas',
    activa: true,
    atributos: [{ id: 'ag-8', codigo: 'AG-I08', nombre: 'Análisis de Problema' }],
    ...sobre,
  };
}

function asignaturaBase(sobre: Partial<AsignaturaBase> = {}): AsignaturaBase {
  return {
    id: 'a-1',
    codigo: 'MA101',
    nombre: 'Cálculo I',
    cicloNumero: 1,
    activa: true,
    ...sobre,
  };
}

function contenido(sobre: Partial<ContenidoCurricularPort> = {}): ContenidoCurricularPort {
  return {
    planesElegibles: async () => [planBase()],
    planPorId: async () => planBase(),
    competenciasDelPlan: async () => [competencia()],
    asignaturasDelPlan: async () => [asignaturaBase()],
    ...sobre,
  };
}

function planMedicion(sobre: Partial<DatosPlanMedicion> = {}): DatosPlanMedicion {
  return {
    id: 'pm-1',
    planEstudiosId: 'pe-1',
    tipo: 'DIRECTA',
    codigo: 'PM-PE-ISI-2026-v2-D-v1',
    version: 1,
    meta: 0.7,
    estado: 'Vigente',
    periodoInicio: { anio: 2026, mitad: 1 },
    competenciaIds: ['c-1'],
    periodos: [{ id: 'p-1', etiqueta: '2026-I', orden: 1, fechaCierre: null }],
    creadoEn: new Date('2026-01-01'),
    derivadoDeId: null,
    aprobadoPorId: null,
    aprobadoEn: null,
    ...sobre,
  };
}

/** Doble completo de `RepositorioPlanMedicionPort`: este caso de uso solo usa `porId`. */
function repoMedicion(sobre: Partial<RepositorioPlanMedicionPort> = {}): RepositorioPlanMedicionPort {
  const noUsado =
    (metodo: string) =>
    async (): Promise<never> => {
      throw new Error(`${metodo} no se usa en este spec.`);
    };
  return {
    listar: noUsado('listar'),
    porId: async () => planMedicion(),
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    actualizar: noUsado('actualizar'),
    cambiarEstado: noUsado('cambiarEstado'),
    eliminar: noUsado('eliminar'),
    declararCompetencias: noUsado('declararCompetencias'),
    declararPeriodos: noUsado('declararPeriodos'),
    matriz: noUsado('matriz'),
    programar: noUsado('programar'),
    contenidoDe: noUsado('contenidoDe'),
    copiar: noUsado('copiar'),
    linajeDe: noUsado('linajeDe'),
    marcarVigenteRelevando: noUsado('marcarVigenteRelevando'),
    marcarRealizada: noUsado('marcarRealizada'),
    ...sobre,
  };
}

function evaluacion(sobre: Partial<DatosPlanEvaluacion> = {}): DatosPlanEvaluacion {
  return {
    id: 'ev-1',
    planMedicionId: 'pm-1',
    codigo: 'EV-PE-ISI-2026-v2-D-v1',
    version: 1,
    estado: 'Vigente',
    creadoEn: new Date('2026-02-01'),
    actualizadoEn: new Date('2026-02-01'),
    ...sobre,
  };
}

function repoEvaluacion(
  sobre: Partial<RepositorioPlanEvaluacionPort> = {},
): RepositorioPlanEvaluacionPort {
  const noUsado =
    (metodo: string) =>
    async (): Promise<never> => {
      throw new Error(`${metodo} no se usa en este spec.`);
    };
  return {
    listar: noUsado('listar'),
    porId: async (id) => (id === 'ev-1' ? evaluacion() : null),
    vigenteDe: noUsado('vigenteDe'),
    codigosDe: noUsado('codigosDe'),
    crear: noUsado('crear'),
    cambiarEstado: noUsado('cambiarEstado'),
    eliminar: noUsado('eliminar'),
    ...sobre,
  };
}

function configuracionVacia(): ConfiguracionDelPlan {
  return { competencias: [], mediciones: [], indicaciones: [] };
}

function repoConfiguraciones(
  sobre: Partial<RepositorioConfiguracionEvaluacionPort> = {},
): RepositorioConfiguracionEvaluacionPort {
  const noUsado =
    (metodo: string) =>
    async (): Promise<never> => {
      throw new Error(`${metodo} no se usa en este spec.`);
    };
  return {
    del: async () => configuracionVacia(),
    guardarCompetencia: noUsado('guardarCompetencia'),
    reemplazarAsignaturas: noUsado('reemplazarAsignaturas'),
    guardarPorcentaje: noUsado('guardarPorcentaje'),
    reemplazarEvidencias: noUsado('reemplazarEvidencias'),
    planDeAsignaturaEvaluada: noUsado('planDeAsignaturaEvaluada'),
    reemplazarIndicaciones: noUsado('reemplazarIndicaciones'),
    guardarResultados: noUsado('guardarResultados'),
    planDeIndicacion: noUsado('planDeIndicacion'),
    ...sobre,
  };
}

function directorio(sobre: Partial<DirectorioDeUsuariosPort> = {}): DirectorioDeUsuariosPort {
  return {
    nombresDe: async (ids) => new Map(ids.map((id) => [id, `Nombre de ${id}`])),
    porRol: async () => [],
    ...sobre,
  };
}

/* ── El doble con estado del repositorio de trabajos ────────────────────── */

/**
 * A diferencia de los demás dobles, este lleva estado: varias pruebas
 * necesitan que `porId`, tras un `marcarFallido` o un `marcarListo`,
 * devuelva lo que ese método acaba de guardar — no solo comprobar que se
 * llamó.
 */
class DocumentosFake implements RepositorioDocumentosEvaluacionPort {
  private readonly filas = new Map<string, TrabajoDocumentoEvaluacion>();
  private readonly ubicaciones = new Map<string, string>();
  private contador = 0;

  sembrar(trabajo: TrabajoDocumentoEvaluacion, ubicacion?: string): void {
    this.filas.set(trabajo.id, trabajo);
    if (ubicacion !== undefined) this.ubicaciones.set(trabajo.id, ubicacion);
  }

  async crear(datos: {
    planEvaluacionId: string;
    tipo: TipoDocEvaluacion;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoEvaluacion> {
    this.contador += 1;
    const nuevo: TrabajoDocumentoEvaluacion = {
      id: `t-${this.contador}`,
      planEvaluacionId: datos.planEvaluacionId,
      tipo: datos.tipo,
      estado: 'En cola',
      nombreArchivo: null,
      tipoMime: null,
      bytes: null,
      error: null,
      solicitadoEn: new Date('2026-09-10'),
      terminadoEn: null,
    };
    this.filas.set(nuevo.id, nuevo);
    return nuevo;
  }

  async porId(id: string): Promise<TrabajoDocumentoEvaluacion | null> {
    return this.filas.get(id) ?? null;
  }

  async listarDePlan(
    planEvaluacionId: string,
    limite: number,
  ): Promise<TrabajoDocumentoEvaluacion[]> {
    return [...this.filas.values()]
      .filter((t) => t.planEvaluacionId === planEvaluacionId)
      .slice(0, limite);
  }

  async marcarGenerando(id: string): Promise<void> {
    const t = this.filas.get(id);
    if (t) this.filas.set(id, { ...t, estado: 'Generando', error: null });
  }

  async marcarListo(
    id: string,
    archivo: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void> {
    const t = this.filas.get(id);
    if (!t) return;
    this.filas.set(id, {
      ...t,
      estado: 'Listo',
      nombreArchivo: archivo.nombreArchivo,
      tipoMime: archivo.tipoMime,
      bytes: archivo.bytes,
      error: null,
      terminadoEn: new Date('2026-09-10T12:00:00Z'),
    });
    this.ubicaciones.set(id, archivo.ubicacion);
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    const t = this.filas.get(id);
    if (!t) return;
    this.filas.set(id, { ...t, estado: 'Fallido', error, terminadoEn: new Date('2026-09-10T12:00:00Z') });
  }

  async ubicacionDe(id: string): Promise<string | null> {
    return this.ubicaciones.get(id) ?? null;
  }
}

function trabajo(sobre: Partial<TrabajoDocumentoEvaluacion> = {}): TrabajoDocumentoEvaluacion {
  return {
    id: 't-1',
    planEvaluacionId: 'ev-1',
    tipo: 'PLAN_EVALUACION_PDF',
    estado: 'En cola',
    nombreArchivo: null,
    tipoMime: null,
    bytes: null,
    error: null,
    solicitadoEn: new Date('2026-09-10'),
    terminadoEn: null,
    ...sobre,
  };
}

/* ── Cola, almacén y renderizadores ─────────────────────────────────────── */

interface ColaEspia extends ColaDeDocumentosPort {
  encolado: { trabajoId: string; modulo: string } | null;
}

function colaEspia(): ColaEspia {
  return {
    encolado: null,
    async encolar(trabajoId, modulo) {
      this.encolado = { trabajoId, modulo };
    },
  };
}

function almacen(sobre: Partial<AlmacenDeArchivosPort> = {}): AlmacenDeArchivosPort {
  return {
    guardar: async () => '/documentos/t-1.pdf',
    leer: async () => Buffer.from('contenido'),
    ...sobre,
  };
}

/* ── Montaje ─────────────────────────────────────────────────────────────── */

let documentos: DocumentosFake;
let evaluaciones: RepositorioPlanEvaluacionPort;
let mediciones: RepositorioPlanMedicionPort;
let curricular: ContenidoCurricularPort;
let configuraciones: RepositorioConfiguracionEvaluacionPort;
let dirUsuarios: DirectorioDeUsuariosPort;
let cola: ColaEspia;
let disco: AlmacenDeArchivosPort;
let pdf: RenderizadorPdfPort;
let hoja: RenderizadorHojaPort;
let autorizacion: AuthorizationPort;
let publicados: DomainEvent[];
let eventos: PublicadorDeEventos;
let generador: GenerarDocumentoEvaluacion;
let consulta: ConsultarDocumentoEvaluacion;

beforeEach(() => {
  documentos = new DocumentosFake();
  documentos.sembrar(trabajo());

  evaluaciones = repoEvaluacion();
  mediciones = repoMedicion();
  curricular = contenido();
  configuraciones = repoConfiguraciones();
  dirUsuarios = directorio();
  cola = colaEspia();
  disco = almacen();
  pdf = { render: async () => Buffer.from('pdf') };
  hoja = { render: async () => Buffer.from('hoja') };
  autorizacion = permitirTodo();
  publicados = [];
  eventos = {
    publicar: async (es) => void publicados.push(...es),
  };

  generador = new GenerarDocumentoEvaluacion(
    documentos,
    evaluaciones,
    mediciones,
    curricular,
    configuraciones,
    dirUsuarios,
    cola,
    disco,
    pdf,
    hoja,
    autorizacion,
    eventos,
    { ahora: () => new Date('2026-09-10T12:00:00Z') },
  );

  consulta = new ConsultarDocumentoEvaluacion(documentos, disco, autorizacion);
});

/* ── encolar ─────────────────────────────────────────────────────────────── */

describe('RF-PE-032 — encolar', () => {
  it('deja el trabajo en cola y lo manda a la cola con su clave', async () => {
    const t = await generador.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_PDF');

    expect(t.estado).toBe('En cola');
    expect(cola.encolado).toEqual({ trabajoId: t.id, modulo: 'mejora-continua-evaluacion' });
  });

  it('encolar sobre un plan que no existe es 404, y no encola nada', async () => {
    await expect(
      generador.encolar(ACTOR, 'ev-inventado', 'PLAN_EVALUACION_PDF'),
    ).rejects.toThrow(NoEncontrado);
    expect(cola.encolado).toBeNull();
  });

  it('exige `evaluacion.editar`', async () => {
    autorizacion = denegar();
    generador = new GenerarDocumentoEvaluacion(
      documentos,
      evaluaciones,
      mediciones,
      curricular,
      configuraciones,
      dirUsuarios,
      cola,
      disco,
      pdf,
      hoja,
      autorizacion,
      eventos,
    );

    await expect(generador.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_PDF')).rejects.toThrow(
      AccesoDenegado,
    );
    expect(cola.encolado).toBeNull();
  });

  it('pasa la carrera del plan a puede(), no null', async () => {
    const puede = vi.fn(async () => ({ permitido: true }) as const);
    autorizacion = { puede, permisosDe: async () => new Set(), carreraACargoDe: async () => null };
    curricular = contenido({ planPorId: async () => planBase({ carreraId: 'carrera-ajena' }) });
    generador = new GenerarDocumentoEvaluacion(
      documentos,
      evaluaciones,
      mediciones,
      curricular,
      configuraciones,
      dirUsuarios,
      cola,
      disco,
      pdf,
      hoja,
      autorizacion,
      eventos,
    );

    await generador.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_PDF').catch(() => undefined);

    expect(puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.editar', 'carrera-ajena');
  });

  it('cada encolado deja constancia', async () => {
    await generador.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_EXCEL');

    expect(publicados.at(-1)?.nombre).toBe('evaluacion.documento');
  });

  it('crea el trabajo antes de encolarlo, en ese orden', async () => {
    // Al revés, el worker podría tomar el trabajo antes de que exista su fila
    // y fallar buscando un identificador que aún no está en la base.
    const orden: string[] = [];
    const crearOriginal = documentos.crear.bind(documentos);
    documentos.crear = async (datos) => {
      orden.push('base');
      return crearOriginal(datos);
    };
    cola = colaEspia();
    const encolarOriginal = cola.encolar.bind(cola);
    cola.encolar = async (id, modulo) => {
      orden.push('cola');
      await encolarOriginal(id, modulo);
    };
    generador = new GenerarDocumentoEvaluacion(
      documentos,
      evaluaciones,
      mediciones,
      curricular,
      configuraciones,
      dirUsuarios,
      cola,
      disco,
      pdf,
      hoja,
      autorizacion,
      eventos,
    );

    await generador.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_PDF');

    expect(orden).toEqual(['base', 'cola']);
  });
});

/* ── ejecutar ────────────────────────────────────────────────────────────── */

describe('RF-PE-032 — ejecutar', () => {
  const trabajoId = 't-1';

  it('ejecutar no lanza nunca: un fallo se guarda como estado', async () => {
    // El worker no tiene a quién devolverle una excepción. Si esto lanzara, el
    // trabajo se quedaría en «Generando» para siempre.
    curricular.planPorId = async () => null;

    await expect(generador.ejecutar(trabajoId)).resolves.toBeUndefined();
    expect((await documentos.porId(trabajoId))?.estado).toBe('Fallido');
  });

  it('el mensaje de fallo es para quien pidió el documento, no una traza técnica', async () => {
    curricular.planPorId = async () => null;

    await generador.ejecutar(trabajoId);

    expect((await documentos.porId(trabajoId))?.error).toMatch(/no se pudo generar/i);
  });

  it('un trabajo que no existe no revienta el worker', async () => {
    await expect(generador.ejecutar('t-desconocido')).resolves.toBeUndefined();
  });

  it('un trabajo ya listo no se rehace', async () => {
    documentos.sembrar(trabajo({ estado: 'Listo' }));
    const guardados: string[] = [];
    disco = almacen({ guardar: async (clave) => (guardados.push(clave), '/x') });
    generador = new GenerarDocumentoEvaluacion(
      documentos,
      evaluaciones,
      mediciones,
      curricular,
      configuraciones,
      dirUsuarios,
      cola,
      disco,
      pdf,
      hoja,
      autorizacion,
      eventos,
    );

    await generador.ejecutar(trabajoId);

    expect(guardados).toEqual([]);
  });

  it('el PDF usa el renderizador de PDF y el Excel el de hoja', async () => {
    const usados: string[] = [];
    pdf = {
      render: async () => {
        usados.push('pdf');
        return Buffer.from('x');
      },
    };
    hoja = {
      render: async () => {
        usados.push('hoja');
        return Buffer.from('x');
      },
    };

    documentos.sembrar(trabajo({ id: 't-excel', tipo: 'PLAN_EVALUACION_EXCEL' }));
    generador = new GenerarDocumentoEvaluacion(
      documentos,
      evaluaciones,
      mediciones,
      curricular,
      configuraciones,
      dirUsuarios,
      cola,
      disco,
      pdf,
      hoja,
      autorizacion,
      eventos,
    );

    await generador.ejecutar('t-excel');
    expect(usados).toEqual(['hoja']);

    usados.length = 0;
    await generador.ejecutar(trabajoId);
    expect(usados).toEqual(['pdf']);
  });

  it('guarda el archivo y marca listo con sus bytes, tipo MIME y extensión', async () => {
    await generador.ejecutar(trabajoId);

    const listo = await documentos.porId(trabajoId);
    expect(listo?.estado).toBe('Listo');
    expect(listo?.bytes).toBeGreaterThan(0);
    expect(listo?.tipoMime).toBe('application/pdf');
    expect(listo?.nombreArchivo).toMatch(/^plan-evaluacion-.*\.pdf$/);
  });

  it('el Excel se llama .xlsx y no .pdf', async () => {
    documentos.sembrar(trabajo({ id: 't-excel', tipo: 'PLAN_EVALUACION_EXCEL' }));

    await generador.ejecutar('t-excel');

    const listo = await documentos.porId('t-excel');
    expect(listo?.nombreArchivo).toMatch(/\.xlsx$/);
  });

  it('pone el nombre de responsable y docente, no el identificador', async () => {
    configuraciones = repoConfiguraciones({
      del: async () => ({
        competencias: [
          { competenciaId: 'c-1', instrumento: 'Rúbrica', frecuencia: 'Anual', responsableId: 'u-r' },
        ],
        mediciones: [
          {
            competenciaId: 'c-1',
            periodoId: 'p-1',
            porcentajeAlcanzado: 80,
            asignaturas: [
              {
                id: 'ae-1',
                asignaturaId: 'a-1',
                entregable: 'Informe',
                docenteId: 'u-d',
                evidencias: [{ id: 'ev-1', enlace: 'https://x', descripcion: 'Foto' }],
              },
            ],
          },
        ],
        indicaciones: [],
      }),
    });
    dirUsuarios = directorio({
      nombresDe: async (ids) => {
        const mapa = new Map<string, string>();
        if (ids.includes('u-r')) mapa.set('u-r', 'Ana Responsable');
        if (ids.includes('u-d')) mapa.set('u-d', 'Beto Docente');
        return mapa;
      },
    });
    let capturado: string | undefined;
    pdf = {
      render: async (documento) => {
        capturado = JSON.stringify(documento);
        return Buffer.from('pdf');
      },
    };
    generador = new GenerarDocumentoEvaluacion(
      documentos,
      evaluaciones,
      mediciones,
      curricular,
      configuraciones,
      dirUsuarios,
      cola,
      disco,
      pdf,
      hoja,
      autorizacion,
      eventos,
    );

    await generador.ejecutar(trabajoId);

    expect(capturado).toContain('Ana Responsable');
    expect(capturado).toContain('Beto Docente');
    expect(capturado).not.toContain('u-r');
    expect(capturado).not.toContain('u-d');
  });
});

/* ── Consulta y descarga ─────────────────────────────────────────────────── */

describe('RF-PE-032 — consultar y descargar', () => {
  it('descarga un trabajo listo con su nombre y su contenido', async () => {
    documentos.sembrar(
      trabajo({ estado: 'Listo', nombreArchivo: 'plan.pdf', tipoMime: 'application/pdf' }),
      '/documentos/plan.pdf',
    );

    const archivo = await consulta.descargar(ACTOR, 't-1');

    expect(archivo.nombreArchivo).toBe('plan.pdf');
    expect(archivo.contenido.toString()).toBe('contenido');
  });

  it('descargar uno que falló devuelve su motivo, no un archivo vacío', async () => {
    documentos.sembrar(trabajo({ estado: 'Fallido', error: 'El plan no tiene competencias.' }));

    await expect(consulta.descargar(ACTOR, 't-1')).rejects.toThrow(
      'El plan no tiene competencias.',
    );
  });

  it('descargar un trabajo que no está listo es 409, nombrando el estado', async () => {
    documentos.sembrar(trabajo({ estado: 'Generando' }));

    await expect(consulta.descargar(ACTOR, 't-1')).rejects.toThrow(/En cola|Generando/);
    await expect(consulta.descargar(ACTOR, 't-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('un trabajo Listo al que le falta el archivo se nombra, no devuelve 0 bytes', async () => {
    documentos.sembrar(trabajo({ estado: 'Listo', nombreArchivo: 'p.pdf', tipoMime: 'application/pdf' }));
    // No se pasó por `marcarListo`, así que no hay ubicación registrada:
    // incoherencia de datos deliberada para esta prueba.

    await expect(consulta.descargar(ACTOR, 't-1')).rejects.toThrow(NoEncontrado);
  });

  it('un trabajo que no existe es 404, no null', async () => {
    await expect(consulta.estado(ACTOR, 't-inexistente')).rejects.toThrow(NoEncontrado);
  });

  it('lista los trabajos de un plan', async () => {
    documentos.sembrar(trabajo({ id: 't-2', planEvaluacionId: 'ev-1' }));
    documentos.sembrar(trabajo({ id: 't-3', planEvaluacionId: 'ev-otro' }));

    const lista = await consulta.listarDePlan(ACTOR, 'ev-1');

    expect(lista.map((t) => t.id).sort()).toEqual(['t-1', 't-2']);
  });

  it('sin `evaluacion.leer` no se consulta ni se descarga', async () => {
    const denegado = new ConsultarDocumentoEvaluacion(documentos, disco, denegar());

    await expect(denegado.estado(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
    await expect(denegado.listarDePlan(ACTOR, 'ev-1')).rejects.toThrow(AccesoDenegado);
    await expect(denegado.descargar(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
  });

  it('las lecturas no están acotadas por carrera: piden el permiso con `null`', async () => {
    const puede = vi.fn(async () => ({ permitido: true }) as const);
    const autorizacionEspia: AuthorizationPort = {
      puede,
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
    };
    const consultaEspia = new ConsultarDocumentoEvaluacion(documentos, disco, autorizacionEspia);

    await consultaEspia.estado(ACTOR, 't-1');

    expect(puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.leer', null);
  });
});
