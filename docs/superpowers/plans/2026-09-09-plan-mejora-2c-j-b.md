# Ciclo 2c-J-B — Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los tres aspectos del Plan de Mejora (RF-PJ-020 a RF-PJ-031):
Criterios de Acreditación (§5.4), Objetivos Educacionales (§5.5) y
Competencias (§5.6). De rebote resuelve las dos deudas que 2c-J-A dejó
documentadas: el fail-closed de `carreraId: null` en
`gestionar-planes-mejora.use-case.ts`, y el `impactoDeInactivar` de RF132
hardcodeado en `0`.

**Architecture:** Ver `docs/superpowers/specs/2026-09-09-plan-mejora-2c-j-b-design.md`
completo — no se repite aquí. Los nueve hallazgos (§2 a-i) son la base de
cada tarea. El punto que exige más cuidado es f): `ImpactoPlanMejoraPort` es
la primera dependencia circular de primer nivel del proyecto
(`plan-estudios → mejora-continua`, en dirección opuesta a la ya existente
`mejora-continua → plan-estudios`), aceptada por el usuario y blindada con
dos guardias de aislamiento simétricas.

**Tech Stack:** NestJS 11, Prisma 7 (multiSchema), PostgreSQL 16, Vitest.
Docker (`sgc_postgres`, `sgc_redis`) está arriba en este ciclo — a diferencia
de 2c-J-A, la migración se aplica y el cliente Prisma se regenera de verdad.

**Spec:** `docs/superpowers/specs/2026-09-09-plan-mejora-2c-j-b-design.md`

**Requisitos:** líneas 3500-3819 (§5.4-5.6), más RF-PJ-002/003 (~3023-3076).

## Global Constraints

- **Aislamiento (CLAUDE.md §3.2):** dos guardias nuevas/ampliadas, ambas
  obligatorias — `mejora-continua/aislamiento.spec.ts` (lista de puertos
  permitidos, ya no un string único) y la nueva
  `plan-estudios/aislamiento.spec.ts` (solo permite
  `ports/impacto-plan-mejora.port.js` de `mejora-continua/`).
- **`domain/` no importa NestJS, Prisma ni Express.**
- **Auditoría no opcional** en cada caso de uso que muta.
- **Cobertura ≥80%** en `domain/` y `application/`.
- **Sin `@Injectable()` en casos de uso** — registro por `useFactory`.
- **Prisma:** `npx prisma migrate dev` (Docker arriba) + `npx prisma generate`
  tras tocar el esquema — a diferencia de 2c-J-A, esto sí corre en este
  ciclo.

### Gaps que el diseño no explicita, resueltos aquí (documentados como desvío en el resumen final, no como rediseño de los 9 hallazgos)

1. **Campo `input`** (RF-PJ-021/024): el requisito pide un campo de texto
   libre distinto de `causaRaiz`, confirmado por RF-PJ-042 que los lista por
   separado ("nombre, causa raíz, justificación, **input**, plazo...").
   `PlanMejora` gana `input String? @db.Text`, parte de
   `DefinicionAccionMejora`, con la misma guarda que el resto de la
   definición (solo Borrador). Para Competencia queda sin usar — su "input"
   es el cálculo de §2e, nunca almacenado (decisión 5 del diseño).
2. **Exposición de `porcentajeDelPeriodoAnterior`:** el diseño lo declara
   "método privado". Se mantiene privado el cálculo (`calcularPorcentajePeriodoAnterior`)
   y se añade un método público delgado
   (`porcentajeAnteriorDeCompetencia`) más un endpoint de solo lectura, para
   que RF-PJ-027/028 sea servible antes de crear el plan (el flujo pide
   mostrar el porcentaje **antes** de registrar la acción). Sin pantalla,
   igual que el resto de 2c-J-A/B.
3. **Alertas RF-PJ-022/025** se exponen como dos métodos públicos de
   solo lectura (`alertasMinimoCriterio`, `alertasMinimoObjetivo`) + dos
   endpoints GET.
4. **`impactoDeInactivar` real:** el puerto `ImpactoPlanMejoraPort` se
   inyecta en `CriterioRepositoryPrisma` (infraestructura), no en
   `GestionarCriterios` (aplicación) — mismo patrón ya usado por
   `DatosDocumentoMedicionRepositoryPrisma`, que inyecta puertos cross-
   módulo vía `@Inject(SYMBOL)` en un repositorio. `GestionarCriterios` no
   cambia; su spec gana un caso con impacto no-cero para confirmar el
   paso completo del valor.

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `plan-estudios/application/ports/acreditacion-cross-modulo.port.ts` | `AcreditacionPort` | 1 |
| `plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.ts` | Su adaptador | 1 |
| `plan-estudios/infrastructure/persistence/criterio.repository.ts` | `impactoDeInactivar` real | 1 |
| `plan-estudios/aislamiento.spec.ts` | Guardia nueva | 1 |
| `mejora/application/ports/impacto-plan-mejora.port.ts` | `ImpactoPlanMejoraPort` | 1 |
| `mejora/infrastructure/persistence/plan-mejora.repository.ts` | `contarVinculados`, `parametros` | 1, 2 |
| `mejora-continua/aislamiento.spec.ts` | `PUERTO_PERMITIDO` a lista | 1 |
| `schema.prisma` + migración | `carreraId`, `planEvaluacionId`, `input`, `planMedicionAfectadoId`, `ParametroPlanMejora` | 2 |
| `mejora/application/ports/plan-mejora.port.ts` | Campos nuevos, `parametros()` | 2, 3 |
| `mejora/application/use-cases/gestionar-planes-mejora.use-case.ts` | Todo §5 del diseño + gaps | 3 |
| `mejora/infrastructure/http/dto/plan-mejora.dto.ts` + controller | Campos/endpoints nuevos | 4 |
| `test/integration/plan-mejora.int.spec.ts`, `criterio.int.spec.ts` | Integración | 5 |

