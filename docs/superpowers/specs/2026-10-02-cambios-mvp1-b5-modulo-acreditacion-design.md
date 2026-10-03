# Cambios MVP1 — Bloque 5: Módulo de Acreditación, con atributos y criterios por carrera

## 1. Alcance

- Bloque 5 de 10 de la iniciativa "Cambios y observaciones MVP1". Fuente: `Requerimientos_de_Cambios_y_Observaciones - MVP1.md`, §5.
- **Cubre:**
  - RF-CH-026: Acreditación pasa a ser un módulo independiente de Plan de Estudios (en la API; la web ya está separada).
  - RF-CH-027 y RF-CH-030: al crear un atributo o un criterio, queda asociado a la carrera del usuario, sin selector.
  - RF-CH-028 y RF-CH-031: los listados muestran solo lo de la carrera; la URL directa de otra carrera se rechaza.
  - RF-CH-029 y RF-CH-032: eliminar atributos y criterios, con validación de integridad referencial.
- **Depende de:** Bloque 1 (la matriz de accesos: el Coordinador es quien opera Acreditación) y Bloque 3 (`AlcanceDeLecturaPort`).
- **No cubre:**
  - RF-CH-047 (el selector de criterios vacío en «Nuevo Plan de Mejora»): es del Bloque 6. Este bloque deja los criterios por carrera listos para él.
  - Los planes de Mejora Continua (RF-CH-033 a 050): Bloque 6.

### Decisiones tomadas con el usuario (2 de octubre de 2026)

1. **Los atributos pasan a tener carrera propia, y los 11 ICACIT sembrados se copian a cada carrera existente.** Cada carrera puede editarlos, inactivarlos o eliminarlos sin afectar a otra.
2. **Una carrera nueva empieza sin atributos.** Quien la gestiona crea los que necesite.
3. **Eliminar bloquea si el registro está en uso**, y explica el motivo.
4. **Un solo módulo `acreditacion` en la API**, que absorbe los criterios.

## 2. Estado actual (verificado en código)

- **Atributos** (`atributos-graduado`, módulo propio): `AtributoGraduado` no tiene `carreraId`; la unicidad es `@@unique([marco, codigo])` (`schema.prisma:401`). Todo el módulo filtra por `marco = 'ICACIT'` (`MARCO_VIGENTE`, `gestionar-atributos.use-case.ts:36`). Los permisos se piden siempre con `carreraId = null`. Se vinculan a competencias (`competencia_atributo`, `onDelete: Cascade`) y a planes (`plan_atributo`, `onDelete: Restrict`, RF122). No existe «eliminar»: solo inactivar (RF123), y el impacto de inactivar solo informa.
- **Criterios** (dentro de `plan-estudios`): ya tienen `carreraId` y unicidad `(carreraId, codigo)`. La carrera llega por la URL (`/carreras/:carreraId/criterios`), y la pantalla se la pide al usuario con un selector (`CriteriosPage.tsx:79-90`). No existe «eliminar». Mejora Continua los referencia con `planes_mejora.criterio_acreditacion_id`, **sin clave foránea**; `ImpactoPlanMejoraPort.contarVinculados` ya los cuenta.
- **Permisos** (`matriz-de-accesos.ts`): `atributo.leer/gestionar` y `criterio.acceder/leer/gestionar`, con módulo `plan-estudios`. **Solo el Coordinador gestiona**; el Consultor lee (`atributo.leer`, `criterio.leer`, `criterio.acceder`); el Docente solo `criterio.leer`; ni el Administrador ni el Director tienen estos permisos.
- **Política de autorización:** `PERMISOS_ACOTADOS_A_CARRERA` exige que el actor tenga carrera y que sea la del recurso (`politica-de-autorizacion.ts:94-129`). Un permiso acotado sobre un recurso sin carrera se deniega.
- **Consumidores de los atributos, todos asumen que son globales** (filtran por marco):
  - `GestionarCompetencias.atributos` y `cobertura` (`gestionar-catalogo.use-case.ts:121,135-149`), y `catalogo.repository.ts` (`cobertura`, `atributos`, `crearEnPlan`, `actualizar`). `crear` y `editar` competencia reciben `atributoIds` sin validar marco ni carrera.
  - `reportes.repository.ts:184-211` (`atributosSinCubrir`, `totalAtributos`): panel institucional.
  - `contenido-curricular.adapter.ts:100-126`, `datos-documento.repository.ts` y `armar-documentos.ts` leen los atributos **a través de las competencias**; no cambian.
  - Mejora Continua solo alcanza los atributos por las competencias (`agrupar-por-atributo.ts`; RF127 en `configurar-plan-medicion.use-case.ts:104-111`). Ninguna tabla suya guarda `atributoId`.
  - Scripts: `prisma/seed.ts:111-117` siembra los 11 globales; `cargar-plan-isi-2018.ts` y `preparar-e2e.ts` los leen por `marco`.
