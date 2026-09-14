# RF-PJ-042 — Validación integral de consistencia del plan de mejora

## Verificado contra el código real antes de escribir nada

- **`TRANSICIONES` (`.../domain/value-objects/estado-plan.ts`)**: confirmado
  que `enviar-a-revision` y `aprobar` son las dos únicas acciones con
  `exigeSinBloqueos: true`; `observar`, `marcar-vigente` y `archivar` tienen
  `exigeSinBloqueos: false`. Coincide exactamente con RN1 del brief.
- **`DatosPlanMejora` (`.../mejora/application/ports/plan-mejora.port.ts`)**:
  campos reales confirmados — `nombre`, `causaRaiz`, `justificacion`,
  `input: string | null`, `plazo: Date`, `recursos`, `metas`, `responsable`,
  `estadoImplementacion: EstadoImplementacion` ('Pendiente'|'En
  proceso'|'Completado'), `logroMeta: string | null`, `impacto: string | null`,
  `aspecto: AspectoPlanMejora`.
- **RF-PJ-028 (input condicional)**: confirmado en dos lugares —
  `armar-documento-mejora.ts` ("RF-PJ-028: Competencia no tiene input propio")
  y `DefinicionPlanMejoraDto` ("Para Competencia no se envía: su input
  (RF-PJ-028) se calcula, no se captura"). El motor exige `input` solo para
  `CRITERIO_ACREDITACION` y `OBJETIVO_EDUCACIONAL`.
- **`estadoImplementacion` NOT NULL**: confirmado en `schema.prisma`
  (`estadoImplementacion EstadoImplementacionMejora @default(PENDIENTE)`) —
  enum sin valor nulo posible. El motor documenta por qué no hay un hallazgo
  para "estado de implementación vacío" (estructuralmente inalcanzable), en
  vez de omitirlo sin explicación.
- **Hallazgo no previsto en el brief — el centinela de `plazo`**: `plazo` es
  `DateTime` NOT NULL sin default útil a nivel de dominio; el plan nace con
  `plazo: new Date(0)` (`plan-mejora.repository.ts`, método `crear()`,
  comentario: "se completan luego con `editarDefinicion`"). Como TypeScript no
  puede expresar "`Date` vacío" como `null`, el motor detecta la ausencia
  comparando contra ese mismo centinela (`plan.plazo.getTime() === 0`). Está
  documentado en el propio código con referencia a dónde nace el centinela.
- **Comentarios ya obsoletos que mi cambio dejaba desactualizados**: dos
  archivos afirmaban explícitamente que RF-PJ-042 "hoy no existe" citando el
  propio placeholder `tieneBloqueos: false` que este trabajo reemplaza —
  `plan-mejora.dto.ts` y `plan-mejora.dto.spec.ts`. Los actualicé para que
  apunten al motor real en vez de seguir afirmando que no existe (ver
  "Archivos modificados"). Encontré además una tercera mención mal etiquetada
  en `versionar-plan-mejora.use-case.ts:48` ("RF-PJ-042 (2c-J-D): las
  escrituras que crean un plan exigen `mejora.crear`" — no tiene relación con
  la validación de completitud, probablemente un número de RF trascrito mal
  en su momento). La dejé sin tocar: es un archivo fuera del alcance de esta
  tarea y no la volví ambigua ni la usé como referencia para nada de lo que
  implementé.

## TDD — evidencia RED/GREEN

### Motor de dominio (`motor-de-consistencia.spec.ts` / `.ts`)

- **RED**: `npx vitest run .../mejora/domain/services/motor-de-consistencia.spec.ts`
  con solo el spec creado → `Error: Cannot find module
  './motor-de-consistencia.js'` (falla por módulo inexistente, no por un
  assert — la razón correcta).
- **GREEN**: tras escribir `motor-de-consistencia.ts` → 14/14 tests en verde.

Cobertura del spec: plan completo sin bloqueos; los siete campos de
definición vacíos se agrupan en un único hallazgo `PJ-DEFINICION-INCOMPLETA`
(no uno por campo); el centinela `new Date(0)` en `plazo` bloquea; `input`
vacío en `COMPETENCIA` NO bloquea pero SÍ en `CRITERIO_ACREDITACION` y
`OBJETIVO_EDUCACIONAL` (con blanco-solo-espacios también bloqueando);
retroalimentación (`logroMeta`/`impacto`) solo se exige cuando
`estadoImplementacion === 'Completado'`, cada campo se nombra por separado si
falta, y ambos completos no bloquea.

### Caso de uso (`gestionar-planes-mejora.spec.ts` / `.use-case.ts`)

- **RED**: tras agregar las 7 pruebas nuevas del describe
  `RF-PJ-042 — la validación integral...` (con la implementación todavía en
  el placeholder `tieneBloqueos: false`) → 2 de las 7 fallan por la razón
  correcta ("promise resolved ... instead of rejecting"): las dos que esperan
  que la transición SE BLOQUEE. Las otras 5 ya "pasaban" porque no ejercitan
  el bloqueo (permitido/observar/competencia/estado-no-completado) — es
  exactamente el comportamiento esperado del placeholder, no un falso
  positivo. Confirmado además que el cambio del `plan()` por defecto (de
  campos vacíos a completos) no rompió ninguna de las 81 pruebas
  preexistentes en esa misma corrida.
- **GREEN**: tras cablear `evaluar`/`mensajeDeInconsistencias` y el
  condicional `transicion.exigeSinBloqueos` en `transicionar` → 83/83 en
  verde.

Cobertura añadida: enviar-a-revisión bloqueado con el reporte consolidado en
el mensaje de la excepción (se verifica el texto real del hallazgo, no un
mensaje genérico); aprobar bloqueado si incompleto; ambas transiciones
permitidas si el plan está completo; `observar` nunca se bloquea por esta
validación (con el plan deliberadamente incompleto, para demostrarlo); un
plan `COMPETENCIA` sin `input` sí puede enviarse a revisión; un plan con
`estadoImplementacion` distinto de `Completado` se puede aprobar sin
retroalimentación.

## Diseño — decisiones y por qué

- **Síncrono, sin puertos**: a diferencia de `RF-PM-038`/`RF-PE-041`
  (`async`, leen filas hijas de otro repositorio), RF-PJ-042 solo valida
  columnas que ya trae el propio `DatosPlanMejora` cargado por
  `exigirPlan(id)`. `PlanMejoraParaValidar` se declaró en el propio archivo
  de dominio (no importado de `application/ports`, para no romper la regla
  de dependencia dominio→aplicación) pero es estructuralmente compatible con
  `DatosPlanMejora`, así que `evaluar()` lo pasa directo sin conversión.
- **`afectados` nombra campos, no el código del plan**: al validarse un
  único plan (no una lista de filas hijas como en los motores hermanos), lo
  útil para quien lee el hallazgo es saber *qué campo* falta, no el código
  del plan que ya conoce por contexto.
- **Un hallazgo por regla, no por campo**: `PJ-DEFINICION-INCOMPLETA` agrupa
  los ocho campos posibles (incluido `input` condicional); `PJ-RETROALIMENTACION-INCOMPLETA`
  agrupa `logroMeta`/`impacto`. Mismo criterio que los motores hermanos.

## Archivos modificados/creados

- **Creado**: `apps/api/src/modules/mejora-continua/mejora/domain/services/motor-de-consistencia.ts`
- **Creado**: `apps/api/src/modules/mejora-continua/mejora/domain/services/motor-de-consistencia.spec.ts`
- **Modificado**: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts`
  — import del motor; `private evaluar()`/`private mensajeDeInconsistencias()`;
  `transicionar` ahora evalúa condicionalmente y lanza el reporte consolidado;
  comentarios de trazabilidad agregados (sin cambio de comportamiento) para
  RF-PJ-039/040/041 (JSDoc de `transicionar`), RF-PJ-043 (los tres `exigir` de
  `crear`/`editarDefinicion`/`eliminar`), RF-PJ-044 (el `exigir` dentro de
  `transicionar`), RF-PJ-045 y RF-PJ-046 (JSDoc de clase).
- **Modificado**: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts`
  — el `plan()` por defecto pasó de campos de definición vacíos a completos
  (documentado en el propio helper, con nota de por qué); se quitó el test
  placeholder "RF-PJ-042 no existe todavía"; se agregó el describe
  `RF-PJ-042 — la validación integral...` con los 7 casos nuevos.
- **Modificado** (documentación, sin lógica): `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/dto/plan-mejora.dto.ts`
  y su `.spec.ts` — el comentario que afirmaba "RF-PJ-042 ... hoy no existe"
  ahora apunta al motor real, para no dejar una afirmación falsa en el
  código tras este cambio.

## Autorevisión

- Verificado que el `plan()` por defecto del spec del caso de uso, al pasar
  de vacío a completo, no alteró ninguna aserción existente (ninguna prueba
  comprobaba `nombre === ''` ni similar) — confirmado por grep antes de
  tocarlo y por la corrida RED (81/83 seguían en verde con el placeholder
  todavía activo).
- Verificado que `observar` sigue exigiendo comentario (`exigeComentario:
  true` en `estado-plan.ts`) — el test de `observar` en el describe nuevo
  pasa `comentario` explícito.
- Revisé que no quedara ningún comentario apuntando al placeholder eliminado
  fuera de los dos archivos DTO corregidos (grep de "RF-PJ-042" en todo
  `apps/api/src` y `apps/web/src`).
- `PlanMejoraParaValidar.aspecto`/`estadoImplementacion` son exactamente los
  mismos union types que `AspectoPlanMejora`/`EstadoImplementacion` — sin
  necesidad de un adaptador entre el `DatosPlanMejora` real y el tipo de
  dominio, confirmado por el `tsc --noEmit` en verde sin cast alguno en
  `evaluar()`.

## Resultados de verificación

```
npm run typecheck   → sin errores
npm run lint         → sin errores
npm run format:check → 20 archivos con drift preexistente (ninguno de los
                        que toqué; el único mío que apareció en una corrida
                        intermedia, motor-de-consistencia.spec.ts, se
                        corrigió con prettier --write antes de la corrida
                        final y ya no aparece)
npm test              → 57 test files, 1056 tests, todos en verde
```
