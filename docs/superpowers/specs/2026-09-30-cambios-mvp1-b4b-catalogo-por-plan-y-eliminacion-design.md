# Cambios MVP1 — Bloque 4b: objetivos y competencias por plan, y eliminación

- Fecha: 2026-09-30
- Origen: `Requerimientos de Cambios y Observaciones - MVP1.md` (documento externo, no versionado en el repo)
- Cubre: RF-CH-015, RF-CH-016, RF-CH-017, RF-CH-018, RF-CH-019, más el arreglo de «Generar nueva versión» (no copia los vínculos de objetivos y competencias del plan)
- Bloque 4 de 10 de la iniciativa "Cambios y observaciones MVP1", segunda mitad. Depende del Bloque 3 (`AlcanceDeLecturaPort`, marca `lectura.solo_su_carrera`) y del Bloque 4a (el modal de asignatura solo ofrece las competencias del plan; patrón de error visible en las páginas).

## 1. Alcance

- **RF-CH-015 / RF-CH-017.** Las secciones Objetivos y Competencias muestran solo lo vinculado al plan en curso. Crear un objetivo o una competencia dentro del plan lo asocia a ese plan y a su carrera sin selección manual.
- **RF-CH-016 / RF-CH-018.** Con el plan en Borrador o En revisión se puede eliminar un objetivo o una competencia del plan, salvo que esté en uso.
- **RF-CH-019.** Con el plan en Borrador o En revisión se puede eliminar una asignatura, salvo que esté en uso.
- **Nueva versión.** La versión generada copia también los vínculos plan↔objetivo y plan↔competencia.

**No cubre en este bloque:**
- Reutilizar en un plan un objetivo o una competencia de otra carrera.
- Los selectores de Mejora Continua (planes de mejora por objetivo o competencia): siguen leyendo el catálogo como hoy.
- El catálogo de atributos del graduado y los criterios de acreditación (Bloque 5).
- Copiar los prerrequisitos (`Dependencia`) al generar versión: tampoco se copian hoy (ver §5).

**Decisiones ya tomadas con el usuario:**
1. El Bloque 4 se parte en 4a (hecho y fusionado) y 4b (este).
2. «Eliminar» un objetivo o una competencia de un plan en Borrador o En revisión significa **quitarlo del plan y borrar el registro solo si ningún otro plan ni flujo lo usa**. Si otro plan lo sigue vinculando, el registro se queda. Si este plan o Mejora Continua lo usan, se bloquea con el motivo.
3. Objetivos y competencias pasan a tener **carrera propia**: columna nueva `carrera_id` (FK, nullable) en ambas tablas. Se fija sola con la carrera del plan al crearlos dentro de él. Las filas existentes se rellenan desde sus vínculos con planes cuando todos apuntan a una sola carrera; las ambiguas o sin vínculo quedan en NULL y se cuentan en la migración. El **nombre es único por carrera**: se abandona la unicidad global. El código (OE-01, CPE-01) sigue siendo un correlativo global. `objetivo.gestionar` y `competencia.gestionar` pasan a ser permisos acotados a la carrera.
4. **Mejora Continua bloquea solo cuando se va a borrar el registro** (confirmado por el usuario): quitar un elemento de un plan en Borrador o En revisión nunca consulta a Mejora Continua mientras otro plan lo siga vinculando. Un plan de medición solo existe sobre un plan Aprobado o Vigente, así que un Borrador no tiene datos de Mejora Continua propios.

## 2. Estado actual (verificado en código)

