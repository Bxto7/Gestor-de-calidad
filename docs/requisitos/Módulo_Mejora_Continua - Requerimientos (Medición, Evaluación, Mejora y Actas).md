# Sistema de Gestión de la Calidad Universitaria

## Módulo de Mejora Continua

**Submódulos: Planes de Medición, Plan de Evaluación, Plan de Mejora y Actas de Aprobación**

*Especificación de Requerimientos Funcionales y No Funcionales*

- Autor: ______________________________
- Curso / Proyecto: ______________________________
- Docente: ______________________________
- Huancayo – Perú, 26 de agosto de 2026

*Documento base para diseño de base de datos, diseño de interfaces, casos de uso, historias de usuario, criterios de aceptación, desarrollo y pruebas funcionales.*

---

## 1. Introducción y alcance

El presente documento consolida el levantamiento de requerimientos funcionales y no funcionales de un nuevo módulo del Sistema de Gestión de la Calidad universitario: el Módulo de Mejora Continua (ver RF-PM-000). Dentro de este módulo se desarrollan, hasta el momento, cuatro submódulos: Planes de Medición (Directa e Indirecta) de competencias; Plan de Evaluación (ver RF-PE-000), que se construye a partir de un plan de medición previamente creado; Plan de Mejora (ver RF-PJ-000), que registra las acciones de mejora sobre criterios de acreditación, objetivos educacionales y competencias; y Actas de Aprobación (ver RF-AC-000), con las que un responsable designado aprueba formalmente dichas acciones de mejora. El Módulo de Mejora Continua depende funcionalmente del Módulo de Plan de Estudios ya especificado, del cual reutiliza las entidades Plan de Estudios, Carrera Profesional, Competencia, Asignatura y Objetivo Educacional.

Los cuatro submódulos conforman el ciclo completo de mejora continua: el Plan de Medición define qué competencias se miden y en qué periodos; el Plan de Evaluación registra cómo se mide y qué porcentaje se alcanzó; el Plan de Mejora toma ese resultado como input para definir las acciones correctivas del periodo siguiente; y el Acta de Aprobación formaliza la aprobación de esas acciones. Las acciones de mejora pueden, a su vez, derivar en cambios al Plan de Medición del siguiente ciclo.

El levantamiento de cada submódulo parte de los requerimientos generales definidos previamente por el autor (documentos fuente: '2.1 Definición de planes de medición.txt', 'Planes de evaluación.txt', 'de planes de Mejora.txt' y '3.2-Aprobaciones.txt'), complementados con el análisis de un archivo institucional de medición de competencias (Excel), en sus hojas P.MEDICIÓN, P.ASSESSMENT, P.MEJORA y las actas de aprobación de dos periodos académicos. Dicho análisis permitió precisar aspectos no explícitos en los documentos fuente, como la estructura de las indicaciones de la medición indirecta (por año y grupo objetivo), el hecho de que el input de una acción de mejora corresponde al resultado de medición del periodo académico inmediatamente anterior, y que un acta de aprobación agrupa los tres aspectos de mejora en un mismo documento por periodo académico.

Como parte del levantamiento se identificó que dos conceptos no existían en el Módulo de Plan de Estudios previamente especificado: el 'Atributo del Graduado' y su relación con las competencias, y el 'Criterio de Acreditación'. Se determinó (Opción A) que ambas entidades pertenecen conceptualmente a dicho módulo; por ello, la sección 2 de este documento contiene las extensiones requeridas, como prerrequisito directo de los submódulos de Mejora Continua. Dichos requerimientos deberán incorporarse formalmente al documento del Módulo de Plan de Estudios. En concreto: los Atributos del Graduado se crean desde el Módulo de Plan de Estudios a nivel de plan de estudios (ver RF120), la asociación entre competencias y atributos se realiza desde el submódulo de Competencias de dicho módulo (ver RF124), y los Criterios de Acreditación se registran a nivel de carrera profesional (ver RF129). Los Objetivos Educacionales, en cambio, ya se gestionan en el Módulo de Plan de Estudios y no requieren extensión alguna.

### 1.1 Convenciones y trazabilidad de origen

- **Existente:** requerimiento tomado tal cual del documento fuente correspondiente ('2.1 Definición de planes de medición.txt' para Planes de Medición, 'Planes de evaluación.txt' para Plan de Evaluación, 'de planes de Mejora.txt' para Plan de Mejora, o '3.2-Aprobaciones.txt' para Actas de Aprobación).
- **Ampliado:** requerimiento existente que fue detallado, precisado o complementado sin alterar su intención original.
- **Nuevo:** requerimiento propuesto por el equipo de análisis, identificado como necesario para la completitud del submódulo a partir del levantamiento y del análisis del archivo institucional de medición.

### 1.2 Roles utilizados (propuesta, no definición oficial)

No se define ningún rol nuevo para este módulo: se reutilizan íntegramente los roles ya propuestos para el Módulo de Plan de Estudios, en los cuatro submódulos. En particular, el Director de carrera es el responsable designado que aprueba los planes de medición, de evaluación y de mejora, así como las actas de aprobación, de la misma forma en que ya aprueba el plan de estudios. Su nombre y alcance definitivo deberán ser validados por la universidad en la etapa de diseño del módulo de autenticación y roles.

- Director de carrera (propuesto) — gestiona y aprueba el plan de estudios de su carrera; en este módulo, participa en la definición de los Atributos del Graduado y es quien aprueba, rechaza u observa los planes de medición, de la misma forma en que ya aprueba el plan de estudios.
- Coordinador académico (propuesto) — apoyo operativo; configura, edita y programa los planes de medición mientras se encuentran en estado Borrador, y los envía a revisión.
- Usuario consultor (propuesto) — consulta planes de medición vigentes e históricos, sin permisos de edición.

### 1.3 Fuera de alcance

El Módulo de Mejora Continua contempla, además de los cuatro submódulos especificados en este documento, el Assessment de Objetivos Educacionales observado en el archivo institucional analizado (distinto del assessment de competencias ya cubierto por Plan de Evaluación). Este no ha sido desarrollado, detallado ni especificado en el presente documento; queda fuera de alcance y será levantado en una etapa posterior. Asimismo, la firma del acta de aprobación no ha sido considerada en este levantamiento (ver sección 8.4).

### 1.4 Resumen cuantitativo

- Total de requerimientos funcionales de extensión al Módulo de Plan de Estudios (Atributos del Graduado y Criterios de Acreditación): 13
- Total de requerimientos funcionales del submódulo Planes de Medición: 47
- Total de requerimientos funcionales del submódulo Plan de Evaluación: 49
- Total de requerimientos funcionales del submódulo Plan de Mejora: 47
- Total de requerimientos funcionales del submódulo Actas de Aprobación: 27
- **Total general de requerimientos funcionales especificados: 183**
- **Total de requerimientos no funcionales especificados: 26**

Referencia metodológica: estructura de especificación basada en las prácticas de la norma IEEE 830 / ISO-IEC-IEEE 29148 para especificación de requerimientos de software, siguiendo el mismo formato utilizado en el documento del Módulo de Plan de Estudios.

---

## 2. Extensiones al Módulo de Plan de Estudios (prerrequisitos)

Los siguientes requerimientos incorporan al Módulo de Plan de Estudios dos conceptos que no existían en su especificación previa y que son prerrequisito funcional de los submódulos de Mejora Continua: el Atributo del Graduado y el Criterio de Acreditación. Continúan la numeración secuencial de dicho documento (hasta RF119) y deberán incorporarse formalmente a él.

Cabe precisar que ambos conceptos se definen en niveles distintos: los Atributos del Graduado se registran por plan de estudios, mientras que los Criterios de Acreditación se registran por carrera profesional. Los Objetivos Educacionales, en cambio, ya se encuentran especificados en el Módulo de Plan de Estudios y no requieren extensión.

### 2.1 Atributos del Graduado

Los Atributos del Graduado (RF120-RF123) se registran y gestionan desde el Módulo de Plan de Estudios, asociados a un plan de estudios específico. La asociación entre competencias y atributos (RF124-RF125) se realiza desde el submódulo de Competencias de ese mismo módulo, es decir, desde la edición de cada competencia, y no desde una pantalla independiente de Atributos. La relación entre ambas entidades es de muchos a muchos: una competencia puede tener varios atributos del graduado, así como un atributo del graduado puede estar presente en varias competencias. Sin estas entidades no es posible construir un plan de medición trazable a los atributos evaluados en la acreditación.

#### RF120 — Registrar Atributo del Graduado

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito registrar los Atributos del Graduado de un plan de estudios, para poder asociarles competencias y usarlos como base de los planes de medición de acreditación.

**Descripción:** Permite crear un Atributo del Graduado (código y nombre) asociado a un plan de estudios específico.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de estudios existe.

**Flujo principal:**

1. El usuario accede a 'Nuevo atributo del graduado' dentro del plan de estudios.
2. Ingresa el código y el nombre.
3. El sistema valida unicidad dentro del plan.
4. El sistema guarda y muestra confirmación.

**Flujos alternativos / excepciones:** Si el código ya existe dentro del mismo plan de estudios, el sistema muestra un error y no guarda el registro.

**Resultado esperado:** El atributo del graduado queda registrado y disponible para asociar competencias.

**Reglas de negocio:**

- RN1: El código y el nombre son obligatorios.
- RN2: El código es único dentro del plan de estudios al que pertenece.
- RN3: Un atributo del graduado pertenece a un único plan de estudios.

#### RF121 — Editar Atributo del Graduado

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Director de carrera necesito editar un Atributo del Graduado registrado, para corregir o actualizar su información.

**Descripción:** Permite modificar el código o el nombre de un atributo del graduado ya registrado.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El atributo del graduado existe.

**Flujo principal:**

1. El usuario selecciona el atributo.
2. Modifica el código o el nombre.
3. El sistema valida unicidad.
4. El sistema guarda los cambios.

**Flujos alternativos / excepciones:** Si el nuevo código coincide con otro atributo del mismo plan, el sistema rechaza el cambio.

**Resultado esperado:** Los datos del atributo del graduado quedan actualizados.

**Reglas de negocio:**

- RN1: No se permite dejar el nombre vacío.
- RN2: El cambio queda registrado en el histórico del atributo.

#### RF122 — Visualizar listado de Atributos del Graduado por plan de estudios

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito visualizar los Atributos del Graduado de un plan de estudios, para seleccionar el que requiero gestionar.

**Descripción:** Muestra el listado de atributos del graduado registrados para un plan de estudios, con indicador de estado (activo/inactivo).

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de estudios existe.

**Flujo principal:**

1. El usuario accede a la sección de atributos del plan de estudios.
2. El sistema recupera y lista los atributos registrados.

**Flujos alternativos / excepciones:** Si no existen atributos registrados, el sistema muestra un mensaje indicando listado vacío.

**Resultado esperado:** El usuario visualiza el listado completo de atributos del graduado del plan.

**Reglas de negocio:**

- RN1: El listado se muestra ordenado por código.

#### RF123 — Inactivar Atributo del Graduado

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como Director de carrera necesito inactivar un Atributo del Graduado que ya no se utiliza, sin eliminar su información histórica.

**Descripción:** Cambia el estado del atributo del graduado a Inactivo, impidiendo su asociación a nuevas competencias o planes de medición.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El atributo del graduado existe y está activo.

**Flujo principal:**

1. El usuario selecciona 'Inactivar'.
2. El sistema solicita confirmación.
3. El sistema cambia el estado.

**Flujos alternativos / excepciones:** Si el atributo está vinculado a competencias usadas en un plan de medición Vigente, el sistema advierte el impacto antes de confirmar.

**Resultado esperado:** El atributo queda inactivo y no disponible para nuevas asociaciones.

**Reglas de negocio:**

- RN1: No se elimina físicamente el registro.

#### RF124 — Asociar Atributos del Graduado a una competencia, desde el submódulo de Competencias

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito, desde el submódulo de Competencias del plan de estudios, asociar a una competencia uno o varios Atributos del Graduado, para reflejar qué atributos se ven contribuidos por dicha competencia en el proceso de acreditación.

**Descripción:** Extiende el submódulo de Competencias (RF040-RF046) para permitir, desde la edición de una competencia, seleccionar uno o varios atributos del graduado del mismo plan de estudios. La relación es de muchos a muchos: una competencia puede tener varios atributos asociados, así como un atributo puede estar presente en varias competencias.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La competencia y al menos un atributo del graduado del mismo plan de estudios existen.

**Flujo principal:**

1. El usuario accede a la edición de una competencia, dentro del submódulo de Competencias.
2. Selecciona uno o varios atributos del graduado a asociar.
3. El sistema guarda la asociación.

**Flujos alternativos / excepciones:** Si el atributo ya está asociado a esa competencia, el sistema lo indica y no duplica la relación.

**Resultado esperado:** Queda establecida la relación de muchos a muchos entre la competencia y los atributos del graduado seleccionados.

**Reglas de negocio:**

- RN1: La relación es de muchos a muchos: una competencia puede tener varios atributos, y un atributo puede estar en varias competencias.
- RN2: No se permiten asociaciones duplicadas competencia-atributo.
- RN3: Solo se pueden asociar atributos pertenecientes al mismo plan de estudios que la competencia.
- RN4: La asociación se gestiona desde el submódulo de Competencias, no desde una pantalla independiente de Atributos.

#### RF125 — Desasociar un Atributo del Graduado de una competencia

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Director de carrera necesito quitar, desde el submódulo de Competencias, la asociación entre una competencia y un atributo del graduado cuando ya no corresponde.

**Descripción:** Permite eliminar, desde la edición de la competencia, la relación con un atributo del graduado específico, sin afectar las demás asociaciones de esa competencia.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La asociación competencia-atributo existe.

**Flujo principal:**

1. El usuario accede a la edición de la competencia.
2. Selecciona el atributo a desasociar.
3. El sistema solicita confirmación.
4. El sistema elimina la relación.

**Flujos alternativos / excepciones:** Si la competencia queda sin ningún atributo asociado y está usada en un plan de medición, el sistema advierte el impacto antes de confirmar.

**Resultado esperado:** La relación queda eliminada; la competencia y el atributo permanecen registrados.

**Reglas de negocio:**

- RN1: La desasociación no elimina ni la competencia ni el atributo, solo la relación entre ambos.

#### RF126 — Visualizar competencias agrupadas por Atributo del Graduado

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como usuario necesito visualizar las competencias agrupadas por cada Atributo del Graduado, para entender rápidamente la cobertura de cada atributo.

**Descripción:** Muestra una vista tipo árbol o agrupada donde cada atributo del graduado lista las competencias que tiene asociadas.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existen atributos del graduado con competencias asociadas.

**Flujo principal:**

1. El usuario accede a la vista agrupada.
2. El sistema recupera y agrupa las competencias por atributo.

**Flujos alternativos / excepciones:** Si un atributo no tiene competencias asociadas, se muestra como grupo vacío con indicación visual.

**Resultado esperado:** El usuario visualiza la cobertura de competencias por atributo del graduado.

**Reglas de negocio:**

- RN1: Una competencia puede aparecer en más de un grupo si está asociada a varios atributos.

#### RF127 — Validar que una competencia tenga al menos un Atributo del Graduado asociado antes de incluirse en un plan de medición

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo impedir que se incluya en un plan de medición una competencia que no tiene ningún atributo del graduado asociado.

**Descripción:** Ejecuta una validación de integridad conceptual antes de permitir seleccionar una competencia en la configuración de un plan de medición (ver RF-PM-013).

**Actor(es):** Sistema

**Precondiciones:** Se está configurando un plan de medición y se intenta seleccionar una competencia.

**Flujo principal:**

1. El sistema verifica que la competencia tenga al menos un atributo del graduado asociado.
2. Si la validación es correcta, permite la selección.

**Flujos alternativos / excepciones:** Si la competencia no tiene ningún atributo asociado, el sistema la excluye de la lista de selección y sugiere completar la asociación primero (ver RF124).

**Resultado esperado:** Todo plan de medición queda construido únicamente con competencias trazables a un atributo del graduado.

**Reglas de negocio:**

- RN1: Esta validación es transversal a la configuración de cualquier plan de medición.

#### RF128 — Buscar y filtrar Atributos del Graduado

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como usuario necesito buscar un Atributo del Graduado por código o nombre para ubicarlo rápidamente.

**Descripción:** Permite filtrar el listado de atributos del graduado de un plan de estudios por texto ingresado.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Existen atributos del graduado registrados.

**Flujo principal:**

1. El usuario ingresa un criterio de búsqueda.
2. El sistema filtra el listado.

**Flujos alternativos / excepciones:** Si no hay coincidencias, se muestra el mensaje 'sin resultados'.

**Resultado esperado:** El usuario visualiza únicamente los atributos que coinciden con el criterio.

**Reglas de negocio:**

- RN1: La búsqueda aplica sobre código y nombre.

### 2.2 Criterios de Acreditación

Los Criterios de Acreditación (RF129-RF132) se registran y gestionan desde el Módulo de Plan de Estudios, a nivel de carrera profesional, dentro de la gestión de carreras. Constituyen un prerrequisito directo del submódulo de Plan de Mejora, ya que uno de los tres aspectos sobre los cuales se generan planes de mejora son precisamente los criterios de acreditación del programa.

#### RF129 — Registrar Criterio de Acreditación de una carrera profesional

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito registrar los Criterios de Acreditación de una carrera profesional, para poder asociarles posteriormente planes de mejora en el proceso de acreditación.

**Descripción:** Permite crear un Criterio de Acreditación (código y nombre) asociado a una carrera profesional. A diferencia de los Atributos del Graduado, que se definen por plan de estudios (RF120), los criterios de acreditación se definen a nivel de carrera profesional.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La carrera profesional existe.

**Flujo principal:**

1. El usuario accede a 'Nuevo criterio de acreditación' dentro de la carrera profesional.
2. Ingresa el código y el nombre del criterio.
3. El sistema valida unicidad dentro de la carrera.
4. El sistema guarda y muestra confirmación.

**Flujos alternativos / excepciones:** Si el código ya existe dentro de la misma carrera profesional, el sistema muestra un error y no guarda el registro.

**Resultado esperado:** El criterio de acreditación queda registrado y disponible para asociarle planes de mejora.

**Reglas de negocio:**

- RN1: El código y el nombre son obligatorios.
- RN2: El código es único dentro de la carrera profesional a la que pertenece.
- RN3: Un criterio de acreditación pertenece a una única carrera profesional.
- RN4: Los criterios de acreditación se definen a nivel de carrera profesional, no de plan de estudios.

#### RF130 — Editar Criterio de Acreditación

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Director de carrera necesito editar un Criterio de Acreditación registrado, para corregir o actualizar su información.

**Descripción:** Permite modificar el código o el nombre de un criterio de acreditación ya registrado.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El criterio de acreditación existe.

**Flujo principal:**

1. El usuario selecciona el criterio.
2. Modifica el código o el nombre.
3. El sistema valida unicidad.
4. El sistema guarda los cambios.

**Flujos alternativos / excepciones:** Si el nuevo código coincide con otro criterio de la misma carrera, el sistema rechaza el cambio.

**Resultado esperado:** Los datos del criterio de acreditación quedan actualizados.

**Reglas de negocio:**

- RN1: No se permite dejar el nombre vacío.
- RN2: El cambio queda registrado en el histórico del criterio.

#### RF131 — Visualizar listado de Criterios de Acreditación por carrera profesional

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito visualizar los Criterios de Acreditación de una carrera profesional, para seleccionar el que requiero gestionar.

**Descripción:** Muestra el listado de criterios de acreditación registrados para una carrera profesional, con indicador de estado (activo/inactivo).

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** La carrera profesional existe.

**Flujo principal:**

1. El usuario accede a la sección de criterios de acreditación de la carrera.
2. El sistema recupera y lista los criterios registrados.

**Flujos alternativos / excepciones:** Si no existen criterios registrados, el sistema muestra un mensaje indicando listado vacío.

**Resultado esperado:** El usuario visualiza el listado completo de criterios de acreditación de la carrera.

**Reglas de negocio:**

- RN1: El listado se muestra ordenado por código.

#### RF132 — Inactivar Criterio de Acreditación

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como Director de carrera necesito inactivar un Criterio de Acreditación que ya no se utiliza, sin eliminar su información histórica.

**Descripción:** Cambia el estado del criterio de acreditación a Inactivo, impidiendo su asociación a nuevos planes de mejora.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El criterio de acreditación existe y está activo.

**Flujo principal:**

1. El usuario selecciona 'Inactivar'.
2. El sistema solicita confirmación.
3. El sistema cambia el estado.

**Flujos alternativos / excepciones:** Si el criterio tiene planes de mejora asociados en estado Vigente, el sistema advierte el impacto antes de confirmar.

**Resultado esperado:** El criterio queda inactivo y no disponible para nuevas asociaciones.

**Reglas de negocio:**

- RN1: No se elimina físicamente el registro.
- RN2: Los planes de mejora ya asociados al criterio se conservan sin cambios.

---

## 3. Requerimientos funcionales — Submódulo: Planes de Medición

A continuación se detallan los requerimientos funcionales del submódulo de Planes de Medición, agrupados por subprocesos coherentes. Cada requerimiento incluye su historia de usuario, descripción, actores, precondiciones, flujo principal, flujos alternativos, resultado esperado, reglas de negocio, origen y prioridad.

### 3.1. Configuración General del Plan de Medición

#### RF-PM-000 — Crear el Módulo de Mejora Continua y, dentro de él, el submódulo de Planes de Medición

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como universidad necesito que se cree un nuevo módulo de Mejora Continua dentro del Sistema de Gestión de la Calidad, y que dentro de este módulo se desarrolle su primer submódulo, Planes de Medición, para poder gestionar la medición de competencias como parte del proceso de acreditación.

**Descripción:** Establece la creación del Módulo de Mejora Continua como un nuevo módulo del sistema, distinto del Módulo de Plan de Estudios pero dependiente funcionalmente de él. Dentro del Módulo de Mejora Continua se implementa, como primer submódulo, el de Planes de Medición (secciones 3.1 a 3.11), sobre el cual se construyen los demás submódulos especificados en este documento.

**Actor(es):** Sistema

**Precondiciones:** El Módulo de Plan de Estudios existe y se encuentra operativo, incluyendo la extensión de Atributos del Graduado (ver sección 2).

**Flujo principal:**

1. Se habilita en el sistema el nuevo Módulo de Mejora Continua.
2. Dentro de dicho módulo se habilita el submódulo de Planes de Medición con las funcionalidades descritas en el presente documento.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El sistema cuenta con el Módulo de Mejora Continua operativo, con su submódulo de Planes de Medición disponible para su uso.

**Reglas de negocio:**

- RN1: El Módulo de Mejora Continua depende de las entidades del Módulo de Plan de Estudios (Plan de Estudios, Competencia, Atributo del Graduado).
- RN2: Los demás submódulos de Mejora Continua se incorporarán en etapas posteriores, sobre la misma estructura base creada por este requerimiento, sin necesidad de rediseñarla.

#### RF-PM-001 — Seleccionar el plan de estudios base del plan de medición

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar el plan de estudios sobre el cual se creará un plan de medición, para vincular la medición de competencias a una versión curricular específica.

**Descripción:** Permite elegir, de la lista de planes de estudio disponibles, aquel que servirá de base para un nuevo plan de medición.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Existe al menos un plan de estudios registrado en estado Aprobado o Vigente.

**Flujo principal:**

1. El usuario accede a 'Nuevo plan de medición'.
2. Selecciona el plan de estudios base de la lista disponible.
3. El sistema recupera las competencias y atributos del graduado asociados a ese plan.

**Flujos alternativos / excepciones:** Si el plan de estudios seleccionado no tiene atributos del graduado ni competencias asociadas, el sistema impide continuar y sugiere completarlos primero (ver RF120-RF127).

**Resultado esperado:** Queda definido el plan de estudios base para la configuración del nuevo plan de medición.

**Reglas de negocio:**

- RN1: Un plan de medición se asocia a un único plan de estudios.
- RN2: Solo se listan planes de estudios en estado Aprobado o Vigente.

#### RF-PM-002 — Seleccionar el tipo de plan de medición (Directa / Indirecta)

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito indicar si el plan de medición que voy a generar es de tipo Directa o Indirecta, ya que cada tipo tiene una lógica de periodos distinta.

**Descripción:** Permite elegir el tipo de medición del nuevo plan, lo cual determina si se configurará por periodos académicos (Directa) o por años calendario (Indirecta).

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de estudios base ya fue seleccionado (RF-PM-001).

**Flujo principal:**

1. El usuario selecciona el tipo de medición: Directa o Indirecta.
2. El sistema habilita la configuración de periodos correspondiente al tipo elegido.

