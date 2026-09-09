# Plan de Mejora · ciclo 2c-J-B — los tres aspectos

## 1. Alcance

Cubre RF-PJ-020 a RF-PJ-031: Criterios de Acreditación (§5.4), Objetivos
Educacionales (§5.5) y Competencias (§5.6). De rebote, este ciclo también
resuelve dos deudas que 2c-J-A dejó explícitamente documentadas y que no
tienen sentido en un ciclo aparte:

- El fail-closed de `mejora.crear/editar/eliminar/aprobar` (`carreraId: null`
  en `gestionar-planes-mejora.use-case.ts`).
- El `impactoDeInactivar` de RF132 (`plan-estudios/criterio.repository.ts`),
  hardcodeado en `0` con un comentario que literalmente dice "reemplazar por
  un `count` [...] al construir Plan de Mejora".

**Sigue fuera de 2c-J-B:** exportación/versionado (RF-PJ-032 a 038 →
2c-J-C), envío a revisión/aprobación/validación integral real
(RF-PJ-039 a 042, 2c-J-D — aunque las alertas de mínimo de RF-PJ-022/025 sí
entran aquí, porque son del propio §5.4/5.5, no de aprobación).

## 2. Los hallazgos — nueve, hay que ser preciso

**a) El fail-closed se arregla SIN el puerto nuevo.** La razón por la que
2c-J-A pasó `carreraId: null` fue asumir que había que resolver la carrera
*desde el elemento asociado* (criterio → su carrera). Pero
`AuthorizationPort.carreraACargoDe(actor.id)` **ya existe** y ya es lo que
usan `medicion`/`evaluacion` para sus propias operaciones de escritura — la
carrera de un `PlanMejora` es la del actor que lo crea, no la del elemento
al que se asocia. Esto separa dos cosas que 2c-J-A tenía mezcladas: la
carrera para *RBAC* (siempre la del actor) y la validación de que el
elemento elegido *pertenece* a esa carrera (un chequeo de negocio aparte,
no de permisos).

**b) `AcreditacionPort` (nuevo) es para llenar la pantalla y validar
consistencia — no para RBAC.** Envuelve `RepositorioCriterioPort` de
`plan-estudios` para poder: listar criterios activos de una carrera
(RF-PJ-020) y confirmar que el criterio elegido es de la carrera del actor
(si no lo es, error de negocio, no de permisos).

**c) Objetivos Educacionales no tienen carrera propia — RN1 de RF-PJ-023 ya
lo dice.** Son catálogo institucional (N:M con planes de estudios, ver
`ObjetivoEducacional`/`PlanObjetivo` en el schema), no cuelgan de una única
carrera. No hay chequeo de consistencia elemento↔carrera para este aspecto
— sería inventar una restricción que el requisito no pide (RN1: "este
submódulo únicamente los consume, sin requerir una extensión adicional").
`AcreditacionPort` envuelve también `RepositorioObjetivoPort.listar/porId`
para este aspecto, solo para poblar la selección.

**d) Competencias NO necesitan `AcreditacionPort`.** Necesitan
`RepositorioPlanEvaluacionPort`, `RepositorioPlanMedicionPort` y
`RepositorioConfiguracionEvaluacionPort` — los tres YA existen, dentro de
`mejora-continua`. La regla de fronteras del proyecto solo vigila los saltos
de `mejora-continua` hacia `plan-estudios`/`auth`/`auditoria`
(`aislamiento.spec.ts`); entre submódulos hermanos de `mejora-continua`
(`medicion`, `evaluacion`, `mejora`) ya es patrón aceptado inyectarse
puertos entre sí directamente — `GestionarPlanesEvaluacion` ya inyecta
`RepositorioPlanMedicionPort` hoy. `GestionarPlanesMejora` va a inyectar los
tres puertos de `evaluacion`/`medicion` de la misma forma.

**e) El "% del periodo anterior" (RF-PJ-028) no es un método directo —
se ensambla.** No existe hoy ningún "dame el porcentaje del periodo
anterior de esta competencia". Se compone así, en el caso de uso:
`planEvaluacion.planMedicionId` → `RepositorioPlanMedicionPort.porId(...)
.periodos` (con su `orden`) → identificar el periodo con `orden` inmediato
anterior al seleccionado → `RepositorioConfiguracionEvaluacionPort
.del(planEvaluacionId).mediciones` filtrado por `competenciaId` + ese
`periodoId` → `porcentajeAlcanzado`. Si no hay periodo anterior o no tiene
medición registrada, `null` (RF-PJ-028, flujo alternativo).

