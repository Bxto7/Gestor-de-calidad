# Prompt para Claude Code — Frontend: Módulo "Plan de Estudios"

> Cómo usar este archivo: pégalo como instrucción de tarea en Claude Code, estando parado en la raíz del repo `App-ICACIT`. Claude Code ya lee `CLAUDE.md` automáticamente para arquitectura, stack y convenciones — este prompt no repite eso, solo especifica la construcción de este módulo. Cada requerimiento funcional (RF) está copiado **tal cual** del documento fuente ("Módulo de Plan de Estudios — Especificación de Requerimientos", Huancayo, 15 de agosto de 2026), reorganizado en campos para lectura rápida, sin alterar su contenido.
>
> **Alcance:** capa de presentación (UI) + la lógica de negocio/validación descrita en cada RF. No incluye integración real contra NestJS/Prisma todavía — usa datos mock/locales, pero estructura los componentes para consumir datos vía `@tanstack/react-query` cuando exista el backend real (no hardcodees llamadas ni forma de datos que luego haya que reescribir).
>
> **Nota sobre referencias cruzadas:** algunos RF citan entre paréntesis otro RF ("ver RFxxx") que en el documento fuente no corresponde al contenido real (quedaron de una renumeración anterior no propagada del todo). Ya se corrigieron en el texto de este archivo; ver tabla en la sección 7.

---

## 1. Encargo para Claude Code

Crea el módulo **"Plan de Estudios"** del Sistema de Gestión de Calidad de la **Universidad Continental**, con las 8 pantallas de la sección 3, usando React o HTML/CSS, fuente **Manrope**, paleta morada institucional.

## 2. Sistema de diseño

### Paleta

| Uso | Color |
|---|---|
| Primario | `#6802C1` |
| Variante 1 | `#7C19E0` |
| Variante 2 | `#8E41D0` |
| Variante 3 (oscuro) | `#57019F` |
| Acento lila | `#C3B9F5` |
| Acento lila claro | `#E9E1FB` |

### Estados (badge: color de texto sobre color de fondo)

| Estado | Texto | Fondo |
|---|---|---|
| Activo / Completo | `#1a9c5e` | `#E7F6EE` |
| En progreso / Pendiente-revisión | `#b8860b` | `#FBF3E3` |
| Inactivo / Pendiente | `#9a97a6` | `#F3F2F6` |
| Aprobado | `#1a7fc0` | `#E7F1FB` |

### Layout base (todas las pantallas)

- Sidebar fijo de **264px**: logo + nombre "Gestión de Calidad / Universidad Continental", nav con "Resumen" y "Plan de Estudios" (resaltado con borde izquierdo morado), perfil de usuario abajo.
- Header de **64px**: breadcrumb + acciones contextuales.
- Contenido: `max-width: 1320px` centrado, padding 32–40px.

---

## 3. Pantallas y especificación funcional (RF completos)

### 3.1 Inicio / Resumen

No corresponde a RF específicos del módulo — es el shell de navegación.

Tarjeta grande destacada con degradado morado hacia "Plan de Estudios" (único módulo activo) + 3 tarjetas secundarias atenuadas "Próximamente" (Evaluaciones y Medición, Planes de Mejora, Cuerpo Docente).

---

### 3.2 Facultades

**UI:** grid de tarjetas (nombre, badge Activo/Inactivo, conteo de carreras, fecha), buscador, filtro por estado, botón "Nueva facultad" abre modal (nombre único, validación).

#### RF001 — Registrar facultad
*(Origen: Existente/Ampliado · Prioridad: Alta)*
- **Historia de usuario:** Como Administrador del sistema necesito registrar una facultad para organizar las carreras profesionales de la universidad.
- **Descripción:** Permite crear una facultad ingresando su nombre, la cual servirá como agrupador de una o varias carreras.
- **Actor(es):** Administrador del sistema (propuesto)
- **Precondiciones:** El usuario tiene sesión activa con permisos de administración.
- **Flujo principal:** 1) El usuario accede a la opción 'Nueva facultad'. 2) Ingresa el nombre. 3) El sistema valida unicidad. 4) El sistema guarda y muestra confirmación.
- **Flujos alternativos/excepciones:** Si el nombre ya existe, el sistema muestra un mensaje de error y no guarda el registro.
- **Resultado esperado:** La facultad queda registrada y disponible para asociar carreras.
- **Reglas de negocio:** RN1: El nombre de la facultad es obligatorio y único. RN2: Toda facultad se crea en estado Activo por defecto.

#### RF002 — Editar facultad
*(Origen: Existente · Prioridad: Media)*
- **Historia de usuario:** Como Administrador del sistema necesito editar una facultad creada para corregir o actualizar su información.
- **Descripción:** Permite modificar el nombre u otros datos de una facultad ya registrada.
- **Actor(es):** Administrador del sistema (propuesto)
- **Precondiciones:** La facultad existe y está activa.
- **Flujo principal:** 1) El usuario selecciona la facultad. 2) Modifica el nombre. 3) El sistema valida unicidad. 4) El sistema guarda los cambios.
- **Flujos alternativos/excepciones:** Si el nuevo nombre coincide con otra facultad existente, el sistema rechaza el cambio.
- **Resultado esperado:** Los datos de la facultad quedan actualizados.
- **Reglas de negocio:** RN1: No se permite dejar el nombre vacío. RN2: El cambio queda registrado en el histórico de la facultad.

#### RF003 — Visualizar listado de facultades
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario del sistema necesito visualizar todas las facultades creadas para seleccionar la que requiero gestionar.
- **Descripción:** Muestra un listado de todas las facultades registradas, activas e inactivas, con indicador de estado.
- **Actor(es):** Administrador del sistema, Director de carrera, Usuario consultor (propuestos)
- **Precondiciones:** El usuario tiene sesión activa.
- **Flujo principal:** 1) El usuario accede al módulo de facultades. 2) El sistema recupera y lista las facultades registradas.
- **Flujos alternativos/excepciones:** Si no existen facultades registradas, el sistema muestra un mensaje indicando listado vacío.
- **Resultado esperado:** El usuario visualiza el listado completo de facultades.
- **Reglas de negocio:** RN1: El listado se muestra ordenado alfabéticamente por defecto.

#### RF004 — Acceder a una facultad para gestionar sus carreras
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito ingresar a una facultad específica para poder crear y gestionar sus carreras.
- **Descripción:** Permite navegar al detalle de una facultad para acceder a la gestión de carreras asociadas a ella.
- **Actor(es):** Administrador del sistema, Director de carrera (propuestos)
- **Precondiciones:** La facultad seleccionada existe y está activa.
- **Flujo principal:** 1) El usuario selecciona una facultad del listado. 2) El sistema muestra el detalle y las carreras asociadas.
- **Flujos alternativos/excepciones:** Si la facultad fue inactivada, el sistema advierte que no se pueden crear nuevas carreras en ella.
- **Resultado esperado:** El usuario visualiza el detalle de la facultad y accede a la gestión de sus carreras.
- **Reglas de negocio:** RN1: Solo se listan carreras asociadas a la facultad seleccionada.

#### RF005 — Inactivar facultad
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como Administrador del sistema necesito inactivar una facultad para evitar que se sigan asociando nuevas carreras cuando ya no está en uso.
- **Descripción:** Permite cambiar el estado de una facultad a Inactivo sin eliminar la información histórica asociada.
- **Actor(es):** Administrador del sistema (propuesto)
- **Precondiciones:** La facultad existe y está en estado Activo.
- **Flujo principal:** 1) El usuario selecciona 'Inactivar' sobre la facultad. 2) El sistema solicita confirmación. 3) El sistema cambia el estado a Inactivo.
- **Flujos alternativos/excepciones:** Si la facultad tiene carreras con planes vigentes, el sistema advierte antes de confirmar.
- **Resultado esperado:** La facultad queda inactiva y no admite nuevas carreras.
- **Reglas de negocio:** RN1: No se elimina físicamente el registro. RN2: Las carreras y planes existentes permanecen consultables.

#### RF006 — Validar unicidad del nombre de facultad
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo validar que no existan dos facultades con el mismo nombre para mantener la integridad de la información.
- **Descripción:** Ejecuta una validación automática de duplicidad al crear o editar una facultad.
- **Actor(es):** Sistema
- **Precondiciones:** Se está creando o editando una facultad.
- **Flujo principal:** 1) El sistema recibe el nombre ingresado. 2) Compara contra los registros existentes. 3) Permite o bloquea el guardado.
- **Flujos alternativos/excepciones:** Si se detecta coincidencia (sin distinguir mayúsculas/minúsculas ni espacios), el sistema bloquea el guardado.
- **Resultado esperado:** Se evita la duplicidad de facultades en el sistema.
- **Reglas de negocio:** RN1: La comparación de unicidad no distingue mayúsculas ni espacios adicionales.

#### RF007 — Buscar facultad por nombre
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito buscar una facultad por nombre para ubicarla rápidamente sin recorrer todo el listado.
- **Descripción:** Permite ingresar texto parcial o completo del nombre de la facultad para filtrar el listado.
- **Actor(es):** Administrador del sistema, Director de carrera, Usuario consultor (propuestos)
- **Precondiciones:** Existen facultades registradas.
- **Flujo principal:** 1) El usuario ingresa un texto en el buscador. 2) El sistema filtra el listado en tiempo real.
- **Flujos alternativos/excepciones:** Si no hay coincidencias, el sistema muestra un mensaje de 'sin resultados'.
- **Resultado esperado:** El usuario visualiza únicamente las facultades que coinciden con el criterio de búsqueda.
- **Reglas de negocio:** RN1: La búsqueda no distingue mayúsculas/minúsculas.

#### RF008 — Consultar histórico de cambios de una facultad
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como Administrador del sistema necesito consultar el histórico de cambios de una facultad para fines de trazabilidad y auditoría.
- **Descripción:** Muestra un registro cronológico de las modificaciones realizadas sobre una facultad (creación, edición, inactivación).
- **Actor(es):** Administrador del sistema (propuesto)
- **Precondiciones:** La facultad tiene al menos un cambio registrado.
- **Flujo principal:** 1) El usuario accede a la opción 'Histórico' de la facultad. 2) El sistema muestra los cambios con usuario y fecha.
- **Flujos alternativos/excepciones:** Si no existen cambios posteriores a la creación, se muestra únicamente el registro de creación.
- **Resultado esperado:** El usuario visualiza la trazabilidad completa de la facultad.
- **Reglas de negocio:** RN1: Todo cambio queda asociado al usuario que lo realizó y a la fecha/hora exacta.

---

### 3.3 Carreras (dentro de una facultad)

**UI:** grid de tarjetas (nombre, código único ej. "ISI", badge estado, ciclos/años), modal crear/editar con nombre+código+duración en años (calcula ciclos = años×2 en vivo), validación de unicidad nombre+facultad y código global.

