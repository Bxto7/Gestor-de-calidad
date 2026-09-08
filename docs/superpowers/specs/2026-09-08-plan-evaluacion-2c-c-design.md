# Ciclo 2c-C — La configuración indirecta, y el alcance por carrera

**Fecha:** 8 de septiembre de 2026
**Requisitos:** RF-PE-022 a RF-PE-030 (nueve), más el cierre del alcance por
carrera de todo `mejora-continua`.
**Parte de:** submódulo Plan de Evaluación, tras los ciclos 2c-A (el plan
existe) y 2c-B (la configuración directa).

---

## 1. Qué construye este ciclo, y qué no

El plan de evaluación **indirecta** se configura igual que el directo pero con
otro tercer nivel de dato: donde la directa asocia asignaturas con su entregable
y sus evidencias, la indirecta registra **indicaciones dirigidas a un grupo
objetivo**, con el enlace al instrumento de recolección y, más tarde, el enlace
a los resultados.

Va con él una corrección de seguridad que no pertenece a ningún requisito nuevo:
`mejora-continua` no comprueba la carrera en ninguno de sus casos de uso. Entra
aquí porque cada ciclo que pasa añade superficie que heredaría el hueco.

**Fuera de alcance, con destino:** generación y exportación (RF-PE-031 a 033),
versionado e historial (034 a 037) y aprobación con validación integral (038 a
042) van al ciclo 2c-D. La numeración de este documento no los menciona salvo
donde una decisión de ahora los condiciona.

### La observación que abarata el ciclo

Seis de los nueve requisitos ya están construidos y solo hay que dejar que la
indirecta llegue a ellos:

| Requisito | Dónde vive ya |
|---|---|
| RF-PE-022 instrumento | `ConfiguracionCompetencia.instrumento` |
| RF-PE-023 frecuencia | `ConfiguracionCompetencia.frecuencia` |
| RF-PE-025 elegir el año | El selector de periodo de `PlanEvaluacionPage` |
| RF-PE-026 porcentaje del año | `MedicionAlcanzada.porcentajeAlcanzado` |
| RF-PE-027 guardar un año suelto | El `PUT` por cruce y el botón único de 2c-B |

Esto no es una coincidencia afortunada: **`PeriodoMedicion` es una sola tabla
para periodos y años**. Su propio comentario dice «sin periodos ni años
duplicados», y `configurar-plan-medicion.use-case.ts:111` confirma que un plan
indirecto no autogenera periodos a partir de `periodoInicio` — se añaden a mano.
El «año 2026» de la indirecta es una fila de esa tabla con etiqueta `2026`.

Ninguna de las dos tablas de 2c-B tiene nada específico de la directa:
`ConfiguracionCompetencia` es `(plan, competencia) → instrumento, frecuencia`, y
`MedicionAlcanzada` es `(plan, competencia, periodo) → porcentaje`. Son
exactamente lo que la indirecta necesita.

**Se descartó** crear tablas paralelas (`ConfiguracionCompetenciaIndirecta` y
hermanas). Duplicaría casi todo y obligaría a ramificar por tipo en cada caso de
uso, para separar dos cosas que hoy no divergen.

---

## 2. El esquema

Una columna nueva y una tabla nueva.

### 2.1. `ConfiguracionCompetencia` gana el responsable

```prisma
model ConfiguracionCompetencia {
  // … lo que ya tiene
  /// RF-PE-024. UUID de una cuenta de usuario, de cualquier rol, sin clave
  /// foránea: el registro debe seguir siendo legible aunque la cuenta
  /// desaparezca, igual que `docenteId` en AsignaturaEvaluada.
  responsableId String? @map("responsable_id") @db.Uuid
}
```

Cualquier rol y no solo `DOCENTE`, a diferencia de la directa: quien aplica una
encuesta a egresados suele ser un coordinador, no un docente. La columna es
opcional porque RF-PE-024 la marca «pendiente para la validación de
completitud», que llega en 2c-D — no la rechaza al guardar.

La columna es común a los dos tipos de plan. Un plan directo puede dejarla nula;
nada la exige.

### 2.2. `IndicacionDeMedicion`

