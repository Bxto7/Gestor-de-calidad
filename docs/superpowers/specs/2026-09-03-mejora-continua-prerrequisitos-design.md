# Módulo Mejora Continua — Ciclo 1: prerrequisitos (RF120–RF132)

*Diseño validado el 2026-09-03. Fuente de requisitos: `docs/requisitos/Módulo_Mejora_Continua - Requerimientos (Medición, Evaluación, Mejora y Actas).md`, sección 2.*

## 1. Por qué este ciclo existe

El Módulo de Mejora Continua son 183 RF y 26 RNF repartidos en cuatro submódulos encadenados: Planes de Medición → Plan de Evaluación → Plan de Mejora → Actas de Aprobación. La cadena es de dependencia real, no de conveniencia: el Plan de Evaluación carga competencias y periodos desde el de Medición (RNF16), el de Mejora toma como input el porcentaje medido en el de Evaluación (RNF19), y el Acta agrupa acciones de mejora ya aprobadas (RNF23).

Antes de cualquiera de esos cuatro, la sección 2 del documento introduce dos conceptos que el Módulo de Plan de Estudios no tenía: el **Atributo del Graduado** y el **Criterio de Acreditación**. Sin el primero no hay plan de medición trazable a la acreditación; sin el segundo no hay plan de mejora de criterios. Este ciclo cierra esos 13 RF y nada más.

Cada submódulo posterior tendrá su propio ciclo spec → plan → implementación.

## 2. Estado de partida verificado

Contrastado contra el código en `d4b124b`, no supuesto:

| Concepto | Estado real |
|---|---|
| `AtributoGraduado` | Existe como **catálogo global por marco**: `@@unique([marco, codigo])`, sembrado con los 11 atributos ICACIT (AG-I01…AG-I11) por `prisma/seed.ts`. No tiene CRUD ni campo de estado. |
| `CompetenciaAtributo` | Existe, M:N, cumple RF124 y RF125. |
| Vista de cobertura | `GET /competencias/cobertura` devuelve todos los atributos del marco vigente **incluidos los vacíos**. Cumple RF126 y su excepción. |
| `CriterioAcreditacion` | No existe: ningún modelo, ninguna tabla, ningún endpoint. |
| `Competencia` | Catálogo **global** (`codigo @unique`), ligado a planes vía `PlanCompetencia`. |

## 3. La decisión de diseño: ámbito de los Atributos del Graduado

RF120 pide registrar atributos "asociados a un plan de estudios específico", con unicidad "dentro del plan". El modelo actual los tiene como catálogo global por marco.

Implementarlo de forma literal —`planId` en `AtributoGraduado`— produce una incoherencia concreta: `Competencia` es un catálogo global compartido entre planes. Si el atributo AG-I06 perteneciera al plan 2018 y la competencia CPE-03 estuviera en los planes 2018 y 2022, la fila `CompetenciaAtributo(CPE-03, AG-I06)` filtraría un atributo del 2018 al contexto del 2022. Evitarlo obligaría a reescopar también la asociación a `(planId, competenciaId, atributoId)`, migrar los 11 atributos duplicándolos por plan, reescribir el seed y tocar el endpoint de cobertura.

**Decisión adoptada:** el atributo sigue siendo catálogo por marco y una tabla nueva `PlanAtributo` declara qué atributos aplican a cada plan de estudios.

Justificación:

- El comportamiento observable que piden RF120–RF123 y RF128 se cumple íntegro: se registran, editan, inactivan, buscan y se listan por plan.
- La unicidad global por marco es **más estricta** que "única dentro del plan": si no hay dos atributos con el mismo código en todo el marco, tampoco los hay dentro de un plan. La regla de negocio de RF120 se satisface a fortiori.
- Es el patrón que el módulo ya usa para `Competencia` y `ObjetivoEducacional`. Hacer del atributo la única entidad por-plan entre catálogos globales sería la excepción, no la norma.
- No toca datos ni código que hoy funcionan y están cubiertos por pruebas.

**Costo aceptado y explícito:** el Director selecciona atributos de un catálogo por marco en lugar de teclear libremente atributos propios de cada plan. Si la universidad exige más adelante atributos redactados por plan, el cambio es agregar `planId` nullable al atributo (atributos propios del plan conviviendo con los del marco), no rehacer el modelo.

## 4. Alcance

### Dentro

