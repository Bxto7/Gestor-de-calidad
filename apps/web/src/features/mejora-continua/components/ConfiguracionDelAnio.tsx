/**
 * Configuración de un plan de evaluación **indirecta**, un año a la vez
 * (RF-PE-022 a RF-PE-030).
 *
 * Hermana de `ConfiguracionDelPeriodo` y no una rama suya: un plan es directo o
 * indirecto según su plan de medición base y el tipo no cambia, así que ninguna
 * pantalla necesita las dos formas a la vez. Lo que cambia no es un campo, es
 * la mitad del contenido — aquí no hay cruce con asignaturas (el backend lo
 * rechaza con `exigirTipo`) y sí hay responsable por competencia (RF-PE-024) e
 * indicaciones por año (RF-PE-028). Un componente con la unión de ambos
 * tendría que apagar la mitad de sí mismo en cada uso.
 *
 * Lo que sí se calca es el **patrón de estado**, y a propósito:
 *
 *   1. Lo visible y su punto de comparación viven en un solo `useState`
 *      (`EstadoDelFormulario`). El punto de comparación se calcula a partir de
 *      lo visible al terminar un guardado, y con dos estados separados el
 *      actualizador funcional de uno no puede leer el otro — esa era la vía por
 *      la que se perdía el identificador de una fila recién creada.
 *   2. La conciliación con la configuración refrescada va en un `useEffect`
 *      con una referencia como centinela — no durante el renderizado, que es
 *      lo que React documenta para "ajustar estado ante un cambio de props" y
 *      lo que este componente hacía hasta que la Task 7 encontró el caso que
 *      lo rompe: ver el comentario junto a `configuracionVistaRef`.
 *   3. `baseTrasGuardar` toma el **contenido** de lo que se envió y la
 *      **identidad** de lo visible del momento. Las dos mitades importan: quien
 *      siguió escribiendo mientras el `PUT` viajaba no envió eso, y darlo por
 *      guardado perdería su edición; y durante ese viaje la consulta se
 *      refresca, que es donde se adoptan los `id` que el servidor acaba de
 *      asignar a las indicaciones nuevas.
 *
 * Dos fronteras de edición, como en la tarjeta directa (RF-PE-006):
 *   - `editable` (solo Borrador) cubre instrumento, frecuencia, responsable y
 *     las indicaciones enteras: es la *definición* del plan, lo que se aprueba.
 *   - `seguimientoEditable` (Borrador o Vigente, RN2) cubre el porcentaje
 *     alcanzado y el enlace a los resultados de una indicación: es lo que fue
 *     ocurriendo, y por eso se registra también sobre un plan ya vigente.
 *
 * Cada campo que se repite dice de qué competencia o de qué grupo objetivo es
 * (WCAG 2.4.6): «Instrucción» a secas se repite hasta cuatro veces y no
 * distingue nada, aunque `axe-core` no proteste porque los `id` sí son únicos.
 * La convención vale para todos los campos, no para algunos — es media
 * convención la que se olvida al añadir el siguiente.
 */

import { useEffect, useRef, useState } from 'react';

import {
  AreaTexto,
  Boton,
  Campo,
  Entrada,
  EstadoVacio,
  Modal,
  Selector,
  Tarjeta,
} from '@/shared/components/ui';

import type {
  ConfiguracionDelPlan,
  Docente,
  GrupoObjetivo,
  IndicacionAGuardar,
} from '../domain/tipos';

/** RF-PE-028: los cuatro del enum del backend. No hay «otro». */
const GRUPOS_OBJETIVO: readonly GrupoObjetivo[] = [
  'EGRESADOS',
  'EMPLEADORES',
  'DOCENTES',
  'ESTUDIANTES',
];

const ETIQUETA_GRUPO: Record<GrupoObjetivo, string> = {
  EGRESADOS: 'Egresados',
  EMPLEADORES: 'Empleadores',
  DOCENTES: 'Docentes',
  ESTUDIANTES: 'Estudiantes',
};

export interface DatosCompetenciaDelAnioAGuardar {
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
  /** RF-PE-024. Siempre presente: el `PUT` reemplaza, omitirlo lo borra. */
  readonly responsableId: string | null;
}