**f) `impactoDeInactivar` es el primer caso de dependencia inversa del
proyecto — hay que decidirlo con cuidado.** El dato que necesita
`plan-estudios` (cuántos `PlanMejora` referencian un criterio) vive en
`mejora-continua`. El patrón existente (`ContenidoCurricularPort`) supone
que el puerto y su adaptador viven en el módulo *dueño del dato*, y el
módulo que lo necesita solo importa el tipo del puerto e inyecta la
implementación vía `app.module.ts`. Se replica igual, en la dirección
inversa: el puerto se declara y se implementa en `mejora`, y
`plan-estudios` lo consume — sigue siendo "un módulo no lee la tabla del
otro directamente, habla por un puerto", solo que el dueño del dato ahora es
el módulo consumidor de siempre. No hace falta relajar
`no permitir que dos módulos compartan tablas` — no la comparten, hablan
por un puerto igual que en todos los demás casos.

**g) Referencia polimórfica de Competencia: tres campos, no dos.**
`planEvaluacionId` + `competenciaId` + `periodoId` (id real de
`DatosPeriodo`, no un string tipo "2026-I"). Se necesita `planEvaluacionId`
guardado en el propio `PlanMejora` porque el cálculo de §2e depende de
saber a qué plan de evaluación pertenece, y no hay forma de derivarlo solo
del `periodoId`.

**h) El mínimo configurable de RF-PJ-022/025 es una tabla singleton, no un
sistema de configuración genérico.** El propio RN dice que debe ser
configurable, pero no hay ningún requisito de administrarlo desde una
pantalla en este bloque — se modela como una fila única con los dos
umbrales, editable solo por migración/seed por ahora; la pantalla de
administración (si se pide) es una extensión, no parte de 2c-J-B.

**i) El ámbito del código para Competencia es "por periodo", no
"por competencia".** RF-PJ-003 RN2 lo dice literalmente: "por criterio de
acreditación, por objetivo educacional, o **por periodo académico** en el
caso de competencias" — no "por competencia y periodo". Dentro de un mismo
periodo, todos los planes de mejora de competencias (sin importar de cuál
competencia) comparten la misma secuencia de códigos. Es una asimetría real
del requisito, no un error de transcripción — RF-PJ-029 RN1 confirma que
una competencia puede tener varios planes en el mismo periodo, así que el
código sigue siendo el discriminador de unicidad dentro del periodo.

## 3. Modelo de datos — migración incremental sobre 2c-J-A

```prisma
model PlanMejora {
  // ... campos ya existentes de 2c-J-A ...
  carreraId       String              // NUEVO, no nullable — resuelto del actor al crear
  planEvaluacionId String?            // NUEVO, solo aspecto=COMPETENCIA
  // competenciaId, periodoId ya existían como nullable desde 2c-J-A
}

model ParametroPlanMejora {
  id                      Int     @id @default(1)
  minimoAccionesCriterio  Int     @default(1)
  minimoAccionesObjetivo  Int     @default(1)
}
```

`carreraId` se backfillea en la migración con un valor centinela imposible
de alcanzar en producción real solo si hiciera falta — en la práctica no
hace falta backfill porque **no existe ningún `PlanMejora` real todavía**
(2c-J-A cerró con las escrituras denegadas por el fail-closed, así que la
tabla está vacía en cualquier entorno que no sea de pruebas). Se agrega
como columna obligatoria directamente.

## 4. Puertos

**Nuevo, en `plan-estudios/application/ports/acreditacion-cross-modulo.port.ts`**
(nombre distinto de `acreditacion.port.ts` para no confundirlo con el
interno):

```ts
export interface AcreditacionPort {
  criteriosActivosDe(carreraId: string): Promise<DatosCriterioMejora[]>;
  criterioPorId(id: string): Promise<DatosCriterioMejora | null>; // incluye carreraId
  objetivosEducacionales(): Promise<DatosObjetivoMejora[]>;       // catálogo global
  objetivoPorId(id: string): Promise<DatosObjetivoMejora | null>;
}
export const ACREDITACION_PORT = Symbol('AcreditacionPort');
```

Adaptador `AcreditacionAdapter` en `plan-estudios/infrastructure/`, envuelve
`RepositorioCriterioPort`/`RepositorioObjetivoPort` ya existentes — no
reimplementa nada, solo traduce forma.

