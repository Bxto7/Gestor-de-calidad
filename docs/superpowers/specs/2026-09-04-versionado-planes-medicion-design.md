# Versionado e historial de planes de medición — Diseño

**Fecha:** 4 de septiembre de 2026
**Alcance:** RF-PM-030 a RF-PM-034 y RF-PM-039 del Módulo de Mejora Continua.

## 1. Por qué este ciclo existe

Hoy el submódulo de Planes de Medición es **un callejón sin salida**. `crear` rechaza dar de
alta cualquier plan si ya existe uno Vigente de ese plan de estudios y tipo, así que en cuanto
el primero entra en vigor no se puede hacer nada más con ese programa. Y RF-PM-007 ya remite a
RF-PM-030 cuando alguien intenta editar un plan Aprobado o Vigente: la aplicación sugiere una
salida que no existe.

Este ciclo construye esa salida.

## 2. Estado de partida verificado

Comprobado leyendo el código y consultando la base el 4 de septiembre de 2026:

| Hecho | Consecuencia |
|---|---|
| `PlanMedicion` tiene `version` pero no vínculo de linaje ni datos de aprobación | Hace falta migración |
| `crear` rechaza el alta si existe un Vigente (`gestionar-planes-medicion.use-case.ts:98`) | Hay que acotarlo: el índice parcial solo restringe filas VIGENTE |
| `marcar-vigente` no archiva al Vigente anterior | Marcar una segunda versión chocaría contra el índice |
| `siguienteCodigo` toma el mayor correlativo usado, no la cantidad | Sirve tal cual para las dos operaciones |
| La bitácora registra las cinco categorías que pide RF-PM-032, con usuario y fecha | **RF-PM-032 está construido** |
| El trigger `audit_log_append_only` rechaza UPDATE y DELETE | RF-PM-032 RN1 cumplida, verificada con un DELETE en transacción |
| `GET /bitacora?entidad=PlanMedicion&entidadId=…` ya existe | **Consultar el histórico tampoco hay que construirlo** |
| Ninguna pantalla consume ese endpoint | Falta solo la vista |

Las dos últimas filas corrigen el diseño que se presentó antes de comprobarlas: se había
propuesto un `GET /planes-medicion/:id/historico`, y eso habría contradicho una decisión ya
tomada. El controlador de bitácora dice explícitamente que cuelga de la raíz **y no de cada
entidad**. Se respeta.

## 3. Decisiones de diseño

### 3.1 Dos operaciones, un motor de copia

RF-PM-030 (nueva versión) y RF-PM-034 (duplicar) copian un plan a Borrador. Se diferencian en
tres cosas y solo tres:

| | Nueva versión | Duplicado |
|---|---|---|
| `derivadoDeId` | el id del origen | `null` |
| Marcas de `realizada` | se conservan | se descartan |
| Precondición | Aprobado, Vigente o Histórico | cualquier estado |

Meta, competencias, periodos con sus fechas de cierre y celdas programadas se copian en ambos.

El **qué se copia y qué no es regla de negocio**, así que vive en `domain/` como pide
CLAUDE.md §2, no en el repositorio. La pregunta «¿arrastra esta copia marcas de medición?» se
responde con una prueba unitaria de dos líneas; metida en el repositorio necesitaría una base
de datos para responderse.

Encima, dos casos de uso separados y no uno con bandera: tienen precondiciones distintas, y
una bandera las escondería dentro de un `if`. Cada uno emite su propio evento —
`medicion.version` y `medicion.duplicado`— porque en el histórico se leen distinto y **deben**
leerse distinto.

### 3.2 Las marcas de «realizada» no se duplican

Una marca de `realizada` es constancia de que una medición ocurrió, con usuario y fecha. Es
evidencia.

Una **nueva versión** corrige el mismo plan y sigue cubriendo los mismos periodos: descartar
lo ya medido borraría evidencia real. Un **duplicado** arranca un periodo de acreditación
nuevo: arrastrar las marcas afirmaría que se midió algo que todavía no ha ocurrido.

En un expediente de acreditación, lo segundo es peor que cualquier otro error de este ciclo.
Por eso es la prueba central del servicio de dominio y no una nota al pie.

### 3.3 El correlativo va en el código y en el campo, y coinciden

El código lleva el correlativo (`PM-PE-ISI-2026-v2-D-v3`) y el campo `version` lo repite. Si
un duplicado empezara en `version: 1`, su código diría `v3` y su campo `1`, y la pantalla
mostraría dos números que se contradicen.

Así que **las dos operaciones toman el siguiente correlativo** de su plan de estudios y tipo.
El linaje lo expresa `derivadoDeId`, no el número. Un duplicado es «el plan v3, que no
desciende de nadie».

El requerimiento no dice nada de esto; es una decisión de coherencia interna y queda anotada
en §8 como punto a validar.

### 3.4 El relevo al entrar en vigor es atómico

`marcar-vigente` archiva al Vigente anterior **en la misma transacción**. Dos escrituras
sueltas dejarían, ante un fallo entre medias, o el programa sin ningún plan vigente o dos a
la vez.

La alternativa —exigir archivar a mano antes— se descartó: abre una ventana en la que el
programa no tiene plan de medición activo, y si quien lo hace se distrae a mitad, esa ventana
no se cierra.