**Modelo (`apps/api/prisma/schema.prisma`).**
- `ObjetivoEducacional` (`:344-359`, esquema `objetivos_educacionales`) y `Competencia` (`:396-412`, esquema `plan_estudios`): `codigo @unique` (`:347`, `:399`; índices `objetivos_educacionales_codigo_key` y `competencias_codigo_key`, migración `20260820000000_esquema_inicial:308,311`). **No hay unicidad de nombre en la base**: solo la comprueba la aplicación con `existeNombre`, sin distinguir mayúsculas y para todo el sistema (`objetivos.repository.ts:111-120`, `catalogo.repository.ts:215-224`).
- El código no sale de una secuencia ni de un trigger. `siguienteCodigoObjetivo`/`siguienteCodigoCompetencia` calculan `max + 1` sobre `codigos()` (todos los códigos de la tabla) (`objetivos-educacionales/domain/value-objects/codigos.ts:10-22`).
- Relaciones y `onDelete`: `PlanObjetivo` (`:482-492`, plan Cascade, objetivo Restrict); `PlanCompetencia` (`:495-505`, plan Cascade, competencia Restrict); `AsignaturaCompetencia` (`:589-599`, asignatura Cascade, competencia Restrict); `CompetenciaAtributo` (`:422-433`, competencia **Cascade**); `Dependencia` (`:607-619`, Cascade por **los dos lados**, `asignatura` y `requiere`).
- Mejora Continua guarda los ids como UUID sin FK. Competencia: `competencias_del_plan.competencia_id` (`:831`), `programacion_medicion.competencia_id` (`:847`), `configuracion_competencia.competencia_id` (`:1046`), `medicion_alcanzada.competencia_id` (`:1070`) y `planes_mejora.competencia_id` (`:1226`). Objetivo: solo `planes_mejora.objetivo_educacional_id` (`:1225`). Asignatura: solo `asignatura_evaluada.asignatura_id` (`:1090`); `evidencia` cuelga de ella en cascada (`:1123`). `acciones_acta` referencia `plan_mejora_id` (`:1477`), no los elementos, así que queda cubierta por `planes_mejora`.
- El comentario de `PlanMedicion` (`:757-761`) justifica la falta de FK con que «en `plan_estudios` nada se borra físicamente: se inactiva». **Este bloque deja de cumplir esa premisa** (ver §5).
- Un plan de medición solo se crea sobre un plan Aprobado o Vigente (`gestionar-planes-medicion.use-case.ts:86-91`). Un plan en Borrador o En revisión no puede tener datos de Mejora Continua propios.

**Objetivos (módulo `objetivos-educacionales`, separado de `plan-estudios` desde la Fase 0c).**
- `GestionarObjetivos` (`gestionar-objetivos.use-case.ts`): `listar(actor, filtro)` sin plan ni alcance (`:42-45`); `crear(actor, nombre, descripcion)` sin plan (`:55-66`); `eliminar` solo si `planesVinculados === 0`, con el mensaje «No se puede eliminar: N plan(es) lo tienen asociado. Inactívalo…» (`:112-129`). El evento `ObjetivoEliminado` se publica antes de borrar (`:127`). Toda autorización se pide con carrera `null` (`:149-153`).
- `FiltroObjetivo` = `{ texto?, activo? }` (`objetivos.port.ts:27-30`). Endpoints en `/objetivos` (`objetivos.controller.ts:32`): GET, GET `:id`, POST, PATCH `:id`, PATCH `:id/estado`, DELETE `:id` (`:88-99`).
- Guardia `objetivos-educacionales/aislamiento.spec.ts`: este módulo **no importa nada** de `plan-estudios`. Guardia `plan-estudios/aislamiento.spec.ts:97-125`: `plan-estudios` solo importa `ports/objetivos-cross-modulo.port.js`.
- `ObjetivosCrossModuloAdapter.objetivosEducacionales()` devuelve el catálogo entero (`objetivos-cross-modulo.adapter.ts:25-28`) para `GestionarPlanesMejora.alertasMinimoObjetivo` (`gestionar-planes-mejora.use-case.ts:503-506`, RF-PJ-023 RN1 «catálogo global»).

**Competencias (en `plan-estudios`).**
- `GestionarCompetencias` (`gestionar-catalogo.use-case.ts`): `listar` sin plan (`:63-66`); `crear(actor, nombre, atributoIds)` (`:99-114`); `eliminar` solo sin vínculos con planes ni asignaturas, con un mensaje que detalla cuántos hay de cada uno (`:177-202`); `exigir` con carrera `null` (`:221-228`). Evento `ElementoCatalogoEliminado` (`eventos-catalogo.ts:94-110`).
- Endpoints en `/competencias` (`catalogo.controller.ts:38`): GET, GET `atributos`, GET `cobertura` (global, `:66-75`), GET `:id`, POST, PATCH `:id`, PATCH `:id/estado` y DELETE `:id` (`:120-128`).

