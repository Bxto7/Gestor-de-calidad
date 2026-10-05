# Bloque 6b — Planes de Mejora por carrera, ciclo propio y responsables (RF-CH-040 a 047)

Parte 2 de 3 del Bloque 6 de «Cambios y Observaciones MVP1» (Mejora Continua). Fuente: `D:\Descargas\Requerimientos_de_Cambios_y_Observaciones - MVP1.md`, §6 (RF-CH-040 a 047) y §7 (puntos pendientes). El 6a ya está en `main` (3603225).

## 1. Alcance

**Entra (6b):**

- RF-CH-040 / RF-CH-041: un plan de Mejora queda asociado automáticamente a la carrera de la sesión; el listado muestra solo los de la carrera del usuario; la URL directa a un plan de otra carrera se deniega. El Docente ve **todos** los planes de su carrera.
- RF-CH-042: se pueden eliminar planes en **Borrador o En revisión** (hoy solo Borrador), con bloqueo si están en una acta o tienen versiones derivadas.
- RF-CH-043 / RF-CH-044: ciclo propio de Mejora `Borrador → En revisión → Aprobado` (observar vuelve a Borrador); el seguimiento (evidencias, retroalimentación, estado de implementación) se edita en Aprobado.
- RF-CH-045 / RF-CH-046: «Responsable» pasa de texto libre a selector de docentes activos de la carrera. Alcanza también a Evaluación (docente evaluador de RF-PE-018 y responsable de la competencia indirecta de RF-PE-024).
- RF-CH-047: el selector de criterios de «Nuevo plan» usa los criterios de la carrera (Bloque 5); se verifica y se protege con prueba.

**No entra:**

- Planes de Medición y Evaluación por carrera (RF-CH-033 a 039): ya hecho en el 6a.
- Actas de Aprobación (RF-CH-048 a 050): **6c**. Solo se tocan en lo que cambia la definición de «plan vigente» (§6).
- Cambios en la máquina de estados de Medición y Evaluación: no se tocan.

## 2. Decisiones tomadas

| # | Decisión | Por qué |
|---|---|---|
| 1 | El Docente ve **todos** los planes de mejora de **su** carrera, no solo aquellos donde es Responsable. | Es el texto literal de RF-CH-041. Recibe la marca `lectura.solo_su_carrera`; de paso se corrige que hoy lea Evaluación de otras carreras. |
| 2 | Responsable de competencia en Evaluación Indirecta (RF-PE-024): **solo docentes activos de la carrera** (RF-CH-046). | Hoy acepta cualquier rol (el comentario del esquema dice «suele ser coordinador»). Lo ya guardado no se rompe: el id no tiene FK y se sigue mostrando. |
| 3 | Con varias versiones aprobadas de un linaje, cuenta como vigente **la última aprobada del linaje**, calculada, sin estado nuevo. | Es una aprobada que no tiene otra aprobada derivada de ella. Actas y resumen de carrera solo cuentan esa. Evita inventar un estado que habría que mantener. |
| 4 | Máquina de estados **propia** de Mejora; Medición y Evaluación no se tocan. | Mejora reusa hoy el `estado-plan.ts` compartido (5 estados, `marcar-vigente`, `archivar`). El documento fija 3 estados para Mejora. |
| 5 | `responsableId` nullable **sin FK**, conservando el texto como nombre mostrado. | Mismo patrón que `docenteId` de `AsignaturaEvaluada`. Los planes viejos siguen legibles hasta que se editen. |

## 3. Carrera y alcance (RF-CH-040, 041)

Se aplica el patrón del 6a (`alcance-de-planes.ts`: `carreraImpuesta`, `exigirPlanLegible`, `carreraDeLaSesion`; `AlcanceDeLecturaPort` como último parámetro).

- **Alta:** toma la carrera de la sesión (`AuthorizationPort.carreraACargoDe`); el cliente no la envía. Si el plan base (competencia o plan de evaluación de origen) es de otra carrera → 409.
- **Listado:** la carrera la impone el servidor. Hoy `FiltroMejora.carreraId` llega por query: se **elimina**.
- **404 por id** en todas las operaciones, incluidos `GenerarDocumentoMejora` y `ConsultarDocumento`, y en los dos huecos que dejó el 6a: `GestionarPlanesMejora.resolverBaseCompetencia` (~:588-620) y `porcentajeAnteriorDeCompetencia` (~:457-474).
- **Docente:** recibe `lectura.solo_su_carrera` en `matriz-de-accesos.ts`.
- **Web:** se quita el selector de carrera de `PlanesMejoraPage` (hoy `carreraId = elegida || primera carrera`). Si el usuario no tiene carrera, aviso en lugar del formulario.
- **Orden de comprobación** en cada operación sobre un plan existente, igual que el 6a: permiso de lectura → 403; existencia y alcance → **404**; permiso de escritura acotado a la carrera del plan → 403; reglas de negocio → 409.

## 4. Ciclo de vida propio (RF-CH-043, 044)

