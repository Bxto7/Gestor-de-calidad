# Ciclo 2c-D (parcial) — La validación integral, RF-PE-041

**Fecha:** 9 de septiembre de 2026
**Requisito:** RF-PE-041 (uno), enganchado en `transicionar` de
`GestionarPlanesEvaluacion`.
**Parte de:** submódulo Plan de Evaluación, tras 2c-A (el plan existe), 2c-B
(configuración directa) y 2c-C (configuración indirecta y alcance por
carrera).

---

## 1. Qué construye este ciclo, y qué no

**Importante sobre el nombre.** El reparto original (2c-A §1) llamaba «2c-D»
al cierre completo del submódulo: generación y exportación (RF-PE-031 a 033),
versionado e historial (034 a 037), aprobación con validación (038 a 042) —
doce requisitos. Este documento **no es ese cierre**. Cubre un único
requisito, RF-PE-041, porque es el único que el código ya señalaba como
pendiente con una cita explícita (`gestionar-planes-evaluacion.use-case.ts`,
el comentario sobre `tieneBloqueos: false`). Quedan fuera, sin tocar:

- **RF-PE-038 y RF-PE-039 (enviar a revisión, aprobar) no se construyen
  aquí porque ya existen.** Son las acciones `enviar-a-revision` y `aprobar`
  de la máquina de estados compartida (`mejora-continua/domain/value-objects/
  estado-plan.ts`), construida en 2c-A y reutilizada tal cual por
  `medicion` y `evaluacion`. Las dos ya declaran `exigeSinBloqueos: true`;
  lo único que faltaba era que algo real llenara ese `tieneBloqueos`.
- **RF-PE-040 (rechazar/observar)** tampoco se construye: es la acción
  `observar`, ya en la misma máquina de estados desde 2c-A.
- **RF-PE-031 a 037** (generación, Excel, PDF, versionado, histórico) y
  **RF-PE-042** (registrar responsable y fecha de aprobación) siguen
  pendientes. `RepositorioPlanEvaluacionPort.cambiarEstado(id, estado)` no
  admite `actorId`/`fecha` — a diferencia de su gemelo de medición, que sí
  los captura en `aprobar` desde RF-PM-039 — y esta tarea no lo amplía: no es
  RF-PE-041 y ampliar el puerto sin construir lo que lo consume sería alcance
  nuevo no pedido.
- **No se añade ningún endpoint HTTP nuevo.** `medicion` expone
  `GET /planes-medicion/:id/consistencia` para que la pantalla muestre el
  reporte antes de intentar transicionar (`PanelConsistencia.tsx`). Construir
  el equivalente para evaluación —controlador, DTO, pantalla— es trabajo de
  interfaz que nadie pidió en este ciclo; se deja apuntado en §6 para quien
  continúe. El reporte consolidado sigue existiendo: viaja en el mensaje de
  la excepción que lanza `transicionar` (§4), que es el punto de enganche que
  este ciclo sí tenía que resolver.

**2c-D (parcial) termina cuando** enviar a revisión o aprobar un plan de
evaluación con datos incompletos falla con un mensaje que nombra cada
inconsistencia, y con datos completos (o sin nada registrado todavía, por
RN2) la transición ocurre igual que antes.

---

## 2. El motor de validaciones: gemelo del de medición, reglas propias

`medicion/domain/services/motor-de-consistencia.ts` ya resuelve RF-PM-038
con el patrón exacto que CLAUDE.md §2 pide para el motor de validaciones: un
servicio de dominio puro, sin NestJS ni Prisma, que devuelve **todos** los
hallazgos de una vez en vez de lanzar en el primero. No hay un motor
compartido en `mejora-continua/domain/` — a propósito, igual que
`estado-plan.ts` no se comparte con el de Plan de Estudios: las reglas de
`medicion` (competencias, periodos, programación, fecha de cierre) y las de
`evaluacion` (instrumento, frecuencia, responsable, entregable, docente) no
tienen ni una regla en común. Fundirlas en un motor genérico obligaría a un
parámetro de reglas activables, y ese parámetro es exactamente cómo se acaba
validando lo que no toca.

**Decisión: un motor nuevo, `evaluacion/domain/services/motor-de-
consistencia.ts`, con el mismo vocabulario (`Hallazgo`, `Severidad`,
`ResultadoConsistencia`, bloqueante/advertencia) pero su propia entrada y sus
propias reglas.**

### 2.1. Qué valida, y por qué eso y no más

RF-PE-041 dice, literal: «instrumento, frecuencia y responsable (cuando
aplique) definidos por competencia, y datos obligatorios (entregable,
docente) en cada asignatura asociada». Cinco campos, cinco reglas:

| Campo | Aplica a | RF que lo define | RF que lo exige al validar |
|---|---|---|---|
| Instrumento | Toda competencia configurada | RF-PE-013 (Directa) / RF-PE-022 (Indirecta) | RF-PE-041 |
| Frecuencia | Toda competencia configurada | RF-PE-014 (Directa) / RF-PE-023 (Indirecta) | RF-PE-041 |
| Responsable | Competencia configurada, **solo si el plan es Indirecta** | RF-PE-024 | RF-PE-041 |
| Entregable | Toda asignatura asociada | RF-PE-017 | RF-PE-041 |
| Docente | Toda asignatura asociada | RF-PE-018 | RF-PE-041 |

**El «cuando aplique» del responsable no es ambiguo: RF-PE-024 se titula
literal «Establecer el responsable de cada competencia (**Indirecta**)».**
No hay campo equivalente en RF-PE-013/014 para la Directa. Por eso el motor
solo exige `responsableId` cuando `tipo === 'INDIRECTA'` — un plan Directa
nunca genera ese hallazgo, tenga o no la columna rellena (es la misma
columna compartida de `ConfiguracionCompetencia` que 2c-C describió; en una
Directa simplemente no se usa).

**El instrumento y la frecuencia se citan por tipo, igual que hace el motor
de medición con los periodos** (`RF-PM-016` vs `RF-PM-020` según Directa o
Indirecta): son el mismo campo físico (`ConfiguracionCompetencia.instrumento`
/ `.frecuencia`), pero el requisito que los define es distinto según el tipo
de plan, y un hallazgo que cita el requisito equivocado es peor que uno
genérico.

**Entregable y docente solo aplican a asignaturas, que solo existen en un
plan Directa** — `exigirTipo` en `configurar-plan-evaluacion.use-case.ts` ya
impide que una Indirecta acumule asignaturas. El motor no necesita una rama
por tipo para estas dos reglas: si el plan es Indirecta, la lista de
asignaturas a validar llega vacía por construcción, no porque el motor lo
sepa.

### 2.2. RN2 es la regla que decide qué se recorre, no una excepción aparte

«No exige que todos los periodos/años estén completos (registro progresivo
permitido); solo valida la completitud de lo ya registrado.»

El motor de medición recorre **el catálogo completo** de competencias y
periodos del plan (los trae `ContenidoCurricularPort` / el plan base) y
señala lo que falta — porque RF-PM-038 sí exige que todo el conjunto
programado esté cubierto. RF-PE-041 pide lo contrario: no repetir «faltan
competencias» o «faltan periodos», eso ya lo filtra RF-PE-012 impidiendo
configurar donde la base no programó, y ya lo exige (sobre la base) el motor
de medición. Lo que RF-PE-041 valida es **la completitud de las filas que el
usuario ya creó**, no la cobertura del universo de filas posibles.

Por eso el motor de evaluación **no recibe el catálogo de competencias
programadas ni la matriz de periodos**: recibe únicamente las filas que ya
existen —`ConfiguracionCompetencia` guardada, `AsignaturaEvaluada`
guardada— y comprueba sus campos. Una competencia sin ninguna fila
configurada, o un cruce competencia×periodo sin ninguna asignatura asociada,
no genera ningún hallazgo: no es una inconsistencia, es trabajo que
todavía no empezó, y RN2 lo protege explícitamente.

Esto también evita duplicar `exigirCruceProgramado`: las filas que llegan al
motor ya pasaron esa comprobación al guardarse (`configurar-plan-evaluacion.
use-case.ts`), así que no puede haber una fila «huérfana» que el motor deba
descubrir por su cuenta.

### 2.3. La entrada y la forma del resultado

```typescript
export interface CompetenciaConfiguradaParaValidar {
  readonly competenciaId: string;
  readonly codigo: string;   // para nombrar el hallazgo, no el UUID
  readonly nombre: string;
  readonly instrumento: string | null;
  readonly frecuencia: string | null;
  readonly responsableId: string | null;
}

export interface AsignaturaEvaluadaParaValidar {
  readonly id: string;
  readonly competenciaCodigo: string;
  readonly periodoEtiqueta: string;
  readonly asignaturaCodigo: string;
  readonly asignaturaNombre: string;
  readonly entregable: string;
  readonly docenteId: string | null;
}

export interface EntradaConsistenciaEvaluacion {
  readonly tipo: 'DIRECTA' | 'INDIRECTA';
  readonly competencias: readonly CompetenciaConfiguradaParaValidar[];
  readonly asignaturas: readonly AsignaturaEvaluadaParaValidar[];
}
```

`ResultadoConsistencia`, `Hallazgo` y `Severidad` se declaran de nuevo en
este fichero (no se importan del motor de medición): son la misma forma por
convención de vocabulario del proyecto, no el mismo tipo compartido. Ninguna
de las dos reglas de "no compartir" de §2 cambia por que la forma del
resultado coincida.

