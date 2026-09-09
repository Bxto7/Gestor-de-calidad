# Plan de Mejora · ciclo 2c-J-A — el plan existe

## 1. Por qué este ciclo existe y dónde acaba

Cubre RF-PJ-000 a RF-PJ-019: el submódulo `mejora` queda incorporado a Mejora
Continua, con su máquina de estados documental, los datos comunes de la
acción de mejora (§5.2), su estado de implementación, evidencias y
retroalimentación (§5.3). Es el núcleo transversal sobre el que se van a
apoyar los tres aspectos.

**Fuera de 2c-J-A explícitamente:**

- Los tres aspectos (Criterios, Objetivos, Competencias — RF-PJ-020 a 031) →
  2c-J-B. Esto incluye la parte cross-módulo de RF-PJ-002 (ver más abajo).
- Generación, exportación (Excel/PDF), versionado e histórico de
  modificaciones, búsqueda/filtrado (RF-PJ-032 a 038) → 2c-J-C.
- Envío a revisión, aprobación, rechazo, validación integral (RF-PJ-042) y
  permisos/auditoría formalizados (RF-PJ-039 a 046) → 2c-J-D.

**Matiz sobre RF-PJ-002 (asociar el plan a un elemento):** en 2c-J-A se
implementa la asociación en sí — guardar `aspecto` + referencia al elemento,
validar que la tripleta sea consistente — pero **no** la validación de que
ese elemento realmente existe en Plan de Estudios. Esa validación necesita un
puerto cross-módulo que hoy no existe: `acreditacion.port.ts` (en
`plan-estudios/application/ports/`) es de uso interno de `plan-estudios` y ni
siquiera se expone a `mejora-continua`. El propio código ya lo anticipa — el
comentario de `ImpactoCriterio.planesMejoraVinculados` dice literalmente
"Cero mientras ese submódulo no exista". El puerto real (`AcreditacionPort` o
como se llame, siguiendo el patrón de `ContenidoCurricularPort`) se construye
en 2c-J-B, junto con las pantallas de selección por aspecto que lo necesitan
de verdad. Es el mismo movimiento que ya usaste en RF-PE-041/2c-D: se declara
el requisito, se deja un placeholder explícito, se cierra en el ciclo que le
corresponde.

## 2. Los dos hallazgos que deciden la arquitectura

**a) Un agregado polimórfico, no tres entidades.** Los tres aspectos
comparten entidad, máquina de estados documental y todos los campos de
definición/retroalimentación. Se modela como **una** tabla `PlanMejora` con
un discriminador `aspecto` y una referencia que cambia de forma según el
valor de ese discriminador. La lógica específica de cada aspecto (qué
elemento se ofrece, de dónde sale el input automático) vive en 2c-J-B, no en
el agregado.

**b) Dos máquinas de estado independientes, con split de campos — no de
plan completo.** El estado documental (`Borrador → En revisión → Aprobado →
Vigente → Histórico`, reutilizando **tal cual**
`mejora-continua/domain/value-objects/estado-plan.ts` — mismo archivo que ya
comparten `medicion` y `evaluacion`, RF-PJ-004 lo pide explícitamente)
gatea solo los **campos de definición** (nombre, causa raíz, justificación,
plazo, recursos, metas, responsable). El estado de implementación
(`Pendiente | En proceso | Completado`) es una máquina nueva, sin precedente
en el código actual, que vive en su propio VO
(`mejora/domain/value-objects/estado-implementacion.ts`) junto con
evidencias y retroalimentación — los "campos de seguimiento".

Leyendo las RN al pie de la letra hay una asimetría que vale la pena
respetar en el diseño en vez de suavizarla:

| Campo | Editable en Borrador | Editable en En revisión / Aprobado | Editable en Vigente | Editable en Histórico |
|---|---|---|---|---|
| Definición (nombre, causa raíz, ...) | Sí (RF-PJ-006) | No (RF-PJ-007) | No (RF-PJ-007) | No |
| Estado de implementación | Sí | **No — la RN de RF-PJ-006 solo exceptúa "Vigente", no menciona En revisión/Aprobado** | Sí (RF-PJ-014 RN3) | No (invariante global de inmutabilidad, sección 3.3 de CLAUDE.md) |
| Evidencias (cargar) | Sí | No (misma razón) | Sí (RF-PJ-016 RN2) | No |
| Evidencias (eliminar) | Sí | No | Sí | **No, explícito** (RF-PJ-017 precondición) |
| Retroalimentación | Sí | No | Sí (RF-PJ-018 RN2) | No |

Esto se toma como decisión de diseño (sección 12), no como pregunta abierta:
los campos de seguimiento se bloquean también en `En revisión`/`Aprobado`
porque el plan está a la espera de una decisión del Director de carrera —
dejar que el Coordinador siga tocando el estado de implementación en ese
ínterin generaría una foto móvil sobre la que el Director está evaluando.

