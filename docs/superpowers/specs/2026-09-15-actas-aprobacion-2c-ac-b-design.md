# Actas de Aprobación · ciclo 2c-AC-B — el contenido del acta

## 1. Por qué este ciclo existe y dónde acaba

Cubre RF-AC-007 a RF-AC-011: el acta deja de ser solo cabecera (2c-AC-A) y
gana contenido real — las acciones de mejora del periodo, la selección
manual de cuáles incluir, y los textos institucionales de introducción y
cierre.

**Recorte respecto al plan original de 2c-AC-A:** ese diseño agrupaba
RF-AC-007 a 017 en un único "2c-AC-B". Se partió en dos, confirmado con el
usuario, porque son responsabilidades distintas y la segunda depende de que
la primera exista:

- **2c-AC-B (este ciclo):** RF-AC-007 a 011 — contenido del acta.
- **2c-AC-C (renombrado):** RF-AC-012 a 017 — máquina de estados,
  transiciones, aprobar, rechazar, validación de completitud (que exige "al
  menos una acción incluida", solo posible una vez que 2c-AC-B existe), y
  bloqueo de edición.
- El antiguo "2c-AC-C" (RF-AC-018 a 026: exportación, búsqueda, permisos por
  operación, auditoría) pasa a llamarse **2c-AC-D**.

Backend-only, sin pantalla — mismo criterio que 2c-AC-A: la interfaz de
selección de acciones y edición de textos no aporta nada usable hasta que
el acta pueda aprobarse y emitirse de punta a punta (2c-AC-C).

## 2. El filtro de "periodo académico" — divergencia registrada

RF-AC-007 pide cargar "los planes de mejora aprobados **del periodo
académico seleccionado**", como si el periodo fuera un concepto uniforme
entre los tres aspectos. No lo es — ya lo dejó anotado 2c-AC-A (§2 de su
diseño): `PlanMejora.periodoId` solo existe para el aspecto Competencia
(hereda el `Periodo` de un `PlanMedicion`); Criterio de Acreditación y
Objetivo Educacional no tienen noción de periodo en absoluto, se identifican
por su elemento asociado.

Resolución, consistente con esa nota:

- **Criterio de Acreditación / Objetivo Educacional:** candidatas = planes
  de la carrera en estado `Aprobado` o `Vigente`, sin filtro de periodo.
- **Competencia:** candidatas = planes en estado `Aprobado`/`Vigente` **y**
  `periodoId === acta.periodoMedicionId` — si el acta no tiene
  `periodoMedicionId` definido, esta sección queda vacía (RF-AC-007, flujo
  alternativo: "si un aspecto no tiene acciones aprobadas para el periodo,
  su sección se muestra vacía").
- **Los tres aspectos, además:** se excluye cualquier plan que ya figure
  como `incluida=true` en una `AccionActa` de un acta en estado `EMITIDA`
  (nota de 2c-AC-A §2, generalizada a los tres aspectos por simetría: una
  acción ya reportada en un acta emitida no vuelve a ofrecerse). El estado
  `EMITIDA` recién es alcanzable en 2c-AC-C — esta regla se construye ahora
  como función pura de dominio, y se ejercita con datos reales una vez que
  exista la transición.

## 3. Puertos — sin puerto nuevo

`actas` inyecta directo `RepositorioPlanMejoraPort`
(`mejora/application/ports/plan-mejora.port.ts`) en `GestionarActas`, sin
crear una capa intermedia. Confirmado contra el código real: el patrón ya
establecido entre submódulos hermanos de `mejora-continua` (`mejora`,
`medicion`, `evaluacion`) es la inyección directa del puerto de repositorio
del hermano — `GestionarPlanesMejora` ya inyecta
`RepositorioPlanEvaluacionPort` y `RepositorioPlanMedicionPort` así, sin un
`EvaluacionCrossModuloPort` ni equivalente. `mejora-continua/aislamiento.spec.ts`
solo vigila la frontera `mejora-continua` ↔ `plan-estudios`; no aplica entre
hermanos, así que no hace falta tocarlo.

`RepositorioPlanMejoraPort.listarDeCarrera` necesita un caso nuevo: filtrar
por `estado` con más de un valor (`Aprobado` **o** `Vigente`) en una sola
llamada. Hoy `filtro?.estado` acepta un único `EstadoMedicion`. Se amplía a
`estado?: EstadoMedicion | readonly EstadoMedicion[]` — cambio aditivo,
compatible con todo el código existente que ya pasa un valor único.

**RF-PJ-028 (% de medición de competencia):** no hace falta plomería nueva.
Ya existe `porcentajeAnteriorDeCompetencia(actor, planEvaluacionId,
competenciaId, periodoId): Promise<number | null>` en
`GestionarPlanesMejora` (expuesto también como
`GET /planes-mejora/competencia/porcentaje-anterior`), y los tres
parámetros que necesita ya están en el propio `DatosPlanMejora` de cada fila
de Competencia. `cargarAccionesDelPeriodo` lo llama una vez por candidata de
ese aspecto y snapshotea el resultado.

## 4. El modelo de datos

```prisma
/// RF-AC-007/008: qué planes de mejora entran en el acta y cuáles de esos
/// quedan finalmente incluidos. `aspecto` está denormalizado (agrupa/ordena
/// sin re-consultar PlanMejora); las columnas descriptivas de la tabla
/// (nombre, elemento asociado, plazo, recursos, metas, responsable) se leen
/// en vivo de PlanMejora — decisión explícita (§8) de no snapshotearlas
/// todavía, porque la inmutabilidad real del acta recién la garantiza
/// 2c-AC-C al aprobarla.
model AccionActa {
  id           String            @id @default(uuid()) @db.Uuid
  actaId       String            @map("acta_id") @db.Uuid
  planMejoraId String            @map("plan_mejora_id") @db.Uuid
  aspecto      AspectoPlanMejora
  /// RF-AC-008 RN1: incluida por defecto al cargarse.
  incluida     Boolean           @default(true)
  /// RF-PJ-028 / RF-AC-010: snapshot al momento de cargar, null si el
  /// aspecto no es Competencia o si "no disponible" (primer periodo).
  porcentajeMedicionCompetencia Decimal? @map("porcentaje_medicion_competencia") @db.Decimal(5, 2)
  /// Orden de carga automática dentro de su sección — RF-AC-007 RN2 exige
  /// un orden de secciones fijo; dentro de cada sección, orden de llegada.
  orden        Int

  acta ActaAprobacion @relation(fields: [actaId], references: [id], onDelete: Cascade)

  /// Un plan de mejora aparece a lo sumo una vez por acta.
  @@unique([actaId, planMejoraId])
  @@index([actaId])
  @@map("acciones_acta")
  @@schema("mejora_continua")
}
```

`ActaAprobacion` suma dos columnas (RF-AC-011):

```prisma
  /// RF-AC-011: párrafo previo a las tablas. Se compone en `crear` (el
  /// periodo académico ya existe en ese momento — a diferencia de
  /// convocadaPor/fechaReunion/lugarReunion, no hace falta centinela).
  textoIntroduccion  String @map("texto_introduccion") @db.Text
  /// RF-AC-011: párrafo de cierre con la sección resolutiva.
  textoAcuerdoCierre String @map("texto_acuerdo_cierre") @db.Text
```

`AspectoPlanMejora` es el enum ya existente de `mejora` (mismo schema
`mejora_continua`) — se reutiliza tal cual, no se duplica.

## 5. Casos de uso

Tres métodos nuevos en `GestionarActas`, los tres exigen `acta.estado ===
BORRADOR` (mismo guardián que `editarCabecera`, cita `RF-AC-017`) y el
permiso `actas.editar` acotado a la carrera:

- **`cargarAccionesDelPeriodo(actor, actaId)`** — RF-AC-007. Por cada
  aspecto, calcula candidatas según §2, calcula `porcentajeMedicionCompetencia`
  para las de Competencia, y crea las `AccionActa` que todavía no existan
  para esa acta (`incluida=true`). **Idempotente**: nunca borra ni resetea
  una `AccionActa` ya existente — una recarga solo agrega candidatas nuevas
  que aparecieron después (p. ej. un plan que se aprobó más tarde). Devuelve
  el contenido completo del acta tras la carga.
- **`actualizarSeleccionDeAcciones(actor, actaId, selección)`** — RF-AC-008.
  Recibe una lista de `{ planMejoraId, incluida }` y togglea el campo sobre
  filas `AccionActa` ya existentes; un `planMejoraId` que no tiene fila
  todavía es un error (`ReglaDeNegocioViolada` — hay que cargar primero).
- **`editarTextosInstitucionales(actor, actaId, { textoIntroduccion?,
  textoAcuerdoCierre? })`** — RF-AC-011. Reemplazo parcial, mismo estilo que
  `editarCabecera`.

**Lectura:** `obtener(actor, actaId)` (ya existe desde 2c-AC-A) se amplía
para incluir las `AccionActa` de la acta, cada una resuelta con los campos
descriptivos en vivo de `PlanMejora` (join en el repositorio, una consulta
`planMejoraPorIds` nueva en `RepositorioPlanMejoraPort` para evitar N+1).
Ordenadas por `aspecto` (orden fijo: Criterio, Objetivo, Competencia — RF-AC-007
RN2) y luego por `orden`. RF-AC-009 (qué columnas mostrar por aspecto) es un
criterio de presentación: el backend expone todos los campos relevantes de
cada fila; qué subconjunto se pinta como tabla es responsabilidad de la
futura pantalla, no de este ciclo.

## 6. Errores

Reutiliza `ReglaDeNegocioViolada`, `NoEncontrado`, `AccesoDenegado` — sin
clases nuevas. Casos nuevos que la usan: intentar `cargarAccionesDelPeriodo`
o `actualizarSeleccionDeAcciones`/`editarTextosInstitucionales` fuera de
`BORRADOR`; togglear un `planMejoraId` sin `AccionActa` previa.

## 7. Auditoría

`domain-event.ts` ya tiene `'ActaAprobacion'` en `ENTIDADES_AUDITABLES`
desde 2c-AC-A — no hace falta tocarlo. Eventos nuevos en
`actas/domain/events/eventos-actas.ts`, mismo patrón (`extends EventoActa`):
`ActaAccionesCargadas` (con el conteo por aspecto), `ActaSeleccionDeAccionesActualizada`,
`ActaTextosEditados`.

## 8. Decisiones tomadas en este diseño

1. **Lectura en vivo, no snapshot, de los campos descriptivos de
   `PlanMejora`** (confirmado con el usuario). `AccionActa` solo persiste el
   vínculo, el aspecto denormalizado, la inclusión y el % de competencia
   (que no tiene otro lugar donde vivir — es calculado, no un campo
   propio de `PlanMejora`). El resto se lee vía join en el momento de
   consultar el acta. Esto es intencionalmente provisional: cuando 2c-AC-C
   aprueba un acta, ahí sí hace falta congelar el contenido para que
   `RF-AC-017` ("preserva la integridad de las actas ya aprobadas") sea
   cierto de verdad — ese es el momento de decidir si se snapshotea recién
   entonces o se acepta el join también para actas aprobadas (planes de
   mejora `Aprobado`/`Vigente` no deberían mutar de todos modos). Se deja
   anotado para no resolverlo dos veces.
2. **Exclusión por acta `Emitida` generalizada a los tres aspectos** (§2) —
   la nota original de 2c-AC-A solo la mencionaba para Criterio/Objetivo;
   se extiende a Competencia por la misma razón de fondo (no repetir una
   acción ya cerrada formalmente), y porque no hay ninguna razón de dominio
   para que el comportamiento difiera entre aspectos en este punto.
3. **`listarDeCarrera` acepta `estado` como valor único o arreglo** — cambio
   aditivo al puerto existente en vez de una consulta paralela, para no
   duplicar la lógica de armar candidatas en dos sitios.
4. **`textoIntroduccion`/`textoAcuerdoCierre` no son nulos** — a diferencia
   de `convocadaPor`/`fechaReunion`/`lugarReunion` (que nacen vacíos porque
   dependen de datos de la reunión, desconocidos al crear), el periodo
   académico ya existe en el momento de `crear`, así que el texto compuesto
   siempre tiene con qué generarse.
5. **Sin capa de "tabla" en el backend** — RF-AC-009 es presentación pura;
   el backend devuelve los datos, la futura pantalla decide qué columnas
   pintar según el aspecto de cada fila.

## 9. Lo que este diseño no resuelve

- Máquina de estados, transiciones, aprobar, rechazar con comentario,
  validación integral de completitud, bloqueo de edición (RF-AC-012 a 017)
  — 2c-AC-C.
- Snapshot definitivo del contenido al aprobar, si se decide que hace falta
  (§8.1) — se decide en 2c-AC-C, con el contexto de la aprobación real.
- Exportación, búsqueda, permisos por operación, auditoría formal
  (RF-AC-018 a 026) — 2c-AC-D.