#### RF009 — Registrar carrera profesional
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito crear carreras profesionales ingresando su nombre para poder posteriormente definir su plan de estudios.
- **Descripción:** Permite registrar una nueva carrera profesional con su nombre y datos básicos.
- **Actor(es):** Administrador del sistema, Director de carrera (propuestos)
- **Precondiciones:** Existe al menos una facultad activa.
- **Flujo principal:** 1) El usuario accede a 'Nueva carrera' dentro de una facultad. 2) Ingresa el nombre. 3) El sistema valida y guarda.
- **Flujos alternativos/excepciones:** Si el nombre ya existe dentro de la misma facultad, el sistema rechaza el registro.
- **Resultado esperado:** La carrera queda registrada y asociada a la facultad seleccionada (relación uno a muchos: una facultad puede tener varias carreras, pero una carrera pertenece a una sola facultad).
- **Reglas de negocio:** RN1: Toda carrera debe pertenecer obligatoriamente a una facultad.

#### RF011 — Definir cantidad de ciclos de la carrera
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito definir la cantidad de ciclos de la carrera, considerando que por año académico existen 2 ciclos.
- **Descripción:** Permite establecer el número total de ciclos académicos que tendrá la carrera, usado como base para estructurar el plan de estudios.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La carrera está registrada.
- **Flujo principal:** 1) El usuario ingresa el número de ciclos o el número de años (el sistema calcula ciclos = años x 2). 2) El sistema valida y guarda.
- **Flujos alternativos/excepciones:** Si el valor ingresado no es un número entero positivo, el sistema rechaza el dato.
- **Resultado esperado:** La carrera queda configurada con el número de ciclos que estructurarán su malla curricular.
- **Reglas de negocio:** RN1: El número de ciclos debe ser un entero positivo. RN2: Por convención, cada año equivale a 2 ciclos.

#### RF012 — Editar carrera
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito editar los datos de una carrera registrada para corregir o actualizar su información.
- **Descripción:** Permite modificar el nombre, código o cantidad de ciclos de una carrera existente.
- **Actor(es):** Director de carrera, Administrador del sistema (propuestos)
- **Precondiciones:** La carrera existe.
- **Flujo principal:** 1) El usuario selecciona la carrera. 2) Modifica los datos. 3) El sistema valida y guarda los cambios.
- **Flujos alternativos/excepciones:** Si la carrera ya tiene un plan de estudios Aprobado o Vigente, el sistema restringe la edición del número de ciclos.
- **Resultado esperado:** Los datos de la carrera quedan actualizados.
- **Reglas de negocio:** RN1: No se permite reducir el número de ciclos si existen asignaturas asociadas a ciclos que serían eliminados.

#### RF013 — Visualizar listado de carreras
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder visualizar todas las carreras creadas para seleccionar la que requiero gestionar.
- **Descripción:** Muestra el listado de carreras registradas, con su facultad y estado.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** El usuario tiene sesión activa.
- **Flujo principal:** 1) El usuario accede al listado de carreras. 2) El sistema recupera y muestra el listado.
- **Flujos alternativos/excepciones:** Si no existen carreras registradas, el sistema muestra listado vacío.
- **Resultado esperado:** El usuario visualiza el listado completo de carreras.
- **Reglas de negocio:** RN1: El listado puede filtrarse por facultad.

#### RF014 — Acceder a una carrera para gestionar su plan de estudios
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito ingresar a cada carrera creada para poder crear el plan de estudios.
- **Descripción:** Permite navegar al detalle de una carrera para acceder a la gestión de su(s) plan(es) de estudio.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La carrera existe y está activa.
- **Flujo principal:** 1) El usuario selecciona una carrera. 2) El sistema muestra el detalle y los planes de estudio asociados.
- **Flujos alternativos/excepciones:** Si la carrera no tiene ciclos definidos, el sistema solicita completarlos antes de crear un plan.
- **Resultado esperado:** El usuario accede a la gestión del plan de estudios de la carrera.
- **Reglas de negocio:** RN1: No se puede crear un plan de estudios sin que la carrera tenga ciclos definidos.

#### RF015 — Validar unicidad del nombre/código de carrera dentro de la facultad
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo validar que no existan dos carreras con el mismo nombre dentro de la misma facultad.
- **Descripción:** Ejecuta una validación automática de duplicidad al crear o editar una carrera.
- **Actor(es):** Sistema
- **Precondiciones:** Se está creando o editando una carrera.
- **Flujo principal:** 1) El sistema recibe el nombre/código. 2) Compara contra las carreras de la misma facultad. 3) Permite o bloquea el guardado.
- **Flujos alternativos/excepciones:** Si existe coincidencia, el sistema bloquea el guardado y notifica el conflicto.
- **Resultado esperado:** Se evita la duplicidad de carreras dentro de una misma facultad.
- **Reglas de negocio:** RN1: El mismo nombre puede repetirse en facultades distintas, no dentro de la misma.

#### RF016 — Buscar y filtrar carreras
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito buscar y filtrar carreras por nombre o facultad para ubicarlas rápidamente.
- **Descripción:** Permite filtrar el listado de carreras por texto de búsqueda y/o por facultad.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** Existen carreras registradas.
- **Flujo principal:** 1) El usuario ingresa criterios de búsqueda/filtro. 2) El sistema actualiza el listado en tiempo real.
- **Flujos alternativos/excepciones:** Si no hay coincidencias, se muestra mensaje de 'sin resultados'.
- **Resultado esperado:** El usuario visualiza únicamente las carreras que cumplen los criterios indicados.
- **Reglas de negocio:** RN1: Los filtros pueden combinarse (nombre + facultad + estado).

#### RF017 — Registrar código/abreviatura de la carrera
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito registrar un código o abreviatura de la carrera para identificarla de forma corta en reportes y documentos.
- **Descripción:** Permite asignar un código único a la carrera, utilizado en la generación de códigos de planes y asignaturas.
- **Actor(es):** Director de carrera, Administrador del sistema (propuestos)
- **Precondiciones:** La carrera está registrada.
- **Flujo principal:** 1) El usuario ingresa el código al crear/editar la carrera. 2) El sistema valida unicidad. 3) El sistema guarda.
- **Flujos alternativos/excepciones:** Si el código ya existe, el sistema solicita uno diferente.
- **Resultado esperado:** La carrera queda identificada con un código único.
- **Reglas de negocio:** RN1: El código debe ser único a nivel de toda la universidad.

#### RF018 — Inactivar carrera
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito inactivar una carrera que ya no se ofrece, sin perder su información histórica.
- **Descripción:** Cambia el estado de la carrera a Inactivo, impidiendo la creación de nuevos planes pero conservando el histórico.
- **Actor(es):** Administrador del sistema (propuesto)
- **Precondiciones:** La carrera existe y está Activa.
- **Flujo principal:** 1) El usuario selecciona 'Inactivar'. 2) El sistema solicita confirmación. 3) El sistema cambia el estado.
- **Flujos alternativos/excepciones:** Si la carrera tiene un plan Vigente, el sistema advierte las implicancias antes de confirmar.
- **Resultado esperado:** La carrera queda inactiva conservando sus planes históricos consultables.
- **Reglas de negocio:** RN1: No se elimina físicamente el registro ni sus planes asociados.

#### RF019 — Consultar histórico de cambios de una carrera
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito consultar el histórico de cambios de una carrera para fines de trazabilidad.
- **Descripción:** Muestra un registro cronológico de las modificaciones realizadas sobre la carrera.
- **Actor(es):** Director de carrera, Administrador del sistema (propuestos)
- **Precondiciones:** La carrera tiene al menos un cambio registrado.
- **Flujo principal:** 1) El usuario accede a 'Histórico' de la carrera. 2) El sistema muestra los cambios con usuario y fecha.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El usuario visualiza la trazabilidad completa de la carrera.
- **Reglas de negocio:** RN1: Todo cambio queda asociado al usuario y fecha/hora exacta.

---

### 3.4 Plan de Estudios (hub central de una carrera)

**UI:** header con código autogenerado del plan (ej. "PE-ISI-2026-v1"), badge de estado del ciclo de vida, selector de versión/histórico. Stepper horizontal de 5 estados: Borrador → En revisión → Aprobado → Vigente → Histórico. 4 tarjetas de métricas (código, total créditos, ciclos de la carrera, duración del plan editable). Banner de validación con inconsistencias bloqueantes + botón "Enviar a revisión" (deshabilitado si hay bloqueos); en "En revisión" muestra acciones Observar/Aprobar; en estados bloqueados (Aprobado/Vigente/Histórico) deshabilita edición y ofrece "Nueva versión". Sección "Estructura académica" (accesos a Facultades/Carreras) y "Secciones de este plan" (4 filas enlazando a 3.5–3.8).

Esta pantalla concentra cuatro subprocesos del documento fuente: **Configuración General (RF020–RF032)**, **Versionado e Historial (RF075–RF084)**, **Aprobación y Validación (RF085–RF093)** y **Validaciones de Consistencia (RF094–RF100)**.

#### Configuración General del Plan de Estudios

##### RF020 — Crear plan de estudios asociado a una carrera
*(Origen: Existente/Ampliado · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito crear un plan de estudios para una carrera, definiendo sus datos generales.
- **Descripción:** Permite iniciar el registro de un nuevo plan de estudios vinculado a una carrera, en estado inicial Borrador.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La carrera existe, está activa y tiene ciclos definidos.
- **Flujo principal:** 1) El usuario accede a 'Nuevo plan de estudios'. 2) Ingresa datos generales. 3) El sistema crea el plan en estado Borrador.
- **Flujos alternativos/excepciones:** Si la carrera no tiene ciclos definidos, el sistema impide continuar.
- **Resultado esperado:** Se crea un nuevo plan de estudios en estado Borrador, listo para ser configurado.
- **Reglas de negocio:** RN1: Un plan de estudios siempre nace en estado Borrador. RN2: Un plan pertenece a una única carrera.

##### RF021 — Definir duración del plan de estudios
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito definir la duración del plan de estudio para establecer el horizonte temporal de la carrera.
- **Descripción:** Permite registrar la duración total del plan en años.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan de estudios está en estado Borrador.
- **Flujo principal:** 1) El usuario ingresa la duración. 2) El sistema guarda.
- **Resultado esperado:** El plan queda configurado con su duración total.

##### RF022 — Generar código único del plan de estudios
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo generar automáticamente un código único para cada plan de estudios creado.
- **Descripción:** Genera un identificador único (p. ej. código de carrera + año + versión) al crear el plan.
- **Actor(es):** Sistema
- **Precondiciones:** Se está creando un nuevo plan de estudios.
- **Flujo principal:** 1) El sistema toma el código de la carrera y el correlativo de versión. 2) Genera el código. 3) Lo asigna al plan.
- **Flujos alternativos/excepciones:** No aplica; el código se genera de forma automática y no editable.
- **Resultado esperado:** Cada plan de estudios queda identificado de forma única e irrepetible.
- **Reglas de negocio:** RN1: El código generado no puede ser editado manualmente.