## 3. Estructura: sigue el patrón de `evaluacion`/`medicion`

```
apps/api/src/modules/mejora-continua/
  domain/value-objects/estado-plan.ts        # ya existe, se reutiliza sin tocar
  mejora/
    domain/
      value-objects/
        estado-implementacion.ts             # nuevo
        codigo-mejora.ts                     # nuevo, mismo patrón que codigo-evaluacion.ts
      events/
        eventos-mejora.ts                    # nuevo
    application/
      ports/
        plan-mejora.port.ts                  # nuevo
      use-cases/
        gestionar-planes-mejora.use-case.ts  # nuevo (+ .spec.ts)
    infrastructure/
      http/
        planes-mejora.controller.ts          # nuevo
        dto/*.dto.ts
      persistence/
        plan-mejora.repository.ts            # nuevo (Prisma)
```

No hay carpeta `entities/` (el proyecto no la usa en ningún submódulo
existente — todo vive como VOs + datos planos de puerto). No se crea
`domain/documentos/` todavía: eso es 2c-J-C.

## 4. El modelo de datos

```prisma
enum AspectoPlanMejora {
  CRITERIO_ACREDITACION
  OBJETIVO_EDUCACIONAL
  COMPETENCIA
}

enum EstadoImplementacionMejora {
  PENDIENTE
  EN_PROCESO
  COMPLETADO
}

model PlanMejora {
  id                     String   @id @default(cuid())
  codigo                 String
  aspecto                AspectoPlanMejora
  criterioAcreditacionId String?
  objetivoEducacionalId  String?
  competenciaId          String?   // referencia provisional — ver §13
  periodoId              String?   // referencia provisional — ver §13
  estado                 String    // EstadoMedicion, mismo VO compartido
  estadoImplementacion   EstadoImplementacionMejora @default(PENDIENTE)
  nombre                 String
  causaRaiz              String
  justificacion          String
  plazo                  DateTime
  recursos               String
  metas                  String
  responsable            String
  logroMeta              String?
  impacto                String?
  creadoEn               DateTime @default(now())
  evidencias             EvidenciaPlanMejora[]
}

model EvidenciaPlanMejora {
  id            String   @id @default(cuid())
  planMejoraId  String
  planMejora    PlanMejora @relation(fields: [planMejoraId], references: [id])
  referencia    String   // URL o ruta del archivo/enlace
  nombreArchivo String?
  subidoPor     String
  subidoEn      DateTime @default(now())
}
```

No se agrega una constraint `@@unique` sobre `codigo` a nivel de tabla,
siguiendo el mismo patrón que `evaluacion`/`medicion`: la unicidad la
garantiza la función pura de generación (`siguienteCodigoMejora`) contra la
lista de códigos ya usados **dentro del ámbito correspondiente**
(`codigosDe(aspecto, elementoId)`), no un índice de base de datos. El ámbito
varía por aspecto (RF-PJ-003 RN2: por criterio, por objetivo, o por periodo
para competencias) — igual de variable que el ámbito de `evaluacion`
(por plan de estudios + tipo).

## 5. Puertos

Nuevo: `RepositorioPlanMejoraPort` en `mejora/application/ports/plan-mejora.port.ts`:

```ts
export interface RepositorioPlanMejoraPort {
  crear(datos: NuevoPlanMejora): Promise<DatosPlanMejora>;
  porId(id: string): Promise<DatosPlanMejora | null>;
  editarDefinicion(id: string, datos: DefinicionAccionMejora): Promise<DatosPlanMejora>;
  eliminar(id: string): Promise<void>;
  cambiarEstado(id: string, estado: EstadoMedicion): Promise<DatosPlanMejora>;
  actualizarImplementacion(id: string, estado: EstadoImplementacionMejora): Promise<DatosPlanMejora>;
  actualizarRetroalimentacion(id: string, logroMeta: string, impacto: string): Promise<DatosPlanMejora>;
  agregarEvidencia(id: string, evidencia: NuevaEvidencia): Promise<DatosEvidencia>;
  eliminarEvidencia(evidenciaId: string): Promise<void>;
  codigosDe(aspecto: AspectoPlanMejora, elementoId: string): Promise<readonly string[]>;
}
export const REPOSITORIO_PLAN_MEJORA = Symbol('RepositorioPlanMejoraPort');
```

No se toca `ContenidoCurricularPort`, `RepositorioPlanEvaluacionPort` ni
`RepositorioPlanMedicionPort` en este ciclo — todavía no se necesitan
(entran en 2c-J-B para resolver el elemento por aspecto, y para heredar
periodos/porcentajes en el caso de competencias).

