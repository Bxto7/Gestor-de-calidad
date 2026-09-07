# Cambios que necesita el documento fuente

Dirigido a quien mantiene *«Módulo de Plan de Estudios — Especificación de Requerimientos»* (Huancayo, 15 de agosto de 2026) y *«Módulo de Mejora Continua — Requerimientos»*.

Al construir los módulos aparecieron once puntos en los que el sistema y el documento no coinciden. **Nueve necesitan que alguien de la universidad decida**; dos son solo constancia de que se hizo más de lo pedido.

Este archivo está escrito para leerse sin abrir el código. El detalle técnico de cada punto está en la sección 8 de `PROMPT_CLAUDE_CODE_PLAN_ESTUDIOS_UI.md`, con los mismos identificadores **D-1** a **D-12** que se usan aquí. Falta **D-10** en este resumen a propósito: es una decisión de paleta de colores ya aprobada, sin nada que la universidad tenga que resolver.

Fecha de este informe: **7 de septiembre de 2026** (la primera versión es del 25 de agosto).

---

## Parte 1 — Requieren decisión

### D-1 · RF092 · ¿Desde qué estado se genera la evidencia de aprobación?

El requisito dice que el plan debe estar **Aprobado**. El sistema la genera también desde **Vigente** e **Histórico**.

**Por qué se hizo así.** Vigente e Histórico vienen *después* de la aprobación. Con la regla literal, un plan archivado no puede producir su propia evidencia — y son justo los planes archivados los que un evaluador de acreditación pide. El plan ISI 2018 que ya está cargado en el sistema es exactamente ese caso: aprobado en su día, hoy histórico.

**Qué hay que decidir.** Si se acepta, corregir la precondición de RF092 para que diga «Aprobado, Vigente o Histórico». Si se prefiere la lectura literal, se ajusta el sistema — pero hay que asumir que los planes archivados quedan sin evidencia documental.

**Recomendación:** aceptarlo. Negarlo deja fuera el caso de uso principal.

---

### D-2 · RF056 y RF067 · Falta el concepto de «grupo de electivos»

El documento clasifica cada asignatura como obligatoria o electiva y ahí se acaba. No contempla que un plan diga **«un electivo por ciclo, a escoger entre estos cinco»**, que es como funciona el plan real de Ingeniería de Sistemas.

**Por qué importa, y no es un detalle.** Sin ese concepto, las cinco opciones de un ciclo cuentan como cinco cursos. Al cargar el plan ISI 2018 el sistema declaraba **249 créditos**, cuando el documento oficial de la carrera dice **210**. Un 19 % de más: un plan que nadie cursa.

**Qué hay que decidir.** Esto no se arregla cambiando una frase. Hace falta **un requisito nuevo** que defina los grupos de electivos: cómo se declaran, cuántas opciones se cursan de cada uno y cómo cuentan para el total de créditos. El sistema ya lo implementa; el documento no lo describe.

**Recomendación:** redactar el RF. Es la diferencia entre publicar 210 créditos o 249.

---

### D-3 · RF084 · El histórico de cambios solo se exporta en PDF

El requisito admite «un archivo (PDF o Excel)». Solo se implementó el PDF.

**Por qué.** No apareció un caso de uso para el Excel. La malla curricular sí lo tiene (RF073) porque se exporta para análisis externos; un histórico de aprobaciones se lee, no se tabula.

**Qué hay que decidir.** Si hace falta el Excel. Si la respuesta es no, acotar RF084 a PDF. Si es sí, es un añadido de horas: la maquinaria ya existe.

---

### D-4 · RF101 a RF110 · No sabemos qué número es cada cosa

El documento resume este bloque en una línea —búsqueda global, créditos por ciclo, área de formación, exportación integral, cobertura de competencias, panel estadístico, consulta de solo lectura, bitácora de accesos— y lo declara fuera del alcance de la especificación de pantallas. **No hay texto de requisito para ninguno de los diez.**

