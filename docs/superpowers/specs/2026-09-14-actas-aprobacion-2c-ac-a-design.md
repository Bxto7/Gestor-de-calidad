# Actas de Aprobación · ciclo 2c-AC-A — el acta existe

## 1. Por qué este ciclo existe y dónde acaba

Cubre RF-AC-000 a RF-AC-006: se incorpora el submódulo `actas` a Mejora
Continua, con la entidad `ActaAprobacion`, su correlativo por carrera,
título/objetivo autogenerados, datos de cabecera de la reunión, la lista de
asistentes y el lugar/fecha de emisión. Es el núcleo sobre el que se apoya
el contenido real del acta (las acciones de mejora) en el siguiente ciclo.

Este es el último bloque de RF pendiente en Mejora Continua — Planes de
Medición, Plan de Evaluación y Plan de Mejora ya están cerrados. Al terminar
los tres ciclos de Actas, el módulo queda completo.

**Fuera de 2c-AC-A explícitamente:**

- Carga automática y selección manual de acciones de mejora, tablas por
  aspecto, textos institucionales, máquina de estados completa, aprobar,
  rechazar, validación de completitud, bloqueo de edición (RF-AC-007 a 017)
  → 2c-AC-B.
- Exportación Excel/PDF, búsqueda/filtrado, consulta de solo lectura,
  histórico de modificaciones, permisos formalizados por operación y
  auditoría (RF-AC-018 a 026) → 2c-AC-C.

En este ciclo el acta solo existe en estado `Borrador`. El campo `estado` se
modela ya con su tipo completo (§4) porque **no** es el mismo enum que usan
Medición/Evaluación/Mejora — RF-AC-012 define cinco estados con nombres
distintos (`Aprobada`/`Emitida` en vez de `Aprobado`/`Vigente`) — pero la
máquina de transición en sí (RF-AC-013 a 017) se construye recién en
2c-AC-B.

## 2. El hallazgo que decidió el modelo del periodo académico

