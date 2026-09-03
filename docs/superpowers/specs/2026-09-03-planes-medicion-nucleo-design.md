# Planes de Medición — Ciclo 2a: núcleo (RF-PM-000 a RF-PM-026, RF-PM-046)

*Diseño validado el 2026-09-03. Fuente de requisitos: `docs/requisitos/Módulo_Mejora_Continua - Requerimientos (Medición, Evaluación, Mejora y Actas).md`, sección 3.*

## 1. Por qué este ciclo existe

Planes de Medición es el primero de los cuatro submódulos de Mejora Continua y la base sobre la que se apoyan los otros tres: el Plan de Evaluación carga de él sus competencias y periodos (RNF16), el Plan de Mejora toma como input el porcentaje que la evaluación midió (RNF19), y el Acta agrupa las acciones resultantes (RNF23).

Son 47 RF, demasiados para una sola spec ejecutable. Este ciclo toma los 28 que construyen **el plan y su matriz de programación** —crear un plan de medición, fijar la meta, elegir competencias, definir periodos y programar qué se mide cuándo—, que es la primera unidad con la que alguien puede hacer algo de principio a fin. El ciclo 2b añadirá lo que se hace con el plan después: exportar, versionar, aprobar formalmente y buscar (RF-PM-027 a RF-PM-045).

El prerrequisito de la sección 2 —atributos del graduado y criterios de acreditación— se cerró en el ciclo anterior (`2026-09-03-mejora-continua-prerrequisitos-design.md`).

## 2. Estado de partida verificado

Contrastado contra el código, no supuesto:

| Pieza | Estado real |
|---|---|
| `modules/mejora-continua/` | No existe. Este ciclo lo crea. |
| Puerto entre plan-estudios y otro módulo | No existe ninguno en esa dirección. Sí el inverso: `auth` expone `AuthorizationPort` y `plan-estudios` lo consume — ese es el patrón a replicar. |
| `Ciclo` | Ciclo **curricular**: `numero` 1..N por carrera, con rangos de crédito. **No tiene fecha.** |
| `PlanEstudios` | Tiene `duracionAnios` y `estado: EstadoPlan`. No tiene periodos académicos datados. |
| Invariante de unicidad por estado | Ya resuelto con índice único parcial: `planes_una_vigente_por_carrera ... WHERE (estado = 'VIGENTE')`. Hay precedente exacto. |
| Máquina de estados | `estado-plan.ts`, pura y declarativa. Mismos cinco nombres de estado que pide RF-PM-005, **con reglas distintas** (ver §3.4). |
| Atributos y competencias | Disponibles: `AtributoGraduado`, `CompetenciaAtributo` y `PlanAtributo` del ciclo anterior. |

## 3. Decisiones de diseño

### 3.1 Módulo nuevo, y comunicación por puerto

RF-PM-000 lo establece sin ambigüedad: el Módulo de Mejora Continua es *"un nuevo módulo del sistema, distinto del Módulo de Plan de Estudios pero dependiente funcionalmente de él"*. Va en `modules/mejora-continua/`, con la estructura `domain / application / infrastructure` de siempre.

CLAUDE.md §3.2 prohíbe que un módulo acceda a las entidades o tablas de otro. Por tanto `plan-estudios` expone un puerto nuevo, `ContenidoCurricularPort`, y `mejora-continua` depende de esa interfaz:

```
planesDisponibles()               planes en Aprobado o Vigente      RF-PM-001 RN2
planePorId(id)                    existencia, estado, duracionAnios RF-PM-001, RF-PM-016
competenciasConAtributos(planId)  para agrupar la selección         RF-PM-013, RF-PM-014
```

El puerto vive en `modules/plan-estudios/application/ports/`, junto a los demás, porque lo expone quien posee los datos. Es la misma disposición que `AuthorizationPort`.

### 3.2 Periodos: qué precargar cuando no hay nada que precargar

RF-PM-016 manda precargar *"los periodos académicos definidos en dicho plan de estudios"*. **Ese dato no existe.** Un plan de estudios tiene ciclos curriculares numerados, sin fecha; RF-PM-019 exige ordenar los periodos del plan de medición *por fecha*. Son conceptos distintos: el ciclo curricular es "el quinto semestre de la malla", el periodo de medición es "2024-I".

