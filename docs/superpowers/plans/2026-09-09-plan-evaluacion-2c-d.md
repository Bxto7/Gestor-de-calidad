# Ciclo 2c-D (parcial) — Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enganchar RF-PE-041 (la validación integral de consistencia) en el
punto de transición del plan de evaluación, reemplazando el
`tieneBloqueos: false` hardcodeado de `GestionarPlanesEvaluacion.
transicionar`.

**Architecture:** Un motor de dominio nuevo, gemelo de
`medicion/domain/services/motor-de-consistencia.ts` pero con reglas propias
(§2 del design doc), más un método privado `evaluar` en
`GestionarPlanesEvaluacion` que resuelve nombres desde `ContenidoCurricularPort`
y lee configuración desde `RepositorioConfiguracionEvaluacionPort` — puerto
que el caso de uso no tenía inyectado y gana como sexto argumento.

**Tech Stack:** NestJS 11, TypeScript estricto, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-plan-evaluacion-2c-d-design.md`

## Global Constraints

- **`domain/` no importa NestJS, Prisma ni Express.** El motor nuevo es un
  fichero puro, igual que su gemelo de medición.
- **No se toca el esquema, ni ningún endpoint HTTP, ni ninguna pantalla.**
  Solo dominio + el caso de uso + su cableado en `app.module.ts` + pruebas.
- **No se toca `mejora-continua/domain/value-objects/estado-plan.ts`.** Es
  compartida con medición; `intentarTransicion` sigue decidiendo *si* la
  transición procede, el caso de uso decide *qué mensaje* se lanza.
- **No se implementan RF-PE-038, 039, 040 ni 042.** Los tres primeros ya
  existen (máquina de estados compartida desde 2c-A); el cuarto queda fuera
  a propósito (design doc §1).
- **Cobertura ≥80%** en `domain/` y `application/` del submódulo `evaluacion`.
- **Strict TDD:** cada paso escribe la prueba, la ve fallar, y solo entonces
  implementa.
- **Cifra de partida:** confirmar con `cd apps/api && npx vitest run --reporter=basic 2>&1 | tail -5`
  antes de empezar, y reportar la que se **observe**, no una predicha.

### Comandos

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion
cd apps/api && npx vitest run   # la suite completa, antes de terminar
```

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `evaluacion/domain/services/motor-de-consistencia.ts` | Las cinco reglas de RF-PE-041 | 1 |
| `evaluacion/domain/services/motor-de-consistencia.spec.ts` | Sus pruebas | 1 |
| `evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts` | `evaluar`, `mensajeDeInconsistencias`, el enganche en `transicionar`, el constructor | 2 |
| `evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts` | Sus pruebas nuevas + el `montar()` actualizado | 2 |
| `app.module.ts` | El `useFactory` de `GestionarPlanesEvaluacion` gana `configuraciones` | 3 |

---

## Task 1: El motor de validaciones

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/domain/services/motor-de-consistencia.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/domain/services/motor-de-consistencia.spec.ts`

**Interfaces:**
- Produces, para la Task 2:

```ts
export type Severidad = 'bloqueante' | 'advertencia';

export interface Hallazgo {
  readonly codigo: string;
  readonly rf: string;
  readonly severidad: Severidad;
  readonly titulo: string;
  readonly detalle: string;
  readonly afectados: readonly string[];
}

export interface ResultadoConsistencia {
  readonly hallazgos: readonly Hallazgo[];
  readonly bloqueantes: readonly Hallazgo[];
  readonly advertencias: readonly Hallazgo[];
  readonly tieneBloqueos: boolean;
}

export interface CompetenciaConfiguradaParaValidar {
  readonly competenciaId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
  readonly responsableId: string | null;
}

export interface AsignaturaEvaluadaParaValidar {
  readonly id: string;
  readonly competenciaCodigo: string;
  readonly periodoEtiqueta: string;
  readonly asignaturaCodigo: string;
  readonly asignaturaNombre: string;
  readonly entregable: string;
  readonly docenteId: string | null;
}