##### RF023 — Definir fecha de vigencia del plan de estudios
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito definir la fecha desde la cual el plan de estudios entrará en vigencia.
- **Descripción:** Permite registrar la fecha de inicio de vigencia del plan, utilizada para reportes y control histórico.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan de estudios existe.
- **Flujo principal:** 1) El usuario ingresa la fecha de vigencia. 2) El sistema valida el formato. 3) El sistema guarda.
- **Flujos alternativos/excepciones:** Si la fecha ingresada es anterior a la fecha de creación del plan, el sistema solicita confirmación.
- **Resultado esperado:** El plan queda con una fecha de vigencia definida.
- **Reglas de negocio:** RN1: La fecha de vigencia solo puede activarse cuando el plan se encuentra Aprobado (ver RF026).

##### RF024 — Editar plan de estudios en estado Borrador
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito editar un plan de estudios mientras se encuentra en estado Borrador para completar o corregir su configuración.
- **Descripción:** Permite modificar libremente los datos generales del plan mientras no haya sido enviado a revisión.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan se encuentra en estado Borrador.
- **Flujo principal:** 1) El usuario selecciona el plan. 2) Modifica los datos generales. 3) El sistema guarda los cambios.
- **Flujos alternativos/excepciones:** Si el plan ya no está en Borrador, el sistema bloquea la edición directa (ver RF027).
- **Resultado esperado:** Los datos generales del plan quedan actualizados.
- **Reglas de negocio:** RN1: Solo se permite edición libre en estado Borrador.

##### RF025 — Definir y gestionar el estado del plan de estudios
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo gestionar el ciclo de vida del plan de estudios mediante estados definidos, para reflejar su nivel de madurez y control de calidad.
- **Descripción:** Establece los estados posibles del plan: Borrador, En revisión, Aprobado, Vigente, Histórico.
- **Actor(es):** Sistema
- **Precondiciones:** El plan de estudios existe.
- **Flujo principal:** 1) El sistema asigna el estado Borrador al crear el plan. 2) El estado cambia según las transiciones definidas (ver RF026).
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Todo plan de estudios cuenta en todo momento con un estado válido y trazable.
- **Reglas de negocio:** RN1: Las transiciones de estado siguen una secuencia definida: Borrador → En revisión → Aprobado → Vigente → Histórico.

##### RF026 — Cambiar el estado del plan de estudios
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario autorizado necesito cambiar el estado de un plan de estudios para reflejar su avance en el proceso de calidad.
- **Descripción:** Permite ejecutar una transición de estado válida sobre el plan de estudios, respetando el flujo definido.
- **Actor(es):** Director de carrera, Coordinador académico (según permisos, propuestos)
- **Precondiciones:** El plan existe y la transición solicitada es válida según su estado actual.
- **Flujo principal:** 1) El usuario selecciona la nueva transición. 2) El sistema valida que sea permitida. 3) El sistema actualiza el estado y registra el cambio.
- **Flujos alternativos/excepciones:** Si la transición no es válida para el estado actual, el sistema la rechaza.
- **Resultado esperado:** El plan de estudios queda en el nuevo estado, con el cambio registrado en su histórico.
- **Reglas de negocio:** RN1: No se permiten saltos de estado fuera de la secuencia definida. RN2: Todo cambio de estado se registra con usuario y fecha.

##### RF027 — Restringir edición de planes en estado Aprobado o Vigente
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo impedir la edición directa de un plan de estudios Aprobado o Vigente para preservar la integridad de la información oficial.
- **Descripción:** Bloquea la modificación de datos generales, asignaturas y malla curricular cuando el plan no está en Borrador o En revisión.
- **Actor(es):** Sistema
- **Precondiciones:** El plan se encuentra en estado Aprobado o Vigente.
- **Flujo principal:** 1) El usuario intenta editar el plan. 2) El sistema detecta el estado. 3) El sistema bloquea la edición y sugiere generar una nueva versión.
- **Flujos alternativos/excepciones:** Si el usuario requiere modificar un plan Vigente, debe generar una nueva versión (ver RF075).
- **Resultado esperado:** Se preserva la integridad de los planes oficiales aprobados.
- **Reglas de negocio:** RN1: Toda modificación a un plan Aprobado/Vigente exige la creación de una nueva versión.

##### RF028 — Asociar objetivos educacionales al plan de estudios
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito asociar objetivos educacionales al plan de estudios para reflejar su propósito formativo.
- **Descripción:** Permite vincular uno o varios objetivos educacionales previamente registrados a un plan de estudios específico.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existen objetivos educacionales registrados; el plan está en Borrador o En revisión.
- **Flujo principal:** 1) El usuario selecciona objetivos educacionales disponibles. 2) El sistema los asocia al plan. 3) El sistema guarda la relación.
- **Flujos alternativos/excepciones:** Si no existen objetivos registrados, el sistema sugiere crearlos primero.
- **Resultado esperado:** El plan de estudios queda vinculado a sus objetivos educacionales.
- **Reglas de negocio:** RN1: Un plan puede tener uno o varios objetivos educacionales.

##### RF029 — Asociar competencias generales al plan de estudios
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito asociar competencias generales al plan de estudios para reflejar el perfil de egreso.
- **Descripción:** Permite vincular competencias previamente registradas al nivel general del plan de estudios (no solo a nivel de asignatura).
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existen competencias registradas; el plan está en Borrador o En revisión.
- **Flujo principal:** 1) El usuario selecciona competencias disponibles. 2) El sistema las asocia al plan. 3) El sistema guarda la relación.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El plan de estudios queda vinculado a sus competencias generales.
- **Reglas de negocio:** RN1: Una competencia puede estar asociada a varios planes de distintas carreras.

##### RF030 — Consultar planes de estudio por carrera
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito consultar los planes de estudio existentes de una carrera para revisar su evolución.
- **Descripción:** Muestra el listado de todos los planes (vigentes e históricos) asociados a una carrera específica.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** La carrera tiene al menos un plan registrado.
- **Flujo principal:** 1) El usuario selecciona la carrera. 2) El sistema lista los planes asociados con su estado.
- **Flujos alternativos/excepciones:** Si la carrera no tiene planes, se muestra mensaje correspondiente.
- **Resultado esperado:** El usuario visualiza todos los planes de estudio de la carrera.
- **Reglas de negocio:** RN1: El listado se ordena por fecha de creación descendente.

##### RF031 — Consultar planes de estudio por estado
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito filtrar los planes de estudio por su estado para identificar rápidamente los que requieren atención.
- **Descripción:** Permite filtrar el listado global de planes de estudio según su estado (Borrador, En revisión, Aprobado, Vigente, Histórico).
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existen planes de estudio registrados.
- **Flujo principal:** 1) El usuario selecciona un estado como filtro. 2) El sistema actualiza el listado.
- **Flujos alternativos/excepciones:** Si no hay planes en el estado seleccionado, se muestra listado vacío.
- **Resultado esperado:** El usuario visualiza únicamente los planes que se encuentran en el estado indicado.
- **Reglas de negocio:** RN1: El filtro puede combinarse con el de carrera (RF030).

##### RF032 — Eliminar plan de estudios en estado Borrador
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito poder eliminar un plan de estudios que se encuentra en Borrador y ya no es necesario.
- **Descripción:** Permite la eliminación definitiva de un plan de estudios únicamente mientras se encuentra en estado Borrador.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan está en estado Borrador.
- **Flujo principal:** 1) El usuario selecciona 'Eliminar' sobre el plan. 2) El sistema solicita confirmación. 3) El sistema elimina el registro.
- **Flujos alternativos/excepciones:** Si el plan no está en Borrador, el sistema impide la eliminación y sugiere inactivarlo en su lugar.
- **Resultado esperado:** El plan en Borrador queda eliminado del sistema.
- **Reglas de negocio:** RN1: Un plan que haya avanzado de estado Borrador no puede eliminarse, solo puede quedar como Histórico.

#### Versionado, Historial y Trazabilidad

##### RF075 — Generar una nueva versión del plan de estudios
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito generar una nueva versión de un plan de estudios Vigente cuando se requiera modificarlo, para no alterar la versión oficial en uso.
- **Descripción:** Crea una copia editable del plan Vigente, en estado Borrador, manteniendo la versión anterior intacta como referencia histórica.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existe un plan de estudios en estado Vigente para la carrera.
- **Flujo principal:** 1) El usuario selecciona 'Nueva versión'. 2) El sistema clona el plan vigente con un nuevo correlativo de versión. 3) El sistema deja la copia en Borrador.
- **Flujos alternativos/excepciones:** Si ya existe una versión en Borrador o En revisión para la misma carrera, el sistema advierte antes de crear otra.
- **Resultado esperado:** Se genera una nueva versión editable, sin afectar el plan Vigente actual.
- **Reglas de negocio:** RN1: La versión anterior pasa a estar disponible como referencia mientras la nueva no sea aprobada.

##### RF076 — Consultar versiones anteriores del plan de estudios
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito consultar las versiones anteriores de un plan de estudios para revisar su evolución.
- **Descripción:** Muestra el listado de todas las versiones generadas de un plan de estudios de una carrera, con su estado y fecha.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** El plan tiene más de una versión registrada.
- **Flujo principal:** 1) El usuario accede a 'Versiones' del plan. 2) El sistema lista las versiones con su estado y fecha de vigencia.
- **Flujos alternativos/excepciones:** Si solo existe una versión, se muestra únicamente esta.
- **Resultado esperado:** El usuario visualiza el historial de versiones del plan de estudios.
- **Reglas de negocio:** RN1: Las versiones se numeran de forma correlativa y no editable.

##### RF077 — Comparar dos versiones de un mismo plan de estudios
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito comparar dos versiones de un mismo plan de estudios para identificar los cambios realizados entre ellas.
- **Descripción:** Genera una vista comparativa entre dos versiones seleccionadas del mismo plan, resaltando asignaturas agregadas, retiradas o modificadas.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan cuenta con al menos dos versiones registradas.
- **Flujo principal:** 1) El usuario selecciona dos versiones a comparar. 2) El sistema calcula las diferencias. 3) El sistema muestra el resultado comparativo.
- **Flujos alternativos/excepciones:** Si las versiones seleccionadas son idénticas, el sistema indica que no existen diferencias.
- **Resultado esperado:** El usuario visualiza claramente los cambios entre dos versiones del plan.
- **Reglas de negocio:** RN1: La comparación se limita a versiones de un mismo plan/carrera; no aplica entre universidades distintas (ver requerimiento pendiente RF-PEND-01).