**Flujos alternativos / excepciones:** No aplica; el tipo es una selección obligatoria de un valor fijo.

**Resultado esperado:** Queda definido el tipo de plan de medición a configurar.

**Reglas de negocio:**

- RN1: El tipo de medición es obligatorio y no editable una vez aprobado el plan.
- RN2: Un plan de estudios puede tener, como máximo, un plan de medición Directa y un plan de medición Indirecta vigentes de forma simultánea.

#### RF-PM-003 — Crear el plan de medición con los datos generales configurados

*Origen: Existente / Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito crear el plan de medición una vez definidos el plan de estudios base, el tipo, la meta, los periodos y las competencias, para dejarlo disponible para su programación detallada.

**Descripción:** Consolida los datos generales configurados (plan de estudios, tipo, meta) y crea el registro del plan de medición en estado inicial Borrador.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Se completaron los pasos previos de selección de plan de estudios y tipo de medición.

**Flujo principal:**

1. El usuario confirma la creación del plan.
2. El sistema crea el registro en estado Borrador.

**Flujos alternativos / excepciones:** Si falta algún dato obligatorio (plan de estudios o tipo), el sistema impide la creación.

**Resultado esperado:** Se crea un nuevo plan de medición en estado Borrador, listo para ser configurado en detalle.

**Reglas de negocio:**

- RN1: Un plan de medición siempre nace en estado Borrador.

#### RF-PM-004 — Generar código único del plan de medición

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo generar automáticamente un código único para cada plan de medición creado.

**Descripción:** Genera un identificador único (por ejemplo, código de plan de estudios + tipo + periodo de creación) al momento de crear el plan de medición.

**Actor(es):** Sistema

**Precondiciones:** Se está creando un nuevo plan de medición.

**Flujo principal:**

1. El sistema toma el código del plan de estudios, el tipo de medición y el correlativo de versión.
2. Genera el código.
3. Lo asigna al plan.

**Flujos alternativos / excepciones:** No aplica; el código se genera de forma automática y no editable.

**Resultado esperado:** Cada plan de medición queda identificado de forma única e irrepetible.

**Reglas de negocio:**

- RN1: El código generado no puede ser editado manualmente.

#### RF-PM-005 — Definir y gestionar el estado del plan de medición

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo gestionar el ciclo de vida del plan de medición mediante estados definidos, para reflejar su nivel de madurez y control de calidad.

**Descripción:** Establece los estados posibles del plan de medición: Borrador, En revisión, Aprobado, Vigente, Histórico.

**Actor(es):** Sistema

**Precondiciones:** El plan de medición existe.

**Flujo principal:**

1. El sistema asigna el estado Borrador al crear el plan.
2. El estado cambia según las transiciones definidas (ver RF-PM-006).

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan de medición cuenta en todo momento con un estado válido y trazable.

**Reglas de negocio:**

- RN1: Las transiciones de estado siguen la secuencia: Borrador → En revisión → Aprobado → Vigente → Histórico.

#### RF-PM-006 — Cambiar el estado del plan de medición

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico o Director de carrera necesito cambiar el estado de un plan de medición conforme avanza su proceso de revisión y aprobación.

**Descripción:** Permite ejecutar las transiciones de estado definidas en RF-PM-005, respetando el rol del usuario para cada transición: el Coordinador académico envía a revisión, y el Director de carrera aprueba, rechaza u observa.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición existe y su estado actual permite la transición solicitada.

**Flujo principal:**

1. El usuario selecciona la transición deseada.
2. El sistema valida que la transición sea válida desde el estado actual y que el usuario tenga el permiso correspondiente.
3. El sistema actualiza el estado.

**Flujos alternativos / excepciones:** Si la transición no es válida desde el estado actual, o el usuario no tiene el permiso, el sistema la rechaza.

**Resultado esperado:** El plan de medición queda en el nuevo estado correspondiente.

**Reglas de negocio:**

- RN1: No se permiten saltos de estado fuera de la secuencia definida.
- RN2: Cada cambio de estado queda registrado con usuario y fecha.

#### RF-PM-007 — Restringir la edición de planes de medición en estado Aprobado o Vigente

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo impedir la edición directa de un plan de medición que ya fue aprobado o que se encuentra vigente, para preservar la integridad del documento de acreditación.

**Descripción:** Bloquea las operaciones de edición sobre planes de medición cuyo estado sea Aprobado, Vigente o Histórico.

**Actor(es):** Sistema

**Precondiciones:** Se solicita editar un plan de medición.

**Flujo principal:**

1. El sistema verifica el estado del plan.
2. Si el estado es distinto de Borrador o En revisión (para observaciones puntuales), bloquea la edición directa.

**Flujos alternativos / excepciones:** Si el usuario necesita modificar un plan Aprobado o Vigente, el sistema sugiere generar una nueva versión (ver RF-PM-030).

**Resultado esperado:** Se preserva la integridad de los planes de medición ya aprobados o vigentes.

**Reglas de negocio:**

- RN1: Solo se permite edición libre en estado Borrador.

#### RF-PM-008 — Editar plan de medición en estado Borrador

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito editar un plan de medición mientras se encuentra en estado Borrador, para completar o corregir su configuración.

**Descripción:** Permite modificar libremente los datos generales, la meta, los periodos, las competencias y la programación del plan mientras no haya sido enviado a revisión.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona el plan.
2. Modifica los datos requeridos.
3. El sistema guarda los cambios.

**Flujos alternativos / excepciones:** Si el plan ya no está en Borrador, el sistema bloquea la edición directa (ver RF-PM-007).

**Resultado esperado:** Los datos del plan quedan actualizados.

**Reglas de negocio:**

- RN1: Solo se permite edición libre en estado Borrador.

#### RF-PM-009 — Eliminar plan de medición en estado Borrador

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito eliminar un plan de medición que quedó en estado Borrador y ya no se va a utilizar.

**Descripción:** Permite eliminar de forma definitiva un plan de medición que aún no fue enviado a revisión.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona 'Eliminar'.
2. El sistema solicita confirmación.
3. El sistema elimina el registro.

**Flujos alternativos / excepciones:** Si el plan ya no está en Borrador, el sistema rechaza la eliminación.

**Resultado esperado:** El plan de medición queda eliminado definitivamente.

**Reglas de negocio:**

- RN1: Solo se pueden eliminar planes en estado Borrador.

#### RF-PM-010 — Consultar planes de medición por plan de estudios, tipo y estado

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito consultar los planes de medición existentes filtrando por plan de estudios, tipo de medición y estado, para ubicar rápidamente el que requiero.

**Descripción:** Muestra un listado de planes de medición aplicando los filtros seleccionados.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El usuario tiene sesión activa.

**Flujo principal:**

1. El usuario accede al listado de planes de medición.
2. Aplica los filtros deseados.
3. El sistema muestra los resultados.

**Flujos alternativos / excepciones:** Si no hay coincidencias, se muestra un mensaje de listado vacío.

**Resultado esperado:** El usuario visualiza los planes de medición que cumplen los criterios de búsqueda.

**Reglas de negocio:**

- RN1: El listado indica el estado de cada plan mediante un indicador visual.

### 3.2. Definición de la Meta

#### RF-PM-011 — Establecer la meta (%) del plan de medición

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer una meta porcentual para el plan de medición, para definir el umbral de logro esperado en la evaluación de las competencias.

**Descripción:** Permite registrar un único valor de meta (%) aplicable a todo el plan de medición.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición existe y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa el valor de la meta en porcentaje.
2. El sistema valida el rango permitido (ver RF-PM-012).
3. El sistema guarda el valor.

**Flujos alternativos / excepciones:** Si el valor ingresado está fuera del rango permitido, el sistema rechaza el ingreso.

**Resultado esperado:** El plan de medición queda configurado con una meta porcentual única.

**Reglas de negocio:**

- RN1: La meta es un único valor aplicable a todas las competencias del plan (no se define por competencia individual).
- RN2: El valor se almacena internamente como fracción decimal (por ejemplo, 70% se almacena como 0.7).

#### RF-PM-012 — Validar el rango permitido de la meta

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo validar que la meta ingresada se encuentre dentro de un rango válido.

**Descripción:** Ejecuta una validación numérica sobre el valor de la meta antes de guardarlo.

**Actor(es):** Sistema

**Precondiciones:** Se ingresó un valor de meta.

**Flujo principal:**

1. El sistema verifica que el valor esté entre 0% y 100%.
2. Si es válido, permite continuar.

**Flujos alternativos / excepciones:** Si el valor es menor a 0% o mayor a 100%, el sistema muestra un mensaje de error específico.

**Resultado esperado:** Solo se aceptan valores de meta dentro del rango permitido.

**Reglas de negocio:**

- RN1: El rango válido es de 0% a 100%, ambos inclusive.

### 3.3. Asociación de Competencias al Plan de Medición

#### RF-PM-013 — Seleccionar las competencias a incluir en el plan de medición, agrupadas por Atributo del Graduado

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar, agrupadas por Atributo del Graduado, las competencias que formarán parte del plan de medición, para definir el alcance de lo que se va a evaluar.

**Descripción:** Presenta las competencias del plan de estudios base agrupadas por atributo del graduado, permitiendo seleccionar una o varias para incluirlas en el plan de medición.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de estudios base tiene atributos del graduado y competencias asociadas (ver RF120-RF127).

**Flujo principal:**

1. El usuario visualiza las competencias agrupadas por atributo.
2. Selecciona una o varias competencias.
3. El sistema las incorpora al plan de medición.

**Flujos alternativos / excepciones:** Si una competencia no tiene ningún atributo del graduado asociado, el sistema la excluye de la lista de selección (ver RF127).

**Resultado esperado:** El plan de medición queda con el conjunto de competencias que serán evaluadas.

**Reglas de negocio:**

- RN1: Una competencia solo puede incluirse una vez por plan de medición.

#### RF-PM-014 — Visualizar competencias agrupadas por atributo del graduado durante la configuración

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como usuario necesito visualizar, durante la configuración del plan, cuántas y cuáles competencias hay disponibles por cada atributo del graduado.

**Descripción:** Muestra un panel de apoyo con la agrupación de competencias por atributo mientras se configura el plan de medición.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Se está en el paso de selección de competencias del plan de medición.

**Flujo principal:**

1. El sistema muestra el panel agrupado junto al formulario de selección.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario cuenta con una vista de apoyo para decidir qué competencias incluir.

**Reglas de negocio:**

- RN1: Esta vista es de solo lectura dentro del flujo de configuración.

#### RF-PM-015 — Validar que el plan de medición tenga al menos una competencia seleccionada

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo impedir que se cree o apruebe un plan de medición sin ninguna competencia asociada.

**Descripción:** Ejecuta una validación de completitud antes de permitir avanzar el plan más allá del estado Borrador.

**Actor(es):** Sistema

**Precondiciones:** Se solicita generar o enviar a revisión un plan de medición.

**Flujo principal:**

1. El sistema verifica que exista al menos una competencia seleccionada.
2. Si la validación es correcta, permite continuar.

**Flujos alternativos / excepciones:** Si no hay ninguna competencia seleccionada, el sistema bloquea la acción y muestra el motivo.

**Resultado esperado:** Todo plan de medición generado cuenta con al menos una competencia.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta antes de enviar el plan a revisión (ver RF-PM-035).

### 3.4. Definición de Periodos — Medición Directa

#### RF-PM-016 — Cargar automáticamente los periodos académicos del plan de estudios, con opción de agregar o quitar periodos

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito que el sistema cargue automáticamente los periodos académicos del plan de estudios con el que se está trabajando al configurar un plan de medición directa, pudiendo luego agregar o quitar periodos según lo requiera, ya que los periodos del plan de medición no necesariamente coinciden con los del plan de estudios.

**Descripción:** Al seleccionar el plan de estudios base (RF-PM-001), el sistema precarga automáticamente los periodos académicos definidos en dicho plan de estudios como propuesta inicial para el plan de medición directa. El usuario puede agregar periodos adicionales o quitar periodos precargados que no correspondan.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición es de tipo Directa (ver RF-PM-002) y el plan de estudios base ya fue seleccionado (RF-PM-001).

**Flujo principal:**

1. El sistema recupera los periodos académicos del plan de estudios base y los precarga en el plan de medición.
2. El usuario revisa la propuesta.
3. El usuario agrega periodos adicionales o quita periodos precargados según corresponda.
4. El sistema guarda la lista final de periodos.

**Flujos alternativos / excepciones:** Si el plan de estudios base no tiene periodos académicos definidos, el sistema inicia la lista vacía y solicita que el usuario los agregue manualmente.

**Resultado esperado:** El plan de medición directa queda con su horizonte de periodos académicos definido, partiendo de una propuesta automática que puede ajustarse libremente.

**Reglas de negocio:**

- RN1: La precarga automática es solo una propuesta inicial, no una restricción.
- RN2: Los periodos finales del plan de medición pueden diferir total o parcialmente de los periodos del plan de estudios base.
- RN3: Debe existir al menos un periodo definido.

#### RF-PM-017 — Definir la fecha de cierre/reporte de cada periodo del plan de medición directa

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito asociar una fecha de cierre o reporte a cada periodo académico del plan directo, para saber cuándo debe quedar consolidada la evidencia de esa medición.

**Descripción:** Permite registrar, para cada periodo académico del plan directo, una fecha límite de reporte o cierre asociada.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El periodo académico ya fue agregado al plan (ver RF-PM-016).

**Flujo principal:**

1. El usuario ingresa la fecha de cierre para el periodo.
2. El sistema valida el formato de la fecha.
3. El sistema guarda la fecha asociada al periodo.

**Flujos alternativos / excepciones:** Si la fecha ingresada es anterior al propio periodo académico, el sistema solicita confirmación antes de guardar.

**Resultado esperado:** Cada periodo académico del plan directo queda con su fecha de cierre asociada.

**Reglas de negocio:**

- RN1: La fecha de cierre es opcional al momento de crear el periodo, pero obligatoria antes de aprobar el plan.

#### RF-PM-018 — Validar que los periodos académicos seleccionados no se dupliquen

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo impedir que un mismo periodo académico se agregue más de una vez a un plan de medición directa.

**Descripción:** Ejecuta una validación de unicidad sobre los periodos académicos del plan al momento de agregarlos.

**Actor(es):** Sistema

**Precondiciones:** Se intenta agregar un periodo académico al plan.

**Flujo principal:**

1. El sistema verifica si el periodo ya existe en el plan.
2. Si no existe, lo agrega.

**Flujos alternativos / excepciones:** Si el periodo ya existe, el sistema rechaza el ingreso duplicado y muestra un mensaje.

**Resultado esperado:** Cada periodo académico aparece una única vez por plan.

**Reglas de negocio:**

- RN1: La combinación plan de medición + periodo académico es única.

#### RF-PM-019 — Ordenar cronológicamente los periodos del plan de medición directa

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como usuario necesito que los periodos académicos del plan se muestren siempre en orden cronológico, para facilitar su lectura.

**Descripción:** Ordena automáticamente los periodos académicos del plan directo de forma ascendente por fecha.

**Actor(es):** Sistema

**Precondiciones:** El plan tiene dos o más periodos registrados.

**Flujo principal:**

1. El sistema ordena los periodos antes de mostrarlos en cualquier vista o exportación.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Los periodos se visualizan siempre en orden cronológico.

**Reglas de negocio:**

- RN1: El orden se aplica de forma consistente en pantalla, exportaciones y reportes.

### 3.5. Definición de Periodos — Medición Indirecta

#### RF-PM-020 — Seleccionar los años que abarcará el plan de medición indirecta

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar los años calendario que abarcará el plan de medición indirecta, para definir su horizonte temporal.

**Descripción:** Permite definir uno o varios años (por ejemplo, 2024, 2025, 2026) que formarán el horizonte del plan de medición indirecta.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición es de tipo Indirecta (ver RF-PM-002).

**Flujo principal:**

1. El usuario ingresa o selecciona los años a incluir.
2. El sistema los agrega al plan.

**Flujos alternativos / excepciones:** Si el usuario intenta ingresar un año con formato inválido, el sistema rechaza el ingreso.

**Resultado esperado:** El plan de medición indirecta queda con su horizonte de años definido.

**Reglas de negocio:**

- RN1: Debe existir al menos un año definido.

#### RF-PM-021 — Validar que los años seleccionados no se dupliquen

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo impedir que un mismo año se agregue más de una vez a un plan de medición indirecta.

**Descripción:** Ejecuta una validación de unicidad sobre los años del plan al momento de agregarlos.

**Actor(es):** Sistema

**Precondiciones:** Se intenta agregar un año al plan.

**Flujo principal:**

1. El sistema verifica si el año ya existe en el plan.
2. Si no existe, lo agrega.

**Flujos alternativos / excepciones:** Si el año ya existe, el sistema rechaza el ingreso duplicado.

**Resultado esperado:** Cada año aparece una única vez por plan.

**Reglas de negocio:**

- RN1: La combinación plan de medición + año es única.

### 3.6. Programación de Mediciones por Competencia y Periodo

#### RF-PM-022 — Programar en qué periodos se medirá cada competencia

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito marcar, para cada competencia del plan, en cuáles de los periodos definidos se realizará su medición, ya que no todas las competencias se evalúan en todos los periodos.

**Descripción:** Permite construir la matriz de programación competencia × periodo, marcando las celdas en las que la competencia será medida en ese periodo específico.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición tiene competencias y periodos definidos.

**Flujo principal:**

1. El usuario accede a la matriz de programación.
2. Marca las celdas competencia-periodo en las que se realizará la medición.
3. El sistema guarda la programación.

**Flujos alternativos / excepciones:** Si el usuario intenta guardar sin haber marcado ninguna celda para una competencia, el sistema lo advierte (ver RF-PM-025).

**Resultado esperado:** Queda definida la programación específica de cada competencia a lo largo de los periodos del plan.

**Reglas de negocio:**

- RN1: No todas las competencias necesitan medirse en todos los periodos.
- RN2: Una celda competencia-periodo solo admite dos valores: programada o no programada.

#### RF-PM-023 — Editar la programación de mediciones de una competencia

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito modificar la programación de una competencia ya marcada, mientras el plan se encuentra en estado Borrador.

**Descripción:** Permite agregar o quitar marcas de programación (celdas competencia-periodo) sobre un plan en estado Borrador.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona la celda a modificar.
2. Cambia su valor (programada / no programada).
3. El sistema guarda el cambio.

**Flujos alternativos / excepciones:** Si el plan no está en Borrador, el sistema bloquea la edición directa (ver RF-PM-007).

**Resultado esperado:** La programación queda actualizada según lo requerido.

**Reglas de negocio:**

- RN1: Solo se permite editar la programación en estado Borrador.

#### RF-PM-024 — Visualizar la programación consolidada en formato de tabla (matriz competencia × periodo)

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito visualizar el plan de medición completo en formato de tabla, con las competencias en filas y los periodos en columnas, para tener una vista general del plan.

**Descripción:** Genera y muestra la matriz competencia × periodo con las marcas de programación correspondientes, replicando la lógica de tabla usada en los planes de medición institucionales existentes.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de medición tiene competencias, periodos y programación definidos.

**Flujo principal:**

1. El usuario accede a la vista de tabla del plan.
2. El sistema construye la matriz con las competencias, periodos y marcas correspondientes.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario visualiza el plan de medición completo en formato de tabla.

**Reglas de negocio:**

- RN1: Las competencias se agrupan visualmente por atributo del graduado.
- RN2: Los periodos se muestran ordenados cronológicamente.

#### RF-PM-025 — Validar que cada competencia tenga al menos un periodo programado

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo advertir cuando una competencia incluida en el plan no tiene ningún periodo programado para su medición.

**Descripción:** Ejecuta una validación de completitud sobre la matriz de programación antes de avanzar el estado del plan.

**Actor(es):** Sistema

**Precondiciones:** Se solicita enviar a revisión un plan de medición.

**Flujo principal:**

1. El sistema recorre las competencias del plan.
2. Verifica que cada una tenga al menos un periodo marcado.
3. Si todas cumplen, permite continuar.

**Flujos alternativos / excepciones:** Si alguna competencia no tiene ningún periodo programado, el sistema lo señala e impide continuar hasta corregirlo.

**Resultado esperado:** Todo plan de medición enviado a revisión tiene programación completa para sus competencias.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta antes de enviar el plan a revisión (ver RF-PM-035).

#### RF-PM-026 — Marcar el estado de cada medición programada (pendiente / realizada)

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito registrar, además de si una medición está programada, si esta ya fue efectivamente realizada, para dar seguimiento real al avance del plan.

**Descripción:** Añade a cada celda programada de la matriz un segundo estado (pendiente / realizada), distinto del estado de programación inicial.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición se encuentra en estado Vigente y la celda está marcada como programada.

**Flujo principal:**

1. El usuario selecciona la celda programada.
2. Marca la medición como realizada.
3. El sistema guarda el cambio con fecha y usuario.

**Flujos alternativos / excepciones:** Si la celda no está programada, el sistema no permite marcarla como realizada.

**Resultado esperado:** El plan de medición refleja no solo lo planificado, sino también su avance real.

**Reglas de negocio:**

- RN1: Solo una celda programada puede marcarse como realizada.
- RN2: El cambio queda registrado con usuario y fecha.

#### RF-PM-046 — Generar alerta cuando una medición programada no fue marcada como realizada al llegar su fecha de cierre

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito que el sistema me alerte cuando se llegue a la fecha de cierre de un periodo y una medición programada aún no haya sido marcada como realizada, para poder darle seguimiento oportuno.

**Descripción:** Verifica, para cada celda programada del plan de medición directa, si la fecha de cierre asociada a su periodo (RF-PM-017) ya se cumplió sin que la medición haya sido marcada como realizada (RF-PM-026); en ese caso, genera una alerta visible indicando que la medición aún no está registrada como realizada.

**Actor(es):** Sistema

**Precondiciones:** El plan de medición se encuentra en estado Vigente y tiene al menos un periodo con fecha de cierre definida.

**Flujo principal:**

1. El sistema revisa las fechas de cierre de los periodos del plan.
2. Si una fecha de cierre ya se cumplió y la celda correspondiente no está marcada como realizada, genera la alerta.
3. La alerta se muestra a los responsables del plan (Director de carrera, Coordinador académico).

**Flujos alternativos / excepciones:** Si la medición se marca como realizada antes de que se genere la alerta, esta no llega a generarse.

**Resultado esperado:** Los responsables del plan quedan notificados de las mediciones programadas que no se completaron tras su fecha de cierre.

**Reglas de negocio:**

- RN1: La alerta se genera automáticamente, sin intervención manual.
- RN2: La alerta permanece visible hasta que la medición se marque como realizada.
- RN3: Esta validación aplica únicamente al plan de medición Directa, ya que es el único tipo con fecha de cierre por periodo (ver RF-PM-017).

### 3.7. Generación y Exportación del Plan

#### RF-PM-027 — Generar el plan de medición con los datos configurados

*Origen: Existente / Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo consolidar todos los datos configurados (plan de estudios, tipo, meta, competencias, periodos y programación) en el plan de medición final.

**Descripción:** Genera la versión consolidada del plan de medición a partir de la configuración registrada.

**Actor(es):** Sistema

**Precondiciones:** Se completaron todos los pasos de configuración del plan.

**Flujo principal:**

1. El sistema recopila los datos configurados.
2. Construye el plan de medición consolidado.
3. Lo deja disponible para su visualización, envío a revisión y exportación.

**Flujos alternativos / excepciones:** Si falta algún dato obligatorio, el sistema señala qué falta completar.

**Resultado esperado:** El plan de medición queda generado y disponible en formato de tabla (ver RF-PM-024).

**Reglas de negocio:**

- RN1: El plan se genera con los datos vigentes al momento de la generación.

#### RF-PM-028 — Exportar el plan de medición a Excel

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito exportar el plan de medición a un archivo Excel, para compartirlo o usarlo en procesos externos de acreditación.

**Descripción:** Genera un archivo Excel con la matriz competencia × periodo del plan de medición, replicando exactamente el formato de tabla utilizado en los documentos institucionales de acreditación (plan de medición Directa/Indirecta ya usados por la universidad).

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición fue generado (ver RF-PM-027).

**Flujo principal:**

1. El usuario selecciona 'Exportar a Excel'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un archivo Excel con el plan de medición completo, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El formato exportado debe ser igual al formato institucional utilizado actualmente para los planes de medición (mismo orden de columnas, agrupación por atributo del graduado y periodos).