| RF | Entrega |
|---|---|
| RF120 | Registrar atributo del graduado en el catálogo del marco |
| RF121 | Editar código y nombre, revalidando unicidad |
| RF122 | Listar atributos de un plan de estudios, ordenados por código, con indicador de estado |
| RF123 | Inactivar atributo, con aviso de impacto previo y sin borrado físico |
| RF128 | Buscar y filtrar por código y por nombre |
| RF129 | Registrar criterio de acreditación de una carrera |
| RF130 | Editar código y nombre, revalidando unicidad dentro de la carrera |
| RF131 | Listar criterios de una carrera, ordenados por código, con indicador de estado |
| RF132 | Inactivar criterio, con aviso de impacto previo y sin borrado físico |

### Verificado, no reconstruido

RF124, RF125 y RF126 ya están implementados. Este ciclo les añade pruebas de regresión que demuestren que `PlanAtributo` no altera la asociación competencia–atributo ni la vista de cobertura.

### Fuera

- **RF127** — validar que una competencia tenga al menos un atributo antes de incluirse en un plan de medición. Se difiere: valida contra una entidad que este ciclo no construye. Entra con el submódulo Planes de Medición.
- **Frontend.** Este ciclo entrega dominio y API. Las pantallas son un ciclo aparte, después de verificar la API.
- Los submódulos 3 a 6 del documento.

## 5. Modelo de datos

Tres migraciones Prisma, todas aditivas.

```
AtributoGraduado                        (modificado)
  + estado  EstadoActivacion @default(ACTIVO)      ← RF123
  @@unique([marco, codigo])                          sin cambios

PlanAtributo                            (nuevo)
  planId     String
  atributoId String
  @@id([planId, atributoId])                       ← RF122
  plan     PlanEstudios     onDelete: Cascade
  atributo AtributoGraduado onDelete: Restrict

CriterioAcreditacion                    (nuevo)
  id        String  @id @default(uuid())
  carreraId String
  codigo    String  @db.VarChar(16)
  nombre    String  @db.VarChar(300)
  estado    EstadoActivacion @default(ACTIVO)
  creadoEn / actualizadoEn
  @@unique([carreraId, codigo])                    ← RF129 RN, RF130
  carrera Carrera onDelete: Restrict
```

Notas de integridad (RNF11):

- `PlanAtributo.plan` cascadea: borrar un plan borra sus declaraciones, no los atributos del catálogo.
- `PlanAtributo.atributo` restringe: un atributo declarado en algún plan no se puede borrar físicamente. Coherente con RF123 RN1.
- `CriterioAcreditacion.carrera` restringe: no hay criterios huérfanos.
- Los 11 atributos ICACIT existentes quedan `ACTIVO` por el valor por defecto. Ninguna fila se reescribe.

## 6. Arquitectura por capas

Respeta la regla de dependencia de CLAUDE.md §3.2 (`infrastructure → application → domain`) y RNF10.

```
modules/plan-estudios/
  domain/
    entities/criterio-acreditacion.ts     reglas de unicidad e inactivación
    entities/atributo-graduado.ts         reglas de unicidad e inactivación
  application/
    ports/repositorio-atributo.port.ts
    ports/repositorio-criterio.port.ts
    use-cases/gestionar-atributos.use-case.ts
    use-cases/gestionar-criterios.use-case.ts
  infrastructure/
    persistence/atributo.repository.ts    implementa el puerto
    persistence/criterio.repository.ts    implementa el puerto
    http/atributos.controller.ts
    http/criterios.controller.ts
    http/dto/
```

El dominio no importa NestJS ni Prisma. La regla "no se elimina físicamente el registro" (RF123 RN1, RF132 RN1) vive en el dominio, no en el controller.

## 7. Endpoints y trazabilidad

| Método y ruta | RF | Permiso |
|---|---|---|
| `GET /atributos?q=` | RF122, RF128 | `atributo.leer` |
| `POST /atributos` | RF120 | `atributo.gestionar` |
| `PATCH /atributos/:id` | RF121 | `atributo.gestionar` |
| `GET /atributos/:id/impacto-inactivacion` | RF123 | `atributo.leer` |
| `PATCH /atributos/:id/estado` | RF123 | `atributo.gestionar` |
| `GET /planes/:planId/atributos` | RF122 | `atributo.leer` |
| `PUT /planes/:planId/atributos` | RF122 | `atributo.gestionar` |
| `GET /carreras/:carreraId/criterios` | RF131 | `criterio.leer` |
| `POST /carreras/:carreraId/criterios` | RF129 | `criterio.gestionar` |
| `PATCH /criterios/:id` | RF130 | `criterio.gestionar` |
| `GET /criterios/:id/impacto-inactivacion` | RF132 | `criterio.leer` |
| `PATCH /criterios/:id/estado` | RF132 | `criterio.gestionar` |

