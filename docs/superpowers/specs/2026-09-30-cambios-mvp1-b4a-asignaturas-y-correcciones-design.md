# Cambios MVP1 — Bloque 4a: asignaturas y correcciones de Plan de Estudios

- Fecha: 2026-09-30
- Origen: `Requerimientos de Cambios y Observaciones - MVP1.md` (documento externo, no versionado en el repo)
- Cubre: RF-CH-020, RF-CH-021, RF-CH-022, RF-CH-023, RF-CH-024, RF-CH-025
- Bloque 4 de 10 de la iniciativa "Cambios y observaciones MVP1", primera mitad. La segunda (4b: RF-CH-015 a 019, objetivos y competencias por plan y eliminación) tiene su propio ciclo. Depende del Bloque 3 (el Director ya lee solo su carrera; `AlcanceDeLecturaPort`).

## 1. Alcance

- **RF-CH-020.** El campo «Horas Teóricas por semana» deja de existir en el flujo de asignaturas: no se muestra, no se valida y no se guarda.
- **RF-CH-021.** Al asociar competencias a una asignatura solo se ofrecen las del plan, y el servidor rechaza cualquier otra.
- **RF-CH-022.** Una asignatura electiva puede quedar sin ciclo. Las obligatorias siguen exigiéndolo.
- **RF-CH-023.** Los botones «Reactivar» devuelven la entidad a Activo en todas las secciones del módulo.
- **RF-CH-024.** El botón «Enviar a Revisión» se habilita o deshabilita sin recargar la página.
- **RF-CH-025.** El modal «Histórico de Cambios» no se desborda con textos largos.

**No cubre en este bloque:**
- Filtrar los catálogos de objetivos y competencias por plan, y eliminar objetivos, competencias y asignaturas (RF-CH-015 a 019): Bloque 4b.
- Atributos y criterios de acreditación (Bloque 5) y Mejora Continua (Bloque 6).
- Grupos de electivos (`GrupoElectivo`): existe en el esquema, pero ningún código lo usa. Sigue siendo la divergencia D-2 del documento de UI.

**Decisiones ya tomadas con el usuario:**
- El bloque 4 se parte en dos ciclos, 4a (este) y 4b.
- El modelo de objetivos y competencias sigue siendo un **catálogo global unido al plan por una tabla N:M**. No se convierte en dato propio de cada plan. Esto fija el significado de «de la carrera» en RF-CH-021 (ver 3.4).
- La columna `horas_teoricas` se **vuelve opcional y deja de usarse**; no se borra.

## 2. Estado actual (verificado en código)

- **Horas teóricas.** Columna NOT NULL `horas_teoricas` con el CHECK `asignaturas_horas_no_negativas` (`schema.prisma:555`, migración `20260820000000_esquema_inicial`). Aparece en el DTO (`asignatura.dto.ts`), la validación y el caso de uso (`gestionar-asignaturas.use-case.ts`), el puerto y el repositorio de asignaturas, el clonado de versión (`plan.repository.ts`), el evento y el diff de auditoría (`eventos-asignatura-crud.ts`), los documentos (`datos-documento.repository.ts`, `armar-documentos.ts`), la web (`AsignaturasPage.tsx`, `tipos.ts`, `plan-estudios.api.ts`, `mapeadores.ts`) y los scripts `preparar-e2e.ts` y `cargar-plan-isi-2018.ts`.
- **Competencias del modal.** `ModalAsignatura` usa `useCompetencias()`, el catálogo global, y filtra solo por `estado === 'Activo'`. `validarCompetencias` (`gestionar-asignaturas.use-case.ts`) y `competenciasValidas` (`asignatura.repository.ts`) solo comprueban que existan y estén activas, no que pertenezcan al plan. `plan.competenciaIds` ya viene en el detalle del plan.
- **Electivas sin ciclo.** `cicloId` ya es nullable y `condicion` distingue OBLIGATORIA de ELECTIVA. RF064 (créditos por ciclo) ya ignora lo que no tiene ciclo (`motor-de-validaciones.ts`, `creditosPorCiclo`). Lo que bloquea es la regla `ASIGNATURA_SIN_CICLO` (RF068), bloqueante para toda asignatura activa sin ciclo, con una copia en la API y otra en la web (`motor-validaciones.ts`). Otros sitios que tratan «sin ciclo» como error: `ubicar-asignatura.use-case.ts` (conteo `asignaturasSinCiclo`), las alertas de `AsignaturasPage.tsx` y `MallaCurricularPage.tsx`, y la sección «sin ubicar» de `armar-documentos.ts`.
- **Reactivar.** Facultades, Carreras, Objetivos, Competencias y Asignaturas alternan la etiqueta «Inactivar»/«Reactivar», pero llaman siempre a la misma mutación sin pasar el estado deseado. Las funciones de la API (`plan-estudios.api.ts`) tienen un segundo parámetro por defecto `false` (`inactivarObjetivo(id, activo = false)`), así que «Reactivar» envía `false` al `PATCH .../estado` y no cambia nada. Docentes y Criterios sí pasan el estado bien. No hay pruebas de Reactivar en estas cinco pantallas.
- **Enviar a Revisión.** El `disabled` del botón sale de `detalle.accionesDisponibles[].habilitada`, que calcula el servidor (`consultar-plan.use-case.ts`), con la clave de caché `['plan', id, 'detalle']`. Las mutaciones de asignaturas, objetivos, competencias y justificaciones no invalidan esa clave; solo `useAsociarAlPlan`, `useCambiarEstadoPlan` y `useEditarPlan` lo hacen. El `staleTime` global es de 30 s y `refetchOnWindowFocus` está apagado.
- **Histórico.** `HistorialModal.tsx` pinta `e.detalle` en un `<p>` sin `break-words`; el contenedor `min-w-0 flex-1` no basta con cadenas largas sin espacios. `Modal` (`shared/components/ui/index.tsx`) limita el eje Y (`max-h-[60vh] overflow-y-auto`) pero no el X.