#### RF-PM-029 — Exportar el plan de medición a PDF

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Director de carrera necesito exportar el plan de medición a PDF, para incluirlo como evidencia documental en los procesos de acreditación.

**Descripción:** Genera un documento PDF con la matriz competencia × periodo del plan de medición y sus datos generales (meta, tipo, plan de estudios), replicando el mismo formato institucional utilizado en las Actas de acreditación.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición fue generado (ver RF-PM-027).

**Flujo principal:**

1. El usuario selecciona 'Exportar a PDF'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un documento PDF con el plan de medición completo, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El PDF incluye el código, tipo, meta y estado del plan en su encabezado.
- RN2: El formato del documento debe ser igual al formato institucional ya utilizado por la universidad para estos planes.

### 3.8. Versionado e Historial

#### RF-PM-030 — Generar una nueva versión del plan de medición

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito generar una nueva versión de un plan de medición Aprobado o Vigente, para poder modificarlo sin alterar la versión ya aprobada.

**Descripción:** Crea una copia editable del plan de medición en estado Borrador, conservando el vínculo con la versión de la que proviene.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición se encuentra en estado Aprobado, Vigente o Histórico.

**Flujo principal:**

1. El usuario selecciona 'Nueva versión'.
2. El sistema crea una copia del plan en estado Borrador.
3. El usuario edita la nueva versión libremente.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Queda disponible una nueva versión editable del plan de medición.

**Reglas de negocio:**

- RN1: La nueva versión referencia a la versión de la cual proviene.
- RN2: La versión original permanece sin cambios.

#### RF-PM-031 — Consultar versiones anteriores del plan de medición

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como usuario necesito consultar las versiones anteriores de un plan de medición, para revisar cómo evolucionó a lo largo del tiempo.

**Descripción:** Muestra el listado de versiones de un plan de medición, con su estado y fecha de creación.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de medición tiene al menos una versión previa.

**Flujo principal:**

1. El usuario accede al historial de versiones del plan.
2. El sistema muestra el listado de versiones.

**Flujos alternativos / excepciones:** Si el plan no tiene versiones previas, se muestra únicamente la versión actual.

**Resultado esperado:** El usuario visualiza el historial de versiones del plan de medición.

**Reglas de negocio:**

- RN1: El listado se muestra ordenado de la versión más reciente a la más antigua.

#### RF-PM-032 — Registrar histórico de modificaciones del plan de medición

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo registrar cada modificación relevante realizada sobre un plan de medición, junto con el usuario y la fecha en que ocurrió.

**Descripción:** Guarda un registro histórico de cambios (meta, periodos, competencias, programación, estado) asociado a cada plan de medición.

**Actor(es):** Sistema

**Precondiciones:** Se realiza una modificación sobre un plan de medición.

**Flujo principal:**

1. El sistema detecta el cambio realizado.
2. Registra el detalle, el usuario y la fecha en el histórico.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan de medición cuenta con un histórico de modificaciones consultable.

**Reglas de negocio:**

- RN1: El histórico no puede editarse ni eliminarse desde la aplicación.

#### RF-PM-033 — Consultar una versión anterior en modo solo lectura

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como usuario necesito abrir una versión anterior de un plan de medición en modo de solo lectura, para consultarla sin riesgo de modificarla.

**Descripción:** Permite visualizar el contenido completo de una versión histórica del plan sin habilitar ninguna opción de edición.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existe una versión histórica del plan de medición.

**Flujo principal:**

1. El usuario selecciona la versión histórica.
2. El sistema la muestra en modo solo lectura.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario consulta la versión histórica sin poder alterarla.

**Reglas de negocio:**

- RN1: Ninguna opción de edición está disponible sobre versiones históricas.

#### RF-PM-034 — Duplicar un plan de medición como base para un nuevo periodo

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito duplicar un plan de medición existente para usarlo como punto de partida de un plan correspondiente a un nuevo periodo de acreditación.

**Descripción:** Crea una copia independiente de un plan de medición (con su meta, competencias y estructura de programación), en estado Borrador y sin vínculo de versión con el original.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición a duplicar existe.

**Flujo principal:**

1. El usuario selecciona 'Duplicar plan'.
2. El sistema crea una copia en estado Borrador.
3. El usuario ajusta los periodos y demás datos según corresponda.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Queda disponible un nuevo plan de medición independiente, basado en la estructura del plan duplicado.

**Reglas de negocio:**

- RN1: La copia no hereda el código ni el estado del plan original; se genera un código nuevo (ver RF-PM-004).

### 3.9. Aprobación y Validación

#### RF-PM-035 — Enviar el plan de medición a revisión

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito enviar un plan de medición a revisión una vez que considero que está completo, para que sea evaluado antes de su aprobación.

**Descripción:** Cambia el estado del plan de Borrador a En revisión, ejecutando previamente las validaciones de completitud del plan.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona 'Enviar a revisión'.
2. El sistema ejecuta la validación integral (ver RF-PM-038).
3. Si es correcta, cambia el estado a En revisión.

**Flujos alternativos / excepciones:** Si la validación integral detecta inconsistencias, el sistema impide el envío y muestra el detalle.

**Resultado esperado:** El plan de medición queda disponible para su revisión por el Director de carrera.

**Reglas de negocio:**

- RN1: Solo se puede enviar a revisión un plan en estado Borrador.

#### RF-PM-036 — Aprobar el plan de medición

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito aprobar un plan de medición que se encuentra en revisión, para que pueda pasar a estado Vigente, de la misma forma en que apruebo el plan de estudios.

**Descripción:** Cambia el estado del plan de En revisión a Aprobado, dejando registro del responsable y la fecha.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El plan de medición se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario revisa el plan.
2. Selecciona 'Aprobar'.
3. El sistema cambia el estado a Aprobado y registra el responsable y la fecha.

**Flujos alternativos / excepciones:** No aplica; el rechazo se gestiona mediante RF-PM-037.

**Resultado esperado:** El plan de medición queda aprobado y disponible para marcarse como Vigente.

**Reglas de negocio:**

- RN1: Solo un usuario con el rol de aprobación puede ejecutar esta acción.

#### RF-PM-037 — Rechazar u observar el plan de medición con comentarios

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito rechazar u observar un plan de medición en revisión, indicando los motivos, para que sea corregido antes de una nueva revisión.

**Descripción:** Permite devolver el plan al estado Borrador junto con un comentario obligatorio que explique el motivo del rechazo u observación.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El plan de medición se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario selecciona 'Rechazar / Observar'.
2. Ingresa el comentario correspondiente.
3. El sistema cambia el estado a Borrador y notifica el motivo.

**Flujos alternativos / excepciones:** Si el comentario queda vacío, el sistema no permite continuar.

**Resultado esperado:** El plan vuelve a estado Borrador con el motivo del rechazo registrado.

**Reglas de negocio:**

- RN1: El comentario de rechazo u observación es obligatorio.
- RN2: El historial de observaciones queda disponible para consulta.

#### RF-PM-038 — Ejecutar una validación integral de consistencia del plan antes de su aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo verificar que el plan de medición cumpla con todas las reglas de completitud antes de permitir su envío a revisión o su aprobación.

**Descripción:** Ejecuta de forma conjunta las validaciones de meta, competencias, periodos y programación (RF-PM-012, RF-PM-015, RF-PM-025) sobre el plan.

**Actor(es):** Sistema

**Precondiciones:** Se solicita enviar a revisión o aprobar un plan de medición.

**Flujo principal:**

1. El sistema ejecuta cada validación de completitud.
2. Si todas son correctas, permite continuar con la acción solicitada.

**Flujos alternativos / excepciones:** Si alguna validación falla, el sistema muestra un reporte consolidado de las inconsistencias encontradas.

**Resultado esperado:** Ningún plan de medición avanza de estado sin cumplir las condiciones mínimas de completitud.

**Reglas de negocio:**

- RN1: Esta validación es un requisito previo obligatorio para RF-PM-035 y RF-PM-036.

#### RF-PM-039 — Registrar responsable y fecha de aprobación

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo registrar quién aprobó un plan de medición y en qué fecha, para efectos de trazabilidad y auditoría.

**Descripción:** Almacena el usuario y la fecha en el momento en que se aprueba un plan de medición.

**Actor(es):** Sistema

**Precondiciones:** Se aprueba un plan de medición (ver RF-PM-036).

**Flujo principal:**

1. El sistema captura el usuario y la fecha en el momento de la aprobación.
2. Los almacena junto al plan.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan aprobado cuenta con evidencia de quién y cuándo lo aprobó.

**Reglas de negocio:**

- RN1: Este dato no puede modificarse posteriormente.

### 3.10. Búsqueda, Filtrado y Consulta

#### RF-PM-040 — Buscar y filtrar planes de medición

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como usuario necesito buscar un plan de medición por código, plan de estudios o palabras clave, para ubicarlo rápidamente.

**Descripción:** Permite filtrar el listado de planes de medición por texto ingresado.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existen planes de medición registrados.

**Flujo principal:**

1. El usuario ingresa un criterio de búsqueda.
2. El sistema filtra el listado.

**Flujos alternativos / excepciones:** Si no hay coincidencias, se muestra el mensaje 'sin resultados'.

**Resultado esperado:** El usuario visualiza únicamente los planes que coinciden con el criterio.

**Reglas de negocio:**

- RN1: La búsqueda aplica sobre código y plan de estudios asociado.

#### RF-PM-041 — Consultar el plan de medición vigente por plan de estudios y tipo

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito consultar directamente el plan de medición vigente de un plan de estudios, para un tipo de medición específico.

**Descripción:** Recupera y muestra el plan de medición en estado Vigente asociado a un plan de estudios y tipo (Directa/Indirecta) determinados.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existe un plan de medición Vigente para el plan de estudios y tipo seleccionados.

**Flujo principal:**

1. El usuario selecciona el plan de estudios y el tipo de medición.
2. El sistema muestra el plan de medición vigente correspondiente.

**Flujos alternativos / excepciones:** Si no existe un plan vigente para esa combinación, el sistema lo indica explícitamente.

**Resultado esperado:** El usuario visualiza el plan de medición vigente correspondiente.

**Reglas de negocio:**

- RN1: Solo puede existir un plan Vigente por combinación de plan de estudios y tipo de medición.

### 3.11. Seguridad, Roles y Permisos Relacionados al Submódulo

#### RF-PM-042 — Restringir la creación y edición del plan de medición a roles autorizados

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo restringir la creación y edición de planes de medición únicamente a los roles autorizados.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de creación o edición sobre un plan de medición.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta crear o editar un plan de medición.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol está autorizado, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no está autorizado, el sistema deniega la operación.

**Resultado esperado:** Solo los roles autorizados (Director de carrera, Coordinador académico) pueden crear o editar planes de medición.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de creación o edición.

#### RF-PM-043 — Restringir la aprobación del plan de medición a un rol con permiso de aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo permitir aprobar, rechazar u observar un plan de medición únicamente al rol de Director de carrera, el mismo rol que ya aprueba el plan de estudios.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de aprobación, rechazo u observación sobre un plan de medición.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta aprobar, rechazar u observar un plan de medición.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol tiene permiso de aprobación, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no tiene el permiso, el sistema deniega la operación.

**Resultado esperado:** Solo el rol autorizado puede aprobar, rechazar u observar planes de medición.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de RF-PM-036 y RF-PM-037.

#### RF-PM-044 — Validar la sesión activa y los permisos antes de cada operación crítica

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo validar que el usuario cuente con sesión activa y los permisos correspondientes antes de ejecutar cualquier operación crítica del submódulo.

**Descripción:** Ejecuta una verificación de autenticación y autorización previa a operaciones de creación, edición, aprobación o eliminación.

**Actor(es):** Sistema

**Precondiciones:** El usuario intenta ejecutar una operación crítica.

**Flujo principal:**

1. El sistema verifica la sesión activa.
2. Verifica los permisos del rol para la operación solicitada.
3. Permite o deniega la acción.

**Flujos alternativos / excepciones:** Si la sesión expiró o los permisos son insuficientes, el sistema deniega la operación y solicita reautenticación si corresponde.

**Resultado esperado:** Ninguna operación crítica se ejecuta sin la debida autenticación y autorización.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta de forma transversal a todos los requerimientos de creación, edición, aprobación y eliminación del submódulo.

#### RF-PM-045 — Registrar en bitácora de auditoría toda acción crítica del submódulo

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo registrar en una bitácora de auditoría toda acción crítica realizada sobre los planes de medición.

**Descripción:** Registra en una bitácora las acciones de creación, edición, cambio de estado, aprobación, rechazo y eliminación de planes de medición, con usuario, fecha y detalle de la acción.

**Actor(es):** Sistema

**Precondiciones:** Se ejecuta una acción crítica sobre un plan de medición.

**Flujo principal:**

1. El sistema detecta la acción crítica.
2. Registra el detalle en la bitácora de auditoría.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Toda acción crítica del submódulo queda trazable en la bitácora de auditoría.

**Reglas de negocio:**

- RN1: Los registros de auditoría no pueden editarse ni eliminarse desde la aplicación.

---

## 4. Requerimientos funcionales — Submódulo: Plan de Evaluación

A continuación se detallan los requerimientos funcionales del submódulo de Plan de Evaluación, continuación directa del submódulo de Planes de Medición: todo plan de evaluación se construye a partir de un plan de medición previamente creado, del cual hereda la meta, las competencias y los periodos o años, restringiendo además la evaluación a las combinaciones competencia-periodo (o competencia-año) que ya estén programadas en dicho plan de medición.

### 4.1. Configuración General del Plan de Evaluación

#### RF-PE-000 — Incorporar el submódulo de Plan de Evaluación dentro del Módulo de Mejora Continua

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como universidad necesito que, dentro del Módulo de Mejora Continua ya creado (ver RF-PM-000), se incorpore un nuevo submódulo de Plan de Evaluación, como continuación directa del submódulo de Planes de Medición.

**Descripción:** Establece la incorporación del submódulo de Plan de Evaluación al Módulo de Mejora Continua. Este submódulo depende funcionalmente del submódulo de Planes de Medición: todo plan de evaluación se construye a partir de un plan de medición previamente creado.

**Actor(es):** Sistema

**Precondiciones:** El Módulo de Mejora Continua y su submódulo de Planes de Medición existen y están operativos.

**Flujo principal:**

1. Se habilita en el Módulo de Mejora Continua el nuevo submódulo de Plan de Evaluación.
2. El submódulo queda disponible con las funcionalidades descritas en la presente sección.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El Módulo de Mejora Continua cuenta con dos submódulos operativos: Planes de Medición y Plan de Evaluación.

**Reglas de negocio:**

- RN1: El submódulo de Plan de Evaluación depende del submódulo de Planes de Medición; no puede operar de forma independiente.
- RN2: El Assessment de Objetivos Educacionales continúa fuera de alcance (ver sección 1.3).

#### RF-PE-001 — Seleccionar el plan de medición base (Directo o Indirecto) previamente creado

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar, para elaborar un plan de evaluación, un plan de medición ya creado (Directo o Indirecto), del cual se heredarán las competencias y los periodos a evaluar.

**Descripción:** Permite elegir un plan de medición existente como base del plan de evaluación. El tipo del plan de evaluación (Directa o Indirecta) queda determinado automáticamente por el tipo del plan de medición seleccionado.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Existe al menos un plan de medición en estado Aprobado o Vigente.

**Flujo principal:**

1. El usuario accede a 'Nuevo plan de evaluación'.
2. Selecciona el plan de medición base de la lista disponible (Directo o Indirecto).
3. El sistema fija el tipo de plan de evaluación según el tipo del plan de medición seleccionado.

**Flujos alternativos / excepciones:** Si no existe ningún plan de medición en estado Aprobado o Vigente, el sistema impide continuar y sugiere completar primero un plan de medición (ver Planes de Medición).

**Resultado esperado:** Queda definido el plan de medición base y, con ello, el tipo del nuevo plan de evaluación.

**Reglas de negocio:**

- RN1: Un plan de evaluación se asocia a un único plan de medición.
- RN2: El tipo del plan de evaluación (Directa/Indirecta) es siempre el mismo que el del plan de medición base y no se selecciona de forma independiente.
- RN3: Solo se listan planes de medición en estado Aprobado o Vigente.

#### RF-PE-002 — Crear el plan de evaluación con los datos generales configurados

*Origen: Existente / Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito crear el plan de evaluación una vez seleccionado el plan de medición base, para dejarlo disponible para su configuración detallada por competencia y por periodo.

**Descripción:** Consolida la selección del plan de medición base y crea el registro del plan de evaluación en estado inicial Borrador, heredando la meta, las competencias y los periodos (o años) del plan de medición.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Se seleccionó el plan de medición base (RF-PE-001).

**Flujo principal:**

1. El usuario confirma la creación del plan de evaluación.
2. El sistema crea el registro en estado Borrador.

**Flujos alternativos / excepciones:** Si no se seleccionó un plan de medición base, el sistema impide la creación.

**Resultado esperado:** Se crea un nuevo plan de evaluación en estado Borrador, listo para su configuración detallada.

**Reglas de negocio:**

- RN1: Un plan de evaluación siempre nace en estado Borrador.
- RN2: La meta del plan de evaluación es la misma que la del plan de medición base; no se vuelve a definir.

#### RF-PE-003 — Generar código único del plan de evaluación

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo generar automáticamente un código único para cada plan de evaluación creado.

**Descripción:** Genera un identificador único (por ejemplo, código del plan de medición base + correlativo de versión) al momento de crear el plan de evaluación.

**Actor(es):** Sistema

**Precondiciones:** Se está creando un nuevo plan de evaluación.

**Flujo principal:**

1. El sistema toma el código del plan de medición base y el correlativo de versión.
2. Genera el código.
3. Lo asigna al plan de evaluación.

**Flujos alternativos / excepciones:** No aplica; el código se genera de forma automática y no editable.

**Resultado esperado:** Cada plan de evaluación queda identificado de forma única e irrepetible.

**Reglas de negocio:**

- RN1: El código generado no puede ser editado manualmente.

#### RF-PE-004 — Definir y gestionar el estado del plan de evaluación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo gestionar el ciclo de vida del plan de evaluación mediante estados definidos, para reflejar su nivel de avance y control de calidad.

**Descripción:** Establece los estados posibles del plan de evaluación: Borrador, En revisión, Aprobado, Vigente, Histórico, replicando el mismo esquema utilizado en Planes de Medición.

**Actor(es):** Sistema

**Precondiciones:** El plan de evaluación existe.

**Flujo principal:**

1. El sistema asigna el estado Borrador al crear el plan.
2. El estado cambia según las transiciones definidas (ver RF-PE-005).

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan de evaluación cuenta en todo momento con un estado válido y trazable.

**Reglas de negocio:**

- RN1: Las transiciones de estado siguen la secuencia: Borrador → En revisión → Aprobado → Vigente → Histórico.

#### RF-PE-005 — Cambiar el estado del plan de evaluación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico o Director de carrera necesito cambiar el estado de un plan de evaluación conforme avanza su proceso de revisión y aprobación.

**Descripción:** Permite ejecutar las transiciones de estado definidas en RF-PE-004: el Coordinador académico envía a revisión, y el Director de carrera aprueba, rechaza u observa.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación existe y su estado actual permite la transición solicitada.

**Flujo principal:**

1. El usuario selecciona la transición deseada.
2. El sistema valida que la transición sea válida desde el estado actual y que el usuario tenga el permiso correspondiente.
3. El sistema actualiza el estado.

**Flujos alternativos / excepciones:** Si la transición no es válida desde el estado actual, o el usuario no tiene el permiso, el sistema la rechaza.

**Resultado esperado:** El plan de evaluación queda en el nuevo estado correspondiente.

**Reglas de negocio:**

- RN1: No se permiten saltos de estado fuera de la secuencia definida.
- RN2: Cada cambio de estado queda registrado con usuario y fecha.

#### RF-PE-006 — Restringir la edición de planes de evaluación en estado Aprobado o Vigente

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo impedir la edición directa de un plan de evaluación que ya fue aprobado o que se encuentra vigente.

**Descripción:** Bloquea las operaciones de edición sobre planes de evaluación cuyo estado sea Aprobado, Vigente o Histórico.

**Actor(es):** Sistema

**Precondiciones:** Se solicita editar un plan de evaluación.

**Flujo principal:**

1. El sistema verifica el estado del plan.
2. Si el estado es distinto de Borrador, bloquea la edición directa.

**Flujos alternativos / excepciones:** Si el usuario necesita modificar un plan Aprobado o Vigente, el sistema sugiere generar una nueva versión (ver RF-PE-035).

**Resultado esperado:** Se preserva la integridad de los planes de evaluación ya aprobados o vigentes.

**Reglas de negocio:**

- RN1: Solo se permite edición libre en estado Borrador.
- RN2: Se exceptúa el registro progresivo de mediciones por periodo o año (ver RF-PE-022 y RF-PE-028), el cual sí se permite en estado Vigente.

#### RF-PE-007 — Editar plan de evaluación en estado Borrador

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito editar un plan de evaluación mientras se encuentra en estado Borrador, para completar o corregir su configuración.

**Descripción:** Permite modificar libremente los datos generales y la configuración por competencia del plan mientras no haya sido enviado a revisión.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona el plan.
2. Modifica los datos requeridos.
3. El sistema guarda los cambios.

**Flujos alternativos / excepciones:** Si el plan ya no está en Borrador, el sistema bloquea la edición directa (ver RF-PE-006).

**Resultado esperado:** Los datos del plan quedan actualizados.

**Reglas de negocio:**

- RN1: Solo se permite edición libre en estado Borrador.

#### RF-PE-008 — Eliminar plan de evaluación en estado Borrador

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito eliminar un plan de evaluación que quedó en estado Borrador y ya no se va a utilizar.

**Descripción:** Permite eliminar de forma definitiva un plan de evaluación que aún no fue enviado a revisión.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona 'Eliminar'.
2. El sistema solicita confirmación.
3. El sistema elimina el registro.

**Flujos alternativos / excepciones:** Si el plan ya no está en Borrador, el sistema rechaza la eliminación.

**Resultado esperado:** El plan de evaluación queda eliminado definitivamente.

**Reglas de negocio:**

- RN1: Solo se pueden eliminar planes en estado Borrador.

#### RF-PE-009 — Consultar planes de evaluación por plan de medición, tipo y estado

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito consultar los planes de evaluación existentes filtrando por plan de medición, tipo y estado, para ubicar rápidamente el que requiero.

**Descripción:** Muestra un listado de planes de evaluación aplicando los filtros seleccionados.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El usuario tiene sesión activa.

**Flujo principal:**

1. El usuario accede al listado de planes de evaluación.
2. Aplica los filtros deseados.
3. El sistema muestra los resultados.

**Flujos alternativos / excepciones:** Si no hay coincidencias, se muestra un mensaje de listado vacío.

**Resultado esperado:** El usuario visualiza los planes de evaluación que cumplen los criterios de búsqueda.

**Reglas de negocio:**

- RN1: El listado indica el estado de cada plan mediante un indicador visual.

### 4.2. Carga de Competencias y Periodos desde el Plan de Medición

#### RF-PE-010 — Cargar automáticamente las competencias del plan de medición seleccionado

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito que el sistema muestre automáticamente todas las competencias del plan de medición seleccionado, para configurarlas en el plan de evaluación.

**Descripción:** Recupera y muestra el conjunto completo de competencias incluidas en el plan de medición base, agrupadas por atributo del graduado.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición base fue seleccionado (RF-PE-001).

**Flujo principal:**

1. El sistema recupera las competencias del plan de medición base.
2. Las muestra agrupadas por atributo del graduado.

**Flujos alternativos / excepciones:** No aplica; la carga es automática y no editable.

**Resultado esperado:** El plan de evaluación queda con el mismo conjunto de competencias que su plan de medición base.

**Reglas de negocio:**

- RN1: Las competencias del plan de evaluación no pueden agregarse ni quitarse manualmente; siempre son las mismas del plan de medición base.

#### RF-PE-011 — Cargar automáticamente los periodos académicos o años del plan de medición seleccionado

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito que los periodos académicos (Directa) o años (Indirecta) del plan de evaluación sean los mismos definidos en el plan de medición seleccionado.

**Descripción:** Recupera y muestra los periodos académicos (si el plan es Directa) o los años (si es Indirecta) definidos en el plan de medición base.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de medición base fue seleccionado (RF-PE-001).

**Flujo principal:**

1. El sistema recupera los periodos académicos o años del plan de medición base.
2. Los muestra disponibles para su configuración progresiva.

**Flujos alternativos / excepciones:** No aplica; la carga es automática.