`PlanMejora.periodoId` **solo existe para el aspecto Competencia** —
heredado del `Periodo` de un `PlanMedicion` base. Los planes de Criterio de
Acreditación y Objetivo Educacional no tienen periodo: se identifican por su
"elemento" (el criterio o el objetivo), no por tiempo. Confirmado en
`gestionar-planes-mejora.use-case.ts:233-241` (comentario explícito: "el
ámbito de unicidad del código es el elemento mismo para criterio/objetivo, y
el periodo académico para competencias").

RF-AC-001/007 piden que el acta agrupe los tres aspectos "por periodo
académico" — un concepto que hoy no es uniforme entre aspectos. Decisión
(confirmada con el usuario):

- El acta tiene un campo propio **`periodoAcademico`**: etiqueta libre (ej.
  `"2025-10"`, tal como la nombran los documentos institucionales), sin
  relación con la tabla `Periodo`. Alimenta el título y el objetivo
  autogenerados (RF-AC-003); el correlativo (§4) es numérico puro y no
  depende de ella.
- Por separado, el acta referencia opcionalmente un **`Periodo`** concreto
  de Medición/Evaluación (`periodoMedicionId`), que en 2c-AC-B se usa
  exclusivamente para filtrar qué planes de mejora de Competencia entran en
  la carga automática (RF-AC-007).
- Para Criterio de Acreditación y Objetivo Educacional, 2c-AC-B no filtra
  por periodo en absoluto: incluye todos los planes en estado
  `Aprobado`/`Vigente` de la carrera que aún no figuren en ningún acta ya
  `Emitida` de ese mismo aspecto. Esto no se modela en 2c-AC-A (no hay
  contenido de acta todavía) pero condiciona el diseño de la relación
  Acta↔PlanMejora que llega en 2c-AC-B.

## 3. Estructura: sigue el patrón de `mejora`

```
apps/api/src/modules/mejora-continua/
  actas/
    domain/
      value-objects/
        estado-acta.ts                # nuevo — tipo EstadoActa, NO reutiliza EstadoMedicion
        correlativo-acta.ts           # nuevo — función pura, mismo espíritu que codigo-mejora.ts
      events/
        eventos-actas.ts              # nuevo
    application/
      ports/
        acta-aprobacion.port.ts       # nuevo
      use-cases/
        gestionar-actas.use-case.ts   # nuevo (+ .spec.ts)
    infrastructure/
      http/
        actas.controller.ts           # nuevo
        dto/*.dto.ts
      persistence/
        acta-aprobacion.repository.ts # nuevo (Prisma)
```

Sin `domain/entities/` — mismo criterio que el resto del proyecto: el
dominio vive como VOs + funciones puras + datos planos de puerto.

## 4. El modelo de datos

```prisma
enum EstadoActa {
  BORRADOR
  EN_REVISION
  APROBADA
  EMITIDA
  HISTORICA
}

model ActaAprobacion {
  id                String     @id @default(uuid()) @db.Uuid
  carreraId         String     @map("carrera_id") @db.Uuid
  /// RF-AC-002 RN1/RN2: correlativo continuo por carrera, no editable.
  correlativo       Int
  /// RF-AC-002: denormalizado en creación ("ACTA N° 001 – EAP-ISI"); no se
  /// recalcula si el código de la carrera cambia después — mismo criterio
  /// que el resto de módulos con `codigo` denormalizado.
  codigo            String     @unique @db.VarChar(80)
  /// RF-AC-001/003: etiqueta libre, ver §2. No es la tabla `Periodo`.
  periodoAcademico  String     @map("periodo_academico") @db.VarChar(40)
  /// RF-AC-007 (2c-AC-B): opcional, filtra solo el aspecto Competencia.
  periodoMedicionId String?    @map("periodo_medicion_id") @db.Uuid
  titulo            String     @db.VarChar(300)
  objetivo          String     @db.Text
  convocadaPor      String     @map("convocada_por") @db.VarChar(200)
  fechaReunion      DateTime   @map("fecha_reunion")
  lugarReunion      String     @map("lugar_reunion") @db.VarChar(200)
  comentario        String?    @db.Text
  lugarEmision      String?    @map("lugar_emision") @db.VarChar(200)
  fechaEmision      DateTime?  @map("fecha_emision")
  estado            EstadoActa @default(BORRADOR)
  creadoEn          DateTime   @default(now()) @map("creado_en")
  actualizadoEn     DateTime   @updatedAt @map("actualizado_en")

  asistentes AsistenteActa[]

  /// RF-AC-002 RN2: el ámbito de unicidad es la carrera, igual que el
  /// código de Plan de Estudios (RF017 RN1) — pero aquí sí hace falta el
  /// índice porque `correlativo` es numérico y colisiona por diseño si no
  /// se fuerza a nivel de base.
  @@unique([carreraId, correlativo])
  @@index([carreraId])
  @@map("actas_aprobacion")
}

model AsistenteActa {
  id     String @id @default(uuid()) @db.Uuid
  actaId String @map("acta_id") @db.Uuid
  nombre String @db.VarChar(200)

  acta ActaAprobacion @relation(fields: [actaId], references: [id], onDelete: Cascade)

  @@index([actaId])
  @@map("asistentes_acta")
}
```

`estado` se persiste ya con el enum completo (evita una migración de tipo
en 2c-AC-B), pero el repositorio y el caso de uso de este ciclo solo
escriben/leen `BORRADOR`.

**Corrección tras verificar el código real de `mejora` (no una relación
Prisma a `Carrera`):** `PlanMejora.carreraId` **no lleva `@relation` hacia
`Carrera`** — confirmado en `plan-mejora.int.spec.ts:6-10`, con cita
textual: *"`PlanMejora` no lleva clave foránea hacia `plan_estudios` ni
hacia los criterios de acreditación (§3.2 de CLAUDE.md: los módulos no
comparten tablas)"*. `plan_estudios` y `mejora_continua` son **schemas de
Postgres separados** (`schema.prisma`, `schemas = [...]`), precisamente
para que un cruce indebido se note a simple vista en el SQL. La versión
original de este documento proponía `carrera Carrera @relation(...)`, lo
cual rompía esa convención — ya corregido arriba: `carreraId` es un UUID
suelto, sin relación Prisma, con `@@index([carreraId])`.

## 5. Puertos

Nuevo `RepositorioActaAprobacionPort` en `actas/application/ports/acta-aprobacion.port.ts`:

```ts
export interface RepositorioActaAprobacionPort {
  crear(datos: NuevaActa): Promise<DatosActa>;
  porId(id: string): Promise<DatosActa | null>;
  editarCabecera(id: string, datos: CabeceraActa): Promise<DatosActa>;
  reemplazarAsistentes(id: string, nombres: readonly string[]): Promise<DatosActa>;
  eliminar(id: string): Promise<void>;
  correlativosDe(carreraId: string): Promise<readonly number[]>;
}
export const REPOSITORIO_ACTA_APROBACION = Symbol('RepositorioActaAprobacionPort');
```

**Corrección tras verificar el código real:** no existe un puerto que
devuelva nombre+código de una `Carrera` por su `carreraId` directo. Lo que
sí existe, `ContenidoCurricularPort.planPorId(planEstudiosId)`, trae
`carreraNombre` pero está indexado por plan de estudios, no por carrera, y
no expone el código de carrera. Hace falta un método nuevo en el puerto
cross-módulo ya existente (`plan-estudios/application/ports/contenido-curricular.port.ts`):

```ts
export interface CarreraBase {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface ContenidoCurricularPort {
  // ...métodos existentes...
  /** Nuevo en 2c-AC-A: para componer código/título/objetivo del acta. */
  carreraPorId(carreraId: string): Promise<CarreraBase | null>;
}
```

Implementado en `ContenidoCurricularAdapter`
(`plan-estudios/infrastructure/contenido-curricular.adapter.ts`) con un
`this.prisma.carrera.findUnique({ where: { id: carreraId }, select: { id, codigo, nombre } })`
— mismo patrón que los otros métodos del adaptador. No es un puerto nuevo,
es una ampliación de uno que ya cruza la frontera `mejora-continua` →
`plan-estudios` para este propósito exacto.

## 6. Casos de uso

`GestionarActas` — mismo patrón de constructor por `useFactory` que
`GestionarPlanesMejora`, inyectando `RepositorioActaAprobacionPort`,
`AuthorizationPort`, `PublicadorDeEventos`:

- `crear(actor, datos)` — recibe `carreraId`, `periodoAcademico`,
  `periodoMedicionId?`. Genera `correlativo` vía
  `siguienteCorrelativoActa(...)` contra `correlativosDe(carreraId)`,
  compone `codigo` con el código de carrera, y precarga `titulo`/`objetivo`
  a partir de nombre de carrera + `periodoAcademico` (RF-AC-003). Exige el
  permiso `actas.crear` acotado a la carrera indicada.
- `editarCabecera(actor, id, datos)` — `convocadaPor`, `fechaReunion`,
  `lugarReunion`, `comentario`, `titulo`, `objetivo`, `lugarEmision`,
  `fechaEmision`. Exige estado `BORRADOR`; si `lugarEmision`/`fechaEmision`
  no se envían, no se sobrescriben (quedan `null` hasta que el usuario los
  toque explícitamente — RF-AC-006 solo pide que el sistema *proponga* los
  mismos valores de la reunión como default de UI, no que el backend los
  copie).
- `reemplazarAsistentes(actor, id, nombres)` — reemplaza el conjunto
  completo, mismo patrón que `declararPeriodos`/`declararCompetencias` de
  Medición. Exige estado `BORRADOR`.
- `eliminar(actor, id)` — exige estado `BORRADOR`.

## 7. HTTP

`actas.controller.ts`: `POST /actas`, `GET /actas/:id`,
`PATCH /actas/:id`, `PUT /actas/:id/asistentes`, `DELETE /actas/:id`. Sin
listado/búsqueda todavía (RF-AC-020 es 2c-AC-C).

## 8. Pantallas

Sin pantalla dedicada en este ciclo. El contenido real del acta (tablas de
acciones de mejora) necesita 2c-AC-B para ser útil — una pantalla ahora
mostraría un formulario de cabecera vacío y habría que rehacerla ahí. Los
endpoints de este ciclo quedan cubiertos por las pruebas de caso de uso e
integración de repositorio (ver §11), sin UI todavía — mismo criterio real
que 2c-J-A.

## 9. Permisos y auditoría

1. **`apps/api/prisma/seed.ts`** — agregar al catálogo (categoría
   `'mejora-continua'`): `actas.leer`, `actas.crear`, `actas.editar`,
   `actas.eliminar`, `actas.aprobar`. Asignación por rol, calcada de
   `mejora.*`: DIRECTOR_CARRERA recibe las cinco; COORDINADOR_ACADEMICO
   recibe todas **menos** `actas.aprobar` (RF-AC-024: solo el Director
   aprueba); DOCENTE y USUARIO_CONSULTOR reciben solo `actas.leer`;
   ADMIN_SISTEMA recibe solo `actas.leer`.
2. **`politica-de-autorizacion.ts`** — agregar `actas.crear`,
   `actas.editar`, `actas.eliminar`, `actas.aprobar` al `Set`
   `PERMISOS_ACOTADOS_A_CARRERA` (RF-AC-023: "de su carrera"). `actas.leer`
   queda fuera, igual que `mejora.leer`.
3. **`docs/arquitectura/roles-y-permisos.md`** — agregar la fila de Actas a
   las tablas de rol y a la lista de permisos acotados.
4. **Auditoría** — agregar `'ActaAprobacion'` a `ENTIDADES_AUDITABLES` en
   `domain-event.ts`. Eventos en `actas/domain/events/eventos-actas.ts`:
   `ActaCreada`, `ActaCabeceraEditada`, `ActaAsistentesReemplazados`,
   `ActaEliminada` — extendiendo
   `abstract class EventoActa extends DomainEvent { readonly entidad = 'ActaAprobacion'; }`,
   publicados vía la misma `PublicadorDeEventos` (`BitacoraListener` no
   cambia).

En el caso de uso: `actas.crear` para `crear`, `actas.editar` para
`editarCabecera`/`reemplazarAsistentes`, `actas.eliminar` para `eliminar` —
directos, sin transición todavía (llega en 2c-AC-B con
`actas.${transicion.permiso}`, mismo patrón que `estado-plan.ts`).

## 10. Errores

Reutiliza `ReglaDeNegocioViolada`, `NoEncontrado`, `AccesoDenegado` — ya
existentes, sin necesidad de nuevas clases de error.

## 11. Pruebas

**Corrección tras verificar el repo real:** el runner es **Vitest**, no
Jest (`import { describe, expect, it, vi } from 'vitest'` en todo
`apps/api`), y **no existe capa Supertest/e2e HTTP** en el proyecto — cero
resultados de `supertest`, sin carpeta `test/e2e/`. El patrón real de
`mejora-continua` son dos capas: unit (`*.spec.ts` junto al caso de uso,
dobles de puerto) e integración (`apps/api/test/integration/*.int.spec.ts`,
contra el Postgres real del `docker-compose` de desarrollo — sin contenedor
efímero por archivo; `beforeEach` hace `TRUNCATE ... RESTART IDENTITY
CASCADE` y `afterAll` desconecta). Este ciclo sigue exactamente ese patrón,
no uno nuevo:

- Unit: `correlativo-acta.spec.ts` (función pura), `gestionar-actas.spec.ts`
  (caso de uso, dobles de puerto — mismo estilo que
  `gestionar-planes-mejora.spec.ts`: `permitirTodo()`/`denegarRegistrando()`
  para `AuthorizationPort`, un `montar()` que arma el caso de uso).
- Integración: `apps/api/test/integration/acta-aprobacion.int.spec.ts`,
  mismo patrón que `plan-mejora.int.spec.ts` — `TRUNCATE
  mejora_continua.asistentes_acta, mejora_continua.actas_aprobacion RESTART
  IDENTITY CASCADE` en `beforeEach`, sin sembrar `Carrera` real (`carreraId`
  es un UUID suelto, igual que en `PlanMejora`). Verifica en Postgres real
  el `@@unique([carreraId, correlativo])` y el `onDelete: Cascade` de
  asistentes.
- Sin test de controller dedicado: mismo criterio real que 2c-J-A (el
  comentario de cabecera de `planes-mejora.controller.ts` menciona
  Supertest, pero esa capa no existe en la práctica — los endpoints quedan
  cubiertos por el caso de uso + integración de repositorio, y por
  Playwright una vez haya pantalla).

Cobertura ≥80% en domain/application.

## 12. Decisiones tomadas en este diseño

1. `periodoAcademico` (etiqueta libre) y `periodoMedicionId` (referencia
   opcional a `Periodo`) son campos distintos — ver §2. Es la resolución
   explícita que el propio documento fuente dejaba "pendiente de
   confirmación" para RF-AC-002, extendida a la ambigüedad estructural que
   ese documento no llegó a detectar (periodo inexistente para
   criterio/objetivo).
2. `estado` se modela con el enum completo de cinco valores desde este
   ciclo, aunque solo se usa `BORRADOR` — evita una migración de tipo en
   2c-AC-B. No reutiliza `EstadoMedicion` porque los nombres de estado no
   coinciden (RF-AC-012).
3. `AsistenteActa` solo tiene `nombre` — el RF no detalla más columnas; si
   el formato institucional de exportación (2c-AC-C) exige "cargo" u otro
   dato por asistente, se agrega ahí.
4. `lugarEmision`/`fechaEmision` quedan `null` hasta que el usuario los
   edite explícitamente — la propuesta de "mismo valor que la reunión" de
   RF-AC-006 es responsabilidad de la UI (precarga de formulario), no del
   backend, mismo criterio que RF-AC-003 (títulos "precarga editable").
5. `correlativo` sí lleva constraint de unicidad a nivel de base de datos
   (`@@unique([carreraId, correlativo])`), a diferencia del `codigo` de
   `PlanMejora` — aquí es puramente numérico y no hay prefijo de aspecto
   que ya lo distinga, así que vale la pena la garantía dura.
6. `carreraId` es un UUID suelto sin `@relation` de Prisma hacia `Carrera`
   — la primera versión de este diseño proponía la relación directa y
   verificar el código real (`plan-mejora.int.spec.ts`) mostró que rompía
   la separación de schemas `plan_estudios`/`mejora_continua`. Corregido.
7. `ContenidoCurricularPort` gana un método nuevo, `carreraPorId`, en vez
   de crear un puerto cross-módulo aparte solo para Actas — ya es la
   frontera que `mejora-continua` usa hacia `plan-estudios`, y ningún
   método existente cubría "nombre + código de una carrera por su id".

## 13. Lo que este diseño no resuelve

- Carga automática y selección de acciones de mejora, la relación
  Acta↔PlanMejora que decide "qué planes ya están en un acta emitida", las
  tablas por aspecto, los textos institucionales y la máquina de estados
  completa (RF-AC-007 a 017) — 2c-AC-B.
- Exportación Excel/PDF con el formato institucional exacto, búsqueda,
  consulta de solo lectura, histórico de modificaciones y el cierre formal
  de permisos/auditoría por operación crítica (RF-AC-018 a 026) — 2c-AC-C.
  Los permisos base (`actas.crear/editar/eliminar/aprobar/leer`) ya quedan
  resueltos en 2c-AC-A (§9).
