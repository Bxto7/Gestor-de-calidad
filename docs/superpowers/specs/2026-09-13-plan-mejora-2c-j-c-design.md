# Documentos, versionado y búsqueda del plan de mejora (2c-J-C) — Diseño

**Fecha:** 13 de septiembre de 2026
**Alcance:** RF-PJ-032 a RF-PJ-038 del submódulo Plan de Mejora (Módulo de Mejora Continua).

## 1. Por qué este ciclo existe

2c-J-A y 2c-J-B cerraron el núcleo del plan de mejora (RF-PJ-000 a 031) y su pantalla base. Pero
hoy un plan de mejora no se puede sacar de la aplicación en ningún formato, no se puede corregir
sin arriesgar la versión ya aprobada, y el listado solo filtra por carrera. Este ciclo cierra las
tres cosas: generación y exportación (RF-PJ-032 a 034), versionado (RF-PJ-035, apoyado en el
historial que ya existe para RF-PJ-036/037) y búsqueda/filtrado real (RF-PJ-038).

Con esto el submódulo pasa de 32/47 a 39/47. Quedan RF-PJ-039 a 046 (envío a revisión, aprobación,
validación integral real, permisos/auditoría finos) para 2c-J-D — ya referenciado como tal desde
el diseño de 2c-J-A.

## 2. Estado de partida verificado

Comprobado leyendo el código el 13 de septiembre de 2026:

| Hecho | Consecuencia |
|---|---|
| `RepositorioPlanMejoraPort` no tiene un solo método de documentos ni de versiones | Es una extensión de puerto completa, no un ajuste |
| `PlanMejora` (`schema.prisma:1213`) no tiene `version`, `derivadoDeId`, `aprobadoPorId` ni `aprobadoEn` | Hace falta migración, igual que la tuvieron Medición y Evaluación en su momento |
| `platform/documentos/` (modelo neutro, renderizadores PDF/Excel, almacén) ya es compartido desde el ciclo de exportación de medición (4 sept.) | Se reutiliza tal cual, sin tocarlo |
| El código de un plan de mejora (`PJ-CRI-1`, `PJ-OBJ-4`, `PJ-COM-7`…) no lleva sufijo de versión, a diferencia del de medición (`…-v2`) | `siguienteCodigoMejora` ya sirve tal cual para la nueva versión — ver §3.5 |
| `PlanMejoraPage.tsx` **ya tiene** una tarjeta "Historial" (RF-PJ-036) contra `/bitacora`, reutilizando `HistorialDelPlan.tsx` | RF-PJ-036 está construido; este ciclo no le agrega trabajo |
| El propio comentario de cabecera de `PlanMejoraPage.tsx` dice explícitamente que la decisión de introducir pestañas ARIA queda pendiente "para el ciclo siguiente" | Es la decisión de UI de este ciclo, no una elección libre — ver §3.8 |
| `DocumentosDelPlan.tsx`, `HistorialDelPlan.tsx`, `VersionesDelPlan.tsx`, `LineaDeVersiones.tsx` ya existen en `mejora-continua/components/` pese al nombre genérico, pero están acoplados a Medición o Evaluación (tipos, rutas de enlace, textos) | No son reutilizables sin adaptar; se construyen equivalentes propios de Mejora, mismo criterio que ya separó a Evaluación de Medición |
| `PlanesMejoraPage.tsx` solo filtra por carrera vía un `<Selector>` | Sin texto, sin aspecto, sin estado — RF-PJ-038 lo agrega completo |
| `evaluacionApi.listarEvaluaciones(filtro)` ya filtra en servidor (`clavesEval.lista(filtro)` incluye el filtro en la query key) | Es el patrón a replicar para RF-PJ-038, no filtrado en cliente |

## 3. Decisiones de diseño

### 3.1 Documentos: se reutiliza la maquinaria, se crea la tabla propia

`platform/documentos/` ya es genérico desde el ciclo de exportación de medición: no hay nada que
mover esta vez. Mejora Continua gana su propia tabla `documentos_mejora`, mismo shape que
`documentos_medicion` (id, `planMejoraId`, tipo, estado, nombre/tipo MIME/bytes/ubicación opaca,
error redactado, quién y cuándo solicitó, sin FK a usuarios), con clave foránea a `PlanMejora`.
CLAUDE.md §3.2 prohíbe compartir tabla entre módulos, y generalizar la existente perdería el
borrado en cascada.