**Resultado esperado:** El plan de evaluación queda con el mismo horizonte de periodos o años que su plan de medición base.

**Reglas de negocio:**

- RN1: Los periodos académicos o años del plan de evaluación son siempre los mismos del plan de medición base y no se editan desde el plan de evaluación.

#### RF-PE-012 — Restringir la configuración de evaluación a las combinaciones competencia-periodo programadas en el plan de medición

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo permitir configurar la evaluación de una competencia en un periodo (o año) únicamente si dicha combinación fue marcada como programada en el plan de medición base.

**Descripción:** Verifica, antes de habilitar la configuración de una competencia en un periodo o año determinado, que esa combinación esté marcada como programada en la matriz del plan de medición base (ver RF-PM-022).

**Actor(es):** Sistema

**Precondiciones:** El plan de evaluación fue creado a partir de un plan de medición con programación definida.

**Flujo principal:**

1. El sistema verifica si la combinación competencia-periodo (o competencia-año) está programada en el plan de medición base.
2. Si lo está, habilita su configuración en el plan de evaluación.

**Flujos alternativos / excepciones:** Si la combinación no está programada en el plan de medición base, el sistema no la muestra como disponible para configurar en el plan de evaluación.

**Resultado esperado:** El plan de evaluación queda siempre alineado con la programación definida en su plan de medición base.

**Reglas de negocio:**

- RN1: No es posible registrar evaluación para una combinación competencia-periodo (o competencia-año) que no haya sido programada en el plan de medición base.

### 4.3. Configuración por Competencia — Plan de Evaluación Directa

#### RF-PE-013 — Establecer el instrumento de evaluación de cada competencia (Directa)

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer, para cada competencia del plan de evaluación directa, el instrumento de evaluación que se utilizará (por ejemplo, rúbrica analítica).

**Descripción:** Permite registrar el instrumento de evaluación de cada competencia. Este dato se define una única vez por competencia, independientemente del periodo académico.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación es de tipo Directa y las competencias fueron cargadas (RF-PE-010).

**Flujo principal:**

1. El usuario selecciona una competencia.
2. Ingresa el instrumento de evaluación.
3. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el usuario no ingresa un instrumento, el sistema lo marca como pendiente para la validación de completitud (ver RF-PE-042).

**Resultado esperado:** Cada competencia del plan de evaluación directa queda con su instrumento de evaluación definido.

**Reglas de negocio:**

- RN1: El instrumento de evaluación es un dato único por competencia, no varía por periodo académico.

#### RF-PE-014 — Establecer la frecuencia de evaluación de cada competencia (Directa)

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer, para cada competencia del plan de evaluación directa, la frecuencia con la que se evaluará (por ejemplo, semestral).

**Descripción:** Permite registrar la frecuencia de evaluación de cada competencia. Este dato se define una única vez por competencia.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación es de tipo Directa y las competencias fueron cargadas (RF-PE-010).

**Flujo principal:**

1. El usuario selecciona una competencia.
2. Ingresa la frecuencia de evaluación.
3. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el usuario no ingresa una frecuencia, el sistema lo marca como pendiente para la validación de completitud (ver RF-PE-042).

**Resultado esperado:** Cada competencia del plan de evaluación directa queda con su frecuencia de evaluación definida.

**Reglas de negocio:**

- RN1: La frecuencia es un dato único por competencia, no varía por periodo académico.

### 4.4. Programación por Periodo Académico — Plan de Evaluación Directa

#### RF-PE-015 — Seleccionar el periodo académico a completar, de forma progresiva

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar un periodo académico específico del plan de evaluación para completar su información, sin necesidad de completar todos los periodos a la vez.

**Descripción:** Permite elegir, de los periodos académicos cargados (RF-PE-011) y programados (RF-PE-012), uno específico para registrar la información de asignaturas, entregables, docentes, medición y evidencia.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación tiene periodos académicos cargados.

**Flujo principal:**

1. El usuario selecciona un periodo académico disponible.
2. El sistema habilita el formulario de configuración de ese periodo.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario puede avanzar la configuración del plan periodo por periodo, según su propio orden de trabajo.

**Reglas de negocio:**

- RN1: No es obligatorio completar los periodos en un orden específico ni de una sola vez.

#### RF-PE-016 — Asociar una o varias asignaturas del plan de estudios a la competencia, para el periodo seleccionado

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito asociar, para una competencia y un periodo académico específicos, una o varias asignaturas del plan de estudios en el que se está trabajando, ya que una competencia puede evaluarse a través de varias asignaturas, así como una asignatura puede evaluar varias competencias.

**Descripción:** Permite registrar la relación de muchos a muchos entre competencia y asignatura, específica para el periodo académico seleccionado. Solo se permite seleccionar asignaturas pertenecientes al plan de estudios del plan de medición base.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Se seleccionó el periodo académico (RF-PE-015) y la combinación competencia-periodo está programada (RF-PE-012).

**Flujo principal:**

1. El usuario selecciona la competencia dentro del periodo.
2. Selecciona una o varias asignaturas del plan de estudios.
3. El sistema guarda la asociación.

**Flujos alternativos / excepciones:** Si la asignatura seleccionada no pertenece al plan de estudios del plan de medición base, el sistema no la muestra como opción disponible.

**Resultado esperado:** Queda establecida, para el periodo seleccionado, la relación entre la competencia y una o varias asignaturas.

**Reglas de negocio:**

- RN1: La relación es de muchos a muchos: una competencia puede tener varias asignaturas en un mismo periodo, y una asignatura puede evaluar varias competencias.
- RN2: Solo se permiten asignaturas del plan de estudios asociado al plan de medición base.
- RN3: La asociación es específica para cada periodo académico; puede variar de un periodo a otro.

#### RF-PE-017 — Establecer el entregable de cada asignatura asociada

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer, para cada asignatura asociada a una competencia en un periodo, el entregable mediante el cual se evalúa (por ejemplo, un proyecto o informe final).

**Descripción:** Permite registrar el nombre o descripción del entregable correspondiente a cada asociación competencia-asignatura-periodo.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La asignatura fue asociada a la competencia en el periodo (RF-PE-016).

**Flujo principal:**

1. El usuario ingresa el nombre o descripción del entregable para la asignatura asociada.
2. El sistema guarda el dato.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Cada asignatura asociada queda con su entregable definido.

**Reglas de negocio:**

- RN1: El entregable es un dato obligatorio por cada asignatura asociada.

#### RF-PE-018 — Establecer el docente responsable de cada asignatura asociada

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer, para cada asignatura asociada a una competencia en un periodo, el docente responsable de la evaluación.

**Descripción:** Permite registrar el docente responsable correspondiente a cada asociación competencia-asignatura-periodo. El docente puede variar de un periodo a otro, aun para la misma asignatura.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La asignatura fue asociada a la competencia en el periodo (RF-PE-016).

**Flujo principal:**

1. El usuario selecciona el docente responsable para la asignatura asociada.
2. El sistema guarda el dato.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Cada asignatura asociada queda con su docente responsable definido.

**Reglas de negocio:**

- RN1: El docente responsable es un dato obligatorio por cada asignatura asociada.
- RN2: El docente responsable puede ser distinto entre periodos, aun para la misma asignatura y competencia.

#### RF-PE-019 — Registrar el porcentaje de medición alcanzado por competencia en el periodo

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar el porcentaje de medición alcanzado por una competencia en el periodo académico seleccionado.

**Descripción:** Permite ingresar un único valor porcentual de medición alcanzado por competencia y periodo, independientemente de cuántas asignaturas se hayan asociado a dicha competencia en ese periodo.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La competencia tiene al menos una asignatura asociada en el periodo (RF-PE-016).

**Flujo principal:**

1. El usuario ingresa el porcentaje de medición alcanzado.
2. El sistema valida el rango permitido.
3. El sistema guarda el valor.

**Flujos alternativos / excepciones:** Si el valor ingresado está fuera del rango permitido (0% a 100%), el sistema rechaza el ingreso.

**Resultado esperado:** Queda registrado el resultado de la medición de la competencia para el periodo seleccionado.

**Reglas de negocio:**

- RN1: El porcentaje de medición alcanzado es un único valor por competencia y periodo, no por asignatura individual.
- RN2: El valor debe estar entre 0% y 100%.

#### RF-PE-020 — Subir evidencia del entregable de cada asignatura asociada

*Origen: Existente  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito poder subir la evidencia del entregable de cada asignatura asociada a una competencia, aunque esta acción sea opcional.

**Descripción:** Permite adjuntar uno o varios archivos o enlaces de evidencia por cada asignatura asociada a una competencia en un periodo. La opción de subir evidencia debe estar siempre disponible, aunque su uso no sea obligatorio.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La asignatura fue asociada a la competencia en el periodo (RF-PE-016).

**Flujo principal:**

1. El usuario selecciona 'Subir evidencia' para la asignatura asociada.
2. Adjunta el archivo o enlace correspondiente.
3. El sistema guarda la evidencia.

**Flujos alternativos / excepciones:** Si el usuario no sube evidencia, el sistema permite continuar sin bloquear la operación, ya que este dato es opcional.

**Resultado esperado:** La evidencia queda asociada al entregable correspondiente y disponible para su consulta.

**Reglas de negocio:**

- RN1: La evidencia es opcional, pero la opción de subirla debe estar siempre visible y disponible.
- RN2: Puede registrarse más de una evidencia por asignatura asociada.

#### RF-PE-021 — Guardar el avance de un periodo sin necesidad de completar los demás periodos

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito poder guardar el avance de un periodo académico específico sin tener que completar de una vez todos los periodos del plan de evaluación.

**Descripción:** Permite guardar parcialmente la configuración de un periodo (asignaturas, entregables, docentes, medición, evidencia) de forma independiente de los demás periodos del plan.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación se encuentra en estado Borrador o Vigente.

**Flujo principal:**

1. El usuario completa la información disponible para un periodo.
2. El sistema guarda el avance de ese periodo, independientemente del estado de los demás periodos.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El plan de evaluación puede construirse de forma progresiva, periodo por periodo, según el orden que decida el usuario.

**Reglas de negocio:**

- RN1: El avance parcial de un periodo no exige que los demás periodos estén completos.

### 4.5. Configuración por Competencia — Plan de Evaluación Indirecta

#### RF-PE-022 — Establecer el instrumento de evaluación de cada competencia (Indirecta)

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer, para cada competencia del plan de evaluación indirecta, el instrumento de evaluación que se utilizará (por ejemplo, encuesta a egresados y docentes).

**Descripción:** Permite registrar el instrumento de evaluación de cada competencia del plan de evaluación indirecta. Este dato se define una única vez por competencia.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación es de tipo Indirecta y las competencias fueron cargadas (RF-PE-010).

**Flujo principal:**

1. El usuario selecciona una competencia.
2. Ingresa el instrumento de evaluación.
3. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el usuario no ingresa un instrumento, el sistema lo marca como pendiente para la validación de completitud (ver RF-PE-042).

**Resultado esperado:** Cada competencia del plan de evaluación indirecta queda con su instrumento de evaluación definido.

**Reglas de negocio:**

- RN1: El instrumento de evaluación es un dato único por competencia.

#### RF-PE-023 — Establecer la frecuencia de evaluación de cada competencia (Indirecta)

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer, para cada competencia del plan de evaluación indirecta, la frecuencia con la que se evaluará (por ejemplo, anual).

**Descripción:** Permite registrar la frecuencia de evaluación de cada competencia del plan de evaluación indirecta.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación es de tipo Indirecta y las competencias fueron cargadas (RF-PE-010).

**Flujo principal:**

1. El usuario selecciona una competencia.
2. Ingresa la frecuencia de evaluación.
3. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el usuario no ingresa una frecuencia, el sistema lo marca como pendiente para la validación de completitud (ver RF-PE-042).

**Resultado esperado:** Cada competencia del plan de evaluación indirecta queda con su frecuencia de evaluación definida.

**Reglas de negocio:**

- RN1: La frecuencia es un dato único por competencia.

#### RF-PE-024 — Establecer el responsable de cada competencia (Indirecta)

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer, para cada competencia del plan de evaluación indirecta, el responsable de ejecutar la medición (por ejemplo, el Comité de Evaluación del Programa).

**Descripción:** Permite registrar el responsable de cada competencia del plan de evaluación indirecta.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación es de tipo Indirecta y las competencias fueron cargadas (RF-PE-010).

**Flujo principal:**

1. El usuario selecciona una competencia.
2. Ingresa o selecciona el responsable.
3. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el usuario no ingresa un responsable, el sistema lo marca como pendiente para la validación de completitud (ver RF-PE-042).

**Resultado esperado:** Cada competencia del plan de evaluación indirecta queda con su responsable definido.

**Reglas de negocio:**

- RN1: El responsable es un dato obligatorio por competencia antes de aprobar el plan.

### 4.6. Medición Anual — Plan de Evaluación Indirecta

#### RF-PE-025 — Seleccionar el año a completar, de forma progresiva

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar un año específico del plan de evaluación indirecta para registrar su información, sin necesidad de completar todos los años a la vez.

**Descripción:** Permite elegir, de los años cargados (RF-PE-011) y programados (RF-PE-012), uno específico para registrar el porcentaje de cumplimiento de la medición.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación tiene años cargados.

**Flujo principal:**

1. El usuario selecciona un año disponible.
2. El sistema habilita el formulario de registro de ese año.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario puede avanzar la configuración del plan año por año, según su propio orden de trabajo.

**Reglas de negocio:**

- RN1: No es obligatorio completar los años en un orden específico ni de una sola vez.

#### RF-PE-026 — Registrar el porcentaje de cumplimiento de la medición por competencia en el año seleccionado

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar, para cada competencia, el porcentaje de cumplimiento de la medición obtenido en el año seleccionado.

**Descripción:** Permite ingresar el valor porcentual de cumplimiento de la medición indirecta de una competencia para un año específico.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Se seleccionó el año a completar (RF-PE-025) y la combinación competencia-año está programada (RF-PE-012).

**Flujo principal:**

1. El usuario ingresa el porcentaje de cumplimiento para la competencia.
2. El sistema valida el rango permitido.
3. El sistema guarda el valor.

**Flujos alternativos / excepciones:** Si el valor ingresado está fuera del rango permitido (0% a 100%), el sistema rechaza el ingreso.

**Resultado esperado:** Queda registrado el resultado de la medición indirecta de la competencia para el año seleccionado.

**Reglas de negocio:**

- RN1: El valor debe estar entre 0% y 100%.
- RN2: El porcentaje es un único valor por competencia y año.

#### RF-PE-027 — Guardar el avance de un año sin necesidad de completar los demás años

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito poder guardar el avance de un año específico sin tener que completar de una vez todos los años del plan de evaluación indirecta.

**Descripción:** Permite guardar parcialmente el porcentaje de cumplimiento registrado para un año, de forma independiente de los demás años del plan.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación se encuentra en estado Borrador o Vigente.

**Flujo principal:**

1. El usuario completa la información disponible para un año.
2. El sistema guarda el avance de ese año, independientemente del estado de los demás años.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El plan de evaluación indirecta puede construirse de forma progresiva, año por año.

**Reglas de negocio:**

- RN1: El avance parcial de un año no exige que los demás años estén completos.

### 4.7. Indicaciones de Medición

#### RF-PE-028 — Registrar una o varias indicaciones asociadas a la medición de un año, por grupo objetivo

*Origen: Ampliado  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito poder establecer indicaciones para la medición indirecta de un año, dirigidas a un grupo objetivo específico (por ejemplo, Docentes o Egresados), para dejar claro a quién y cómo se debe aplicar la medición.

**Descripción:** Permite registrar, para un año del plan de evaluación indirecta, una o varias indicaciones. Cada indicación se dirige a un grupo objetivo (por ejemplo, Docentes, Egresados u otro) e incluye un texto de instrucción.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación es de tipo Indirecta y tiene al menos un año cargado.

**Flujo principal:**

1. El usuario selecciona el año.
2. Agrega una indicación indicando el grupo objetivo y el texto de instrucción.
3. El sistema guarda la indicación.

**Flujos alternativos / excepciones:** No aplica; puede registrarse cero, una o varias indicaciones por año.

**Resultado esperado:** El año queda con sus indicaciones de medición registradas, agrupadas por grupo objetivo.

**Reglas de negocio:**

- RN1: Puede haber más de una indicación por año, una por cada grupo objetivo.
- RN2: El registro de indicaciones es opcional.

#### RF-PE-029 — Asociar a cada indicación un enlace al instrumento de recolección y, opcionalmente, un enlace a los resultados

*Origen: Ampliado  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito asociar a cada indicación el enlace al instrumento de recolección (por ejemplo, una encuesta) y, si ya se cuenta con ellos, el enlace a los resultados obtenidos.

**Descripción:** Permite registrar, dentro de una indicación, un enlace al instrumento de recolección (por ejemplo, un formulario) y, de forma opcional, un enlace a los resultados o análisis de dicho instrumento.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La indicación fue registrada (RF-PE-028).

**Flujo principal:**

1. El usuario ingresa el enlace al instrumento de recolección.
2. Opcionalmente, ingresa el enlace a los resultados.
3. El sistema guarda los enlaces.

**Flujos alternativos / excepciones:** Si el enlace a los resultados aún no está disponible, el usuario puede dejarlo vacío y completarlo posteriormente.

**Resultado esperado:** La indicación queda con sus enlaces de instrumento y, cuando corresponde, de resultados.

**Reglas de negocio:**

- RN1: El enlace al instrumento de recolección es obligatorio; el enlace a los resultados es opcional y puede completarse después.

#### RF-PE-030 — Editar o eliminar una indicación registrada

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como Coordinador académico necesito poder editar o eliminar una indicación registrada, en caso de que haya cambiado el instrumento, el enlace o el texto de instrucción.

**Descripción:** Permite modificar o eliminar una indicación previamente registrada, mientras el plan de evaluación se encuentra en estado Borrador o Vigente.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La indicación existe.

**Flujo principal:**

1. El usuario selecciona la indicación.
2. La edita o solicita su eliminación.
3. El sistema guarda el cambio o elimina el registro.

**Flujos alternativos / excepciones:** Si se solicita eliminar, el sistema pide confirmación antes de proceder.

**Resultado esperado:** La indicación queda actualizada o eliminada según lo solicitado.

**Reglas de negocio:**

- RN1: La eliminación de una indicación no afecta los porcentajes de cumplimiento ya registrados para el año.

### 4.8. Generación y Exportación del Plan

#### RF-PE-031 — Generar el plan de evaluación con los datos configurados

*Origen: Existente / Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo consolidar todos los datos configurados del plan de evaluación (competencias, periodos o años, asignaturas, entregables, docentes, mediciones, evidencias e indicaciones) en el plan final.

**Descripción:** Genera la versión consolidada del plan de evaluación a partir de la configuración registrada.

**Actor(es):** Sistema

**Precondiciones:** Se completó la configuración disponible del plan de evaluación.

**Flujo principal:**

1. El sistema recopila los datos configurados.
2. Construye el plan de evaluación consolidado.
3. Lo deja disponible para su visualización, envío a revisión y exportación.

**Flujos alternativos / excepciones:** El plan puede generarse con periodos o años parcialmente completados, dado el registro progresivo permitido (ver RF-PE-021 y RF-PE-027).

**Resultado esperado:** El plan de evaluación queda generado y disponible en formato de tabla.

**Reglas de negocio:**

- RN1: El plan se genera con los datos vigentes al momento de la generación, incluyendo periodos o años aún incompletos.

#### RF-PE-032 — Exportar el plan de evaluación a Excel

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito exportar el plan de evaluación a un archivo Excel, en un formato de tabla con todos los datos ingresados, para compartirlo o usarlo en procesos externos de acreditación.

**Descripción:** Genera un archivo Excel con la tabla completa del plan de evaluación (competencias, instrumento, frecuencia, y por cada periodo o año: asignaturas, entregables, docentes, mediciones y evidencias, o indicaciones según corresponda), replicando el formato institucional utilizado actualmente.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de evaluación fue generado (ver RF-PE-031).

**Flujo principal:**

1. El usuario selecciona 'Exportar a Excel'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un archivo Excel con el plan de evaluación completo, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El archivo exportado incluye todos los datos ingresados, aun si algún periodo o año no está completo.
- RN2: El formato exportado debe ser igual al formato institucional utilizado actualmente para los planes de evaluación.

#### RF-PE-033 — Exportar el plan de evaluación a PDF

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito exportar el plan de evaluación a PDF, en un formato de tabla con todos los datos ingresados, para incluirlo como evidencia documental en los procesos de acreditación.

**Descripción:** Genera un documento PDF con la tabla completa del plan de evaluación, replicando el mismo formato institucional utilizado actualmente.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de evaluación fue generado (ver RF-PE-031).

**Flujo principal:**

1. El usuario selecciona 'Exportar a PDF'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un documento PDF con el plan de evaluación completo, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El PDF incluye el código, tipo y estado del plan en su encabezado.
- RN2: El formato del documento debe ser igual al formato institucional ya utilizado por la universidad para estos planes.

### 4.9. Versionado e Historial

#### RF-PE-034 — Generar una nueva versión del plan de evaluación

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito generar una nueva versión de un plan de evaluación Aprobado o Vigente, para poder modificarlo sin alterar la versión ya aprobada.

**Descripción:** Crea una copia editable del plan de evaluación en estado Borrador, conservando el vínculo con la versión de la que proviene.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación se encuentra en estado Aprobado, Vigente o Histórico.

**Flujo principal:**

1. El usuario selecciona 'Nueva versión'.
2. El sistema crea una copia del plan en estado Borrador.
3. El usuario edita la nueva versión libremente.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Queda disponible una nueva versión editable del plan de evaluación.

**Reglas de negocio:**

- RN1: La nueva versión referencia a la versión de la cual proviene.
- RN2: La versión original permanece sin cambios.

#### RF-PE-035 — Consultar versiones anteriores del plan de evaluación

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como usuario necesito consultar las versiones anteriores de un plan de evaluación, para revisar cómo evolucionó a lo largo del tiempo.

**Descripción:** Muestra el listado de versiones de un plan de evaluación, con su estado y fecha de creación.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de evaluación tiene al menos una versión previa.

**Flujo principal:**

1. El usuario accede al historial de versiones del plan.
2. El sistema muestra el listado de versiones.

**Flujos alternativos / excepciones:** Si el plan no tiene versiones previas, se muestra únicamente la versión actual.

**Resultado esperado:** El usuario visualiza el historial de versiones del plan de evaluación.

**Reglas de negocio:**

- RN1: El listado se muestra ordenado de la versión más reciente a la más antigua.

#### RF-PE-036 — Registrar histórico de modificaciones del plan de evaluación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo registrar cada modificación relevante realizada sobre un plan de evaluación, junto con el usuario y la fecha en que ocurrió.

**Descripción:** Guarda un registro histórico de cambios (configuración por competencia, asignaturas, mediciones, evidencias, indicaciones, estado) asociado a cada plan de evaluación.

**Actor(es):** Sistema

**Precondiciones:** Se realiza una modificación sobre un plan de evaluación.

**Flujo principal:**

1. El sistema detecta el cambio realizado.
2. Registra el detalle, el usuario y la fecha en el histórico.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan de evaluación cuenta con un histórico de modificaciones consultable.

**Reglas de negocio:**

- RN1: El histórico no puede editarse ni eliminarse desde la aplicación.

#### RF-PE-037 — Consultar una versión anterior en modo solo lectura

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como usuario necesito abrir una versión anterior de un plan de evaluación en modo de solo lectura, para consultarla sin riesgo de modificarla.

**Descripción:** Permite visualizar el contenido completo de una versión histórica del plan sin habilitar ninguna opción de edición.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existe una versión histórica del plan de evaluación.

**Flujo principal:**

1. El usuario selecciona la versión histórica.
2. El sistema la muestra en modo solo lectura.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario consulta la versión histórica sin poder alterarla.

**Reglas de negocio:**

- RN1: Ninguna opción de edición está disponible sobre versiones históricas.

### 4.10. Aprobación y Validación

#### RF-PE-038 — Enviar el plan de evaluación a revisión

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito enviar un plan de evaluación a revisión una vez que considero que está completo, para que sea evaluado antes de su aprobación.

**Descripción:** Cambia el estado del plan de Borrador a En revisión, ejecutando previamente las validaciones de completitud del plan.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona 'Enviar a revisión'.
2. El sistema ejecuta la validación integral (ver RF-PE-041).
3. Si es correcta, cambia el estado a En revisión.

**Flujos alternativos / excepciones:** Si la validación integral detecta inconsistencias, el sistema impide el envío y muestra el detalle.

