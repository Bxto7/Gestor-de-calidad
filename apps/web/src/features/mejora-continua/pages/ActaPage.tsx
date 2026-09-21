// apps/web/src/features/mejora-continua/pages/ActaPage.tsx

/**
 * Detalle del acta de aprobación — RF-AC-003 a 017.
 *
 * Secciones apiladas verticalmente, no en pestañas (mismo criterio que
 * `PlanMedicionPage`): cabecera, asistentes, acciones del periodo, textos
 * institucionales, y el estado del acta con sus transiciones. Editable solo
 * en Borrador (RF-AC-017).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  AreaTexto,
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  Modal,
  Tarjeta,
} from '@/shared/components/ui';

import {
  useActa,
  useActualizarSeleccionActa,
  useCargarAccionesActa,
  useContenidoActa,
  useEditarCabeceraActa,
  useEditarTextosActa,
  useEliminarActa,
  useReemplazarAsistentesActa,
  useTransicionarActa,
} from '../api/queries';
import {
  describirTransicion,
  permiteEdicion,
  TONO_ESTADO_ACTA,
  transicionesDisponibles,
  type AccionActaTransicion,
} from '../domain/estado-acta';
import type { Acta, AccionDelActa } from '../domain/tipos';

export function ActaPage() {
  const { id = '' } = useParams();
  const { publicar } = useEncabezado();

  const { data: acta, isLoading } = useActa(id);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicar({
      migas: [
        { etiqueta: 'Actas de aprobación', a: '/mejora-continua/actas' },
        { etiqueta: acta?.codigo ?? 'Acta' },
      ],
      acciones: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acta?.codigo]);

  if (isLoading || !acta) return <Cargando etiqueta="Cargando el acta de aprobación…" />;

  const editable = permiteEdicion(acta.estado);

  async function ejecutar(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo completar la operación.');
    }
  }

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo={acta.codigo}
        descripcion={`Periodo académico ${acta.periodoAcademico}`}
        acciones={<Badge tono={TONO_ESTADO_ACTA[acta.estado]}>{acta.estado}</Badge>}
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
        >
          {error}
        </p>
      )}

      <CabeceraActaForm acta={acta} editable={editable} onError={setError} ejecutar={ejecutar} />
      <AsistentesActaSeccion acta={acta} editable={editable} ejecutar={ejecutar} />
      <AccionesDelPeriodoSeccion acta={acta} editable={editable} ejecutar={ejecutar} />
      <TextosInstitucionalesSeccion acta={acta} editable={editable} ejecutar={ejecutar} />
      <EstadoActaSeccion acta={acta} ejecutar={ejecutar} />
      {editable && <EliminarActaSeccion acta={acta} ejecutar={ejecutar} />}
    </div>
  );
}

/** RF-AC-003/004/006: la cabecera completa. Solo editable en Borrador. */
function CabeceraActaForm({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  onError: (e: string | null) => void;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const editar = useEditarCabeceraActa(acta.id);

  const fechaReunionInicial = acta.fechaReunion.slice(0, 10);
  const fechaEmisionInicial = acta.fechaEmision?.slice(0, 10) ?? '';

  const [titulo, setTitulo] = useState(acta.titulo);
  const [objetivo, setObjetivo] = useState(acta.objetivo);
  const [convocadaPor, setConvocadaPor] = useState(acta.convocadaPor);
  const [fechaReunion, setFechaReunion] = useState(fechaReunionInicial);
  const [lugarReunion, setLugarReunion] = useState(acta.lugarReunion);
  const [lugarEmision, setLugarEmision] = useState(acta.lugarEmision ?? '');
  const [fechaEmision, setFechaEmision] = useState(fechaEmisionInicial);

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Cabecera del acta</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Título" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={titulo}
              disabled={!editable}
              onChange={(e) => setTitulo(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Objetivo" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={objetivo}
              disabled={!editable}
              onChange={(e) => setObjetivo(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Convocada por" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={convocadaPor}
              disabled={!editable}
              onChange={(e) => setConvocadaPor(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Fecha de reunión" requerido>
          {(props) => (
            <Entrada
              {...props}
              type="date"
              value={fechaReunion}
              disabled={!editable}
              onChange={(e) => setFechaReunion(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Lugar de reunión" requerido>
          {(props) => (
            <Entrada
              {...props}
              value={lugarReunion}
              disabled={!editable}
              onChange={(e) => setLugarReunion(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Lugar de emisión" ayuda="Puede coincidir con el de la reunión.">
          {(props) => (
            <Entrada
              {...props}
              value={lugarEmision}
              disabled={!editable}
              onChange={(e) => setLugarEmision(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Fecha de emisión">
          {(props) => (
            <Entrada
              {...props}
              type="date"
              value={fechaEmision}
              disabled={!editable}
              onChange={(e) => setFechaEmision(e.target.value)}
            />
          )}
        </Campo>
      </div>

      {editable && (
        <div className="mt-4">
          <Boton
            variante="primario"
            disabled={editar.isPending}
            onClick={() =>
              void ejecutar(() =>
                editar.mutateAsync({
                  titulo,
                  objetivo,
                  convocadaPor,
                  fechaReunion: new Date(fechaReunion).toISOString(),
                  lugarReunion,
                  lugarEmision: lugarEmision || undefined,
                  fechaEmision: fechaEmision ? new Date(fechaEmision).toISOString() : undefined,
                }),
              )
            }
          >
            {editar.isPending ? 'Guardando…' : 'Guardar cabecera'}
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

/** RF-AC-005: reemplazo completo de la lista de asistentes. */
function AsistentesActaSeccion({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const reemplazar = useReemplazarAsistentesActa(acta.id);
  const [nombres, setNombres] = useState<string[]>(acta.asistentes.map((a) => a.nombre));

  function actualizar(i: number, valor: string) {
    setNombres((prev) => prev.map((n, idx) => (idx === i ? valor : n)));
  }

  function quitar(i: number) {
    setNombres((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Asistentes</h2>
      <div className="space-y-3">
        {nombres.map((nombre, i) => (
          <div key={i} className="flex gap-2">
            <Campo etiqueta={`Asistente ${i + 1}`}>
              {(props) => (
                <Entrada
                  {...props}
                  value={nombre}
                  disabled={!editable}
                  onChange={(e) => actualizar(i, e.target.value)}
                />
              )}
            </Campo>
            {editable && (
              <Boton
                variante="fantasma"
                tamano="sm"
                className="mt-6 h-10"
                onClick={() => quitar(i)}
              >
                Quitar
              </Boton>
            )}
          </div>
        ))}

        {editable && (
          <div className="flex gap-2">
            <Boton variante="secundario" tamano="sm" onClick={() => setNombres((p) => [...p, ''])}>
              Agregar asistente
            </Boton>
            <Boton
              variante="primario"
              tamano="sm"
              disabled={reemplazar.isPending}
              onClick={() =>
                void ejecutar(() =>
                  reemplazar.mutateAsync(nombres.map((n) => n.trim()).filter((n) => n.length > 0)),
                )
              }
            >
              {reemplazar.isPending ? 'Guardando…' : 'Guardar asistentes'}
            </Boton>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

const ETIQUETA_ASPECTO: Record<AccionDelActa['plan']['aspecto'], string> = {
  CRITERIO_ACREDITACION: 'Criterio de acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo educacional',
  COMPETENCIA: 'Competencia',
};

/** RF-AC-007/008/009: las acciones de mejora del acta, agrupadas por aspecto. */
function AccionesDelPeriodoSeccion({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { data: contenido } = useContenidoActa(acta.id);
  const cargar = useCargarAccionesActa(acta.id);
  const actualizarSeleccion = useActualizarSeleccionActa(acta.id);

  const acciones = contenido?.acciones ?? [];

  function toggle(accion: AccionDelActa) {
    void ejecutar(() =>
      actualizarSeleccion.mutateAsync([
        { planMejoraId: accion.plan.id, incluida: !accion.incluida },
      ]),
    );
  }

  return (
    <Tarjeta>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tinta">Acciones del periodo</h2>
        {editable && (
          <Boton
            variante="secundario"
            tamano="sm"
            disabled={cargar.isPending}
            onClick={() => void ejecutar(() => cargar.mutateAsync(undefined))}
          >
            {cargar.isPending ? 'Cargando…' : 'Cargar acciones del periodo'}
          </Boton>
        )}
      </div>

      {acciones.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Todavía no hay acciones cargadas. Usa &quot;Cargar acciones del periodo&quot; para traer
          las acciones de mejora aprobadas o vigentes de la carrera.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Acciones de mejora incluidas en el acta</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Incluida
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Aspecto
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Acción
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Responsable
                </th>
              </tr>
            </thead>
            <tbody>
              {acciones.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={a.plan.nombre}
                      checked={a.incluida}
                      disabled={!editable}
                      onChange={() => toggle(a)}
                    />
                  </td>
                  <td className="px-4 py-3">{ETIQUETA_ASPECTO[a.plan.aspecto]}</td>
                  <td className="px-4 py-3">{a.plan.codigo}</td>
                  <td className="px-4 py-3">{a.plan.nombre}</td>
                  <td className="px-4 py-3">{a.plan.responsable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

/** RF-AC-011: reemplazo parcial de los textos institucionales. */
function TextosInstitucionalesSeccion({
  acta,
  editable,
  ejecutar,
}: {
  acta: Acta;
  editable: boolean;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const editarTextos = useEditarTextosActa(acta.id);
  const [textoIntroduccion, setTextoIntroduccion] = useState(acta.textoIntroduccion);
  const [textoAcuerdoCierre, setTextoAcuerdoCierre] = useState(acta.textoAcuerdoCierre);

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Textos institucionales</h2>
      <div className="space-y-4">
        <Campo etiqueta="Introducción" requerido>
          {(props) => (
            <AreaTexto
              {...props}
              rows={4}
              value={textoIntroduccion}
              disabled={!editable}
              onChange={(e) => setTextoIntroduccion(e.target.value)}
            />
          )}
        </Campo>
        <Campo etiqueta="Acuerdo de cierre" requerido>
          {(props) => (
            <AreaTexto
              {...props}
              rows={4}
              value={textoAcuerdoCierre}
              disabled={!editable}
              onChange={(e) => setTextoAcuerdoCierre(e.target.value)}
            />
          )}
        </Campo>

        {editable && (
          <Boton
            variante="primario"
            disabled={editarTextos.isPending}
            onClick={() =>
              void ejecutar(() =>
                editarTextos.mutateAsync({ textoIntroduccion, textoAcuerdoCierre }),
              )
            }
          >
            {editarTextos.isPending ? 'Guardando…' : 'Guardar textos'}
          </Boton>
        )}
      </div>
    </Tarjeta>
  );
}

/** RF-AC-013 a 016: la fila de transición, mismo patrón que `PlanMedicionPage`. */
function EstadoActaSeccion({
  acta,
  ejecutar,
}: {
  acta: Acta;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const transicionar = useTransicionarActa(acta.id);
  const [enTransicion, setEnTransicion] = useState<AccionActaTransicion | null>(null);

  const disponibles = transicionesDisponibles(acta.estado);

  return (
    <Tarjeta>
      <h2 className="mb-4 text-sm font-semibold text-tinta">Estado del acta</h2>
      <div className="flex flex-wrap gap-2">
        {disponibles.map((accion) => {
          const t = describirTransicion(accion);
          return (
            <Boton
              key={accion}
              variante={accion === 'rechazar' ? 'secundario' : 'primario'}
              onClick={() =>
                t.exigeComentario
                  ? setEnTransicion(accion)
                  : void ejecutar(() => transicionar.mutateAsync({ accion }))
              }
            >
              {t.etiqueta}
            </Boton>
          );
        })}
        {disponibles.length === 0 && (
          <p className="text-sm text-tinta-suave">
            Un acta {acta.estado.toLowerCase()} no admite más cambios de estado.
          </p>
        )}
      </div>

      {enTransicion && (
        <ModalObservacion
          etiqueta={describirTransicion(enTransicion).etiqueta}
          onCerrar={() => setEnTransicion(null)}
          onConfirmar={(comentario) => {
            void ejecutar(() => transicionar.mutateAsync({ accion: enTransicion, comentario }));
            setEnTransicion(null);
          }}
        />
      )}
    </Tarjeta>
  );
}

/** RF-AC-015 RN1: el rechazo obliga a comentario. */
function ModalObservacion({
  etiqueta,
  onCerrar,
  onConfirmar,
}: {
  etiqueta: string;
  onCerrar: () => void;
  onConfirmar: (comentario: string) => void;
}) {
  const [comentario, setComentario] = useState('');

  return (
    <Modal
      abierto
      titulo={etiqueta}
      descripcion="El motivo queda en la bitácora junto al cambio de estado."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!comentario.trim()}
            onClick={() => onConfirmar(comentario)}
          >
            Confirmar
          </Boton>
        </>
      }
    >
      <Campo etiqueta="Motivo del rechazo" requerido>
        {(props) => (
          <AreaTexto
            {...props}
            rows={4}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

/** RF-AC-017 RN2: solo un acta en Borrador puede eliminarse. */
function EliminarActaSeccion({
  acta,
  ejecutar,
}: {
  acta: Acta;
  ejecutar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const navegar = useNavigate();
  const eliminar = useEliminarActa(acta.id);

  return (
    <Tarjeta>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-tinta">Eliminar acta</h2>
          <p className="text-sm text-tinta-suave">Solo posible mientras el acta está en Borrador.</p>
        </div>
        <Boton
          variante="peligro"
          disabled={eliminar.isPending}
          onClick={() =>
            void ejecutar(async () => {
              await eliminar.mutateAsync(undefined);
              void navegar('/mejora-continua/actas');
            })
          }
        >
          {eliminar.isPending ? 'Eliminando…' : 'Eliminar acta'}
        </Boton>
      </div>
    </Tarjeta>
  );
}