export interface EntradaConsistenciaEvaluacion {
  readonly tipo: 'DIRECTA' | 'INDIRECTA';
  readonly competencias: readonly CompetenciaConfiguradaParaValidar[];
  readonly asignaturas: readonly AsignaturaEvaluadaParaValidar[];
}

export function validarConsistenciaEvaluacion(
  entrada: EntradaConsistenciaEvaluacion,
): ResultadoConsistencia;
```

- [ ] **Step 1: Las pruebas, una por regla**

En `motor-de-consistencia.spec.ts`, con un `entrada()` ayudante que arme el
caso "todo completo" por defecto (una competencia con instrumento, frecuencia
y responsable; una asignatura con entregable y docente), igual que hace el
spec de medición:

```ts
describe('RF-PE-013/022 — instrumento por competencia', () => {
  it('una competencia configurada sin instrumento bloquea y la nombra', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ competencias: [competencia({ instrumento: null })] }),
    );
    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-INSTRUMENTO');
    expect(h).toBeDefined();
    expect(h?.afectados).toEqual(['CPE-01 · Diseña soluciones']);
  });

  it('cita RF-PE-013 en un plan Directa y RF-PE-022 en un plan Indirecta', () => {
    const directa = validarConsistenciaEvaluacion(
      entrada({ tipo: 'DIRECTA', competencias: [competencia({ instrumento: null })] }),
    );
    const indirecta = validarConsistenciaEvaluacion(
      entrada({ tipo: 'INDIRECTA', competencias: [competencia({ instrumento: null })] }),
    );
    expect(directa.bloqueantes[0]?.rf).toBe('RF-PE-013');
    expect(indirecta.bloqueantes[0]?.rf).toBe('RF-PE-022');
  });

  it('un instrumento en blanco (solo espacios) también bloquea', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ competencias: [competencia({ instrumento: '   ' })] }),
    );
    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PE-SIN-INSTRUMENTO');
  });
});

describe('RF-PE-014/023 — frecuencia por competencia', () => {
  it('sin frecuencia bloquea y cita el RF según el tipo', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ tipo: 'INDIRECTA', competencias: [competencia({ frecuencia: null })] }),
    );
    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-FRECUENCIA');
    expect(h?.rf).toBe('RF-PE-023');
  });
});

describe('RF-PE-024 — responsable, solo en Indirecta', () => {
  it('una Indirecta sin responsable bloquea', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ tipo: 'INDIRECTA', competencias: [competencia({ responsableId: null })] }),
    );
    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PE-SIN-RESPONSABLE');
  });

  it('una Directa sin responsable NO bloquea: el campo no le aplica', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ tipo: 'DIRECTA', competencias: [competencia({ responsableId: null })] }),
    );
    expect(r.bloqueantes.map((h) => h.codigo)).not.toContain('PE-SIN-RESPONSABLE');
  });
});

describe('RF-PE-017 — entregable por asignatura asociada', () => {
  it('una asignatura sin entregable bloquea y la nombra con su cruce', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ asignaturas: [asignatura({ entregable: '' })] }),
    );
    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-ENTREGABLE');
    expect(h?.afectados).toEqual(['AS-101 · CPE-01 · 2026-I']);
  });
});

describe('RF-PE-018 — docente por asignatura asociada', () => {
  it('una asignatura sin docente bloquea', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ asignaturas: [asignatura({ docenteId: null })] }),
    );
    expect(r.bloqueantes.map((h) => h.codigo)).toContain('PE-SIN-DOCENTE');
  });

  it('la misma asignatura en dos periodos distintos, cada cruce se nombra aparte', () => {
    // RF-PE-018: el docente puede variar de un periodo a otro para la misma
    // asignatura. Si el afectado no llevara el periodo, dos filas incompletas
    // de la misma asignatura colapsarían en un solo texto y se perdería cuál
    // de las dos falta.
    const r = validarConsistenciaEvaluacion(
      entrada({
        asignaturas: [
          asignatura({ docenteId: null, periodoEtiqueta: '2026-I' }),
          asignatura({ docenteId: null, periodoEtiqueta: '2026-II' }),
        ],
      }),
    );
    const h = r.bloqueantes.find((x) => x.codigo === 'PE-SIN-DOCENTE');
    expect(h?.afectados).toEqual(['AS-101 · CPE-01 · 2026-I', 'AS-101 · CPE-01 · 2026-II']);
  });
});

