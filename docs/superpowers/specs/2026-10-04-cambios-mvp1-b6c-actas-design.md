# Bloque 6c — Actas de Aprobación por carrera (RF-CH-048 a 050)

Parte 3 de 3 del Bloque 6 de «Cambios y Observaciones MVP1» (Mejora Continua). Fuente: `D:\Descargas\Requerimientos_de_Cambios_y_Observaciones - MVP1.md`, §6 (RF-CH-048 a 050). El 6a (Medición y Evaluación) y el 6b (Mejora) ya están en `main` (121db3e).

## 1. Alcance

**Entra (6c):**

- RF-CH-048: un acta queda asociada automáticamente a la carrera de la sesión, sin selector.
- RF-CH-049: el listado muestra solo las actas de la carrera del usuario; la URL directa a un acta de otra carrera se deniega.
- RF-CH-050: se puede eliminar un acta en **Borrador o En revisión** (hoy solo Borrador). Aprobada y Emitida no se eliminan (consistente con RF-AC-017).
- Cierre del ítem I1 de la revisión final del 6b: las actas leían datos de planes de Mejora de otras carreras.
- Historial de modificaciones del acta por un endpoint propio del módulo de Actas, con el mismo alcance que el acta.

**No entra:**

- Cambios al módulo de auditoría ni al permiso `auditoria.leer_entidad` (ver decisión 3).
- Cambios a la máquina de estados del acta (`transiciones-acta.ts`).
- Migraciones: el modelo ya tiene `carreraId` con índice y `@@unique([carreraId, correlativo])`.

## 2. Estado actual (verificado en el código el 4 de octubre de 2026)

- `crear` (`gestionar-actas.use-case.ts:~194`) ya deriva la carrera con `carreraACargoDe` y exige `actas.crear` sobre ella. El cliente no envía `carreraId`. Es una copia inline de `carreraDeLaSesion`, con otro mensaje de error.
- `eliminar` ya existe en caso de uso, controller (`DELETE :id`), repositorio y web (`EliminarActaSeccion`), pero solo en Borrador, con `delete` simple sin transacción.
- Ningún método usa `AlcanceDeLecturaPort`; `GestionarActas` ni siquiera lo recibe.
- Fugas de lectura entre carreras: `porId`, `listar`, `obtenerContenido` (con `accionesEnVivo` leyendo `PlanMejora` sin acotar), el `PATCH :id/textos` (llama a `porId`), y en la exportación `encolar`, `estado`, `listarDeActa` y `descargar`.
- Las escrituras hacen `exigirActa` (404 si no existe) y luego el permiso acotado a la carrera del acta, así que responden **403** a quien no ve el acta: revela que existe.
- La web no tiene rama de error en `ActaPage` (`if (isLoading || !acta) return <Cargando/>`): un 404 deja «Cargando…» para siempre.
- Permisos: Director y Coordinador tienen `actas.leer/crear/editar/eliminar` y `lectura.solo_su_carrera`; el Director además `actas.aprobar`. Consultor solo `actas.leer`, sin la marca (alcance global). Docente y Administrador no tienen `actas.*`.

## 3. Decisiones tomadas

| # | Decisión | Por qué |
|---|---|---|
| 1 | Se reusa el patrón del 6a/6b (`alcance-de-planes.ts`) tal cual: `carreraImpuesta`, `exigirPlanLegible`, `carreraDeLaSesion` y `AlcanceDeLecturaPort` como último parámetro. | Un solo mecanismo de alcance en todo Mejora Continua; la regla 403 → 404 → 403 → 409 ya está probada. |
| 2 | Las escrituras sobre un acta ajena responden **404**, no 403. | RN1 de RF-CH-049 pide denegar la URL directa; responder 403 confirma que el acta existe. |
| 3 | El historial se lee por `GET /actas/:id/historial` (módulo Actas), no se acota `/auditoria`. | `ConsultarBitacora` documenta que `auditoria.leer_entidad` no comprueba visibilidad de la entidad, porque acotarlo obligaría a auditoría a conocer los permisos de los demás módulos (§3.2). El riesgo real es bajo: hace falta el UUID de un acta ajena, que el listado y la URL directa ya no entregan. El endpoint propio da a la pantalla del acta una puerta acotada. `/auditoria` sigue como hoy para quien ya tenga un UUID. |
| 4 | Actas consulta la bitácora por un **puerto propio** (`HistorialDelActaPort`), implementado en infraestructura sobre el caso de uso de auditoría. | Actas no importa otro módulo directamente; las guardias de aislamiento se mantienen. |
| 5 | Sin migración. | `carreraId` ya es obligatorio e indexado en `ActaAprobacion`. |

## 4. Alcance de lectura y orden de comprobación

- `GestionarActas` recibe `AlcanceDeLecturaPort` (cableado en `app.module.ts` en los dos sitios donde se construye).
- `porId`, `obtenerContenido` y el historial: permiso `actas.leer` (403) → acta existente y legible (404, nunca 403) → respuesta.
- `listar`: la carrera la impone el servidor según el alcance; el cliente no la envía. Un Coordinador o Director sin carrera asignada ve la lista vacía y el mensaje lo dice. Consultor ve todas.
- Escrituras (`editarCabecera`, `reemplazarAsistentes`, `cargarAccionesDelPeriodo`, `actualizarSeleccionDeAcciones`, `editarTextosInstitucionales`, `transicionar`, `eliminar`): 1) permiso de lectura → 403; 2) existencia y alcance → **404**; 3) permiso de escritura acotado a la carrera del acta → 403; 4) reglas de negocio → 409.
- El `PATCH :id/textos` deja de apoyarse en `porId` del controller y pasa por el mismo orden en el caso de uso.
- `crear`: se sustituye la copia inline por `carreraDeLaSesion`; el mensaje y el orden coinciden con Mejora.

