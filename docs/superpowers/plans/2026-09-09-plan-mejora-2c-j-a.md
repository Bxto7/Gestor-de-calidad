# Ciclo 2c-J-A — Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar el núcleo del submódulo Plan de Mejora (RF-PJ-000 a
RF-PJ-019) a Mejora Continua: el agregado `PlanMejora`, su máquina de estados
documental (reutilizada) y su máquina de estados de implementación (nueva),
los datos de definición y seguimiento, y los permisos que lo acotan por
carrera.

**Architecture:** Un agregado único con discriminador `aspecto`, no tres
entidades — los tres aspectos (Criterio, Objetivo, Competencia) comparten
entidad completa y solo divergen en a qué se asocian, y eso lo resuelve
2c-J-B. Dos máquinas de estado independientes con split de campos: el estado
documental (`estado-plan.ts`, reutilizado tal cual de `medicion`/`evaluacion`)
gatea los campos de definición; un VO nuevo (`EstadoImplementacionMejora`,
enum fijo) gatea los campos de seguimiento junto con evidencias y
retroalimentación, con la asimetría de la tabla del diseño §2b: los campos de
seguimiento se bloquean también en `En revisión`/`Aprobado`, no solo se abren
en `Vigente`.

**Tech Stack:** NestJS 11, Prisma 7 (multiSchema), PostgreSQL 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-plan-mejora-2c-j-a-design.md`

**Requisitos:** `docs/requisitos/Módulo_Mejora_Continua - Requerimientos
(Medición, Evaluación, Mejora y Actas).md`, líneas 2965-3819 (§5.1 a §5.3).

## Global Constraints

- **Aislamiento (CLAUDE.md §3.2):** el submódulo `mejora` no importa nada de
  `plan-estudios` en este ciclo — a diferencia de `medicion`/`evaluacion`, no
  toca `ContenidoCurricularPort` porque RF-PJ-002 se implementa sin validar
  que el elemento exista (§1 y §13 del diseño). `aislamiento.spec.ts` sigue
  vigilando la frontera; no hace falta tocarlo porque no se cruza nada nuevo.
- **`domain/` no importa NestJS, Prisma ni Express.**
- **Auditoría no opcional:** todo caso de uso que muta emite un evento de
  dominio y una prueba lo cubre.
- **Cobertura ≥80 %** en `domain/` y `application/`.
- **Sin `entities/`, sin `@Injectable()` en casos de uso** — se registran por
  `useFactory` en `apps/api/src/app.module.ts`, calcado del registro de
  `GestionarPlanesEvaluacion`.
- **`PERMISOS_ACOTADOS_A_CARRERA` es un `Set` cerrado**, no un wildcard por
  prefijo: agregar `mejora.*` al catálogo sin agregarlo a ese `Set` lo
  dejaría sin acotar por carrera — un bug de seguridad, no un detalle.
- **Prisma:** `npx prisma generate` es obligatorio tras tocar el esquema.

### Restricción real de este entorno de ejecución

Este ciclo se ejecuta sin Docker disponible (`docker ps` falla: no hay daemon
corriendo). Eso significa:

- **No se puede correr `prisma migrate dev` contra una base real**, ni
  `prisma generate` con conexión, ni las pruebas de integración
  (Testcontainers exige Docker). La migración SQL de la Task 2 se escribe a
  mano, siguiendo al detalle el patrón de las trece migraciones ya aplicadas
  del mismo módulo, pero **queda sin aplicar y sin verificar contra una base
  real** hasta que alguien la corra en un entorno con Docker.
- Lo que **sí** corre en este entorno: toda la suite unitaria de `apps/api`
  (Vitest sin Testcontainers) — dominio y aplicación con dobles de puerto, que
  es donde vive la cobertura ≥80 % exigida por CLAUDE.md §2.
- Cada tarea de este plan que dependa de la base de datos lo dice
  explícitamente y marca su verificación como pendiente, no como hecha.

### Comandos

```bash
cd apps/api && npm test                       # unitarias — sí corre aquí
cd apps/api && npx prisma generate             # requiere DATABASE_URL alcanzable — NO corre aquí
cd apps/api && npx prisma migrate deploy       # requiere Postgres — NO corre aquí
```

**Cifras de partida:** 843 unitarias de API (43 ficheros), observadas
corriendo `npx vitest run` en `apps/api` antes de empezar. Cada tarea informa
la cifra que **observa**, no la que este plan predice.

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `mejora-continua/mejora/domain/value-objects/estado-implementacion.ts` | VO puro, enum fijo | 1 |
| `mejora-continua/mejora/domain/value-objects/codigo-mejora.ts` | Función pura de correlativo | 1 |
| `mejora-continua/mejora/domain/events/eventos-mejora.ts` | Siete eventos de auditoría | 1 |
| `apps/api/prisma/schema.prisma` + migración a mano | Dos enums, dos modelos | 2 |
| `mejora-continua/mejora/application/ports/plan-mejora.port.ts` | El puerto | 3 |
| `mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts` | Su implementación Prisma | 3 |
| `mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts` (+ `.spec.ts`) | Los ocho métodos | 4 |
| `mejora-continua/mejora/infrastructure/http/dto/plan-mejora.dto.ts` | Los DTO | 5 |
| `mejora-continua/mejora/infrastructure/http/planes-mejora.controller.ts` | Los ocho endpoints | 5 |
| `apps/api/prisma/seed.ts` | Cinco permisos, cinco roles | 6 |
| `auth/domain/services/politica-de-autorizacion.ts` | Cuatro permisos al `Set` acotado | 6 |
| `docs/arquitectura/roles-y-permisos.md` | Fila de Plan de Mejora en las tablas | 6 |
| `shared-kernel/domain-events/domain-event.ts` | `'PlanMejora'` en `ENTIDADES_AUDITABLES` | 6 |
| `apps/api/src/app.module.ts` | Registro por `useFactory` | 7 |

---

## Task 1: El dominio — VOs puros y eventos

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-implementacion.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/estado-implementacion.spec.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/codigo-mejora.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/value-objects/codigo-mejora.spec.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/events/eventos-mejora.ts`