```prisma
enum GrupoObjetivo {
  EGRESADOS
  EMPLEADORES
  DOCENTES
  ESTUDIANTES

  @@schema("mejora_continua")
}

model IndicacionDeMedicion {
  id               String @id @default(uuid()) @db.Uuid
  planEvaluacionId String @map("plan_evaluacion_id") @db.Uuid
  /// El periodo —el «año», en un plan indirecto— es un UUID del plan de
  /// medición base, sin FK, como en MedicionAlcanzada.
  periodoId        String @map("periodo_id") @db.Uuid

  grupoObjetivo GrupoObjetivo @map("grupo_objetivo")
  /// RF-PE-028: el texto de instrucción. Obligatorio.
  instruccion   String        @db.VarChar(1000)
  /// RF-PE-029 RN1: obligatorio.
  enlaceInstrumento String  @map("enlace_instrumento") @db.VarChar(500)
  /// RF-PE-029 RN1: opcional, «puede completarse después». Por eso vive en el
  /// lado de seguimiento de la frontera de estados (§3) y no en el de
  /// definición, aunque comparta fila con campos que sí son definición.
  enlaceResultados String? @map("enlace_resultados") @db.VarChar(500)

  plan PlanEvaluacion @relation(fields: [planEvaluacionId], references: [id], onDelete: Cascade)

  /// RF-PE-028 RN1: «una por cada grupo objetivo» y año.
  @@unique([planEvaluacionId, periodoId, grupoObjetivo])
  @@map("indicacion_medicion")
  @@schema("mejora_continua")
}
```

**Cuelga del año, no del cruce competencia×año.** RF-PE-028 lo dice —«para un
año del plan de evaluación indirecta, una o varias indicaciones»— y RF-PE-030
RN1 lo confirma desde el otro lado: «la eliminación de una indicación no afecta
los porcentajes de cumplimiento ya registrados para el año». Si colgara de
`MedicionAlcanzada` sería por competencia, y borrarla arrastraría el porcentaje.
Son dos cosas independientes que comparten año.

**El grupo objetivo es un catálogo cerrado** y no texto libre porque RF-PE-028
RN1 exige unicidad por grupo: con texto libre, «Docentes» y «docentes» serían
dos grupos distintos y el índice único no protegería nada. Los cuatro valores
son los que un proceso de acreditación encuesta habitualmente y cubren los dos
que el documento fuente nombra. **No se incluye `OTRO`**: dos indicaciones
«OTRO» en el mismo año chocarían contra el índice sin que el usuario entienda
por qué. Añadir un grupo es una línea y una migración.

**No lleva índice propio sobre `[planEvaluacionId, periodoId]`.** Las consultas
van siempre por esas dos columnas y el `@@unique` ya sirve de prefijo, así que
un índice aparte sería redundante y solo costaría escrituras.

### 2.3. Deuda de 2c-B que se salda aquí

`Evidencia.asignaturaEvaluadaId` **sí** necesita el suyo, y no lo tiene: es la
única de las cuatro tablas del ciclo anterior cuya clave foránea no encabeza
ningún índice —las otras tres lo obtienen gratis de su `@@unique`—. Afecta al
`DELETE CASCADE` desde `asignatura_evaluada` y al `deleteMany` que
`reemplazarEvidencias` ejecuta en cada guardado.

La revisión final de 2c-B lo dictaminó como deuda con fecha en este ciclo, por
ser el siguiente que toca el esquema. Se añade en la misma migración.

---

## 3. La frontera de estados

Extiende la tabla de 2c-B sin cambiar de forma. En **negrita**, lo que este
ciclo añade.

| | Borrador | Vigente | Aprobado · En revisión · Histórico |
|---|---|---|---|
| instrumento, frecuencia | ✅ | ❌ | ❌ |
| **responsable de la competencia** | ✅ | ❌ | ❌ |
| asignaturas, entregable, docente | ✅ | ❌ | ❌ |
| **grupo, instrucción, enlace al instrumento** | ✅ | ❌ | ❌ |
| porcentaje alcanzado | ✅ | ✅ | ❌ |
| evidencias | ✅ | ✅ | ❌ |
| **enlace a los resultados** | ✅ | ✅ | ❌ |