**Resultado esperado:** El plan de evaluación queda disponible para su revisión por el Director de carrera.

**Reglas de negocio:**

- RN1: Solo se puede enviar a revisión un plan en estado Borrador.

#### RF-PE-039 — Aprobar el plan de evaluación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito aprobar un plan de evaluación que se encuentra en revisión, para que pueda pasar a estado Vigente.

**Descripción:** Cambia el estado del plan de En revisión a Aprobado, dejando registro del responsable y la fecha.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El plan de evaluación se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario revisa el plan.
2. Selecciona 'Aprobar'.
3. El sistema cambia el estado a Aprobado y registra el responsable y la fecha.

**Flujos alternativos / excepciones:** No aplica; el rechazo se gestiona mediante RF-PE-040.

**Resultado esperado:** El plan de evaluación queda aprobado y disponible para marcarse como Vigente.

**Reglas de negocio:**

- RN1: Solo un usuario con el rol de aprobación puede ejecutar esta acción.

#### RF-PE-040 — Rechazar u observar el plan de evaluación con comentarios

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito rechazar u observar un plan de evaluación en revisión, indicando los motivos, para que sea corregido antes de una nueva revisión.

**Descripción:** Permite devolver el plan al estado Borrador junto con un comentario obligatorio que explique el motivo del rechazo u observación.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El plan de evaluación se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario selecciona 'Rechazar / Observar'.
2. Ingresa el comentario correspondiente.
3. El sistema cambia el estado a Borrador y notifica el motivo.

**Flujos alternativos / excepciones:** Si el comentario queda vacío, el sistema no permite continuar.

**Resultado esperado:** El plan vuelve a estado Borrador con el motivo del rechazo registrado.

**Reglas de negocio:**

- RN1: El comentario de rechazo u observación es obligatorio.
- RN2: El historial de observaciones queda disponible para consulta.

#### RF-PE-041 — Ejecutar una validación integral de consistencia del plan antes de su aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo verificar que el plan de evaluación cumpla con todas las reglas de completitud antes de permitir su envío a revisión o su aprobación.

**Descripción:** Ejecuta de forma conjunta las validaciones de completitud: instrumento, frecuencia y responsable (cuando aplique) definidos por competencia, y datos obligatorios (entregable, docente) en cada asignatura asociada.

**Actor(es):** Sistema

**Precondiciones:** Se solicita enviar a revisión o aprobar un plan de evaluación.

**Flujo principal:**

1. El sistema ejecuta cada validación de completitud sobre las competencias y periodos o años con datos registrados.
2. Si todas son correctas, permite continuar con la acción solicitada.

**Flujos alternativos / excepciones:** Si alguna validación falla, el sistema muestra un reporte consolidado de las inconsistencias encontradas.

**Resultado esperado:** Ningún plan de evaluación avanza de estado sin cumplir las condiciones mínimas de completitud sobre los datos ya registrados.

**Reglas de negocio:**

- RN1: Esta validación es un requisito previo obligatorio para RF-PE-038 y RF-PE-039.
- RN2: Esta validación no exige que todos los periodos o años estén completos, dado el registro progresivo permitido; solo valida la completitud de lo ya registrado.

#### RF-PE-042 — Registrar responsable y fecha de aprobación

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo registrar quién aprobó un plan de evaluación y en qué fecha, para efectos de trazabilidad y auditoría.

**Descripción:** Almacena el usuario y la fecha en el momento en que se aprueba un plan de evaluación.

**Actor(es):** Sistema

**Precondiciones:** Se aprueba un plan de evaluación (ver RF-PE-039).

**Flujo principal:**

1. El sistema captura el usuario y la fecha en el momento de la aprobación.
2. Los almacena junto al plan.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan aprobado cuenta con evidencia de quién y cuándo lo aprobó.

**Reglas de negocio:**

- RN1: Este dato no puede modificarse posteriormente.

### 4.11. Búsqueda, Filtrado y Consulta

#### RF-PE-043 — Buscar y filtrar planes de evaluación

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como usuario necesito buscar un plan de evaluación por código, plan de medición o palabras clave, para ubicarlo rápidamente.

**Descripción:** Permite filtrar el listado de planes de evaluación por texto ingresado.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existen planes de evaluación registrados.

**Flujo principal:**

1. El usuario ingresa un criterio de búsqueda.
2. El sistema filtra el listado.

**Flujos alternativos / excepciones:** Si no hay coincidencias, se muestra el mensaje 'sin resultados'.

**Resultado esperado:** El usuario visualiza únicamente los planes que coinciden con el criterio.

**Reglas de negocio:**

- RN1: La búsqueda aplica sobre código y plan de medición asociado.

#### RF-PE-044 — Consultar el plan de evaluación vigente por plan de medición

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito consultar directamente el plan de evaluación vigente asociado a un plan de medición determinado.

**Descripción:** Recupera y muestra el plan de evaluación en estado Vigente asociado a un plan de medición específico.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existe un plan de evaluación Vigente para el plan de medición seleccionado.

**Flujo principal:**

1. El usuario selecciona el plan de medición.
2. El sistema muestra el plan de evaluación vigente correspondiente.

**Flujos alternativos / excepciones:** Si no existe un plan de evaluación vigente para ese plan de medición, el sistema lo indica explícitamente.

**Resultado esperado:** El usuario visualiza el plan de evaluación vigente correspondiente.

**Reglas de negocio:**

- RN1: Solo puede existir un plan de evaluación Vigente por plan de medición.

### 4.12. Seguridad, Roles y Permisos Relacionados al Submódulo

#### RF-PE-045 — Restringir la creación y edición del plan de evaluación a roles autorizados

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo restringir la creación y edición de planes de evaluación únicamente a los roles autorizados.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de creación o edición sobre un plan de evaluación.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta crear o editar un plan de evaluación.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol está autorizado, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no está autorizado, el sistema deniega la operación.

**Resultado esperado:** Solo los roles autorizados (Director de carrera, Coordinador académico) pueden crear o editar planes de evaluación.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de creación o edición.

#### RF-PE-046 — Restringir la aprobación del plan de evaluación al rol con permiso de aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo permitir aprobar, rechazar u observar un plan de evaluación únicamente al rol de Director de carrera.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de aprobación, rechazo u observación sobre un plan de evaluación.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta aprobar, rechazar u observar un plan de evaluación.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol tiene permiso de aprobación, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no tiene el permiso, el sistema deniega la operación.

**Resultado esperado:** Solo el rol autorizado puede aprobar, rechazar u observar planes de evaluación.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de RF-PE-039 y RF-PE-040.

#### RF-PE-047 — Validar la sesión activa y los permisos antes de cada operación crítica

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo validar que el usuario cuente con sesión activa y los permisos correspondientes antes de ejecutar cualquier operación crítica del submódulo.

**Descripción:** Ejecuta una verificación de autenticación y autorización previa a operaciones de creación, edición, aprobación o eliminación.

**Actor(es):** Sistema

**Precondiciones:** El usuario intenta ejecutar una operación crítica.

**Flujo principal:**

1. El sistema verifica la sesión activa.
2. Verifica los permisos del rol para la operación solicitada.
3. Permite o deniega la acción.

**Flujos alternativos / excepciones:** Si la sesión expiró o los permisos son insuficientes, el sistema deniega la operación y solicita reautenticación si corresponde.

**Resultado esperado:** Ninguna operación crítica se ejecuta sin la debida autenticación y autorización.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta de forma transversal a todos los requerimientos de creación, edición, aprobación y eliminación del submódulo.

#### RF-PE-048 — Registrar en bitácora de auditoría toda acción crítica del submódulo

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo registrar en una bitácora de auditoría toda acción crítica realizada sobre los planes de evaluación.

**Descripción:** Registra en una bitácora las acciones de creación, edición, cambio de estado, aprobación, rechazo y eliminación de planes de evaluación, con usuario, fecha y detalle de la acción.

**Actor(es):** Sistema

**Precondiciones:** Se ejecuta una acción crítica sobre un plan de evaluación.

**Flujo principal:**

1. El sistema detecta la acción crítica.
2. Registra el detalle en la bitácora de auditoría.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Toda acción crítica del submódulo queda trazable en la bitácora de auditoría.

**Reglas de negocio:**

- RN1: Los registros de auditoría no pueden editarse ni eliminarse desde la aplicación.

---

## 5. Requerimientos funcionales — Submódulo: Plan de Mejora

A continuación se detallan los requerimientos funcionales del submódulo de Plan de Mejora. Este submódulo permite registrar acciones de mejora sobre tres aspectos distintos: los Criterios de Acreditación ICACIT, los Objetivos Educacionales del Programa y las Competencias. En los tres casos la acción de mejora comparte los mismos datos de definición (sección 5.2) y de retroalimentación (sección 5.3); lo que varía es la entidad a la que se asocia y el origen del input que la motiva. Únicamente el plan de mejora de competencias depende del submódulo de Plan de Evaluación, del cual toma los periodos académicos, las competencias evaluadas y los porcentajes alcanzados.

### 5.1. Configuración General del Plan de Mejora

#### RF-PJ-000 — Incorporar el submódulo de Plan de Mejora dentro del Módulo de Mejora Continua

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como universidad necesito que, dentro del Módulo de Mejora Continua ya creado (ver RF-PM-000), se incorpore un nuevo submódulo de Plan de Mejora, como continuación de los submódulos de Planes de Medición y Plan de Evaluación.

**Descripción:** Establece la incorporación del submódulo de Plan de Mejora al Módulo de Mejora Continua. Este submódulo permite registrar acciones de mejora sobre tres aspectos distintos: Criterios de Acreditación ICACIT, Objetivos Educacionales del Programa y Competencias. Únicamente el plan de mejora de competencias depende funcionalmente del submódulo de Plan de Evaluación.

**Actor(es):** Sistema

**Precondiciones:** El Módulo de Mejora Continua y sus submódulos de Planes de Medición y Plan de Evaluación existen y están operativos.

**Flujo principal:**

1. Se habilita en el Módulo de Mejora Continua el nuevo submódulo de Plan de Mejora.
2. El submódulo queda disponible con las funcionalidades descritas en la presente sección.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El Módulo de Mejora Continua cuenta con tres submódulos operativos: Planes de Medición, Plan de Evaluación y Plan de Mejora.

**Reglas de negocio:**

- RN1: El plan de mejora de competencias depende del submódulo de Plan de Evaluación; los planes de mejora de criterios y de objetivos educacionales no.
- RN2: El Assessment de Objetivos Educacionales continúa fuera de alcance (ver sección 1.3).

#### RF-PJ-001 — Seleccionar el aspecto sobre el cual se generará el plan de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar sobre cuál de los tres aspectos voy a generar un plan de mejora: Criterios de Acreditación ICACIT, Objetivos Educacionales del Programa o Competencias.

**Descripción:** Permite elegir el tipo de plan de mejora a crear. La elección determina el flujo de configuración posterior y a qué entidad se vinculará la acción de mejora.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El usuario tiene sesión activa y permisos para crear planes de mejora.

**Flujo principal:**

1. El usuario accede a 'Nuevo plan de mejora'.
2. Selecciona el aspecto: Criterio de Acreditación, Objetivo Educacional o Competencia.
3. El sistema habilita el flujo de configuración correspondiente al aspecto elegido.

**Flujos alternativos / excepciones:** No aplica; el aspecto es una selección obligatoria de un valor fijo.

**Resultado esperado:** Queda definido el tipo de plan de mejora a configurar.

**Reglas de negocio:**

- RN1: El aspecto es obligatorio y no editable una vez creado el plan de mejora.

#### RF-PJ-002 — Asociar el plan de mejora a un único criterio, objetivo educacional o competencia

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito asociar cada plan de mejora a un único criterio de acreditación, objetivo educacional o competencia, sabiendo que un mismo criterio, objetivo o competencia puede tener varios planes de mejora.

**Descripción:** Establece la relación uno a muchos entre la entidad de referencia (criterio, objetivo educacional o competencia) y sus planes de mejora: un plan de mejora se vincula a un único elemento, pero un elemento puede tener varios planes de mejora asociados.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Se seleccionó el aspecto del plan de mejora (RF-PJ-001) y existen elementos registrados de ese tipo.

**Flujo principal:**

1. El sistema muestra los elementos disponibles según el aspecto seleccionado.
2. El usuario selecciona un único elemento.
3. El sistema asocia el plan de mejora a dicho elemento.

**Flujos alternativos / excepciones:** Si no existen elementos registrados del aspecto seleccionado, el sistema impide continuar y sugiere registrarlos primero (ver RF129 para criterios de acreditación).

**Resultado esperado:** El plan de mejora queda vinculado a un único criterio, objetivo educacional o competencia.

**Reglas de negocio:**

- RN1: Un plan de mejora se asocia a un único criterio, objetivo educacional o competencia.
- RN2: Un mismo criterio, objetivo educacional o competencia puede tener varios planes de mejora asociados.

#### RF-PJ-003 — Generar código único del plan de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo generar automáticamente un código único para cada plan de mejora creado, para evitar duplicados y facilitar su identificación.

**Descripción:** Genera un identificador correlativo y único para cada plan de mejora al momento de su creación, evitando la asignación manual de códigos y los duplicados que esta puede producir.

**Actor(es):** Sistema

**Precondiciones:** Se está creando un nuevo plan de mejora.

**Flujo principal:**

1. El sistema determina el correlativo siguiente dentro del ámbito de unicidad correspondiente.
2. Genera el código.
3. Lo asigna al plan de mejora.

**Flujos alternativos / excepciones:** No aplica; el código se genera de forma automática y no editable.

**Resultado esperado:** Cada plan de mejora queda identificado de forma única e irrepetible.

**Reglas de negocio:**

- RN1: El código generado no puede ser editado manualmente.
- RN2: El código es único dentro de su ámbito: por criterio de acreditación, por objetivo educacional, o por periodo académico en el caso de competencias.
- RN3: El sistema no permite la existencia de dos planes de mejora con el mismo código dentro de un mismo ámbito.

#### RF-PJ-004 — Definir y gestionar el estado documental del plan de mejora

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo gestionar el ciclo de vida documental del plan de mejora mediante estados definidos, para reflejar su nivel de madurez y control de calidad.

**Descripción:** Establece los estados documentales posibles del plan de mejora: Borrador, En revisión, Aprobado, Vigente, Histórico, replicando el mismo esquema utilizado en Planes de Medición y Plan de Evaluación. Este estado documental es distinto del estado de implementación de la acción de mejora (ver RF-PJ-014).

**Actor(es):** Sistema

**Precondiciones:** El plan de mejora existe.

**Flujo principal:**

1. El sistema asigna el estado Borrador al crear el plan.
2. El estado cambia según las transiciones definidas (ver RF-PJ-005).

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan de mejora cuenta en todo momento con un estado documental válido y trazable.

**Reglas de negocio:**

- RN1: Las transiciones de estado siguen la secuencia: Borrador → En revisión → Aprobado → Vigente → Histórico.
- RN2: El estado documental del plan es independiente del estado de implementación de la acción de mejora.

#### RF-PJ-005 — Cambiar el estado documental del plan de mejora

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico o Director de carrera necesito cambiar el estado documental de un plan de mejora conforme avanza su proceso de revisión y aprobación.

**Descripción:** Permite ejecutar las transiciones de estado definidas en RF-PJ-004: el Coordinador académico envía a revisión, y el Director de carrera aprueba, rechaza u observa.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora existe y su estado actual permite la transición solicitada.

**Flujo principal:**

1. El usuario selecciona la transición deseada.
2. El sistema valida que la transición sea válida desde el estado actual y que el usuario tenga el permiso correspondiente.
3. El sistema actualiza el estado.

**Flujos alternativos / excepciones:** Si la transición no es válida desde el estado actual, o el usuario no tiene el permiso, el sistema la rechaza.

**Resultado esperado:** El plan de mejora queda en el nuevo estado documental correspondiente.

**Reglas de negocio:**

- RN1: No se permiten saltos de estado fuera de la secuencia definida.
- RN2: Cada cambio de estado queda registrado con usuario y fecha.

#### RF-PJ-006 — Editar plan de mejora en estado Borrador

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito editar un plan de mejora mientras se encuentra en estado Borrador, para completar o corregir su configuración.

**Descripción:** Permite modificar libremente los datos de la acción de mejora mientras el plan no haya sido enviado a revisión.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona el plan de mejora.
2. Modifica los datos requeridos.
3. El sistema guarda los cambios.

**Flujos alternativos / excepciones:** Si el plan ya no está en Borrador, el sistema bloquea la edición directa (ver RF-PJ-007).

**Resultado esperado:** Los datos del plan de mejora quedan actualizados.

**Reglas de negocio:**

- RN1: Solo se permite edición libre en estado Borrador.
- RN2: Se exceptúa la actualización del estado de implementación, la carga de evidencias y el registro de la retroalimentación, los cuales sí se permiten en estado Vigente (ver RF-PJ-014, RF-PJ-016 y RF-PJ-018).

#### RF-PJ-007 — Restringir la edición de planes de mejora en estado Aprobado o Vigente

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo impedir la edición directa de un plan de mejora que ya fue aprobado o que se encuentra vigente, para preservar la integridad del documento de acreditación.

**Descripción:** Bloquea las operaciones de edición sobre planes de mejora cuyo estado documental sea Aprobado, Vigente o Histórico, salvo las excepciones de seguimiento previstas.

**Actor(es):** Sistema

**Precondiciones:** Se solicita editar un plan de mejora.

**Flujo principal:**

1. El sistema verifica el estado documental del plan.
2. Si el estado es distinto de Borrador, bloquea la edición directa de los datos de definición de la acción.

**Flujos alternativos / excepciones:** Si el usuario necesita modificar la definición de un plan Aprobado o Vigente, el sistema sugiere generar una nueva versión (ver RF-PJ-021).

**Resultado esperado:** Se preserva la integridad de los planes de mejora ya aprobados o vigentes.

**Reglas de negocio:**

- RN1: Solo se permite edición libre de la definición en estado Borrador.
- RN2: El seguimiento de la implementación (estado, evidencias y retroalimentación) permanece habilitado en estado Vigente.

#### RF-PJ-008 — Eliminar plan de mejora en estado Borrador

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito eliminar un plan de mejora que quedó en estado Borrador y ya no se va a utilizar.

**Descripción:** Permite eliminar de forma definitiva un plan de mejora que aún no fue enviado a revisión.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona 'Eliminar'.
2. El sistema solicita confirmación.
3. El sistema elimina el registro.

**Flujos alternativos / excepciones:** Si el plan ya no está en Borrador, el sistema rechaza la eliminación.

**Resultado esperado:** El plan de mejora queda eliminado definitivamente.

**Reglas de negocio:**

- RN1: Solo se pueden eliminar planes de mejora en estado Borrador.

### 5.2. Definición de la Acción de Mejora (común a los tres aspectos)

#### RF-PJ-009 — Registrar el nombre de la acción de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar el nombre de la acción de mejora, para identificar con claridad en qué consiste la intervención propuesta.

**Descripción:** Permite registrar el nombre o denominación de la acción de mejora. Este campo es común a los tres aspectos (criterios, objetivos educacionales y competencias).

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora fue creado y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa el nombre de la acción de mejora.
2. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el campo queda vacío, el sistema lo marca como pendiente para la validación de completitud (ver RF-PJ-027).

**Resultado esperado:** La acción de mejora queda identificada por su nombre.

**Reglas de negocio:**

- RN1: El nombre de la acción de mejora es obligatorio antes de enviar el plan a revisión.

#### RF-PJ-010 — Registrar el análisis de la causa raíz del problema

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar el análisis de la causa raíz o problema que la acción de mejora busca solucionar, para sustentar la intervención propuesta.

**Descripción:** Permite registrar, en texto libre, el análisis de la causa raíz o del problema identificado que motiva la acción de mejora.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora fue creado y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa el análisis de la causa raíz.
2. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el campo queda vacío, el sistema lo marca como pendiente para la validación de completitud (ver RF-PJ-027).

**Resultado esperado:** La acción de mejora queda sustentada con el análisis de la causa raíz del problema.

**Reglas de negocio:**

- RN1: El análisis de la causa raíz es obligatorio antes de enviar el plan a revisión.

#### RF-PJ-011 — Registrar la justificación de la acción de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar la justificación de la acción de mejora, para explicar por qué esta intervención resolverá el problema identificado.

**Descripción:** Permite registrar, en texto libre, la justificación de la acción de mejora propuesta.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora fue creado y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa la justificación.
2. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el campo queda vacío, el sistema lo marca como pendiente para la validación de completitud (ver RF-PJ-027).

**Resultado esperado:** La acción de mejora queda justificada.

**Reglas de negocio:**

- RN1: La justificación es obligatoria antes de enviar el plan a revisión.

#### RF-PJ-012 — Registrar el plazo o fecha prevista de implementación

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer la fecha o plazo previsto para la ejecución de la acción de mejora, para poder darle seguimiento.

**Descripción:** Permite registrar la fecha o plazo previsto para la ejecución de la acción de mejora.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora fue creado y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa la fecha o plazo previsto.
2. El sistema valida el formato de la fecha.
3. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el formato de la fecha es inválido, el sistema rechaza el ingreso.

**Resultado esperado:** La acción de mejora queda con su plazo de implementación definido.

**Reglas de negocio:**

- RN1: El plazo de implementación es obligatorio antes de enviar el plan a revisión.

#### RF-PJ-013 — Registrar los recursos necesarios, las metas establecidas y el responsable

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer los recursos necesarios, las metas o alcance esperado y el responsable de la acción de mejora, para dejar clara su viabilidad y rendición de cuentas.

**Descripción:** Permite registrar los recursos necesarios para ejecutar la acción, las metas o alcance esperado (en texto libre, ya que pueden ser cuantitativas o cualitativas) y el responsable designado de su ejecución.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora fue creado y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa los recursos necesarios.
2. Ingresa las metas o alcance esperado.
3. Designa al responsable de la acción.
4. El sistema guarda los datos.

**Flujos alternativos / excepciones:** Si alguno de los campos queda vacío, el sistema lo marca como pendiente para la validación de completitud (ver RF-PJ-027).

**Resultado esperado:** La acción de mejora queda con sus recursos, metas y responsable definidos.

**Reglas de negocio:**

- RN1: Las metas establecidas se registran en texto libre, ya que pueden expresarse de forma cuantitativa o cualitativa según la naturaleza de la acción.
- RN2: Los tres campos son obligatorios antes de enviar el plan a revisión.

#### RF-PJ-014 — Registrar y actualizar el estado de implementación de la acción de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar y actualizar el estado de implementación en el que se encuentra la acción de mejora, para poder mostrar y dar seguimiento a su avance real.

**Descripción:** Permite seleccionar y actualizar el estado de avance de la acción de mejora mediante un campo de selección con valores predefinidos (por ejemplo: Pendiente, En proceso, Completado). Este estado es distinto del estado documental del plan (ver RF-PJ-004) y puede actualizarse aun cuando el plan esté en estado Vigente.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora existe.

**Flujo principal:**

1. El usuario selecciona el estado de implementación de la lista de valores disponibles.
2. El sistema guarda el cambio con usuario y fecha.

**Flujos alternativos / excepciones:** Si el usuario no ha seleccionado ningún valor, el sistema muestra el campo como no completado e impide enviar el plan a revisión.

**Resultado esperado:** El estado de implementación de la acción de mejora queda registrado y visible para su seguimiento.

**Reglas de negocio:**

- RN1: El estado de implementación es un campo de selección con valores predefinidos, no un campo de texto libre.
- RN2: El estado de implementación es distinto e independiente del estado documental del plan de mejora.
- RN3: El estado de implementación puede actualizarse mientras el plan se encuentre en estado Vigente.

#### RF-PJ-015 — Visualizar el estado de implementación de los planes de mejora

*Origen: Existente  ·  Prioridad: Media*

**Historia de usuario:** Como usuario necesito visualizar el estado de implementación en el que se encuentra cada plan de mejora, para conocer rápidamente el avance general.

**Descripción:** Muestra el estado de implementación de cada acción de mejora mediante un indicador visual, tanto en el listado de planes de mejora como en la vista de detalle.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existen planes de mejora registrados.

**Flujo principal:**

1. El usuario accede al listado o al detalle de los planes de mejora.
2. El sistema muestra el estado de implementación de cada acción mediante un indicador visual.

**Flujos alternativos / excepciones:** Si una acción aún no tiene estado de implementación seleccionado, el sistema lo indica como no definido.

**Resultado esperado:** El usuario visualiza el avance de implementación de las acciones de mejora.

**Reglas de negocio:**