describe('RN2 — solo se valida lo ya registrado', () => {
  it('sin ninguna competencia ni asignatura configurada, no hay ningún hallazgo', () => {
    // No es "todo incompleto": es que el registro progresivo permite no haber
    // empezado. RF-PE-041 RN2 lo dice explícitamente.
    const r = validarConsistenciaEvaluacion(entrada({ competencias: [], asignaturas: [] }));
    expect(r.tieneBloqueos).toBe(false);
    expect(r.hallazgos).toEqual([]);
  });
});

describe('resultado consolidado', () => {
  it('un plan completo no tiene bloqueos', () => {
    const r = validarConsistenciaEvaluacion(entrada());
    expect(r.tieneBloqueos).toBe(false);
  });

  it('devuelve todas las reglas rotas de una vez, no solo la primera', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({
        tipo: 'INDIRECTA',
        competencias: [competencia({ instrumento: null, frecuencia: null, responsableId: null })],
      }),
    );
    expect(r.bloqueantes.length).toBe(3);
  });

  it('separa bloqueantes de advertencias y ambos suman los hallazgos', () => {
    const r = validarConsistenciaEvaluacion(
      entrada({ competencias: [competencia({ instrumento: null })] }),
    );
    expect(r.bloqueantes.length + r.advertencias.length).toBe(r.hallazgos.length);
  });
});
```

- [ ] **Step 2: Verlas fallar**

`cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/domain/services/motor-de-consistencia.spec.ts`
Esperado: no compila — el módulo no existe.

- [ ] **Step 3: Implementar**

Sigue §2.3 del design doc para las interfaces. Cinco reglas, en el orden que
las prueba enumera arriba. Ninguna lanza: todas empujan a `hallazgos` y al
final se separan por severidad (todas `'bloqueante'`; no hay advertencias en
este requisito, pero el campo se mantiene por la forma compartida con
medición). El filtro de "en blanco" usa `?.trim()`, como el resto del
proyecto (`@Recortado()` en el DTO ya impide que llegue así desde HTTP, pero
el motor no debe confiar en eso: se puede llamar desde una prueba o un
`seed` sin pasar por el DTO).

- [ ] **Step 4: Verlas pasar**

Mismo comando. Esperado: PASS.

- [ ] **Step 5: Comprobar por mutación**

Cambia la condición de `PE-SIN-RESPONSABLE` para que no compruebe el tipo
(que se dispare siempre) y confirma que cae **solo** "una Directa sin
responsable NO bloquea". Restaura. Cambia el filtro de `PE-SIN-ENTREGABLE`
de `.trim()` a una comprobación de `null`/`undefined` y confirma que cae "un
instrumento en blanco también bloquea" (adaptado a entregable) o, si no
existe esa prueba para entregable, añádela antes de mutar.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "El motor de consistencia del plan de evaluacion (RF-PE-041)"
```

---

## Task 2: El enganche en el caso de uso

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts`

**Interfaces:**
- Consumes: `validarConsistenciaEvaluacion` de la Task 1;
  `RepositorioConfiguracionEvaluacionPort.del`, ya existente;
  `ContenidoCurricularPort.competenciasDelPlan` y `.asignaturasDelPlan`, ya
  existentes.
- El constructor cambia de `(evaluaciones, mediciones, curricular,
  autorizacion, eventos)` a `(evaluaciones, mediciones, curricular,
  configuraciones, autorizacion, eventos)`.

- [ ] **Step 1: Actualizar `montar()` en el spec, antes de tocar nada más**

Añade un doble mínimo de `RepositorioConfiguracionEvaluacionPort` (todo
vacío por defecto: `del: async () => ({ competencias: [], mediciones: [],
indicaciones: [] })`, y el resto de métodos como `async () => { throw new
Error('no usado en este spec'); }` o equivalentes, siguiendo el estilo de
los demás dobles del fichero) y pásalo al constructor en `montar()`. Ejecuta
la suite existente: debe seguir en verde (cambia solo el cableado, ninguna
prueba existente depende del comportamiento nuevo todavía).

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.spec.ts
```