**Nuevo, en dirección inversa —
`mejora/application/ports/impacto-plan-mejora.port.ts`**:

```ts
export interface ImpactoPlanMejoraPort {
  contarVinculados(aspecto: AspectoPlanMejora, elementoId: string): Promise<number>;
}
export const IMPACTO_PLAN_MEJORA = Symbol('ImpactoPlanMejoraPort');
```

Implementado por `PlanMejoraRepositoryPrisma` (ya existe desde 2c-J-A, solo
gana un método). `app.module.ts` inyecta este puerto en
`GestionarCriterios` (de `plan-estudios`), y `criterio.repository.ts`
reemplaza el `return { planesMejoraVinculados: 0 }` hardcodeado por la
llamada real. Mismo mecanismo de siempre: `useFactory` + DI central, ningún
`import` cruzado de código entre módulos.

**Guardias de aislamiento — obligatorio, no opcional.** Verificado:
`mejora-continua/aislamiento.spec.ts` vive dentro de `mejora-continua/` y
solo vigila lo que ese módulo importa hacia afuera; no tiene visibilidad de
lo que `plan-estudios` importa. El puerto inverso de §2f/§4 introduce la
primera dependencia circular entre módulos de primer nivel del proyecto
(`mejora-continua → plan-estudios` ya existía; ahora también
`plan-estudios → mejora-continua`, vía `ImpactoPlanMejoraPort`) — no rompe
"hablar por puerto, no compartir tabla" (§3.2 de CLAUDE.md), pero sí queda
sin vigilancia automática si no se agregan estas dos piezas, ambas dentro
del alcance de 2c-J-B:

1. `PUERTO_PERMITIDO` en `mejora-continua/aislamiento.spec.ts` pasa de un
   string único a una lista (`contenido-curricular.port.js`,
   `acreditacion-cross-modulo.port.js`).
2. Nueva `plan-estudios/aislamiento.spec.ts`, misma forma que la existente
   pero en la dirección opuesta: solo permite importar de
   `mejora-continua/` el archivo `ports/impacto-plan-mejora.port.js`.

**Reutilizados sin cambios:** `ContenidoCurricularPort`,
`RepositorioPlanEvaluacionPort`, `RepositorioPlanMedicionPort`,
`RepositorioConfiguracionEvaluacionPort`, `AuthorizationPort`
(`carreraACargoDe`, ya usado — ver §2a).

## 5. Casos de uso

`GestionarPlanesMejora.crear` gana la resolución real de `carreraId` y la
validación por aspecto:

```ts
const carreraId = await this.autorizacion.carreraACargoDe(actor.id);
if (!carreraId) throw new AccesoDenegado('El usuario no dirige ninguna carrera.');
await this.exigir(actor, 'mejora.crear', carreraId); // deja de ser null

switch (datos.aspecto) {
  case 'CRITERIO_ACREDITACION': {
    const criterio = await this.acreditacion.criterioPorId(datos.criterioAcreditacionId);
    if (!criterio) throw new NoEncontrado('el criterio de acreditación', datos.criterioAcreditacionId);
    if (criterio.carreraId !== carreraId)
      throw new ReglaDeNegocioViolada('El criterio no pertenece a la carrera del usuario.');
    break;
  }
  case 'OBJETIVO_EDUCACIONAL': {
    const objetivo = await this.acreditacion.objetivoPorId(datos.objetivoEducacionalId);
    if (!objetivo) throw new NoEncontrado('el objetivo educacional', datos.objetivoEducacionalId);
    // sin chequeo de carrera — RN1 de RF-PJ-023, ver §2c.
    break;
  }
  case 'COMPETENCIA': {
    const base = await this.evaluaciones.porId(datos.planEvaluacionId);
    if (!base) throw new NoEncontrado('el plan de evaluación base', datos.planEvaluacionId);
    if (base.tipo !== 'DIRECTA')
      throw new ReglaDeNegocioViolada('El plan de mejora de competencias exige un plan de evaluación Directa.');
    if (base.estado !== 'Aprobado' && base.estado !== 'Vigente')
      throw new ReglaDeNegocioViolada('El plan de evaluación base debe estar Aprobado o Vigente.');
    const planEstudios = await this.curricular.planPorId(/* vía plan de medición */);
    if (planEstudios.carreraId !== carreraId)
      throw new ReglaDeNegocioViolada('El plan de evaluación base no pertenece a la carrera del usuario.');
    break;
  }
}
```

