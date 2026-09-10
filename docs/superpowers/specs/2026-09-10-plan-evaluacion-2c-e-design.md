# Ciclo 2c-E — Cerrar el submódulo Plan de Evaluación

**Fecha:** 10 de septiembre de 2026
**Requisitos:** RF-PE-031 a 037 y RF-PE-042 (ocho).
**Cierra:** el submódulo Plan de Evaluación, en 49 de 49.
**Viene de:** 2c-A (el plan existe), 2c-B (configuración directa), 2c-C
(configuración indirecta y alcance por carrera) y 2c-D (validación integral).

---

## 1. Qué construye este ciclo, y qué resultó estar hecho

El ciclo cierra la vida del documento: **generarlo, exportarlo, versionarlo y
dejar constancia de quién lo aprobó**.

### 1.1 Tres requisitos ya estaban construidos

`RF-PE-038` (enviar a revisión), `RF-PE-039` (aprobar) y `RF-PE-040` (rechazar u
observar con comentarios) **funcionan desde el ciclo 2c-A**, sin comentario que
los nombre. `gestionar-planes-evaluacion.use-case.ts:200` expone:

```ts
async transicionar(
  actor: Actor,
  id: string,
  accion: AccionMedicion,
  contexto: { comentario?: string },
): Promise<DatosPlanEvaluacion>
```

`AccionMedicion` —en `mejora-continua/domain/value-objects/estado-plan.ts`,
compartido por los dos submódulos— acepta `'enviar-a-revision' | 'aprobar' |
'observar' | 'marcar-vigente' | 'archivar'`, y el `comentario` del contexto es
justo lo que `RF-PE-040` pide.

**Consecuencia para el recuento:** al cerrar este ciclo, `RF-PE` no pasa de 38 a
46 sino a **49 de 49**, y los tres se anotan en la lista de «construido sin
cita» de `CLAUDE.md`, junto a los siete que ya están ahí.

### 1.2 Y un cuarto sale casi gratis

`RF-PE-036` (histórico de modificaciones) **no necesita tabla, ni puerto, ni
caso de uso nuevo**. El mecanismo se construyó para su gemelo `RF-PM-032` y
está en `consultar-bitacora.use-case.ts:64`:

> «`auditoria.leer_entidad` da **una sola entidad, y hay que saber su id**. Es
> lo que necesita quien abre un plan de medición y quiere ver qué se hizo sobre
> él.»

La pantalla del plan consulta `GET /auditoria?entidad=PlanEvaluacion&entidadId=<id>`.
La bitácora es append-only por diseño —§4.3 no permite `UPDATE` ni `DELETE` ni a
nivel de rol de base de datos—, que es exactamente lo que exige la RN1 de
`RF-PE-036`.

**Lo único que hay que verificar** es que el rol Coordinador Académico tenga
`auditoria.leer_entidad`. Sin él, quien más edita estos planes no ve su propio
historial — el mismo hueco que el comentario de arriba describe para medición.

### 1.3 El trabajo real

| Bloque | Requisitos | Tamaño |
|---|---|---|
| Generación y exportación | `031`, `032`, `033` | El grueso: tabla, armador, renderizadores, cola, endpoints |
| Versionado e historial | `034`, `035`, `037` | Medio: una relación reflexiva y un caso de uso |
| Responsable y fecha | `042` | Dos columnas y su cableado |
| Histórico | `036` | Una pestaña que consulta la bitácora |

---

## 2. La exportación

### 2.1 El esquema

Calca `DocumentoMedicion`, que ya pasó revisión en el ciclo de exportación de
medición:

