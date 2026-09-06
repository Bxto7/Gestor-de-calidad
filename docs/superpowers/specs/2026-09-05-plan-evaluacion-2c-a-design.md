# Plan de Evaluación · ciclo 2c-A — el plan existe

**Fecha:** 5 de septiembre de 2026
**Submódulo:** Mejora Continua · Plan de Evaluación (`RF-PE`)
**Alcance de este ciclo:** RF-PE-000 a RF-PE-005, RF-PE-008 a RF-PE-012,
RF-PE-043 a RF-PE-048 (17 requisitos)

---

## 1. Por qué este ciclo existe y dónde acaba

El submódulo de Plan de Evaluación son 49 requisitos. No caben en una spec, y
tampoco son 49 problemas nuevos: más de la mitad repiten la estructura de Planes
de Medición —alta, código, estados, edición, versionado, histórico, aprobación,
exportación, permisos, auditoría—, que ya está construida y probada.

El reparto acordado son cuatro ciclos:

| Ciclo | Qué cubre | RF |
|---|---|---|
| **2c-A** (este) | El plan existe: alta desde un plan de medición, código, estados, borrado, consulta, competencias y periodos heredados, permisos, auditoría | 000–005, 008–012, 043–048 |
| 2c-B | Configuración **directa**: instrumento, frecuencia, periodo progresivo, asignaturas, entregable, docente, % alcanzado, evidencias — y con ella, la edición y su restricción | 006–007, 013–021 |
| 2c-C | Configuración **indirecta**: instrumento, frecuencia, responsable, año, % cumplimiento, indicaciones | 022–030 |
| 2c-D | Cierre: generar, Excel, PDF, versionado, histórico, aprobación, validación de consistencia | 031–042 |

**2c-A termina cuando** se puede crear un plan de evaluación a partir de un plan
de medición Aprobado o Vigente, moverlo por su ciclo de vida, encontrarlo en un
listado con filtros, y ver en su detalle las competencias y periodos que hereda
—en solo lectura—. La configuración de cada competencia es 2c-B y 2c-C; el hueco
queda visible y vacío a propósito.

**Fuera de 2c-A, explícitamente:** cualquier dato de configuración por
competencia, la exportación, el versionado y la aprobación con validación de
consistencia. Un plan de evaluación de 2c-A puede llegar a Vigente sin más
comprobación que las de su máquina de estados; la validación integral es
RF-PE-041, en 2c-D.

**Y también la edición, RF-PE-006 y RF-PE-007, que pasan a 2c-B.** No es un
recorte de alcance sino una consecuencia de leer RF-PE-002: su flujo principal
es «el usuario confirma la creación» y «el sistema crea el registro en estado
Borrador». No captura ningún dato propio —el tipo y la meta vienen de la base—,
así que en 2c-A un plan de evaluación **no tiene ni un campo editable**.
RF-PE-007 habla de modificar «los datos generales y la configuración por
competencia»: ambas cosas nacen en 2c-B. Construir ahora un `PATCH` que acepta
un cuerpo vacío, con su guardián y su prueba, sería construir un sitio donde
todavía no hay nada que guardar.

La regla que protegen esos dos requisitos sí se ejercita en 2c-A: `permiteEdicion`
la usa el borrado (RF-PE-008, solo en Borrador) y la comprueban sus pruebas.

---

## 2. El hallazgo que decide la arquitectura: no se copia nada

El documento se contradice en apariencia. RF-PE-002 dice que el plan de
evaluación se crea **«heredando la meta, las competencias y los periodos (o
años) del plan de medición»**. Pero RF-PE-010 RN1 dice que las competencias
**«siempre son las mismas del plan de medición base»** y RF-PE-011 RN1 lo repite
para los periodos, añadiendo que **«no se editan desde el plan de evaluación»**.

Copiar y «siempre las mismas» solo coinciden mientras el original no cambie.

