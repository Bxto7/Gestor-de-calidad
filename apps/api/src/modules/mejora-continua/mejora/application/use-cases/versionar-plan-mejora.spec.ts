/**
 * RF-PJ-035 y RF-PJ-037: nueva versión y linaje del plan de mejora.
 *
 * `plan()` y `evidencia()` son el mismo doble que `gestionar-planes-mejora.spec.ts`.
 * `montar()` es propio de este caso de uso (solo depende de `planes`,
 * `autorizacion` y `eventos` — no de `acreditacion`/`evaluaciones`/`mediciones`
 * como `GestionarPlanesMejora`), y sigue el patrón de captura
 * (`copiados`, `vistoCodigosDe`) de `versionar-planes-medicion.spec.ts`.
 */

import { describe, expect, it } from 'vitest';

import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type {
  DatosEvidencia,
  DatosPlanMejora,
  RepositorioPlanMejoraPort,
} from '../ports/plan-mejora.port.js';
import { VersionarPlanMejora } from './versionar-plan-mejora.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };
const CARRERA = 'carrera-1';

function permitirTodo(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: true }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
  };
}

function denegar(): AuthorizationPort {
  return {
    puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }),
    permisosDe: async () => new Set(),
    carreraACargoDe: async () => CARRERA,
  };
}

function evidencia(sobre: Partial<DatosEvidencia> = {}): DatosEvidencia {
  return {
    id: 'evi-1',
    planMejoraId: 'pj-1',
    referencia: 'https://drive.example/informe.pdf',
    nombreArchivo: 'informe.pdf',
    subidoPor: 'u-1',
    subidoEn: new Date('2026-03-01'),
    ...sobre,
  };
}

function plan(sobre: Partial<DatosPlanMejora> = {}): DatosPlanMejora {
  return {
    id: 'pj-1',
    codigo: 'PJ-CRI-1',
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: CARRERA,
    criterioAcreditacionId: 'cri-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: null,
    estado: 'Vigente',
    estadoImplementacion: 'Pendiente',
    nombre: '',
    causaRaiz: '',
    justificacion: '',
    input: null,
    plazo: new Date('2026-12-31'),
    recursos: '',
    metas: '',
    responsable: '',
    logroMeta: null,
    impacto: null,
    creadoEn: new Date('2026-03-01'),
    evidencias: [],
    version: 1,
    derivadoDeId: null,
    ...sobre,
  };
}

type DatosCopiar = Parameters<RepositorioPlanMejoraPort['copiar']>[0];

function montar(
  opciones: {
    repo?: Partial<RepositorioPlanMejoraPort>;
    autorizacion?: AuthorizationPort;
    /** Códigos que `codigosDe` devuelve, sin dejar de capturar con qué se la llamó. */
    codigosUsados?: readonly string[];
  } = {},
) {
  const vistos: DomainEvent[] = [];
  const copiados: DatosCopiar[] = [];
  const vistoCodigosDe: [string, string][] = [];

  const repo = {
    porId: async () => plan(),
    codigosDe: async (aspecto: string, elementoId: string) => {
      vistoCodigosDe.push([aspecto, elementoId]);
      return opciones.codigosUsados ?? ([] as readonly string[]);
    },
    copiar: async (datos: DatosCopiar) => {
      copiados.push(datos);
      return plan({
        id: 'pj-2',
        codigo: datos.codigo,
        version: datos.version,
        derivadoDeId: datos.derivadoDeId,
        estado: 'Borrador',
      });
    },
    linajeDe: async () => [plan()],
    ...opciones.repo,
  } as unknown as RepositorioPlanMejoraPort;

  const publicador: PublicadorDeEventos = {
    publicar: async (e) => {
      vistos.push(...e);
    },
  };

  const caso = new VersionarPlanMejora(repo, opciones.autorizacion ?? permitirTodo(), publicador);

  return { caso, vistos, copiados, vistoCodigosDe };
}