**Asociación al plan y nueva versión.**
- Las únicas escrituras de `plan_objetivo`/`plan_competencia` en la API son `asociarObjetivos`/`asociarCompetencias`, que reemplazan el conjunto (`plan.repository.ts:120-139`). Las llama `GestionarPlanes.asociar` (`gestionar-planes.use-case.ts:173-204`) desde `PUT /planes/:id/asociaciones` (`planes.controller.ts:102`). No comprueban la carrera del elemento ni si alguna asignatura lo usa.
- `copiarContenido` (`plan.repository.ts:151-186`) copia asignaturas y `asignatura_competencia`, pero **no** `plan_objetivo`, `plan_competencia` ni `dependencias`. Además sale en `:156` si el origen no tiene asignaturas. La llama `GenerarNuevaVersion` (`generar-nueva-version.use-case.ts:100`).
- `PlanDeEstudios.esEditable` es Borrador o En revisión (`plan-de-estudios.ts:120-122`).

**Asignaturas.**
- No existe endpoint de borrado: el controlador `asignaturas` (`asignaturas.controller.ts:76`) solo tiene GET `:id` y PATCH `:id`. `cambiarEstado` documenta «RF052 RN1: nunca se borra el registro» (`gestionar-asignaturas.use-case.ts:154`).
- `exigirPlanEditable` reúne permiso acotado, plan y estado (`:293-305`). `impactoDeInactivar` ya lista quién la requiere (`asignatura.repository.ts:210-227`). Los prerrequisitos solo los crea `cargar-plan-isi-2018.ts:261-275`: no hay endpoint para crearlos (D-6). Triggers: `asignaturas_malla_historica_inmutable` impide tocar las de un plan Histórico (migración inicial `:537-540`).

**Permisos.**
- `PERMISOS_ACOTADOS_A_CARRERA` (`politica-de-autorizacion.ts:36-61`) incluye `asignatura.gestionar`, pero no `objetivo.gestionar` ni `competencia.gestionar`. Un permiso acotado con carrera `null` **se deniega** (`:100-107`).
- `objetivo.gestionar` y `competencia.gestionar` solo los tiene `DIRECTOR_CARRERA` (`matriz-de-accesos.ts:175,177`), igual que `asignatura.gestionar` (`:179`). Coordinador (`:206-207`) y Docente (`:253-254`) solo tienen `.leer`. Consultor y Administrador no tienen ninguno de los dos. Ningún otro rol cambia.
- Pruebas que fijan lo contrario: `politica-de-autorizacion.spec.ts:118-122` y `:143-156` («las de catálogo no lo están»).

**Consumidores de `GET /objetivos` y `GET /competencias`.**
- Web, sección del plan: `ObjetivosPage.tsx:45-46` y `CompetenciasPage.tsx:45-47` (catálogo global con casillas «asociar al plan» vía `useAsociarAlPlan`); `CompetenciasPage.tsx:121` monta `CoberturaIcacit` (`GET /competencias/cobertura`, global); `AsignaturasPage.tsx:69` (nombres para las tarjetas) y `:386` (`ModalAsignatura`, ya filtrado por `plan.competenciaIds` desde 4a).
- Web, Mejora Continua: `PlanesMejoraPage.tsx:70-71`, `PlanMejoraPage.tsx:97-98` y `ModalNuevoPlanMejora.tsx:45`. Los usa el Coordinador, que no tiene la marca de alcance.
- Hooks y API: `useObjetivos`/`useCompetencias` (`queries.ts:249,294`, claves `['objetivos']`/`['competencias']`), y `listarObjetivos`/`crearObjetivo`/`listarCompetencias`/`crearCompetencia` (`plan-estudios.api.ts:255-293`). `useEliminarObjetivo`/`useEliminarCompetencia` existen (`queries.ts:275,323`), pero **ninguna página los usa**.
- API interna: `ObjetivosCrossModuloAdapter` (arriba). `reportes.repository.ts:177-178` cuenta objetivos y competencias activos para el panel general, que el Director no ve desde B3. `contenido-curricular.adapter.ts:101` lee `plan_competencia` por plan. Ninguno pasa por los casos de uso de listado.
- E2E: `plan-estudios-correcciones.spec.ts:75-97` (GET `/competencias` global y PUT `/asociaciones`) y `:225-228` (POST `/competencias` sin plan, para fabricar una competencia «fuera del plan»).