**Decisión:** al crear un plan de tipo Directa, el usuario indica el **periodo de inicio** (año y mitad) y el sistema propone `duracionAnios × 2` periodos correlativos —2024-I, 2024-II, 2025-I…— que puede editar, quitar o ampliar.

Justificación:

- Cumple RF-PM-016 RN1, que llama a la precarga *"solo una propuesta inicial, no una restricción"*, y RN2, que permite que los periodos finales difieran del plan base.
- Produce periodos ordenables, que es lo que RF-PM-019 necesita.
- El factor dos sale de una convención ya escrita en el esquema: `Carrera.duracionAnios` lleva el comentario *"RF011 RN2: por convención, cada año son dos ciclos"*.

Para el tipo Indirecta no hay precarga: RF-PM-020 pide años sueltos elegidos por el usuario, y el plan de estudios no dice nada sobre el horizonte de una encuesta a egresados.

**Queda como punto a validar con la universidad:** si sus periodos académicos no son dos por año, la propuesta inicial cambia. La regla vive en un único sitio del dominio para que ese cambio sea de una línea.

### 3.3 Referencias entre módulos sin clave foránea

`PlanMedicion` referencia un plan de estudios, y la matriz referencia competencias. Ambas entidades pertenecen a `plan-estudios`, y §3.2 prohíbe compartir tablas entre módulos.

**Decisión:** las tablas de `mejora-continua` guardan el identificador (`plan_estudios_id`, `competencia_id`) **sin clave foránea**, y la validez se comprueba a través de `ContenidoCurricularPort` antes de escribir.

Es la primera vez que el proyecto renuncia a una FK, y el costo es real: la base ya no impide por sí sola una referencia huérfana. Se compensa así:

- Toda escritura valida contra el puerto antes de persistir; una competencia inexistente o ajena al plan base se rechaza en la capa de aplicación con un error de negocio concreto.
- Los identificadores son inmutables (`uuid` con `@default(uuid())`, nunca reasignados), así que no hay actualización en cascada que perder.
- Ninguna entidad de `plan-estudios` se borra físicamente: competencias y planes se inactivan (`EstadoActivacion`, `EstadoPlan`), no se eliminan. El caso que la FK protegería —borrar la fila referenciada— no se da.

La alternativa era poner la FK y aceptar el acoplamiento entre esquemas. Se descarta porque es exactamente la puerta que §3.2 cierra, y porque el día que Mejora Continua se extraiga a su propio servicio esas FK serían justo lo que habría que deshacer.

### 3.4 Máquina de estados duplicada, no compartida

RF-PM-005 RN1 pide la misma secuencia que ya tiene el Plan de Estudios: `Borrador → En revisión → Aprobado → Vigente → Histórico`. La tentación es reutilizar `estado-plan.ts`.

**Decisión:** un `estado-plan-medicion.ts` propio dentro de `mejora-continua/domain/value-objects/`.

Justificación:

- **Ya divergen.** RF-PM-007 RN1 dice *"solo se permite edición libre en estado Borrador"*; `permiteEdicion` del Plan de Estudios admite además En revisión. Mismos nombres, reglas distintas.
- Los permisos de cada transición son otros (`medicion.*`, no `plan.*`).
- Importarla desde `plan-estudios` violaría §3.2; subirla a `shared-kernel` contradice la advertencia de CLAUDE.md de no convertirlo en *"un cajón de sastre que reintroduce acoplamiento entre módulos"*.
- Son unas cien líneas declarativas. Si más adelante los cuatro submódulos de Mejora Continua repiten la misma máquina, ahí sí habrá materia para abstraer —con tres casos y no con dos.

## 4. Alcance

### Dentro

