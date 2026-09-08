/**
 * Configuración por competencia de un plan de evaluación, un periodo a la vez
 * (RF-PE-013 a RF-PE-021).
 *
 * Solo se pintan las competencias que la matriz del plan de medición base
 * programó en el periodo elegido (RF-PE-012): enseñar las demás desactivadas
 * ofrecería algo que no se puede hacer, porque en este periodo esa competencia
 * no se mide y no hay nada que configurar. Ver también `HeredadoDelPlanBase`,
 * que distingue programada de no programada con el mismo criterio.
 *
 * Dos fronteras de edición, no una — RF-PE-006:
 *   - `editable` (solo Borrador) cubre instrumento, frecuencia, las
 *     asignaturas del cruce, su entregable y su docente: es la *definición*
 *     del plan, lo que alguien aprueba.
 *   - `seguimientoEditable` (Borrador o Vigente, RN2) cubre el porcentaje
 *     alcanzado y las evidencias: es lo que fue ocurriendo, y por eso se
 *     registra también sobre un plan ya vigente. Cuando un campo de la
 *     definición se desactiva por esto, el motivo va escrito al lado —un
 *     campo desactivado y mudo hace pensar en un fallo.
 *
 * Cada campo que se repite dice a qué fila y a qué competencia pertenece
 * (WCAG 2.4.6): «Entregable» a secas se repite una vez por fila y no distingue
 * nada, aunque `axe-core` no proteste porque los `id` sí son únicos. La
 * convención vale para todos los campos del componente, no para algunos: es
 * media convención la que se olvida al añadir el siguiente.
 *
 * Un solo botón «Guardar el periodo», no uno por sección (RF-PE-021): al
 * pulsarlo se compara el estado local contra el que llegó por props y solo se
 * disparan los `PUT` de lo que de verdad cambió. El componente no consulta
 * nada — igual que `DocumentosDelPlan` y `HeredadoDelPlanBase`, recibe los
 * datos y devuelve avisos a través de los cuatro callbacks que la página
 * compone contra sus mutaciones.
 */

import { useMemo, useState } from 'react';

import { Boton, Campo, Entrada, EstadoVacio, Selector, Tarjeta } from '@/shared/components/ui';

import type {
  AsignaturaElegible,
  ConfiguracionDelPlan,
  Docente,
  EvidenciaRegistrada,
} from '../domain/tipos';

export interface DatosCompetenciaAGuardar {
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
}

export interface AsignaturaDelCruceAGuardar {
  readonly asignaturaId: string;
  readonly entregable: string;
  readonly docenteId: string | null;
}

export interface EvidenciaAGuardar {
  readonly enlace: string;
  readonly descripcion: string;
}

export interface ConfiguracionDelPeriodoProps {
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
  readonly periodo: { id: string; etiqueta: string; orden: number };
  /** «competenciaId|periodoId» que la matriz base programó (RF-PE-012). */
  readonly programadas: readonly string[];
  readonly configuracion: ConfiguracionDelPlan;
  readonly asignaturas: readonly AsignaturaElegible[];
  readonly docentes: readonly Docente[];
  /** RF-PE-006: solo Borrador. Instrumento, frecuencia, asignaturas, entregable, docente. */
  readonly editable: boolean;
  /** RF-PE-006 RN2: Borrador o Vigente. Porcentaje alcanzado y evidencias. */
  readonly seguimientoEditable: boolean;
  readonly onGuardarCompetencia: (
    competenciaId: string,
    datos: DatosCompetenciaAGuardar,
  ) => Promise<void>;
  readonly onGuardarAsignaturas: (
    competenciaId: string,
    asignaturas: readonly AsignaturaDelCruceAGuardar[],
  ) => Promise<void>;
  readonly onGuardarPorcentaje: (competenciaId: string, porcentaje: number | null) => Promise<void>;
  readonly onGuardarEvidencias: (
    asignaturaEvaluadaId: string,
    evidencias: readonly EvidenciaAGuardar[],
  ) => Promise<void>;
}