- [ ] **Step 2: Las pruebas del enganche**

```ts
describe('RF-PE-041 — la validación integral antes de transicionar', () => {
  it('enviar a revisión con una competencia configurada e incompleta se rechaza y la nombra', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'Borrador' }),
      configuraciones: {
        del: async () => ({
          competencias: [
            { competenciaId: 'c-1', instrumento: null, frecuencia: 'Semestral', responsableId: null },
          ],
          mediciones: [],
          indicaciones: [],
        }),
      },
    });

    await expect(
      caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {}),
    ).rejects.toThrow(/instrumento/i);
  });

  it('aprobar con una asignatura sin docente se rechaza', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'En revisión' }),
      configuraciones: {
        del: async () => ({
          competencias: [],
          mediciones: [
            {
              competenciaId: 'c-1', periodoId: 'p-1', porcentajeAlcanzado: null,
              asignaturas: [
                { id: 'ae-1', asignaturaId: 'a-1', entregable: 'Informe', docenteId: null, evidencias: [] },
              ],
            },
          ],
          indicaciones: [],
        }),
      },
    });

    await expect(caso.transicionar(ACTOR, 'ev-1', 'aprobar', {})).rejects.toThrow(
      ReglaDeNegocioViolada,
    );
  });

  it('el mensaje no expone UUID, expone el código', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'Borrador' }),
      configuraciones: {
        del: async () => ({
          competencias: [
            { competenciaId: 'c-1', instrumento: null, frecuencia: null, responsableId: null },
          ],
          mediciones: [], indicaciones: [],
        }),
      },
    });

    await expect(caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {})).rejects.toThrow(
      /CPE-01/,
    );
  });

  it('sin nada configurado, la transición procede igual (RN2)', async () => {
    const { caso } = montar({ evaluacion: evaluacion({ estado: 'Borrador' }) });
    // El doble por defecto ya devuelve las tres listas vacías (Step 1).

    const resultado = await caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {});

    expect(resultado.estado).toBe('En revisión');
  });

  it('con todo completo, la transición procede', async () => {
    const { caso } = montar({
      evaluacion: evaluacion({ estado: 'Borrador' }),
      configuraciones: {
        del: async () => ({
          competencias: [
            { competenciaId: 'c-1', instrumento: 'Rúbrica', frecuencia: 'Semestral', responsableId: null },
          ],
          mediciones: [], indicaciones: [],
        }),
      },
    });

    const resultado = await caso.transicionar(ACTOR, 'ev-1', 'enviar-a-revision', {});
    expect(resultado.estado).toBe('En revisión');
  });

  it.each(['observar', 'marcar-vigente'] as const)(
    '%s no dispara el motor: no lo necesita (exigeSinBloqueos es false)',
    async (accion) => {
      const del = vi.fn(async () => ({ competencias: [], mediciones: [], indicaciones: [] }));
      const estadoDesde = accion === 'observar' ? 'En revisión' : 'Aprobado';
      const { caso } = montar({
        evaluacion: evaluacion({ estado: estadoDesde }),
        configuraciones: { del },
      });

      await caso.transicionar(ACTOR, 'ev-1', accion, { comentario: 'motivo' });

      expect(del).not.toHaveBeenCalled();
    },
  );
});
```

Ajusta `montar()` para aceptar `configuraciones?: Partial<RepositorioConfiguracionEvaluacionPort>`
y fusionarlo con el doble por defecto del Step 1, igual que hace `contenido`
con `opciones.contenido`.

- [ ] **Step 3: Verlas fallar**