---

## Task 1: Los puertos cross-módulo y las guardias de aislamiento

- [x] **Step 1:** Pruebas de `acreditacion-cross-modulo.spec.ts` (adaptador,
  dobles de `RepositorioCriterioPort`/`RepositorioObjetivoPort`):
  `criteriosActivosDe` filtra por `activo: true`; `criterioPorId` traduce
  `null`; `objetivosEducacionales`/`objetivoPorId` sin filtro de estado
  (RN1 de RF-PJ-023 no lo pide).
- [x] **Step 2:** Implementar `AcreditacionPort` + `AcreditacionAdapter`.
- [x] **Step 3:** `ImpactoPlanMejoraPort` (puerto puro). `PlanMejoraRepositoryPrisma`
  gana `contarVinculados` (implementa ambos puertos).
- [x] **Step 4:** `CriterioRepositoryPrisma` inyecta
  `@Inject(IMPACTO_PLAN_MEJORA)` y usa la llamada real en `impactoDeInactivar`.
- [x] **Step 5:** Las dos guardias de aislamiento — `PUERTO_PERMITIDO` a
  lista en `mejora-continua/aislamiento.spec.ts`; nueva
  `plan-estudios/aislamiento.spec.ts` en dirección opuesta.
- [x] **Step 6:** `criterio.int.spec.ts` — nuevo caso: con un `PlanMejora`
  real vinculado, `impactoDeInactivar` ya no es `{ planesMejoraVinculados: 0 }`.
- [x] **Step 7:** Suite unitaria + ambas guardias en verde. Commit.

## Task 2: El esquema

- [x] **Step 1:** `schema.prisma` — `PlanMejora` gana `carreraId String @db.Uuid`
  (no nullable), `planEvaluacionId String? @db.Uuid`, `input String? @db.Text`,
  `planMedicionAfectadoId String? @db.Uuid` (RF-PJ-031). Nuevo modelo
  `ParametroPlanMejora` (singleton, `id Int @id @default(1)`,
  `minimoAccionesCriterio Int @default(1)`, `minimoAccionesObjetivo Int @default(1)`).
- [x] **Step 2:** `npx prisma migrate dev --name plan_mejora_aspectos` (Docker
  arriba) — genera y aplica; incluye el `INSERT` del singleton por defecto.
- [x] **Step 3:** `npx prisma generate`.
- [x] **Step 4:** Commit.

## Task 3: El caso de uso

- [x] **Step 1:** Pruebas — ampliar `gestionar-planes-mejora.spec.ts`:
  resolución real de `carreraId` (ya no `null`); rechazo de criterio/objetivo/
  competencia de otra carrera; validación de tipo Directa y estado Aprobado/
  Vigente del plan de evaluación base; `porcentajeAnteriorDeCompetencia`
  (primer periodo → `null`; periodo sin medición → `null`; caso normal);
  `alertasMinimoCriterio`/`alertasMinimoObjetivo`; ámbito de código de
  Competencia por periodo (ya cubierto por 2c-J-A, no se repite).
- [x] **Step 2-3:** Implementar. Constructor gana `AcreditacionPort`,
  `RepositorioPlanEvaluacionPort`, `RepositorioPlanMedicionPort`,
  `RepositorioConfiguracionEvaluacionPort`, `ContenidoCurricularPort`.
- [x] **Step 4:** Cobertura ≥80%. Commit.

## Task 4: DTO, controlador y `app.module.ts`

- [x] **Step 1:** `CrearPlanMejoraDto` gana `planEvaluacionId?`;
  `DefinicionPlanMejoraDto` gana `input?`. Nuevo DTO para RF-PJ-031.
- [x] **Step 2:** Endpoints nuevos: `GET /planes-mejora/competencia/porcentaje-anterior`,
  `GET /planes-mejora/criterios/alertas-minimo`,
  `GET /planes-mejora/objetivos/alertas-minimo`,
  `PATCH /planes-mejora/:id/impacto-medicion`.
- [x] **Step 3:** `app.module.ts`: `ACREDITACION_PORT` → `AcreditacionAdapter`;
  `IMPACTO_PLAN_MEJORA` → `useExisting: REPOSITORIO_PLAN_MEJORA`;
  `GestionarPlanesMejora` gana las cuatro dependencias nuevas en su `inject`.
- [x] **Step 4:** `npx tsc --noEmit`. Commit.

## Task 5: Integración y cierre

- [x] **Step 1:** `plan-mejora.int.spec.ts` — creación real por aspecto
  contra Postgres (con carrera/criterio/objetivo/plan de evaluación
  sembrados), y un caso de competencia que verifique el join manual de
  periodos/mediciones para `porcentajeAnteriorDeCompetencia`.
- [x] **Step 2:** `npm run test:integration` completo.
- [x] **Step 3:** `npm test` completo (unitarias).
- [x] **Step 4:** Cierre: resumen ejecutivo, archivos tocados, resultado de
  tests, desvíos y por qué, Key Learnings.