**Datos sembrados.**
- `preparar-e2e.ts` crea con upsert por código `CPE-E2E01..04` (`:189`), `CPE-E2E05` (`:208`) y `CPE-01` (`:420`), todas vinculadas solo a planes de la carrera E2E, además de `OE-E2E-01` (`:276`), **sin vínculo con ningún plan**.
- `cargar-plan-isi-2018.ts` crea `CPE-ISI*` (`:141`) y `OE-01`… (`:165`), vinculados solo al plan ISI (`:194-202`). Las semillas no comparten códigos, así que ningún elemento sembrado queda vinculado a planes de dos carreras. `OE-E2E-01` quedaría en NULL tras el relleno.
- Tests que fijan el comportamiento actual: `gestionar-objetivos.spec.ts`, `gestionar-catalogo.spec.ts`, `gestionar-planes.spec.ts` (`asociar`), `generar-nueva-version.spec.ts:64-81` (repositorio falso), `gestionar-asignaturas.spec.ts`, `politica-de-autorizacion.spec.ts`, `matriz-de-accesos.spec.ts:43,49`, las tres guardias de aislamiento, `catalogo.int.spec.ts` (unicidad, RF038/RF045, nombre `:260`), `objetivos-educacionales.int.spec.ts`, `plan.int.spec.ts:162-228` (asociaciones), `alcance-de-lectura.int.spec.ts` y `asignatura.int.spec.ts`. En la web: `ObjetivosPage.test.tsx`, `CompetenciasPage.test.tsx`, `AsignaturasPage.test.tsx` y `queries.test.tsx`. En E2E: `plan-estudios-correcciones.spec.ts`. `competencias-sin-atributo.spec.ts` y `regresiones.spec.ts` usan `/planes-medicion/:id/competencias` y no se ven afectados por la API; sí dependen de los vínculos sembrados. `accesibilidad.spec.ts` y `alcance-de-lectura.spec.ts` no visitan hoy Objetivos ni Competencias.

## 3. Diseño

### 3.1 Migración: carrera propia

- Columna `carrera_id uuid NULL` en `objetivos_educacionales.objetivos_educacionales` y `plan_estudios.competencias`, con FK a `academico.carreras` `ON DELETE RESTRICT` (una carrera no se borra, se inactiva) y relación Prisma `carrera Carrera?`.
- **Relleno:**
  - Objetivo: carrera de los planes que lo vinculan en `plan_objetivo`.
  - Competencia: carrera de los planes de `plan_competencia` **y** de los planes de las asignaturas que la usan (`asignatura_competencia`), porque los dos son vínculos con un plan.
  - Solo se rellena si el conjunto tiene exactamente una carrera. Un bloque `DO` emite `RAISE NOTICE` con tres recuentos por tabla: rellenadas, ambiguas y sin vínculo.
- **Unicidad:**
  - Índice único `(carrera_id, lower(nombre)) WHERE carrera_id IS NOT NULL`, en SQL crudo, como el índice normalizado de facultades. Es insensible a mayúsculas, igual que `existeNombre`.
  - `existeNombre(nombre, carreraId, idIgnorado?)` pasa a buscar dentro de la carrera.
  - Antes de crear el índice, la migración aborta con un mensaje claro si encuentra duplicados por carrera. No debería haberlos, porque la aplicación exigía unicidad global, pero los scripts escriben con upsert y se saltan esa comprobación.