Esperado: las que esperan rechazo pasan de milagro (el `false` hardcodeado
las deja pasar), así que en realidad **fallan las que esperan éxito** — no,
al revés: hoy TODO transiciona porque `tieneBloqueos` es siempre `false`. Las
pruebas de rechazo (las tres primeras) deben fallar; las de "procede" ya
pasan. Confirma que fallan exactamente esas tres antes de tocar la
implementación — si falla una distinta, algo en el `montar()` está mal.

- [ ] **Step 4: Implementar**

En `gestionar-planes-evaluacion.use-case.ts`:

1. Importa `validarConsistenciaEvaluacion` y sus tipos.
2. Importa `RepositorioConfiguracionEvaluacionPort` desde
   `../ports/configuracion-evaluacion.port.js`.
3. Añade `configuraciones` como cuarto parámetro del constructor (después de
   `curricular`, antes de `autorizacion`).
4. Añade el privado `evaluar(plan, base)` (design doc §3) y
   `mensajeDeInconsistencias(resultado)` (design doc §4).
5. En `transicionar`, sustituye el bloque señalado por el del design doc §4.

- [ ] **Step 5: Verlas pasar**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion
```

- [ ] **Step 6: Tres mutaciones**

| Mutación | Debe caer |
|---|---|
| `transicion.exigeSinBloqueos ? ... : null` invertido a `!transicion.exigeSinBloqueos` | "observar/marcar-vigente no dispara el motor" empieza a fallar en las que sí exigen, y el resto se rompe |
| `mensajeDeInconsistencias` vuelve a `r.motivo` sin condicional | "el mensaje no expone UUID, expone el código" y las que buscan `/instrumento/i` |
| El `if (tipo === 'INDIRECTA')` del responsable se borra en el motor (ya cubierto en Task 1, repetir aquí si el caso de uso tiene su propia copia — no debería) | — (si cae algo aquí, hay lógica duplicada que no debería estar en el caso de uso) |

Cada una debe caer **sola**. Restaura después de cada una.

- [ ] **Step 7: La suite completa del módulo, cifras observadas**

```bash
cd apps/api && npx vitest run src/modules/mejora-continua
```

Informa la cifra que se **observe**, no una predicha.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Engancha RF-PE-041 en la transicion del plan de evaluacion"
```

---

## Task 3: El cableado de NestJS

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `REPOSITORIO_CONFIGURACION_EVALUACION`, ya registrado en el
  módulo (lo usa `ConfigurarPlanEvaluacion`).

- [ ] **Step 1: Añadir la inyección**

En el `useFactory` de `GestionarPlanesEvaluacion` (`app.module.ts`, junto a
línea 468 en la lectura de esta tarea — confirma el número exacto antes de
editar, puede haber corrido), añade `REPOSITORIO_CONFIGURACION_EVALUACION` al
array `inject` en la misma posición que ocupa `configuraciones` en el
constructor (Task 2, Step 4), y el parámetro correspondiente al `useFactory`.

- [ ] **Step 2: Arrancar la API en caliente**

```bash
cd apps/api && npm run build && node dist/main.js   # nunca tsx — CLAUDE.md ya lo advierte
```

Confirma que arranca sin `UnknownDependenciesException`. Es la única señal
de que Nest resuelve el sexto argumento — nada en las pruebas unitarias lo
habría detectado, porque los dobles no pasan por el contenedor de DI.

- [ ] **Step 3: La suite completa del backend**

```bash
cd apps/api && npx vitest run
```

Informa la cifra observada, comparada contra la de partida (Global
Constraints). Solo deben cambiar los números de `mejora-continua/evaluacion`;
el resto del backend no se tocó.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Inyecta la configuracion de evaluacion en GestionarPlanesEvaluacion"
```

---

## Cierre

No hay Task de documentación en este plan: CLAUDE.md no se toca (lo actualiza
quien orquesta este ciclo, con la cifra observada en la Task 3), y no hay
`README.md` ni `CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md` que necesiten un cambio
—no se tocó el documento fuente ni ningún dato de exportación—.