**Interfaces:**
- Consumes: nada — dominio puro.
- Produces, para la Task 4:

```ts
export const ESTADOS_IMPLEMENTACION = ['Pendiente', 'En proceso', 'Completado'] as const;
export type EstadoImplementacion = (typeof ESTADOS_IMPLEMENTACION)[number];
export function permiteActualizarSeguimiento(estado: EstadoMedicion): boolean; // Borrador | Vigente
export function siguienteCodigoMejora(prefijoAmbito: string, yaUsados: readonly string[]): string;
```

- [ ] **Step 1: Las pruebas del VO de estado de implementación**

`estado-implementacion.spec.ts` cubre: el enum tiene exactamente los tres
valores del diseño (RF-PJ-014 RN1, "no es texto libre"); `permiteEditar` (o el
nombre que se elija para el guardián de seguimiento) según la tabla de §2b del
diseño —true en Borrador y Vigente, false en las demás—, con un `it.each` que
recorra los cinco estados documentales para no dejar ninguno sin cubrir, igual
que hace `configurar-plan-evaluacion.spec.ts` con sus estados.

- [ ] **Step 2: Verlas fallar** (el módulo no existe todavía)

- [ ] **Step 3: Implementar**

Archivo puro, mismo estilo de cabecera que `estado-plan.ts`: por qué es un
enum fijo y no una lista configurable (decisión 2 del diseño), y por qué la
asimetría de §2b se codifica aquí y no como un `if` disperso en el caso de
uso.

- [ ] **Step 4: Verlas pasar**

- [ ] **Step 5: Las pruebas del código**