## 3. Diseño

### 3.1 RF-CH-020 — Horas teóricas

- **Migración Prisma** que vuelve `horas_teoricas` nullable y elimina el CHECK `asignaturas_horas_no_negativas`. No se toca ningún dato.
- Se elimina el campo de: modal (creación y edición) y tarjeta de la asignatura, DTO, validación, caso de uso, puerto, repositorio, mapeadores y tipos de la web, clonado de versión (la copia deja de incluirlo), y las columnas de los documentos (`armar-documentos.ts`, `datos-documento.repository.ts`).
- **Auditoría:** el diff de edición deja de comparar horas teóricas. Las entradas ya registradas conservan su texto.
- **Scripts:** `preparar-e2e.ts` y `cargar-plan-isi-2018.ts` dejan de escribir el campo (`HORAS_DESCONOCIDAS` desaparece).
- **Tests:** se actualizan los que lo nombran (`gestionar-asignaturas.spec.ts`, `consultar-historial.spec.ts`, `armar-documentos.spec.ts`, `motor-validaciones.test.ts` de la web y las integraciones `asignatura`, `catalogo`, `documentos`, `malla`, `reportes` y `puertos-2c-b`). Se añade una prueba de que crear y editar una asignatura sin horas funciona y de que los documentos se generan sin esa columna.
- El borrado definitivo de la columna queda para una migración posterior, cuando nada la lea.

### 3.2 RF-CH-022 — Electivas sin ciclo

- **Regla `ASIGNATURA_SIN_CICLO` (RF068):** solo aplica a las asignaturas OBLIGATORIAS activas. Se cambia en la API (`motor-de-validaciones.ts`) y en su espejo de la web (`motor-validaciones.ts`). Hay que confirmar que `AsignaturaDelPlan` lleve `condicion` en ambos motores y, si falta, añadirla.
- **Sitios que dejan de contar electivas como pendientes:**
  - `ubicar-asignatura.use-case.ts`: `asignaturasSinCiclo` cuenta solo obligatorias.
  - `AsignaturasPage.tsx` y `MallaCurricularPage.tsx`: las alertas «sin ciclo», que hoy dicen que es una validación bloqueante, cuentan solo obligatorias.
  - `armar-documentos.ts`: las electivas sin ciclo se listan aparte, bajo «Electivas (sin ciclo)», y no bajo «sin ubicar».
- **RF064 (créditos por ciclo):** no cambia, porque ya suma solo lo que tiene ciclo. Se añade una prueba que fije que una electiva sin ciclo no entra en ningún ciclo. Cumple RN2 de RF-CH-022.
- **Crear y editar:** el ciclo ya es opcional en base de datos y DTO (se asigna por `/ubicacion`), así que no se exige ciclo a nadie al guardar. Lo que cambia es la validación de completitud antes de enviar a revisión. Las electivas sin ciclo no la bloquean; las obligatorias sí.
- **Tests:** los que fijan la regla actual se ajustan (`motor-de-validaciones.spec.ts`, `motor-validaciones.test.ts`, `ubicar-asignatura.spec.ts`, `gestionar-asignaturas.spec.ts`, y las integraciones `malla`, `asignatura` y `puertos-2c-b`). Casos nuevos: obligatoria sin ciclo bloquea, electiva sin ciclo no bloquea, electiva con ciclo suma créditos.

### 3.3 RF-CH-023 — Reactivar

- **Causa:** el estado deseado nunca se pasa. **Arreglo:** cada botón pasa el estado explícito (`Activo` o `Inactivo`) a su mutación. Las cinco funciones de inactivar/reactivar de `plan-estudios.api.ts` (facultad, carrera, objetivo, competencia y asignatura; p. ej. `inactivarObjetivo`) y sus hooks en `queries.ts` reciben el estado como parámetro **obligatorio**, sin valor por defecto, para que omitirlo sea un error de compilación.
- Puntos de llamada: `FacultadesPage.tsx`, `CarrerasPage.tsx`, `ObjetivosPage.tsx`, `CompetenciasPage.tsx` y `AsignaturasPage.tsx`. Se sigue el ejemplo correcto de `DocentesPage.tsx`, que pasa `!inactivar`.
- **Conflictos:** si reactivar choca con una regla de negocio (por ejemplo un duplicado generado mientras tanto), el servidor ya responde con el motivo y la interfaz lo muestra como hoy con los demás errores.
- **Tests:** por cada una de las cinco pantallas, una prueba de que «Reactivar» llama a la API con el estado activo y «Inactivar» con el inactivo. Un e2e que inactiva y reactiva una entidad de punta a punta.