## 5. Exportación y datos de Mejora dentro del acta (cierre de I1)

- `GenerarDocumentoActa.encolar` y `ConsultarDocumentoActa.estado`, `listarDeActa` y `descargar` aplican el alcance. Para `estado` y `descargar` se resuelve el acta desde el trabajo y se aplica el mismo 404.
- El worker (`ejecutar`) no usa actor y no cambia.
- Defensa en profundidad: `accionesEnVivo`, `construirSnapshots` y `armarContenido` del worker descartan los planes cuyo `carreraId` no sea el del acta. Los vínculos solo nacen por `cargarAccionesDelPeriodo`, que ya acota, así que las filas actuales son consistentes; el filtro protege frente a datos forzados o legados, porque `AccionActa.planMejoraId` no tiene FK.

## 6. Eliminar (RF-CH-050)

- `eliminar` admite Borrador y En revisión. Aprobada y Emitida: 409 con el estado actual nombrado.
- Borrado **transaccional con `FOR UPDATE`**, releyendo el estado con la fila bloqueada, para cerrar la carrera contra `transicionar` (aprobar o rechazar en paralelo). Resultado tipado `{eliminado | no-existe | estado-no-permite}`; `no-existe` responde 404.
- El evento `ActaEliminada` se publica **después** de borrar (lección del commit 7c4c207: la bitácora es append-only y no puede registrar un borrado que no ocurrió).
- `AsistenteActa`, `AccionActa` y `DocumentoActa` caen por cascada; los planes de Mejora vinculados quedan libres otra vez para otra acta (`planesYaEmitidos` solo cuenta actas Emitidas).
- Sigue el patrón de `plan-mejora.repository.ts` (6b).

## 7. Historial propio

- Nuevo `GET /actas/:id/historial`: `actas.leer` → acta legible (404) → eventos de la entidad `ActaAprobacion` de ese acta, a través de `HistorialDelActaPort`.
- Se conserva la regla de la bitácora de acotar el listado (límite máximo) y el formato de los eventos actuales (acción, detalle, usuario, fecha).
- Web: `HistorialDelActa` y su hook cambian al endpoint nuevo. Sigue visible solo con los permisos que ya lo gobiernan (`auditoria.leer` o `auditoria.leer_entidad`, o los que se decida al planificar, ver §10).

## 8. Web

- `ActaPage`: rama de error y de «Acta no encontrada» ante 404, como `PlanMejoraPage`; sin reintentos eternos en 404.
- «Eliminar» visible en Borrador y En revisión para quien tenga `actas.eliminar` sobre la carrera del acta. Se reemplaza el `Modal` propio por `ConfirmarEliminacion`, que muestra el motivo del 409 sin cerrar el diálogo.
- Textos: «solo Borrador» pasa a «Borrador o En revisión» (`ActaPage.tsx`).
- Listado: mensaje de lista vacía y aviso cuando el usuario no tiene carrera; sin selector de carrera.

## 9. Pruebas

- **Unitarias:** orden 403 → 404 → 403 → 409 en cada método; Coordinador y Director sin carrera; Consultor global; eliminar por estado; filtro defensivo de `planMejoraId` ajeno; historial acotado.
- **Integración:** alcance con roles reales (Coordinador de otra carrera recibe 404 en `porId`, contenido, historial, exportación y descarga); concurrencia del borrado contra `transicionar` (como en el 6a y 6b); `listar` acotado.
- **Guardias de aislamiento** de `mejora-continua`: se actualizan por el puerto nuevo.
- **Web:** `ActaPage` con 404, botón Eliminar por estado y permiso, motivo del 409, lista vacía y sin carrera.
- **e2e:** Coordinador de la carrera A no ve ni abre el acta de la B; crear y eliminar un acta en Borrador y en En revisión; se actualizan los e2e que asuman lectura global. **axe** sobre el modal de eliminar acta (hoy 31 pruebas).
- **Docs:** descripciones de `actas.eliminar` en `matriz-de-accesos.ts:~110` y su spec; `docs/arquitectura/roles-y-permisos.md` lista Actas como acotadas; `CLAUDE.md` con el conteo de axe y el 6c.

## 10. Riesgos y puntos a vigilar

- **Efecto sobre el Director.** El Director tiene `lectura.solo_su_carrera`, así que deja de ver actas de otras carreras. Revisar pantallas y pruebas que lo asuman (dashboard, Reportes).
- **Historial y permisos.** Hoy `HistorialDelActa` se pinta con `auditoria.leer` o `auditoria.leer_entidad` (Administrador, Director, Coordinador). El endpoint nuevo pide `actas.leer` y alcance; decidir al planificar si además se exige el permiso de auditoría para no ampliar quién ve el historial (Consultor tiene `actas.leer` pero hoy no lo ve).
- **Sin FK en `planMejoraId`.** La consistencia depende del caso de uso y del filtro defensivo; se cubre con prueba de integración, sin migración.
- **Descarga por trabajo.** Resolver el acta desde el id de trabajo agrega una consulta; confirmar al planificar que no rompe el flujo del worker.

## 11. Discrepancias spec vs. código (a verificar al planificar)

- El mapa del código no confirmó si `permiteEdicion(estado)` incluye En revisión (condiciona el botón «Eliminar», que hoy depende de `editable`).
- Los permisos exactos del rol Administrador sobre `actas.*` se dedujeron por ausencia; releer el bloque de la matriz.
- La descripción de `actas.eliminar` en la matriz dice «solo Borrador» y debe cambiarse; su spec la pina o no: comprobar.
- Las migraciones nuevas, si apareciera alguna, deben llevar timestamp posterior a `20261005130000`.
