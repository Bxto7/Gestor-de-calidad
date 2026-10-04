# Bloque 6a — Planes de Medición y de Evaluación por carrera (RF-CH-033 a 039)

Parte 1 de 3 del Bloque 6 de «Cambios y Observaciones MVP1» (Mejora Continua). Fuente: `D:\Descargas\Requerimientos_de_Cambios_y_Observaciones - MVP1.md`, §6.

## 1. Alcance

**Entra (6a):**

- RF-CH-033 / RF-CH-037: un plan de Medición / de Evaluación queda asociado automáticamente a la carrera de la sesión; los selectores de «Nuevo plan» se restringen a esa carrera.
- RF-CH-034 / RF-CH-038: el listado muestra solo los planes de la carrera del usuario; la URL directa a un plan de otra carrera se deniega.
- RF-CH-035 / RF-CH-039: se pueden eliminar planes en **Borrador o En revisión** (hoy solo Borrador), con bloqueo si tienen planes asociados.
- RF-CH-036: placeholder estándar en el campo «Periodos» del formulario de Medición.

**No entra:**

- Planes de Mejora (RF-CH-040 a 047): incluye el cambio de ciclo (043), evidencias (044), «Responsable» como selector de docentes (045, 046) y el selector de criterios (047). Es el **6b**.
- Actas de Aprobación (RF-CH-048 a 050): **6c**.
- El filtro del Docente (RF-CH-041) es del 6b.

## 2. Decisiones tomadas

| # | Decisión | Por qué |
|---|---|---|
| 1 | El Coordinador recibe la marca `lectura.solo_su_carrera` (opción A). | Los RF piden que vea solo su carrera y que la URL directa a otra se deniegue. Hoy solo la tiene el Director, y el Coordinador lee todo. Cierra de paso la asimetría que dejó el Bloque 5 (Atributos y Criterios). El Consultor sigue con alcance global. |
| 2 | `carrera_id` propia en `PlanMedicion` y `PlanEvaluacion`. | Hoy se deriva del plan de estudios, lo que obliga a consultar otro módulo en cada listado. Con columna, el filtro es local y «queda asociado» es un dato real. Mismo camino que `PlanMejora` y `ActaAprobacion`. |
| 3 | La migración **aborta con un mensaje** si algún plan no se puede asignar a una carrera. | No hay clave foránea en `plan_estudios_id`, así que puede haber huérfanos. Abortar no pierde ni inventa nada y deja la columna `NOT NULL`. |

## 3. Datos y migración

Migración nueva, escrita a mano en SQL (patrón de los Bloques 4b y 5), en una sola transacción:

1. `planes_medicion.carrera_id` y `planes_evaluacion.carrera_id` nullable.
2. Relleno:
   - Medición: carrera del plan de estudios (`plan_estudios_id`).
   - Evaluación: carrera de su plan de medición base (`plan_medicion_id`).
3. Si queda algún plan sin carrera: la migración **se aborta** con un mensaje que lista los códigos afectados y qué hacer (corregir o eliminar esos planes y reaplicar).
4. `SET NOT NULL` en las dos columnas e índice por `carrera_id` en cada una.
5. Sin FK a `academico.carreras`, igual que `PlanMejora` y `ActaAprobacion`: la integridad la fija el caso de uso.

Una prueba de integración ejecuta el SQL real de la migración sobre datos de partida (resueltos, huérfanos).

## 4. Alcance de lectura y orden de comprobación

- `matriz-de-accesos.ts`: se agrega `lectura.solo_su_carrera` al rol Coordinador. Plantillas de alcance en `politica-de-autorizacion.ts`.
- Medición y Evaluación pasan a usar `AlcanceDeLecturaPort` (hoy ningún caso de uso de `mejora-continua` lo usa).
- Los filtros `FiltroPlanesMedicion` y `FiltroPlanesEvaluacion` incorporan la carrera; el servidor la impone según el alcance, nunca viene del cliente.
- Orden de comprobación en cada operación sobre un plan existente, el mismo de Acreditación:
  1. permiso de lectura → 403
  2. existencia y alcance de lectura → **404** (nunca 403, para no revelar que existe)
  3. permiso de escritura **acotado a la carrera del plan** → 403
  4. reglas de negocio → 409
- Un Coordinador sin carrera asignada no ve ni crea nada; el mensaje lo dice.
- Los permisos `medicion.*` y `evaluacion.*` de escritura ya están en `PERMISOS_ACOTADOS_A_CARRERA`; no cambian.

