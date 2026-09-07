# Generación y exportación del plan de medición — Diseño

**Fecha:** 4 de septiembre de 2026
**Alcance:** RF-PM-027, RF-PM-028 y RF-PM-029 del Módulo de Mejora Continua.

## 1. Por qué este ciclo existe

Un plan de medición existe para sostener un expediente de acreditación, y hoy solo se
puede ver en pantalla. RF-PM-028 y RF-PM-029 piden poder sacarlo en Excel y en PDF;
RF-PM-027, generarlo con los datos configurados.

Con esto, el submódulo de Planes de Medición queda completo: 47 de 47 requisitos.

## 2. Estado de partida verificado

Comprobado leyendo el código el 4 de septiembre de 2026:

| Hecho | Consecuencia |
|---|---|
| Plan de Estudios ya genera PDF y Excel, encolados en BullMQ y ejecutados por un worker propio (`src/worker.ts`) | La maquinaria existe; no hay que inventarla |
| `domain/documentos/documento.ts` es un modelo **neutro por diseño**: títulos, párrafos y tablas, sin colores ni coordenadas | Sirve tal cual para otro módulo |
| Las únicas menciones a Plan de Estudios en los dos renderizadores son **cuatro comentarios**, ni una línea de código | Los renderizadores ya son genéricos |
| `almacen-en-disco.ts` no menciona Plan de Estudios en absoluto | El almacén ya es genérico |
| `DocumentoGenerado` tiene clave foránea a `PlanEstudios` | Mejora Continua necesita su propia tabla |
| La descarga usa `StreamableFile` y no `@Res()` | Se replica el patrón, no se inventa otro |

La conclusión que sostiene el ciclo: **la maquinaria ya es reutilizable; lo único que falla
es dónde vive.**

## 3. Decisiones de diseño

### 3.1 La maquinaria compartida sube a `platform/`

`platform/` ya alberga lo transversal: base de datos, colas, HTTP, logging. Suben tres
piezas y dos contratos:

| Qué | De dónde |
|---|---|
| `documento.ts` — el modelo neutro | `plan-estudios/domain/documentos/` |
| `pdfkit.renderer.ts` | `plan-estudios/infrastructure/documents/` |
| `exceljs.renderer.ts` | `plan-estudios/infrastructure/documents/` |
| `almacen-en-disco.ts` | `plan-estudios/infrastructure/documents/` |
| `AlmacenDeArchivosPort` y el tipo del renderizador | `plan-estudios/application/ports/documentos.port.ts` |

**No sube `armar-documentos.ts`.** Ese archivo decide qué dice el resumen de un plan de
estudios, y eso es contenido de acreditación de ese módulo. Cada módulo escribe el suyo.

Las alternativas se descartaron: importar los renderizadores desde Mejora Continua deja un
módulo colgando de la infraestructura de otro, que es lo que la regla de aislamiento entre módulos de CLAUDE.md §3.2 evita;
duplicarlos garantiza que diverjan, y el día que se arregle un fallo de paginación en uno,
el otro seguirá roto.

### 3.2 El refactor va primero, solo, y verificado

Esta es la parte con riesgo: se mueve código que funciona, y se mueve por conveniencia de
un módulo nuevo, no porque el actual lo necesite.

Por eso el movimiento es **su propia tarea y su propio commit**, sin una línea de
funcionalidad nueva encima. El criterio para darlo por bueno es que las suites completas
—689 unitarias, 227 de integración, 174 del frontend y 19 E2E— pasen **antes** de empezar a
construir. Si algo se rompe, se rompe sin nada nuevo mezclado y se sabe exactamente qué lo
rompió.

Ni un cambio de comportamiento dentro de ese commit: solo rutas de importación. Un renombre
«de paso» convertiría un movimiento verificable en un cambio que hay que revisar línea a
línea.

### 3.3 Tabla propia, no una compartida

`DocumentoGenerado` tiene clave foránea a `PlanEstudios`. Mejora Continua crea
`documentos_medicion` en su esquema, con la misma forma —estado, ubicación opaca, quién y
cuándo, el error redactado para una persona— y clave foránea a `PlanMedicion`.

CLAUDE.md §3.2 prohíbe que dos módulos compartan tabla. Generalizar la existente a «apunta a
cualquier entidad» la dejaría sin clave foránea, y con ella se perdería el borrado en
cascada que hoy garantiza que un plan borrado no deja documentos huérfanos.

### 3.4 La cola se comparte; el worker enruta

Ya existe un worker aparte (`src/worker.ts`) consumiendo una cola de BullMQ. Se reutiliza:
el trabajo encolado pasa a decir de qué tipo es, y el worker enruta al generador que
corresponda.

Una cola por módulo significaría un segundo proceso que desplegar, vigilar y reiniciar,
para el mismo trabajo. §5.2 ya lista un solo `worker` en el Compose.

### 3.5 La matriz se dibuja distinto en cada formato

