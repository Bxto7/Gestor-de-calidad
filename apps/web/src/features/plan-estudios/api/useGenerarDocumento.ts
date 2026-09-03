/**
 * Pedir un documento y esperarlo (RF072, RF073, RF084, RF092).
 *
 * El servidor encola y responde enseguida, así que la pantalla tiene que
 * preguntar por el estado hasta que el archivo exista. Eso es un ciclo con
 * estado propio —encolado, sondeo, descarga, limpieza al desmontar— y por eso
 * vive aquí y no repartido por los componentes que lo usan.
 *
 * No usa `useQuery` con `refetchInterval` a propósito: esto no es un dato de
 * servidor que se consulta y se cachea, es una operación que empieza cuando el
 * usuario pulsa y termina sola. Modelarlo como caché obligaría a inventar una
 * clave por pulsación y a invalidarla después.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import * as api from './plan-estudios.api';
import type { TipoDocumento, TrabajoDocumento } from '../domain/tipos';

/** Cada cuánto se pregunta por el estado. */
const INTERVALO_MS = 700;

/**
 * Cuánto se espera antes de rendirse.
 *
 * El RNF de generación es de menos de 5 segundos; un minuto es margen de sobra
 * para un pico de carga. Pasado eso, seguir preguntando en bucle no aporta:
 * significa que el worker no está atendiendo, y el usuario merece saberlo en
 * vez de ver un botón girando indefinidamente.
 */
const ESPERA_MAXIMA_MS = 60_000;

export interface EstadoGeneracion {
  /** Qué documento se está generando ahora mismo, si hay alguno. */
  readonly enCurso: TipoDocumento | null;
  readonly error: string | null;
  /** El último trabajo terminado con éxito, para poder volver a descargarlo. */
  readonly ultimo: TrabajoDocumento | null;
}

export function useGenerarDocumento() {
  const [estado, setEstado] = useState<EstadoGeneracion>({
    enCurso: null,
    error: null,
    ultimo: null,
  });

  // El componente puede desmontarse mientras se sondea —basta con navegar a
  // otra pantalla—. Sin esto, el sondeo seguiría y escribiría estado sobre un
  // componente que ya no existe.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const generar = useCallback(async (planId: string, tipo: TipoDocumento): Promise<void> => {
    setEstado({ enCurso: tipo, error: null, ultimo: null });

    try {
      const encolado = await api.solicitarDocumento(planId, tipo);
      const listo = await esperar(encolado.id, vivo);

      if (!vivo.current) return;

      if (listo.estado === 'Fallido') {
        setEstado({
          enCurso: null,
          error: listo.error ?? 'La generación del documento falló.',
          ultimo: null,
        });
        return;
      }

      api.guardarArchivo(await api.descargarDocumento(listo.id));
      if (vivo.current) setEstado({ enCurso: null, error: null, ultimo: listo });
    } catch (e: unknown) {
      if (!vivo.current) return;
      setEstado({
        enCurso: null,
        error: e instanceof Error ? e.message : 'No se pudo generar el documento.',
        ultimo: null,
      });
    }
  }, []);

  const descartarError = useCallback(() => {
    setEstado((previo) => ({ ...previo, error: null }));
  }, []);

  return { ...estado, generar, descartarError };
}

/** Sondea hasta que el trabajo deja de estar en curso, o hasta rendirse. */
async function esperar(id: string, vivo: { current: boolean }): Promise<TrabajoDocumento> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;

  for (;;) {
    const trabajo = await api.estadoDocumento(id);
    if (trabajo.estado === 'Listo' || trabajo.estado === 'Fallido') return trabajo;

    if (Date.now() > limite) {
      throw new Error(
        'El documento está tardando más de lo normal. Sigue en la lista del plan: ' +
          'vuelve a intentar la descarga en unos minutos.',
      );
    }

    await new Promise((r) => setTimeout(r, INTERVALO_MS));
    if (!vivo.current) return trabajo;
  }
}
