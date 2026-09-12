# Plan de Mejora · pantallas base — diseño

## 1. Alcance

Plan de Mejora (RF-PJ) tiene todo su backend construido desde 2c-J-A/2c-J-B
(RF-PJ-000 a RF-PJ-031) pero **ninguna pantalla**: el propio diseño de 2c-J-A
lo dejó explícito ("sin pantalla dedicada en este ciclo... construir una
pantalla ahora significaría rehacerla") y 2c-J-B no lo resolvió tampoco. Todo
se verifica hoy solo con Supertest.

Este ciclo cierra esa deuda: construye el primer conjunto de pantallas del
submódulo — listado, creación, detalle con definición/seguimiento/historial —
sobre la API ya existente. **No** cubre RF-PJ-032 a 038 (generación,
exportación, versionado, búsqueda avanzada) — eso es el ciclo siguiente
(nombrado 2c-J-C en el diseño de 2c-J-B), que necesita esta base para
apoyarse. Tampoco cubre envío a revisión/aprobación *con validación integral*
real (RF-PJ-039 a 042, 2c-J-D) — las transiciones ya existen desde 2c-J-A y
esta base solo las expone tal cual están, sin añadir reglas nuevas.

**Decisión de forma (aprobada en brainstorming):** un módulo de nivel
superior igual a medición y evaluación (`/mejora-continua/mejora`), no
pantallas incrustadas en Criterios/Atributos/Competencias. Mismo patrón de
rutas, mismos componentes compartidos, y deja lista la infraestructura de
listado que 2c-J-C necesita extender con búsqueda real.

## 2. Qué falta en el backend — mínimo, no toca casos de uso existentes

Dos huecos, ninguno más:

**a) No existe `GET /planes-mejora`.** El comentario de cabecera del
controlador actual lo dice literalmente: "Sin `GET /planes-mejora`
(listado/búsqueda): RF-PJ-038 es 2c-J-C." Este ciclo añade un listado básico
— sin texto, sin filtro por aspecto/estado, eso es RF-PJ-038 — filtrado solo
por la carrera del actor, mismo criterio que `GET /criterios?carreraId=`.

Nuevo método de puerto:

```typescript
// application/ports/plan-mejora.port.ts
export interface RepositorioPlanMejoraPort {
  // ...ya existente...
  /** Listado básico por carrera, sin filtros — RF-PJ-038 los añade en 2c-J-C. */
  listarDeCarrera(carreraId: string): Promise<readonly DatosPlanMejora[]>;
}
```

Nuevo caso de uso `GestionarPlanesMejora.listar(actor, carreraId)`: valida
`puede(actor, 'mejora.leer', carreraId)` (mismo patrón que `porId`, que ya
hace ese chequeo) y delega al puerto. Nuevo endpoint:

```typescript
@Get()
@ApiOperation({ summary: 'Listado de planes de mejora de una carrera (RF-PJ-038, básico)' })
async listar(@ActorActual() actor: Actor, @Query('carreraId', ParseUUIDPipe) carreraId: string) {
  return this.casos.listar(actor, carreraId);
}
```

Va **antes** de las rutas estáticas existentes en el controlador (no
conflictúa: es la raíz sin segmento, Nest no tiene ambigüedad con
`competencia/porcentaje-anterior` ni `:id`).

**b) Nada más.** El historial (RF-PJ-036/037) no necesita ni un solo cambio
de backend: `PlanMejora` ya emite sus eventos con `entidad = 'PlanMejora'`
(`eventos-mejora.ts`), y el endpoint genérico `/auditoria` (fuera de este
módulo, en el módulo `auditoria` de la raíz — así es como medición y
evaluación ya resuelven lo mismo, sin que un módulo consulte las tablas de
otro) acepta cualquier `entidad`+`entidadId`. El permiso `auditoria.leer_entidad`
ya está en el seed de Coordinador académico y Director de carrera. Solo hace
falta el lado del cliente:

```typescript
// api/mejora.api.ts
export async function historialDeMejora(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>('/auditoria', {
    entidad: 'PlanMejora',
    entidadId: id,
    limite: 50,
  });
}
```

Todo lo demás (crear, editar definición, transicionar, seguimiento,
evidencias, trazabilidad hacia medición, alertas de mínimo) ya existe y no
se toca.

## 3. Pantallas

### `PlanesMejoraPage.tsx` — `/mejora-continua/mejora`