export interface ConfiguracionDelAnioProps {
  readonly competencias: readonly { id: string; codigo: string; nombre: string }[];
  readonly periodo: { id: string; etiqueta: string; orden: number };
  /** «competenciaId|periodoId» que la matriz base programó (RF-PE-012). */
  readonly programadas: readonly string[];
  readonly configuracion: ConfiguracionDelPlan;
  /** RF-PE-024: el directorio del que sale el responsable de cada competencia. */
  readonly docentes: readonly Docente[];
  /** RF-PE-006: solo Borrador. Instrumento, frecuencia, responsable, indicaciones. */
  readonly editable: boolean;
  /** RF-PE-006 RN2: Borrador o Vigente. Porcentaje alcanzado y enlace a resultados. */
  readonly seguimientoEditable: boolean;
  readonly onGuardarCompetencia: (
    competenciaId: string,
    datos: DatosCompetenciaDelAnioAGuardar,
  ) => Promise<void>;
  readonly onGuardarPorcentaje: (competenciaId: string, porcentaje: number | null) => Promise<void>;
  readonly onGuardarIndicaciones: (
    periodoId: string,
    indicaciones: readonly IndicacionAGuardar[],
  ) => Promise<void>;
  readonly onGuardarResultados: (
    indicacionId: string,
    enlaceResultados: string | null,
  ) => Promise<void>;
}

/** Una indicación en edición. `id` es null mientras no se haya guardado. */
interface FilaIndicacion {
  readonly id: string | null;
  /** Vacío mientras no se elige: una fila recién añadida no dirige a nadie. */
  readonly grupoObjetivo: GrupoObjetivo | '';
  readonly instruccion: string;
  readonly enlaceInstrumento: string;
  /** Cadena y no `string | null`: es el valor de un `<input>`. */
  readonly enlaceResultados: string;
}

interface EstadoCompetencia {
  readonly instrumento: string;
  readonly frecuencia: string;
  /** Id del responsable; vacío representa `null` (RF-PE-024). */
  readonly responsableId: string;
  /** Cadena del `<input type="number">`; vacía representa `null`. */
  readonly porcentaje: string;
}

interface EstadoDelAnio {
  readonly competencias: Record<string, EstadoCompetencia>;
  readonly indicaciones: readonly FilaIndicacion[];
}

/**
 * Lo que se ve y el punto contra el que se compara, en un solo estado.
 *
 * Juntos y no en dos `useState` porque el punto de comparación se calcula a
 * partir del visible: al terminar un guardado hay que escribirlo mirando lo que
 * el visible tenga **en ese momento**, no lo que tenía cuando se pulsó el
 * botón. Con dos estados separados, el actualizador funcional de uno no puede
 * leer el otro, y esa era exactamente la vía por la que se perdía el `id`.
 */
interface EstadoDelFormulario {
  readonly visible: EstadoDelAnio;
  readonly base: EstadoDelAnio;
}

function estadoInicial(
  competenciasProgramadas: readonly { id: string }[],
  periodoId: string,
  configuracion: ConfiguracionDelPlan,
): EstadoDelAnio {
  const competencias: Record<string, EstadoCompetencia> = {};

  for (const c of competenciasProgramadas) {
    const config = configuracion.competencias.find((x) => x.competenciaId === c.id);
    const medicion = configuracion.mediciones.find(
      (m) => m.competenciaId === c.id && m.periodoId === periodoId,
    );
    competencias[c.id] = {
      instrumento: config?.instrumento ?? '',
      frecuencia: config?.frecuencia ?? '',
      responsableId: config?.responsableId ?? '',
      porcentaje:
        medicion?.porcentajeAlcanzado === null || medicion?.porcentajeAlcanzado === undefined
          ? ''
          : String(medicion.porcentajeAlcanzado),
    };
  }

  return {
    competencias,
    indicaciones: configuracion.indicaciones
      .filter((i) => i.periodoId === periodoId)
      .map((i) => ({
        id: i.id,
        grupoObjetivo: i.grupoObjetivo,
        instruccion: i.instruccion,
        enlaceInstrumento: i.enlaceInstrumento,
        enlaceResultados: i.enlaceResultados ?? '',
      })),
  };
}