## 5. Asociación automática (RF-CH-033, 037)

- Al crear, el caso de uso toma la carrera de `AuthorizationPort.carreraACargoDe` (mismo mecanismo que Mejora y Actas). El cliente no la envía.
- Medición: el plan de estudios base debe ser de esa carrera, si no 409. Evaluación: el plan de medición base debe ser de esa carrera, si no 409.
- Web: los selectores de «Nuevo plan» muestran solo lo de la carrera de la sesión (`PlanesMedicionPage` sobre `usePlanes()`, `PlanesEvaluacionPage` sobre las bases elegibles). Si el usuario no tiene carrera, ve un aviso en lugar del formulario.

## 6. Eliminar (RF-CH-035, 039)

- `permiteEliminacion` (`estado-plan.ts`) admite Borrador y En revisión. Reemplaza la restricción de RF-PM-009 y RF-PE-008, como piden los requisitos.
- Bloqueos con 409 y motivo concreto:
  - Estado distinto: el mensaje nombra el estado actual.
  - Medición con planes de evaluación asociados, de cualquier estado: «tiene N planes de evaluación asociados».
  - Evaluación con planes de mejora asociados, de cualquier estado: «tiene N planes de mejora asociados». La relación es `PlanMejora.planEvaluacionId`, sin FK; el conteo es la única defensa.
- El conteo y el borrado van **en la misma transacción**, de modo que un vínculo concurrente no deje un plan huérfano. El repositorio devuelve `false` si la fila ya no existe, y el caso de uso responde 404.
- El evento de auditoría se publica **después** de borrar (lección del Bloque 5: la bitácora es append-only y no puede registrar un borrado que no ocurrió).
- Los `DELETE` ya existen para los dos submódulos; se cambia la regla, no el endpoint.

## 7. Web

- «Eliminar» en el listado y en el detalle, visible solo si el estado lo permite y el usuario tiene el permiso sobre la carrera del plan (`SiPuede` con `carreraId`).
- Se reutiliza `ConfirmarEliminacion` (muestra el motivo del 409 sin cerrar el diálogo). Hoy vive en `features/acreditacion/components/`; se mueve a `shared/components/` para que lo usen ambos módulos, sin dejar una copia.
- RF-CH-036: placeholder en «Periodos» del formulario de creación y edición del plan de Medición; desaparece al escribir.

## 8. Pruebas

- Unitarias: estados que permiten eliminar, conteos de bloqueo, asociación automática, orden 403/404/409, Coordinador sin carrera.
- Integración: migración con su SQL real (planes resueltos y huérfanos), alcance con un Coordinador real, bloqueos por uso, carrera concurrente.
- Guardias de aislamiento de `mejora-continua`: se actualizan si se agregan puertos.
- Web: formularios con selectores acotados, botón «Eliminar» según estado y permiso, motivo del 409.
- e2e:
  - Se actualizan los del Bloque 5 que afirman que el Coordinador lee otra carrera (ahora recibe 404).
  - Nuevo: crear y eliminar un plan de Medición y uno de Evaluación; bloqueo con uno asociado.
  - `axe` sobre el modal de eliminar de cada plan.

## 9. Riesgos y puntos a vigilar

- **Efecto transversal de la decisión 1.** Quitarle al Coordinador la lectura global afecta Acreditación, Plan de Estudios y Reportes. Hay que revisar cada pantalla y prueba que hoy lo asuma, además de los e2e del Bloque 5.
- **Datos existentes.** La migración aborta ante huérfanos; en `sgc_test` hay planes de sesiones viejas, y habrá que limpiarlos antes de aplicarla. En un entorno compartido, leer el mensaje antes de reaplicar.
- **`PlanMejora.planEvaluacionId` no tiene FK:** el bloqueo de Evaluación depende solo del conteo transaccional.
- **Sin divergencias nuevas con el documento.** Las reglas de bloqueo siguen el texto (los planes «asociados» cuentan en cualquier estado). Si al implementar aparece una más estricta, se registra como D-xx.

## 10. Discrepancias spec vs. código (a verificar al planificar)

- El texto del documento habla de «planes de evaluación asociados» y «planes de mejora asociados» sin precisar estado. Se interpreta como cualquier estado; es la lectura segura frente a dejar vínculos colgando.
- La web parece no exponer hoy el botón «Eliminar» aunque los hooks (`useEliminarPlan`, `useEliminarEvaluacion`) existen: confirmar al planificar.
