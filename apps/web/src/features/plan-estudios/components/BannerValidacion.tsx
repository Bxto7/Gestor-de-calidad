/**
 * Reporte de inconsistencias (RF098), alimentado por el motor de validaciones
 * (RF097). Distingue bloqueantes de advertencias (RN1 de ambos RF) y agrupa por
 * regla, listando las entidades afectadas.
 *
 * Las advertencias admiten justificación (RF099); las bloqueantes no, y por eso
 * ni siquiera muestran el botón: ofrecer una acción que el sistema va a
 * rechazar es peor que no ofrecerla.
 */

import { useState } from 'react';

import { AreaTexto, Boton, Modal } from '@/shared/components/ui';
import type { Hallazgo, ResultadoValidacion } from '../domain/motor-validaciones';

export function BannerValidacion({
  resultado,
  onJustificar,
  justificando,
  soloLectura,
}: {
  resultado: ResultadoValidacion;
  onJustificar: (codigoRegla: string, motivo: string) => Promise<unknown>;
  justificando: boolean;
  soloLectura: boolean;
}) {
  const [aJustificar, setAJustificar] = useState<Hallazgo | null>(null);
  const [motivo, setMotivo] = useState('');

  // RF098: mensaje de conformidad cuando no hay nada que reportar.
  if (resultado.hallazgos.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-estado-activo-fg/25 bg-estado-activo-bg px-4 py-3.5">
        <IconoCheck />
        <div>
          <p className="text-sm font-bold text-estado-activo-fg">Sin inconsistencias</p>
          <p className="mt-0.5 text-sm text-tinta-suave">
            El plan cumple todas las validaciones de consistencia.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {resultado.bloqueantes.length > 0 && (
          <Grupo
            /*
             * En un plan cerrado esto es un registro, no una lista de tareas.
             *
             * Los hallazgos se siguen mostrando —saber que un plan histórico no
             * tiene la matriz de competencias es justo lo que una acreditación
             * consulta de sus planes anteriores—, pero llamarlos "bloqueantes"
             * y pedir que se corrijan sería pedir un imposible: el contenido es
             * inmutable y la aprobación ya ocurrió.
             */
            tono={soloLectura ? 'advertencia' : 'bloqueante'}
            titulo={
              soloLectura
                ? `${resultado.bloqueantes.length} observación(es) sobre este plan`
                : `${resultado.bloqueantes.length} inconsistencia(s) bloqueante(s)`
            }
            subtitulo={
              soloLectura
                ? 'El plan quedó cerrado con estas observaciones. No pueden corregirse aquí: para cambiarlo, genera una nueva versión.'
                : 'Deben corregirse antes de enviar el plan a revisión o aprobarlo.'
            }
            hallazgos={resultado.bloqueantes}
          />
        )}

        {resultado.advertencias.length > 0 && (
          <Grupo
            tono="advertencia"
            titulo={`${resultado.advertencias.length} advertencia(s)`}
            subtitulo={
              soloLectura
                ? 'Quedaron registradas al cerrarse el plan.'
                : 'No impiden avanzar. Pueden corregirse o justificarse.'
            }
            hallazgos={resultado.advertencias}
            onJustificar={
              soloLectura
                ? undefined
                : (h) => {
                    setAJustificar(h);
                    setMotivo('');
                  }
            }
          />
        )}
      </div>

      {/* RF099: justificación de una observación no bloqueante. */}
      <Modal
        abierto={aJustificar !== null}
        onCerrar={() => setAJustificar(null)}
        titulo="Justificar observación"
        descripcion={aJustificar?.titulo}
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAJustificar(null)}>
              Cancelar
            </Boton>
            <Boton
              variante="primario"
              disabled={!motivo.trim() || justificando}
              onClick={() => {
                if (!aJustificar) return;
                void onJustificar(aJustificar.codigo, motivo).then(() => setAJustificar(null));
              }}
            >
              {justificando ? 'Guardando…' : 'Registrar justificación'}
            </Boton>
          </>
        }
      >
        <label className="mb-1.5 block text-[13px] font-semibold" htmlFor="motivo-justificacion">
          Motivo por el que no se corregirá
        </label>
        <AreaTexto
          id="motivo-justificacion"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. Los ciclos 9 y 10 se completarán en la siguiente etapa de diseño curricular."
        />
        <p className="mt-2 text-xs text-tinta-suave">
          Queda registrada en el histórico del plan con tu usuario y la fecha.
        </p>
      </Modal>
    </>
  );
}

function Grupo({
  tono,
  titulo,
  subtitulo,
  hallazgos,
  onJustificar,
}: {
  tono: 'bloqueante' | 'advertencia';
  titulo: string;
  subtitulo: string;
  hallazgos: Hallazgo[];
  onJustificar?: (h: Hallazgo) => void;
}) {
  const esBloqueante = tono === 'bloqueante';

  return (
    <section
      className={[
        'rounded-xl border px-4 py-3.5',
        esBloqueante
          ? 'border-alerta-borde bg-alerta-bg'
          : 'border-estado-progreso-fg/25 bg-estado-progreso-bg',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {esBloqueante ? <IconoAlerta /> : <IconoAdvertencia />}
        <div className="min-w-0 flex-1">
          <p
            className={[
              'text-sm font-bold',
              esBloqueante ? 'text-alerta-fg' : 'text-estado-progreso-fg',
            ].join(' ')}
          >
            {titulo}
          </p>
          <p className="mt-0.5 text-sm text-tinta-suave">{subtitulo}</p>

          <ul className="mt-3 flex flex-col gap-2.5">
            {hallazgos.map((h) => (
              <li key={h.codigo} className="rounded-lg bg-white/70 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-tinta">
                    {h.titulo}
                    <span className="ml-2 font-mono text-[11px] font-normal text-tinta-tenue">
                      {h.rf}
                    </span>
                  </p>
                  {onJustificar && (
                    <Boton variante="fantasma" tamano="sm" onClick={() => onJustificar(h)}>
                      Justificar
                    </Boton>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-tinta-suave">{h.detalle}</p>
                {h.afectados.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {h.afectados.map((a) => (
                      <li
                        key={a}
                        className="rounded-md bg-superficie-tenue px-2 py-0.5 text-xs text-tinta-suave"
                      >
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function IconoCheck() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-estado-activo-fg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
    </svg>
  );
}

function IconoAlerta() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-alerta-fg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5M12 15.8v.2" />
    </svg>
  );
}

function IconoAdvertencia() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-estado-progreso-fg"
      aria-hidden="true"
    >
      <path d="M12 4.5l8 14.5H4z" />
      <path d="M12 10v3.5M12 16.3v.2" />
    </svg>
  );
}