- **NULL:** PostgreSQL trata cada NULL como distinto, así que el índice no cubre las filas heredadas con `carrera_id` NULL (ver §5). Las filas nuevas nunca quedan en NULL: los casos de uso exigen el plan y copian su carrera, y el DTO no admite otra vía.
- **Código:** no cambia. Sigue siendo el correlativo global `max + 1`.
- **Scripts:** `preparar-e2e.ts` fija la carrera E2E en `CPE-E2E01..05`, `CPE-01` y `OE-E2E-01`. `cargar-plan-isi-2018.ts` fija la carrera ISI en sus `CPE-ISI*` y `OE-*`.

### 3.2 Permisos

- `objetivo.gestionar` y `competencia.gestionar` entran en `PERMISOS_ACOTADOS_A_CARRERA`. Solo afecta al Director, el único que los tiene.
- Cada escritura pasa la carrera:
  - Crear: la del plan.
  - Editar, inactivar/reactivar y el borrado raíz: la de la fila.
  - Eliminar del plan: la del plan.
- Se actualizan `politica-de-autorizacion.spec.ts` (`:118-122`, `:143-156`) y la matriz si su prueba lo exige. En la web, cada `SiPuede` de estos dos permisos recibe `carreraId={plan?.carreraId}`, como ya hace `AsignaturasPage.tsx:123`.

### 3.3 Listar (RF-CH-015, RF-CH-017)

- `GET /objetivos?planId=` y `GET /competencias?planId=` devuelven solo lo vinculado al plan (`planes: { some: { planId } }`). El plan debe existir, y su carrera se comprueba con `AlcanceDeLecturaPort.puedeLeerCarrera`. Fuera de alcance responde 404, como en B3.
- Sin `planId`:
  - Un usuario con `lectura.solo_su_carrera` recibe solo los elementos de su carrera. Con carrera `null` recibe una lista vacía. Esto cierra lo que B3 dejó pendiente.
  - Los demás reciben todo, como hoy. Mejora Continua no cambia.
- `GET :id` aplica la misma regla con la carrera de la fila.
- `GET /competencias/cobertura` acepta también `?planId=` y entonces cubre solo las competencias del plan. `CoberturaIcacit` lo pasa.
- **Dependencia entre módulos para objetivos.** `objetivos-educacionales` no puede importar `plan-estudios`. Se crea en él un puerto propio, `PlanParaObjetivosPort` (`application/ports/plan-para-objetivos.port.ts`), con `planPorId(id): { id, carreraId, editable } | null`. El adaptador vive en `plan-estudios/infrastructure`, que pasa a importar ese puerto: se añade a su guardia (`aislamiento.spec.ts:97-125`) junto a `objetivos-cross-modulo.port.js`. `GestionarObjetivos` recibe además `ALCANCE_DE_LECTURA`, que viene de `auth`, ya permitido.

### 3.4 Crear dentro del plan (RN1 de RF-CH-015 y RF-CH-017)

- `POST /objetivos` y `POST /competencias` exigen `planId` (`@IsUUID()`) en el DTO.
- El plan debe ser editable. Si no, se rechaza con `ReglaDeNegocioViolada`, con el mismo texto que `asociar`.
- En **una transacción** se crea la fila con `carreraId = plan.carreraId` y su vínculo en `plan_objetivo`/`plan_competencia`.
- Para competencias lo resuelve `CompetenciaRepositoryPrisma.crearEnPlan`. Para objetivos, `ObjetivoRepositoryPrisma.crearEnPlan` escribe también `plan_objetivo`; se documenta como excepción deliberada, igual que las de `catalogo.repository.ts:47-60`, porque la transacción no puede partirse entre dos repositorios.
- Los eventos `ObjetivoCreado`/`ElementoCatalogoCreado` añaden el código del plan al detalle.

### 3.5 Eliminar del plan (RF-CH-016, RF-CH-018)