## 6. Casos de uso

`GestionarPlanesMejora` — mismo patrón de constructor por `useFactory` que
`GestionarPlanesEvaluacion`, inyectando `RepositorioPlanMejoraPort`,
`AuthorizationPort`, `PublicadorDeEventos`:

- `crear(actor, datos)` — genera código vía `siguienteCodigoMejora(...)`
  contra `codigosDe(aspecto, elementoId)`. **No valida que `elementoId`
  exista** — ver §1. RF-PJ-002 queda satisfecho a nivel de "guardar y no
  duplicar", no de "verificar contra Plan de Estudios".
- `editarDefinicion(actor, id, datos)` — exige estado `Borrador`.
- `eliminar(actor, id)` — exige estado `Borrador`.
- `transicionar(actor, id, accion, contexto)` — reusa
  `intentarTransicion` de `estado-plan.ts` igual que evaluación. Mismo
  placeholder que RF-PE-041 tuvo en su momento:

  ```ts
  // La validación integral de consistencia es RF-PJ-042, en el ciclo 2c-J-D:
  // hoy no hay ningún dato que exija bloquear la transición por completitud.
  const r = intentarTransicion(plan.estado, accion, {
    tieneBloqueos: false,
    comentario: contexto.comentario,
  });
  ```

- `actualizarImplementacion(actor, id, estado)` — exige que
  `plan.estado` sea `Borrador` o `Vigente` (la asimetría de la tabla de
  §2b), lanzando `ReglaDeNegocioViolada` en cualquier otro estado.
- `cargarEvidencia(actor, id, evidencia)` / `eliminarEvidencia(actor, evidenciaId)`
  — misma regla de estados que implementación; `eliminarEvidencia` además
  bloquea explícitamente en `Histórico` (ya cubierto por la regla anterior,
  pero RF-PJ-017 lo pide como precondición propia — se mantiene el mensaje
  de error específico para no perder la trazabilidad al requisito).
- `actualizarRetroalimentacion(actor, id, logroMeta, impacto)` — misma
  regla de estados.

## 7. HTTP

`planes-mejora.controller.ts`: `POST /planes-mejora`, `GET /planes-mejora/:id`,
`PATCH /planes-mejora/:id/definicion`, `PATCH /planes-mejora/:id/implementacion`,
`PATCH /planes-mejora/:id/retroalimentacion`, `POST /planes-mejora/:id/evidencias`,
`DELETE /planes-mejora/evidencias/:evidenciaId`, `POST /planes-mejora/:id/transicion`,
`DELETE /planes-mejora/:id`. Sin endpoint de listado/búsqueda todavía
(RF-PJ-038 es 2c-J-C).

## 8. Pantallas

Sin pantalla dedicada en este ciclo. La selección de aspecto (RF-PJ-001) y
la asociación real a un elemento (RF-PJ-002) necesitan las pantallas de
selección por aspecto, que dependen de los puertos cross-módulo de 2c-J-B —
construir una pantalla ahora significaría rehacerla ahí. Los endpoints de
este ciclo quedan cubiertos por Supertest, sin UI todavía.

## 9. Permisos y auditoría

Verifiqué el mecanismo real (no es un wildcard por prefijo, es una lista
cerrada) — `politica-de-autorizacion.ts` tiene un `Set` explícito
`PERMISOS_ACOTADOS_A_CARRERA` que hoy incluye `medicion.*` y `evaluacion.*`
uno por uno. Un permiso `mejora.crear` que no esté en ese `Set` funcionaría
sin acotar por carrera — cualquier Director/Coordinador con el permiso
podría tocar planes de mejora de cualquier carrera, rompiendo la premisa de
"de su carrera" (§3.5 de CLAUDE.md). Esto no queda pendiente: son dos
cambios concretos, mecánicos, que van en las tareas de 2c-J-A:

1. **`apps/api/prisma/seed.ts`** — agregar al catálogo (sección "Mejora
   continua", categoría `'mejora-continua'`, mismo formato tupla
   `[código, descripción, categoría]` que usan `evaluacion.*`):
   `mejora.leer`, `mejora.crear`, `mejora.editar`, `mejora.eliminar`,
   `mejora.aprobar`. Asignación por rol, calcada de `evaluacion.*`
   (líneas 191-198 y 236-243 de `seed.ts`): DIRECTOR_CARRERA recibe las
   cinco; COORDINADOR_ACADEMICO recibe todas **menos** `mejora.aprobar`
   (RF-PJ-044 exige que solo el Director apruebe); DOCENTE y
   USUARIO_CONSULTOR reciben solo `mejora.leer`; ADMIN_SISTEMA recibe solo
   `mejora.leer` (por la misma razón que no tiene `evaluacion.aprobar`:
   no decide nada académico).