```prisma
enum TipoDocumentoEvaluacion {
  PLAN_EVALUACION_PDF
  PLAN_EVALUACION_EXCEL

  @@schema("mejora_continua")
}

enum EstadoDocumentoEvaluacion {
  EN_COLA
  GENERANDO
  LISTO
  FALLIDO

  @@schema("mejora_continua")
}

model DocumentoEvaluacion {
  id               String                    @id @default(uuid()) @db.Uuid
  planEvaluacionId String                    @map("plan_evaluacion_id") @db.Uuid
  tipo             TipoDocumentoEvaluacion
  estado           EstadoDocumentoEvaluacion @default(EN_COLA)

  nombreArchivo String? @map("nombre_archivo") @db.VarChar(200)
  tipoMime      String? @map("tipo_mime") @db.VarChar(120)
  bytes         Int?
  /// Opaca a propósito: hoy una ruta en disco, mañana una clave de Backblaze B2
  /// (§5.6), sin que cambie nada más. No sale nunca en el objeto que viaja al
  /// navegador: se lee por su método.
  ubicacion     String? @db.VarChar(500)
  /// Solo con estado FALLIDO. Redactado para una persona, no una traza.
  error         String? @db.Text

  /// Sin clave foránea a usuarios, igual que el resto de la evidencia: el
  /// registro debe seguir siendo legible aunque la cuenta desaparezca.
  solicitadoPor String    @map("solicitado_por") @db.Uuid
  solicitadoEn  DateTime  @default(now()) @map("solicitado_en") @db.Timestamptz(6)
  terminadoEn   DateTime? @map("terminado_en") @db.Timestamptz(6)

  plan PlanEvaluacion @relation(fields: [planEvaluacionId], references: [id], onDelete: Cascade)

  /// El listado va del más reciente al más antiguo, y siempre de un plan.
  @@index([planEvaluacionId, solicitadoEn])
  @@map("documentos_evaluacion")
  @@schema("mejora_continua")
}
```

**Enums propios y no compartidos con medición**, aunque los valores rimen: son
dos ciclos de vida documentales distintos que pueden divergir —el día que
evaluación exporte un tercer formato, medición no tiene por qué enterarse—, y
un enum compartido entre submódulos es acoplamiento disfrazado de reutilización.

### 2.2 Dónde vive el contenido

`evaluacion/domain/documentos/armar-documento-evaluacion.ts`, espejo de
`medicion/domain/documentos/armar-documento-medicion.ts`.

**El armador decide qué dice el documento; los renderizadores solo lo dibujan.**
Es la separación que `CLAUDE.md` §4.2 justifica para poder cambiar `pdfkit` por
otra cosa sin reescribir nada: sería un adaptador nuevo, no una reescritura. Y
tiene un efecto práctico inmediato — el contenido se prueba entero sin tocar
`pdfkit` ni `exceljs`.

**La diferencia real con el gemelo:** el documento debe cubrir **los dos tipos
de plan**. Un plan directo se organiza por periodo, con asignaturas, entregables
y docente responsable; uno indirecto por año, con indicaciones por grupo
objetivo. El armador ramifica una vez, por `base.tipo`, y produce la misma forma
de salida para que los renderizadores no sepan de tipos.

**RN1 de `RF-PE-031` y `RF-PE-032`: se exporta lo que hay,** incluidos los
periodos o años incompletos. El documento no valida ni exige completitud — eso
es cosa de `RF-PE-041`, que ya existe y solo corre antes de aprobar.

**RN1 de `RF-PE-033`:** el PDF lleva en su encabezado el código, el tipo y el
estado del plan.

### 2.3 Fuera del hilo de la petición

`encolar` crea el trabajo en `EN_COLA` y devuelve; el worker que ya existe lo
consume y llama a `ejecutar`. Es lo que cumple el RNF de menos de 5 s, y lo que
hace que un fallo tenga que **guardarse como estado** en vez de devolverse: no
hay ninguna petición HTTP viva a la que contestarle.

Los métodos calcan los de `generar-documento-medicion.use-case.ts`: `encolar`,
`ejecutar`, `estado`, `listarDePlan` y `descargar`.

### 2.4 La divergencia que se registra

`RF-PE-032` RN2 y `RF-PE-033` RN2 exigen «formato igual al formato institucional
utilizado actualmente». **Esa plantilla no está en el repositorio.** Se calca el
formato de medición, que ya pasó revisión, y la divergencia se anota en
`docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md` con el mismo formato que
D-10 y D-13, marcada PENDIENTE: el día que aparezca la plantilla real, cambia el
armador y nada más.

---

## 3. El versionado

### 3.1 El esquema

`PlanEvaluacion` ya tiene `version Int @default(1)`, pero nada genera la segunda.
Gana la relación reflexiva que `PlanMedicion` ya tiene:

```prisma
  derivadoDeId String? @map("derivado_de_id") @db.Uuid
  derivadoDe   PlanEvaluacion?  @relation("VersionesEvaluacion", fields: [derivadoDeId], references: [id], onDelete: SetNull)
  derivados    PlanEvaluacion[] @relation("VersionesEvaluacion")
```

`SetNull` y no `Cascade`: borrar una versión no puede llevarse su descendencia.