/** Una fila del cruce, en edición. `aeId` es null mientras no se haya guardado. */
interface FilaAsignatura {
  readonly aeId: string | null;
  readonly asignaturaId: string;
  readonly entregable: string;
  readonly docenteId: string | null;
  readonly evidencias: readonly EvidenciaRegistrada[];
}

interface EstadoCompetencia {
  readonly instrumento: string;
  readonly frecuencia: string;
  /** Cadena del `<input type="number">`; vacía representa `null`. */
  readonly porcentaje: string;
  readonly filas: readonly FilaAsignatura[];
}

function estadoInicial(
  competenciaId: string,
  periodoId: string,
  configuracion: ConfiguracionDelPlan,
): EstadoCompetencia {
  const comp = configuracion.competencias.find((c) => c.competenciaId === competenciaId);
  const medicion = configuracion.mediciones.find(
    (m) => m.competenciaId === competenciaId && m.periodoId === periodoId,
  );
  return {
    instrumento: comp?.instrumento ?? '',
    frecuencia: comp?.frecuencia ?? '',
    porcentaje:
      medicion?.porcentajeAlcanzado === null || medicion?.porcentajeAlcanzado === undefined
        ? ''
        : String(medicion.porcentajeAlcanzado),
    filas: (medicion?.asignaturas ?? []).map((a) => ({
      aeId: a.id,
      asignaturaId: a.asignaturaId,
      entregable: a.entregable,
      docenteId: a.docenteId,
      evidencias: a.evidencias,
    })),
  };
}

/**
 * Adopta del servidor lo único que el servidor sabe y la pantalla no: el `aeId`
 * que una fila recién guardada acaba de recibir.
 *
 * Hace falta porque el estado local se deriva de `configuracion` **una sola vez
 * al montar**, y el componente solo se remonta al cambiar de periodo. Tras
 * guardar, la consulta se refresca y trae los `aeId` nuevos, pero sin esto la
 * fila seguía con `aeId: null` y la sección de evidencias no aparecía hasta
 * recargar la página: RF-PE-020 quedaba inalcanzable en la misma visita, con la
 * interfaz diciendo justo que guardar es lo que lo desbloquea.
 *
 * Lo que **no** hace es traerse el resto de la fila. Quien acaba de guardar
 * puede haber seguido escribiendo, y pisar su entregable con el del servidor
 * sería perder trabajo para arreglar un campo invisible. Por eso la
 * conciliación es una adopción de identidad, no una recarga.
 *
 * Devuelve `null` cuando no hay nada que adoptar, para no provocar un
 * renderizado por cada refresco de la consulta.
 */
function conciliarConElServidor(
  estados: Record<string, EstadoCompetencia>,
  periodoId: string,
  configuracion: ConfiguracionDelPlan,
): Record<string, EstadoCompetencia> | null {
  let algoCambio = false;
  const conciliados: Record<string, EstadoCompetencia> = {};

  for (const [competenciaId, estado] of Object.entries(estados)) {
    const delServidor = estadoInicial(competenciaId, periodoId, configuracion);
    // Un `aeId` que ya tiene otra fila no se reparte dos veces: dos filas de la
    // misma asignatura en el mismo cruce no existen (índice único), pero una
    // pantalla a medio editar sí puede tenerlas un instante.
    const tomados = new Set(estado.filas.map((f) => f.aeId).filter((id): id is string => !!id));
    let adoptoAlguno = false;

    const filas = estado.filas.map((fila) => {
      if (fila.aeId) return fila;
      const gemela = delServidor.filas.find(
        (f) => f.aeId && !tomados.has(f.aeId) && f.asignaturaId === fila.asignaturaId,
      );
      if (!gemela?.aeId) return fila;
      tomados.add(gemela.aeId);
      adoptoAlguno = true;
      return { ...fila, aeId: gemela.aeId, evidencias: gemela.evidencias };
    });

    conciliados[competenciaId] = adoptoAlguno ? { ...estado, filas } : estado;
    algoCambio ||= adoptoAlguno;
  }

  return algoCambio ? conciliados : null;
}