- RN1: Los distintos estados de implementación deben ser visualmente distinguibles entre sí.

#### RF-PJ-016 — Cargar una o varias evidencias por plan de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito cargar una o varias evidencias por cada plan de mejora, para sustentar documentalmente la ejecución de la acción.

**Descripción:** Permite adjuntar uno o varios archivos o enlaces de evidencia a un plan de mejora. La carga de evidencias permanece habilitada mientras el plan se encuentre en estado Vigente.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora existe.

**Flujo principal:**

1. El usuario selecciona 'Cargar evidencia'.
2. Adjunta el archivo o enlace correspondiente.
3. El sistema guarda la evidencia asociada al plan de mejora.

**Flujos alternativos / excepciones:** Si el archivo excede el tamaño permitido o su formato no está autorizado, el sistema rechaza la carga e indica el motivo.

**Resultado esperado:** El plan de mejora queda sustentado con una o varias evidencias consultables.

**Reglas de negocio:**

- RN1: Un plan de mejora puede tener más de una evidencia asociada.
- RN2: La carga de evidencias permanece habilitada en estado Vigente.

#### RF-PJ-017 — Eliminar una evidencia cargada

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como Coordinador académico necesito eliminar una evidencia cargada por error, para mantener el sustento documental correcto.

**Descripción:** Permite eliminar una evidencia previamente cargada a un plan de mejora.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** La evidencia existe y el plan de mejora no se encuentra en estado Histórico.

**Flujo principal:**

1. El usuario selecciona la evidencia a eliminar.
2. El sistema solicita confirmación.
3. El sistema elimina la evidencia.

**Flujos alternativos / excepciones:** Si el plan de mejora está en estado Histórico, el sistema rechaza la eliminación.

**Resultado esperado:** La evidencia queda eliminada del plan de mejora.

**Reglas de negocio:**

- RN1: La eliminación de una evidencia queda registrada en el histórico de modificaciones del plan.

### 5.3. Retroalimentación: Evaluación del Logro e Impacto

#### RF-PJ-018 — Registrar la retroalimentación del plan de mejora en dos componentes: logro de meta e impacto

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar la retroalimentación de la acción de mejora, evaluando por separado el logro de la meta establecida y el impacto generado, para documentar el resultado real de la intervención.

**Descripción:** Permite registrar la evaluación del resultado de la acción de mejora en dos componentes diferenciados: el logro de la meta (en qué medida se cumplió lo previsto) y el impacto (qué efecto produjo la acción). Esta separación replica la estructura utilizada en los documentos institucionales de acreditación.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora existe.

**Flujo principal:**

1. El usuario ingresa el texto correspondiente al logro de la meta.
2. Ingresa el texto correspondiente al impacto generado.
3. El sistema guarda ambos componentes.

**Flujos alternativos / excepciones:** Si la acción de mejora aún no ha concluido, el usuario puede dejar la retroalimentación vacía y completarla posteriormente.

**Resultado esperado:** El plan de mejora queda con su retroalimentación registrada, diferenciando logro de meta e impacto.

**Reglas de negocio:**

- RN1: La retroalimentación se compone de dos campos diferenciados: logro de meta e impacto.
- RN2: La retroalimentación puede registrarse mientras el plan se encuentre en estado Vigente.
- RN3: La retroalimentación es obligatoria cuando el estado de implementación de la acción es 'Completado'.

#### RF-PJ-019 — Mostrar textos de ayuda o ejemplos para completar la retroalimentación

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito contar con ejemplos o textos de ayuda al momento de completar la retroalimentación, para redactarla con el nivel de detalle y el formato esperados por la acreditación.

**Descripción:** Muestra, junto a los campos de logro de meta e impacto, un texto de ayuda o ejemplo de referencia que oriente al usuario sobre cómo redactar cada componente, replicando la guía que la plantilla institucional ya incluye para este fin.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El usuario se encuentra completando la retroalimentación de un plan de mejora.

**Flujo principal:**

1. El sistema muestra el texto de ayuda o ejemplo junto a cada campo de la retroalimentación.

**Flujos alternativos / excepciones:** No aplica; el texto de ayuda es informativo y no bloquea el registro.

**Resultado esperado:** El usuario cuenta con una guía visible para redactar la retroalimentación de forma adecuada.

**Reglas de negocio:**

- RN1: El texto de ayuda es únicamente orientativo y no se almacena como parte de la retroalimentación.

### 5.4. Plan de Mejora de Criterios de Acreditación

#### RF-PJ-020 — Seleccionar el criterio de acreditación sobre el cual se generará el plan de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar el criterio de acreditación del programa sobre el cual voy a generar un plan de mejora.

**Descripción:** Presenta los criterios de acreditación activos de la carrera profesional y permite seleccionar uno como referencia del plan de mejora.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Existen criterios de acreditación registrados y activos en la carrera profesional (ver RF129).

**Flujo principal:**

1. El sistema muestra los criterios de acreditación activos de la carrera.
2. El usuario selecciona un criterio.
3. El sistema asocia el plan de mejora a dicho criterio.

**Flujos alternativos / excepciones:** Si no existen criterios de acreditación registrados, el sistema impide continuar y sugiere registrarlos primero desde el Módulo de Plan de Estudios (ver RF129).

**Resultado esperado:** El plan de mejora queda asociado a un criterio de acreditación específico.

**Reglas de negocio:**

- RN1: Solo se muestran criterios de acreditación en estado activo.
- RN2: Los criterios de acreditación se gestionan desde el Módulo de Plan de Estudios, a nivel de carrera profesional; este submódulo únicamente los consume.

#### RF-PJ-021 — Registrar el input de la acción de mejora para criterios de acreditación

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer el input que originó la acción de mejora de un criterio de acreditación, para dejar constancia de la fuente que la motivó.

**Descripción:** Permite registrar, en texto libre, el input o fuente que dio origen a la acción de mejora (por ejemplo, resultados de reuniones con constituyentes, presupuesto, resultados académicos u otra fuente).

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora es de tipo Criterio de Acreditación y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa el input de la acción de mejora.
2. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el campo queda vacío, el sistema lo marca como pendiente para la validación de completitud (ver RF-PJ-027).

**Resultado esperado:** La acción de mejora queda con su input registrado.

**Reglas de negocio:**

- RN1: Para los planes de mejora de criterios de acreditación, el input es un campo de texto libre.

#### RF-PJ-022 — Alertar cuando un criterio de acreditación no alcanza el mínimo de acciones de mejora requerido

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito que el sistema me alerte cuando un criterio de acreditación no cuenta con el número mínimo de acciones de mejora requerido, para poder completarlo antes de la acreditación.

**Descripción:** Verifica que cada criterio de acreditación cuente con el número mínimo de acciones de mejora establecido por la universidad y genera una alerta visible cuando no se cumple.

**Actor(es):** Sistema

**Precondiciones:** Existen criterios de acreditación registrados y al menos un plan de mejora asociado a alguno de ellos.

**Flujo principal:**

1. El sistema cuenta las acciones de mejora registradas por criterio de acreditación.
2. Si el número es menor al mínimo establecido, genera una alerta visible indicando el criterio y la cantidad faltante.

**Flujos alternativos / excepciones:** Si todos los criterios cumplen con el mínimo, no se genera ninguna alerta.

**Resultado esperado:** Los responsables quedan notificados de los criterios de acreditación que aún no cuentan con las acciones de mejora suficientes.

**Reglas de negocio:**

- RN1: La alerta es informativa y no bloquea el registro ni la aprobación de planes de mejora individuales.
- RN2: El número mínimo de acciones por criterio debe ser configurable, ya que responde a una exigencia institucional que puede variar.

### 5.5. Plan de Mejora de Objetivos Educacionales

#### RF-PJ-023 — Seleccionar el objetivo educacional sobre el cual se generará el plan de mejora

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar el objetivo educacional del programa sobre el cual voy a generar un plan de mejora.

**Descripción:** Presenta los objetivos educacionales ya registrados en el Módulo de Plan de Estudios y permite seleccionar uno como referencia del plan de mejora.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Existen objetivos educacionales registrados en el Módulo de Plan de Estudios.

**Flujo principal:**

1. El sistema muestra los objetivos educacionales disponibles.
2. El usuario selecciona un objetivo educacional.
3. El sistema asocia el plan de mejora a dicho objetivo.

**Flujos alternativos / excepciones:** Si no existen objetivos educacionales registrados, el sistema impide continuar y sugiere registrarlos primero en el Módulo de Plan de Estudios.

**Resultado esperado:** El plan de mejora queda asociado a un objetivo educacional específico.

**Reglas de negocio:**

- RN1: Los objetivos educacionales ya se gestionan en el Módulo de Plan de Estudios; este submódulo únicamente los consume, sin requerir una extensión adicional.

#### RF-PJ-024 — Registrar el input de la acción de mejora para objetivos educacionales

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito establecer el input que originó la acción de mejora de un objetivo educacional, para dejar constancia de la fuente que la motivó.

**Descripción:** Permite registrar, en texto libre, el input o fuente que dio origen a la acción de mejora del objetivo educacional (por ejemplo, resultados del comité consultivo u otra fuente).

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora es de tipo Objetivo Educacional y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa el input de la acción de mejora.
2. El sistema guarda el dato.

**Flujos alternativos / excepciones:** Si el campo queda vacío, el sistema lo marca como pendiente para la validación de completitud (ver RF-PJ-027).

**Resultado esperado:** La acción de mejora queda con su input registrado.

**Reglas de negocio:**

- RN1: Para los planes de mejora de objetivos educacionales, el input es un campo de texto libre.

#### RF-PJ-025 — Alertar cuando un objetivo educacional no alcanza el mínimo de acciones de mejora requerido

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito que el sistema me alerte cuando un objetivo educacional no cuenta con el número mínimo de acciones de mejora requerido, para poder completarlo antes de la acreditación.

**Descripción:** Verifica que cada objetivo educacional cuente con el número mínimo de acciones de mejora establecido por la universidad y genera una alerta visible cuando no se cumple.

**Actor(es):** Sistema

**Precondiciones:** Existen objetivos educacionales registrados y al menos un plan de mejora asociado a alguno de ellos.

**Flujo principal:**

1. El sistema cuenta las acciones de mejora registradas por objetivo educacional.
2. Si el número es menor al mínimo establecido, genera una alerta visible indicando el objetivo y la cantidad faltante.

**Flujos alternativos / excepciones:** Si todos los objetivos educacionales cumplen con el mínimo, no se genera ninguna alerta.

**Resultado esperado:** Los responsables quedan notificados de los objetivos educacionales que aún no cuentan con las acciones de mejora suficientes.

**Reglas de negocio:**

- RN1: La alerta es informativa y no bloquea el registro ni la aprobación de planes de mejora individuales.
- RN2: El número mínimo de acciones por objetivo educacional debe ser configurable.

### 5.6. Plan de Mejora de Competencias

#### RF-PJ-026 — Seleccionar el plan de evaluación directa base del plan de mejora de competencias

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar primero un plan de evaluación directa, para que el plan de mejora de competencias tome de allí los periodos académicos, las competencias evaluadas y sus porcentajes alcanzados.

**Descripción:** Permite elegir un plan de evaluación directa existente como base del plan de mejora de competencias. De dicho plan se heredan los periodos académicos, las competencias evaluadas y los porcentajes de medición alcanzados.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Existe al menos un plan de evaluación directa en estado Aprobado o Vigente.

**Flujo principal:**

1. El usuario selecciona el plan de evaluación directa base.
2. El sistema recupera los periodos académicos, las competencias y los porcentajes alcanzados registrados en dicho plan.

**Flujos alternativos / excepciones:** Si no existe ningún plan de evaluación directa en estado Aprobado o Vigente, el sistema impide continuar y sugiere completar primero un plan de evaluación.

**Resultado esperado:** Queda definido el plan de evaluación directa base del plan de mejora de competencias.

**Reglas de negocio:**

- RN1: El plan de mejora de competencias se construye únicamente a partir de un plan de evaluación de tipo Directa.
- RN2: Los periodos académicos del plan de mejora son siempre los mismos del plan de evaluación base y no se editan desde este submódulo.

#### RF-PJ-027 — Seleccionar el periodo académico a trabajar, de forma progresiva

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito seleccionar el periodo académico del cual haré los planes de mejora, sin necesidad de completar todos los periodos a la vez.

**Descripción:** Permite elegir, de los periodos académicos heredados del plan de evaluación base, uno específico para registrar los planes de mejora de sus competencias.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de evaluación directa base fue seleccionado (RF-PJ-026).

**Flujo principal:**

1. El sistema muestra los periodos académicos disponibles del plan de evaluación base.
2. El usuario selecciona un periodo académico.
3. El sistema habilita el registro de planes de mejora para las competencias de ese periodo.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario puede avanzar el registro de planes de mejora periodo por periodo, según su propio orden de trabajo.

**Reglas de negocio:**

- RN1: No es obligatorio completar los periodos en un orden específico ni de una sola vez.

#### RF-PJ-028 — Mostrar automáticamente como input el porcentaje alcanzado en el periodo académico anterior

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito que el sistema muestre automáticamente, como input de la acción de mejora, el porcentaje de medición alcanzado por la competencia en el periodo académico anterior, ya que es ese resultado el que motiva la mejora en el periodo actual.

**Descripción:** Recupera del plan de evaluación base el porcentaje de medición alcanzado por la competencia en el periodo académico inmediatamente anterior al periodo seleccionado, y lo muestra como input de la acción de mejora. Este comportamiento replica la lógica utilizada en los documentos institucionales, donde el input de un periodo corresponde siempre al resultado de medición del periodo previo.

**Actor(es):** Sistema

**Precondiciones:** Se seleccionó el periodo académico (RF-PJ-027) y existe un porcentaje registrado para la competencia en el periodo anterior.

**Flujo principal:**

1. El sistema identifica el periodo académico inmediatamente anterior al seleccionado.
2. Recupera el porcentaje de medición alcanzado por la competencia en dicho periodo.
3. Lo muestra como input de la acción de mejora.

**Flujos alternativos / excepciones:** Si el periodo seleccionado es el primero del plan de evaluación, o no existe un porcentaje registrado en el periodo anterior, el sistema indica que no hay input de medición disponible y permite continuar con el registro de la acción de mejora.

**Resultado esperado:** La acción de mejora queda sustentada con el resultado de medición del periodo académico previo.

**Reglas de negocio:**

- RN1: El input corresponde siempre al porcentaje alcanzado en el periodo académico inmediatamente anterior, no al del periodo que se está trabajando.
- RN2: El input se recupera automáticamente y no es editable manualmente.
- RN3: El primer periodo académico de un plan de evaluación no cuenta con input de medición disponible.

#### RF-PJ-029 — Registrar planes de mejora por competencia dentro del periodo seleccionado

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar planes de mejora para cada competencia dentro del periodo académico seleccionado, con todos los datos de la acción de mejora.

**Descripción:** Permite crear uno o varios planes de mejora asociados a una competencia dentro del periodo académico seleccionado, completando los datos comunes de la acción de mejora (ver sección 5.2) y la retroalimentación (ver sección 5.3).

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Se seleccionó el periodo académico (RF-PJ-027).

**Flujo principal:**

1. El usuario selecciona la competencia dentro del periodo.
2. Registra los datos de la acción de mejora.
3. El sistema guarda el plan de mejora asociado a la competencia y al periodo.

**Flujos alternativos / excepciones:** Si la competencia no fue evaluada en el plan de evaluación base, el sistema no la muestra como disponible.

**Resultado esperado:** Quedan registrados los planes de mejora de las competencias del periodo académico seleccionado.

**Reglas de negocio:**

- RN1: Una competencia puede tener varios planes de mejora dentro de un mismo periodo académico.
- RN2: Cada plan de mejora se asocia a una única competencia y a un único periodo académico.

#### RF-PJ-030 — Guardar el avance de un periodo sin necesidad de completar los demás periodos

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito poder guardar los planes de mejora de un periodo académico sin tener que completar de una vez todos los periodos.

**Descripción:** Permite guardar parcialmente los planes de mejora de un periodo académico, de forma independiente de los demás periodos del plan.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El usuario está registrando planes de mejora en un periodo académico.

**Flujo principal:**

1. El usuario completa la información disponible para el periodo.
2. El sistema guarda el avance de ese periodo, independientemente del estado de los demás periodos.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Los planes de mejora de competencias pueden construirse de forma progresiva, periodo por periodo.

**Reglas de negocio:**

- RN1: El avance parcial de un periodo no exige que los demás periodos estén completos.

#### RF-PJ-031 — Registrar la trazabilidad cuando una acción de mejora impacta en el Plan de Medición

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito dejar registrada la trazabilidad cuando una acción de mejora deriva en un cambio del plan de medición, para evidenciar el cierre del ciclo de mejora continua.

**Descripción:** Permite indicar, en un plan de mejora de competencias, que la acción ejecutada derivó en una modificación del plan de medición (por ejemplo, el traslado de la medición de una competencia a otra asignatura), dejando registrada la referencia al plan de medición afectado.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora de competencias existe y el plan de medición referenciado también.

**Flujo principal:**

1. El usuario indica que la acción de mejora derivó en un cambio del plan de medición.
2. Selecciona el plan de medición afectado.
3. El sistema registra la referencia.

**Flujos alternativos / excepciones:** Si la acción de mejora no deriva en un cambio del plan de medición, el usuario omite este registro y el sistema permite continuar.

**Resultado esperado:** Queda evidenciada la trazabilidad del ciclo completo: Medición → Evaluación → Mejora → Medición del siguiente ciclo.

**Reglas de negocio:**

- RN1: Este registro es opcional y solo aplica a los planes de mejora de competencias.
- RN2: El registro de la trazabilidad no modifica automáticamente el plan de medición referenciado; únicamente deja constancia del vínculo.

### 5.7. Generación y Exportación del Plan

#### RF-PJ-032 — Generar el plan de mejora con los datos configurados

*Origen: Existente / Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo consolidar todos los datos configurados del plan de mejora en su versión final, para su visualización y exportación.

**Descripción:** Genera la versión consolidada del plan de mejora a partir de la configuración registrada, en formato de tabla, según el aspecto al que corresponda (criterios, objetivos educacionales o competencias).

**Actor(es):** Sistema

**Precondiciones:** Se completó la configuración disponible del plan de mejora.

**Flujo principal:**

1. El sistema recopila los datos configurados.
2. Construye el plan de mejora consolidado en formato de tabla.
3. Lo deja disponible para su visualización, envío a revisión y exportación.

**Flujos alternativos / excepciones:** En el caso de los planes de mejora de competencias, el plan puede generarse con periodos académicos parcialmente completados, dado el registro progresivo permitido (ver RF-PJ-030).

**Resultado esperado:** El plan de mejora queda generado y disponible en formato de tabla.

**Reglas de negocio:**

- RN1: El plan se genera con los datos vigentes al momento de la generación.

#### RF-PJ-033 — Exportar el plan de mejora a Excel

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito exportar los planes de mejora a un archivo Excel, en formato de tabla, para compartirlos o usarlos en procesos externos de acreditación.

**Descripción:** Genera un archivo Excel con la tabla completa de los planes de mejora, replicando el mismo formato institucional utilizado actualmente para cada aspecto (criterios, objetivos educacionales y competencias).

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de mejora fue generado (ver RF-PJ-032).

**Flujo principal:**

1. El usuario selecciona 'Exportar a Excel'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un archivo Excel con los planes de mejora, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El formato exportado debe ser igual al formato institucional utilizado actualmente para los planes de mejora.
- RN2: El archivo exportado incluye todos los datos ingresados, incluidas las evidencias y la retroalimentación.

#### RF-PJ-034 — Exportar el plan de mejora a PDF

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito exportar los planes de mejora a PDF, en formato de tabla, para incluirlos como evidencia documental en los procesos de acreditación.

**Descripción:** Genera un documento PDF con la tabla completa de los planes de mejora, replicando el mismo formato institucional utilizado actualmente.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de mejora fue generado (ver RF-PJ-032).

**Flujo principal:**

1. El usuario selecciona 'Exportar a PDF'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un documento PDF con los planes de mejora, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El formato del documento debe ser igual al formato institucional ya utilizado por la universidad para estos planes.
- RN2: El PDF incluye el código, el aspecto y el estado de implementación de cada acción de mejora.

### 5.8. Versionado, Historial y Consulta

#### RF-PJ-035 — Generar una nueva versión del plan de mejora

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito generar una nueva versión de un plan de mejora Aprobado o Vigente, para poder modificar su definición sin alterar la versión ya aprobada.

**Descripción:** Crea una copia editable del plan de mejora en estado Borrador, conservando el vínculo con la versión de la que proviene.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora se encuentra en estado Aprobado, Vigente o Histórico.

**Flujo principal:**

1. El usuario selecciona 'Nueva versión'.
2. El sistema crea una copia del plan en estado Borrador.
3. El usuario edita la nueva versión libremente.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Queda disponible una nueva versión editable del plan de mejora.

**Reglas de negocio:**

- RN1: La nueva versión referencia a la versión de la cual proviene.
- RN2: La versión original permanece sin cambios.

#### RF-PJ-036 — Registrar histórico de modificaciones del plan de mejora

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo registrar cada modificación relevante realizada sobre un plan de mejora, junto con el usuario y la fecha en que ocurrió.

**Descripción:** Guarda un registro histórico de cambios (datos de la acción, estado de implementación, evidencias, retroalimentación y estado documental) asociado a cada plan de mejora.

**Actor(es):** Sistema

**Precondiciones:** Se realiza una modificación sobre un plan de mejora.

**Flujo principal:**

1. El sistema detecta el cambio realizado.
2. Registra el detalle, el usuario y la fecha en el histórico.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Todo plan de mejora cuenta con un histórico de modificaciones consultable.

**Reglas de negocio:**

- RN1: El histórico no puede editarse ni eliminarse desde la aplicación.

#### RF-PJ-037 — Consultar versiones anteriores del plan de mejora en modo solo lectura

*Origen: Nuevo  ·  Prioridad: Baja*

**Historia de usuario:** Como usuario necesito consultar las versiones anteriores de un plan de mejora en modo de solo lectura, para revisar cómo evolucionó sin riesgo de modificarlas.

**Descripción:** Muestra el listado de versiones de un plan de mejora y permite visualizar el contenido completo de una versión histórica sin habilitar ninguna opción de edición.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El plan de mejora tiene al menos una versión previa.

**Flujo principal:**

1. El usuario accede al historial de versiones del plan.
2. Selecciona una versión histórica.
3. El sistema la muestra en modo solo lectura.

**Flujos alternativos / excepciones:** Si el plan no tiene versiones previas, se muestra únicamente la versión actual.

**Resultado esperado:** El usuario consulta el historial de versiones sin poder alterarlo.

**Reglas de negocio:**

- RN1: El listado se muestra ordenado de la versión más reciente a la más antigua.
- RN2: Ninguna opción de edición está disponible sobre versiones históricas.

#### RF-PJ-038 — Buscar, filtrar y consultar planes de mejora

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito buscar y filtrar los planes de mejora por aspecto, elemento asociado, estado de implementación o estado documental, para ubicar rápidamente los que requiero.

**Descripción:** Muestra un listado de planes de mejora aplicando los filtros seleccionados, y permite además una búsqueda por texto sobre el código y el nombre de la acción de mejora.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existen planes de mejora registrados.

**Flujo principal:**

1. El usuario accede al listado de planes de mejora.
2. Aplica los filtros o ingresa un criterio de búsqueda.
3. El sistema muestra los resultados.

**Flujos alternativos / excepciones:** Si no hay coincidencias, se muestra un mensaje de listado vacío.

**Resultado esperado:** El usuario visualiza los planes de mejora que cumplen los criterios de búsqueda.

**Reglas de negocio:**

- RN1: El listado indica el aspecto, el elemento asociado y ambos estados de cada plan de mejora.

### 5.9. Aprobación y Validación

#### RF-PJ-039 — Enviar el plan de mejora a revisión

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito enviar un plan de mejora a revisión una vez que considero que está completo, para que sea evaluado antes de su aprobación.

**Descripción:** Cambia el estado documental del plan de Borrador a En revisión, ejecutando previamente las validaciones de completitud.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El plan de mejora se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario selecciona 'Enviar a revisión'.
2. El sistema ejecuta la validación integral (ver RF-PJ-042).
3. Si es correcta, cambia el estado a En revisión.

**Flujos alternativos / excepciones:** Si la validación integral detecta inconsistencias, el sistema impide el envío y muestra el detalle.

**Resultado esperado:** El plan de mejora queda disponible para su revisión por el Director de carrera.

**Reglas de negocio:**