/**
 * Adopta del servidor lo único que el servidor sabe y la pantalla no: el `id`
 * que una indicación recién guardada acaba de recibir.
 *
 * Hace falta porque el estado local se deriva de `configuracion` **una sola vez
 * al montar**, y el componente solo se remonta al cambiar de año. Tras guardar,
 * la consulta se refresca y trae los `id` nuevos, pero sin esto la fila seguía
 * con `id: null` y el enlace a los resultados —que RF-PE-029 solo ofrece sobre
 * una indicación ya registrada— no aparecía hasta recargar la página.
 *
 * Lo que **no** hace es traerse el resto de la fila. Quien acaba de guardar
 * puede haber seguido escribiendo, y pisar su instrucción con la del servidor
 * sería perder trabajo para arreglar un campo invisible. `enlaceResultados` sí
 * viaja con el `id`, porque hasta ese momento el campo ni siquiera se pintaba:
 * no hay nada escrito que pisar.
 *
 * El emparejamiento es por grupo objetivo, que es la identidad natural de una
 * indicación dentro de un año: solo cabe una por grupo (índice único), y por
 * eso el servidor conserva `enlaceResultados` emparejando igual.
 *
 * Devuelve `null` cuando no hay nada que adoptar, para no provocar un
 * renderizado por cada refresco de la consulta.
 */
function conciliarConElServidor(
  estado: EstadoDelAnio,
  periodoId: string,
  configuracion: ConfiguracionDelPlan,
): EstadoDelAnio | null {
  const delServidor = configuracion.indicaciones.filter((i) => i.periodoId === periodoId);
  // Un `id` que ya tiene otra fila no se reparte dos veces: dos indicaciones
  // del mismo grupo en el mismo año no existen, pero una pantalla a medio
  // editar sí puede tenerlas un instante.
  const tomados = new Set(
    estado.indicaciones.map((f) => f.id).filter((id): id is string => id !== null),
  );
  let adoptoAlguno = false;

  const indicaciones = estado.indicaciones.map((fila) => {
    if (fila.id !== null || fila.grupoObjetivo === '') return fila;
    const gemela = delServidor.find(
      (i) => !tomados.has(i.id) && i.grupoObjetivo === fila.grupoObjetivo,
    );
    if (!gemela) return fila;
    tomados.add(gemela.id);
    adoptoAlguno = true;
    return { ...fila, id: gemela.id, enlaceResultados: gemela.enlaceResultados ?? '' };
  });

  return adoptoAlguno ? { ...estado, indicaciones } : null;
}

/**
 * El punto de comparación tras un guardado con éxito.
 *
 * El **contenido** sale de lo que de verdad se envió (`enviado`), no del estado
 * visible del momento: quien siguió escribiendo mientras el `PUT` viajaba no
 * envió eso, y darlo por guardado perdería su edición en el guardado siguiente.
 *
 * La **identidad**, en cambio, sale del estado visible (`vigente`), porque
 * durante ese viaje la consulta se refresca y la conciliación adopta ahí los
 * `id` que el servidor acaba de asignar. Sin este cruce, la base se quedaba con
 * `id: null` mientras el visible ya tenía el bueno, y la comparación del enlace
 * a resultados —que empareja las filas por `id`— no encontraba pareja: se
 * anunciaba «Guardado.» y el enlace no salía hacia el servidor.
 */
function baseTrasGuardar(enviado: EstadoDelAnio, vigente: EstadoDelAnio): EstadoDelAnio {
  return {
    competencias: enviado.competencias,
    indicaciones: enviado.indicaciones.map((fila) => {
      if (fila.id !== null || fila.grupoObjetivo === '') return fila;
      const gemela = vigente.indicaciones.find(
        (f) => f.id !== null && f.grupoObjetivo === fila.grupoObjetivo,
      );
      return gemela?.id ? { ...fila, id: gemela.id } : fila;
    }),
  };
}

/**
 * Lo que de una lista de filas se puede enviar como definición del año.
 *
 * Una fila a medio rellenar no viaja: el DTO exige grupo, instrucción y enlace
 * al instrumento (RF-PE-029 RN1), así que mandarla haría fallar el `PUT`
 * entero y con ella se perderían las que sí estaban completas.
 */