/**
 * Lo que se ve y el punto contra el que se compara, en un solo estado.
 *
 * Juntos y no en dos `useState` porque el punto de comparación se calcula a
 * partir del visible: al terminar un guardado hay que escribirlo mirando lo que
 * el visible tenga **en ese momento**, no lo que tenía cuando se pulsó el
 * botón. Con dos estados separados, el actualizador funcional de uno no puede
 * leer el otro, y esa era exactamente la vía por la que se perdía el `aeId`.
 */
interface EstadoDelFormulario {
  /** Lo que el usuario ve y edita. */
  readonly visible: Record<string, EstadoCompetencia>;
  /** Lo último que llegó al servidor: contra esto se decide qué `PUT` salen. */
  readonly base: Record<string, EstadoCompetencia>;
}

/**
 * El punto de comparación tras un guardado con éxito.
 *
 * El **contenido** sale de lo que de verdad se envió (`enviados`), no del
 * estado visible del momento: quien siguió escribiendo mientras el `PUT`
 * viajaba no envió eso, y darlo por guardado perdería su edición en el
 * guardado siguiente.
 *
 * La **identidad**, en cambio, sale del estado visible (`vigentes`), porque
 * durante ese viaje la consulta se refresca y la conciliación adopta ahí los
 * `aeId` que el servidor acaba de asignar. Sin este cruce, la base se quedaba
 * con `aeId: null` mientras el visible ya tenía el bueno, y la comparación de
 * evidencias —que empareja las filas por `aeId`— no encontraba pareja: se
 * anunciaba «Guardado.» y la evidencia no salía hacia el servidor.
 *
 * El emparejamiento es por `asignaturaId` y no por posición porque la fila
 * pudo moverse entretanto; dos filas de la misma asignatura en el mismo cruce
 * no existen (índice único), así que no hay ambigüedad.
 */
function baseTrasGuardar(
  enviados: Record<string, EstadoCompetencia>,
  vigentes: Record<string, EstadoCompetencia>,
): Record<string, EstadoCompetencia> {
  const conIdentidad: Record<string, EstadoCompetencia> = {};

  for (const [competenciaId, enviado] of Object.entries(enviados)) {
    const vigente = vigentes[competenciaId];
    conIdentidad[competenciaId] = {
      ...enviado,
      filas: enviado.filas.map((fila) => {
        if (fila.aeId) return fila;
        const gemela = vigente?.filas.find((f) => f.aeId && f.asignaturaId === fila.asignaturaId);
        return gemela?.aeId ? { ...fila, aeId: gemela.aeId } : fila;
      }),
    };
  }

  return conIdentidad;
}

function claveFila(f: FilaAsignatura): string {
  return JSON.stringify([f.asignaturaId, f.entregable, f.docenteId]);
}

function filasIguales(a: readonly FilaAsignatura[], b: readonly FilaAsignatura[]): boolean {
  return a.length === b.length && a.every((f, i) => claveFila(f) === claveFila(b[i]!));
}

function claveEvidencia(e: { enlace: string; descripcion: string }): string {
  return JSON.stringify([e.enlace, e.descripcion]);
}

function evidenciasIguales(
  a: readonly { enlace: string; descripcion: string }[],
  b: readonly { enlace: string; descripcion: string }[],
): boolean {
  return a.length === b.length && a.every((e, i) => claveEvidencia(e) === claveEvidencia(b[i]!));
}