Se agrega un enum `TipoDocumentoMejora` propio (`PLAN_MEJORA_PDF`, `PLAN_MEJORA_EXCEL`), mismo
criterio de aislamiento que el tipo. Si conviene reutilizar `EstadoDocumentoMedicion` en vez de
duplicar un tercer enum idéntico (`EN_COLA`/`GENERANDO`/`LISTO`/`FALLIDO`, sin FK a ninguna tabla
de negocio) queda a criterio de la implementación — no cambia el diseño.

El trabajo encolado ya declara su tipo y el worker ya enruta (§3.4 del diseño de exportación de
medición); se agregan los dos tipos nuevos a ese enrutamiento existente, sin una segunda cola.

### 3.2 Contenido del documento consolidado

El plan de mejora es un solo formato tabular, condicional por aspecto — mismo criterio que ya
aplica la pantalla de Definición (el campo *Input* se omite para Competencia). `armar-documento-
mejora.ts` arma:

- **Cabecera**: código, aspecto, elemento asociado (nombre resuelto), estado documental, estado
  de implementación.
- **Definición**: causa raíz, justificación, input (si aplica), plazo, recursos, metas,
  responsable.
- **Seguimiento**: evidencias (referencia, quién, cuándo), logro de meta, impacto.

RF-PJ-033 RN1 exige igualar "el formato institucional utilizado actualmente", pero el repositorio
no trae esa plantilla oficial para calcarla al detalle — queda anotado en §9 en vez de asumirse
verificado.

### 3.3 Versionado: una sola operación

RF-PJ-035 solo pide "nueva versión". A diferencia de Medición, la ficha de Mejora no tiene un
equivalente a "duplicar" (RF-PM-034): no hay ningún requisito que abra un plan de mejora
independiente sin vínculo de linaje. Por eso este ciclo construye un único caso de uso,
`generarNuevaVersion`, no dos. Precondición idéntica a medición: el plan de origen debe estar
Aprobado, Vigente o Histórico.

### 3.4 Qué copia la nueva versión

Decisión tomada explícitamente con el usuario, porque Plan de Mejora no tiene "duplicar" que
absorba el caso de "empezar en limpio": **la nueva versión en Borrador conserva íntegro el
seguimiento de la versión origen** — evidencias, `logroMeta`, `impacto` y `estadoImplementacion`
— además de toda la definición. Solo cambian `id`, `codigo` (nuevo correlativo, §3.5), `version`
(+1), `estado` (`BORRADOR`), `derivadoDeId` (apunta al origen), `aprobadoPorId`/`aprobadoEn`
(`null`) y `creadoEn` (ahora).

Es la misma lógica que "nueva versión" ya tiene en Medición (a diferencia de "duplicar", que sí
descarta lo medido porque abre un periodo de acreditación nuevo): aquí se sigue corrigiendo el
mismo plan, así que borrar el seguimiento ya hecho borraría evidencia real. `domain/services/
copia-de-plan-mejora.ts` documenta esto con una prueba unitaria campo por campo, como su par de
medición.

### 3.5 Numeración: código y `version` son contadores independientes

El código de un plan de mejora no lleva sufijo de versión. `generarNuevaVersion` pide el
siguiente correlativo del mismo ámbito con la función que ya existe — `siguienteCodigoMejora`,
sobre `codigosDe(aspecto, elementoId)` o, para Competencia, el ámbito por periodo — la misma que
usa `crear()`. El campo `version` nuevo es solo un contador de cuántas veces se versionó ese
linaje, para mostrar "v2" en pantalla sin tocar el código. No hay aquí la ambigüedad que sí tuvo
medición (§3.3 de su diseño, correlativo compartido entre código y campo): en Mejora son dos
números distintos desde el principio, no dos expresiones del mismo.

### 3.6 RF-PJ-036 (Historial) — ya construido