function completas(filas: readonly FilaIndicacion[]): IndicacionAGuardar[] {
  const listas: IndicacionAGuardar[] = [];

  for (const f of filas) {
    if (f.grupoObjetivo === '') continue;
    const instruccion = f.instruccion.trim();
    const enlaceInstrumento = f.enlaceInstrumento.trim();
    if (instruccion === '' || enlaceInstrumento === '') continue;
    listas.push({ grupoObjetivo: f.grupoObjetivo, instruccion, enlaceInstrumento });
  }

  return listas;
}

function textoONulo(valor: string): string | null {
  return valor.trim() === '' ? null : valor.trim();
}

/** Cómo nombrar el destinatario de una fila en prosa, con o sin grupo elegido. */
function nombreDelGrupo(fila: FilaIndicacion | undefined): string {
  return fila && fila.grupoObjetivo !== '' ? ETIQUETA_GRUPO[fila.grupoObjetivo] : 'este grupo';
}

export function ConfiguracionDelAnio({
  competencias,
  periodo,
  programadas,
  configuracion,
  docentes,
  editable,
  seguimientoEditable,
  onGuardarCompetencia,
  onGuardarPorcentaje,
  onGuardarIndicaciones,
  onGuardarResultados,
}: ConfiguracionDelAnioProps) {
  // RF-PE-012: solo lo que la matriz base programó en este año. Pintar el
  // resto desactivado ofrecería algo que aquí no se puede hacer.
  const competenciasProgramadas = competencias.filter((c) =>
    programadas.includes(`${c.id}|${periodo.id}`),
  );

  const [formulario, setFormulario] = useState<EstadoDelFormulario>(() => {
    const inicial = estadoInicial(competenciasProgramadas, periodo.id, configuracion);
    return { visible: inicial, base: inicial };
  });
  const estado = formulario.visible;
  const base = formulario.base;

  /**
   * Editar solo mueve lo visible: la base es lo que el servidor tiene, y eso
   * únicamente cambia cuando un guardado termina bien.
   */
  function setVisible(actualizar: (previo: EstadoDelAnio) => EstadoDelAnio) {
    setFormulario((previo) => ({ ...previo, visible: actualizar(previo.visible) }));
  }

  // Conciliación con lo que la consulta acaba de devolver.
  //
  // En un `useEffect` y no durante el renderizado, a pesar de que el patrón
  // "ajustar estado ante un cambio de props" que documenta React sugiere lo
  // segundo: así estaba desde que este componente se escribió, sin que
  // ninguna prueba unitaria lo notara, y el primer recorrido E2E de punta a
  // punta contra la aplicación real —el de la Task 7— es quien lo destapa: guarda
  // una indicación y sigue en la misma pantalla, sin desmontar
  // `ConfiguracionDelAnio`. `useConfiguracionDelPlan`
  // se refresca por `@tanstack/react-query`, que expone su valor con
  // `useSyncExternalStore`; cuando la actualización de ese store coincide con
  // otro `setState` en vuelo de este mismo componente (aquí, el de
  // `guardarAnio` al terminar), React puede reinvocar el cuerpo de la función
  // más veces de las que este ajuste "durante el renderizado" contempla, y una
  // de esas invocaciones de más gana la última palabra con el `formulario`
  // todavía sin conciliar — el `id` recién adoptado se pierde en el propio
  // commit que se suponía que lo fijaba. Un `useEffect` no compite por ese
  // commit: corre después, sobre el estado ya asentado.
  //
  // Los `id` nuevos entran también en la base, y no solo en el visible: la
  // comparación del enlace a resultados empareja por `id`, así que una base con
  // `id: null` no encontraría nunca su pareja y el enlace de una indicación
  // recién creada no se llegaría a enviar.
  const configuracionVistaRef = useRef(configuracion);
  useEffect(() => {
    if (configuracion === configuracionVistaRef.current) return;
    configuracionVistaRef.current = configuracion;
    setFormulario((previo) => {
      const visible = conciliarConElServidor(previo.visible, periodo.id, configuracion);
      const baseConciliada = conciliarConElServidor(previo.base, periodo.id, configuracion);
      if (!visible && !baseConciliada) return previo;
      return { visible: visible ?? previo.visible, base: baseConciliada ?? previo.base };
    });
  }, [configuracion, periodo.id]);

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** RF-PE-030: índice de la indicación ya registrada cuya baja se confirma. */
  const [aEliminar, setAEliminar] = useState<number | null>(null);

  function avisarCambio() {
    // Un aviso de «Guardado» que sobrevive a la siguiente edición mentiría
    // sobre si ese cambio ya se guardó.
    setMensaje(null);
  }

  function cambiarCompetencia(competenciaId: string, cambio: Partial<EstadoCompetencia>) {
    avisarCambio();
    setVisible((previo) => ({
      ...previo,
      competencias: {
        ...previo.competencias,
        [competenciaId]: { ...previo.competencias[competenciaId]!, ...cambio },
      },
    }));
  }

  function cambiarIndicacion(indice: number, cambio: Partial<FilaIndicacion>) {
    avisarCambio();
    setVisible((previo) => ({
      ...previo,
      indicaciones: previo.indicaciones.map((f, i) => (i === indice ? { ...f, ...cambio } : f)),
    }));
  }

  /**
   * Cambiar el grupo objetivo de una fila le quita su identidad del servidor.
   *
   * No es una edición más: el servidor guarda las indicaciones por (plan, año,
   * grupo objetivo) y hace `upsert` sobre esa terna, así que cambiar el grupo
   * no modifica esa fila —crea otra y borra la anterior—. Conservar el `id`
   * viejo dejaría el enlace a los resultados apuntando a un registro que va a
   * desaparecer, y el `PUT` de RF-PE-029 se estrellaría contra un 404 sobre
   * algo que la pantalla decía tener delante. Se suelta la identidad, y el
   * refresco siguiente la vuelve a adoptar si el servidor ya tenía algo para
   * el grupo nuevo.
   *
   * El valor se busca en la lista y no se convierte con `as`: el valor de un
   * `<select>` es `string`, y un aserto lo daría por bueno sin comprobarlo.
   */
  function cambiarGrupo(indice: number, valor: string) {
    const grupoObjetivo = GRUPOS_OBJETIVO.find((g) => g === valor) ?? '';
    const fila = estado.indicaciones[indice];
    if (!fila || fila.grupoObjetivo === grupoObjetivo) return;
    cambiarIndicacion(indice, { grupoObjetivo, id: null, enlaceResultados: '' });
  }

  function agregarIndicacion() {
    avisarCambio();
    setVisible((previo) => ({
      ...previo,
      indicaciones: [
        ...previo.indicaciones,
        {
          id: null,
          grupoObjetivo: '',
          instruccion: '',
          enlaceInstrumento: '',
          enlaceResultados: '',
        },
      ],
    }));
  }

  function quitarIndicacion(indice: number) {
    avisarCambio();
    setVisible((previo) => ({
      ...previo,
      indicaciones: previo.indicaciones.filter((_, i) => i !== indice),
    }));
  }

  async function guardarAnio() {
    setGuardando(true);
    setError(null);
    try {
      for (const competencia of competenciasProgramadas) {
        const actual = estado.competencias[competencia.id];
        const anterior = base.competencias[competencia.id];
        if (!actual || !anterior) continue;

        if (
          editable &&
          (actual.instrumento !== anterior.instrumento ||
            actual.frecuencia !== anterior.frecuencia ||
            actual.responsableId !== anterior.responsableId)
        ) {
          await onGuardarCompetencia(competencia.id, {
            instrumento: textoONulo(actual.instrumento),
            frecuencia: textoONulo(actual.frecuencia),
            // RF-PE-024: siempre presente, aunque sea `null`. El `PUT`
            // reemplaza la configuración entera y omitirlo la borraría.
            responsableId: actual.responsableId === '' ? null : actual.responsableId,
          });
        }

        if (seguimientoEditable && actual.porcentaje !== anterior.porcentaje) {
          await onGuardarPorcentaje(
            competencia.id,
            actual.porcentaje === '' ? null : Number(actual.porcentaje),
          );
        }
      }

      // RF-PE-028 y RF-PE-030: un solo `PUT` con el conjunto entero del año.
      // Se compara lo enviable, no las filas crudas: una fila a medio rellenar
      // que no viaja tampoco es un cambio que anunciar al servidor.
      if (editable) {
        const aEnviar = completas(estado.indicaciones);
        if (JSON.stringify(aEnviar) !== JSON.stringify(completas(base.indicaciones))) {
          await onGuardarIndicaciones(periodo.id, aEnviar);
        }
      }

      // RF-PE-029: el enlace a resultados es seguimiento y va por su propio
      // endpoint, indicación por indicación. Solo las ya registradas: hasta
      // tener `id` no hay a qué asociarlo.
      if (seguimientoEditable) {
        for (const fila of estado.indicaciones) {
          if (fila.id === null) continue;
          const filaBase = base.indicaciones.find((f) => f.id === fila.id);
          if (filaBase && filaBase.enlaceResultados !== fila.enlaceResultados) {
            await onGuardarResultados(fila.id, textoONulo(fila.enlaceResultados));
          }
        }
      }

      // Actualización funcional, y no `base: estado`: `estado` es la
      // instantánea del cierre, tomada al pulsar el botón. Mientras los `PUT`
      // viajaban, la consulta se refrescó y la conciliación adoptó los `id`
      // nuevos en el estado visible; pisar la base con esa instantánea los
      // tiraba. Ver `baseTrasGuardar`.
      setFormulario((previo) => ({ ...previo, base: baseTrasGuardar(estado, previo.visible) }));
      setMensaje('Guardado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el año.');
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
            titulo="Sin competencias programadas en este año"
            detalle={`La matriz del plan de medición base no programó ninguna competencia en ${periodo.etiqueta}.`}
          />
        ) : (
          <div className="space-y-8">
            {competenciasProgramadas.map((competencia) => {
              const dato = estado.competencias[competencia.id];
              if (!dato) return null;

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
                      ? 'El instrumento, la frecuencia y el responsable valen para todos los años del plan, no solo este.'
                      : motivoDefinicionBloqueada}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etiqueta={`Instrumento de ${competencia.codigo}`}>
                      {(props) => (
                        <Entrada
                          {...props}
                          disabled={!editable}
                          value={dato.instrumento}
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
                          value={dato.frecuencia}
                          onChange={(e) =>
                            cambiarCompetencia(competencia.id, { frecuencia: e.target.value })
                          }
                        />
                      )}
                    </Campo>
                  </div>

                  {/* RF-PE-024: obligatorio antes de aprobar, pero no al escribir. */}
                  <Campo
                    etiqueta={`Responsable de ${competencia.codigo}`}
                    ayuda="Quién ejecuta la medición de esta competencia."
                  >
                    {(props) => (
                      <Selector
                        {...props}
                        disabled={!editable}
                        value={dato.responsableId}
                        onChange={(e) =>
                          cambiarCompetencia(competencia.id, { responsableId: e.target.value })
                        }
                        className="max-w-xs"
                      >
                        <option value="">Sin asignar</option>
                        {docentes.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                          </option>
                        ))}
                      </Selector>
                    )}
                  </Campo>

                  {/* RF-PE-026: uno por competencia y año (RN2). */}
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
                        value={dato.porcentaje}
                        onChange={(e) =>
                          cambiarCompetencia(competencia.id, { porcentaje: e.target.value })
                        }
                        className="w-28"
                      />
                    )}
                  </Campo>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Indicaciones del año (RF-PE-028 a RF-PE-030) ──────────────── */}
        <section className="space-y-3 border-t border-borde pt-5">
          <h3 className="text-sm font-semibold text-tinta">Indicaciones del año</h3>
          <p className="text-xs text-tinta-suave">
            Opcionales, hasta una por grupo objetivo (RF-PE-028 RN1 y RN2). El enlace a los
            resultados puede completarse después, cuando la medición se haya aplicado.
          </p>

          {estado.indicaciones.length === 0 && (
            <p className="text-sm text-tinta-suave">
              Este año todavía no tiene indicaciones registradas.
            </p>
          )}

          <ul className="space-y-3">
            {estado.indicaciones.map((fila, indice) => {
              // Con el grupo elegido, el nombre accesible lo dice; hasta
              // entonces solo cabe el ordinal, que al menos distingue las filas
              // entre sí.
              const paraQuien =
                fila.grupoObjetivo === '' ? `la indicación ${indice + 1}` : fila.grupoObjetivo;
              // Solo cabe una indicación por grupo y año: ofrecer un grupo que
              // ya usa otra fila sería ofrecer un 409.
              const libres = GRUPOS_OBJETIVO.filter(
                (g) =>
                  g === fila.grupoObjetivo ||
                  !estado.indicaciones.some((f) => f.grupoObjetivo === g),
              );

              return (
                <li key={indice} className="space-y-3 rounded-lg border border-borde p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <Campo etiqueta={`Grupo objetivo de la indicación ${indice + 1}`}>
                      {(props) => (
                        <Selector
                          {...props}
                          disabled={!editable}
                          value={fila.grupoObjetivo}
                          onChange={(e) => cambiarGrupo(indice, e.target.value)}
                          className="w-52"
                        >
                          <option value="">Elegir grupo objetivo…</option>
                          {libres.map((g) => (
                            <option key={g} value={g}>
                              {ETIQUETA_GRUPO[g]}
                            </option>
                          ))}
                        </Selector>
                      )}
                    </Campo>

                    {editable && (
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        className="mt-6"
                        aria-label={`Quitar la indicación ${indice + 1}`}
                        onClick={() =>
                          // RF-PE-030: la baja de una indicación ya registrada
                          // se confirma. Una que aún no ha salido de la
                          // pantalla no tiene nada que confirmar.
                          fila.id === null ? quitarIndicacion(indice) : setAEliminar(indice)
                        }
                      >
                        Quitar
                      </Boton>
                    )}
                  </div>

                  <Campo etiqueta={`Instrucción para ${paraQuien}`}>
                    {(props) => (
                      <AreaTexto
                        {...props}
                        rows={2}
                        disabled={!editable}
                        value={fila.instruccion}
                        onChange={(e) => cambiarIndicacion(indice, { instruccion: e.target.value })}
                      />
                    )}
                  </Campo>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta={`Enlace al instrumento para ${paraQuien}`}>
                      {(props) => (
                        <Entrada
                          {...props}
                          disabled={!editable}
                          value={fila.enlaceInstrumento}
                          onChange={(e) =>
                            cambiarIndicacion(indice, { enlaceInstrumento: e.target.value })
                          }
                        />
                      )}
                    </Campo>

                    {/* RF-PE-029: se asocia a una indicación ya registrada. Sin
                        `id` no hay a qué asociarlo, así que el campo no se
                        pinta en vez de pintarse muerto. */}
                    {fila.id !== null ? (
                      <Campo etiqueta={`Enlace a los resultados para ${paraQuien}`}>
                        {(props) => (
                          <Entrada
                            {...props}
                            disabled={!seguimientoEditable}
                            value={fila.enlaceResultados}
                            onChange={(e) =>
                              cambiarIndicacion(indice, { enlaceResultados: e.target.value })
                            }
                          />
                        )}
                      </Campo>
                    ) : (
                      <p className="self-end text-xs text-tinta-tenue">
                        Guarda el año para poder registrar el enlace a los resultados.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {editable && estado.indicaciones.length < GRUPOS_OBJETIVO.length && (
            <Boton variante="secundario" tamano="sm" onClick={agregarIndicacion}>
              Añadir indicación
            </Boton>
          )}
        </section>

        {puedeGuardarAlgo && (
          <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
            <Boton variante="primario" disabled={guardando} onClick={() => void guardarAnio()}>
              {guardando ? 'Guardando…' : 'Guardar el año'}
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

      {aEliminar !== null && (
        <Modal
          abierto
          titulo="Eliminar la indicación"
          descripcion="Se quitará al guardar el año. Los porcentajes ya registrados no se ven afectados (RF-PE-030 RN1)."
          onCerrar={() => setAEliminar(null)}
          pie={
            <>
              <Boton variante="secundario" onClick={() => setAEliminar(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                onClick={() => {
                  quitarIndicacion(aEliminar);
                  setAEliminar(null);
                }}
              >
                Eliminar
              </Boton>
            </>
          }
        >
          <p className="text-sm text-tinta-suave">
            La indicación dirigida a {nombreDelGrupo(estado.indicaciones[aEliminar])} dejará de
            formar parte de {periodo.etiqueta}.
          </p>
        </Modal>
      )}
    </Tarjeta>
  );
}