- RN1: Solo se puede enviar a revisión un plan de mejora en estado Borrador.

#### RF-PJ-040 — Aprobar el plan de mejora

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito aprobar un plan de mejora que se encuentra en revisión, para que pueda pasar a estado Vigente.

**Descripción:** Cambia el estado documental del plan de En revisión a Aprobado, dejando registro del responsable y la fecha.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El plan de mejora se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario revisa el plan de mejora.
2. Selecciona 'Aprobar'.
3. El sistema cambia el estado a Aprobado y registra el responsable y la fecha.

**Flujos alternativos / excepciones:** No aplica; el rechazo se gestiona mediante RF-PJ-041.

**Resultado esperado:** El plan de mejora queda aprobado y disponible para marcarse como Vigente.

**Reglas de negocio:**

- RN1: Solo un usuario con el rol de aprobación puede ejecutar esta acción.
- RN2: El responsable y la fecha de aprobación no pueden modificarse posteriormente.

#### RF-PJ-041 — Rechazar u observar el plan de mejora con comentarios

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito rechazar u observar un plan de mejora en revisión, indicando los motivos, para que sea corregido antes de una nueva revisión.

**Descripción:** Permite devolver el plan al estado Borrador junto con un comentario obligatorio que explique el motivo del rechazo u observación.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El plan de mejora se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario selecciona 'Rechazar / Observar'.
2. Ingresa el comentario correspondiente.
3. El sistema cambia el estado a Borrador y notifica el motivo.

**Flujos alternativos / excepciones:** Si el comentario queda vacío, el sistema no permite continuar.

**Resultado esperado:** El plan vuelve a estado Borrador con el motivo del rechazo registrado.

**Reglas de negocio:**

- RN1: El comentario de rechazo u observación es obligatorio.
- RN2: El historial de observaciones queda disponible para consulta.

#### RF-PJ-042 — Ejecutar una validación integral de consistencia del plan antes de su aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo verificar que el plan de mejora cumpla con todas las reglas de completitud antes de permitir su envío a revisión o su aprobación.

**Descripción:** Ejecuta de forma conjunta las validaciones de completitud sobre los datos de la acción de mejora: nombre, causa raíz, justificación, input, plazo, recursos, metas, responsable, estado de implementación y, cuando el estado sea 'Completado', la retroalimentación.

**Actor(es):** Sistema

**Precondiciones:** Se solicita enviar a revisión o aprobar un plan de mejora.

**Flujo principal:**

1. El sistema ejecuta cada validación de completitud sobre los datos registrados.
2. Si todas son correctas, permite continuar con la acción solicitada.

**Flujos alternativos / excepciones:** Si alguna validación falla, el sistema muestra un reporte consolidado de las inconsistencias encontradas.

**Resultado esperado:** Ningún plan de mejora avanza de estado sin cumplir las condiciones mínimas de completitud.

**Reglas de negocio:**

- RN1: Esta validación es un requisito previo obligatorio para RF-PJ-039 y RF-PJ-040.
- RN2: Las alertas de cantidad mínima de acciones por criterio u objetivo (RF-PJ-022 y RF-PJ-025) son informativas y no bloquean esta validación.

### 5.10. Seguridad, Roles y Permisos Relacionados al Submódulo

#### RF-PJ-043 — Restringir la creación y edición del plan de mejora a roles autorizados

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo restringir la creación y edición de planes de mejora únicamente a los roles autorizados.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de creación o edición sobre un plan de mejora.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta crear o editar un plan de mejora.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol está autorizado, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no está autorizado, el sistema deniega la operación.

**Resultado esperado:** Solo los roles autorizados (Director de carrera, Coordinador académico) pueden crear o editar planes de mejora.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de creación o edición.

#### RF-PJ-044 — Restringir la aprobación del plan de mejora al rol con permiso de aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo permitir aprobar, rechazar u observar un plan de mejora únicamente al rol de Director de carrera.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de aprobación, rechazo u observación sobre un plan de mejora.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta aprobar, rechazar u observar un plan de mejora.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol tiene permiso de aprobación, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no tiene el permiso, el sistema deniega la operación.

**Resultado esperado:** Solo el rol autorizado puede aprobar, rechazar u observar planes de mejora.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de RF-PJ-040 y RF-PJ-041.

#### RF-PJ-045 — Validar la sesión activa y los permisos antes de cada operación crítica

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo validar que el usuario cuente con sesión activa y los permisos correspondientes antes de ejecutar cualquier operación crítica del submódulo.

**Descripción:** Ejecuta una verificación de autenticación y autorización previa a operaciones de creación, edición, aprobación, carga de evidencias o eliminación.

**Actor(es):** Sistema

**Precondiciones:** El usuario intenta ejecutar una operación crítica.

**Flujo principal:**

1. El sistema verifica la sesión activa.
2. Verifica los permisos del rol para la operación solicitada.
3. Permite o deniega la acción.

**Flujos alternativos / excepciones:** Si la sesión expiró o los permisos son insuficientes, el sistema deniega la operación y solicita reautenticación si corresponde.

**Resultado esperado:** Ninguna operación crítica se ejecuta sin la debida autenticación y autorización.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta de forma transversal a todos los requerimientos de creación, edición, aprobación y eliminación del submódulo.

#### RF-PJ-046 — Registrar en bitácora de auditoría toda acción crítica del submódulo

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo registrar en una bitácora de auditoría toda acción crítica realizada sobre los planes de mejora.

**Descripción:** Registra en una bitácora las acciones de creación, edición, cambio de estado, aprobación, rechazo, carga o eliminación de evidencias y eliminación de planes de mejora, con usuario, fecha y detalle de la acción.

**Actor(es):** Sistema

**Precondiciones:** Se ejecuta una acción crítica sobre un plan de mejora.

**Flujo principal:**

1. El sistema detecta la acción crítica.
2. Registra el detalle en la bitácora de auditoría.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Toda acción crítica del submódulo queda trazable en la bitácora de auditoría.

**Reglas de negocio:**

- RN1: Los registros de auditoría no pueden editarse ni eliminarse desde la aplicación.

---

## 6. Requerimientos funcionales — Submódulo: Actas de Aprobación

A continuación se detallan los requerimientos funcionales del submódulo de Actas de Aprobación, con el cual el responsable designado aprueba formalmente las acciones de mejora registradas. A diferencia de lo que podría suponerse, un acta no se genera por aspecto: cada acta corresponde a un periodo académico y agrupa en un mismo documento las tres secciones de acciones de mejora (criterios de acreditación, objetivos educacionales y competencias), tal como ocurre en las actas institucionales analizadas. La firma del acta no ha sido considerada en este levantamiento y queda registrada como punto pendiente de validación institucional.

### 6.1. Configuración General del Acta de Aprobación

#### RF-AC-000 — Incorporar el submódulo de Actas de Aprobación dentro del Módulo de Mejora Continua

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como universidad necesito que, dentro del Módulo de Mejora Continua ya creado (ver RF-PM-000), se incorpore un nuevo submódulo de Actas de Aprobación, como continuación del submódulo de Plan de Mejora.

**Descripción:** Establece la incorporación del submódulo de Actas de Aprobación al Módulo de Mejora Continua. Este submódulo permite generar el acta con la que un responsable designado aprueba formalmente las acciones de mejora de un periodo académico, agrupando en un mismo documento los tres aspectos: criterios de acreditación, objetivos educacionales y competencias.

**Actor(es):** Sistema

**Precondiciones:** El Módulo de Mejora Continua y sus submódulos de Planes de Medición, Plan de Evaluación y Plan de Mejora existen y están operativos.

**Flujo principal:**

1. Se habilita en el Módulo de Mejora Continua el nuevo submódulo de Actas de Aprobación.
2. El submódulo queda disponible con las funcionalidades descritas en la presente sección.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El Módulo de Mejora Continua cuenta con cuatro submódulos operativos: Planes de Medición, Plan de Evaluación, Plan de Mejora y Actas de Aprobación.

**Reglas de negocio:**

- RN1: El submódulo de Actas de Aprobación depende del submódulo de Plan de Mejora; no puede operar de forma independiente.
- RN2: El Assessment de Objetivos Educacionales continúa fuera de alcance (ver sección 1.3).

#### RF-AC-001 — Generar un acta de aprobación por periodo académico, agrupando los tres aspectos

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito generar un acta de aprobación correspondiente a un periodo académico, que agrupe en un mismo documento las acciones de mejora de criterios de acreditación, objetivos educacionales y competencias.

**Descripción:** Permite crear un acta de aprobación asociada a un periodo académico. El acta no se genera por aspecto: un único documento contiene las tres secciones (criterios de acreditación, objetivos educacionales y competencias), replicando la estructura de las actas institucionales vigentes.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** Existen planes de mejora registrados para el periodo académico seleccionado.

**Flujo principal:**

1. El usuario accede a 'Nueva acta de aprobación'.
2. Selecciona el periodo académico del acta.
3. El sistema crea el acta en estado Borrador, con sus tres secciones de acciones de mejora.

**Flujos alternativos / excepciones:** Si no existen planes de mejora registrados para el periodo seleccionado, el sistema impide continuar y sugiere registrarlos primero.

**Resultado esperado:** Se crea un acta de aprobación asociada a un periodo académico, con las tres secciones de acciones de mejora.

**Reglas de negocio:**

- RN1: Un acta de aprobación corresponde a un único periodo académico.
- RN2: Un acta agrupa siempre los tres aspectos: criterios de acreditación, objetivos educacionales y competencias.
- RN3: Una sección del acta puede quedar vacía si no existen acciones de mejora de ese aspecto para el periodo.

#### RF-AC-002 — Generar el número correlativo del acta

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo generar automáticamente el número correlativo del acta junto con el código de la escuela profesional, para identificarla de forma única dentro del programa.

**Descripción:** Genera automáticamente el número de acta como un correlativo institucional acompañado del código de la escuela profesional (por ejemplo, 'ACTA N° 001 – EAP-ISI'). El correlativo es continuo entre periodos académicos dentro de la misma escuela profesional.

**Actor(es):** Sistema

**Precondiciones:** Se está creando una nueva acta de aprobación.

**Flujo principal:**

1. El sistema determina el siguiente correlativo de acta dentro de la escuela profesional.
2. Compone el número con el correlativo y el código de la escuela.
3. Lo asigna al acta.

**Flujos alternativos / excepciones:** No aplica; el número se genera de forma automática y no editable.

**Resultado esperado:** Cada acta queda identificada con un número correlativo único dentro de su escuela profesional.

**Reglas de negocio:**

- RN1: El correlativo es continuo entre periodos académicos y no se reinicia en cada periodo.
- RN2: El ámbito de unicidad del correlativo es la escuela profesional.
- RN3: El número de acta no puede editarse manualmente.

#### RF-AC-003 — Proponer automáticamente el título y el objetivo del acta a partir del periodo académico

*Origen: Ampliado  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito que el sistema proponga automáticamente el título y el objetivo del acta a partir del periodo académico seleccionado, para no tener que redactarlos manualmente en cada acta.

**Descripción:** Compone automáticamente el título del acta (que incluye el nombre del programa y el periodo académico) y el objetivo de la reunión (por ejemplo, 'Elaborar y aprobar el Plan de Mejora 2025-10'), permitiendo al usuario ajustarlos si lo requiere.

**Actor(es):** Sistema

**Precondiciones:** Se seleccionó el periodo académico del acta (RF-AC-001).

**Flujo principal:**

1. El sistema compone el título del acta con el nombre del programa y el periodo académico.
2. Compone el objetivo de la reunión con el periodo académico.
3. Muestra ambos campos precargados y editables.

**Flujos alternativos / excepciones:** El usuario puede modificar el título o el objetivo propuestos antes de emitir el acta.

**Resultado esperado:** El acta queda con su título y objetivo definidos, sin requerir redacción manual desde cero.

**Reglas de negocio:**

- RN1: Los textos propuestos son una precarga editable, no un valor fijo.

#### RF-AC-004 — Registrar los datos de cabecera del acta

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar los datos de cabecera del acta: quién convocó la reunión, la fecha, el lugar y un comentario, para dejar constancia formal de la sesión.

**Descripción:** Permite registrar los datos de cabecera del acta: reunión convocada por, fecha de la reunión, lugar y un campo de comentario adicional.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El acta fue creada y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa quién convocó la reunión.
2. Ingresa la fecha y el lugar.
3. Ingresa el comentario, si corresponde.
4. El sistema guarda los datos.

**Flujos alternativos / excepciones:** Si algún campo obligatorio queda vacío, el sistema lo marca como pendiente para la validación de completitud (ver RF-AC-016).

**Resultado esperado:** El acta queda con sus datos de cabecera registrados.

**Reglas de negocio:**

- RN1: Los campos 'convocada por', fecha y lugar son obligatorios antes de emitir el acta.
- RN2: El campo comentario es opcional.

#### RF-AC-005 — Registrar la lista de asistentes a la reunión

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito registrar los asistentes a la reunión como una lista de personas individuales, para dejar constancia de quiénes participaron en la aprobación.

**Descripción:** Permite agregar, editar y quitar asistentes del acta, gestionándolos como una lista de entradas individuales y no como un único campo de texto.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El acta fue creada y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario agrega un asistente a la lista.
2. Repite la acción por cada participante.
3. El sistema guarda la lista de asistentes.

**Flujos alternativos / excepciones:** El usuario puede editar o quitar un asistente previamente agregado mientras el acta esté en estado Borrador.

**Resultado esperado:** El acta queda con su lista de asistentes registrada.

**Reglas de negocio:**

- RN1: Los asistentes se registran como entradas individuales de una lista, no como un campo de texto único.
- RN2: El acta debe tener al menos un asistente registrado antes de ser emitida.

#### RF-AC-006 — Registrar el lugar y la fecha de emisión del acta

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como Coordinador académico necesito registrar el lugar y la fecha de emisión que figuran al pie del acta, los cuales son distintos de la fecha de la reunión.

**Descripción:** Permite registrar el lugar y la fecha de emisión del acta, que se muestran al pie del documento (por ejemplo, 'Huancayo, 9 de marzo de 2025'), de forma independiente de la fecha de la reunión registrada en la cabecera.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El acta fue creada y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario ingresa el lugar y la fecha de emisión.
2. El sistema guarda los datos.

**Flujos alternativos / excepciones:** Si el usuario no los modifica, el sistema propone por defecto los mismos valores registrados para la reunión.

**Resultado esperado:** El acta queda con su lugar y fecha de emisión definidos.

**Reglas de negocio:**

- RN1: La fecha de emisión es un dato distinto de la fecha de la reunión, aunque puedan coincidir.

### 6.2. Contenido del Acta: Acciones de Mejora

#### RF-AC-007 — Cargar automáticamente las acciones de mejora aprobadas del periodo seleccionado

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito que el sistema cargue automáticamente las acciones de mejora a partir de los planes de mejora aprobados del periodo, para no tener que transcribirlas manualmente en el acta.

**Descripción:** Recupera automáticamente las acciones de mejora de los planes de mejora del periodo académico seleccionado que se encuentren en estado Aprobado o Vigente, y las incorpora al acta agrupadas en sus tres secciones correspondientes.

**Actor(es):** Sistema

**Precondiciones:** El acta fue creada y existen planes de mejora aprobados para el periodo académico seleccionado.

**Flujo principal:**

1. El sistema recupera las acciones de mejora de los planes de mejora aprobados del periodo.
2. Las agrupa en las tres secciones del acta: criterios de acreditación, objetivos educacionales y competencias.
3. Las muestra en el acta.

**Flujos alternativos / excepciones:** Si un aspecto no tiene acciones de mejora aprobadas para el periodo, su sección se muestra vacía y el acta puede emitirse igualmente.

**Resultado esperado:** El acta queda poblada automáticamente con las acciones de mejora aprobadas del periodo.

**Reglas de negocio:**

- RN1: Solo se cargan acciones de mejora de planes en estado Aprobado o Vigente.
- RN2: Las acciones se agrupan por aspecto, en el orden: criterios de acreditación, objetivos educacionales y competencias.

#### RF-AC-008 — Seleccionar manualmente qué acciones de mejora se incluyen en el acta

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito poder seleccionar o excluir manualmente acciones de mejora del acta, ya que no siempre se aprueban en una misma sesión todas las acciones registradas para el periodo.

**Descripción:** Permite marcar o desmarcar individualmente qué acciones de mejora, de las cargadas automáticamente (RF-AC-007), se incluirán finalmente en el acta. Este comportamiento responde a que las actas institucionales analizadas no siempre incluyen la totalidad de las acciones registradas en el plan de mejora del periodo.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El acta tiene acciones de mejora cargadas y se encuentra en estado Borrador.

**Flujo principal:**

1. El usuario revisa las acciones de mejora cargadas.
2. Marca o desmarca las que corresponda incluir.
3. El sistema guarda la selección.

**Flujos alternativos / excepciones:** Si el usuario no modifica la selección, se incluyen por defecto todas las acciones cargadas automáticamente.

**Resultado esperado:** El acta queda con el conjunto exacto de acciones de mejora que se aprueban en esa sesión.

**Reglas de negocio:**

- RN1: Por defecto se incluyen todas las acciones cargadas automáticamente.
- RN2: La exclusión de una acción del acta no modifica ni elimina el plan de mejora correspondiente.
- RN3: El acta debe incluir al menos una acción de mejora para poder emitirse.

#### RF-AC-009 — Mostrar las acciones de mejora en formato de tabla, con columnas según el aspecto

*Origen: Ampliado  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito que el acta muestre las acciones de mejora en formato de tabla, con las columnas que corresponden a cada aspecto, para que el documento tenga el mismo formato institucional vigente.

**Descripción:** Presenta las acciones de mejora en tablas, con un juego de columnas propio para cada aspecto. Para criterios de acreditación y objetivos educacionales: código, nombre de la acción, elemento asociado, fecha o plazo previsto, recursos necesarios, metas establecidas y responsable. Para competencias: código, nombre de la acción, competencia, input para la acción de mejora, fecha o plazo previsto, metas establecidas y responsable.

**Actor(es):** Sistema

**Precondiciones:** El acta tiene acciones de mejora incluidas.

**Flujo principal:**

1. El sistema construye la tabla correspondiente a cada sección del acta.
2. Aplica el juego de columnas propio del aspecto de esa sección.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El acta muestra las acciones de mejora en el formato de tabla institucional correspondiente a cada aspecto.

**Reglas de negocio:**

- RN1: La columna del elemento asociado varía según el aspecto: criterio de acreditación, objetivo educacional o competencia.
- RN2: La tabla de competencias incluye la columna de input para la acción de mejora y no incluye la de recursos necesarios.
- RN3: Las tablas de criterios y objetivos incluyen la columna de recursos necesarios y no la de input.

#### RF-AC-010 — Mostrar en la tabla de competencias el porcentaje de medición como input, y no una fecha

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo mostrar en la columna de input de la tabla de competencias el porcentaje de medición alcanzado en el periodo anterior, corrigiendo el desfase de columnas presente en la plantilla institucional actual.

**Descripción:** Asegura que el valor mostrado bajo la columna 'Input para la Acción de Mejora' de la tabla de competencias sea efectivamente el porcentaje de medición alcanzado en el periodo académico anterior (ver RF-PJ-028), y no otro dato. En los documentos institucionales analizados se identificó que dicha columna contiene valores de fecha, producto de un desfase de columnas de la plantilla, error que no debe replicarse en el sistema.

**Actor(es):** Sistema

**Precondiciones:** El acta incluye acciones de mejora del aspecto Competencias.

**Flujo principal:**

1. El sistema recupera, por cada acción de mejora de competencias, el porcentaje de medición registrado como input.
2. Lo muestra en la columna correspondiente de la tabla.

**Flujos alternativos / excepciones:** Si la acción de mejora no cuenta con input de medición disponible (por ejemplo, por corresponder al primer periodo académico), el sistema muestra la celda como no disponible.

**Resultado esperado:** La columna de input del acta refleja correctamente el resultado de medición que motivó cada acción de mejora.

**Reglas de negocio:**

- RN1: El valor de la columna de input proviene del porcentaje registrado en el plan de mejora de competencias (ver RF-PJ-028).
- RN2: El sistema no replica el desfase de columnas identificado en la plantilla institucional.

#### RF-AC-011 — Incluir los textos institucionales de introducción y de acuerdo del acta

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito que el acta incluya los párrafos institucionales de introducción y de acuerdo que preceden y siguen a las tablas de acciones de mejora, para que el documento tenga validez formal.

**Descripción:** Incorpora al acta un párrafo introductorio previo a las tablas (que da constancia de la revisión y deliberación, y anuncia las acciones que se aprueban) y un párrafo de cierre con la sección resolutiva, que deja constancia de la aprobación de las acciones de mejora del programa. Ambos textos se generan de forma automática, incorporando el periodo académico correspondiente, y son editables.

**Actor(es):** Sistema

**Precondiciones:** El acta fue creada y se seleccionó su periodo académico.

**Flujo principal:**

1. El sistema compone el párrafo introductorio incorporando el periodo académico.
2. Compone el párrafo de cierre con la sección resolutiva.
3. Muestra ambos textos en el acta, en modo editable.

**Flujos alternativos / excepciones:** El usuario puede ajustar la redacción de ambos textos antes de emitir el acta.

**Resultado esperado:** El acta contiene los textos institucionales de introducción y de acuerdo requeridos por el formato vigente.

**Reglas de negocio:**

- RN1: Ambos textos se precargan automáticamente y son editables.
- RN2: El párrafo introductorio se ubica antes de las tablas de acciones de mejora y el de cierre después de ellas.

### 6.3. Aprobación y Emisión del Acta

#### RF-AC-012 — Definir y gestionar el estado del acta de aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo gestionar el ciclo de vida del acta de aprobación mediante estados definidos, para reflejar si esta se encuentra en elaboración, emitida o histórica.

**Descripción:** Establece los estados posibles del acta de aprobación: Borrador, En revisión, Aprobada, Emitida e Histórica, siguiendo el mismo esquema de ciclo de vida utilizado en los submódulos anteriores.

**Actor(es):** Sistema

**Precondiciones:** El acta de aprobación existe.

**Flujo principal:**

1. El sistema asigna el estado Borrador al crear el acta.
2. El estado cambia según las transiciones definidas (ver RF-AC-013).

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Toda acta de aprobación cuenta en todo momento con un estado válido y trazable.

**Reglas de negocio:**

- RN1: Las transiciones de estado siguen la secuencia: Borrador → En revisión → Aprobada → Emitida → Histórica.
- RN2: El estado del acta es independiente del estado documental de los planes de mejora que contiene.

#### RF-AC-013 — Cambiar el estado del acta de aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico o Director de carrera necesito cambiar el estado del acta conforme avanza su proceso de revisión y aprobación.

**Descripción:** Permite ejecutar las transiciones de estado definidas en RF-AC-012: el Coordinador académico envía el acta a revisión, y el Director de carrera la aprueba, rechaza u observa.

**Actor(es):** Director de carrera, Coordinador académico (propuestos)

**Precondiciones:** El acta existe y su estado actual permite la transición solicitada.

**Flujo principal:**

1. El usuario selecciona la transición deseada.
2. El sistema valida que la transición sea válida desde el estado actual y que el usuario tenga el permiso correspondiente.
3. El sistema actualiza el estado.

**Flujos alternativos / excepciones:** Si la transición no es válida desde el estado actual, o el usuario no tiene el permiso, el sistema la rechaza.

**Resultado esperado:** El acta queda en el nuevo estado correspondiente.

**Reglas de negocio:**

- RN1: No se permiten saltos de estado fuera de la secuencia definida.
- RN2: Cada cambio de estado queda registrado con usuario y fecha.

#### RF-AC-014 — Aprobar el acta y, con ella, las acciones de mejora que contiene

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito aprobar el acta que se encuentra en revisión, dejando formalmente aprobadas las acciones de mejora que esta contiene.

**Descripción:** Cambia el estado del acta de En revisión a Aprobada, registrando el responsable y la fecha, y dejando constancia de la aprobación formal de las acciones de mejora incluidas en ella.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El acta se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario revisa el acta y las acciones de mejora que contiene.
2. Selecciona 'Aprobar'.
3. El sistema cambia el estado a Aprobada y registra el responsable y la fecha.

**Flujos alternativos / excepciones:** No aplica; el rechazo se gestiona mediante RF-AC-015.

**Resultado esperado:** El acta queda aprobada y las acciones de mejora que contiene quedan formalmente aprobadas.

**Reglas de negocio:**

- RN1: Solo un usuario con el rol de aprobación puede ejecutar esta acción.
- RN2: El responsable y la fecha de aprobación no pueden modificarse posteriormente.

