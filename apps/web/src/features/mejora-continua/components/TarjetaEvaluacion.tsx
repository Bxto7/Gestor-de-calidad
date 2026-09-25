/**
 * Una evaluación asignada al docente, con sus evidencias y el formulario para
 * agregar más.
 *
 * Es una región con nombre (asignatura · competencia · periodo): con varias
 * tarjetas en la página, «Enlace de la evidencia» a secas se repite una vez por
 * tarjeta y no distingue nada; el nombre de la región sí (WCAG 2.4.6).
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Boton, Campo, Entrada, Tarjeta } from '@/shared/components/ui';

import type { EvaluacionAsignada } from '../api/mis-evidencias.api';

interface Props {
  readonly evaluacion: EvaluacionAsignada;
  readonly onAgregar: (
    asignaturaEvaluadaId: string,
    datos: { enlace: string; descripcion: string },
  ) => Promise<void>;
  readonly onRetirar: (evidenciaId: string) => Promise<void>;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-07-15` → `15 jul`. A mano: `toLocaleDateString` depende del ICU de cada entorno. */
function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? ''}`;
}

const ENLACE_SEGURO = /^https?:\/\//i;

/**
 * Espejo del `IsUrl({ require_protocol: true })` del servidor (que exige además un
 * dominio con punto): así el fallo sale en español junto al campo y no como un 400.
 */
function validarEnlace(enlace: string): string | null {
  if (!enlace) return 'Escribe el enlace de la evidencia.';
  if (!ENLACE_SEGURO.test(enlace)) return 'El enlace debe empezar por http:// o https://.';
  try {
    if (new URL(enlace).hostname.includes('.')) return null;
  } catch {
    // Cae al mensaje de enlace mal formado.
  }
  return 'Escribe un enlace válido, por ejemplo https://ejemplo.pe/documento.';
}

const mensajeDe = (fallo: unknown): string =>
  fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';

export function TarjetaEvaluacion({ evaluacion, onAgregar, onRetirar }: Props) {
  const [enlace, setEnlace] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errores, setErrores] = useState<{ enlace?: string; descripcion?: string }>({});
  const [errorDeEnvio, setErrorDeEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  const [errorDeRetiro, setErrorDeRetiro] = useState<string | null>(null);
  const [retirando, setRetirando] = useState(false);
  const destinoDelFoco = useRef<string | null>(null);

  const nombre = `${evaluacion.asignatura.nombre} · ${evaluacion.competencia.codigo} · ${evaluacion.periodo.etiqueta}`;

  async function agregar(e: FormEvent) {
    e.preventDefault();
    const enlaceLimpio = enlace.trim();
    const descripcionLimpia = descripcion.trim();

    const nuevos: { enlace?: string; descripcion?: string } = {};
    const falloDeEnlace = validarEnlace(enlaceLimpio);
    if (falloDeEnlace) nuevos.enlace = falloDeEnlace;
    if (!descripcionLimpia) nuevos.descripcion = 'Escribe una descripción.';
    setErrores(nuevos);
    if (nuevos.enlace || nuevos.descripcion) return;

    setEnviando(true);
    setErrorDeEnvio(null);
    try {
      await onAgregar(evaluacion.id, { enlace: enlaceLimpio, descripcion: descripcionLimpia });
      setEnlace('');
      setDescripcion('');
    } catch (fallo) {
      setErrorDeEnvio(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  // La confirmación reemplaza al botón «Retirar» y luego desaparece: sin mover el foco a
  // mano, el teclado y los lectores de pantalla lo pierden al abrirla y al cerrarla.
  useEffect(() => {
    if (porConfirmar !== null) {
      document.getElementById(`confirmar-${porConfirmar}`)?.focus();
    } else if (destinoDelFoco.current !== null) {
      document.getElementById(destinoDelFoco.current)?.focus();
      destinoDelFoco.current = null;
    }
  }, [porConfirmar]);

  function abrirConfirmacion(evidenciaId: string) {
    setErrorDeRetiro(null);
    setPorConfirmar(evidenciaId);
  }

  function cancelarConfirmacion(evidenciaId: string) {
    setErrorDeRetiro(null);
    destinoDelFoco.current = `retirar-${evidenciaId}`;
    setPorConfirmar(null);
  }

  async function retirar(evidenciaId: string) {
    if (retirando) return;
    setRetirando(true);
    setErrorDeRetiro(null);
    try {
      await onRetirar(evidenciaId);
      // La fila retirada ya no existe: el foco va a la propia tarjeta.
      destinoDelFoco.current = `tarjeta-${evaluacion.id}`;
    } catch (fallo) {
      setErrorDeRetiro(mensajeDe(fallo));
      destinoDelFoco.current = `retirar-${evidenciaId}`;
    } finally {
      setRetirando(false);
      setPorConfirmar(null);
    }
  }

  return (
    <Tarjeta
      role="region"
      aria-label={nombre}
      id={`tarjeta-${evaluacion.id}`}
      tabIndex={-1}
      className="space-y-4 focus:outline-none"
    >
      <div>
        <p className="text-sm font-semibold text-tinta">
          {evaluacion.competencia.codigo} · {evaluacion.competencia.nombre}
        </p>
        <p className="mt-0.5 text-xs text-tinta-suave">
          {evaluacion.entregable} · Periodo {evaluacion.periodo.etiqueta} ·{' '}
          {evaluacion.periodo.fechaCierre
            ? `cierra el ${fechaCorta(evaluacion.periodo.fechaCierre)}`
            : 'sin fecha de cierre'}
        </p>
      </div>

      {evaluacion.evidencias.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Aún no registraste evidencias en esta evaluación.
        </p>
      ) : (
        <ul className="space-y-2">
          {evaluacion.evidencias.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {/* Un enlace guardado con otro esquema (p. ej. javascript:) no se vuelve clicable. */}
              {ENLACE_SEGURO.test(ev.enlace) ? (
                <a
                  href={ev.enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-uc-primary underline-offset-2 hover:underline"
                >
                  {ev.descripcion}
                </a>
              ) : (
                <span className="font-medium text-tinta">{ev.descripcion}</span>
              )}
              {ev.propia &&
                (porConfirmar === ev.id ? (
                  <span
                    role="group"
                    aria-label={`Confirmar retiro de ${ev.descripcion}`}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs text-tinta-suave">¿Retirar esta evidencia?</span>
                    <Boton
                      id={`confirmar-${ev.id}`}
                      tamano="sm"
                      variante="peligro"
                      disabled={retirando}
                      onClick={() => void retirar(ev.id)}
                    >
                      Confirmar
                    </Boton>
                    <Boton
                      tamano="sm"
                      variante="fantasma"
                      onClick={() => cancelarConfirmacion(ev.id)}
                    >
                      Cancelar
                    </Boton>
                  </span>
                ) : (
                  <Boton
                    id={`retirar-${ev.id}`}
                    tamano="sm"
                    variante="fantasma"
                    aria-label={`Retirar ${ev.descripcion}`}
                    onClick={() => abrirConfirmacion(ev.id)}
                  >
                    Retirar
                  </Boton>
                ))}
            </li>
          ))}
        </ul>
      )}

      {errorDeRetiro && (
        <p role="alert" className="text-xs font-medium text-alerta-fg">
          {errorDeRetiro}
        </p>
      )}

      {evaluacion.puedeAgregar ? (
        <form onSubmit={(e) => void agregar(e)} noValidate className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Enlace de la evidencia" error={errores.enlace}>
            {(props) => (
              <Entrada
                {...props}
                type="url"
                inputMode="url"
                maxLength={2000}
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                placeholder="https://"
              />
            )}
          </Campo>
          <Campo etiqueta="Descripción" error={errores.descripcion}>
            {(props) => (
              <Entrada
                {...props}
                maxLength={200}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            )}
          </Campo>
          <div className="sm:col-span-2">
            <Boton type="submit" variante="primario" disabled={enviando}>
              Agregar evidencia
            </Boton>
          </div>
          {errorDeEnvio && (
            <p role="alert" className="text-xs font-medium text-alerta-fg sm:col-span-2">
              {errorDeEnvio}
            </p>
          )}
        </form>
      ) : (
        <p className="text-sm text-tinta-suave">Esta evaluación ya tiene 20 evidencias.</p>
      )}
    </Tarjeta>
  );
}