export function ConfiguracionDelPeriodo({
  competencias,
  periodo,
  programadas,
  configuracion,
  asignaturas,
  docentes,
  editable,
  seguimientoEditable,
  onGuardarCompetencia,
  onGuardarAsignaturas,
  onGuardarPorcentaje,
  onGuardarEvidencias,
}: ConfiguracionDelPeriodoProps) {
  // RF-PE-012: solo lo que la matriz base programó en este periodo. Pintar el
  // resto desactivado ofrecería algo que aquí no se puede hacer.
  const competenciasProgramadas = competencias.filter((c) =>
    programadas.includes(`${c.id}|${periodo.id}`),
  );

  // El estado visible y su punto de comparación viven juntos: ver
  // `EstadoDelFormulario`. En estado y no en un `useRef` como antes porque la
  // conciliación de más abajo también tiene que alcanzarlos, y leer o escribir
  // un ref durante el renderizado es justo lo que `react-hooks/refs` prohíbe.
  // El coste es un renderizado más por guardado, que no se nota.
  const [formulario, setFormulario] = useState<EstadoDelFormulario>(() => {
    const inicial: Record<string, EstadoCompetencia> = {};
    for (const c of competenciasProgramadas) {
      inicial[c.id] = estadoInicial(c.id, periodo.id, configuracion);
    }
    return { visible: inicial, base: inicial };
  });
  const estados = formulario.visible;
  const base = formulario.base;

  /**
   * Editar solo mueve lo visible: la base es lo que el servidor tiene, y eso
   * únicamente cambia cuando un guardado termina bien.
   */
  function setEstados(
    actualizar: (previos: Record<string, EstadoCompetencia>) => Record<string, EstadoCompetencia>,
  ) {
    setFormulario((previo) => ({ ...previo, visible: actualizar(previo.visible) }));
  }

  // Conciliación con lo que la consulta acaba de devolver. Va en el
  // renderizado y no en un `useEffect` a propósito: es un ajuste de estado
  // ante un cambio de props, el caso que la documentación de React resuelve
  // así, y `react-hooks/set-state-in-effect` rechaza la otra forma. Como
  // `conciliarConElServidor` devuelve `null` cuando no hay nada que adoptar,
  // el ajuste converge en un renderizado y no encadena más.
  //
  // Los `aeId` nuevos entran también en la base, y no solo en el estado
  // visible: la comparación de evidencias empareja las filas por `aeId`
  // (`anterior.filas.find(f => f.aeId === fila.aeId)`, más abajo), así que una
  // base con `aeId: null` no encontraría nunca su pareja y las evidencias de
  // una fila recién creada no se llegarían a enviar.
  const [configuracionVista, setConfiguracionVista] = useState(configuracion);
  if (configuracion !== configuracionVista) {
    setConfiguracionVista(configuracion);
    setFormulario((previo) => {
      const visibleConciliado = conciliarConElServidor(previo.visible, periodo.id, configuracion);
      const baseConciliada = conciliarConElServidor(previo.base, periodo.id, configuracion);
      // Devolver el mismo objeto cuando no hay nada que adoptar mantiene lo que
      // el `null` de `conciliarConElServidor` busca: ningún renderizado extra
      // por cada refresco de la consulta.
      if (!visibleConciliado && !baseConciliada) return previo;
      return {
        visible: visibleConciliado ?? previo.visible,
        base: baseConciliada ?? previo.base,
      };
    });
  }

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const asignaturasPorCiclo = useMemo(() => {
    const grupos = new Map<number | null, AsignaturaElegible[]>();
    for (const a of asignaturas) {
      const lista = grupos.get(a.cicloNumero) ?? [];
      lista.push(a);
      grupos.set(a.cicloNumero, lista);
    }
    return [...grupos.entries()].sort(
      ([a], [b]) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER),
    );
  }, [asignaturas]);

  function avisarCambio() {
    // Un aviso de "Guardado" que sobrevive a la siguiente edición mentiría
    // sobre si ese cambio ya se guardó.
    setMensaje(null);
  }

  function cambiarCompetencia(competenciaId: string, cambio: Partial<EstadoCompetencia>) {
    avisarCambio();
    setEstados((previos) => ({
      ...previos,
      [competenciaId]: { ...previos[competenciaId]!, ...cambio },
    }));
  }

  function cambiarFila(competenciaId: string, indice: number, cambio: Partial<FilaAsignatura>) {
    avisarCambio();
    setEstados((previos) => {
      const actual = previos[competenciaId]!;
      return {
        ...previos,
        [competenciaId]: {
          ...actual,
          filas: actual.filas.map((f, i) => (i === indice ? { ...f, ...cambio } : f)),
        },
      };
    });
  }

  function agregarFila(competenciaId: string) {
    avisarCambio();
    setEstados((previos) => {
      const actual = previos[competenciaId]!;
      const nueva: FilaAsignatura = {
        aeId: null,
        asignaturaId: '',
        entregable: '',
        docenteId: null,
        evidencias: [],
      };
      return { ...previos, [competenciaId]: { ...actual, filas: [...actual.filas, nueva] } };
    });
  }

  function quitarFila(competenciaId: string, indice: number) {
    avisarCambio();
    setEstados((previos) => {
      const actual = previos[competenciaId]!;
      return {
        ...previos,
        [competenciaId]: { ...actual, filas: actual.filas.filter((_, i) => i !== indice) },
      };
    });
  }

  function cambiarEvidencias(
    competenciaId: string,
    indiceFila: number,
    evidencias: readonly EvidenciaRegistrada[],
  ) {
    cambiarFila(competenciaId, indiceFila, { evidencias });
  }

  async function guardarPeriodo() {
    setGuardando(true);
    setError(null);
    try {
      for (const competencia of competenciasProgramadas) {
        const actual = estados[competencia.id];
        const anterior = base[competencia.id];
        if (!actual || !anterior) continue;

        if (
          editable &&
          (actual.instrumento !== anterior.instrumento || actual.frecuencia !== anterior.frecuencia)
        ) {
          await onGuardarCompetencia(competencia.id, {
            instrumento: actual.instrumento.trim() === '' ? null : actual.instrumento.trim(),
            frecuencia: actual.frecuencia.trim() === '' ? null : actual.frecuencia.trim(),
          });
        }

        if (editable && !filasIguales(actual.filas, anterior.filas)) {
          await onGuardarAsignaturas(
            competencia.id,
            actual.filas
              .filter((f) => f.asignaturaId !== '')
              .map((f) => ({
                asignaturaId: f.asignaturaId,
                // Recortado como el instrumento y la frecuencia de arriba: el
                // DTO lo recorta también, y enviarlo sin recortar hacía que
                // dos entregables escritos igual no se parecieran.
                entregable: f.entregable.trim(),
                docenteId: f.docenteId,
              })),
          );
        }

        if (seguimientoEditable && actual.porcentaje !== anterior.porcentaje) {
          await onGuardarPorcentaje(
            competencia.id,
            actual.porcentaje === '' ? null : Number(actual.porcentaje),
          );
        }

        if (seguimientoEditable) {
          for (const fila of actual.filas) {
            if (!fila.aeId) continue; // Nada que asociar hasta que la fila misma se guarde.
            const filaBase = anterior.filas.find((f) => f.aeId === fila.aeId);
            if (filaBase && !evidenciasIguales(fila.evidencias, filaBase.evidencias)) {
              await onGuardarEvidencias(
                fila.aeId,
                fila.evidencias.map((e) => ({ enlace: e.enlace, descripcion: e.descripcion })),
              );
            }
          }
        }
      }

      // Actualización funcional, y no `setBase(estados)`: `estados` es la
      // instantánea del cierre, tomada al pulsar el botón. Mientras los `PUT`
      // viajaban, la consulta se refrescó y la conciliación adoptó los `aeId`
      // nuevos en el estado visible; pisar la base con esa instantánea los
      // tiraba. Ver `baseTrasGuardar`.
      setFormulario((previo) => ({
        ...previo,
        base: baseTrasGuardar(estados, previo.visible),
      }));
      setMensaje('Guardado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el periodo.');
    } finally {
      setGuardando(false);
    }
  }

  const puedeGuardarAlgo = editable || seguimientoEditable;
  const motivoDefinicionBloqueada =
    'El plan ya fue aprobado, así que su definición no admite cambios; genera una nueva versión para editarla.';

  return (
    <Tarjeta>
      <div className="space-y-6">
        <h2 className="text-sm font-semibold text-tinta">Configuración por competencia</h2>

        {competenciasProgramadas.length === 0 ? (
          <EstadoVacio
            titulo="Sin competencias programadas en este periodo"
            detalle={`La matriz del plan de medición base no programó ninguna competencia en ${periodo.etiqueta}.`}
          />
        ) : (
          <div className="space-y-8">
            {competenciasProgramadas.map((competencia) => {
              const estado = estados[competencia.id];
              if (!estado) return null;

              return (
                <div
                  key={competencia.id}
                  className="space-y-4 rounded-xl border border-slate-200 p-4"
                >
                  <h3 className="text-sm font-semibold text-uc-primary">
                    {competencia.codigo}
                    <span className="ml-2 font-normal text-slate-500">{competencia.nombre}</span>
                  </h3>

                  <p className="text-xs text-tinta-suave">
                    {editable
                      ? 'El instrumento y la frecuencia valen para todos los periodos del plan, no solo este.'
                      : motivoDefinicionBloqueada}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etiqueta={`Instrumento de ${competencia.codigo}`}>
                      {(props) => (
                        <Entrada
                          {...props}
                          disabled={!editable}
                          value={estado.instrumento}
                          onChange={(e) =>
                            cambiarCompetencia(competencia.id, { instrumento: e.target.value })
                          }
                        />
                      )}
                    </Campo>

                    <Campo etiqueta={`Frecuencia de ${competencia.codigo}`}>
                      {(props) => (
                        <Entrada
                          {...props}
                          disabled={!editable}
                          value={estado.frecuencia}
                          onChange={(e) =>
                            cambiarCompetencia(competencia.id, { frecuencia: e.target.value })
                          }
                        />
                      )}
                    </Campo>
                  </div>

                  <Campo
                    etiqueta={`Porcentaje alcanzado de ${competencia.codigo}`}
                    ayuda="De 0 a 100. Se registra también con el plan Vigente."
                  >
                    {(props) => (
                      <Entrada
                        {...props}
                        type="number"
                        min={0}
                        max={100}
                        disabled={!seguimientoEditable}
                        value={estado.porcentaje}
                        onChange={(e) =>
                          cambiarCompetencia(competencia.id, { porcentaje: e.target.value })
                        }
                        className="w-28"
                      />
                    )}
                  </Campo>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-tinta-suave uppercase">
                      Asignaturas que evalúan esta competencia en {periodo.etiqueta}
                    </p>

                    {estado.filas.length === 0 && (
                      <p className="text-sm text-tinta-suave">
                        Todavía no hay asignaturas asociadas a este cruce.
                      </p>
                    )}

                    <ul className="space-y-3">
                      {estado.filas.map((fila, indice) => {
                        const idBase = `${competencia.id}-fila-${indice}`;
                        const idAsignatura = `${idBase}-asignatura`;
                        const idEntregable = `${idBase}-entregable`;
                        const idDocente = `${idBase}-docente`;

                        return (
                          <li key={indice} className="space-y-2 rounded-lg border border-borde p-3">
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
                                <label htmlFor={idAsignatura}>
                                  Asignatura {indice + 1} de {competencia.codigo}
                                </label>
                                <Selector
                                  id={idAsignatura}
                                  disabled={!editable}
                                  value={fila.asignaturaId}
                                  onChange={(e) =>
                                    cambiarFila(competencia.id, indice, {
                                      asignaturaId: e.target.value,
                                    })
                                  }
                                  className="w-56"
                                >
                                  <option value="">Elegir asignatura…</option>
                                  {asignaturasPorCiclo.map(([ciclo, lista]) => (
                                    <optgroup
                                      key={ciclo ?? 'sin-ciclo'}
                                      label={ciclo !== null ? `Ciclo ${ciclo}` : 'Sin ciclo'}
                                    >
                                      {lista.map((a) => (
                                        <option key={a.id} value={a.id}>
                                          {a.codigo} — {a.nombre}
                                          {!a.activa ? ' (inactiva)' : ''}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </Selector>
                              </div>

                              <div className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
                                <label htmlFor={idEntregable}>
                                  Entregable de la asignatura {indice + 1} de {competencia.codigo}
                                </label>
                                <Entrada
                                  id={idEntregable}
                                  disabled={!editable}
                                  value={fila.entregable}
                                  onChange={(e) =>
                                    cambiarFila(competencia.id, indice, {
                                      entregable: e.target.value,
                                    })
                                  }
                                  className="w-40"
                                />
                              </div>

                              <div className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
                                <label htmlFor={idDocente}>
                                  Docente responsable de la asignatura {indice + 1} de{' '}
                                  {competencia.codigo}
                                </label>
                                <Selector
                                  id={idDocente}
                                  disabled={!editable}
                                  value={fila.docenteId ?? ''}
                                  onChange={(e) =>
                                    cambiarFila(competencia.id, indice, {
                                      docenteId: e.target.value === '' ? null : e.target.value,
                                    })
                                  }
                                  className="w-40"
                                >
                                  <option value="">Sin asignar</option>
                                  {docentes.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.nombre}
                                    </option>
                                  ))}
                                </Selector>
                              </div>

                              {editable && (
                                <Boton
                                  variante="fantasma"
                                  tamano="sm"
                                  aria-label={`Quitar la asignatura ${indice + 1} de ${competencia.codigo}`}
                                  onClick={() => quitarFila(competencia.id, indice)}
                                >
                                  Quitar
                                </Boton>
                              )}
                            </div>

                            {fila.aeId ? (
                              <EvidenciasDelEntregable
                                idBase={idBase}
                                etiqueta={`de la asignatura ${indice + 1} de ${competencia.codigo}`}
                                evidencias={fila.evidencias}
                                editable={seguimientoEditable}
                                onCambiar={(evidencias) =>
                                  cambiarEvidencias(competencia.id, indice, evidencias)
                                }
                              />
                            ) : (
                              editable && (
                                <p className="text-xs text-tinta-tenue">
                                  Guarda el periodo para poder adjuntar evidencias de esta fila.
                                </p>
                              )
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {editable && (
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        onClick={() => agregarFila(competencia.id)}
                      >
                        Añadir asignatura
                      </Boton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {puedeGuardarAlgo && competenciasProgramadas.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
            <Boton variante="primario" disabled={guardando} onClick={() => void guardarPeriodo()}>
              {guardando ? 'Guardando…' : 'Guardar el periodo'}
            </Boton>
            {mensaje && (
              <p role="status" className="text-sm font-medium text-estado-activo-fg">
                {mensaje}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-alerta-fg">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

/** RF-PE-020: los enlaces de evidencia de una asignatura evaluada ya guardada. */
function EvidenciasDelEntregable({
  idBase,
  etiqueta,
  evidencias,
  editable,
  onCambiar,
}: {
  idBase: string;
  etiqueta: string;
  evidencias: readonly EvidenciaRegistrada[];
  editable: boolean;
  onCambiar: (evidencias: readonly EvidenciaRegistrada[]) => void;
}) {
  function cambiar(indice: number, cambio: Partial<EvidenciaRegistrada>) {
    onCambiar(evidencias.map((e, i) => (i === indice ? { ...e, ...cambio } : e)));
  }

  function agregar() {
    onCambiar([...evidencias, { id: '', enlace: '', descripcion: '' }]);
  }

  function quitar(indice: number) {
    onCambiar(evidencias.filter((_, i) => i !== indice));
  }

  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2">
      <p className="text-xs font-medium text-tinta-suave">Evidencias {etiqueta}</p>

      {evidencias.map((e, indice) => {
        const idEnlace = `${idBase}-evidencia-${indice}-enlace`;
        const idDescripcion = `${idBase}-evidencia-${indice}-descripcion`;

        return (
          <div key={indice} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
              <label htmlFor={idEnlace}>
                Enlace de la evidencia {indice + 1} {etiqueta}
              </label>
              <Entrada
                id={idEnlace}
                disabled={!editable}
                value={e.enlace}
                onChange={(ev) => cambiar(indice, { enlace: ev.target.value })}
                className="w-56"
              />
            </div>
            <div className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
              <label htmlFor={idDescripcion}>
                Descripción de la evidencia {indice + 1} {etiqueta}
              </label>
              <Entrada
                id={idDescripcion}
                disabled={!editable}
                value={e.descripcion}
                onChange={(ev) => cambiar(indice, { descripcion: ev.target.value })}
                className="w-40"
              />
            </div>
            {editable && (
              <Boton
                variante="fantasma"
                tamano="sm"
                aria-label={`Quitar la evidencia ${indice + 1} ${etiqueta}`}
                onClick={() => quitar(indice)}
              >
                Quitar
              </Boton>
            )}
          </div>
        );
      })}

      {editable && (
        <Boton variante="fantasma" tamano="sm" onClick={agregar}>
          Añadir evidencia
        </Boton>
      )}
    </div>
  );
}