- **Crear carrera** (`gestionar-carreras.use-case.ts:79-104`) no siembra nada. Es lo que fija la decisión 2.
- **Carrera de la sesión:** `AuthorizationPort.carreraACargoDe` y `AlcanceDeLecturaPort` (`TODAS` o `CARRERA`).

## 3. Diseño

### 3.1 Migración: atributos con carrera

Una migración Prisma nueva, escrita a mano en SQL y con pruebas sobre ese SQL (como la del 4b):

1. `atributos_graduado` gana `carrera_id uuid` (nullable al inicio) con FK `RESTRICT` a `academico.carreras`.
2. Por cada carrera existente se **insertan copias** de los atributos globales (mismo marco, código, nombre, orden y estado).
3. `competencia_atributo` se remapea: cada vínculo pasa a la copia, en la carrera de la competencia (`competencias.carrera_id`), con el mismo código. Una competencia **sin carrera** (heredada, ver 4b) no se puede remapear sin adivinar: su vínculo se elimina y la migración emite un `NOTICE` con cuántos y de qué competencias.
4. `plan_atributo` se remapea igual, por la carrera del plan (siempre existe).
5. Se borran los atributos globales originales (los que siguen con `carrera_id` nulo) y la columna pasa a `NOT NULL`.
6. Se reemplaza `@@unique([marco, codigo])` por `(carrera_id, marco, codigo)` y se añade `@@index([carreraId])`. El `schema.prisma` lo refleja; sin `prisma format` (realinea líneas ajenas).

`criterios_acreditacion` no cambia. La migración va en una sola transacción.

### 3.2 Un módulo `acreditacion` en la API (RF-CH-026)

- Se renombra `modules/atributos-graduado` a `modules/acreditacion`.
- Los criterios se mueven ahí desde `plan-estudios`: `gestionar-criterios.use-case.ts`, `criterio.repository.ts`, `acreditacion.controller.ts`, sus DTO y puertos. La estructura sigue `domain/application/infrastructure`.
- El puerto hacia Mejora Continua (`AcreditacionPort`, hoy en `plan-estudios/application/ports/acreditacion-cross-modulo.port.ts`) pasa a vivir en `acreditacion`, con su adaptador. `mejora-continua` importa solo ese puerto de `acreditacion`.
- `acreditacion` conoce el plan solo por un puerto propio, `PlanParaAcreditacionPort` (id, carrera), que implementa `plan-estudios`: mismo patrón que `PlanParaObjetivosPort` del 4b. RN2 de RF-CH-026 (depende de Carrera y Plan de Estudios) se cumple por puerto, no por importación directa.
- Las guardias de aislamiento se actualizan y se amplían exactamente así, con control positivo: `acreditacion` no importa nada de `plan-estudios` ni de `mejora-continua`; `plan-estudios` y `mejora-continua` pueden importar de `acreditacion` solo los puertos indicados.
- Los permisos `atributo.*` y `criterio.*` cambian su módulo a `acreditacion` en `matriz-de-accesos.ts`. Es solo agrupación; quién tiene qué no cambia.
- Los datos se conservan (RN1 de RF-CH-026): ninguna tabla se mueve de esquema. El módulo `plan-estudios` sigue leyendo `atributos_graduado` y `competencia_atributo` desde su repositorio de catálogo, como excepción ya declarada (`catalogo.repository.ts:47-60`); esa excepción se actualiza.
- La carpeta, los imports, las pruebas y el cableado de `app.module.ts` se mueven **antes** de cambiar comportamiento (§4, tarea 2), para que ese commit sea un refactor puro con la suite en verde.