Una matriz de medición puede tener quince periodos. El renderizador de PDF ya avisa de este
límite en un comentario propio: «las columnas de una malla de 74 asignaturas no significan
nada».

Así que el mismo contenido toma dos formas:

- **En PDF**, una fila por competencia que lista los periodos en que se mide. Se lee en una
  página vertical.
- **En Excel**, la cuadrícula competencia × periodo, que es justo para lo que sirve una hoja
  de cálculo y donde alguien va a querer filtrar y contar.

No es una concesión: es que un PDF de quince columnas no lo lee nadie, y una hoja de cálculo
sin cuadrícula desperdicia la herramienta.

## 4. Alcance

### Dentro

| RF | Qué se construye |
|---|---|
| RF-PM-027 | El documento se arma con los datos configurados del plan |
| RF-PM-028 | Exportación a Excel: cabecera, competencias, periodos y la matriz como cuadrícula |
| RF-PM-029 | Exportación a PDF: lo mismo, con la matriz por competencia |
| — | El traslado de la maquinaria a `platform/` (§3.1) |

Qué lleva el documento, decidido con el usuario:

- **Cabecera**: código, tipo, meta, estado, y quién aprobó y cuándo si está aprobado.
- **Competencias**, agrupadas por atributo del graduado.
- **Periodos**, con su fecha de cierre.
- **La matriz**, con lo programado y lo ya medido.

### Fuera

- **Programar exportaciones** o enviarlas por correo. El documento no lo pide.
- **Plantillas configurables.** Tampoco.
- **Exportar el linaje de versiones.** RF-PM-031 lo muestra en pantalla y ningún requisito
  pide sacarlo en papel.

## 5. Estructura

```
apps/api/
  src/platform/documentos/          ← lo que sube desde plan-estudios
    documento.ts                    el modelo neutro
    pdfkit.renderer.ts
    exceljs.renderer.ts
    almacen-en-disco.ts
    puertos.ts                      AlmacenDeArchivosPort y el renderizador

  prisma/migrations/…_documentos_medicion/

  src/modules/mejora-continua/
    domain/documentos/
      armar-documento-medicion.ts   QUÉ dice el documento del plan
    application/
      ports/documentos-medicion.port.ts
      use-cases/generar-documento-medicion.use-case.ts
    infrastructure/
      persistence/documentos-medicion.repository.ts
      queue/                        el trabajo declara su tipo
      http/documentos-medicion.controller.ts

apps/web/src/features/mejora-continua/
    components/DocumentosDelPlan.tsx
```

## 6. Endpoints

Siguiendo exactamente el patrón que ya existe:

```
POST /planes-medicion/:id/documentos      encola; 202 con el trabajo
GET  /planes-medicion/:id/documentos      los generados, del más reciente al más antiguo
GET  /documentos-medicion/:id             estado del trabajo
GET  /documentos-medicion/:id/archivo     descarga con StreamableFile
```

Todos exigen `medicion.leer`: exportar es leer.

## 7. Errores

- **Un plan sin competencias o sin periodos** se exporta igual, y el documento lo dice. Un
  PDF que declara «este plan no tiene competencias» es información; uno que falla al
  generarse, no. Es el mismo criterio que el renderizador de Plan de Estudios ya aplica con
  su tabla vacía.
- **El worker caído** no deja el trabajo colgado indefinidamente: la cola ya reintenta tres
  veces con retroceso exponencial y retira los fallidos a las 24 horas. Se hereda tal cual
  al compartirla.
- **Descargar un trabajo que falló** devuelve el motivo redactado, no el archivo.

## 8. Pruebas

| Nivel | Qué |
|---|---|
| Dominio | Qué dice el documento: con matriz llena, con matriz vacía, con plan aprobado y sin aprobar |
| Dominio | La matriz por competencia (PDF) y como cuadrícula (Excel) salen del mismo dato |
| Integración | El trabajo pasa de encolado a listo, y el archivo existe con bytes |
| Integración | Borrar el plan se lleva sus documentos por cascada |
| E2E | Encolar una exportación y verla aparecer en la lista |

**El traslado del §3.2 de este documento no lleva pruebas nuevas**, y es deliberado: no cambia comportamiento.
Lo que lo verifica son las suites que ya existen.

## 9. Puntos que quedan anotados

- **La fila de la base y la de Redis pueden desincronizarse.** BullMQ reintenta y caduca sus
  trabajos, pero la fila de `documentos_medicion` que dice «en cola» no se entera si Redis
  pierde el trabajo por completo. Es el mismo hueco que ya tiene Plan de Estudios y no se
  resuelve aquí: la salida sería caducar en la base los trabajos demasiado viejos, y merece
  su propio ciclo para los dos módulos a la vez.
- **Dónde viven los archivos.** Hoy en disco del servidor. §5.6 prevé Backblaze B2, y el
  puerto ya está preparado para ello: cambia el adaptador, nada más.