##### RF078 — Registrar histórico de modificaciones del plan
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo registrar de forma automática cada modificación relevante realizada sobre un plan de estudios.
- **Descripción:** Guarda un registro cronológico de cambios (datos generales, asignaturas, malla, estado) asociados al plan de estudios.
- **Actor(es):** Sistema
- **Precondiciones:** Se realiza una modificación sobre el plan de estudios.
- **Flujo principal:** 1) El sistema detecta el cambio. 2) Registra el detalle, usuario y fecha/hora. 3) El registro queda disponible en el histórico del plan.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Todo cambio relevante del plan queda documentado para fines de auditoría.
- **Reglas de negocio:** RN1: El histórico no puede ser editado ni eliminado por los usuarios.

##### RF079 — Consultar planes de estudio históricos (no vigentes)
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito consultar planes de estudio que ya no están vigentes para fines de referencia o acreditación.
- **Descripción:** Permite acceder en modo solo lectura a planes de estudio con estado Histórico.
- **Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)
- **Precondiciones:** Existen planes en estado Histórico.
- **Flujo principal:** 1) El usuario filtra por estado Histórico. 2) El sistema muestra el listado. 3) El usuario accede al detalle en modo lectura.
- **Flujos alternativos/excepciones:** Si no existen planes históricos, se muestra listado vacío.
- **Resultado esperado:** El usuario consulta información histórica sin riesgo de alterarla.
- **Reglas de negocio:** RN1: Los planes históricos no admiten ninguna edición.

##### RF080 — Registrar usuario y fecha de cada modificación
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo registrar el usuario responsable y la fecha exacta de cada modificación realizada sobre el plan de estudios y sus componentes.
- **Descripción:** Complementa el histórico de cambios (RF078) asegurando la trazabilidad de autoría en cada registro.
- **Actor(es):** Sistema
- **Precondiciones:** El usuario tiene sesión activa e identificada.
- **Flujo principal:** 1) El sistema captura el usuario autenticado. 2) Asocia el usuario y timestamp a cada operación de escritura.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Toda modificación queda atribuida a un usuario y momento específico, sin ambigüedad.
- **Reglas de negocio:** RN1: No se permiten modificaciones anónimas o sin usuario identificado.

##### RF081 — Consultar una versión anterior en modo solo lectura
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito consultar el detalle completo de una versión anterior del plan sin poder modificarla.
- **Descripción:** Permite abrir el detalle de una versión no vigente del plan (datos generales, malla, asignaturas) en modo de solo consulta.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** La versión seleccionada no es la vigente.
- **Flujo principal:** 1) El usuario selecciona una versión del histórico. 2) El sistema despliega el detalle en modo lectura.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El usuario revisa la información completa de una versión anterior sin riesgo de alteración.
- **Reglas de negocio:** RN1: Ninguna acción de edición está disponible en esta vista.

##### RF082 — Marcar la versión vigente del plan de estudios
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo marcar automáticamente una única versión del plan como Vigente al momento de su aprobación definitiva.
- **Descripción:** Al aprobar una nueva versión, el sistema actualiza su estado a Vigente y transiciona la versión anterior a Histórico.
- **Actor(es):** Sistema
- **Precondiciones:** Una nueva versión del plan ha sido aprobada.
- **Flujo principal:** 1) El sistema detecta la aprobación de la nueva versión. 2) Cambia su estado a Vigente. 3) Cambia el estado de la versión anterior a Histórico.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Existe en todo momento una única versión Vigente por carrera.
- **Reglas de negocio:** RN1: Solo puede existir una versión Vigente por carrera a la vez (ver RF090).

##### RF083 — Impedir la modificación directa de versiones históricas
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo impedir cualquier modificación directa sobre una versión del plan que se encuentre en estado Histórico.
- **Descripción:** Bloquea toda operación de escritura sobre planes en estado Histórico, garantizando su inmutabilidad.
- **Actor(es):** Sistema
- **Precondiciones:** El plan/versión se encuentra en estado Histórico.
- **Flujo principal:** 1) El usuario intenta modificar un plan histórico. 2) El sistema detecta el estado. 3) El sistema bloquea la operación.
- **Flujos alternativos/excepciones:** No aplica; no existe excepción a esta regla.
- **Resultado esperado:** Se garantiza la inmutabilidad de los planes históricos como evidencia documental.
- **Reglas de negocio:** RN1: Ninguna versión Histórica puede ser editada, bajo ningún rol.

##### RF084 — Exportar el histórico de cambios de un plan de estudios
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito exportar el histórico de cambios de un plan de estudios para fines de evidencia documental o auditoría externa.
- **Descripción:** Genera un archivo (PDF o Excel) con el detalle cronológico de cambios registrados sobre el plan.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan tiene histórico de cambios registrado.
- **Flujo principal:** 1) El usuario selecciona 'Exportar histórico'. 2) El sistema genera el archivo. 3) El sistema entrega el archivo para descarga.
- **Flujos alternativos/excepciones:** Si no existen cambios registrados, el sistema informa que no hay datos para exportar.
- **Resultado esperado:** El usuario obtiene un archivo con la trazabilidad completa del plan.
- **Reglas de negocio:** RN1: El archivo generado no puede ser alterado desde el sistema una vez exportado.

#### Aprobación y Validación del Plan de Estudios

##### RF085 — Enviar el plan de estudios a revisión
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito enviar un plan de estudios a revisión cuando considero que está completo, para iniciar su proceso de validación.
- **Descripción:** Cambia el estado del plan de Borrador a En revisión, bloqueando su edición libre y habilitando el flujo de aprobación.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan está en Borrador y no presenta inconsistencias bloqueantes (ver RF097).
- **Flujo principal:** 1) El usuario selecciona 'Enviar a revisión'. 2) El sistema ejecuta la validación integral (RF097). 3) El sistema cambia el estado a En revisión.
- **Flujos alternativos/excepciones:** Si existen inconsistencias bloqueantes, el sistema impide el envío y muestra el detalle.
- **Resultado esperado:** El plan queda disponible para el proceso de aprobación.
- **Reglas de negocio:** RN1: Solo un plan sin inconsistencias bloqueantes puede enviarse a revisión.

##### RF086 — Aprobar el plan de estudios
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario con permiso de aprobación necesito aprobar un plan de estudios en revisión para autorizar su puesta en vigencia.
- **Descripción:** Ejecuta la transición del plan de En revisión a Aprobado, dejando registro del responsable de la aprobación.
- **Actor(es):** Director de carrera / Autoridad universitaria (rol propuesto, pendiente de definición oficial)
- **Precondiciones:** El plan se encuentra En revisión.
- **Flujo principal:** 1) El usuario revisa el plan. 2) Selecciona 'Aprobar'. 3) El sistema registra la aprobación y cambia el estado.
- **Flujos alternativos/excepciones:** Si el usuario no cuenta con el permiso de aprobación, el sistema deniega la acción.
- **Resultado esperado:** El plan queda en estado Aprobado, listo para su activación como Vigente.
- **Reglas de negocio:** RN1: Solo roles con permiso explícito de aprobación pueden ejecutar esta acción (pendiente de validación de rol oficial).

##### RF087 — Rechazar u observar el plan de estudios con comentarios
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario con permiso de aprobación necesito poder rechazar u observar un plan de estudios en revisión, indicando los motivos.
- **Descripción:** Permite devolver el plan a estado Borrador junto con comentarios que expliquen las observaciones encontradas.
- **Actor(es):** Director de carrera / Autoridad universitaria (rol propuesto)
- **Precondiciones:** El plan se encuentra En revisión.
- **Flujo principal:** 1) El usuario selecciona 'Observar/Rechazar'. 2) Ingresa el comentario de motivo. 3) El sistema regresa el plan a Borrador y notifica al responsable.
- **Flujos alternativos/excepciones:** Si no se ingresa un comentario, el sistema exige al menos una observación antes de continuar.
- **Resultado esperado:** El plan regresa a Borrador con las observaciones registradas para su corrección.
- **Reglas de negocio:** RN1: Toda observación debe quedar registrada como parte del histórico del plan.

##### RF088 — Registrar al responsable de la aprobación
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo registrar el usuario responsable que aprobó un plan de estudios, para efectos de trazabilidad.
- **Descripción:** Asocia de forma automática el usuario y fecha/hora a cada acción de aprobación ejecutada.
- **Actor(es):** Sistema
- **Precondiciones:** Se ejecuta una acción de aprobación.
- **Flujo principal:** 1) El sistema captura el usuario autenticado que aprueba. 2) Registra el dato junto con la fecha/hora en el histórico del plan.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Cada aprobación queda documentada con su responsable identificado.
- **Reglas de negocio:** RN1: El dato de responsable de aprobación no puede modificarse posteriormente.

##### RF089 — Consultar el historial de aprobaciones
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito consultar el historial de aprobaciones y observaciones de un plan de estudios para revisar su proceso de validación.
- **Descripción:** Muestra el listado cronológico de acciones de envío a revisión, aprobaciones, observaciones y rechazos del plan.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan tiene al menos una acción del flujo de aprobación registrada.
- **Flujo principal:** 1) El usuario accede a 'Historial de aprobaciones'. 2) El sistema muestra la secuencia de acciones con responsables y fechas.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El usuario visualiza el proceso completo de validación del plan.
- **Reglas de negocio:** RN1: El historial es de solo lectura.

##### RF090 — Validar que exista un único plan vigente por carrera
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo garantizar que una carrera tenga, como máximo, un único plan de estudios en estado Vigente en un momento dado.
- **Descripción:** Ejecuta una validación al aprobar/activar un plan, asegurando que no existan dos versiones Vigentes simultáneas para la misma carrera.
- **Actor(es):** Sistema
- **Precondiciones:** Se está activando un plan como Vigente.
- **Flujo principal:** 1) El sistema verifica si existe otro plan Vigente para la carrera. 2) Si existe, lo transiciona automáticamente a Histórico (ver RF082).
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Se mantiene la unicidad del plan vigente por carrera en todo momento.
- **Reglas de negocio:** RN1: Regla de negocio crítica para la integridad del módulo.

##### RF091 — Bloquear la aprobación si existen inconsistencias no resueltas
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo impedir la aprobación de un plan de estudios mientras existan inconsistencias no resueltas o no justificadas.
- **Descripción:** Verifica el resultado de las validaciones de consistencia (grupo Validaciones de Consistencia) antes de permitir la transición a Aprobado.
- **Actor(es):** Sistema
- **Precondiciones:** El plan se encuentra En revisión.
- **Flujo principal:** 1) El sistema ejecuta la validación integral (RF097). 2) Si hay inconsistencias no justificadas, bloquea la aprobación y detalla el motivo.
- **Flujos alternativos/excepciones:** Si todas las inconsistencias fueron justificadas (RF099), el sistema permite continuar con la aprobación.
- **Resultado esperado:** Solo se aprueban planes consistentes o con excepciones debidamente justificadas.
- **Reglas de negocio:** RN1: Ninguna aprobación puede ejecutarse mientras existan inconsistencias críticas sin resolver.