### 3.3 Permisos y alcance (RF-CH-027, 028, 030, 031)

- `atributo.gestionar` y `criterio.gestionar` entran en `PERMISOS_ACOTADOS_A_CARRERA`. Como solo el Coordinador los tiene, y la política exige una carrera asignada, **un Administrador sin carrera no podría gestionar aunque se le diera el permiso**: es la misma consecuencia que ya tienen las acotadas del 4b y se acepta.
- Rutas por carrera, simétricas para los dos recursos:
  - `GET /carreras/:carreraId/atributos` y `POST /carreras/:carreraId/atributos` (nuevas; sustituyen a `GET`/`POST /atributos`, que se retiran).
  - `GET`/`POST /carreras/:carreraId/criterios` (ya existen).
  - Siguen por id: `GET`, `PATCH /:id`, `GET /:id/impacto-inactivacion`, `PATCH /:id/estado`, para ambos.
- La carrera la envía la web desde la sesión; la API la **valida** con el alcance y con el permiso acotado (el Coordinador solo opera sobre la suya). Así «asociación automática» no depende de que la web se porte bien.
- **Orden de comprobación** (el mismo del 4b): (1) permiso de lectura, `AccesoDenegado`; (2) existencia y alcance de lectura de la carrera del recurso: inexistente o fuera de alcance, `NoEncontrado` 404, nunca 403; (3) permiso de gestión acotado, 403; (4) reglas de negocio, 409.
- RN1 de RF-CH-028 y RF-CH-031 dice «acceso denegado» por URL directa a otra carrera. Se responde **404**, como en el 4b y RF-CH-009, para no revelar si el recurso existe.
- **Listar:** respeta el alcance de lectura (`TODAS` o `CARRERA`). Un usuario con alcance de carrera solo lista la suya; si pide otra, 404. Una carrera sin atributos o sin criterios devuelve lista vacía (flujo alterno de los dos RF).
- **Unicidad:** el código de un atributo es único por `(carrera, marco)` en crear y editar. El orden (`ultimoOrden + 1`) también es por carrera.
- `MARCO_VIGENTE` se mantiene (un solo marco hoy), pero deja de ser la clave de lectura: todo filtra por carrera y marco.
- **Atributos del plan (RF122):** `PUT /planes/:planId/atributos` valida, por `PlanParaAcreditacionPort`, que cada atributo declarado pertenezca a la carrera del plan; si no, 409.

### 3.4 Eliminar atributos y criterios (RF-CH-029, 032)

- Endpoints nuevos: `DELETE /atributos/:id` y `DELETE /criterios/:id`. Reutilizan `atributo.gestionar` y `criterio.gestionar` (acotados); sus descripciones pasan a decir «crear, editar, inactivar y eliminar». No se crean permisos nuevos.
- Es borrado físico. Cada eliminación publica un evento de auditoría con el código y el nombre (`AtributoEliminado`, `CriterioEliminado`; `entidad` añadida a la lista de `domain-event.ts`).
- **En uso, atributo:** tiene al menos una competencia vinculada (`competencia_atributo`) o lo adopta algún plan (`plan_atributo`, RF122). Mejora Continua solo llega a los atributos por las competencias, así que ese conteo ya la cubre.
- **En uso, criterio:** lo referencia al menos un plan de mejora de cualquier estado (`ImpactoPlanMejoraPort.contarVinculados('CRITERIO_ACREDITACION', id)`). No tiene clave foránea, así que esta comprobación es la única defensa.
- Si está en uso: 409 con el motivo («lo usan 3 competencias», «lo referencian 2 planes de mejora») **y la sugerencia de inactivarlo** (RF123 y RF132), como piden los flujos alternativos.
- Las dos comprobaciones y el borrado van en una transacción. La comprobación de Mejora Continua para criterios es previa y no transaccional (no hay FK que la proteja): una carrera crítica entre «crear plan de mejora con el criterio» y «eliminar el criterio» es posible y se acepta, porque el borrado se hace por un Coordinador sobre su propio catálogo.