#### RF-AC-015 — Rechazar u observar el acta con comentarios

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Director de carrera necesito rechazar u observar un acta en revisión, indicando los motivos, para que sea corregida antes de una nueva revisión.

**Descripción:** Permite devolver el acta al estado Borrador junto con un comentario obligatorio que explique el motivo del rechazo u observación.

**Actor(es):** Director de carrera (propuesto)

**Precondiciones:** El acta se encuentra en estado En revisión.

**Flujo principal:**

1. El usuario selecciona 'Rechazar / Observar'.
2. Ingresa el comentario correspondiente.
3. El sistema cambia el estado a Borrador y notifica el motivo.

**Flujos alternativos / excepciones:** Si el comentario queda vacío, el sistema no permite continuar.

**Resultado esperado:** El acta vuelve a estado Borrador con el motivo del rechazo registrado.

**Reglas de negocio:**

- RN1: El comentario de rechazo u observación es obligatorio.
- RN2: El historial de observaciones queda disponible para consulta.

#### RF-AC-016 — Ejecutar una validación integral de completitud del acta antes de su emisión

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo verificar que el acta cumpla con todas las reglas de completitud antes de permitir su envío a revisión o su aprobación.

**Descripción:** Ejecuta de forma conjunta las validaciones de completitud del acta: datos de cabecera obligatorios, al menos un asistente registrado, al menos una acción de mejora incluida, y lugar y fecha de emisión definidos.

**Actor(es):** Sistema

**Precondiciones:** Se solicita enviar a revisión o aprobar un acta.

**Flujo principal:**

1. El sistema ejecuta cada validación de completitud sobre los datos del acta.
2. Si todas son correctas, permite continuar con la acción solicitada.

**Flujos alternativos / excepciones:** Si alguna validación falla, el sistema muestra un reporte consolidado de las inconsistencias encontradas.

**Resultado esperado:** Ninguna acta avanza de estado sin cumplir las condiciones mínimas de completitud.

**Reglas de negocio:**

- RN1: Esta validación es un requisito previo obligatorio para el envío a revisión y para la aprobación del acta.

#### RF-AC-017 — Restringir la edición del acta una vez aprobada o emitida

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo impedir la edición de un acta que ya fue aprobada o emitida, para preservar su validez como documento formal de acreditación.

**Descripción:** Bloquea las operaciones de edición sobre actas cuyo estado sea Aprobada, Emitida o Histórica.

**Actor(es):** Sistema

**Precondiciones:** Se solicita editar un acta.

**Flujo principal:**

1. El sistema verifica el estado del acta.
2. Si el estado es distinto de Borrador, bloquea la edición.

**Flujos alternativos / excepciones:** Si el usuario necesita corregir un acta ya aprobada, el sistema indica que debe generarse una nueva acta.

**Resultado esperado:** Se preserva la integridad de las actas ya aprobadas o emitidas.

**Reglas de negocio:**

- RN1: Solo se permite edición en estado Borrador.
- RN2: Un acta aprobada o emitida no puede eliminarse.

### 6.4. Exportación, Consulta e Historial

#### RF-AC-018 — Exportar el acta de aprobación a Excel

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito exportar el acta de aprobación a un archivo Excel, para compartirla o usarla en procesos externos de acreditación.

**Descripción:** Genera un archivo Excel con el acta completa (cabecera, asistentes, textos institucionales y las tres tablas de acciones de mejora), replicando el formato institucional vigente.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El acta fue generada.

**Flujo principal:**

1. El usuario selecciona 'Exportar a Excel'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un archivo Excel con el acta completa, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El formato exportado debe ser igual al formato institucional utilizado actualmente para las actas de aprobación.

#### RF-AC-019 — Exportar el acta de aprobación a PDF

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como Coordinador académico necesito exportar el acta de aprobación a PDF, para incluirla como evidencia documental en los procesos de acreditación.

**Descripción:** Genera un documento PDF con el acta completa, replicando el formato institucional vigente.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El acta fue generada.

**Flujo principal:**

1. El usuario selecciona 'Exportar a PDF'.
2. El sistema genera el archivo.
3. El usuario lo descarga.

**Flujos alternativos / excepciones:** Si ocurre un error en la generación, el sistema muestra un mensaje y permite reintentar.

**Resultado esperado:** El usuario obtiene un documento PDF con el acta completa, en el mismo formato institucional vigente.

**Reglas de negocio:**

- RN1: El formato del documento debe ser igual al formato institucional ya utilizado por la universidad para estas actas.
- RN2: El PDF incluye el número de acta y el periodo académico en su encabezado.

#### RF-AC-020 — Buscar, filtrar y consultar actas de aprobación

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como usuario necesito buscar y filtrar las actas de aprobación por periodo académico, número de acta o estado, para ubicar rápidamente la que requiero.

**Descripción:** Muestra un listado de actas de aprobación aplicando los filtros seleccionados, y permite además una búsqueda por texto sobre el número y el título del acta.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** Existen actas de aprobación registradas.

**Flujo principal:**

1. El usuario accede al listado de actas.
2. Aplica los filtros o ingresa un criterio de búsqueda.
3. El sistema muestra los resultados.

**Flujos alternativos / excepciones:** Si no hay coincidencias, se muestra un mensaje de listado vacío.

**Resultado esperado:** El usuario visualiza las actas que cumplen los criterios de búsqueda.

**Reglas de negocio:**

- RN1: El listado indica el número de acta, el periodo académico y el estado de cada acta.

#### RF-AC-021 — Consultar un acta emitida o histórica en modo solo lectura

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como usuario necesito consultar un acta ya emitida o histórica en modo de solo lectura, para revisarla sin riesgo de modificarla.

**Descripción:** Permite visualizar el contenido completo de un acta en estado Aprobada, Emitida o Histórica sin habilitar ninguna opción de edición.

**Actor(es):** Director de carrera, Coordinador académico, Usuario consultor (propuestos)

**Precondiciones:** El acta existe y se encuentra en estado Aprobada, Emitida o Histórica.

**Flujo principal:**

1. El usuario selecciona el acta.
2. El sistema la muestra en modo solo lectura.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** El usuario consulta el acta sin poder alterarla.

**Reglas de negocio:**

- RN1: Ninguna opción de edición está disponible sobre actas aprobadas, emitidas o históricas.

#### RF-AC-022 — Registrar histórico de modificaciones del acta

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo registrar cada modificación relevante realizada sobre un acta, junto con el usuario y la fecha en que ocurrió.

**Descripción:** Guarda un registro histórico de cambios (datos de cabecera, asistentes, selección de acciones de mejora, textos y estado) asociado a cada acta de aprobación.

**Actor(es):** Sistema

**Precondiciones:** Se realiza una modificación sobre un acta.

**Flujo principal:**

1. El sistema detecta el cambio realizado.
2. Registra el detalle, el usuario y la fecha en el histórico.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Toda acta cuenta con un histórico de modificaciones consultable.

**Reglas de negocio:**

- RN1: El histórico no puede editarse ni eliminarse desde la aplicación.

### 6.5. Seguridad, Roles y Permisos Relacionados al Submódulo

#### RF-AC-023 — Restringir la creación y edición del acta a roles autorizados

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo restringir la creación y edición de actas de aprobación únicamente a los roles autorizados.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de creación o edición sobre un acta de aprobación.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta crear o editar un acta.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol está autorizado, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no está autorizado, el sistema deniega la operación.

**Resultado esperado:** Solo los roles autorizados (Director de carrera, Coordinador académico) pueden crear o editar actas.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de creación o edición.

#### RF-AC-024 — Restringir la aprobación del acta al rol con permiso de aprobación

*Origen: Existente  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo permitir aprobar, rechazar u observar un acta únicamente al rol de Director de carrera, que es el responsable designado de la aprobación.

**Descripción:** Verifica el rol del usuario antes de permitir operaciones de aprobación, rechazo u observación sobre un acta de aprobación.

**Actor(es):** Sistema

**Precondiciones:** Un usuario intenta aprobar, rechazar u observar un acta.

**Flujo principal:**

1. El sistema verifica el rol del usuario.
2. Si el rol tiene permiso de aprobación, permite la operación.

**Flujos alternativos / excepciones:** Si el rol no tiene el permiso, el sistema deniega la operación.

**Resultado esperado:** Solo el responsable designado puede aprobar, rechazar u observar actas de aprobación.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta en cada operación de RF-AC-014 y RF-AC-015.

#### RF-AC-025 — Validar la sesión activa y los permisos antes de cada operación crítica

*Origen: Nuevo  ·  Prioridad: Alta*

**Historia de usuario:** Como sistema debo validar que el usuario cuente con sesión activa y los permisos correspondientes antes de ejecutar cualquier operación crítica del submódulo.

**Descripción:** Ejecuta una verificación de autenticación y autorización previa a operaciones de creación, edición, aprobación, emisión o exportación del acta.

**Actor(es):** Sistema

**Precondiciones:** El usuario intenta ejecutar una operación crítica.

**Flujo principal:**

1. El sistema verifica la sesión activa.
2. Verifica los permisos del rol para la operación solicitada.
3. Permite o deniega la acción.

**Flujos alternativos / excepciones:** Si la sesión expiró o los permisos son insuficientes, el sistema deniega la operación y solicita reautenticación si corresponde.

**Resultado esperado:** Ninguna operación crítica se ejecuta sin la debida autenticación y autorización.

**Reglas de negocio:**

- RN1: Esta validación se ejecuta de forma transversal a todos los requerimientos de creación, edición y aprobación del submódulo.

#### RF-AC-026 — Registrar en bitácora de auditoría toda acción crítica del submódulo

*Origen: Nuevo  ·  Prioridad: Media*

**Historia de usuario:** Como sistema debo registrar en una bitácora de auditoría toda acción crítica realizada sobre las actas de aprobación.

**Descripción:** Registra en una bitácora las acciones de creación, edición, cambio de estado, aprobación, rechazo y exportación de actas, con usuario, fecha y detalle de la acción.

**Actor(es):** Sistema

**Precondiciones:** Se ejecuta una acción crítica sobre un acta.

**Flujo principal:**

1. El sistema detecta la acción crítica.
2. Registra el detalle en la bitácora de auditoría.

**Flujos alternativos / excepciones:** No aplica.

**Resultado esperado:** Toda acción crítica del submódulo queda trazable en la bitácora de auditoría.

**Reglas de negocio:**

- RN1: Los registros de auditoría no pueden editarse ni eliminarse desde la aplicación.

---

## 7. Requerimientos no funcionales

Se listan a continuación los requerimientos no funcionales específicos de los cuatro submódulos (no se incluyen requerimientos no funcionales genéricos de toda la plataforma que no tengan impacto directo en ellos).

### 7.1 Planes de Medición

| ID | Categoría | Nombre | Descripción | Criterio de aceptación | Prioridad |
| --- | --- | --- | --- | --- | --- |
| RNF01 | Seguridad | Control de acceso basado en roles | Toda operación del submódulo (creación, edición, programación, aprobación, exportación, consulta histórica) debe validar el rol y los permisos del usuario antes de ejecutarse. | 100% de las operaciones críticas listadas aplican verificación de rol/permiso. | Alta |
| RNF02 | Seguridad | Cifrado de datos en tránsito | Toda comunicación entre el cliente y el servidor relacionada al submódulo debe viajar cifrada. | Uso de TLS 1.2 o superior en todas las comunicaciones del submódulo. | Alta |
| RNF03 | Seguridad | Registro de auditoría inmutable | Los registros de auditoría (RF-PM-045) no deben poder ser editados ni eliminados desde la aplicación por ningún rol. | Ninguna interfaz del submódulo expone edición o eliminación de registros de auditoría. | Alta |
| RNF04 | Rendimiento | Tiempo de generación de la matriz del plan | La construcción de la matriz competencia × periodo (RF-PM-024) debe completarse en un tiempo aceptable incluso con planes de gran tamaño. | Tiempo de generación no mayor a 3 segundos con hasta 50 competencias y 15 periodos. | Media |
| RNF05 | Rendimiento | Tiempo de exportación a Excel/PDF | La exportación del plan de medición (RF-PM-028, RF-PM-029) debe completarse en un tiempo razonable. | Tiempo de generación no mayor a 5 segundos para un plan con hasta 50 competencias y 15 periodos. | Media |
| RNF06 | Escalabilidad | Soporte de crecimiento de periodos y competencias | El submódulo debe soportar el incremento de periodos, competencias y planes de medición sin requerir un rediseño estructural. | Soporte de al menos 10 veces el volumen inicial estimado de registros sin degradación funcional. | Media |
| RNF07 | Escalabilidad | Compatibilidad con futuros submódulos de Mejora Continua | La arquitectura del submódulo debe permitir la incorporación de los submódulos que se construyen sobre él (Plan de Evaluación, Plan de Mejora y Actas de Aprobación), así como del Assessment de Objetivos Educacionales, sin afectar su funcionamiento actual. | El submódulo expone sus datos e integraciones mediante interfaces desacopladas (p. ej. servicios/API). | Media |
| RNF08 | Usabilidad | Mensajes de error claros y específicos | Ante cualquier validación fallida (p. ej. competencia sin periodo programado, meta fuera de rango), el sistema debe indicar el motivo específico del error. | Ningún mensaje de error genérico ('ocurrió un error') se muestra para validaciones de negocio conocidas. | Media |
| RNF09 | Usabilidad | Visualización clara del estado de programación en la matriz | La matriz competencia × periodo debe representar visualmente, de forma clara, si una celda está programada, no programada, o programada y realizada. | Los tres estados de una celda son visualmente distinguibles sin necesidad de abrir el detalle. | Media |
| RNF10 | Mantenibilidad | Arquitectura modular | El submódulo debe implementarse siguiendo principios de arquitectura modular (p. ej. limpia/hexagonal) que faciliten su mantenimiento y prueba. | Separación clara entre lógica de dominio, casos de uso e infraestructura del submódulo. | Media |
| RNF11 | Integridad de datos | Integridad referencial entre entidades del submódulo | Debe garantizarse la integridad referencial entre planes de medición, planes de estudio, atributos del graduado, competencias y periodos. | No es posible generar registros huérfanos (p. ej. una programación sin plan, un plan sin plan de estudios) desde ninguna interfaz del submódulo. | Alta |
| RNF12 | Consistencia de la información | Atomicidad al guardar la matriz de programación | Los cambios sobre la matriz de programación (marcar o desmarcar múltiples celdas competencia-periodo) deben aplicarse de forma atómica. | Ninguna operación de guardado de la matriz deja al plan en un estado parcialmente actualizado ante una falla. | Alta |
| RNF13 | Respaldo y recuperación | Respaldo automático de planes de medición | La información de los planes de medición y su histórico debe respaldarse de forma periódica. | Respaldo automático diario con retención mínima de 30 días. | Alta |

### 7.2 Plan de Evaluación

| ID | Categoría | Nombre | Descripción | Criterio de aceptación | Prioridad |
| --- | --- | --- | --- | --- | --- |
| RNF14 | Seguridad | Validación de archivos de evidencia | Todo archivo subido como evidencia (RF-PE-020) debe validarse en tipo y contenido antes de almacenarse, para evitar la carga de archivos maliciosos. | Ningún archivo se almacena sin pasar por una validación de tipo MIME y un análisis antivirus. | Alta |
| RNF15 | Rendimiento | Tiempo de carga de evidencias | La subida de un archivo de evidencia debe completarse en un tiempo aceptable para archivos de tamaño típico. | Tiempo de carga no mayor a 10 segundos para archivos de hasta 20 MB. | Media |
| RNF16 | Integridad de datos | Consistencia entre Plan de Evaluación y Plan de Medición | Debe garantizarse que las competencias, periodos y años del plan de evaluación se mantengan siempre sincronizados con los del plan de medición base, y que la evaluación solo se habilite sobre combinaciones programadas. | No es posible registrar datos de evaluación para una competencia, periodo o año que no exista o no esté programado en el plan de medición base. | Alta |
| RNF17 | Almacenamiento | Capacidad de almacenamiento de evidencias | El submódulo debe prever el crecimiento del volumen de archivos de evidencia a lo largo de múltiples periodos, competencias y planes. | El almacenamiento de evidencias se realiza en un repositorio externo escalable (por ejemplo, almacenamiento en la nube), no en la base de datos transaccional. | Media |

### 7.3 Plan de Mejora

| ID | Categoría | Nombre | Descripción | Criterio de aceptación | Prioridad |
| --- | --- | --- | --- | --- | --- |
| RNF18 | Seguridad | Validación de archivos de evidencia del plan de mejora | Todo archivo subido como evidencia de un plan de mejora (RF-PJ-016) debe validarse en tipo y contenido antes de almacenarse. | Ningún archivo se almacena sin pasar por una validación de tipo MIME y un análisis antivirus. | Alta |
| RNF19 | Integridad de datos | Consistencia entre Plan de Mejora y Plan de Evaluación | Debe garantizarse que los periodos académicos, competencias y porcentajes usados como input en el plan de mejora provengan siempre del plan de evaluación directa base y se mantengan sincronizados con él. | No es posible registrar un plan de mejora de competencias sobre una competencia o periodo que no exista en el plan de evaluación base. | Alta |
| RNF20 | Integridad de datos | Unicidad del código de la acción de mejora | El sistema debe garantizar que no existan dos planes de mejora con el mismo código dentro de un mismo ámbito de unicidad. | Ninguna operación del submódulo permite generar códigos duplicados dentro de un mismo criterio, objetivo educacional o periodo académico. | Alta |
| RNF21 | Usabilidad | Distinción visual entre estado documental y estado de implementación | La interfaz debe diferenciar claramente el estado documental del plan de mejora del estado de implementación de la acción, para evitar confusiones en el seguimiento. | Ambos estados se muestran con etiquetas y ubicaciones distintas, sin compartir el mismo indicador visual. | Media |
| RNF22 | Trazabilidad | Trazabilidad del ciclo de mejora continua | El sistema debe permitir recorrer la trazabilidad completa del ciclo: plan de medición, plan de evaluación, resultado medido, plan de mejora derivado y, cuando corresponda, el cambio al plan de medición del siguiente ciclo. | Desde un plan de mejora de competencias es posible acceder al plan de evaluación y al plan de medición que lo originaron. | Media |

### 7.4 Actas de Aprobación

| ID | Categoría | Nombre | Descripción | Criterio de aceptación | Prioridad |
| --- | --- | --- | --- | --- | --- |
| RNF23 | Integridad de datos | Consistencia entre el acta y los planes de mejora | Debe garantizarse que las acciones de mejora incluidas en un acta correspondan siempre a planes de mejora existentes del periodo académico del acta y en estado Aprobado o Vigente. | No es posible incluir en un acta una acción de mejora inexistente o perteneciente a otro periodo académico. | Alta |
| RNF24 | Integridad de datos | Inmutabilidad del contenido del acta emitida | Una vez emitida, el contenido del acta debe conservarse tal como fue aprobado, aun si los planes de mejora que le dieron origen se modifican posteriormente. | La modificación posterior de un plan de mejora no altera el contenido de un acta ya emitida. | Alta |
| RNF25 | Integridad de datos | Unicidad y continuidad del correlativo de acta | El sistema debe garantizar que no existan dos actas con el mismo número dentro de una escuela profesional y que el correlativo no presente saltos. | Ninguna operación del submódulo permite generar números de acta duplicados dentro de una misma escuela profesional. | Alta |
| RNF26 | Usabilidad | Fidelidad del acta exportada al formato institucional | El acta exportada debe ser visualmente equivalente al formato institucional vigente, de modo que pueda usarse directamente como documento de acreditación sin ajustes manuales. | El documento exportado conserva el orden de secciones, los juegos de columnas por aspecto y los textos institucionales del formato vigente. | Media |

---

## 8. Puntos pendientes de validación institucional

Del levantamiento ya fueron resueltos y quedaron incorporados como reglas de negocio de los RF correspondientes: la no incorporación de roles nuevos en ninguno de los cuatro submódulos (se reutilizan los del Módulo de Plan de Estudios), la posibilidad de que un plan de estudios tenga simultáneamente un plan de medición Directa y uno Indirecto (RF-PM-002), la variabilidad de los Atributos del Graduado por plan de estudios (RF120), la exigencia de que el formato exportado sea igual al formato institucional ya utilizado (RF-PM-028, RF-PM-029, RF-PE-032, RF-PE-033, RF-PJ-033, RF-PJ-034, RF-AC-018, RF-AC-019), y la generación de una alerta cuando una medición programada no se marca como realizada al llegar su fecha de cierre (RF-PM-046).

Quedan aún los siguientes aspectos por validar con la universidad antes de pasar a diseño detallado, ya que no se cuenta con información oficial y no se ha asumido ni inventado una respuesta:

### 8.1 Planes de Medición

- ¿Se permite crear un plan de medición sobre un plan de estudios en estado Borrador, o únicamente sobre planes Aprobados o Vigentes (RF-PM-001)?
- Relación funcional y de datos con el Assessment de Objetivos Educacionales, aún no especificado y fuera del alcance del presente documento.

### 8.2 Plan de Evaluación

- ¿El 'instrumento de evaluación' (Directa e Indirecta) debe ser un catálogo institucional reutilizable (por ejemplo, Rúbrica analítica, Encuesta) o un campo de texto libre por competencia?
- ¿Los 'grupos objetivo' de las indicaciones (Docentes, Egresados) corresponden a una lista fija institucional, o deben poder configurarse libremente?
- Formatos y tamaño máximo permitido para los archivos de evidencia (RF-PE-020), no especificados en el levantamiento inicial.
- El Assessment de Objetivos Educacionales, identificado en el archivo institucional analizado, no forma parte de los requerimientos entregados para este submódulo y queda fuera de alcance del presente documento.

### 8.3 Plan de Mejora

- ¿El 'Responsable' de la acción de mejora debe enlazarse a un usuario registrado en el sistema, o registrarse como texto libre de cargo o área (como ocurre actualmente en los documentos institucionales, p. ej. 'Director /Docente', 'Oficina responsable')?
- Valores oficiales que debe tomar el campo 'Estado de implementación de la acción de mejora' (se propone Pendiente, En proceso, Completado, pendiente de confirmación).
- Número mínimo oficial de acciones de mejora por criterio de acreditación y por objetivo educacional (los documentos institucionales indican 3 y 1 respectivamente; se requiere confirmar si estos valores son fijos o configurables).
- ¿Debe existir también un plan de mejora asociado a un plan de evaluación indirecta? El levantamiento y los documentos institucionales analizados solo contemplan la medición directa como origen del plan de mejora de competencias.
- Formatos y tamaño máximo permitido para los archivos de evidencia de los planes de mejora (RF-PJ-016).

### 8.4 Actas de Aprobación

- Firma del acta: no se ha considerado en el presente levantamiento. Deberá definirse posteriormente si el acta requiere firma digital, firma escaneada o únicamente el nombre y cargo del responsable, y si su ausencia bloquea la emisión del documento.
- Criterio oficial que determina qué acciones de mejora se incluyen en cada acta: en las actas institucionales analizadas no siempre se incluye la totalidad de las acciones registradas en el plan de mejora del periodo. Se propuso una selección manual sobre la carga automática (RF-AC-008), pendiente de confirmación.
- ¿El correlativo del acta debe ser continuo por escuela profesional, por facultad o por año? Se asumió continuo por escuela profesional (RF-AC-002), pendiente de confirmación.
- ¿Los asistentes deben seleccionarse de entre los usuarios registrados en el sistema, o registrarse como texto libre?

Estos puntos no bloquean el desarrollo funcional base de los submódulos, pero deben resolverse antes de finalizar el diseño de base de datos y las reglas de validación asociadas.

---

## 9. Referencias

1. IEEE Std 830-1998, *IEEE Recommended Practice for Software Requirements Specifications*, Institute of Electrical and Electronics Engineers, 1998.
2. ISO/IEC/IEEE 29148:2018, *Systems and software engineering — Life cycle processes — Requirements engineering*, ISO/IEC/IEEE, 2018.
3. Sistema de Gestión de la Calidad Universitaria — Módulo de Plan de Estudios: Especificación de Requerimientos Funcionales y No Funcionales (documento base de este levantamiento, 131 RF).
4. Archivo institucional de medición de competencias analizado como referencia de estructura de datos (hojas P.MEDICIÓN, P.ASSESSMENT, P.MEJORA y actas de aprobación de dos periodos académicos, Plan 2018).
5. Documentos fuente de requerimientos generales: '2.1 Definición de planes de medición.txt', 'Planes de evaluación.txt', 'de planes de Mejora.txt' y '3.2-Aprobaciones.txt'.