`codigo-mejora.spec.ts`, mismo patrón que `codigo-evaluacion.spec.ts`: primer
código con lista vacía, correlativo siguiente al mayor usado (no a la
cantidad, por si alguno se eliminó), y que ignora códigos de otro ámbito. A
diferencia de `codigo-evaluacion`, el prefijo **no** lo compone la función —el
diseño (§4) dice que el ámbito de unicidad varía por aspecto (por criterio,
por objetivo, o por periodo en competencias) y ese cálculo es cosa del caso de
uso o del repositorio (`codigosDe(aspecto, elementoId)`), no del VO. La firma
recibe el prefijo ya armado, igual de estricta que `siguienteCodigoEvaluacion`
sobre no generalizar con un parámetro que pueda llegar equivocado desde fuera.

- [ ] **Step 6: Verlas fallar, implementar, verlas pasar**

- [ ] **Step 7: Los eventos**

`eventos-mejora.ts`, mismo patrón que `eventos-evaluacion.ts`: una clase base
`abstract class EventoMejora extends DomainEvent { readonly entidad = 'PlanMejora'; }`
y siete eventos concretos (`PlanMejoraCreado`, `PlanMejoraEliminado`,
`PlanMejoraTransicionado`, `ImplementacionActualizada`, `EvidenciaCargada`,
`EvidenciaEliminada`, `RetroalimentacionRegistrada`), cada uno con su
`nombre` (`mejora.creado`, `mejora.eliminado`, `mejora.transicionado`,
`mejora.implementacion_actualizada`, `mejora.evidencia_cargada`,
`mejora.evidencia_eliminada`, `mejora.retroalimentacion_registrada`) y su
`detalle` en texto legible con el código del plan. Sin prueba dedicada: los
eventos de evaluación tampoco la tienen —se cubren indirectamente por las
pruebas del caso de uso que los publica (Task 4).

- [ ] **Step 8: La suite unitaria en verde**

`cd apps/api && npx vitest run src/modules/mejora-continua/mejora`

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "El dominio del Plan de Mejora: estado de implementación, código y eventos"
```

---

## Task 2: El esquema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260909_plan_mejora/migration.sql` (a mano — ver la restricción de entorno)

**Interfaces:**
- Produces: los enums `AspectoPlanMejora` y `EstadoImplementacionMejora`, y los
  modelos `PlanMejora` / `EvidenciaPlanMejora`, para la Task 3.

- [ ] **Step 1: Declarar los enums y los dos modelos**

En `schema.prisma`, junto a los demás enums de `mejora_continua`, tal como
los describe §4 del diseño — con la salvedad de usar el mismo idioma de
comentarios `///` que el resto del fichero (por qué `competenciaId` y
`periodoId` son "provisional" y remite a §13 del diseño; por qué no hay
`@@unique` sobre `codigo`, remite a la nota del propio §4 sobre
`codigosDe(ámbito)`).

`PlanMejora.estado` usa el mismo enum `EstadoMedicion` que `PlanMedicion` y
`PlanEvaluacion` — el diseño lo pide explícitamente ("mismo VO compartido").

`EvidenciaPlanMejora` sigue el patrón de `Evidencia` (evaluación): `onDelete:
Cascade` desde `PlanMejora`, y un índice sobre la clave foránea desde el
principio (a diferencia de `Evidencia`, que se quedó sin él hasta 2c-C — no
repetir esa deuda).

- [ ] **Step 2: La migración, a mano**

Sin Docker no hay `prisma migrate dev --create-only` que genere el SQL: se
escribe el `migration.sql` a mano, con la misma forma que
`20260908145538_indicaciones_y_responsable/migration.sql` (CREATE TYPE para
los enums en el schema `mejora_continua`, CREATE TABLE con `@map`/`@@map`
traducidos a snake_case, índices, foreign keys `ON DELETE CASCADE`).