El evento de archivado lleva el motivo: *relevado por `PM-…-v3`*. Sin eso, la bitácora
muestra un archivado que nadie pidió y que dentro de un año nadie sabrá explicar.

### 3.5 Varias versiones en curso: se permiten

RF-PM-030 no dice qué pasa si alguien versiona dos veces el mismo plan sin haber terminado la
primera. Se permite: las dos nacen en Borrador, el índice parcial solo restringe filas
VIGENTE, y prohibirlo obligaría a una comprobación que el requerimiento no pide.

La consecuencia es que dos personas pueden estar corrigiendo el mismo plan en paralelo sin
enterarse. Se acepta a sabiendas: la alternativa —una sola versión viva por linaje— añade un
bloqueo que nadie ha pedido y que estorbaría el día que dos correcciones sean independientes.
Queda anotado en §8.

### 3.6 El guardián de `crear` se acota, no se quita

Pasa de «rechazar el alta si existe un Vigente» a «impedir que haya dos Vigentes». Es lo que
RF-PM-041 RN1 pide de verdad, y lo que el índice parcial ya imponía: la base siempre permitió
un Borrador junto a un Vigente. Era el guardián el que se pasaba de estricto.

## 4. Alcance

### Dentro

| RF | Qué se construye |
|---|---|
| RF-PM-030 | `generarNuevaVersion`: copia a Borrador con vínculo al origen |
| RF-PM-031 | `GET /planes-medicion/:id/versiones` y su sección en el detalle |
| RF-PM-032 | **Solo la vista.** El almacenamiento y la consulta ya existen |
| RF-PM-033 | **Nada nuevo salvo el enlace.** La máquina de estados ya cierra la edición fuera de Borrador; la lista de versiones de RF-PM-031 es por donde se llega a cada una |
| RF-PM-034 | `duplicarPlan`: copia independiente, sin vínculo y sin marcas |
| RF-PM-039 | `aprobadoPorId` y `aprobadoEn` en el plan, escritos al aprobar |
| — | El relevo atómico (§3.4) y el guardián acotado (§3.6) |

### Fuera

- **Exportación (RF-PM-027 a 029).** Es el ciclo B, y se apoya en tener versiones que exportar.
- **Comparar dos versiones lado a lado.** El documento no lo pide.
- **Cambiar el plan de estudios base al duplicar.** RF-PM-034 no lo menciona; duplicar copia
  dentro del mismo plan de estudios y los periodos se editan después.

## 5. Estructura

```
apps/api/
  prisma/migrations/…_versionado_medicion/         derivadoDeId, aprobadoPorId, aprobadoEn
                                                   (Prisma antepone la marca de tiempo)
  src/modules/mejora-continua/
    domain/services/copia-de-plan.ts               qué se copia y qué no
    application/use-cases/
      versionar-planes-medicion.use-case.ts        generarNuevaVersion, duplicarPlan
      gestionar-planes-medicion.use-case.ts        relevo atómico, guardián acotado, RF-PM-039
    application/ports/plan-medicion.port.ts        copiar, linaje, relevar
    infrastructure/persistence/                    implementación transaccional
    infrastructure/http/                           POST :id/versiones, POST :id/duplicados,
                                                   GET :id/versiones
apps/web/src/features/mejora-continua/
    components/LineaDeVersiones.tsx                RF-PM-031
    components/HistorialDelPlan.tsx                RF-PM-032, contra /bitacora
```

## 6. Errores

Los tres casos que el usuario puede provocar, con el motivo concreto que pide RNF08:

- Nueva versión desde un Borrador → «Solo se versiona un plan aprobado, vigente o histórico.
  Este está en Borrador y se puede editar directamente.»
- Marcar vigente cuando el relevo falla → la transacción entera se deshace y el plan sigue
  Aprobado, con el anterior intacto.
- Versionar un plan cuyo plan de estudios ya no existe → no puede ocurrir: `planEstudiosId`
  tiene clave foránea con `Restrict`.

## 7. Pruebas

| Nivel | Qué |
|---|---|
| Dominio | Qué copia y qué no. Las marcas de realizada son el caso central: una prueba por modo |
| Dominio | Precondiciones de cada operación |
| Integración | El relevo es atómico: tras marcar vigente, exactamente un Vigente |
| Integración | El linaje sobrevive al borrado de un plan intermedio (`SetNull`) |
| Integración | El índice parcial sigue impidiendo dos vigentes |
| E2E | Crear una versión desde un plan vigente y ver el linaje en pantalla |

## 8. Puntos que la universidad debe validar

- **El correlativo compartido (§3.3).** Un duplicado recibe el siguiente número de la serie
  aunque no descienda de nadie. Es coherente con el código, pero significa que la serie
  `v1, v2, v3` puede mezclar versiones y copias independientes. Si la universidad espera que
  el número exprese linaje, hay que separar código y versión.
- **El archivado automático (§3.4).** Marcar una versión como vigente archiva a la anterior
  sin preguntar. Queda en la bitácora con su motivo, pero nadie confirma el paso.
- **Varias versiones en curso (§3.5).** Dos personas pueden versionar el mismo plan a la vez
  sin verse. Si en la práctica eso genera trabajo perdido, la salida es avisar al abrir la
  segunda, no prohibirla.