describe('RF-PJ-035 — nueva versión', () => {
  it('nace en Borrador, vinculada al origen y con el siguiente correlativo del ámbito', async () => {
    const { caso, copiados, vistoCodigosDe } = montar({
      repo: {
        porId: async () =>
          plan({
            id: 'pj-1',
            estado: 'Vigente',
            aspecto: 'CRITERIO_ACREDITACION',
            criterioAcreditacionId: 'crit-1',
            codigo: 'PJ-CRI-3',
          }),
      },
      codigosUsados: ['PJ-CRI-1', 'PJ-CRI-2', 'PJ-CRI-3'],
    });

    await caso.generarNuevaVersion(ACTOR, 'pj-1');

    expect(copiados[0]?.derivadoDeId).toBe('pj-1');
    expect(copiados[0]?.codigo).toBe('PJ-CRI-4');
    expect(copiados[0]?.version).toBe(2);
    // El ámbito de CRITERIO_ACREDITACION es el criterio, no el objetivo: una
    // permutación en `elementoDe()` pasaría el resto de la prueba igual.
    expect(vistoCodigosDe).toEqual([['CRITERIO_ACREDITACION', 'crit-1']]);
  });

  it('para Objetivo educacional, el ámbito del correlativo es el objetivo', async () => {
    const { caso, copiados, vistoCodigosDe } = montar({
      repo: {
        porId: async () =>
          plan({
            id: 'pj-3',
            estado: 'Vigente',
            aspecto: 'OBJETIVO_EDUCACIONAL',
            criterioAcreditacionId: null,
            objetivoEducacionalId: 'obj-1',
            codigo: 'PJ-OBJ-1',
          }),
      },
      codigosUsados: ['PJ-OBJ-1'],
    });

    await caso.generarNuevaVersion(ACTOR, 'pj-3');

    expect(copiados[0]?.codigo).toBe('PJ-OBJ-2');
    // Mismo motivo que el caso de Criterio de acreditación: si `elementoDe()`
    // cayera siempre al primer `if`, esto seguiría devolviendo un código válido
    // pero con el ámbito equivocado.
    expect(vistoCodigosDe).toEqual([['OBJETIVO_EDUCACIONAL', 'obj-1']]);
  });

  it('para Competencia, el ámbito del correlativo es el periodo, no la competencia', async () => {
    const { caso, vistoCodigosDe } = montar({
      repo: {
        porId: async () =>
          plan({
            id: 'pj-2',
            estado: 'Aprobado',
            aspecto: 'COMPETENCIA',
            competenciaId: 'comp-1',
            periodoId: 'periodo-1',
            codigo: 'PJ-COM-1',
          }),
      },
    });

    await caso.generarNuevaVersion(ACTOR, 'pj-2');

    expect(vistoCodigosDe).toEqual([['COMPETENCIA', 'periodo-1']]);
  });

  it('conserva el seguimiento completo de la versión origen', async () => {
    const { caso, copiados } = montar({
      repo: {
        porId: async () =>
          plan({
            id: 'pj-1',
            estado: 'Vigente',
            estadoImplementacion: 'En proceso',
            logroMeta: '70%',
            evidencias: [
              evidencia({
                id: 'ev-1',
                planMejoraId: 'pj-1',
                referencia: 'r1',
                nombreArchivo: null,
                subidoPor: 'u1',
                subidoEn: new Date('2026-01-01'),
              }),
            ],
          }),
      },
    });

    await caso.generarNuevaVersion(ACTOR, 'pj-1');

    expect(copiados[0]?.contenido.estadoImplementacion).toBe('En proceso');
    expect(copiados[0]?.contenido.evidencias).toHaveLength(1);
  });

  it('un Borrador no se versiona: se edita', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Borrador' }) } });

    await expect(caso.generarNuevaVersion(ACTOR, 'pj-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige mejora.crear: la nueva versión es un plan nuevo', async () => {
    const { caso } = montar({
      autorizacion: denegar(),
      repo: { porId: async () => plan({ estado: 'Vigente' }) },
    });

    await expect(caso.generarNuevaVersion(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
  });

  it('deja rastro en la bitácora con su propia acción', async () => {
    const { caso, vistos } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.generarNuevaVersion(ACTOR, 'pj-1');

    expect(vistos.map((e) => e.nombre)).toContain('mejora.version');
  });
});

describe('RF-PJ-037 — el linaje', () => {
  it('exige mejora.leer', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.versionesDe(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-PJ-035 — ramificación: versionar el mismo origen más de una vez', () => {
  it('dos versiones nacidas del mismo plan reciben números de version distintos', async () => {
    // Revisión final de rama completa (post 2c-J-C): `origen.version + 1`
    // calcula "profundidad desde la raíz", no "cuántas veces se versionó este
    // linaje". El esquema y `permiteVersionado` sí permiten ramificar — el
    // origen sigue Vigente/Aprobado/Histórico después de versionarse una vez
    // —, así que dos llamadas seguidas sobre el mismo origen deben producir
    // dos hijos con `version` distinta. Este repo doble es intencionalmente
    // *con estado*, a diferencia de `montar()`, porque el propio origen del
    // bug solo aparece cuando `linajeDe` refleja lo que ya se creó entre una
    // llamada y la siguiente — un doble sin estado (como el `linajeDe: async
    // () => [plan()]` por defecto de `montar()`) no lo habría detectado.
    const origen = plan({ id: 'pj-1', estado: 'Vigente', version: 1, codigo: 'PJ-CRI-1' });
    const creadas: DatosPlanMejora[] = [];

    const repo: Partial<RepositorioPlanMejoraPort> = {
      porId: async () => origen,
      codigosDe: async () => [origen.codigo, ...creadas.map((p) => p.codigo)],
      copiar: async (datos: DatosCopiar) => {
        const nuevo = plan({
          id: `pj-hijo-${creadas.length + 1}`,
          codigo: datos.codigo,
          version: datos.version,
          derivadoDeId: datos.derivadoDeId,
          estado: 'Borrador',
        });
        creadas.push(nuevo);
        return nuevo;
      },
      linajeDe: async () => [origen, ...creadas],
    };

    const { caso } = montar({ repo });

    const hijo1 = await caso.generarNuevaVersion(ACTOR, 'pj-1');
    const hijo2 = await caso.generarNuevaVersion(ACTOR, 'pj-1');

    expect(hijo1.derivadoDeId).toBe('pj-1');
    expect(hijo2.derivadoDeId).toBe('pj-1');
    expect(hijo1.version).not.toBe(hijo2.version);
  });
});
