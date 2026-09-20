/** @vitest-environment jsdom */

/**
 * Las claves de React Query de los listados filtrados.
 *
 * Si la clave no cambia cuando cambia el filtro, `useQuery` no vuelve a
 * consultar: el usuario mueve el selector y la lista se queda igual, sin
 * ningún error visible que lo delate. Estas pruebas no ejercitan el hook (eso
 * exigiría montar React Query completo) — afirman lo mínimo que hace fallar
 * ese síntoma: que dos filtros distintos por cualquier campo que la pantalla
 * envía producen claves distintas. Si alguien vuelve a omitir un campo al
 * construir la clave, la prueba correspondiente se pone roja.
 *
 * `useActas` sí se ejercita contra React Query real (ver el describe al
 * final): ahí lo que importa es que el hook reenvíe el filtro a la función de
 * API, algo que una prueba de clave sola no puede demostrar. El entorno del
 * archivo se declara `jsdom` (arriba) porque `renderHook` monta con
 * ReactDOM y necesita `document`; las pruebas de clave, al ser funciones
 * puras, no se ven afectadas por correr bajo `jsdom` en vez de `node`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as actasApi from './actas.api';
import { claves, clavesEval, clavesMejora, useActas } from './queries';

describe('claves.planes — Planes de Medición', () => {
  it('cambia con el tipo, aunque el resto del filtro sea igual', () => {
    const directa = claves.planes({ tipo: 'DIRECTA' });
    const indirecta = claves.planes({ tipo: 'INDIRECTA' });

    expect(directa).not.toEqual(indirecta);
  });

  it('cambia con el texto, aunque el resto del filtro sea igual', () => {
    const sinTexto = claves.planes({ texto: '' });
    const conTexto = claves.planes({ texto: 'ingeniería' });

    expect(sinTexto).not.toEqual(conTexto);
  });
});

describe('clavesEval.lista — Planes de Evaluación', () => {
  it('cambia con el tipo, aunque el resto del filtro sea igual', () => {
    const directa = clavesEval.lista({ tipo: 'DIRECTA' });
    const indirecta = clavesEval.lista({ tipo: 'INDIRECTA' });

    expect(directa).not.toEqual(indirecta);
  });

  it('cambia con el texto, aunque el resto del filtro sea igual', () => {
    const sinTexto = clavesEval.lista({ texto: '' });
    const conTexto = clavesEval.lista({ texto: 'ingeniería' });

    expect(sinTexto).not.toEqual(conTexto);
  });
});

describe('clavesMejora.lista — Planes de Mejora', () => {
  it('cambia con la carrera', () => {
    const a = clavesMejora.lista({ carreraId: 'carrera-a' });
    const b = clavesMejora.lista({ carreraId: 'carrera-b' });

    expect(a).not.toEqual(b);
  });

  it('clavesMejora.lista distingue por filtro, como clavesEval', () => {
    const sinFiltro = clavesMejora.lista({ carreraId: 'c1' });
    const conTexto = clavesMejora.lista({ carreraId: 'c1', texto: 'renovar' });

    expect(sinFiltro).not.toEqual(conTexto);
  });
});

describe('clavesMejora.plan — jerarquía con versiones y documentos', () => {
  it('es prefijo de versiones y documentos, para que invalidar el plan las alcance también', () => {
    // Regresión: `plan` solía ser `['mejora', 'plan', id]`, una rama hermana
    // de `['mejora', id, 'versiones']`/`['mejora', id, 'documentos']` — no un
    // prefijo. `invalidateQueries({ queryKey: clavesMejora.plan(id) })` nunca
    // llegaba a esas dos, así que editar el plan dejaba las pestañas de
    // Versiones/Documentos con datos viejos. Ver `useMutacionDePlanMejora`.
    const id = 'plan-1';
    const plan = clavesMejora.plan(id);
    const versiones = clavesMejora.versiones(id);
    const documentos = clavesMejora.documentos(id);

    expect(versiones.slice(0, plan.length)).toEqual(plan);
    expect(documentos.slice(0, plan.length)).toEqual(plan);
  });
});

function envoltorio(cliente: QueryClient) {
  return function Envoltorio({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

describe('useActas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pasa el filtro a listarActas', async () => {
    const espia = vi.spyOn(actasApi, 'listarActas').mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useActas({ estado: 'Borrador' }), {
      wrapper: envoltorio(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(espia).toHaveBeenCalledWith({ estado: 'Borrador' });
  });
});