| RF | Entrega |
|---|---|
| RF-PM-000 | Módulo `mejora-continua` y `ContenidoCurricularPort` |
| RF-PM-001, RF-PM-002 | Plan base (solo Aprobado o Vigente) y tipo Directa/Indirecta |
| RF-PM-003, RF-PM-004 | Creación en Borrador con código único autogenerado |
| RF-PM-005, RF-PM-006 | Máquina de estados y transiciones con permiso por transición |
| RF-PM-007, RF-PM-008 | Edición libre solo en Borrador |
| RF-PM-009 | Eliminación solo en Borrador |
| RF-PM-010 | Consulta por plan de estudios, tipo y estado |
| RF-PM-011, RF-PM-012 | Meta única del plan, 0 % a 100 %, almacenada como fracción |
| RF-PM-013, RF-PM-014, RF-PM-015 | Competencias agrupadas por atributo, al menos una |
| RF-PM-016 – RF-PM-019 | Periodos de la Directa: propuesta inicial, fecha de cierre, sin duplicados, ordenados |
| RF-PM-020, RF-PM-021 | Años de la Indirecta, sin duplicados, al menos uno |
| RF-PM-022 – RF-PM-025 | Matriz competencia × periodo: programar, editar, consultar, al menos un periodo por competencia |
| RF-PM-026 | Marca pendiente/realizada con usuario y fecha |
| RF-PM-046 | Alerta por medición programada no realizada pasada la fecha de cierre |

RNF aplicables: **RNF01** (RBAC en toda operación), **RNF03** (auditoría no editable), **RNF04** (matriz en menos de 3 s con 50 competencias y 15 periodos), **RNF08** (errores de negocio específicos), **RNF10** (hexagonal), **RNF11** (integridad referencial), **RNF12** (guardado atómico de la matriz).

### Fuera

- **RF-PM-027 a RF-PM-045** — generación y exportación, versionado e historial, aprobación formal, búsqueda avanzada y el detalle de seguridad del submódulo. Ciclo 2b.
- **Frontend.** Este ciclo entrega dominio y API. La matriz es la pantalla más cara del submódulo y merece su propio ciclo, con RNF09 (los tres estados de celda visualmente distinguibles) como criterio.
- Los submódulos 4, 5 y 6 del documento.

## 5. Modelo de datos

Esquema `mejora_continua`, nuevo. Cuatro tablas.

```
PlanMedicion
  id, planEstudiosId (sin FK, §3.3), tipo: TipoMedicion, codigo (único),
  version, meta: Decimal(4,3) 0..1, estado: EstadoPlanMedicion,
  periodoInicio (solo Directa, para reproducir la propuesta), creadoEn, actualizadoEn
  UNIQUE (codigo)
  UNIQUE (planEstudiosId, tipo) WHERE estado = 'VIGENTE'      ← RF-PM-041 RN1, SQL crudo

PeriodoMedicion
  id, planMedicionId, etiqueta VarChar(16), orden SmallInt, fechaCierre?
  UNIQUE (planMedicionId, etiqueta)                            ← RF-PM-018, RF-PM-021
  plan → onDelete: Cascade

CompetenciaDelPlan
  planMedicionId, competenciaId (sin FK, §3.3)
  PK (planMedicionId, competenciaId)                           ← RF-PM-013 RN1
  plan → onDelete: Cascade

Programacion
  planMedicionId, competenciaId, periodoId
  realizada: Boolean @default(false), realizadaEn?, realizadaPorId?
  PK (planMedicionId, competenciaId, periodoId)                ← RF-PM-022 RN2
  periodo → onDelete: Cascade
```

Notas:

- `meta` como `Decimal(4,3)` y no como entero de porcentaje: RF-PM-011 RN2 exige almacenarla como fracción decimal (70 % → 0.7). `Decimal` y no `Float` porque un umbral de aprobación no debe sufrir error de coma flotante.
- `orden` es el que impone RF-PM-019, y se recalcula al agregar o quitar periodos. La etiqueta no basta para ordenar: «2024-II» y «2025-I» ordenan bien alfabéticamente, pero un periodo añadido a mano puede no seguir el patrón.
- `Programacion` cuelga del periodo con `Cascade`: quitar un periodo del plan retira sus celdas, que es lo que RF-PM-016 permite hacer mientras el plan está en Borrador.
- `realizadaPorId` guarda el usuario que marcó la medición (RF-PM-026 RN2). Referencia a `auth` sin FK, por el mismo motivo de §3.3.