### 3.4 RF-CH-021 — Competencias del modal de asignatura

- **Significado de «de la carrera».** Como las competencias son un catálogo global unido al plan, «las de la carrera» se interpreta como **las competencias asociadas al plan activo**, que es la única forma de llegar a la carrera. Es consistente con RF-CH-017 (4b) y se deja anotado como interpretación.
- **Web:** `ModalAsignatura` ofrece solo las competencias activas cuyo id esté en `plan.competenciaIds`. Si el plan no tiene ninguna, el selector se muestra vacío con el mensaje «Este plan no tiene competencias. Asócialas primero en la sección Competencias».
- **API:** `validarCompetencias` rechaza, con `ReglaDeNegocioViolada`, cualquier competencia que no esté asociada al plan de la asignatura. La comprobación es del servidor y no depende de la interfaz.
- **Datos existentes:** una asignatura que ya tenga una competencia fuera del plan no se toca; la regla se aplica al crear y al editar el conjunto de competencias. Si la edición reenvía una competencia ya asociada que no pertenece al plan, se rechaza con el mismo motivo.
- **Tests:** unitario del caso de uso (en el plan pasa, fuera del plan se rechaza, inactiva se rechaza), de integración del repositorio y de componente del modal (solo las del plan, estado vacío).

### 3.5 RF-CH-024 — Enviar a Revisión en tiempo real

- **Causa:** las mutaciones que cambian lo que alimenta las validaciones no invalidan el detalle del plan. **Arreglo:** crear, editar, inactivar/reactivar y ubicar asignaturas, crear, editar e inactivar/reactivar objetivos y competencias, y registrar justificaciones invalidan también `claves.plan(planId)` (el detalle y sus derivados).
- Las mutaciones de objetivos y competencias operan sobre un catálogo global y no conocen un `planId`. Esas invalidan el prefijo `['plan']` completo, que es barato porque solo se refrescan las consultas activas.
- No cambia ninguna regla de habilitación del botón; solo se corrige su propagación (RN1 de RF-CH-024).
- **Tests:** prueba de componente o de hooks que, tras una mutación, el detalle se vuelve a pedir y el botón cambia de estado sin recargar.

### 3.6 RF-CH-025 — Modal «Histórico de Cambios»

- `HistorialModal.tsx`: el texto de cada entrada y la descripción del encabezado hacen salto de línea (`break-words`, `whitespace-pre-wrap` si corresponde) y el contenedor impide el desborde horizontal.
- `Modal` (`shared/components/ui/index.tsx`) añade `overflow-x-hidden` al cuerpo, junto al `overflow-y-auto` actual, para que cualquier modal quede cubierto.
- **No se trunca** ninguna entrada, así que se cumple RN1 (no truncar información crítica sin poder expandirla).
- **Tests:** una prueba de componente con una entrada de 500 caracteres sin espacios comprueba que el contenedor tiene las clases de ajuste, y se añade el caso al spec de accesibilidad (`axe`) si el modal ya se analiza allí.

## 4. Orden de implementación sugerido

1. **RF-CH-023, 024 y 025** (correcciones de interfaz): no dependen de nada y son las más pequeñas.
2. **RF-CH-020** (horas teóricas): corte vertical propio, con migración. Va antes de 021 y 022 para no tocar dos veces los mismos tipos y tests de asignatura.
3. **RF-CH-022** (electivas) y **RF-CH-021** (competencias del modal): tocan el mismo modal y el mismo motor.

## 5. Riesgos y puntos abiertos

- **La interpretación de «de la carrera» en RF-CH-021** (competencias del plan) es una decisión mía, consecuencia de mantener el catálogo global. Si la universidad espera otra cosa, hay que revisarla.
- **Competencias ya asociadas fuera del plan.** Hasta que 4b haga que crear una competencia dentro del plan la asocie automáticamente, el Director asocia a mano desde la sección Competencias. No se pierde nada, pero el flujo es más largo en el intervalo.
- **Migración de horas teóricas.** Dejar la columna opcional evita perder datos, pero queda un campo muerto en el esquema hasta la migración de limpieza. Conviene registrarlo para no olvidarlo.
- **Dos copias del motor de validaciones** (API y web). RF-CH-022 toca ambas; hay que mantenerlas alineadas y probar las dos.
- **Tests de integración:** hacen `TRUNCATE` y solo se corren contra `sgc_test`. El e2e requiere `npm run e2e:preparar` antes de cada pasada completa y apagar el worker de documentos al terminar.
- **Falla previa:** `plan-mejora.int.spec.ts` (7 tests, «Falta el permiso mejora.crear») ya falla en `main` y no pertenece a este bloque.