Mismo patrón que `CriteriosPage.tsx`: un `<Selector>` de carrera (derivado de
`useCarreras()`, primera disponible por defecto — sin `useEffect`, el mismo
patrón que evita el problema de `react-hooks/set-state-in-effect` ya resuelto
en `ConfiguracionDelPeriodo.tsx`/`ConfiguracionDelAnio.tsx`), y debajo una
tabla con: código, aspecto (etiqueta legible — "Criterio de Acreditación" /
"Objetivo Educacional" / "Competencia"), nombre del elemento asociado
(resuelto por id contra los catálogos ya cargados: `useCriterios`,
`useAtributos`, `useCompetencias`), estado documental (`Badge`, mismo mapa de
tonos que las gemelas), estado de implementación. Fila con enlace `EV-`-like
por código, hacia el detalle. `EstadoVacio` si no hay planes para la carrera
elegida. Botón "Nuevo plan de mejora" (bajo `SiPuede permiso="mejora.crear"`)
abre el modal de creación.

### Modal de creación

Tres pasos dentro del mismo modal, sin wizard de páginas — mismo patrón que
"Nuevo plan de evaluación" (un solo `<Selector>` tras otro, habilitados en
cascada):

1. **Aspecto** — Criterio de Acreditación / Objetivo Educacional /
   Competencia (RF-PJ-001).
2. **Elemento** — el `<Selector>` cambia de fuente según el aspecto elegido:
   `useCriterios(carreraId)`, `useAtributos()` o `useCompetencias()` (RF-PJ-002).
   Se limpia al cambiar de aspecto — mismo cuidado que
   `ConfiguracionDelAnio.tsx` ya tuvo con `grupoObjetivo`: un elemento de un
   catálogo no tiene sentido bajo el aspecto equivocado.
3. **Solo si Aspecto = Competencia** (RF-PJ-026/029): un `<Selector>` de plan
   de evaluación Directa base — `listarEvaluaciones({ tipo: 'DIRECTA' })` (la
   función correcta; `basesElegibles` es la de medición y devuelve
   `PlanMedicion[]`, no sirve aquí), filtrado en el cliente a
   `estado === 'Aprobado' || estado === 'Vigente'` (los literales del dominio,
   no el enum de Postgres — mismo vocabulario que ya usa `EstadoMedicion` en
   `domain/tipos.ts`) porque RF-PJ-026 acepta ambos y el endpoint solo filtra
   por un valor de `estado` a la vez — y, una vez elegido, un `<Selector>` de
   periodo (de `vista.periodos` del plan elegido, mismo shape que ya consume
   `PlanEvaluacionPage`). La validación final la hace
   `resolverBaseCompetencia` en el backend
   (`gestionar-planes-mejora.use-case.ts:512-547`, ya construida en 2c-J-B:
   tipo Directa, estado Aprobado/Vigente, y que el plan de estudios base
   pertenezca a la carrera del actor) — este filtro del cliente es solo para
   no ofrecer opciones que el servidor rechazaría.

Botón "Crear" llama `POST /planes-mejora` con `{ aspecto, elementoId,
periodoId?, planEvaluacionId? }` y navega al detalle de lo creado — mismo
patrón que "Nuevo plan de evaluación".

### `PlanMejoraPage.tsx` — `/mejora-continua/mejora/:id`

Misma estructura de cabecera que `PlanEvaluacionPage.tsx`/`PlanMedicionPage.tsx`
(código en `<h1>`, migas, tarjeta "Estado del plan" con los botones de
`transicionesDisponibles(plan.estado).filter(puede('mejora.'+permiso))` —
idéntico a como evaluación filtra con su propio prefijo).

Tarjetas, en este orden:

1. **Estado del plan** — transiciones + fecha "Aprobado el" si aplica
   (mismo patrón ya cerrado en 2c-E; aquí `PlanMejora` no tiene todavía
   `aprobadoPorId`/`aprobadoEn` en el esquema — **no se añaden en este
   ciclo**: RF-PJ-039 a 042 son 2c-J-D, y esos campos son de aprobación, no
   de exhibición de pantallas base. La tarjeta solo muestra el estado y las
   transiciones ya existentes.)
2. **Elemento asociado** (solo lectura) — a qué criterio/objetivo/competencia
   pertenece, resuelto contra el catálogo correspondiente. Para Competencia,
   además el plan de evaluación base y el periodo, y el "% del periodo
   anterior" ya calculado por el endpoint existente
   (`porcentajeAnteriorDeCompetencia`).