2. **`politica-de-autorizacion.ts`** — agregar `mejora.crear`,
   `mejora.editar`, `mejora.eliminar`, `mejora.aprobar` al `Set`
   `PERMISOS_ACOTADOS_A_CARRERA` (junto al bloque de `medicion.*`/
   `evaluacion.*`, línea ~51-58). `mejora.leer` queda fuera, igual que
   `medicion.leer`/`evaluacion.leer`.

En el caso de uso: `mejora.${transicion.permiso}` para transiciones
(`mejora.editar` al enviar a revisión, `mejora.aprobar` al
aprobar/rechazar — mismo patrón `permiso: 'editar'|'aprobar'` de
`estado-plan.ts`), y `mejora.crear`/`mejora.eliminar` directos para las
operaciones homónimas.

`docs/arquitectura/roles-y-permisos.md` declara ser "descripción a partir
de" `seed.ts` + `politica-de-autorizacion.ts` — al tocar esos dos archivos,
este ciclo también agrega la fila de Plan de Mejora a las tablas de rol
(§2-§7 del documento) y a la lista de permisos acotados de §1.

Auditoría: agregar `'PlanMejora'` a `ENTIDADES_AUDITABLES` en
`domain-event.ts`. Eventos en `mejora/domain/events/eventos-mejora.ts`:
`PlanMejoraCreado`, `PlanMejoraEliminado`, `PlanMejoraTransicionado`,
`ImplementacionActualizada`, `EvidenciaCargada`, `EvidenciaEliminada`,
`RetroalimentacionRegistrada` — todos extendiendo
`abstract class EventoMejora extends DomainEvent { readonly entidad = 'PlanMejora'; }`,
publicados vía la misma `PublicadorDeEventos` (`BitacoraListener` no cambia).

## 10. Errores

Reutiliza `ReglaDeNegocioViolada`, `NoEncontrado`, `AccesoDenegado` — ya
existentes, sin necesidad de nuevas clases de error.

## 11. Pruebas

Strict TDD. Unit: `estado-implementacion.spec.ts` (VO puro),
`codigo-mejora.spec.ts` (función pura), `gestionar-planes-mejora.spec.ts`
(casos de uso, dobles de puerto — mismo estilo que
`gestionar-planes-evaluacion.spec.ts`, incluida la tabla de estados
permitidos/bloqueados de §2b como matriz de casos). Cobertura ≥80% en
domain/application.

## 12. Decisiones tomadas en este diseño

1. `PlanMejora` es un agregado único con discriminador de aspecto, no tres
   entidades — impuesto por el propio requisito (§5.2/5.3 comunes).
2. Estado de implementación es un **enum fijo** (`Pendiente|EnProceso|Completado`),
   no una lista configurable — el requisito dice "por ejemplo" pero no exige
   configurabilidad en ninguna RN, y no hay precedente de listas
   configurables para estados en el resto del proyecto.
3. Los campos de seguimiento (implementación, evidencias, retroalimentación)
   se bloquean también en `En revisión`/`Aprobado`, no solo se abren en
   `Vigente` — lectura literal de que la RN solo exceptúa "Vigente" (ver
   tabla de §2b). Si la intención real de negocio era otra, es un cambio de
   una condición en un solo lugar (`actualizarImplementacion` y afines).
4. RF-PJ-002 se implementa sin validación de existencia cross-módulo — mismo
   movimiento que RF-PE-041/2c-D, con comentario explícito en el código.
5. No hay constraint de unicidad de `codigo` a nivel de base de datos; la
   unicidad la garantiza la función pura + `codigosDe(ámbito)`, igual que en
   `evaluacion`/`medicion`.

## 13. Lo que este diseño no resuelve

- La forma exacta de la referencia polimórfica para el aspecto Competencia
  (¿`competenciaId` + `periodoId` sueltos, o una referencia a un registro de
  "medición de competencia en periodo" ya existente en `evaluacion`?) — se
  decide en 2c-J-B junto con RF-PJ-026/027/028.
- El puerto cross-módulo real hacia Criterios de Acreditación
  (`AcreditacionPort`) y su adapter — 2c-J-B.
- Generación, exportación (Excel/PDF), versionado, histórico de
  modificaciones y búsqueda — 2c-J-C.
- Validación integral real (RF-PJ-042), aprobación con
  responsable/fecha, rechazo con comentario obligatorio, y el cierre formal
  de permisos/auditoría (RF-PJ-043 a 046) — 2c-J-D. Los permisos base
  (`mejora.crear/editar/eliminar/aprobar/leer`) ya quedan resueltos en
  2c-J-A (§9); lo que falta en 2c-J-D es la restricción fina de
  RF-PJ-043/044 si exige algo más que el permiso ya acotado por carrera.