##### RF092 — Generar evidencia documental de la aprobación
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito generar un documento que evidencie la aprobación de un plan de estudios, para fines de acreditación institucional.
- **Descripción:** Genera un documento (PDF) con el detalle del plan aprobado, responsable y fecha de aprobación, como evidencia para procesos de calidad.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan se encuentra en estado Aprobado.
- **Flujo principal:** 1) El usuario selecciona 'Generar evidencia de aprobación'. 2) El sistema compila los datos. 3) El sistema entrega el documento.
- **Flujos alternativos/excepciones:** Pendiente de validación: el formato oficial del documento de evidencia debe ser definido por la universidad.
- **Resultado esperado:** El usuario obtiene un documento formal de respaldo de la aprobación del plan.
- **Reglas de negocio:** RN1: El formato exacto del documento queda pendiente de validación institucional.

##### RF093 — Visualizar el estado actual del plan de estudios
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito visualizar en todo momento el estado actual de un plan de estudios para conocer su situación dentro del proceso de calidad.
- **Descripción:** Muestra de forma visible el estado vigente del plan (Borrador, En revisión, Aprobado, Vigente, Histórico) en toda vista relacionada.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** El plan de estudios existe.
- **Flujo principal:** 1) El usuario accede al plan. 2) El sistema muestra el estado actual de forma destacada.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El usuario identifica de forma inmediata la situación del plan de estudios.
- **Reglas de negocio:** RN1: El estado mostrado siempre corresponde al valor vigente en el sistema, sin caché desactualizado.

#### Validaciones de Consistencia (Calidad) — alimentan el banner de la pantalla

##### RF094 — Validar que cada asignatura tenga al menos una competencia asociada
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo validar que toda asignatura del plan cuente con al menos una competencia asociada antes de habilitar su aprobación.
- **Descripción:** Ejecuta una verificación de completitud sobre cada asignatura respecto a sus competencias vinculadas.
- **Actor(es):** Sistema
- **Precondiciones:** El plan está siendo enviado a revisión o aprobación.
- **Flujo principal:** 1) El sistema recorre las asignaturas del plan. 2) Identifica las que no tienen competencias asociadas. 3) Reporta la inconsistencia.
- **Flujos alternativos/excepciones:** Si todas las asignaturas cumplen la condición, la validación pasa sin observaciones.
- **Resultado esperado:** Se garantiza la coherencia entre asignaturas y competencias antes de la aprobación.
- **Reglas de negocio:** RN1: Esta validación es bloqueante para la aprobación.

##### RF095 — Validar que el plan tenga al menos un objetivo educacional registrado
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo validar que el plan de estudios cuente con al menos un objetivo educacional asociado antes de su aprobación.
- **Descripción:** Verifica la existencia de al menos una asociación de objetivo educacional al plan (ver RF028).
- **Actor(es):** Sistema
- **Precondiciones:** El plan está siendo enviado a revisión o aprobación.
- **Flujo principal:** 1) El sistema verifica las asociaciones de objetivos educacionales del plan. 2) Reporta si no existe ninguna.
- **Flujos alternativos/excepciones:** Si existe al menos un objetivo asociado, la validación pasa sin observaciones.
- **Resultado esperado:** Se garantiza que todo plan cuente con un propósito formativo declarado.
- **Reglas de negocio:** RN1: Esta validación es bloqueante para la aprobación.

##### RF096 — Detectar ciclos duplicados o mal numerados
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo detectar si existen ciclos duplicados o con numeración incorrecta dentro de la estructura del plan de estudios.
- **Descripción:** Verifica que la numeración de ciclos sea correlativa, única y coherente con la cantidad definida para la carrera.
- **Actor(es):** Sistema
- **Precondiciones:** La carrera tiene ciclos definidos.
- **Flujo principal:** 1) El sistema recorre los ciclos del plan. 2) Verifica correlatividad y unicidad. 3) Reporta cualquier anomalía detectada.
- **Flujos alternativos/excepciones:** Si la numeración es correcta, la validación pasa sin observaciones.
- **Resultado esperado:** Se mantiene una estructura de ciclos coherente y sin duplicidad.
- **Reglas de negocio:** RN1: Los ciclos deben numerarse de forma correlativa, del 1 al número total definido.

##### RF097 — Ejecutar una validación integral de consistencia del plan antes de su aprobación
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo ejecutar de forma consolidada todas las validaciones de consistencia del plan antes de permitir su envío a revisión o aprobación.
- **Descripción:** Orquesta la ejecución de las validaciones definidas (prerrequisitos circulares, coherencia de ciclos, asignaturas sin ciclo, competencias, objetivos, numeración de ciclos, entre otras) y consolida un resultado único.
- **Actor(es):** Sistema
- **Precondiciones:** El usuario solicita enviar el plan a revisión o aprobarlo.
- **Flujo principal:** 1) El sistema ejecuta cada validación registrada. 2) Consolida los resultados. 3) Permite continuar o bloquea mostrando el detalle de inconsistencias.
- **Flujos alternativos/excepciones:** Si existen inconsistencias no bloqueantes, el sistema permite continuar mostrando advertencias informativas.
- **Resultado esperado:** El usuario obtiene un diagnóstico integral de la calidad del plan antes de avanzar en su ciclo de vida.
- **Reglas de negocio:** RN1: Las validaciones se clasifican en bloqueantes y no bloqueantes (advertencias).

##### RF098 — Mostrar un reporte de inconsistencias detectadas
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito visualizar un reporte claro de las inconsistencias detectadas en el plan de estudios para poder corregirlas.
- **Descripción:** Presenta de forma organizada el resultado de la validación integral (RF097), agrupando las inconsistencias por tipo y asignatura/ciclo afectado.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Se ejecutó una validación integral sobre el plan.
- **Flujo principal:** 1) El sistema ejecuta la validación. 2) Genera el reporte de resultados. 3) El usuario visualiza el detalle.
- **Flujos alternativos/excepciones:** Si no se detectan inconsistencias, el sistema muestra un mensaje de conformidad.
- **Resultado esperado:** El usuario cuenta con información clara para corregir el plan antes de continuar el flujo de aprobación.
- **Reglas de negocio:** RN1: El reporte distingue entre observaciones bloqueantes y no bloqueantes.

##### RF099 — Registrar justificación de excepciones a las validaciones
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito registrar una justificación cuando una inconsistencia no bloqueante deba mantenerse por una razón académica válida.
- **Descripción:** Permite documentar el motivo por el cual una observación no bloqueante no será corregida antes de continuar el flujo del plan.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existe una inconsistencia no bloqueante detectada.
- **Flujo principal:** 1) El usuario selecciona la observación. 2) Ingresa la justificación. 3) El sistema registra la excepción en el histórico del plan.
- **Flujos alternativos/excepciones:** Las inconsistencias bloqueantes no admiten justificación; deben corregirse obligatoriamente.
- **Resultado esperado:** Las excepciones documentadas quedan disponibles como parte de la evidencia de calidad del plan.
- **Reglas de negocio:** RN1: Solo las inconsistencias no bloqueantes admiten justificación.

##### RF100 — Validar consistencia de los créditos totales del plan
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo validar que el total de créditos del plan de estudios se encuentre dentro de un rango esperado según la política académica de la carrera.
- **Descripción:** Compara el total de créditos calculado (RF067) contra un rango de referencia configurado para la carrera.
- **Actor(es):** Sistema
- **Precondiciones:** Se ha definido un rango de créditos totales esperado (pendiente de validación institucional).
- **Flujo principal:** 1) El sistema obtiene el total de créditos calculado. 2) Lo compara contra el rango configurado. 3) Reporta si está fuera de rango.
- **Flujos alternativos/excepciones:** Si no existe un rango configurado, el sistema omite la validación y solo informa el total.
- **Resultado esperado:** Se favorece la coherencia del plan respecto a los estándares académicos de la carrera.
- **Reglas de negocio:** RN1: El rango de créditos totales esperado depende de política institucional (pendiente de validación).

---

### 3.5 Objetivos Educacionales

**UI:** tabla con código autogenerado (OE-01, OE-02…), nombre, descripción, estado Activo/Inactivo con botón inactivar; modal crear/editar (código solo-lectura autogenerado).

#### RF033 — Registrar objetivo educacional
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito registrar los objetivos educacionales del plan de estudios mediante un formulario con nombre y descripción.
- **Descripción:** Permite crear un objetivo educacional con su nombre y descripción, para su posterior asociación al plan de estudios.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El usuario tiene sesión activa.
- **Flujo principal:** 1) El usuario accede a un Plan de Estudio. 2) Selecciona la opción nuevo "Objetivo Educacional". 3) Ingresa nombre y descripción. 4) El sistema guarda el registro.
- **Flujos alternativos/excepciones:** Si el nombre queda vacío, el sistema rechaza el registro.
- **Resultado esperado:** El objetivo educacional queda registrado y disponible asociado automáticamente al plan de estudio.
- **Reglas de negocio:** RN1: Nombre y descripción son obligatorios.

#### RF034 — Generar código automático del objetivo educacional
*(Origen: Existente · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo generar los códigos de cada objetivo educacional automáticamente.
- **Descripción:** Asigna un código correlativo único a cada objetivo educacional al momento de su creación.
- **Actor(es):** Sistema
- **Precondiciones:** Se está registrando un nuevo objetivo educacional.
- **Flujo principal:** 1) El sistema calcula el siguiente correlativo. 2) Asigna el código al objetivo. 3) Lo muestra en el registro guardado.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Cada objetivo educacional queda identificado con un código único.
- **Reglas de negocio:** RN1: El código no es editable manualmente.

#### RF035 — Visualizar objetivos educacionales
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder visualizar los objetivos educacionales creados.
- **Descripción:** Muestra el listado de objetivos educacionales registrados en el sistema.
- **Actor(es):** Director de carrera, Coordinador académico, Docente (propuestos)
- **Precondiciones:** El usuario tiene sesión activa.
- **Flujo principal:** 1) El usuario accede al listado de objetivos educacionales. 2) El sistema los muestra con su código y descripción.
- **Flujos alternativos/excepciones:** Si no existen objetivos registrados, se muestra listado vacío.
- **Resultado esperado:** El usuario visualiza el listado completo de objetivos educacionales.
- **Reglas de negocio:** RN1: El listado incluye código, nombre y estado (activo/inactivo).

#### RF036 — Editar objetivo educacional
*(Origen: Existente · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito poder editar los objetivos educacionales creados.
- **Descripción:** Permite modificar el nombre y/o descripción de un objetivo educacional existente.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El objetivo educacional existe.
- **Flujo principal:** 1) El usuario selecciona el objetivo. 2) Modifica los datos. 3) El sistema guarda los cambios.
- **Flujos alternativos/excepciones:** Si el objetivo está asociado a un plan Aprobado/Vigente, el sistema advierte el impacto antes de guardar.
- **Resultado esperado:** El objetivo educacional queda actualizado.
- **Reglas de negocio:** RN1: El código generado automáticamente no se modifica al editar.