### 3.5 Consumidores en Plan de Estudios

- `GestionarCompetencias.atributos(actor)` y el `GET /competencias/atributos`: devuelven los atributos de la carrera. Con `planId`, la del plan; sin él, la del alcance `CARRERA`; con alcance `TODAS` sin plan, los de todas las carreras, y cada fila lleva `carreraId`.
- `cobertura` hace lo mismo con los atributos. Hoy el alcance `CARRERA` filtra solo las competencias (`gestionar-catalogo.use-case.ts:135-149`); ahora filtra también los atributos. Reutiliza la forma del arreglo I-2 del 4b.
- `crear` y `editar` competencia validan que cada `atributoId` pertenezca a la **carrera de la competencia** (la del plan, en `crear`). Una competencia heredada sin carrera ya no se puede editar desde el 4b, así que el caso no se abre.
- El panel de reportes (`reportes.repository.ts:157-211`) cuenta `atributosSinCubrir` y `totalAtributos` por el alcance de lectura, como la cobertura; sin eso mostraría 11 × número de carreras.
- Documentos (`armar-documentos.ts`, `datos-documento.repository.ts`), el adaptador de contenido curricular y la agrupación de Mejora Continua **no cambian**: leen los atributos a través de la competencia.

### 3.6 Web

- `features/acreditacion` se queda como está en rutas y menú. `AtributosPage` y `CriteriosPage` usan la carrera de la sesión cuando el usuario tiene una asignada y **no muestran selector**. El selector solo aparece para quien lee con alcance global (el Consultor). El plan de implementación comprueba cómo la web obtiene la carrera de la sesión (la vista de inicio del Director ya la necesita).
- `useAtributos` pasa a recibir la carrera, con su clave de caché; los criterios ya la reciben.
- Botón «Eliminar» en cada fila, con confirmación y, en el rechazo, el motivo del servidor y la sugerencia de inactivar. Solo se pinta con `atributo.gestionar` o `criterio.gestionar` sobre la carrera (`SiPuede`).
- Las listas que alimentan al selector de atributos de `CompetenciasPage` y a `CoberturaIcacit` ya piden por plan; solo cambia lo que devuelve la API.
- `useCriterios` en `ModalNuevoPlanMejora` ya recibe la carrera por prop y no cambia aquí (RF-CH-047 es del Bloque 6).

### 3.7 Scripts y datos de partida

- `prisma/seed.ts` deja de sembrar los 11 atributos globales. El catálogo ICACIT queda como constante (`ATRIBUTOS_ICACIT`) que usan las siembras de desarrollo y e2e para dar a una carrera sus atributos.
- `cargar-plan-isi-2018.ts` y `preparar-e2e.ts` siembran los atributos de la carrera que crean y buscan por `(carreraId, marco, codigo)`. Los `upsert` por código global desaparecen, lo que de paso cierra el minor del 4b que los señalaba.
- En producción no hay siembra nueva: la migración copia los atributos existentes a cada carrera, y las carreras creadas después empiezan vacías (decisión 2).

### 3.8 Pruebas