Nuevo método privado `porcentajeDelPeriodoAnterior(planEvaluacionId,
competenciaId, periodoId)` implementando el ensamblaje de §2e — usado al
armar el input mostrado en RF-PJ-028, no al guardar (es un dato mostrado,
no almacenado como snapshot, para no arriesgar que quede desincronizado si
el periodo anterior se recalcula).

`GestionarCriterios.impactoDeInactivar` (en `plan-estudios`) pasa de
devolver `0` fijo a `await this.impactoPlanMejora.contarVinculados
('CRITERIO_ACREDITACION', id)`.

Alertas RF-PJ-022/025: método de solo lectura (no bloquea nada, RN1) que
cuenta acciones por elemento y compara contra
`ParametroPlanMejora`.

## 6. Permisos

Sin cambios sobre lo que ya quedó en 2c-J-A (`mejora.leer/crear/editar/
eliminar/aprobar`, acotados por carrera). Este ciclo no agrega permisos
nuevos — lo que cambia es que `mejora.crear/editar/eliminar/aprobar` **dejan
de estar fail-closed** en la práctica, porque ahora `carreraACargoDe`
resuelve un valor real en vez de recibir `null`.

## 7. Pruebas

Strict TDD. Unit: `acreditacion-cross-modulo.spec.ts` (adaptador, con doble
de `RepositorioCriterioPort`/`RepositorioObjetivoPort`),
`gestionar-planes-mejora.spec.ts` ampliado (creación por cada aspecto,
rechazo por carrera no coincidente, cálculo de porcentaje anterior con
casos límite: primer periodo, periodo sin medición registrada),
`gestionar-criterios.spec.ts` ampliado (impacto real en vez de `0` fijo),
`parametro-plan-mejora` (alertas de mínimo). Cobertura ≥80% domain/application.
Integración: extender `plan-mejora.int.spec.ts` con creación real por
aspecto contra Postgres, y un caso que created un `PlanMejora` de
competencia y verifique el join manual de periodos/mediciones.

## 8. Decisiones tomadas en este diseño

1. La carrera de un `PlanMejora` es siempre la del actor
   (`carreraACargoDe`), nunca derivada del elemento asociado — separa RBAC
   de validación de negocio.
2. `AcreditacionPort` solo envuelve Criterios y Objetivos; Competencias usa
   puertos ya existentes dentro de `mejora-continua`, sin puerto nuevo.
3. Objetivos Educacionales no llevan chequeo de consistencia con la carrera
   — lectura literal de RN1/RF-PJ-023.
4. `impactoDeInactivar` se resuelve con un puerto declarado e implementado
   en `mejora` (dueño del dato), consumido por `plan-estudios` — mismo
   patrón de siempre, dirección inversa por primera vez en el proyecto.
5. El "% del periodo anterior" se calcula en caliente, no se guarda como
   snapshot en el `PlanMejora`.
6. El ámbito de unicidad de código para Competencia es por periodo, no por
   competencia+periodo — lectura literal de RF-PJ-003 RN2.
7. El mínimo configurable de RF-PJ-022/025 es una tabla singleton simple,
   sin pantalla de administración en este ciclo.
8. La dependencia circular que introduce el puerto inverso (§2f) se acepta
   — un bus de eventos para un contador informativo sería sobre-ingeniería
   — pero se blinda con guardias automáticas simétricas en ambos módulos
   (ver §4), en vez de quedar como acuerdo tácito entre desarrolladores.

## 9. Lo que este diseño no resuelve

- Pantalla de administración del `ParametroPlanMejora` — extensión futura,
  no pedida por ningún RF de este bloque.
- Generación, exportación, versionado, histórico, búsqueda (RF-PJ-032 a
  038) — 2c-J-C.
- Envío a revisión, aprobación, rechazo, validación integral real
  (RF-PJ-039 a 042) y el cierre formal de RF-PJ-043/044 — 2c-J-D.
- RF-PJ-031 (trazabilidad hacia Plan de Medición) queda dentro del alcance
  nominal de §5.6 pero es un campo opcional de referencia simple
  (`planMedicionAfectadoId` en `PlanMejora`, sin lógica adicional) — se
  agrega en este ciclo por ser trivial, pero no tiene caso de uso propio
  más allá de guardarlo.