#### RF037 — Inactivar objetivo educacional
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito inactivar un objetivo educacional que ya no se utiliza, sin eliminar su información histórica.
- **Descripción:** Cambia el estado del objetivo a Inactivo, desactivando su asociación al plan de estudio.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El objetivo existe y está activo.
- **Flujo principal:** 1) El usuario selecciona 'Inactivar'. 2) El sistema solicita confirmación. 3) El sistema cambia el estado.
- **Flujos alternativos/excepciones:** Si el objetivo está asociado a un plan Vigente, el sistema advierte antes de confirmar.
- **Resultado esperado:** El objetivo queda inactivo y se desactiva su asociación.
- **Reglas de negocio:** RN1: No se elimina físicamente el registro.

#### RF038 — Validar que no se elimine un objetivo educacional vinculado
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo impedir la eliminación de un objetivo educacional que se encuentra vinculado a uno o más planes de estudio.
- **Descripción:** Ejecuta una validación de integridad referencial antes de permitir la eliminación de un objetivo educacional.
- **Actor(es):** Sistema
- **Precondiciones:** Se solicita la eliminación de un objetivo educacional.
- **Flujo principal:** 1) El sistema verifica asociaciones existentes. 2) Si existen, bloquea la eliminación y sugiere inactivar en su lugar.
- **Flujos alternativos/excepciones:** Si no existen asociaciones, el sistema permite la eliminación definitiva.
- **Resultado esperado:** Se preserva la integridad referencial entre objetivos y planes de estudio.
- **Reglas de negocio:** RN1: Solo pueden eliminarse objetivos sin ninguna asociación registrada.

#### RF039 — Buscar objetivo educacional
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito buscar un objetivo educacional por nombre o código para ubicarlo rápidamente.
- **Descripción:** Permite filtrar el listado de objetivos educacionales por texto ingresado.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existen objetivos educacionales registrados.
- **Flujo principal:** 1) El usuario ingresa un criterio de búsqueda. 2) El sistema filtra el listado.
- **Flujos alternativos/excepciones:** Si no hay coincidencias, se muestra mensaje de 'sin resultados'.
- **Resultado esperado:** El usuario visualiza únicamente los objetivos que coinciden con el criterio.
- **Reglas de negocio:** RN1: La búsqueda aplica sobre nombre y código.

---

### 3.6 Competencias

**UI:** mismo patrón que Objetivos Educacionales: tabla con código autogenerado (CPE-01…), nombre, estado; modal crear/editar.

#### RF040 — Crear competencia
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder crear competencias, para lo cual necesito ingresar el nombre de la competencia.
- **Descripción:** Permite registrar una nueva competencia con su nombre, para su posterior vinculación a asignaturas y planes.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El usuario tiene sesión activa.
- **Flujo principal:** 1) El usuario accede a 'Nueva competencia'. 2) Ingresa el nombre. 3) El sistema guarda el registro.
- **Flujos alternativos/excepciones:** Si el nombre queda vacío, el sistema rechaza el registro.
- **Resultado esperado:** La competencia queda registrada y disponible para su uso.
- **Reglas de negocio:** RN1: El nombre de la competencia es obligatorio.

#### RF041 — Generar código automático de la competencia
*(Origen: Existente · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo poder generar los códigos de cada competencia automáticamente.
- **Descripción:** Asigna un código correlativo único a cada competencia al momento de su creación.
- **Actor(es):** Sistema
- **Precondiciones:** Se está registrando una nueva competencia.
- **Flujo principal:** 1) El sistema calcula el siguiente correlativo. 2) Asigna el código. 3) Lo muestra en el registro guardado.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Cada competencia queda identificada con un código único.
- **Reglas de negocio:** RN1: El código no es editable manualmente.

#### RF042 — Visualizar competencias
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder visualizar las competencias creadas.
- **Descripción:** Muestra el listado de competencias registradas en el sistema.
- **Actor(es):** Director de carrera, Coordinador académico, Docente (propuestos)
- **Precondiciones:** El usuario tiene sesión activa.
- **Flujo principal:** 1) El usuario accede al listado de competencias. 2) El sistema las muestra con código y nombre.
- **Flujos alternativos/excepciones:** Si no existen competencias registradas, se muestra listado vacío.
- **Resultado esperado:** El usuario visualiza el listado completo de competencias.
- **Reglas de negocio:** RN1: El listado indica si la competencia está activa o inactiva.

#### RF043 — Editar competencia
*(Origen: Existente · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito poder editar las competencias creadas.
- **Descripción:** Permite modificar el nombre u otros datos de una competencia existente.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La competencia existe.
- **Flujo principal:** 1) El usuario selecciona la competencia. 2) Modifica los datos. 3) El sistema guarda los cambios.
- **Flujos alternativos/excepciones:** Si la competencia está vinculada a asignaturas de un plan Aprobado/Vigente, el sistema advierte el impacto.
- **Resultado esperado:** La competencia queda actualizada.
- **Reglas de negocio:** RN1: El código generado automáticamente no se modifica al editar.

#### RF044 — Inactivar competencia
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito inactivar una competencia que ya no se utiliza, sin eliminar su información histórica.
- **Descripción:** Cambia el estado de la competencia a Inactivo, impidiendo su asociación a nuevas asignaturas.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La competencia existe y está activa.
- **Flujo principal:** 1) El usuario selecciona 'Inactivar'. 2) El sistema solicita confirmación. 3) El sistema cambia el estado.
- **Flujos alternativos/excepciones:** Si la competencia está vinculada a asignaturas de un plan Vigente, el sistema advierte antes de confirmar.
- **Resultado esperado:** La competencia queda inactiva y no disponible para nuevas asociaciones.
- **Reglas de negocio:** RN1: No se elimina físicamente el registro.

#### RF045 — Validar que no se elimine una competencia vinculada a asignaturas
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo impedir la eliminación de una competencia que se encuentra vinculada a una o más asignaturas.
- **Descripción:** Ejecuta una validación de integridad referencial antes de permitir la eliminación de una competencia.
- **Actor(es):** Sistema
- **Precondiciones:** Se solicita la eliminación de una competencia.
- **Flujo principal:** 1) El sistema verifica asociaciones con asignaturas. 2) Si existen, bloquea la eliminación y sugiere inactivar.
- **Flujos alternativos/excepciones:** Si no existen asociaciones, el sistema permite la eliminación definitiva.
- **Resultado esperado:** Se preserva la integridad referencial entre competencias y asignaturas.
- **Reglas de negocio:** RN1: Solo pueden eliminarse competencias sin ninguna asociación registrada.

#### RF046 — Buscar competencia
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito buscar una competencia por nombre o código para ubicarla rápidamente.
- **Descripción:** Permite filtrar el listado de competencias por texto ingresado.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existen competencias registradas.
- **Flujo principal:** 1) El usuario ingresa un criterio de búsqueda. 2) El sistema filtra el listado.
- **Flujos alternativos/excepciones:** Si no hay coincidencias, se muestra mensaje de 'sin resultados'.
- **Resultado esperado:** El usuario visualiza únicamente las competencias que coinciden con el criterio.
- **Reglas de negocio:** RN1: La búsqueda aplica sobre nombre y código.

---

### 3.7 Asignaturas

**UI:** tarjetas con código (ej. "ISI-101"), nombre, descripción, tipo (General/Transversal/Especialidad como badges de color), condición (Obligatoria/Electiva), créditos, horas teóricas/semana, chips de competencias vinculadas, badge "Sin ciclo asignado" si aplica. Filtro por tipo. Modal crear/editar con checklist de competencias (checkboxes).

#### RF047 — Crear asignatura (nombre y descripción)
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder crear una asignatura ingresando su nombre y descripción.
- **Descripción:** Permite registrar una nueva asignatura con su nombre y descripción como datos base.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan de estudios está en estado Borrador o En revisión.
- **Flujo principal:** 1) El usuario accede a 'Nueva asignatura'. 2) Ingresa nombre y descripción. 3) El sistema guarda el registro.
- **Flujos alternativos/excepciones:** Si el nombre queda vacío, el sistema rechaza el registro.
- **Resultado esperado:** La asignatura queda registrada y disponible para configurarse y asignarse a un ciclo.
- **Reglas de negocio:** RN1: Nombre y descripción son obligatorios.

#### RF048 — Clasificar tipo de asignatura (General/Transversal/Especialidad)
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder seleccionar el tipo de curso: General, Transversal o Especialidad.
- **Descripción:** Permite asignar una clasificación de tipo a la asignatura, utilizada posteriormente para filtrado y reportes.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura está siendo creada o editada.
- **Flujo principal:** 1) El usuario selecciona el tipo de curso de una lista cerrada. 2) El sistema guarda la clasificación.
- **Flujos alternativos/excepciones:** Si no se selecciona un tipo, el sistema no permite guardar la asignatura.
- **Resultado esperado:** La asignatura queda clasificada según su tipo.
- **Reglas de negocio:** RN1: El tipo de curso es obligatorio y de lista cerrada (General, Transversal, Especialidad).

#### RF049 — Vincular competencias a la asignatura
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito visualizar las competencias previamente creadas y poder vincularlas a la asignatura.
- **Descripción:** Permite seleccionar y asociar una o varias competencias existentes a la asignatura que se está registrando.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existen competencias activas registradas.
- **Flujo principal:** 1) El usuario visualiza el listado de competencias disponibles. 2) Selecciona las aplicables. 3) El sistema guarda la relación.
- **Flujos alternativos/excepciones:** Si no existen competencias registradas, el sistema sugiere crearlas primero.
- **Resultado esperado:** La asignatura queda vinculada a una o más competencias.
- **Reglas de negocio:** RN1: Una asignatura debe tener al menos una competencia asociada antes de aprobarse el plan (ver RF094).

#### RF050 — Editar asignatura
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito editar los datos de una asignatura registrada para corregir o completar su información.
- **Descripción:** Permite modificar nombre, descripción, tipo, créditos, horas y demás atributos de una asignatura.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura existe y el plan al que pertenece está en Borrador o En revisión.
- **Flujo principal:** 1) El usuario selecciona la asignatura. 2) Modifica los datos. 3) El sistema valida y guarda los cambios.
- **Flujos alternativos/excepciones:** Si el plan está Aprobado/Vigente, el sistema bloquea la edición directa (ver RF027).
- **Resultado esperado:** La asignatura queda actualizada.
- **Reglas de negocio:** RN1: La edición completa solo se permite mientras el plan no esté Aprobado/Vigente.