Las ocho capacidades están construidas. Pero son **ocho capacidades para diez números**, y qué capacidad corresponde a RF103 o a RF107 no consta en ninguna parte del material disponible. La correspondencia que usa el equipo está deducida del orden en que la línea de resumen las nombra.

**Qué hay que decidir.** Alguien con el PDF completo tiene que confirmar la correspondencia, y decir qué son los dos números sobrantes.

**Mientras tanto — importante:** no citar un número concreto de ese rango en un expediente de acreditación ni en un informe de avance. La trazabilidad requisito↔implementación de ese bloque **no está verificada**, y una tabla de trazabilidad con números inventados es peor que no tenerla.

---

### D-5 · RF041 y RF053 · La carga de planes ya existentes no está contemplada

Ambos requisitos dicen que el código lo genera el sistema y no es editable. La aplicación lo cumple sin excepción: no hay forma de escribir un código a mano desde ninguna pantalla.

Pero para cargar el plan ISI 2018 hizo falta conservar los códigos institucionales reales —`ASUC01113`, `CPE-ISI07`—, los que aparecen en el récord de cada estudiante. Se cargan con un script que escribe directamente en la base de datos, por debajo de la aplicación, igual que la carga inicial de roles y permisos.

**Por qué.** La regla es correcta para dar de alta una asignatura nueva. Pero esto no es un alta: es traer un plan que ya existe. Si el sistema inventara sus propios códigos, el dato no se podría cotejar con ningún documento oficial de la universidad.

**Qué hay que decidir.** El documento debería contemplar la **carga de planes preexistentes** como un caso distinto de la creación, con sus propias reglas. Hoy no la menciona, y sobre el papel el script contradice RN1.

---

### D-6 · No existe ningún requisito que diga cómo se registran los prerrequisitos

El documento habla de prerrequisitos en cuatro sitios —al inactivar una asignatura, en su histórico, al moverla de ciclo y al validar circularidad— pero **no hay ningún RF que defina cómo se registran**. Está el efecto sin la causa.

Hay además un problema concreto: el plan ISI 2018 tiene **16 requisitos que el sistema no sabe expresar**, del tipo «20 créditos aprobados», «60 créditos aprobados» o «certificado de inglés B1». No son asignaturas, y el modelo actual solo relaciona asignaturas entre sí. Están guardados como texto para no perderlos, pero **no se cargan y ninguna validación los tiene en cuenta**.

**Qué hay que decidir.** Dos cosas:

1. Redactar el RF que falta, el de registro de prerrequisitos y correquisitos.
2. Decidir si los requisitos por créditos acumulados y por certificaciones deben modelarse. Son reales, están en el plan vigente de la carrera, y hoy el sistema no los conoce.

---

### D-9 · RF055 y RF047 · Faltan horas teóricas y sumillas

El plan ISI 2018 está cargado con **todas las horas teóricas en cero** y **todas las sumillas con un texto de relleno** («Sumilla pendiente de cargar desde el sílabo oficial de la asignatura»).

**Por qué.** El documento del que se cargó el plan no los trae. Se optó por un valor visiblemente vacío antes que inventar cifras.

**Qué hay que decidir.** De dónde salen esos datos y quién los aporta. Mientras tanto, cualquier reporte que use horas teóricas dará cero, y el PDF del plan sale con las sumillas en blanco — cosa que se nota a simple vista en un expediente.

---

### D-11 · RF127 · Una competencia sin atributo del graduado se puede incluir en un plan de medición

*Este punto es del documento de Mejora Continua, no del de Plan de Estudios.*

RF127 dice que una competencia sin ningún Atributo del Graduado asociado **se excluya de la lista de selección** al configurar un plan de medición, para que «todo plan de medición quede construido únicamente con competencias trazables a un atributo del graduado».

**El sistema hace lo contrario:** las muestra —agrupadas al final, bajo «Sin atributo del graduado asignado»— y deja incluirlas. La API tampoco lo impide.