### 3.2 Qué se copia, y qué no

**Solo la definición.** La versión nueva nace en `Borrador` con:

- `ConfiguracionCompetencia` — instrumento, frecuencia y responsable
- `AsignaturaEvaluada` — asignatura, entregable y docente
- `IndicacionDeMedicion` — grupo objetivo, instrucción y enlace al instrumento

**No se copian** el porcentaje alcanzado de `MedicionAlcanzada`, las
`Evidencia` de cada entregable, ni el `enlaceResultados` de cada indicación.

La razón es la misma frontera que rige la edición desde 2c-B: **el seguimiento
es lo que fue ocurriendo en un periodo concreto.** Copiarlo a una versión nueva
inventaría mediciones que nadie tomó, y dejaría el mismo porcentaje registrado
en dos planes sin forma de saber cuál es el bueno.

Las filas de `MedicionAlcanzada` **sí se crean**, vacías, para los cruces que la
matriz base programa — porque son la rejilla sobre la que se registra, no el
dato registrado.

**RN2 de `RF-PE-034`: la versión original no se toca.** La copia es una
transacción que solo escribe filas nuevas.

### 3.2.1 Por qué esto se aparta del gemelo, a propósito

`versionar-planes-medicion.use-case.ts:44` documenta lo contrario para su
`generarNuevaVersion`: *«copia con vínculo al origen, **conservando las marcas
de medición**»*. Quien revise este ciclo verá la asimetría y hay que explicarla
antes de que parezca un descuido.

No son la misma cosa. La «marca de medición» de un plan de medición es el
booleano `realizada` de una `Programacion`: dice **qué se planificó medir**, y
arrastrarlo a la versión nueva conserva el plan de trabajo. El porcentaje
alcanzado de una `MedicionAlcanzada` dice **cuánto se midió de verdad en ese
periodo**: es un resultado, no una intención.

Medición tiene además `duplicarPlan`, que existe precisamente para copiar «sin
marcas de medición». Evaluación no necesita las dos variantes porque su
respuesta a esa pregunta es siempre la misma.

### 3.2.2 Desde qué estados

Se reutiliza `permiteVersionado`, el predicado que ya vive en el value object
compartido y que admite **aprobado, vigente o histórico** — tres estados, no
dos. Un `Borrador` no se versiona porque se edita directamente, y el mensaje de
error debe decir eso y no solo «no se puede», como ya hace el de medición.

### 3.3 Lo que sale casi gratis

`RF-PE-035` es listar los derivados de un plan ordenados por versión
descendente. `RF-PE-037` es abrir uno histórico sin nada editable, y eso ya
funciona: `permiteEdicion` devuelve falso para todo lo que no sea `Borrador`, y
las dos pantallas de configuración ya lo consultan.

El caso de uso se llama `versionar-planes-evaluacion.use-case.ts` y expone
`generarNuevaVersion(actor, id)`, espejo del de medición. **No se calca
`duplicarPlan`**: medición lo tiene porque un plan de medición se copia entre
carreras, y un plan de evaluación cuelga siempre de un plan de medición
concreto. YAGNI.

---

## 4. Responsable y fecha de aprobación

`PlanEvaluacion` gana las dos columnas que `PlanMedicion` ya tiene bajo
`RF-PM-039`:

```prisma
  /// RF-PE-042: quién aprobó y cuándo. Está también en la bitácora, pero ahí es
  /// un evento entre miles; aquí es un dato del plan que la pantalla enseña sin
  /// consultar otro módulo.
  aprobadoPorId String?   @map("aprobado_por_id") @db.Uuid
  aprobadoEn    DateTime? @map("aprobado_en") @db.Timestamptz(6)
```

Se rellenan en la transición `aprobar` y **no se borran** al pasar a `Vigente` o
`Histórico`: son el registro de quién autorizó ese documento.

Una nueva versión nace con las dos en `null` — no hereda la aprobación de su
antecesora, que es el punto entero de versionar.

---

## 5. Los endpoints

Calcan la superficie de medición.

| Verbo y ruta | Requisito |
|---|---|
| `POST /planes-evaluacion/:id/documentos` | `031`, `032`, `033` — encola, cuerpo `{ tipo }` |
| `GET /planes-evaluacion/:id/documentos` | Los trabajos del plan, del más reciente al más antiguo |
| `GET /documentos-evaluacion/:trabajoId` | El estado de un trabajo |
| `GET /documentos-evaluacion/:trabajoId/archivo` | La descarga |
| `POST /planes-evaluacion/:id/versiones` | `034` — genera la versión nueva |
| `GET /planes-evaluacion/:id/versiones` | `035` — el linaje, de más reciente a más antigua |