#### RF051 — Visualizar listado de asignaturas
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito visualizar el listado de asignaturas de un plan de estudios para conocer su configuración.
- **Descripción:** Muestra el listado de asignaturas registradas en un plan de estudios, con sus atributos principales.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** El plan de estudios tiene asignaturas registradas.
- **Flujo principal:** 1) El usuario accede al plan de estudios. 2) El sistema lista las asignaturas con tipo, créditos y ciclo asignado.
- **Flujos alternativos/excepciones:** Si no existen asignaturas registradas, se muestra listado vacío.
- **Resultado esperado:** El usuario visualiza el listado completo de asignaturas del plan.
- **Reglas de negocio:** RN1: El listado indica si la asignatura ya fue asignada a un ciclo.

#### RF052 — Inactivar asignatura
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito inactivar una asignatura que ya no se dictará, sin eliminar su información histórica.
- **Descripción:** Cambia el estado de la asignatura a Inactivo, conservando su registro para fines históricos.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura existe; el plan está en Borrador o En revisión.
- **Flujo principal:** 1) El usuario selecciona 'Inactivar'. 2) El sistema solicita confirmación. 3) El sistema cambia el estado.
- **Flujos alternativos/excepciones:** Si la asignatura es prerrequisito de otra, el sistema advierte el impacto antes de confirmar.
- **Resultado esperado:** La asignatura queda inactiva y se retira de la malla curricular activa.
- **Reglas de negocio:** RN1: No se elimina físicamente el registro.

#### RF053 — Generar código único de asignatura
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo generar un código único para cada asignatura registrada en el plan de estudios.
- **Descripción:** Asigna automáticamente un código correlativo o estructurado a cada asignatura creada.
- **Actor(es):** Sistema
- **Precondiciones:** Se está registrando una nueva asignatura.
- **Flujo principal:** 1) El sistema calcula el código según la carrera y el correlativo. 2) Asigna el código a la asignatura.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Cada asignatura queda identificada con un código único dentro del plan.
- **Reglas de negocio:** RN1: El código no es editable manualmente.

#### RF054 — Definir créditos académicos de la asignatura
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito definir los créditos académicos de la asignatura para el cálculo de la carga curricular.
- **Descripción:** Permite registrar el número de créditos asignados a la asignatura según la normativa académica de la carrera.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura está siendo creada o editada.
- **Flujo principal:** 1) El usuario ingresa el número de créditos. 2) El sistema valida que sea numérico positivo. 3) El sistema guarda.
- **Flujos alternativos/excepciones:** Si el valor no es numérico o es negativo, el sistema rechaza el dato.
- **Resultado esperado:** La asignatura queda con sus créditos académicos definidos.
- **Reglas de negocio:** RN1: Los créditos deben ser un valor numérico mayor a cero.

#### RF055 — Definir horas teóricas de la asignatura
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito definir las horas teóricas de la asignatura como parte de su carga horaria.
- **Descripción:** Permite registrar la cantidad de horas teóricas semanales o totales de la asignatura.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura está siendo creada o editada.
- **Flujo principal:** 1) El usuario ingresa las horas teóricas. 2) El sistema valida el valor. 3) El sistema guarda.
- **Flujos alternativos/excepciones:** Si el valor no es numérico, el sistema rechaza el dato.
- **Resultado esperado:** La asignatura queda con sus horas teóricas definidas.
- **Reglas de negocio:** RN1: El valor debe ser numérico y no negativo.

#### RF056 — Clasificar asignatura como obligatoria o electiva
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito clasificar una asignatura como obligatoria o electiva para reflejar su condición curricular.
- **Descripción:** Permite seleccionar la condición de la asignatura dentro del plan de estudios.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura está siendo creada o editada.
- **Flujo principal:** 1) El usuario selecciona la condición (obligatoria/electiva). 2) El sistema guarda el dato.
- **Flujos alternativos/excepciones:** Si no se selecciona, el sistema exige el dato antes de guardar.
- **Resultado esperado:** La asignatura queda clasificada según su condición curricular.
- **Reglas de negocio:** RN1: El campo es obligatorio y de lista cerrada.

#### RF057 — Filtrar asignaturas según su tipo
*(Origen: Existente/Ampliado · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo ser capaz de brindar la opción de filtrar los cursos según su tipo.
- **Descripción:** Permite filtrar el listado de asignaturas por tipo (General, Transversal, Especialidad), condición (obligatoria/electiva) y área de formación.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Existen asignaturas registradas en el plan.
- **Flujo principal:** 1) El usuario selecciona uno o varios filtros. 2) El sistema actualiza el listado de asignaturas.
- **Flujos alternativos/excepciones:** Si no hay coincidencias, se muestra mensaje de 'sin resultados'.
- **Resultado esperado:** El usuario visualiza únicamente las asignaturas que cumplen los filtros seleccionados.
- **Reglas de negocio:** RN1: Los filtros son combinables entre sí.

#### RF058 — Consultar asignaturas no asociadas a ningún ciclo
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito identificar las asignaturas que aún no han sido asignadas a un ciclo para completar la malla curricular.
- **Descripción:** Muestra un listado filtrado de asignaturas del plan que no tienen ciclo asignado.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan tiene asignaturas registradas.
- **Flujo principal:** 1) El usuario accede a la vista de malla curricular. 2) El sistema resalta o lista las asignaturas sin ciclo.
- **Flujos alternativos/excepciones:** Si todas las asignaturas ya tienen ciclo, el sistema indica que no hay pendientes.
- **Resultado esperado:** El usuario identifica rápidamente las asignaturas pendientes de ubicar en la malla.
- **Reglas de negocio:** RN1: Una asignatura sin ciclo asignado impide el envío del plan a aprobación (ver RF097).

#### RF059 — Registrar histórico de cambios de una asignatura
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito consultar el histórico de cambios de una asignatura para fines de trazabilidad y auditoría.
- **Descripción:** Registra automáticamente cada modificación relevante realizada sobre la asignatura (créditos, horas, prerrequisitos, competencias, etc.).
- **Actor(es):** Sistema / Director de carrera (consulta)
- **Precondiciones:** La asignatura tiene al menos un cambio registrado.
- **Flujo principal:** 1) El usuario accede a 'Histórico' de la asignatura. 2) El sistema muestra los cambios con usuario y fecha.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El usuario visualiza la trazabilidad completa de la asignatura.
- **Reglas de negocio:** RN1: Todo cambio queda asociado al usuario y fecha/hora exacta.

---

### 3.8 Ciclos Académicos y Malla Curricular

**UI:** panel lateral de asignaturas disponibles (drag-and-drop nativo, filtrable por tipo) + grid de los N ciclos de la carrera como zonas de drop, cada ciclo muestra total de cursos y créditos, botón "×" para quitar un curso; banner de alerta si hay asignaturas sin ciclo (bloquea envío del plan); botón "Generar PDF del plan" y "Excel" en el header.

#### RF060 — Visualizar los ciclos que componen la carrera
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito visualizar todos los ciclos que componen la carrera para organizar la malla curricular.
- **Descripción:** Muestra los ciclos definidos para la carrera (según RF011), como base de la estructura del plan de estudios.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La carrera tiene ciclos definidos.
- **Flujo principal:** 1) El usuario accede al plan de estudios. 2) El sistema muestra los ciclos disponibles.
- **Flujos alternativos/excepciones:** Si la carrera no tiene ciclos definidos, el sistema solicita completarlos primero.
- **Resultado esperado:** El usuario visualiza la estructura de ciclos de la carrera.
- **Reglas de negocio:** RN1: El número de ciclos mostrado corresponde al definido en RF011.

#### RF061 — Asignar asignatura a un ciclo
*(Origen: Existente/Ampliado · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder arrastrar dentro de cada ciclo los cursos que yo requiera.
- **Descripción:** Permite ubicar una asignatura dentro de un ciclo específico mediante interacción de arrastrar y soltar, o mediante un selector alternativo para accesibilidad.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura existe y no está asignada a otro ciclo del mismo plan.
- **Flujo principal:** 1) El usuario arrastra la asignatura desde el listado hacia el ciclo deseado. 2) El sistema valida la asignación. 3) El sistema guarda la ubicación.
- **Flujos alternativos/excepciones:** Si la asignatura ya pertenece a otro ciclo del mismo plan, el sistema solicita confirmación para reubicarla.
- **Resultado esperado:** La asignatura queda ubicada dentro del ciclo seleccionado.
- **Reglas de negocio:** RN1: Una asignatura solo puede estar en un ciclo a la vez dentro del mismo plan.

#### RF062 — Quitar asignatura de un ciclo
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito poder quitar un curso que está dentro de cada ciclo.
- **Descripción:** Permite remover una asignatura previamente ubicada en un ciclo, dejándola disponible sin ciclo asignado.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura está ubicada en un ciclo.
- **Flujo principal:** 1) El usuario selecciona 'Quitar' sobre la asignatura dentro del ciclo. 2) El sistema confirma la acción. 3) El sistema actualiza la malla.
- **Flujos alternativos/excepciones:** Si otras asignaturas la tienen como prerrequisito, el sistema advierte el impacto antes de confirmar.
- **Resultado esperado:** La asignatura queda sin ciclo asignado, disponible para reubicarse.
- **Reglas de negocio:** RN1: La asignatura no se elimina del plan, solo se desvincula del ciclo.

#### RF063 — Visualizar todos los cursos creados para el plan de estudios
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito visualizar todos los cursos creados para el plan de estudios.
- **Descripción:** Muestra el listado completo de asignaturas registradas en el plan, estén o no ubicadas en un ciclo.
- **Actor(es):** Director de carrera, Coordinador académico, Docente (propuestos)
- **Precondiciones:** El plan tiene asignaturas registradas.
- **Flujo principal:** 1) El usuario accede a la vista general del plan. 2) El sistema lista todas las asignaturas registradas.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El usuario visualiza el inventario completo de asignaturas del plan.
- **Reglas de negocio:** RN1: El listado distingue asignaturas ubicadas y no ubicadas en ciclo.

#### RF064 — Validar créditos máximos/mínimos permitidos por ciclo
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo validar que la carga de créditos de un ciclo se encuentre dentro de un rango razonable definido por la carrera.
- **Descripción:** Al asignar asignaturas a un ciclo, el sistema valida el total de créditos acumulado contra un rango configurable.
- **Actor(es):** Sistema
- **Precondiciones:** Se ha definido un rango de créditos por ciclo para la carrera (pendiente de validación institucional).
- **Flujo principal:** 1) El sistema calcula los créditos totales del ciclo tras cada asignación. 2) Compara contra el rango definido. 3) Muestra advertencia si se excede.
- **Flujos alternativos/excepciones:** Si no se ha configurado un rango, el sistema omite la validación y solo informa el total.
- **Resultado esperado:** Se favorece una distribución equilibrada de la carga académica por ciclo.
- **Reglas de negocio:** RN1: El rango de créditos por ciclo es configurable y depende de política institucional.