**No puede cambiar — el conjunto, no cada celda.** RF-PE-001 RN3 solo admite
como base planes de medición en estado **Aprobado o Vigente**, y en el código
construido `permiteEdicion` devuelve `true` únicamente para `Borrador`
(`domain/value-objects/estado-plan-medicion.ts`). Un plan de medición elegible
tiene congelado el *conjunto* de competencias, de periodos y de celdas
programadas: no se añaden, no se quitan, no se reprograman. Lo que no está
congelado es la marca de `realizada` sobre esas celdas —
`ProgramarMediciones.marcarRealizada` (RF-PM-026) la escribe a propósito sobre
un plan Aprobado o Vigente, porque registrar que una medición ocurrió es
seguimiento del plan que ya rige, no edición de su definición—. Desde ahí solo
puede pasar a Histórico —al ser relevado por otro Vigente—, que tampoco altera
ni el conjunto ni las marcas ya escritas.

Esto no debilita la decisión de no copiar: la refuerza. Si el plan de
evaluación hubiera copiado las celdas en vez de referenciarlas, esa copia se
habría desincronizado exactamente ahí, en `realizada` — el único campo de la
matriz que sigue cambiando después de que el plan llega a Aprobado o Vigente.
Leer en vivo a través del puerto evita ese problema por construcción; copiar lo
habría reproducido tal cual.

**Decisión: el plan de evaluación no copia nada. Referencia a su plan de
medición y lee competencias, periodos y matriz a través del puerto que ya
existe.**

Qué gana:

- Cumple las dos RN a la letra, en vez de elegir una.
- Elimina la clase entera de errores de desincronización. Este proyecto ya tiene
  una cicatriz de ese tipo: el Excel del que sale declaraba 249 créditos en un
  sitio y 210 en otro por sostener dos copias del mismo dato.
- Ahorra tres tablas y la lógica de copia que las llenaría.
- RF-PE-012 —restringir la configuración a las combinaciones competencia-periodo
  programadas— se resuelve leyendo la matriz base, y es correcta siempre por
  construcción, no por acordarse de sincronizar.

Qué cuesta: cada lectura del detalle atraviesa el plan de medición. Es una
consulta más por pantalla, contra una tabla indexada por clave primaria.

**Riesgo de referencia colgante: ninguno.** Un plan de medición solo se puede
borrar en Borrador (`permiteEliminacion`), y un Borrador no es elegible como
base. La clave foránea se declara igualmente con `RESTRICT` para que, si esa
regla cambiara algún día, el fallo sea un error de la base de datos y no un plan
de evaluación apuntando al vacío.

---

## 3. Estructura: un submódulo por carpeta

Hoy `modules/mejora-continua/` es plano: 23 archivos y 3.712 líneas, todos de
Planes de Medición, distinguidos solo por el sufijo del nombre. Evaluación tiene
un tamaño parecido, y detrás vienen Planes de Mejora (47 RF) y Actas (27). Con
los cuatro dentro, `application/use-cases/` tendría una veintena de archivos de
cuatro asuntos distintos mezclados.

**Decisión: subcarpeta por submódulo dentro del módulo.**

```
modules/mejora-continua/
  medicion/     { domain, application, infrastructure }   ← se traslada
  evaluacion/   { domain, application, infrastructure }   ← nuevo
  domain/       lo genuinamente común
  aislamiento.spec.ts
```

Se descartó un módulo NestJS aparte (`modules/evaluacion/`): el documento lo
llama *submódulo*, obligaría a un puerto entre piezas del mismo módulo de
negocio, y con cuatro submódulos habría cuatro copias de la prueba de
aislamiento vigilando fronteras que el dominio no tiene.

**El traslado va primero y solo.** Un commit mecánico —renombrado puro, cero
líneas de lógica— antes de escribir nada nuevo, con las 716 pruebas unitarias y
las 235 de integración en verde antes y después. Es el patrón de la Task 1 del
ciclo anterior, que salió limpio.

### Qué sube a la raíz del módulo

| Pieza | Por qué se comparte |
|---|---|
| `estado-plan-medicion.ts` → `domain/value-objects/estado-plan.ts` | RF-PE-004 dice literal «replicando el mismo esquema utilizado en Planes de Medición», y RN1 repite la misma secuencia. Es la misma máquina de estados, no una parecida. El **enum de Prisma** `EstadoMedicion` conserva su nombre: renombrarlo es una migración de base de datos a cambio de nada. |
| `agrupar-por-atributo.ts` | Ya está en `domain/services/`. RF-PE-010 pide las competencias «agrupadas por atributo del graduado», que es exactamente lo que hace. |
| La clase base `EventoMedicion` → `EventoMejoraContinua` | Solo fija `entidad`; cada submódulo declara la suya. |