El enlace a los resultados cae del lado del seguimiento porque RF-PE-029 RN1 lo
dice: «opcional y **puede completarse después**». Es el mismo caso que las
evidencias de la directa, y la excepción que RF-PE-006 RN2 concede al registro
progresivo lo ampara.

Que un campo de la fila sea seguimiento y los otros tres definición **no se
resuelve con una comparación dentro del caso de uso**, sino partiendo endpoints,
como en 2c-B: un `PUT` reemplaza las indicaciones de un año (definición) y otro
`PUT` escribe el enlace a resultados de una indicación (seguimiento). Los dos
guardianes que ya existen —`exigirDefinicionEditable` y
`exigirSeguimientoEditable`— se reutilizan tal cual, sin añadir un tercero.

---

## 4. Las validaciones, y dónde vive cada una

| Regla | Dónde | Cómo |
|---|---|---|
| Solo se configura donde la matriz base programó | Caso de uso | `matriz(planMedicionId)`, igual que `guardarAsignaturas` y `guardarPorcentaje` |
| La competencia está declarada en el plan base | Caso de uso | `competenciasDelPlan`, ya existe |
| Una indicación por grupo y año | Base de datos | `@@unique([planEvaluacionId, periodoId, grupoObjetivo])` |
| El grupo objetivo es uno de los cuatro | DTO y base | `@IsEnum` en el DTO, `enum` en PostgreSQL |
| Instrucción y enlace al instrumento obligatorios | DTO y base | `@Recortado()` + `@MinLength(1)`, `NOT NULL` |
| Los enlaces son URL con protocolo | DTO | `@IsUrl({ require_protocol: true })`, como las evidencias |
| El responsable **no** se valida | Ninguna | Ver abajo |
| Las indicaciones son opcionales | Ninguna | RF-PE-028 RN2: cero es válido |

**El responsable se guarda tal cual llega**, sin comprobar que la cuenta existe
ni qué rol tiene. Es el precedente que 2c-B fijó para el docente y su razón vale
igual aquí: validarlo convertiría un cambio de rol futuro en un dato histórico
inválido, y la pantalla ya ofrece solo cuentas reales. El registro debe
conservar a quien fuera responsable entonces, aunque después deje de serlo.

`@Recortado()` es el decorador compartido de `platform/http`, no una copia:
sin él, `"   "` supera el `@MinLength(1)` y una instrucción en blanco satisface
un campo obligatorio sobre el papel.

**Un plan directo no acepta indicaciones y uno indirecto no acepta asignaturas.**
El tipo se hereda del plan de medición base y no se puede cambiar. La comprobación
va en el caso de uso, con un 409 que nombra el tipo del plan.

---

## 5. Los endpoints

Tres cambios sobre la superficie de 2c-B, con su mismo patrón.

| Verbo y ruta | Requisito | Frontera |
|---|---|---|
| `PUT /planes-evaluacion/:id/competencias/:cId` | 022, 023, **024** | Definición |
| `PUT /planes-evaluacion/:id/periodos/:pId/indicaciones` | **028, 029, 030** | Definición |
| `PUT /indicaciones/:id/resultados` | **029** | Seguimiento |
| `PUT /planes-evaluacion/:id/competencias/:cId/periodos/:pId/medicion` | 026, 027 | Seguimiento, sin cambios |
| `GET /planes-evaluacion/:id/configuracion` | 025 y todos | Devuelve además las indicaciones |

El `PUT` de competencia **gana un campo**, `responsableId`, y no un endpoint
nuevo: el instrumento, la frecuencia y el responsable son los tres datos que
RF-PE-022 a 024 definen «una única vez por competencia», y separarlos obligaría
a tres peticiones para guardar una tarjeta.

El `PUT` de indicaciones **reemplaza el conjunto entero del año**, como hacen
los cuatro de 2c-B. Eso da RF-PE-030 —editar y eliminar— sin endpoints propios:
editar es mandar la lista con el texto cambiado, eliminar es mandarla sin esa
entrada. Y evita por construcción que dos escrituras parciales del mismo año se
pisen según el orden de llegada.

