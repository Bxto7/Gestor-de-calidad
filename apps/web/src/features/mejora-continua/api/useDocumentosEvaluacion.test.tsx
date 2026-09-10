/** @vitest-environment jsdom */

/**
 * El sondeo de `useDocumentosEvaluacion` (Step 2 del brief de Task 7).
 *
 * El predicado de `refetchInterval` es fácil de escribir mal en un sentido que
 * ningún otro test detecta: que **siempre** devuelva 2000 (nunca deja de
 * sondear) es indistinguible, mirando solo el primer sondeo, de la versión
 * correcta. Por eso esta prueba no se conforma con comprobar que el sondeo
 * arranca — avanza el reloj **después** de que el trabajo termina y confirma
 * que no hay una petición de más. Un intervalo que no para es una fuga de
 * peticiones que nadie ve hasta que la pestaña lleva horas abierta.
 *
 * Se prueba contra el hook real y no contra el predicado aislado a propósito:
 * un predicado correcto pero mal conectado (p. ej. leyendo `data` de la
 * consulta equivocada) pasaría un test unitario del predicado y seguiría
 * fugando peticiones en la pantalla real.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TipoDocumentoEvaluacion, TrabajoDocumento } from '../domain/tipos';
import * as evaluacionApi from './evaluacion.api';
import { useDocumentosEvaluacion } from './queries';

type Trabajo = TrabajoDocumento<TipoDocumentoEvaluacion>;

const EN_CURSO: Trabajo = {
  id: 't-2',
  tipo: 'PLAN_EVALUACION_PDF',
  estado: 'Generando',
  nombreArchivo: null,
  bytes: null,
  error: null,
  solicitadoEn: '2026-09-09T10:00:00.000Z',
};
const LISTO: Trabajo = {
  ...EN_CURSO,
  id: 't-1',
  estado: 'Listo',
  nombreArchivo: 'plan.pdf',
  bytes: 4096,
};

function envoltorio(cliente: QueryClient) {
  return function Envoltorio({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

describe('useDocumentosEvaluacion — el sondeo', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('deja de sondear en cuanto ningún trabajo sigue en curso', async () => {
    vi.useFakeTimers();
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const onPeticion = vi.fn();
    // El plan de evaluación empieza con un trabajo «Generando»; se sustituye
    // por uno «Listo» a mitad de la prueba para simular que el worker terminó.
    let respuesta: Trabajo[] = [EN_CURSO];
    vi.spyOn(evaluacionApi, 'documentosDeEvaluacion').mockImplementation(() => {
      onPeticion();
      return Promise.resolve(respuesta);
    });

    renderHook(() => useDocumentosEvaluacion('ev-1'), { wrapper: envoltorio(cliente) });

    // La carga inicial, al montar.
    await vi.advanceTimersByTimeAsync(0);
    expect(onPeticion).toHaveBeenCalledTimes(1);

    // Con el trabajo todavía en curso, el sondeo repite a los 2 s.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onPeticion).toHaveBeenCalledTimes(2);

    // El trabajo terminó: la próxima respuesta ya no tiene nada pendiente.
    respuesta = [LISTO];
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onPeticion).toHaveBeenCalledTimes(3);

    // Sin nada «En cola» ni «Generando», el intervalo no debe volver a
    // dispararse — ni una vez más, aunque pase mucho más tiempo del que
    // tardaría otro ciclo de sondeo.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onPeticion).toHaveBeenCalledTimes(3);
  });
});