- [ ] **Step 3: Aplicar y generar el cliente — PENDIENTE, requiere Docker**

```bash
cd apps/api && npx prisma migrate deploy && npx prisma generate
```

**No se ejecuta en este ciclo.** Se deja documentado en el resumen final como
el primer paso que alguien con Docker disponible debe correr antes de que el
repositorio Prisma de la Task 3 compile contra el cliente generado real.

- [ ] **Step 4: Las pruebas de integración — se escriben, no se ejecutan**

`test/integration/plan-mejora.int.spec.ts`, mismo patrón que
`indicaciones.int.spec.ts`: unicidad de código dentro del ámbito (vía la
función pura, no un índice de BD — el diseño es explícito en que no hay
`@@unique` sobre `codigo`), cascada de evidencias al borrar el plan,
`onDelete: Cascade`. Quedan escritas para quien retome el ciclo con Docker
disponible; no se cuentan en las cifras finales de este ciclo.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "El esquema del Plan de Mejora: PlanMejora y sus evidencias"
```

---

## Task 3: El puerto y el repositorio

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts`

**Interfaces:**
- Consumes: el modelo de la Task 2 (el cliente Prisma generado — con la
  limitación de que no se puede regenerar en este entorno; se escribe contra
  la forma que el modelo declarado en `schema.prisma` implica, igual que se
  haría a mano si el cliente no existiera todavía).
- Produces, para la Task 4: `RepositorioPlanMejoraPort` y
  `REPOSITORIO_PLAN_MEJORA`, exactamente como los declara §5 del diseño.

- [ ] **Step 1: El puerto**

Copia literal de la interfaz de §5 del diseño, con los tipos de datos
(`DatosPlanMejora`, `DatosEvidencia`, `NuevoPlanMejora`,
`DefinicionAccionMejora`) definidos arriba, mismo estilo que
`plan-evaluacion.port.ts`: comentario de cabecera explicando qué reemplaza
qué («`editarDefinicion` reemplaza el bloque de definición entero», al
patrón de `guardarCompetencia`).

- [ ] **Step 2: El repositorio Prisma**

`@Injectable()`, `PrismaService` por constructor, `SELECCION` explícita y
traductores `A_BD`/`A_DOMINIO` para `estado` (reutilizando el mismo mapa que
`plan-evaluacion.repository.ts`, no uno nuevo — es el mismo enum
`EstadoMedicion`) y para `aspecto`/`estadoImplementacion`. `agregarEvidencia`
y `eliminarEvidencia` son directos (`create`/`delete`), a diferencia de
`reemplazarEvidencias` en evaluación — el diseño (§5) los declara como altas y
bajas individuales, no como reemplazo de conjunto, porque RF-PJ-016/017 hablan
de cargar y eliminar una evidencia a la vez, no de sustituir el lote.

Sin prueba de integración ejecutable en este entorno (ver Task 2, Step 4): el
repositorio se escribe con el mismo cuidado que si hubiera prueba, pero queda
sin verificar contra Postgres real hasta que alguien lo corra con Docker.

- [ ] **Step 3: Compila**

`cd apps/api && npx tsc --noEmit -p tsconfig.json` — la única verificación
disponible sin base de datos: que los tipos cuadran contra el cliente Prisma
generado que ya existe en el repo (el de antes de este ciclo, que no incluye
`PlanMejora` todavía). **Se espera que esto falle** hasta que alguien
regenere el cliente con Docker — se documenta como bloqueo conocido, no se
fuerza un `as any` para maquillarlo.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "El puerto y el repositorio del Plan de Mejora"
```

---

## Task 4: El caso de uso

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts`

**Interfaces:**
- Consumes: `RepositorioPlanMejoraPort` (Task 3), `AuthorizationPort`,
  `PublicadorDeEventos`.