La descarga **no se hace con un `<a href>`**: el token vive en `sessionStorage` y
un enlace directo daría 401. Se pide con `fetch`, se recibe un blob y se guarda
con `guardarArchivo`, que ya existe en `shared/api/cliente`. Es un error que este
proyecto ya pagó una vez en el ciclo de exportación de medición.

---

## 6. Permisos

Nada nuevo. `evaluacion.leer` para consultar y descargar, `evaluacion.crear`
para generar una versión, `evaluacion.editar` para encolar un documento, y
`evaluacion.aprobar` para la transición que rellena `RF-PE-042`.

Los cuatro de escritura **ya están acotados a la carrera** desde 2c-C, así que
las vías nuevas lo heredan: resolver la carrera del plan antes de `exigir`, con
el `carreraDe` que ya existe en cada caso de uso.

**Lo que sí hay que comprobar** es el permiso `auditoria.leer_entidad` en el rol
Coordinador Académico, para que `RF-PE-036` funcione para quien más edita estos
planes.

---

## 7. Los errores

| Situación | Código |
|---|---|
| Tipo de documento desconocido | 400 |
| Encolar sobre un plan que no existe | 404 |
| Descargar un trabajo que no está `LISTO` | 409, nombrando el estado |
| Versionar un `Borrador` o un plan `En revisión` | 409, nombrando el estado y diciendo que un borrador se edita directamente |
| Operar sobre un plan de otra carrera | 403, el motivo que devuelve `puede()` |
| Un trabajo que no existe | 404 |

---

## 8. Las pruebas

| Nivel | Qué cubre |
|---|---|
| Unitarias | El armador, con los dos tipos de plan y con periodos incompletos; qué se copia y qué no al versionar; que `aprobar` rellena responsable y fecha |
| Integración | El ciclo de vida del trabajo (`EN_COLA` → `LISTO` / `FALLIDO`); que la ubicación no sale en el objeto; que la copia no toca el plan de origen |
| Autorización | Que las vías nuevas pasan la carrera del plan y no `null` |
| Componente | La pestaña de documentos y la de historial |
| E2E | Generar, esperar y descargar; generar una versión y comprobar que la original no cambió |
| Accesibilidad | Las pantallas nuevas entran en `accesibilidad.spec.ts`, con contenido real |

**El listón:** una prueba en verde no vale nada hasta saber por qué estaría en
rojo. Tres trampas que este proyecto ya pagó y que aquí vuelven a aplicar:

- **Una prueba que busca una tabla por su forma** —«la que tiene más de dos
  columnas»— puede engancharse a otra. Búscala por su título.
- **Un recorrido que no escribe nada** no distingue «no se copió» de «nunca
  existió». Al probar que el seguimiento no se copia, hay que **escribir**
  primero un porcentaje y una evidencia en el plan de origen.
- **El orden asíncrono real:** `onSettled` es `async` y se espera antes de que
  `mutateAsync` resuelva. Una prueba que reenderice después prueba el orden
  benigno.

---

## 9. Decisiones, con lo que cuestan si son erróneas

1. **El versionado copia solo la definición.** Si en la práctica se quiere
   arrastrar el seguimiento, es añadir la copia de tres tablas más; al revés
   habría que borrar datos duplicados sin saber cuáles eran los buenos.
2. **Enums de documento propios, no compartidos con medición.** Si los dos
   ciclos documentales nunca divergen, sobra un enum. Compartirlos habría atado
   dos submódulos por un detalle de infraestructura.
3. **No se calca `duplicarPlan`.** Un plan de evaluación cuelga siempre de un
   plan de medición concreto, así que duplicarlo entre carreras no significa
   nada. Si aparece el caso, es un método más.
4. **El formato de exportación se calca del de medición** y se registra como
   divergencia. Si la plantilla institucional resulta muy distinta, cambia el
   armador —no los renderizadores ni el esquema.
5. **`RF-PE-036` se resuelve consultando la bitácora,** sin tabla propia. Si
   algún día hace falta un histórico con campos que la bitácora no tiene, esa
   tabla se añade sin deshacer nada de esto.