### Qué NO se comparte

`siguienteCodigo`. El de medición genera `PM-…`; el de evaluación genera `EV-…`
y cuenta su correlativo sobre otra tabla. Son dos funciones parecidas que no
deben fundirse: fundirlas obligaría a pasar el prefijo como parámetro, y un
prefijo como parámetro es cómo se acaba generando un `PM-` donde tocaba un `EV-`.

---

## 4. El modelo de datos

Una sola tabla nueva, en el esquema `mejora_continua`:

```prisma
model PlanEvaluacion {
  id             String   @id @default(uuid()) @db.Uuid
  planMedicionId String   @map("plan_medicion_id") @db.Uuid
  codigo         String   @unique @db.VarChar(80)
  version        Int      @default(1)
  estado         EstadoMedicion @default(BORRADOR)
  creadoEn       DateTime @default(now())  @map("creado_en")  @db.Timestamptz(6)
  actualizadoEn  DateTime @updatedAt       @map("actualizado_en") @db.Timestamptz(6)

  plan PlanMedicion @relation(fields: [planMedicionId], references: [id], onDelete: Restrict)

  @@index([planMedicionId])
  @@map("planes_evaluacion")
  @@schema("mejora_continua")
}
```

**No guarda tipo, ni meta, ni competencias, ni periodos.** Se leen del plan base
(§2). El enum `EstadoMedicion` se reutiliza tal cual: es el mismo esquema de
estados y ya vive en `mejora_continua`, así que aquí no hay el problema de
enums que no cruzan esquemas que sí tuvo `EstadoDocumentoMedicion`.

Se dejan fuera a propósito, porque son de 2c-D: `derivadoDeId` (versionado,
RF-PE-034), `aprobadoPorId` y `aprobadoEn` (RF-PE-042). Añadir tres columnas
anulables entonces es una migración trivial; añadirlas ahora es cargar con
campos que nada escribe ni lee.

### El índice parcial

```sql
CREATE UNIQUE INDEX evaluacion_una_vigente_por_medicion
  ON mejora_continua.planes_evaluacion (plan_medicion_id)
  WHERE estado = 'VIGENTE';
```

RF-PE-044 RN1: «Solo puede existir un plan de evaluación Vigente por plan de
medición». Se protege en la base y no solo en el dominio, igual que
`medicion_una_vigente_por_plan_y_tipo`. Va en SQL crudo dentro de la migración,
porque Prisma no expresa índices parciales.

---

## 5. Puertos: ninguno nuevo

`RepositorioPlanMedicionPort`, que ya existe, cubre todo lo que 2c-A necesita
del plan base:

| Necesidad | Método |
|---|---|
| RF-PE-001: listar bases elegibles (Aprobado o Vigente) | `listar({ estado })` |
| RF-PE-001 RN2: el tipo lo determina la base | `porId().tipo` |
| RF-PE-002: la meta heredada | `porId().meta` |
| RF-PE-010: las competencias | `porId().competenciaIds` + `ContenidoCurricularPort.competenciasDelPlan` + `agruparPorAtributo` |
| RF-PE-011: los periodos | `porId().periodos` |
| RF-PE-012: las celdas programadas | `matriz(id)` |

El caso de uso de evaluación recibe la **interfaz**, no la clase Prisma, igual
que hace el resto del módulo. Que medición y evaluación sean carpetas hermanas
del mismo módulo no autoriza a saltarse el puerto.

Se añade un puerto propio para lo suyo: `RepositorioPlanEvaluacionPort`, con
`listar`, `porId`, `vigenteDe`, `codigosDe`, `crear`, `cambiarEstado` y
`eliminar` — el gemelo del de medición, recortado a lo que
2c-A usa.

---

## 6. Casos de uso

Uno solo: **`GestionarPlanesEvaluacion`**, gemelo de `GestionarPlanesMedicion`.