- `DELETE /planes/:planId/objetivos/:id` (controlador en `objetivos-educacionales`) y `DELETE /planes/:planId/competencias/:id` (en `plan-estudios`) responden 204.
- **Orden de comprobación:**
  1. El plan existe y entra en el alcance (404 si no).
  2. Permiso acotado a la carrera del plan.
  3. El plan es editable (si no, `ReglaDeNegocioViolada`).
  4. El elemento está vinculado al plan (404 si no).
  5. Uso:
     - Competencia usada por asignaturas **de este plan**: se bloquea con sus códigos, p. ej. «La usan ASUC01110, ASUC01112. Quítala de esas asignaturas primero».
     - Uso en Mejora Continua según el puerto de §3.7: se bloquea con sus `motivos`, **pero solo si, al quitar el vínculo, ya no quedaría ningún otro plan que lo vincule y por tanto habría que borrar la fila** (decisión 4). Si otro plan, por ejemplo el Vigente, conserva el vínculo, el elemento se quita de este plan sin consultar a Mejora Continua.
  6. Se quita el vínculo. Si ya no queda ningún `plan_objetivo`/`plan_competencia` ni `asignatura_competencia`, se borra la fila en la misma transacción. `competencia_atributo` cae en cascada.
- **Auditoría:**
  - Eventos nuevos `ObjetivoQuitadoDelPlan` (`eventos-objetivo.ts`) y `CompetenciaQuitadaDelPlan` (`eventos-catalogo.ts`), con el código del elemento y del plan.
  - Si además se borra la fila, se publica el `ObjetivoEliminado` o `ElementoCatalogoEliminado` de hoy, antes de borrar.
  - Se invalida el detalle del plan.
- El `DELETE /objetivos/:id` y `DELETE /competencias/:id` de raíz (RF038, RF045) se conservan para los registros sin ningún vínculo, autorizados contra la carrera de la fila.

### 3.6 Eliminar asignatura (RF-CH-019)

- `DELETE /asignaturas/:id` (nuevo, en `asignaturas.controller.ts`) llama a `GestionarAsignaturas.eliminar`:
  1. `exigirPlanEditable`: permiso acotado y Borrador o En revisión.
  2. Si otras asignaturas la tienen como requisito, se bloquea con sus códigos. Se reutiliza la consulta de `impactoDeInactivar`, porque `Dependencia` las borraría en cascada sin avisar.
  3. Si `ElementoCurricularEnUsoPort.asignaturaEnUso` dice que está en uso, se bloquea con sus motivos.
  4. Se publica `AsignaturaEliminada` (nuevo, en `eventos-asignatura-crud.ts`, con código y nombre) y después se borra. Caen en cascada sus `asignatura_competencia` y sus propios prerrequisitos.
- El comentario de RF052 RN1 se matiza: inactivar sigue sin borrar; borrar es la vía nueva de RF-CH-019.

### 3.7 Puertos «en uso» hacia Mejora Continua

- `plan-estudios/application/ports/elemento-curricular-en-uso.port.ts`: `competenciaEnUso(id)` y `asignaturaEnUso(id)`, cada uno con `{ enUso, motivos }`, igual que `UsoDeDocente`.
- `objetivos-educacionales/application/ports/objetivo-en-uso.port.ts`: `objetivoEnUso(id)`. Es un puerto aparte porque los objetivos no viven en `plan-estudios`.
- Adaptador único en `mejora-continua/infrastructure/persistence/elemento-curricular-en-uso.adapter.ts`, modelado sobre `DocenteEnUsoAdapter`. Cuenta exactamente:
  - **Competencia:** `competenciaDelPlan`, `programacion`, `configuracionCompetencia` y `medicionAlcanzada` por `competenciaId`, y `planMejora` por `competenciaId`.
  - **Objetivo:** `planMejora` por `objetivoEducacionalId`.
  - **Asignatura:** `asignaturaEvaluada` por `asignaturaId`.
- **Guardias:** `mejora-continua/aislamiento.spec.ts` añade `ports/elemento-curricular-en-uso.port.js` a `PUERTO_PERMITIDO` y `ports/objetivo-en-uso.port.js` a su lista de `objetivos-educacionales`.

### 3.8 Nueva versión