`PlanMejoraPage.tsx` ya tiene la tarjeta Historial contra `/bitacora?entidad=PlanMejora&entidadId=
…`, reutilizando `HistorialDelPlan.tsx`. Este ciclo no le agrega trabajo: pasa de tarjeta suelta a
contenido de la pestaña "Historial" (§3.8), sin tocar su lógica.

### 3.7 RF-PJ-037 (solo lectura): reutiliza las guardas que ya existen

`permiteEdicionDefinicionMejora` y `permiteEdicionSeguimientoMejora` ya devuelven `false` fuera de
Borrador, así que una versión histórica abierta en `PlanMejoraPage` ya se ve de solo lectura sin
código nuevo. Falta solo el listado de versiones con enlace a cada una (`VersionesDelPlanMejora
.tsx`, mismo patrón que `VersionesDelPlan.tsx` de Evaluación) y el aviso "estás viendo una versión
en solo lectura" cuando la abierta no admite edición.

### 3.8 Pestañas ARIA en `PlanMejoraPage`

Decisión tomada con el usuario: la pantalla pasa de tarjetas apiladas a pestañas ARIA, siguiendo
el patrón ya resuelto en `PlanEvaluacionPage.tsx` (`idBase = useId()`, `aria-controls` estables
por instancia). Pestañas: **Definición**, **Seguimiento**, **Documentos**, **Versiones**,
**Historial**. Es la reescritura de mayor superficie del ciclo, pero no de lógica: los campos y
mutaciones existentes se mueven de contenedor, no cambian de comportamiento.

### 3.9 Búsqueda y filtros (RF-PJ-038)

RF-PJ-038 RN1 exige que el listado muestre aspecto, elemento asociado y ambos estados —
`PlanesMejoraPage.tsx` ya lo hace. Falta:

- Texto libre sobre código y nombre de la acción.
- Filtro por aspecto (criterio / objetivo / competencia).
- Filtro por estado de implementación.
- Filtro por estado documental.

Filtrado en **servidor**, replicando exactamente el patrón que ya usa Evaluación
(`FiltroEvaluaciones`, `clavesEval.lista(filtro)` con el filtro dentro de la query key): mantiene
el listado de un solo tipo de fuente en todo el módulo, en vez de introducir filtrado en cliente
solo para Mejora.

## 4. Alcance

### Dentro

| RF | Qué se construye |
|---|---|
| RF-PJ-032 | `armarDocumentoMejora`: consolida el plan en formato de tabla |
| RF-PJ-033 | Exportación a Excel |
| RF-PJ-034 | Exportación a PDF |
| RF-PJ-035 | `generarNuevaVersion`: copia a Borrador con vínculo al origen (§3.3–3.5) |
| RF-PJ-037 | `GET :id/versiones` y su pestaña, en modo solo lectura sobre versiones no editables |
| RF-PJ-038 | Búsqueda por texto y filtros por aspecto/estado de implementación/estado documental |
| — | Pestañas ARIA en `PlanMejoraPage` (§3.8) |

### Ya cerrado, sin tarea en este ciclo

- **RF-PJ-036** (histórico de modificaciones) — construido desde el ciclo de pantallas (§3.6).

### Fuera

- **RF-PJ-039 a 046** (envío a revisión, aprobación, rechazo motivado, validación integral real,
  permisos/auditoría finos) — 2c-J-D.
- **Duplicar un plan de mejora.** La ficha no lo pide, a diferencia de medición (§3.3).
- **Comparar dos versiones lado a lado.** Ningún requisito lo pide.
- **Exportar el linaje de versiones.** Igual que en medición, no lo pide ningún RF.
- **Mover los archivos a Backblaze B2.** Sigue en disco; el puerto ya está preparado para ese
  cambio cuando corresponda (CLAUDE.md §5.6).

## 5. Estructura