**Por qué.** Esconder una competencia sin mapear la vuelve invisible justo para quien podría arreglarla: quien configura el plan vería una lista más corta sin saber que lo es, y el mapeo que falta —que es un hallazgo de acreditación en sí mismo— no aparecería en ninguna pantalla.

**Qué se pierde mientras tanto.** Justo lo que RF127 protege: hoy un plan de medición puede contener competencias que no se trazan a ningún atributo, que es precisamente lo que la evaluación ICACIT necesita poder seguir.

**Qué hay que decidir.** Tres salidas:

1. Aplicar RF127 tal como está escrito: se ocultan.
2. Una intermedia: se muestran, pero no se pueden marcar, con el motivo escrito al lado. Cumple el resultado que RF127 busca y conserva la razón por la que hoy se ven.
3. Corregir el requisito para admitir que se vean y se incluyan.

La segunda es la que recomendamos, y es poco trabajo. Pero es una decisión de la universidad, no de quien programa.

---

### D-12 · RF-PE-020 · La evidencia del entregable se guarda como enlace, no como archivo

*Este punto es del documento de Mejora Continua, no del de Plan de Estudios.*

RF-PE-020 dice que se puedan adjuntar «**archivos o enlaces**» de evidencia por cada asignatura asociada a una competencia. El sistema hará **solo enlaces**: un campo donde se pega la dirección del entregable.

**Por qué.** Recibir archivos no es un campo más. Implica subida, límite de tamaño, validación de tipo, almacenamiento, servido con permisos y un bucket de Backblaze B2 que todavía no está contratado. Hoy el sistema **genera** documentos, no los recibe. Con enlaces se cubre el caso que la universidad ya vive —los entregables están en Drive o SharePoint y aquí se apunta dónde— y se puede empezar ya. Además, RF-PE-029, la evidencia de la medición indirecta, está redactado con enlaces y solo enlaces: así los dos lados funcionan igual.

**Qué se pierde.** Un enlace se puede romper: una carpeta que se mueve, un permiso que cambia, alguien que se va de la universidad. Un archivo guardado dentro del sistema, no. En un expediente de acreditación que se revisa años después, esa diferencia puede pesar.

**Qué hay que decidir.** Si con enlaces basta, o si la evidencia debe quedar guardada dentro del sistema. Conviene decirlo **antes** de que haya evidencias registradas: añadir la subida después obliga también a migrar lo ya cargado.

La decisión que hemos tomado es reversible —añadir archivos más adelante no deshace los enlaces ya guardados—, y por eso se empieza por aquí y no al revés.

---

## Parte 2 — Solo para constancia

No requieren decisión. El sistema hace más de lo que el requisito pedía, sin contradecirlo. Se anotan por si el documento quiere reflejar el nivel de detalle alcanzado.

**D-7 · RF072 — el PDF del plan.** El requisito dice que el sistema «compila la información» y entrega el archivo, sin decir cómo. Se genera en el servidor y en segundo plano, de modo que pedir el documento de un plan de 74 asignaturas no bloquee a quien lo pidió. Medido: menos de un segundo de principio a fin, frente al objetivo de cinco.

**D-8 · RF073 — el Excel de la malla.** Se entrega un archivo Excel de verdad, de tres hojas, con los créditos guardados como números. Suena a detalle y no lo es: el requisito justifica el Excel por los «análisis externos», y una columna de créditos guardada como texto no se puede sumar ni llevar a una tabla dinámica.

**Cosas construidas que el documento no menciona.** El mapeo de cada competencia con los atributos del graduado de ICACIT y su reporte de cobertura —qué atributos no cubre ninguna competencia—; el registro de accesos al sistema, separado del registro de cambios; y la constancia de procedencia al pie de cada documento generado, para que un archivo suelto en un expediente pueda decir de dónde salió.

---

## Versionado de planes de medición — decisiones tomadas sin que el requisito las cubra

El ciclo de RF-PM-030 a RF-PM-034 obligó a decidir tres cosas que el documento no
menciona. Ninguna contradice un requisito; las tres los completan donde callan, y por eso
se anotan aquí en vez de en la lista de divergencias.