#### RF065 — Validar que una asignatura no se repita en más de un ciclo del mismo plan
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo validar que una asignatura no pueda asignarse simultáneamente a más de un ciclo dentro del mismo plan.
- **Descripción:** Ejecuta una validación de unicidad de ubicación al momento de asignar una asignatura a un ciclo.
- **Actor(es):** Sistema
- **Precondiciones:** Se está asignando una asignatura a un ciclo.
- **Flujo principal:** 1) El sistema verifica si la asignatura ya está en otro ciclo. 2) Si es así, solicita confirmación de reubicación en lugar de duplicar.
- **Flujos alternativos/excepciones:** No aplica; la operación siempre resuelve en una única ubicación.
- **Resultado esperado:** Cada asignatura mantiene una única ubicación dentro de la malla curricular del plan.
- **Reglas de negocio:** RN1: Relación asignatura-ciclo es de uno a uno dentro de un mismo plan.

#### RF066 — Visualizar malla curricular completa (vista ciclo x asignatura)
*(Origen: Nuevo · Prioridad: Alta)*
- **Historia de usuario:** Como usuario necesito visualizar la malla curricular completa organizada por ciclos y asignaturas para tener una vista integral del plan.
- **Descripción:** Presenta una vista tipo matriz/tablero donde cada columna representa un ciclo y se listan las asignaturas ubicadas en él.
- **Actor(es):** Todos los roles del módulo (propuestos)
- **Precondiciones:** El plan tiene al menos un ciclo con asignaturas asignadas.
- **Flujo principal:** 1) El usuario accede a la vista de malla curricular. 2) El sistema construye la matriz ciclo x asignatura.
- **Flujos alternativos/excepciones:** Si un ciclo no tiene asignaturas, se muestra la columna vacía con indicación correspondiente.
- **Resultado esperado:** El usuario obtiene una visión integral y ordenada del plan de estudios.
- **Reglas de negocio:** RN1: La vista se actualiza en tiempo real ante cualquier cambio en la malla.

#### RF067 — Calcular automáticamente el total de créditos del plan
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo calcular automáticamente el total de créditos del plan de estudios sumando los créditos de todas sus asignaturas.
- **Descripción:** Recalcula el total de créditos del plan cada vez que se agrega, edita o retira una asignatura.
- **Actor(es):** Sistema
- **Precondiciones:** El plan tiene asignaturas con créditos definidos.
- **Flujo principal:** 1) El sistema suma los créditos de todas las asignaturas activas del plan. 2) Muestra el total actualizado.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El total de créditos del plan se mantiene siempre actualizado y calculado automáticamente.
- **Reglas de negocio:** RN1: El campo de total de créditos no es editable manualmente.

#### RF068 — Detectar asignaturas sin ciclo asignado
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como sistema debo detectar y reportar las asignaturas de un plan que aún no cuentan con un ciclo asignado.
- **Descripción:** Genera una alerta o indicador visible cuando existen asignaturas del plan sin ubicación en la malla curricular.
- **Actor(es):** Sistema
- **Precondiciones:** El plan tiene asignaturas registradas.
- **Flujo principal:** 1) El sistema recorre las asignaturas del plan. 2) Identifica las que no tienen ciclo asignado. 3) Genera el indicador correspondiente.
- **Flujos alternativos/excepciones:** Si todas las asignaturas tienen ciclo, no se genera alerta.
- **Resultado esperado:** El usuario identifica de forma proactiva asignaturas pendientes de ubicar.
- **Reglas de negocio:** RN1: Esta condición bloquea el envío del plan a aprobación (ver RF097).

#### RF069 — Detectar ciclos sin asignaturas asignadas
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como sistema debo detectar y reportar los ciclos del plan que no tienen ninguna asignatura asignada.
- **Descripción:** Genera una alerta cuando un ciclo definido en la carrera no cuenta con asignaturas registradas en el plan.
- **Actor(es):** Sistema
- **Precondiciones:** El plan tiene ciclos definidos.
- **Flujo principal:** 1) El sistema recorre los ciclos del plan. 2) Identifica los que no tienen asignaturas. 3) Genera el indicador correspondiente.
- **Flujos alternativos/excepciones:** Si todos los ciclos tienen al menos una asignatura, no se genera alerta.
- **Resultado esperado:** El usuario identifica ciclos incompletos dentro de la malla curricular.
- **Reglas de negocio:** RN1: Un ciclo vacío no impide guardar el plan en Borrador, pero se reporta como observación.

#### RF070 — Reordenar asignaturas dentro de un mismo ciclo
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito reordenar visualmente las asignaturas dentro de un mismo ciclo para organizar su presentación.
- **Descripción:** Permite modificar el orden de despliegue de las asignaturas dentro de un ciclo mediante arrastre.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El ciclo tiene más de una asignatura asignada.
- **Flujo principal:** 1) El usuario arrastra una asignatura a una nueva posición dentro del ciclo. 2) El sistema guarda el nuevo orden.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** Las asignaturas del ciclo se muestran en el orden definido por el usuario.
- **Reglas de negocio:** RN1: El orden es únicamente de presentación y no afecta la lógica de prerrequisitos.

#### RF071 — Mover una asignatura de un ciclo a otro
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito mover una asignatura de un ciclo a otro para corregir la organización de la malla curricular.
- **Descripción:** Permite reubicar una asignatura ya asignada a un ciclo, trasladándola a otro ciclo del mismo plan.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** La asignatura está ubicada en un ciclo del plan.
- **Flujo principal:** 1) El usuario arrastra la asignatura al nuevo ciclo. 2) El sistema valida coherencia de prerrequisitos. 3) El sistema actualiza la ubicación.
- **Flujos alternativos/excepciones:** Si el movimiento genera una inconsistencia de prerrequisitos, el sistema advierte antes de confirmar.
- **Resultado esperado:** La asignatura queda reubicada en el nuevo ciclo.
- **Reglas de negocio:** RN1: El movimiento dispara nuevamente las validaciones de consistencia relacionadas.

#### RF072 — Generar PDF resumen del plan de estudios
*(Origen: Existente · Prioridad: Alta)*
- **Historia de usuario:** Como sistema debo poder generar un PDF resumen del plan de estudios creado.
- **Descripción:** Genera un documento PDF con la información general del plan y su malla curricular por ciclos.
- **Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)
- **Precondiciones:** El plan de estudios tiene al menos información básica registrada.
- **Flujo principal:** 1) El usuario selecciona 'Generar PDF'. 2) El sistema compila la información del plan. 3) El sistema entrega el archivo PDF.
- **Flujos alternativos/excepciones:** Si el plan no tiene asignaturas registradas, el sistema genera el PDF indicando la ausencia de contenido.
- **Resultado esperado:** El usuario obtiene un documento PDF con el resumen del plan de estudios.
- **Reglas de negocio:** RN1: El PDF incluye el estado y la versión del plan al momento de su generación.

#### RF073 — Exportar la malla curricular en formato Excel
*(Origen: Nuevo · Prioridad: Media)*
- **Historia de usuario:** Como usuario necesito exportar la malla curricular en formato Excel para su uso en análisis externos o reportes institucionales.
- **Descripción:** Genera un archivo Excel con la estructura de ciclos y asignaturas del plan de estudios.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** El plan tiene asignaturas registradas.
- **Flujo principal:** 1) El usuario selecciona 'Exportar a Excel'. 2) El sistema genera el archivo. 3) El sistema entrega el archivo para descarga.
- **Flujos alternativos/excepciones:** Si el plan no tiene asignaturas, el sistema genera el archivo solo con la estructura de ciclos.
- **Resultado esperado:** El usuario obtiene un archivo Excel con la malla curricular del plan.
- **Reglas de negocio:** RN1: El archivo exportado refleja el estado actual del plan al momento de la exportación.

#### RF074 — Visualizar el plan agrupado por tipo de curso (obligatorio/electivo)
*(Origen: Nuevo · Prioridad: Baja)*
- **Historia de usuario:** Como usuario necesito visualizar las asignaturas del plan agrupadas por su condición de obligatorio o electivo.
- **Descripción:** Presenta una vista alternativa del plan organizada según la condición curricular de las asignaturas.
- **Actor(es):** Director de carrera, Coordinador académico (propuestos)
- **Precondiciones:** Las asignaturas del plan tienen definida su condición (obligatoria/electiva).
- **Flujo principal:** 1) El usuario selecciona la vista 'Por condición'. 2) El sistema agrupa y muestra las asignaturas correspondientes.
- **Flujos alternativos/excepciones:** No aplica.
- **Resultado esperado:** El usuario visualiza la proporción de asignaturas obligatorias y electivas del plan.
- **Reglas de negocio:** RN1: Esta vista es de solo consulta.

---

## 4. Comportamiento clave (transversal a todas las pantallas)

- Todos los códigos (carrera, objetivo, competencia, asignatura, plan — facultad no aplica) se **autogeneran y son de solo lectura**.
- Validaciones de unicidad de nombre/código con mensaje de error inline.
- El plan de estudios bloquea edición fuera del estado "Borrador"/"En revisión".
- El drag-and-drop entre el panel de disponibles y los ciclos usa la **Drag and Drop API nativa** del navegador.

## 5. Assets

- Isotipo/ícono de UC (sin texto, para el sidebar): `assets/logo-uc-icon.png` (ya existente en el repo).

## 6. Fuera de alcance de este prompt (existen en el documento fuente, no en estas 8 pantallas)

- **2.11 Búsqueda, Filtrado y Reportes (RF101–RF110):** búsqueda global de planes, reporte de créditos por ciclo, reporte por área de formación, exportación integral del plan, reporte de cobertura de competencias, panel estadístico general, consulta de solo lectura para Usuario consultor, bitácora de accesos.
- **2.12 Seguridad, Roles y Permisos (RF111–RF119):** restricciones de acceso por rol sobre cada operación (creación de facultades/carreras, edición/aprobación del plan, gestión de asignaturas, visibilidad de histórico). No se implementan aquí porque el módulo de Auth/Roles aún no existe — cuando exista, estos RF definen qué botones/acciones ocultar según rol.
- **RF-PEND-01** (sugerencia de asignaturas comparando mallas de otras universidades): pendiente, sin especificar, no forma parte de este build.

## 7. Corrección de referencias cruzadas del documento fuente (afectan a los RF de este prompt)

El PDF original cita algunos RF entre paréntesis que no corresponden al contenido real (quedaron de una renumeración no propagada). Ya se corrigieron dentro del texto de este archivo; se listan aquí para que quede explícito qué se corrigió:

| RF que cita la referencia | Referencia tal como aparece en el PDF original | RF real al que corresponde |
|---|---|---|
| RF049 | "(ver RF106)" | RF094 |
| RF058 | "(ver RF109)" | RF097 |
| RF068 | "(ver RF109)" | RF097 |
| RF080 | "(RF090)" | RF078 |
| RF082 | "(ver RF102)" | RF090 |
| RF085 | "(ver RF103)" | RF097 |