- Produces, para la Task 5, los ocho métodos de §6 del diseño: `crear`,
  `editarDefinicion`, `eliminar`, `transicionar`, `actualizarImplementacion`,
  `cargarEvidencia`, `eliminarEvidencia`, `actualizarRetroalimentacion`.

- [ ] **Step 1: Las pruebas — la matriz de estados de §2b primero**

Mismo estilo que `gestionar-planes-evaluacion.spec.ts`: dobles de puerto,
`permitirTodo()` / `denegarRegistrando()`, un `montar()`. El núcleo de la
suite es la tabla de §2b del diseño, como matriz de casos (`it.each`):

```ts
it.each([
  ['Borrador', true],
  ['En revisión', false],
  ['Aprobado', false],
  ['Vigente', true],
  ['Histórico', false],
] as const)(
  'actualizarImplementacion en %s: permitido = %s',
  async (estado, permitido) => { /* ... */ },
);
```

Repetida para `cargarEvidencia`/`eliminarEvidencia` (misma tabla) y para
`actualizarRetroalimentacion` (misma tabla). Y una prueba propia para
`eliminarEvidencia` en Histórico con el mensaje específico de RF-PJ-017 (el
diseño §6 pide conservar ese mensaje aunque la regla general ya lo cubra).

Además:
- RF-PJ-002: `crear` no valida que `elementoId` exista — una prueba que lo
  deja explícito, con el mismo tono que el comentario de código (Step 3).
- `editarDefinicion`/`eliminar` solo en Borrador.
- `transicionar` reusa `intentarTransicion` con `tieneBloqueos: false` fijo
  (no hay RF-PJ-042 todavía) — una prueba que lo confirma con un estado que
  tendría bloqueos si el motor existiera.
- Los permisos: `mejora.crear`/`mejora.editar`/`mejora.eliminar` directos;
  `mejora.${transicion.permiso}` para transicionar (reusa `describirTransicion`
  de `estado-plan.ts`, que ya expone `permiso: 'editar' | 'aprobar'`).
- Auditoría: cada uno de los ocho métodos que muta deja constancia — ocho
  pruebas, una por evento, mismo patrón que «cada guardado deja constancia»
  de 2c-C.

- [ ] **Step 2: Verlas fallar**

- [ ] **Step 3: Implementar**

El comentario de RF-PJ-002, calcado en tono del de RF-PE-041 en
`gestionar-planes-evaluacion.use-case.ts`:

```ts
  /**
   * RF-PJ-002: la asociación en sí —aspecto + referencia al elemento— se
   * guarda y se valida que la tripleta sea consistente, pero **no** se
   * comprueba que ese elemento exista en Plan de Estudios. Esa validación
   * necesita un puerto cross-módulo (`AcreditacionPort` o como se llame) que
   * hoy no existe y que 2c-J-B construye junto con las pantallas de
   * selección por aspecto que lo necesitan de verdad. Mismo movimiento que
   * RF-PE-041/2c-D.
   */
```

`actualizarImplementacion`, `cargarEvidencia`, `eliminarEvidencia` y
`actualizarRetroalimentacion` comparten el guardián de seguimiento
(`permiteActualizarSeguimiento` de la Task 1); no cuatro copias del mismo
`if`.

- [ ] **Step 4: Verlas pasar**

- [ ] **Step 5: Mutaciones**

| Mutación | Debe caer |
|---|---|
| El guardián de seguimiento siempre devuelve `true` | toda la matriz de En revisión/Aprobado/Histórico |
| `eliminarEvidencia` no comprueba Histórico por separado | la prueba específica de RF-PJ-017 (aunque la regla general ya lo cubra, la prueba debe fallar si se quita el guardián general Y si se quita el mensaje específico) |
| Quitar la publicación de un evento en cualquiera de los ocho métodos | su prueba de auditoría correspondiente, y solo esa |

- [ ] **Step 6: Cobertura**