**El correlativo lo comparten versiones y duplicados.** El código de un plan de medición
lleva un número —`PM-PE-ISI-2026-v2-D-v3`— y el campo `version` lo repite. Tanto una
versión nueva (RF-PM-030) como un duplicado (RF-PM-034) toman el siguiente número de la
serie, así que `v1, v2, v3` puede mezclar versiones de un mismo linaje con copias
independientes. El parentesco lo expresa otro dato, no el número.

Se hizo así para que el código y el campo no se contradigan: si un duplicado empezara en
`version: 1`, su código diría `v3` y su campo `1`, y la pantalla mostraría dos números
distintos para lo mismo.

*Qué hay que decidir:* si se espera que el número exprese linaje. Si es así, hay que
separar código y versión, y conviene hacerlo **antes** de que haya planes reales: después
significa migrar datos.

**Marcar un plan como vigente archiva al anterior, sin preguntar.** RF-PM-041 RN1 admite
un solo plan vigente por plan de estudios y tipo, pero ningún requisito dice qué pasa con
el que estaba. Se archiva en la misma operación, y el motivo queda escrito en la bitácora
—«relevado por…»— para que ese archivado no parezca una decisión que nadie tomó.

La alternativa era exigir archivarlo a mano antes. Se descartó porque abre una ventana en
la que el programa no tiene ningún plan de medición vigente, y si quien lo hace se
distrae, esa ventana no se cierra.

*Qué hay que decidir:* si la universidad quiere confirmar el relevo explícitamente.

**Se permiten varias versiones en curso a la vez.** Nada impide versionar dos veces el
mismo plan sin haber terminado la primera. Las dos nacen en borrador y no chocan con
ninguna regla.

La consecuencia es que dos personas pueden estar corrigiendo el mismo plan en paralelo sin
enterarse. Se aceptó a sabiendas: prohibirlo añade un bloqueo que nadie ha pedido y que
estorbaría el día que las dos correcciones sean independientes.

*Qué hay que decidir:* si en la práctica eso genera trabajo perdido. La salida sería
avisar al abrir la segunda, no impedirla.

**Y una cuarta, sobre permisos.** Ver el historial de cambios de un plan exigía
`auditoria.leer`, que abre la bitácora entera del sistema y solo tienen el administrador y
la dirección de carrera. Eso dejaba al Coordinador académico —que es quien más modifica
esos planes— sin poder ver sus propios cambios. Se añadió un permiso acotado que solo deja
consultar el historial de **una** entidad concreta, sabiendo su identificador. No abre la
bitácora de nadie más.

---

## Resumen para quien tenga que priorizar

De más urgente a menos:

| Punto | Impacto si no se resuelve |
|---|---|
| **D-2** · Grupos de electivos | El sistema publica una cifra de créditos que no coincide con el documento oficial de la carrera |
| **D-11** · RF127 · Competencias sin atributo | Un plan de medición puede quedar con competencias no trazables a ningún atributo del graduado — lo que la evaluación ICACIT sigue |
| **D-12** · RF-PE-020 · Evidencias como enlace | Un enlace roto deja sin respaldo una evidencia de acreditación, y no se nota hasta que alguien la busca |
| **D-4** · Numeración RF101–110 | No se puede construir una tabla de trazabilidad fiable para ese bloque |
| **D-6** · Prerrequisitos | Faltan 16 requisitos reales del plan vigente; hay un RF sin redactar |
| **D-9** · Horas y sumillas | Los documentos que salgan del sistema van incompletos |
| **D-1** · RF092 | Discrepancia entre código y requisito, sin efecto práctico negativo hoy |
| **D-5** · Carga de planes históricos | Discrepancia sobre el papel; la práctica es la correcta |
| **D-3** · RF084 en Excel | Ninguno, salvo que alguien lo pida |

Los dos puntos de constancia (**D-7** y **D-8**) no aparecen aquí porque no hay nada que resolver.