- `copiarContenido` copia, en la misma transacción y **antes** del `return` de `:156`, los `plan_objetivo` y `plan_competencia` del origen al plan nuevo.
- Los elementos son los mismos registros, de la misma carrera, compartidos entre versiones. Así desaparece el «fuera del plan» que dejaba 4a tras generar versión.
- **Pruebas:**
  - Integración en `plan.int.spec.ts`: la versión nueva trae los mismos objetivos y competencias, y también cuando el origen no tiene asignaturas.
  - Unitaria en `generar-nueva-version.spec.ts`.

### 3.9 `PUT /planes/:id/asociaciones`

- La web deja de usarlo.
- Tal como está permitiría vincular elementos de otra carrera y quitar vínculos sin las comprobaciones de §3.5. **Se retira**: endpoint, `GestionarPlanes.asociar`, `asociarObjetivos`/`asociarCompetencias` del puerto y del repositorio, y `asociarAlPlan`/`useAsociarAlPlan` de la web.
- Sus pruebas (`plan.int.spec.ts:162-228`, `gestionar-planes.spec.ts`) se reescriben sobre §3.4, §3.5 y §3.8.

### 3.10 Web

- **`ObjetivosPage` y `CompetenciasPage`:**
  - Usan `useObjetivos(planId)`/`useCompetencias(planId)`, con clave `['objetivos', planId]`.
  - Desaparecen las casillas de asociación.
  - Con la lista vacía muestran el aviso y el botón «Nuevo».
  - «Nuevo» solo aparece con el permiso sobre la carrera del plan y con el plan editable, y envía `planId`.
- **«Eliminar» con confirmación** en Objetivos, Competencias y Asignaturas:
  - Solo con el permiso sobre `plan.carreraId` y el plan editable.
  - El modal sigue el patrón de `PlanEstudiosPage.tsx:651-670`.
  - Si el servidor rechaza, se muestra el motivo con el `setError` + `mutateAsync().catch` que añadió 4a (`151003d`).
  - El texto del modal avisa de que el registro se borra del todo si ningún otro plan lo usa.
- **Invalidaciones:** las mutaciones invalidan el prefijo `['objetivos']` o `['competencias']`, `claves.plan(planId)` y `['asignaturas', planId]`.
- **`AsignaturasPage.tsx:69`** pasa a `useCompetencias(planId)`.
- **Mejora Continua** sigue llamando sin `planId`.

### 3.11 Pruebas

- **Unitarias:** `gestionar-objetivos.spec.ts`, `gestionar-catalogo.spec.ts` y `gestionar-asignaturas.spec.ts`, con un caso por cada bloqueo y por cada rama de borrar o conservar el registro, y los eventos. También `politica-de-autorizacion.spec.ts` y las tres guardias de aislamiento.
- **Integración:** `catalogo.int.spec.ts` (unicidad por carrera, la misma en dos carreras distintas), `objetivos-educacionales.int.spec.ts`, `plan.int.spec.ts`, `alcance-de-lectura.int.spec.ts` (Director: `planId` ajeno da 404; sin `planId` solo ve su carrera), `asignatura.int.spec.ts` y el adaptador «en uso». Una prueba de la migración: relleno, ambiguo y sin vínculo.
- **Web:** `ObjetivosPage.test.tsx`, `CompetenciasPage.test.tsx`, `AsignaturasPage.test.tsx` y `queries.test.tsx`.
- **E2E:**
  - `plan-estudios-correcciones.spec.ts` deja PUT `/asociaciones` y POST sin plan. La competencia «fuera del plan» se obtiene quitando `CPE-E2E02` del borrador: el Vigente la conserva.
  - Un recorrido nuevo de crear, eliminar y bloqueo por uso.
  - Casos nuevos en `alcance-de-lectura.spec.ts` y `accesibilidad.spec.ts` (Objetivos y Competencias con el modal de eliminar abierto).
  - Comprobar que `competencias-sin-atributo.spec.ts` y `regresiones.spec.ts` siguen en verde tras cambiar los scripts de siembra.

## 4. Orden de implementación sugerido