Cada hallazgo trae `afectados` en texto legible, igual que el motor de
medición y por la misma razón (comentario de `Hallazgo.afectados` en
`motor-de-consistencia.ts` de medición): un UUID no le dice a nadie qué
corregir. Para una asignatura, el descriptor es
`«<código asignatura> · <código competencia> · <etiqueta del periodo>»`,
porque RF-PE-018 dice explícitamente que el docente «puede variar de un
periodo a otro, aun para la misma asignatura» — el mismo código de
asignatura puede aparecer varias veces en la lista de afectados, una por
cada cruce donde le falte el dato, y hay que poder distinguirlas.

---

## 3. Dónde vive la resolución de nombres

El motor es puro: recibe códigos y nombres ya resueltos, no identificadores
sueltos. Resolverlos es responsabilidad de quien llama, igual que en
medición (`GestionarPlanesMedicion.evaluar`, privado). Un método privado
`evaluar` nuevo en `GestionarPlanesEvaluacion`:

1. Lee `RepositorioConfiguracionEvaluacionPort.del(plan.id)` — las tres
   listas que 2c-B y 2c-C ya escriben: `competencias`, `mediciones`
   (de las que cuelgan las `asignaturas`), `indicaciones` (que el motor no
   usa: RF-PE-041 no menciona indicaciones).
2. Lee `ContenidoCurricularPort.competenciasDelPlan` y `.asignaturasDelPlan`
   sobre `base.planEstudiosId`, para los códigos y nombres — las mismas dos
   llamadas que ya hace `configurar-plan-evaluacion.use-case.ts` en otros
   métodos, así que no es tráfico nuevo de un tipo que el módulo no
   tuviera ya.
3. Empareja por `id`, con el mismo resguardo que usa el motor de medición
   para una competencia retirada del plan de estudios después de
   programarse: si el catálogo ya no la tiene, se nombra con el propio `id`
   y `"ya no está en el plan de estudios"`, en vez de fallar.
4. Aplana `mediciones[].asignaturas[]` en una sola lista, arrastrando el
   código de competencia y la etiqueta de periodo de la medición que la
   contiene.
5. Llama a `validarConsistenciaEvaluacion({ tipo: base.tipo, competencias,
   asignaturas })`.

### Por qué `GestionarPlanesEvaluacion` necesita un puerto nuevo

Hoy su constructor es `(evaluaciones, mediciones, curricular, autorizacion,
eventos)` — no conoce `RepositorioConfiguracionEvaluacionPort`, porque hasta
ahora no necesitaba leer configuración, solo el plan y su base. Gana un
sexto argumento, `configuraciones`, en la misma posición relativa que ocupa
en `ConfigurarPlanEvaluacion` (justo después de `curricular`, antes de
`autorizacion`). Es un cambio de firma con un solo punto de instanciación
—`app.module.ts`, `useFactory`— y el mismo repositorio Prisma que
`ConfigurarPlanEvaluacion` ya usa: no hay implementación nueva que escribir,
solo una inyección más.

Se descartó duplicar la lectura de configuración en un caso de uso propio de
«validación», o fusionar `GestionarPlanesEvaluacion` con
`ConfigurarPlanEvaluacion`: la primera opción es leer la misma tabla dos
veces con dos repositorios distintos por evitar tocar un constructor; la
segunda mezclaría en una sola clase «el ciclo de vida del plan» y «su
configuración por competencia», que hoy están separados a propósito (el
comentario de cabecera de `configurar-plan-evaluacion.use-case.ts` explica
por qué existe aparte).

---

## 4. El enganche en `transicionar`, y el reporte en la excepción

Hoy (`gestionar-planes-evaluacion.use-case.ts:212-216`):

```typescript
const r = intentarTransicion(plan.estado, accion, {
  tieneBloqueos: false,   // ← RF-PE-041, pendiente
  comentario: contexto.comentario,
});
if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);
```

Pasa a, calcando la condicional de `GestionarPlanesMedicion.transicionar`
—**la validación solo se ejecuta si la transición la exige**, para no
recalcularla en `observar` o `marcar-vigente`, que no la piden—:

```typescript
const resultado = transicion.exigeSinBloqueos
  ? await this.evaluar(plan, base)
  : null;

const r = intentarTransicion(plan.estado, accion, {
  tieneBloqueos: resultado?.tieneBloqueos ?? false,
  comentario: contexto.comentario,
});
if (!r.ok) {
  throw new ReglaDeNegocioViolada(
    resultado?.tieneBloqueos ? mensajeDeInconsistencias(resultado) : r.motivo,
  );
}
```