`PUT /indicaciones/:id/resultados` **cuelga de la raíz y no lleva
`planEvaluacionId`**, igual que `EvidenciasController`. El caso de uso resuelve
el plan desde la indicación. Lo que eso cierra por construcción —y conviene
decirlo con precisión, porque en 2c-B el comentario afirmó de más— es que **no
se puede aplicar el estado de otro plan** al que se manda en la ruta: pasar un
Borrador propio para escribir sobre una indicación de un plan Histórico. El
control por carrera lo da §6, no la forma de la ruta.

---

## 6. El alcance por carrera

### 6.1. El hueco

`mejora-continua` llama `puede(actor.id, permiso, null)` en **los ocho casos de
uso del módulo**, con la carrera siempre nula, y ninguno de sus permisos figura
en `PERMISOS_ACOTADOS_A_CARRERA`. Hoy, alguien con `evaluacion.editar` de la
carrera A puede escribir en un plan de la carrera B si conoce su identificador.

Está así desde el ciclo 2b. Lo destapó la revisión final de 2c-B, al comprobar
que un comentario afirmaba cerrar ese vector y no lo cerraba.

### 6.2. La corrección

Los ocho permisos de escritura entran en el conjunto acotado:

```
medicion.crear     medicion.editar     medicion.eliminar     medicion.aprobar
evaluacion.crear   evaluacion.editar   evaluacion.eliminar   evaluacion.aprobar
```

**`medicion.leer` y `evaluacion.leer` se quedan fuera, a propósito.** No es un
olvido: es la política que el proyecto ya escribió para `plan-estudios`, en el
comentario de esa misma constante — «los de solo lectura quedan fuera a
propósito: un Director puede consultar planes de otras carreras, lo que no puede
es modificarlos ni aprobarlos». Esto zanja además una cuestión que 2c-B dejó
abierta: `GET /docentes` se queda en `evaluacion.leer`.

### 6.3. De dónde sale la carrera

Por la cadena que ya existe, sin tocar el aislamiento ni el esquema:

```
PlanEvaluacion.planMedicionId → PlanMedicion.planEstudiosId
                              → ContenidoCurricularPort.planPorId().carreraId
```

`PlanBase` ya expone `carreraId`; no hace falta ampliar el puerto.

### 6.4. Por qué este cambio no puede aterrizar a medias

`puede()` **falla cerrada**: un permiso acotado con `carreraId === null` se
deniega, con el motivo «está acotado a una carrera y no se indicó cuál». Así
que si un permiso entra en el conjunto y alguna llamada olvida pasar la carrera,
la operación **falla de forma ruidosa** en vez de dejar el hueco abierto. Es la
propiedad que hace seguro este refactor, y hay que probarla explícitamente.

### 6.5. El compromiso que se acepta

Resolver la carrera cuesta una llamada al puerto por comprobación. La
alternativa —desnormalizar `carreraId` en `PlanMedicion`, como ya se hace con
`planEstudiosId`— se **descarta por ahora**: es una migración que se añade el
día que el número lo justifique, y hacerlo antes de tenerlo sería adivinar. Si
2c-D encuentra que duele, ahí está escrito el remedio.

---

## 7. La pantalla

Un plan es directo o indirecto según su plan base, y el tipo no cambia. Por eso
`PlanEvaluacionPage` **ramifica** entre `ConfiguracionDelPeriodo` —la de 2c-B— y
una `ConfiguracionDelAnio` hermana, en vez de que un solo componente crezca con
condicionales. `ConfiguracionDelPeriodo` ya tiene 644 líneas —el fichero más
grande de la carpeta— y este ciclo no le añade ninguna.

Lo que las dos comparten se queda donde está: el selector de periodo, el botón
único «Guardar el periodo», la conciliación del estado con la respuesta
refrescada y el reparto entre definición y seguimiento.

La tarjeta del año muestra, por competencia programada, el instrumento, la
frecuencia, el responsable y el porcentaje; y debajo, una sección por
**indicaciones del año** —no por competencia—, coherente con dónde cuelga el
dato.