1. Migración `carrera_id` con relleno e índice, y scripts de siembra.
2. Permisos acotados y carrera en editar, inactivar y borrado raíz.
3. Puertos «en uso», adaptador de Mejora Continua y guardias.
4. `copiarContenido` copia los vínculos (independiente; puede ir primero).
5. Competencias: listar por plan y alcance, crear en plan, eliminar del plan y cobertura por plan.
6. Objetivos: `PlanParaObjetivosPort` con su adaptador, y lo mismo que el punto 5.
7. Eliminar asignatura.
8. Retirar `PUT /asociaciones`.
9. Web de Objetivos y Competencias.
10. Web de Asignaturas (Eliminar).
11. E2E y accesibilidad.

Son 11 tareas en un solo plan. Si hiciera falta partirlo, el corte natural es 4b-1 (pasos 1-4 y 7, backend sin cambio visible salvo borrar asignaturas) y 4b-2 (pasos 5, 6 y 8-11).

## 5. Riesgos y puntos abiertos

- **Resuelto (decisión 4): el bloqueo por Mejora Continua solo aplica cuando se va a borrar el registro.** Se conserva el razonamiento original: un plan de medición solo existe sobre planes Aprobados o Vigentes (`gestionar-planes-medicion.use-case.ts:86-91`), así que un plan en Borrador o En revisión nunca tiene datos de Mejora Continua propios. Con la regla literal, en una versión nueva no se podría quitar ninguna competencia que se mida en el plan Vigente, aunque el registro no se borre y el Vigente no cambie. Por eso §3.5 aplica la comprobación de Mejora Continua solo cuando el registro se vaya a borrar (ningún otro plan lo vincula).
- **Los objetivos no viven en `plan-estudios`.** El diseño aprobado ponía el puerto «en uso» en `plan-estudios/application/ports`. Hacen falta dos puertos (§3.7), uno nuevo hacia `plan-estudios` (`PlanParaObjetivosPort`, §3.3), ampliar dos guardias de aislamiento y que el repositorio de objetivos escriba `plan_objetivo` como excepción declarada (§3.4).
- **Filas heredadas con carrera NULL** (por ejemplo `OE-E2E-01`). Con el permiso acotado, `puede()` deniega con carrera `null` (`politica-de-autorizacion.ts:100-107`): nadie podrá editarlas, inactivarlas ni borrarlas, y el Director no las verá en el listado sin plan. Además, el índice parcial no las cubre: una fila nueva puede repetir el nombre de una heredada, y dos heredadas podrían repetirse entre sí (hoy no ocurre, por la comprobación global). Hay que decidir si se acepta o si se ofrece asignarles carrera más adelante.
- **Premisa rota en el esquema:** «en `plan_estudios` nada se borra físicamente» (`schema.prisma:757-761`). Los ids sin FK de Mejora Continua quedan protegidos solo por el puerto «en uso». Hay que actualizar ese comentario.
- **Códigos reutilizados:** borrar el objetivo o la competencia con el número más alto deja que el siguiente reciba el mismo código (`max + 1`), y en la bitácora habría dos elementos distintos con el mismo código. Aceptable o no, hay que decidirlo.
- **Huérfanos al borrar un plan en Borrador (RF032):** `plan_objetivo`/`plan_competencia` caen en cascada (`schema.prisma:486,499`) y los elementos creados solo en ese plan quedan sin vínculo, con su carrera. Solo se pueden borrar por la vía raíz.
- **Relleno de competencias:** cuenta también los vínculos por `asignatura_competencia`. Es una interpretación de «desde sus vínculos con planes».
- **`cargar-plan-isi-2018.ts`** hace upsert de `OE-01`… por código. Si alguien creó antes un `OE-01` desde la interfaz en otra carrera, el script lo sobrescribiría y le pondría la carrera ISI. Ya pasaba antes, pero ahora además cambia la carrera.
- **Prerrequisitos no copiados en versión nueva** (`copiarContenido`): no se copian hoy y no entra en este bloque, pero conviene registrarlo.
- **Tests de integración:** hacen `TRUNCATE` y solo se corren contra `sgc_test`. El E2E requiere `npm run e2e:preparar` y apagar el worker al terminar. `plan-mejora.int.spec.ts` ya falla en `main` y no pertenece a este bloque.