- Nuevo módulo de dominio con la máquina de Mejora (p. ej. `estado-plan-mejora.ts`): `Borrador → En revisión → Aprobado`; observar (`En revisión → Borrador`). Sin `Vigente` ni `Histórico`.
- El enum Prisma `EstadoMedicion` se **conserva** (lo comparten Medición y Evaluación).
- **Migración SQL** a mano, en una transacción: `UPDATE planes_mejora SET estado = 'APROBADO'` donde el estado sea `VIGENTE` o `HISTORICO` (RN2 del documento ya lo dice). Una prueba de integración ejecuta el SQL real sobre datos de partida.
- **Seguimiento** (evidencias, retroalimentación, `estadoImplementacion`): editable en Aprobado (antes Vigente), bloqueado en Borrador y En revisión.
- **Nueva versión:** se genera desde un plan Aprobado y nace en Borrador.
- Se corrigen los textos y acciones de la web que hoy hablan de «marcar vigente» y «archivar» para Mejora.

## 5. Eliminar (RF-CH-042)

- `permiteEliminacionDeMejora` (vive aparte en `estado-plan.ts` desde el 6a) admite Borrador y En revisión.
- Bloqueos con 409 y motivo concreto: estado distinto (nombra el actual); plan incluido en alguna acta (`AccionActa.planMejoraId`); plan con versiones derivadas.
- Borrado **transaccional con `FOR UPDATE`**, re-chequeando el estado con la fila bloqueada. Resultado `{eliminado | no-existe | en-uso | estado-no-permite}`; `no-existe` responde 404.
- El evento de auditoría se publica **después** de borrar (lección del commit 7c4c207: la bitácora es append-only y no puede registrar un borrado que no ocurrió).
- Mensajes en español, como el 6a. Se reutiliza `ConfirmarEliminacion` de `shared/components/`.

## 6. Cambios derivados de la definición de «vigente»

- `gestionar-actas.use-case.ts:282`: `ESTADOS_ELEGIBLES = ['Aprobado','Vigente']` pasa a «la última aprobada del linaje».
- `resumen-carrera.repository.ts` (~:76-81): hoy usa «estado distinto de HISTORICO» y derivados; pasa a la misma regla.
- `estado-acta.ts`: se corrige el comentario que menciona Vigente.
- La regla vive en un solo lugar de dominio (función pura sobre el linaje) y los tres consumidores la llaman; no se duplica.

## 7. Responsable (RF-CH-045, 046)

- `DirectorioDeUsuariosPort` (auth, `directorio-usuarios.port.ts`) hoy solo tiene `nombresDe` y `porRol(codigoRol)` (activas, sin filtro de carrera). Se añade un método de **docentes activos de una carrera** (`usuario_carrera` + rol DOCENTE + activo; `UNIQUE(usuario_id)`: una carrera por usuario). Mejora no importa tablas de auth: usa el puerto.
- `PlanMejora.responsable` es hoy `String VarChar(300)` libre (`schema.prisma` ~:1289). Se añade `responsableId` UUID nullable sin FK; el texto queda como nombre mostrado.
- Al guardar, `responsableId` debe ser docente activo de la carrera del plan, si no 409. Los planes viejos siguen legibles hasta editarse.
- `AccionActa.responsableSnapshot` sigue siendo texto, sin cambio.
- **Evaluación:** `docenteId` (RF-PE-018, ~:1135) y `responsableId` indirecto (RF-PE-024, ~:1093) se validan contra docentes activos de la carrera del plan. `ConfigurarPlanEvaluacion.docentes` hoy es `directorio.porRol('DOCENTE')` sin carrera: se filtra.
- **Sin docentes:** aviso «registrar primero docentes en Plan de Estudios».

## 8. Selector de criterios (RF-CH-047)

`ModalNuevoPlanMejora` ya usa `useCriterios(carreraId)` de Acreditación (Bloque 5). Se verifica con una prueba; si ya funciona, se deja como guardia de regresión y se añade el mensaje de lista vacía que sugiere crear criterios. Si no funciona, se corrige.

## 9. Pruebas

- **Unitarias:** orden 403 → 404 → 403 → 409, asociación automática, máquina de estados nueva, regla de «última aprobada del linaje», validación de responsable, bloqueos de eliminar.
- **Integración:** migración con su SQL real; concurrencia del borrado (3 pruebas concurrentes, como en el 6a); alcance con un Docente real; método nuevo del directorio contra Postgres.
- **Guardias de aislamiento** de `mejora-continua`: se actualizan si se agregan puertos.
- **Web:** formulario sin selector de carrera, selector de responsable, acciones del ciclo, edición del seguimiento solo en Aprobado, botón «Eliminar» y motivo del 409.
- **e2e:** flujo completo de Mejora y eliminación; se actualizan los que asuman lectura global del Docente. **axe** sobre los modales nuevos (hoy hay 30 pruebas de axe).
- **Docs:** `docs/arquitectura/roles-y-permisos.md` lista Mejora como acotada; nota del seed tras `migrate deploy`.

## 10. Riesgos y puntos a vigilar

- **Efecto del cambio del Docente.** Pasar de lectura global a su carrera afecta Evaluación y cualquier pantalla o prueba que lo asuma; revisar uno por uno.
- **Migración de estados.** Vigente/Histórico → Aprobado no es reversible sin perder la distinción. Está pendiente de ratificación institucional (§7 del documento); RN2 ya la respalda. Se registra como divergencia si la universidad la objeta.
- **`planEvaluacionId` y `responsableId` sin FK:** la integridad depende de los casos de uso y del borrado transaccional.
- **Datos existentes.** En `sgc_test` puede haber planes de sesiones viejas; leer el mensaje de la migración antes de reaplicar.

## 11. Pendiente de institución (§7 del documento fuente)

- Migración de Vigente/Histórico a Aprobado: la RN2 ya la dice, falta confirmación.
- Acceso del Docente: **decidido** arriba (decisión 1).