- Unitarias: política (los dos permisos acotados), casos de uso de atributos y de criterios (alcance, 404 vs 403, unicidad por carrera, eliminar con y sin uso, el orden de comprobación), y la validación de atributos en competencias y en `declararEnPlan`.
- Integración sobre PostgreSQL: la migración sobre su SQL real (copia a cada carrera, remapeo de competencias y planes, competencia sin carrera pierde el vínculo con `NOTICE`, índice único por carrera, borrado de los globales); repositorios; alcance con un Coordinador real y uno de otra carrera; borrado bloqueado por competencia, por plan y por plan de mejora.
- Guardias de aislamiento de `acreditacion`, `plan-estudios` y `mejora-continua`, con control positivo.
- Web: eliminar con confirmación y rechazo, sin selector para el Coordinador.
- e2e y `axe`: flujo del Coordinador (crear, listar, eliminar un atributo y un criterio, bloqueo por uso) y el modal de eliminar.

## 4. Orden de implementación sugerido

1. **Migración** de atributos por carrera, con su prueba (§3.1).
2. **Reubicar** el módulo y mover los criterios, sin cambiar comportamiento; guardias y cableado (§3.2).
3. **Atributos por carrera** en la API: rutas, alcance, unicidad, `declararEnPlan` (§3.3).
4. **Criterios por carrera:** el mismo alcance y orden de comprobación sobre lo que ya existe (§3.3).
5. **Eliminar** atributos y criterios (§3.4).
6. **Consumidores** en Plan de Estudios: competencias, cobertura y reportes (§3.5).
7. **Web** de acreditación y consumidores (§3.6).
8. **Siembras, e2e y `axe`** (§3.7 y §3.8).

## 5. Riesgos y puntos abiertos

- **Divergencia nueva (D-15, pendiente de ratificar): el borrado es más estricto que el documento.** RN1 de RF-CH-029 bloquea solo si el atributo lo usa una competencia que está en planes de medición, evaluación o mejora **activos**; RN1 de RF-CH-032, solo si un plan de mejora **activo** referencia el criterio. Este diseño bloquea ante **cualquier** vínculo (competencia mapeada, plan de estudios que lo adopta, plan de mejora de cualquier estado). Motivo: el documento permitiría borrar un atributo con competencias mapeadas pero sin uso en Mejora Continua, lo que dejaría esas competencias sin atributo y violaría RF127 sin aviso, y un criterio referenciado por un plan de mejora histórico quedaría colgando porque no hay clave foránea. Coste si se afloja: un caso de uso con dos condiciones menos y sus pruebas.
- **Carrera nueva sin atributos (decisión 2):** hasta que se creen, ninguna de sus competencias puede mapearse y RF127 impide incluirlas en un plan de medición. Es una consecuencia aceptada, no un fallo. Si molesta en la práctica, sembrar los 11 al crear una carrera es un cambio acotado.
- **Competencias heredadas sin carrera pierden su vínculo con atributos** en la migración, porque no se puede elegir una carrera sin adivinar. Son las mismas filas que el 4b ya dejó sin gestor. El `NOTICE` dice cuántas son.
- **Un Administrador sin carrera no puede gestionar** atributos ni criterios aunque tuviera el permiso: consecuencia de la política acotada, igual que en el 4b. Hoy ningún rol lo necesita.
- **Atributos de otro marco** (SINEACE, SUNEDU): siguen cabiendo, porque la unicidad es `(carrera, marco, código)`. La web y la API solo operan con `ICACIT` mientras `MARCO_VIGENTE` siga siendo una constante.
- **Criterios referenciados sin FK:** la integridad al borrar depende de la comprobación de Mejora Continua y no está respaldada por la base (§3.4). Añadir la FK queda fuera de este bloque.
- **Ámbito del panel de reportes:** acotarlo por alcance cambia las cifras que hoy ve un usuario con alcance de carrera. Es el efecto buscado, pero hay que revisarlo con la persona que usa el panel.
- **Tests de integración:** hacen `TRUNCATE` y solo corren contra `sgc_test`. El e2e requiere `npm run e2e:preparar` y apagar el worker al terminar. `plan-mejora.int.spec.ts` ya falla en `main` (7 tests) y no pertenece a este bloque.