`cd apps/api && npx vitest run --coverage src/modules/mejora-continua/mejora` — confirma ≥80 % en `domain/` y `application/` del submódulo `mejora`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "El caso de uso GestionarPlanesMejora"
```

---

## Task 5: Los endpoints

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/dto/plan-mejora.dto.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/planes-mejora.controller.ts`

**Interfaces:**
- Consumes: los ocho métodos de la Task 4.
- Produces: los ocho endpoints de §7 del diseño.

- [ ] **Step 1: Los DTO**

`class-validator`, mismo estilo que `evaluacion.dto.ts`: `@IsIn` sobre el
enum de aspecto y de estado de implementación (nunca texto libre — RF-PJ-014
RN1), `@Recortado()` antes de `@MinLength` en los campos de texto,
`@IsDateString` o similar para el plazo (RF-PJ-012).

- [ ] **Step 2: El controlador**

`planes-mejora.controller.ts`, `@Controller('planes-mejora')`, ocho métodos
que delegan uno a uno en los del caso de uso, mismo estilo Swagger que
`planes-evaluacion.controller.ts` (`@ApiOperation` citando el RF, `@ApiResponse`
para 404/409). `DELETE /planes-mejora/evidencias/:evidenciaId` cuelga aparte
del resto (no lleva `planId` en la ruta), mismo patrón que
`ResultadosController` en evaluación — el caso de uso resuelve el plan desde
la evidencia, no al revés.

- [ ] **Step 3: Comprobar en caliente — PENDIENTE, requiere build + Postgres**

```bash
cd apps/api && npm run build && node dist/main.js   # nunca tsx
```

No se ejecuta en este entorno (sin Docker no hay Postgres al que conectar
`PrismaService`, y el cliente Prisma tampoco está regenerado — ver Task 2 y
3). Documentado como pendiente en el resumen final.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Los endpoints del Plan de Mejora"
```

---

## Task 6: Permisos y auditoría

**Files:**
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts`
- Modify: `docs/arquitectura/roles-y-permisos.md`
- Modify: `apps/api/src/shared-kernel/domain-events/domain-event.ts`

Va como tarea propia, no repartida entre las anteriores, por la misma razón
que en 2c-C: `PERMISOS_ACOTADOS_A_CARRERA` falla cerrado, así que el catálogo,
la política y el documento tienen que quedar consistentes **en el mismo
commit** — dejar el catálogo sin el `Set` acotado, aunque sea un instante,
es el hueco de seguridad que el diseño (§9) señala explícitamente.

- [ ] **Step 1: `seed.ts` — el catálogo y los cinco roles**

Sección "Mejora continua" del array `PERMISOS`, categoría `'mejora-continua'`,
tras el bloque de `evaluacion.*`:

```ts
  ['mejora.leer', 'Consultar planes de mejora', 'mejora-continua'],
  ['mejora.crear', 'Crear un plan de mejora', 'mejora-continua'],
  ['mejora.editar', 'Editar un plan de mejora en Borrador', 'mejora-continua'],
  ['mejora.eliminar', 'Eliminar un plan de mejora en Borrador', 'mejora-continua'],
  ['mejora.aprobar', 'Aprobar, observar y dar vigencia a un plan de mejora', 'mejora-continua'],
```

Asignación por rol (calcada de `evaluacion.*`, mismas líneas del diseño §9):
`DIRECTOR_CARRERA` recibe las cinco; `COORDINADOR_ACADEMICO` las cuatro menos
`mejora.aprobar`; `DOCENTE` y `USUARIO_CONSULTOR` solo `mejora.leer`;
`ADMIN_SISTEMA` solo `mejora.leer`.

- [ ] **Step 2: `politica-de-autorizacion.ts` — el `Set` acotado**

Cuatro líneas nuevas en `PERMISOS_ACOTADOS_A_CARRERA`, junto al bloque de
`evaluacion.*`:

```ts
  'mejora.crear',
  'mejora.editar',
  'mejora.eliminar',
  'mejora.aprobar',
```

`mejora.leer` queda fuera, igual que `medicion.leer`/`evaluacion.leer`.

- [ ] **Step 3: La prueba de que el `Set` acota lo que dice**

En `politica-de-autorizacion.spec.ts`, ampliar el `it.each` existente de
"los permisos de mejora-continua se acotan a la carrera" con los cuatro
nuevos códigos, mismo patrón que Task 1/Step 1 de 2c-C. Y un caso para
`mejora.leer` en el bloque de "no se acota".

- [ ] **Step 4: `docs/arquitectura/roles-y-permisos.md`**

El documento declara ser descripción de `seed.ts` + `politica-de-autorizacion.ts`
(su propia cabecera lo dice): añadir `mejora.*` a la lista de §1, una fila
de "Plan de mejora" en las tablas de rol de §2-§6 (mismo patrón que la fila
de "Plan de evaluación" ya tiene), y la nota correspondiente en §3
(Director) sobre ser el único con `mejora.aprobar`.

- [ ] **Step 5: `ENTIDADES_AUDITABLES`**

En `shared-kernel/domain-events/domain-event.ts`, añadir `'PlanMejora'` a la
lista, junto a `'PlanEvaluacion'`.

- [ ] **Step 6: La suite unitaria en verde**

`cd apps/api && npx vitest run src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Los permisos de Plan de Mejora, acotados por carrera desde el primer commit"
```

---

## Task 7: Registro en `app.module.ts`

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `RepositorioPlanMejoraPort` (Task 3), `GestionarPlanesMejora`
  (Task 4), `PlanesMejoraController` (Task 5).

- [ ] **Step 1: Import, provider del puerto, `useFactory` del caso de uso**

Calcado del bloque de `GestionarPlanesEvaluacion` (líneas 130-145 y 468-494
del `app.module.ts` actual): el símbolo `REPOSITORIO_PLAN_MEJORA` se ata a
`PlanMejoraRepositoryPrisma`; `GestionarPlanesMejora` se registra con
`useFactory` inyectando `[REPOSITORIO_PLAN_MEJORA, AUTHORIZATION_PORT,
PUBLICADOR_EVENTOS]` — **sin** `CONTENIDO_CURRICULAR`, a diferencia de
evaluación: este caso de uso no cruza a `plan-estudios` en este ciclo (§1 y
§13 del diseño).

`PlanesMejoraController` entra en el array `controllers`.

- [ ] **Step 2: Compila — bloqueado por el cliente Prisma sin regenerar**

Mismo bloqueo que Task 3/Step 3: `tsc --noEmit` fallará sobre
`PlanMejoraRepositoryPrisma` hasta que el cliente se regenere con Docker.
Se deja documentado, no maquillado.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Registra GestionarPlanesMejora en la composición de la aplicación"
```

---

## Task 8: Cierre

- [ ] **Step 1: La suite unitaria completa**

`cd apps/api && npx vitest run` — cifra observada, no la de partida (843).

- [ ] **Step 2: No tocar la tabla de progreso de `CLAUDE.md` todavía**

RF-PJ sigue en 0/47 hasta que los cuatro ciclos (2c-J-A a 2c-J-D) cierren el
bloque completo — este ciclo no completa ni un RF-PJ de punta a punta (RF-PJ-000
a RF-PJ-019 tocan piezas que 2c-J-B/C/D siguen construyendo encima). Se
confirma en el resumen final, no se edita la tabla.

- [ ] **Step 3: Dejar constancia de lo pendiente por Docker**

En el resumen del ciclo: migración sin aplicar, cliente Prisma sin
regenerar, repositorio sin verificar contra Postgres real, endpoints sin
probar en caliente. Es la lista exacta de lo que alguien con Docker
disponible debe correr antes de dar este ciclo por cerrado de verdad.