`impacto-inactivacion` reutiliza el patrón ya presente en asignaturas y facultades: se consulta el impacto antes de escribir, y queda en la bitácora. RF123 y RF132 piden exactamente ese aviso previo ("el sistema advierte el impacto antes de confirmar"). Exige el permiso de lectura y no el de gestión, igual que `impactoDeInactivar` en asignaturas y facultades: consultar el impacto no muta nada.

En este ciclo el impacto de inactivar un atributo se calcula sobre las competencias asociadas y los planes que lo declaran. El impacto sobre planes de medición vigentes que menciona RF123 se añade cuando exista esa entidad.

`PUT /planes/:planId/atributos` reemplaza el conjunto completo de atributos declarados para el plan, de forma atómica. Es la misma semántica que ya usa `PUT /planes/:id/asociaciones`.

## 8. Permisos

Cuatro permisos nuevos siguiendo la convención `entidad.acción` del seed: `atributo.leer`, `atributo.gestionar`, `criterio.leer`, `criterio.gestionar`.

Asignación coherente con los roles ya sembrados: gestión para Director de carrera y Coordinador académico; lectura además para Usuario consultor y Docente. El seed debe seguir siendo idempotente — CI lo ejecuta dos veces y falla si la segunda pasada no es inocua.

## 9. Auditoría

Toda mutación —crear, editar, inactivar, reactivar, declarar atributos de un plan— emite un `DomainEvent` que el listener de bitácora persiste en la tabla append-only. Es obligatorio por CLAUDE.md §2 y por RNF03, que exige además que ninguna interfaz exponga edición o borrado de registros de auditoría.

## 10. Errores

RNF08 prohíbe mensajes genéricos para validaciones de negocio conocidas. Cada rechazo indica el motivo concreto:

- código duplicado dentro del marco (RF120) o dentro de la carrera (RF129, RF130)
- nombre vacío (RF130 RN1)
- inactivar algo ya inactivo (RF123, RF132 exigen que esté activo)

Se emiten como errores de dominio que el filtro existente traduce a HTTP 409, no como excepciones sueltas.

## 11. Pruebas

Por TDD: la prueba primero, en rojo, antes de la implementación.

| Nivel | Qué cubre | Dónde corre |
|---|---|---|
| Unitarias de dominio | Unicidad, inactivación sin borrado, validación de nombre vacío | Local y CI, sin base de datos |
| Unitarias de casos de uso | Permisos exigidos, eventos de auditoría emitidos, búsqueda por código y por nombre | Local y CI |
| Integración | Adaptadores Prisma, restricciones `@@unique`, cascadas y restricciones de FK | CI y `sgc_test` local |
| Regresión | RF124–RF126 siguen intactos tras introducir `PlanAtributo` | CI |

Cobertura ≥80% en `domain/` y `application/`, umbral que CI ya vigila.

Las pruebas de integración vacían tablas con `TRUNCATE`: corren solo contra una base desechable llamada `sgc_test`, nunca contra `sgc`.

## 12. Criterios de aceptación del ciclo

1. Los nueve RF del alcance están implementados y cada uno tiene al menos una prueba que lo referencia por su identificador.
2. RF124, RF125 y RF126 siguen pasando, con pruebas de regresión que lo demuestran.
3. Las tres migraciones aplican sobre una base con datos existentes sin pérdida: los 11 atributos ICACIT conservan sus asociaciones a competencias.
4. `npm test`, `npm run test:integration`, typecheck y lint en verde.
5. OpenAPI actualizado con los doce endpoints.
6. El seed sigue siendo idempotente.

## 13. Puntos que la universidad debe validar

Heredados de la sección 8 del documento fuente y de esta decisión de diseño:

- Si los Atributos del Graduado deben poder redactarse por plan además de tomarse del marco de acreditación.
- El nombre y alcance definitivos de los roles, que el documento marca como propuestos y no oficiales.