| Método | RF | Nota |
|---|---|---|
| `basesElegibles(actor)` | 001 | Planes de medición en Aprobado o Vigente. |
| `crear(actor, { planMedicionId })` | 001, 002, 003 | Genera el código, nace en Borrador. Sin más datos generales: el tipo y la meta vienen de la base. |
| `porId(actor, id)` | 010, 011, 012 | Devuelve el plan con lo heredado ya resuelto: grupos de competencias, periodos y celdas programadas. |
| `listar(actor, filtro)` | 009, 043 | Filtros: plan de medición, tipo, estado, texto. El tipo filtra atravesando la relación, sin desnormalizar. |
| `vigenteDe(actor, planMedicionId)` | 044 | Cero o uno; el índice garantiza que no haya dos. |
| `eliminar(actor, id)` | 008 | Solo en Borrador, por `permiteEdicion`. |
| `transicionar(actor, id, accion, comentario?)` | 004, 005 | Reutiliza `intentarTransicion` compartido. |

### El código (RF-PE-003)

`EV-<código del plan de estudios>-<D|I>-v<n>` — por ejemplo
`EV-PE-ISI-2026-v2-D-v1`.

Calca la forma del código de medición cambiando el prefijo. **No se usa `PE-`**:
en este sistema `PE-` ya identifica un Plan de Estudios (`PE-ISI-2026-v2`), y
dos cosas distintas con el mismo prefijo en la misma pantalla se confunden. Y no
se encadena el código de la base —daría `EV-PM-PE-ISI-2026-v2-D-v1-v1`, veintinueve
caracteres repitiendo dos veces el plan de estudios—: cuál es su plan de medición
va como dato y está a un clic.

El correlativo `v<n>` se cuenta sobre los planes de evaluación cuya base tenga
ese plan de estudios y ese tipo. RN1: no editable a mano.

---

## 7. HTTP

| Método y ruta | RF |
|---|---|
| `GET /planes-evaluacion` (filtros por query) | 009, 043 |
| `POST /planes-evaluacion` | 001, 002, 003 |
| `GET /planes-evaluacion/:id` | 010, 011, 012 |
| `DELETE /planes-evaluacion/:id` | 008 |
| `POST /planes-evaluacion/:id/transiciones` | 005 |
| `GET /planes-medicion/:id/evaluacion-vigente` | 044 |
| `GET /planes-evaluacion/bases-elegibles` | 001 |

Se declara la ruta de bases elegibles **antes** que `/:id` en el controlador:
Nest resuelve por orden de declaración y `bases-elegibles` casaría con
`ParseUUIDPipe` de `:id` y devolvería un 400 confuso.

---

## 8. Pantallas

Dos, calcando las de medición:

- **Listado** (`/mejora-continua/evaluacion`) con filtros por plan de medición,
  tipo y estado, y alta desde un modal que pide solo el plan de medición base
  —el tipo y la meta se muestran, no se eligen (RF-PE-001 RN2)—.
- **Detalle** (`/mejora-continua/evaluacion/:id`) con los datos generales, el
  estado y sus transiciones, y las competencias agrupadas por atributo y los
  periodos, **en solo lectura**, con la marca de qué combinaciones están
  programadas en la matriz base.

El detalle deja a la vista el hueco que 2c-B y 2c-C rellenan. Se enuncia en la
pantalla —«la configuración por competencia se añade en el siguiente ciclo»— en
vez de dejar una zona en blanco que parezca un fallo de carga.

Entrada de menú propia bajo Mejora Continua, junto a Planes de Medición.

---

## 9. Permisos y auditoría

Cinco permisos nuevos, en paralelo exacto a los de medición:

```
evaluacion.leer      Consultar planes de evaluación
evaluacion.crear     Crear un plan de evaluación
evaluacion.editar    Editar un plan de evaluación en Borrador
evaluacion.eliminar  Eliminar un plan de evaluación en Borrador
evaluacion.aprobar   Aprobar, observar y dar vigencia a un plan de evaluación
```

Asignados a los mismos roles que hoy tienen los de medición, de modo que nadie
note el cambio:

| Rol | Permisos |
|---|---|
| `ADMIN_SISTEMA` | `evaluacion.leer` |
| `DIRECTOR_CARRERA` | los cinco |
| `COORDINADOR_ACADEMICO` | leer, crear, editar, eliminar — **no** aprobar |
| `DOCENTE` | `evaluacion.leer` |
| `USUARIO_CONSULTOR` | `evaluacion.leer` |

Que el Coordinador no apruebe no es un olvido: es la misma separación que ya lo
deja fuera de `plan.aprobar` y de `medicion.aprobar`. Quien construye no da el
visto bueno. Coincide con RF-PE-046, que restringe la aprobación al Director de
carrera.

Auditoría (RF-PE-048): eventos `evaluacion.creado`, `evaluacion.editado`,
`evaluacion.eliminado` y `evaluacion.transicionado`, con la misma forma que los
de medición y sobre la misma tabla append-only. Entidad `PlanEvaluacion`.

---

## 10. Errores

| Situación | Respuesta |
|---|---|
| El plan de medición base no está en Aprobado ni Vigente | 409, con el estado en el mensaje: «El plan de medición PM-… está en Borrador; solo se puede evaluar uno Aprobado o Vigente.» |
| Ya hay un plan de evaluación Vigente para ese plan de medición | 409. Lo rechaza el índice parcial y el repositorio traduce la violación a un error de negocio legible, sin filtrar el nombre del índice. |
| Editar o borrar fuera de Borrador | 409, con el estado en el mensaje. |
| El plan de medición base no existe | 404. |
| Transición no permitida por la máquina de estados | 409, con las transiciones que sí caben. |

---

## 11. Pruebas

| Nivel | Qué cubre |
|---|---|
| Unitarias de dominio | El código y su correlativo; que el prefijo sea `EV-` y nunca `PM-`; las transiciones (reutilizando las que ya existen). |
| Unitarias del caso de uso | Que una base no elegible se rechace; que el tipo y la meta salgan de la base y no del alta; que borrar exija Borrador; que cada permiso se compruebe. |
| Integración | El índice parcial deja convivir dos Borradores y rechaza el segundo Vigente; el `RESTRICT` impide borrar un plan de medición con evaluación colgando; el filtro por tipo atraviesa la relación correctamente. |
| E2E | Alta desde un plan de medición vigente, recorrido del ciclo de vida, y que el detalle muestre las competencias heredadas sin permitir tocarlas. |

Cada prueba nueva se comprueba por mutación antes de darla por buena: una
prueba que pasa con el comportamiento revertido no prueba nada. Esa práctica ya
destapó dos pruebas vacuas en el ciclo anterior.

---

## 12. Decisiones tomadas en este diseño

1. **Referenciar, no copiar** (§2). La base está congelada, así que la copia solo
   añadiría desincronización posible.
2. **Subcarpeta por submódulo** (§3), con el traslado de medición como primer
   commit, mecánico y aparte.
3. **Prefijo `EV-`** (§6), porque `PE-` ya es Plan de Estudios en este sistema.
4. **Permisos propios `evaluacion.*`** (§9), asignados hoy a los mismos roles, de
   modo que separar las dos responsabilidades más adelante no exija migrar nada.
5. **`derivadoDeId`, `aprobadoPorId` y `aprobadoEn` se dejan para 2c-D** (§4).

## 13. Lo que este diseño no resuelve

Tres decisiones que 2c-B y 2c-C tendrán que tomar, anotadas aquí para que no
sorprendan:

- **Qué es un «docente»** (RF-PE-018). No existe ninguna entidad de docente en el
  esquema. Texto libre, entidad nueva, o cuenta de usuario de `auth`.
- **Si las evidencias son archivos o enlaces** (RF-PE-020). El requisito dice
  «archivos o enlaces». Archivos significan subida —multipart, límites de tamaño,
  validación de tipo, servido— que hoy no existe en ninguna parte del proyecto;
  enlaces son un campo de texto. Es la mayor palanca de alcance del submódulo.
- **Asignaturas por el puerto** (RF-PE-016). `ContenidoCurricularPort` no las
  expone todavía; habrá que ampliarlo.