## 6. Arquitectura por capas

```
modules/mejora-continua/
  domain/
    value-objects/estado-plan-medicion.ts   máquina de estados propia (§3.4)
    value-objects/meta.ts                   rango 0..1, conversión desde porcentaje
    value-objects/periodos.ts               propuesta inicial, etiquetas, orden
    entities/plan-de-medicion.ts            invariantes del agregado
    services/motor-de-consistencia.ts       validaciones consolidadas (RF-PM-015, 025)
    events/eventos-medicion.ts
  application/
    ports/repositorio-plan-medicion.port.ts
    use-cases/gestionar-planes-medicion.use-case.ts
    use-cases/configurar-plan-medicion.use-case.ts   meta, competencias, periodos
    use-cases/programar-mediciones.use-case.ts       matriz y marca de realizada
  infrastructure/
    persistence/plan-medicion.repository.ts
    http/planes-medicion.controller.ts
    http/dto/
```

Y en `plan-estudios`:

```
  application/ports/contenido-curricular.port.ts   expuesto (§3.1)
  infrastructure/contenido-curricular.adapter.ts   implementación sobre sus repos
```

El dominio no importa NestJS ni Prisma. Las validaciones de consistencia van en un servicio de dominio desacoplado, como exige CLAUDE.md §2 para el `MotorDeValidaciones`, y devuelven una lista estructurada de hallazgos en lugar de lanzar excepciones sueltas.

## 7. Endpoints y trazabilidad

| Método y ruta | RF | Permiso |
|---|---|---|
| `GET /planes-medicion` | RF-PM-010 | `medicion.leer` |
| `POST /planes-medicion` | RF-PM-001 – RF-PM-004 | `medicion.crear` |
| `GET /planes-medicion/:id` | RF-PM-010 | `medicion.leer` |
| `PATCH /planes-medicion/:id` | RF-PM-008, RF-PM-011, RF-PM-012 | `medicion.editar` |
| `DELETE /planes-medicion/:id` | RF-PM-009 | `medicion.eliminar` |
| `POST /planes-medicion/:id/transiciones` | RF-PM-005, RF-PM-006, RF-PM-007 | según transición |
| `GET /planes-medicion/:id/competencias-disponibles` | RF-PM-013, RF-PM-014 | `medicion.leer` |
| `PUT /planes-medicion/:id/competencias` | RF-PM-013, RF-PM-015 | `medicion.editar` |
| `GET /planes-medicion/:id/periodos` | RF-PM-019 | `medicion.leer` |
| `PUT /planes-medicion/:id/periodos` | RF-PM-016 – RF-PM-021 | `medicion.editar` |
| `GET /planes-medicion/:id/matriz` | RF-PM-024, RF-PM-046 | `medicion.leer` |
| `PUT /planes-medicion/:id/matriz` | RF-PM-022, RF-PM-023, RF-PM-025 | `medicion.editar` |
| `PATCH /planes-medicion/:id/matriz/:competenciaId/:periodoId` | RF-PM-026 | `medicion.editar` |

`PUT` en competencias, periodos y matriz reemplaza el conjunto completo de forma atómica, como pide RNF12 y como ya hacen `PUT /planes/:id/asociaciones` y `PUT /planes/:planId/atributos`.

`GET /matriz` devuelve las celdas con su estado —no programada, programada pendiente, programada realizada— más la alerta de RF-PM-046 calculada al vuelo comparando `fechaCierre` con la fecha actual. Se calcula y no se almacena: una alerta persistida quedaría obsoleta en cuanto pasara la fecha o se marcara la medición, y RN2 pide que desaparezca justo cuando la medición se marque como realizada.

## 8. Permisos

Cinco permisos nuevos, patrón `recurso.acción` del seed: `medicion.leer`, `medicion.crear`, `medicion.editar`, `medicion.eliminar`, `medicion.aprobar`.

Reparto según los actores que nombran los RF: Director de carrera y Coordinador académico gestionan; solo el Director aprueba (RF-PM-006 lo separa explícitamente: *"el Coordinador académico envía a revisión, y el Director de carrera aprueba, rechaza u observa"*); Docente y Usuario consultor leen. El administrador del sistema solo lee, por el mismo criterio aplicado en el ciclo anterior.