**Nombres accesibles.** Todo campo que se repita lleva su contexto en la
etiqueta visible: `Instrumento de CPE-01`, `Instrucción para EGRESADOS`. La
convención está escrita en la cabecera de `ConfiguracionDelPeriodo` y se aplica
entera desde el principio: en 2c-B se aplicó a la mitad de los campos y hubo que
volver.

---

## 8. Los errores

| Situación | Código | Mensaje |
|---|---|---|
| El cruce no está programado en la matriz base | 409 | Nombra la competencia y el periodo |
| Indicaciones sobre un plan directo | 409 | Nombra el tipo del plan |
| Dos indicaciones del mismo grupo en un año | 409 | Nombra el grupo objetivo |
| Editar la definición fuera de Borrador | 409 | Nombra el estado actual |
| Escribir resultados fuera de Borrador o Vigente | 409 | Nombra el estado actual |
| Grupo objetivo desconocido | 400 | Lista los cuatro válidos |
| Enlace sin protocolo, instrucción vacía | 400 | Del DTO |
| Escribir en un plan de otra carrera | 403 | El motivo que devuelve `puede()` |
| Indicación inexistente | 404 | |

El 409 por índice único se traduce leyendo el nombre del índice, que con Prisma
7.9.1 y `@prisma/adapter-pg` llega en
`meta.driverAdapterError.cause.originalMessage` y no en `meta.target`.

---

## 9. Las pruebas

| Nivel | Qué cubre |
|---|---|
| Unitarias | Los guardianes de estado sobre los caminos nuevos; la validación de tipo de plan; la resolución de la carrera |
| Integración | El índice único por grupo y año; el `CASCADE`; que borrar una indicación no toca el porcentaje (RF-PE-030 RN1) |
| Autorización | **Que un actor de otra carrera recibe 403 en los ocho permisos acotados**, y que las lecturas siguen abiertas |
| Componente | La composición del guardado del año, con dos competencias y dos grupos objetivo a la vez |
| E2E | Configurar un año de un plan indirecto de punta a punta; que un año no toca a los demás |
| Accesibilidad | La pantalla nueva entra en `accesibilidad.spec.ts` |

**El listón:** una prueba en verde no cuenta hasta saber por qué estaría en
rojo. Cada afirmación fuerte se comprueba rompiendo el código a propósito y
viendo caer exactamente la prueba que debe.

Dos trampas concretas, de las que este proyecto ya pagó:

- **El orden asíncrono real.** `onSettled` es `async` y se espera antes de que
  `mutateAsync` resuelva. Una prueba que reenderice *después* de que el guardado
  resuelva prueba el orden benigno, no el real, y pasa aunque el código pierda
  datos.
- **Los recorridos que no escriben nada.** Afirmar que «un año no toca a los
  demás» sin haber escrito un valor en el primero no distingue «es por año» de
  «nunca se guardó».

---

## 10. Decisiones tomadas, con lo que cuestan si son erróneas

1. **Reutilizar las tablas de 2c-B en vez de crear paralelas.** Si los dos tipos
   divergen de verdad más adelante, separarlas es una migración con copia de
   datos, no una reescritura del caso de uso.
2. **El grupo objetivo, catálogo cerrado de cuatro sin `OTRO`.** Si aparece un
   quinto grupo, es una línea y una migración. Con texto libre, el índice único
   de RF-PE-028 RN1 no protegería nada.
3. **El responsable, cuenta de cualquier rol.** Si resulta que siempre es un
   docente, sobra amplitud; al revés habría dejado fuera a los coordinadores,
   que son quienes aplican los instrumentos indirectos.
4. **Las indicaciones cuelgan del año.** Lo exige RF-PE-030 RN1. Si se quisieran
   por competencia, es una columna más y un índice distinto.
5. **Las lecturas no se acotan por carrera.** Es la política ya escrita del
   proyecto. Si la universidad pide lo contrario, se aplica a los dos módulos a
   la vez, no solo a este.
6. **La carrera se resuelve en el momento, no se desnormaliza.** Si el número
   duele, §6.5 tiene el remedio escrito.
