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
import { useParams } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Badge, Boton, CabeceraSeccion, Campo, Cargando, Entrada, Tarjeta } from '@/shared/components/ui';

import { useActa, useEditarCabeceraActa, useReemplazarAsistentesActa } from '../api/queries';
import { permiteEdicion, TONO_ESTADO_ACTA } from '../domain/estado-acta';
import type { Acta } from '../domain/tipos';

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