```
apps/api/
  prisma/migrations/…_documentos_mejora/        tabla documentos_mejora, TipoDocumentoMejora
  prisma/migrations/…_versionado_mejora/         version, derivadoDeId, aprobadoPorId, aprobadoEn

  src/modules/mejora-continua/mejora/
    domain/
      services/copia-de-plan-mejora.ts           qué copia la nueva versión (§3.4)
      documentos/armar-documento-mejora.ts        qué dice el documento (§3.2)
    application/
      ports/plan-mejora.port.ts                   + generarDocumento, listarDocumentos,
                                                    generarNuevaVersion, listarVersiones,
                                                    listarConFiltros
      use-cases/
        generar-documento-mejora.use-case.ts
        versionar-plan-mejora.use-case.ts
    infrastructure/
      persistence/plan-mejora.repository.ts        + los métodos nuevos del puerto
      queue/                                        enrutamiento existente + 2 tipos nuevos
      http/
        planes-mejora.controller.ts                 + filtros en GET, POST/GET :id/versiones
        documentos-mejora.controller.ts              nuevo, mismo patrón que el de medición

apps/web/src/features/mejora-continua/
  components/
    DocumentosDelPlanMejora.tsx
    VersionesDelPlanMejora.tsx
  pages/
    PlanesMejoraPage.tsx        + texto y selects de filtro
    PlanMejoraPage.tsx           reescrita a pestañas ARIA (§3.8)
  api/queries.ts                 + clavesMejora.versiones/documentos, hooks nuevos
```

## 6. Endpoints

```
POST /planes-mejora/:id/documentos      encola; 202 con el trabajo
GET  /planes-mejora/:id/documentos      generados, del más reciente al más antiguo
GET  /documentos-mejora/:id             estado del trabajo
GET  /documentos-mejora/:id/archivo     descarga con StreamableFile
POST /planes-mejora/:id/versiones       genera la nueva versión en Borrador
GET  /planes-mejora/:id/versiones       el linaje completo
GET  /planes-mejora?carreraId=&texto=&aspecto=&estadoImplementacion=&estado=   listado filtrado
```

Generar/listar documentos y consultar versiones exigen `mejora.leer` (exportar y consultar son
lectura, mismo criterio que medición). Generar nueva versión exige `mejora.editar`, porque crea un
plan nuevo en Borrador.

## 7. Errores

- Nueva versión desde un Borrador → "Solo se versiona un plan de mejora Aprobado, Vigente o
  Histórico; este está en Borrador y se puede editar directamente." (mismo mensaje que medición).
- Un plan sin evidencias se exporta igual, y el documento lo dice — mismo criterio ya aplicado en
  Plan de Estudios y Medición.
- Descargar un trabajo fallido devuelve el motivo redactado, no el archivo.
- Worker caído: se hereda el mismo reintento de la cola compartida (3 intentos, backoff
  exponencial, retiro de fallidos a las 24 horas).

## 8. Pruebas

| Nivel | Qué |
|---|---|
| Dominio | `copia-de-plan-mejora`: campo por campo, con la conservación del seguimiento (§3.4) como caso central |
| Dominio | `armar-documento-mejora`: con y sin evidencias, cada uno de los tres aspectos |
| Integración | El trabajo pasa de encolado a listo con el archivo presente |
| Integración | Borrar el plan se lleva sus documentos por cascada |
| Integración | `generarNuevaVersion` crea el Borrador con `derivadoDeId` correcto y el siguiente correlativo del ámbito correcto — con foco en Competencia, que además debe preservar `periodoId` y `planEvaluacionId` |
| Integración | El filtro combinado (texto + aspecto + estado) en el listado |
| E2E | Encolar una exportación y verla aparecer en Documentos |
| E2E | Generar una nueva versión y verla en Versiones con su enlace |
| E2E | Filtrar el listado por texto y por cada selector |

## 9. Puntos que quedan anotados

- **El formato exacto del Excel/PDF institucional** (RF-PJ-033/034 RN1). Este diseño propone una
  tabla única condicional por aspecto (§3.2), pero el repositorio no trae la plantilla oficial
  vigente para calcarla al detalle. Se ajusta si la universidad aporta el formato real.
- **`TipoDocumentoMejora` propio frente a reusar `EstadoDocumentoMedicion`.** El estado del
  trabajo es genérico y sin FK de negocio; si conviene compartirlo entre los tres módulos en vez
  de mantener tres enums idénticos es una decisión de implementación, no de este diseño.