`medicion.enviar_revision` no se crea: la transición a En revisión la cubre `medicion.editar`, porque quien puede configurar el plan es quien lo da por listo. `medicion.aprobar` sí es propio, porque separa a quien construye de quien da el visto bueno.

## 9. Auditoría

Toda mutación —crear, editar, cambiar meta, declarar competencias, definir periodos, programar la matriz, marcar una medición como realizada, transicionar de estado— emite un `DomainEvent` que el listener de bitácora persiste. RF-PM-045 y RNF03 lo exigen, y CLAUDE.md §2 lo hace no negociable.

`ENTIDADES_AUDITABLES` gana `'PlanMedicion'`. Es lista cerrada: sin esa entrada los eventos no compilan.

## 10. Errores

RNF08 prohíbe mensajes genéricos. Cada rechazo dice el motivo concreto:

- plan de estudios inexistente, o en estado distinto de Aprobado/Vigente (RF-PM-001 RN2)
- plan de estudios sin competencias o sin atributos (excepción de RF-PM-001)
- ya existe un plan Vigente de ese tipo para ese plan de estudios (RF-PM-041 RN1)
- meta fuera de 0–100 (RF-PM-012 RN1)
- plan sin competencias (RF-PM-015) o sin periodos (RF-PM-016 RN3, RF-PM-020 RN1)
- periodo o año duplicado (RF-PM-018, RF-PM-021)
- competencia sin ningún periodo programado (RF-PM-025)
- edición sobre un plan que no está en Borrador (RF-PM-007 RN1)
- marcar como realizada una celda no programada (RF-PM-026 RN1)

Se emiten como errores de dominio que el filtro existente traduce a HTTP.

## 11. Pruebas

Por TDD: la prueba primero, en rojo.

| Nivel | Qué cubre | Dónde corre |
|---|---|---|
| Unitarias de dominio | Máquina de estados, rango de la meta, propuesta y orden de periodos, motor de consistencia | Local y CI, sin base de datos |
| Unitarias de casos de uso | Permisos, eventos de auditoría, validación contra el puerto, atomicidad de los reemplazos | Local y CI |
| Integración | Adaptador Prisma, índice único parcial de Vigente, cascadas, y el adaptador de `ContenidoCurricularPort` contra datos reales | CI y `sgc_test` |
| Desempeño | RNF04: la matriz con 50 competencias y 15 periodos por debajo de 3 s | Integración, con umbral que hace fallar la prueba |

Cobertura ≥80 % en `domain/` y `application/`. Las de integración solo contra `sgc_test`.

## 12. Criterios de aceptación del ciclo

1. Los 28 RF del alcance están implementados y cada uno tiene al menos una prueba que lo referencia por su identificador.
2. El índice único parcial rechaza un segundo plan Vigente del mismo tipo para el mismo plan de estudios, comprobado contra PostgreSQL real.
3. `mejora-continua` no importa ninguna entidad, repositorio ni tabla de `plan-estudios`: toda lectura pasa por `ContenidoCurricularPort`. Verificable con una regla de ESLint o una prueba que inspeccione los imports.
4. La matriz de 50 × 15 se construye en menos de 3 s (RNF04).
5. `npm test`, `npm run test:integration`, typecheck y lint en verde.
6. OpenAPI actualizado con los trece endpoints.
7. El seed sigue siendo idempotente con los cinco permisos nuevos.

## 13. Puntos que la universidad debe validar

- **Periodos académicos por año.** La propuesta inicial asume dos por año (§3.2). Si no es así, cambia el cálculo.
- **Formato del código del plan de medición.** RF-PM-004 lo describe como «código del plan de estudios + tipo + correlativo» sin fijarlo. Se adopta `PM-<código del plan>-<D|I>-v<n>` hasta que la universidad indique otro.
- El nombre y alcance definitivos de los roles, que el documento marca como propuestos y no oficiales.
- Si la alerta de RF-PM-046 debe además notificar por correo, o basta con que sea visible en la matriz. Este ciclo hace lo segundo.