**Por qué el mensaje no es siempre `r.motivo`.** `intentarTransicion` es
compartida con medición y devuelve, para el caso de bloqueos, un texto
genérico: «Hay inconsistencias bloqueantes sin resolver. Corrígelas para
continuar.» — sin nombrar ninguna. Es la función correcta para decidir *si*
la transición procede (no se toca; es de `mejora-continua/domain/`,
compartida, y tocarla afecta a medición sin necesidad). Lo que hace falta es
que **cuando** el motivo del rechazo sea justo ese, el caso de uso lo
reemplace por el reporte consolidado antes de lanzarlo. Es la instrucción
explícita de esta tarea: el frontend tiene que recibir algo útil sin una
llamada aparte, porque este ciclo no construye el endpoint de consulta que
sí existe para medición (§1).

`mensajeDeInconsistencias` es un privado de una línea de intención:

```typescript
/**
 * RF-PE-041: el mensaje que ve el frontend cuando la transición se rechaza
 * por bloqueos. `intentarTransicion` solo sabe decir "hay bloqueos"; aquí se
 * nombra cada uno, porque este ciclo no construye (todavía) el endpoint de
 * consulta que medición sí tiene para mostrar el reporte antes de intentar
 * transicionar.
 */
private mensajeDeInconsistencias(resultado: ResultadoConsistenciaEvaluacion): string {
  const detalle = resultado.bloqueantes
    .map((h) => `${h.titulo} (${h.afectados.join(', ')})`)
    .join('; ');
  return `Hay inconsistencias bloqueantes sin resolver: ${detalle}.`;
}
```

**No se duplica auditoría.** `PlanEvaluacionTransicionado` no se emite
—la transición falló, nada cambió de estado—; el error mismo es lo que le
llega a quien llamó. Es la misma propiedad que ya tiene el resto del caso de
uso: nada se publica si `intentarTransicion` devuelve `ok: false`.

---

## 5. Los errores

| Situación | Código | Mensaje |
|---|---|---|
| Enviar a revisión o aprobar con inconsistencias bloqueantes | 409 | Lista cada regla incumplida y sus afectados (§4) |
| Cualquier otro rechazo de `intentarTransicion` (estado incorrecto, falta comentario) | 409 | El motivo genérico de siempre, sin cambios |
| Un plan sin nada configurado todavía | — | La transición **no** se bloquea: RN2 |

---

## 6. Las pruebas

| Nivel | Qué cubre |
|---|---|
| Unitarias del motor | Las cinco reglas, una por una, con y sin el tipo que las activa; que una fila sin registrar no genera hallazgo (RN2); el resultado consolidado (varias reglas rotas a la vez, bloqueantes vs. advertencias — aquí todas son bloqueantes, pero la forma se mantiene) |
| Unitarias del caso de uso | Que `transicionar` con `enviar-a-revision` o `aprobar` y datos incompletos rechace citando el detalle; que `observar` y `marcar-vigente` no disparen el motor (no lo necesitan); que datos completos permitan la transición; que sin ninguna fila configurada la transición también proceda (RN2); que el mensaje no incluya UUID |

No hay pruebas de integración ni E2E nuevas en este ciclo: no cambia el
esquema ni ningún endpoint HTTP, así que no hay superficie nueva que esas
capas deban cubrir. Cobertura ≥80% en `domain/` y `application/` del
submódulo, como exige CLAUDE.md §2.

---

## 7. Decisiones tomadas, con lo que cuestan si son erróneas

1. **Un motor nuevo y no uno compartido con medición.** Si en el futuro
   aparecen reglas genuinamente comunes, extraerlas es una función más, no
   una reescritura: hoy el conjunto de reglas no se solapa en absoluto.
2. **El motor recorre solo lo ya registrado, no el catálogo completo (RN2).**
   Si el negocio decide más adelante que sí hace falta cobertura total antes
   de aprobar, es una lista adicional de "lo que falta configurar del todo"
   —una regla nueva, no un rediseño— y probablemente entra junto con
   RF-PE-042.
3. **El responsable se exige solo en Indirecta.** Si algún día una Directa
   también lo usara, es una condición menos en el motor, no una migración.
4. **El reporte viaja en el mensaje de la excepción, no en un endpoint de
   consulta aparte.** Es la instrucción explícita de este ciclo y evita
   construir superficie HTTP/UI no pedida. El costo es que el frontend no
   puede mostrar el reporte *antes* de que el usuario intente transicionar
   —solo después, al recibir el 409—, a diferencia de `PanelConsistencia`
   en medición. Si se quiere paridad, el ciclo que construya
   `GET /planes-evaluacion/:id/consistencia` reutiliza el mismo `evaluar`
   privado, ya escrito: solo hace falta exponerlo.
5. **`GestionarPlanesEvaluacion` gana un sexto argumento de constructor.**
   Es un cambio de firma con un único punto de instanciación
   (`app.module.ts`), y el repositorio ya existe. El costo es una prueba
   unitaria más de doble por actualizar en el `montar()` del spec existente.