3. **Definición** (RF-PJ-006 a RF-PJ-013) — nombre, causa raíz, justificación,
   input (solo Criterio/Objetivo — Competencia no lo muestra, RF-PJ-028),
   plazo, recursos, metas, responsable. Editable solo en Borrador
   (`plan.estado === 'BORRADOR'`), mismo guardián que ya impone el backend.
4. **Seguimiento** (RF-PJ-014 a RF-PJ-019) — selector de estado de
   implementación, lista de evidencias (subir referencia+nombre, eliminar),
   logro de meta e impacto. Editable en Borrador y en Vigente — el mismo
   guardián de dos estados que ya vive en el backend
   (`permiteActualizarSeguimiento`); la pantalla solo refleja lo que el
   backend ya permite, no decide nada nuevo.
5. **Historial** (RF-PJ-036/037) — pestaña con `<HistorialDelPlan
   eventos={historial ?? []} />`, el componente ya compartido por medición y
   evaluación, sin ningún cambio.

No hay pestañas de Documentos/Versiones — esas llegan con RF-PJ-032 a 038 en
el ciclo siguiente, cuando también tenga sentido decidir si conviene
convertir esta página a pestañas ARIA reales (como hizo evaluación en 2c-E)
o si con tarjetas apiladas basta mientras tanto. Esta base usa tarjetas
apiladas simples, igual que `PlanMedicionPage.tsx` antes de que evaluación
introdujera pestañas.

## 4. Permisos

Ninguno nuevo. Ya sembrados desde 2c-J-A: `mejora.leer`, `mejora.crear`,
`mejora.editar`, `mejora.eliminar`, `mejora.aprobar` — los cinco acotados por
carrera desde 2c-J-B. La pantalla los consume vía `SiPuede`/`puede()`, nunca
decide autorización por su cuenta.

## 5. Pruebas

- **Backend:** unit para `GestionarPlanesMejora.listar` (incluye el caso
  fail-closed si el actor no tiene `mejora.leer` en esa carrera — mismo
  patrón que el resto del módulo); integración para el nuevo `GET
  /planes-mejora` contra Postgres real.
- **Frontend:** component tests para `PlanesMejoraPage` (listado, estado
  vacío, filtro de carrera), el modal de creación (los tres pasos en
  cascada, incluida la limpieza del elemento al cambiar de aspecto — mutation
  test explícito, seguido el criterio de todo el ciclo 2c-E), y
  `PlanMejoraPage` (las cinco tarjetas, el guardián de edición por estado).
- **E2E:** un recorrido por cada uno de los tres aspectos (crear, ver el
  detalle, editar definición en Borrador, avanzar una transición), más
  accesibilidad (`axe-core`) en listado y detalle con contenido real — un
  plan creado, no la pantalla vacía, mismo criterio ya aprendido en 2c-A y
  reforzado en 2c-E.
- La semilla de datos E2E (`preparar-e2e.ts`) necesita al menos un criterio,
  un objetivo educacional y una competencia elegibles por carrera para poder
  crear los tres tipos de plan de mejora sin depender del estado dejado por
  otros ficheros.

## 6. Decisiones tomadas en este diseño

1. **Listado por carrera, no global.** Coherente con que `PlanMejora.carreraId`
   ya existe para los tres aspectos (incluido Objetivo Educacional, que no
   tiene carrera propia pero sí hereda la del actor que creó el plan, por
   diseño de 2c-J-B). — Coste si es la decisión equivocada: al llegar
   RF-PJ-038, extender el filtro es aditivo, no una reescritura.
2. **Sin pestañas ARIA todavía.** Sección 3 ya lo justifica: introducirlas
   ahora sería adivinar la forma final antes de que 2c-J-C añada Documentos y
   Versiones, que es cuando de verdad hacen falta varias vistas dentro de la
   misma página.
3. **No se tocan `aprobadoPorId`/`aprobadoEn` ni el esquema de `PlanMejora`.**
   Es trabajo de 2c-J-D (aprobación real), no de esta base de pantallas.

## 7. Lo que este diseño no resuelve

- RF-PJ-032 a 038 (generación, exportación, versionado, búsqueda con texto y
  filtros) — 2c-J-C.
- RF-PJ-039 a 042 (envío a revisión con validación integral real, aprobación
  con rechazo motivado) — 2c-J-D.
- La deuda de "competencia no necesariamente asociada a un curso" (nota de
  memoria del 11 de septiembre de 2026) — no se toca en este ciclo; el
  aspecto Competencia de Plan de Mejora sigue asumiendo la base de evaluación
  Directa tal como existe hoy.
