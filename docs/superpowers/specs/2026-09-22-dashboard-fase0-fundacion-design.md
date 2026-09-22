# Dashboard por rol — Fase 0: fundación

## 1. Por qué este ciclo existe y dónde acaba

El usuario pidió una reconstrucción grande: un AppShell nuevo, tres
vistas de inicio por rol (Administrador, Director de Carrera, Docente),
una librería de componentes propia y un motor de "acción recomendada"
calculado sobre reglas de negocio reales. Es demasiado para un solo
ciclo — se descompuso en sub-proyectos, cada uno con su propio
spec → plan → implementación:

- **Fase 0** (este documento): la fundación que comparten las tres
  vistas — rol expuesto en `auth`, tres módulos nuevos
  (`academico` para Facultad/Carrera, `objetivos-educacionales` y
  `atributos-graduado` para los Criterios 02 y 03), y el AppShell del
  frontend (navegación agrupada, `ScopeSelector`, tokens de color
  reconciliados).
- **Fases 1–3**: una por cada vista de rol (Admin, Director, Docente),
  construidas sobre esta fundación.
- **Fase 4**: el motor de acciones recomendadas, al final, porque
  necesita los KPIs reales que las fases 1-3 exponen.

Este ciclo **no construye ninguna pantalla de inicio todavía**. Termina
cuando: (a) el login expone los roles del usuario, (b) Facultad/Carrera,
Objetivo Educacional y Atributo del Graduado viven cada uno en su propio
módulo backend con el mismo aislamiento que ya tienen
`plan-estudios`/`mejora-continua` entre sí, y (c) el `AppLayout` del
frontend soporta un árbol de navegación agrupado por secciones con el
`ScopeSelector`, aunque los ítems que cuelguen de él por ahora sigan
siendo los mismos de hoy (las fases 1-3 son las que agregan contenido
nuevo bajo cada sección).

## 2. Decisiones ya tomadas con el usuario

Confirmadas explícitamente durante el brainstorming, no abiertas a
discusión en la fase de implementación:

1. **Colores**: se reutilizan los tokens ya definidos en
   `apps/web/src/styles/global.css`. Donde la paleta que trajo el
   usuario coincide (`--color-uc-primary`, `--color-uc-v1`,
   `--color-uc-v2`, `--color-uc-lila`), se usa tal cual. Donde no
   coincide (fondo, borde, texto secundario/tenue, morado oscuro), se
   mantiene el valor **ya establecido** en `global.css` — no se
   recolorea el resto de la app. Solo se agrega un token nuevo para el
   estado "morado / en curso", que hoy no tiene equivalente.
2. **Resolución de rol**: el modelo de `auth` es N-M real (un usuario
   puede tener varios roles). `/auth/yo` expone el array completo de
   códigos de rol, sin resolverlo a uno solo en el backend. El frontend
   decide qué vista mostrar con una función de prioridad pura y
   testeada — ver §4.
3. **Alcance de `ObjetivoEducacional` y `AtributoGraduado`**: ambos se
   quedan como catálogo institucional, sin `carreraId` propio (Objetivo
   ya lo documenta así explícitamente en el código, RF-PJ-023 RN1;
   Atributo nunca tuvo ese campo). Lo que cambia es **dónde vive el
   código, no el modelo de datos**: cada uno pasa a su propio módulo
   backend (§2.4). Las futuras pantallas "Criterio 02" y "Criterio 03"
   (Fase 2, Director) filtran/muestran lo ya vinculado a la carrera
   activa vía las tablas puente existentes (`PlanObjetivo`,
   `CompetenciaAtributo`/`PlanAtributo`) — no se agrega ninguna columna
   nueva a ninguno de los dos.
4. **Límite de los módulos nuevos**: tres módulos de primer nivel,
   cada uno con su propio puerto cross-módulo hacia `plan-estudios`
   (mismo molde ya usado entre `mejora-continua` y `plan-estudios`):
   `academico` (Facultad + Carrera + Ciclo, que hoy viven agrupados),
   `objetivos-educacionales` (ObjetivoEducacional) y
   `atributos-graduado` (AtributoGraduado). Los tres van más lejos que
   el único precedente que existía en el código (`AtributoGraduado`
   hoy solo tiene fachada de frontend separada, sin módulo backend
   propio) — decisión explícita del usuario, confirmada dos veces
   durante el brainstorming.
5. **Acceso restringido por carrera** a los dos módulos de criterio: el
   sidebar del mockup del usuario los ubica bajo "MI CARRERA", visibles
   solo para el Director de la carrera activa. Se implementa con el
   mecanismo ya establecido en el proyecto —
   `AuthorizationPort.puede(actorId, permiso, carreraId)`, acotado a
   `carreraACargoDe` — **no** convirtiendo Objetivo/Atributo en
   entidades propias de una carrera. Es una restricción de acceso
   (quién puede gestionarlos desde estas pantallas), no un cambio de
   modelo (§2.3): las filas siguen siendo catálogo institucional
   compartido. Atributo ya tiene los permisos `atributo.leer`/
   `atributo.gestionar` en el seed; falta confirmar si Objetivo ya
   tiene su propio par o hay que agregarlo — se verifica al arrancar
   la implementación, no es una decisión de diseño pendiente.
6. **Integridad referencial Carrera↔Plan, Objetivo↔Plan,
   Atributo↔Competencia/Plan**: las FKs reales de Postgres
   (`PlanEstudios.carreraId`, `PlanObjetivo`, `CompetenciaAtributo`,
   `PlanAtributo`) se mantienen tal cual, cruzando schemas donde haga
   falta (`academico`↔`plan_estudios`,
   `objetivos-educacionales`↔`plan_estudios`,
   `atributos-graduado`↔`plan_estudios`) — Prisma `multiSchema` y
   Postgres lo soportan. No se degradan a ids sueltos como sí es el
   caso, correctamente, entre `auth`/`mejora-continua` y
   `plan-estudios`: ahí la relación es genuinamente débil; aquí un
   Plan sin una Carrera válida, o un vínculo a un Objetivo/Atributo que
   ya no existe, no tienen sentido de negocio. El aislamiento de
   **código** (nunca acceder al repositorio ajeno directamente, solo
   por puerto) se mantiene igual con o sin la FK de base de datos —
   son preocupaciones distintas.

## 3. Arquitectura — pieza 1: rol en `auth`

**Backend** (`apps/api/src/modules/auth/`):

- `application/ports/authorization.port.ts` — `AuthorizationPort` gana
  `rolesDe(usuarioId: string): Promise<readonly string[]>`, mismo
  patrón que el ya existente `permisosDe`. No se toca `puede` ni
  `carreraACargoDe`.
- `infrastructure/authorization.adapter.ts` — implementa `rolesDe`
  reutilizando la misma consulta que ya arma `contextoDe()` (recorre
  `usuario.roles`), devolviendo los códigos (`Rol.codigo`) en vez de
  fundirlos en el `Set` de permisos.
- `application/use-cases/consultar-sesion.use-case.ts` —
  `SesionActual` gana `roles: readonly string[]`.
- `infrastructure/http/sesion.controller.ts` — sin cambios de forma,
  ya delega en `ConsultarSesion`.

**Frontend** (`apps/web/src/features/auth/`):

- `api/auth.api.ts` — `Identidad` gana `roles: string[]`.
- `domain/vista-principal.ts` (nuevo) — función pura
  `vistaPrincipalDe(roles: readonly string[]): RolVista | null` con el
  orden de prioridad `ADMIN_SISTEMA > DIRECTOR_CARRERA >
  COORDINADOR_ACADEMICO > DOCENTE > USUARIO_CONSULTOR`. Devuelve
  `null` si el array viene vacío (caso defensivo, no debería ocurrir
  con un usuario activo). Tests unitarios en §6: un solo rol, varios
  roles (gana el de mayor prioridad), rol desconocido/no mapeado (se
  ignora, no rompe), array vacío.
- `hooks/ProveedorSesion.tsx` — expone `roles` y `vistaPrincipal` en
  `ValorSesion`, calculado una vez al cargar la sesión.
- Si el usuario tiene más de un rol real, un selector simple (no es
  parte de esta fase construir su UI final — alcanza con que
  `ValorSesion` permita cambiar la vista activa en memoria; las Fases
  1-3 son las que le dan una superficie visual).

## 4. Arquitectura — pieza 2: los tres módulos nuevos

Los tres (`academico`, `objetivos-educacionales`, `atributos-graduado`)
calcan el mismo molde ya usado para el aislamiento entre
`plan-estudios` y `mejora-continua`: puerto cross-módulo + adaptador +
test de guardia, en una sola dirección (`plan-estudios` consulta al
módulo nuevo, nunca al revés). Ninguno inventa lógica de dominio nueva
— el CRUD de las tres entidades es hoy anémico y se mantiene así, solo
cambia de casa.

### 4.1 `academico` (Facultad + Carrera + Ciclo)

`apps/api/src/modules/academico/`:

- `application/use-cases/gestionar-facultades.use-case.ts` y
  `gestionar-carreras.use-case.ts` — separadas del actual
  `gestionar-estructura.use-case.ts` (que hoy mezcla ambas clases en
  un archivo), movidas tal cual, sin reescribir su lógica.
- `application/ports/academico.port.ts` — `RepositorioFacultadPort`,
  `RepositorioCarreraPort`, `DatosFacultad`, `DatosCarreraCompleta`
  (movidos desde `plan-estudios/application/ports/estructura.port.ts`
  sin cambiar su forma).
- `application/ports/academico-cross-modulo.port.ts` (nuevo) — lo que
  `plan-estudios` puede seguir consultando: `carreraPorId(id):
  Promise<DatosCarreraResumen | null>`, `carrerasActivas():
  Promise<DatosCarreraResumen[]>` — DTOs planos, nunca la entidad
  completa. Mismo criterio que `acreditacion-cross-modulo.port.ts` ya
  usa desde `mejora-continua` hacia `plan-estudios`.
- `infrastructure/persistence/academico.repository.ts`,
  `infrastructure/http/academico.controller.ts` +
  `dto/academico.dto.ts`, `domain/events/eventos-academico.ts` —
  movidos desde `estructura.repository.ts`/`.controller.ts`/
  `.dto.ts`/`eventos-estructura.ts` respectivamente.

### 4.2 `objetivos-educacionales`

`apps/api/src/modules/objetivos-educacionales/`:

- `application/use-cases/gestionar-objetivos.use-case.ts` — separado
  de `gestionar-catalogo.use-case.ts` (que hoy mezcla `GestionarObjetivos`
  con `GestionarCompetencias`), movido tal cual.
- `application/ports/objetivos.port.ts` — `RepositorioObjetivoPort`
  (movido desde `plan-estudios/application/ports/catalogo.port.ts`).
- `application/ports/objetivos-cross-modulo.port.ts` (nuevo) —
  reemplaza la parte de `AcreditacionCrossModuloPort` (hoy en
  `plan-estudios`) que expone `objetivosEducacionales()`/
  `objetivoPorId(id)` hacia `mejora-continua`. `mejora-continua` pasa a
  consumir este puerto nuevo en vez del de `plan-estudios` para esos
  dos métodos — el resto de `AcreditacionCrossModuloPort` (lo que sí
  es de `plan-estudios`) no se toca.
- `infrastructure/persistence/objetivos.repository.ts`,
  `infrastructure/http/objetivos.controller.ts` + `dto/objetivos.dto.ts`
  — movidos desde `catalogo.repository.ts`/`catalogo.controller.ts`
  (la porción de `ObjetivosController`)/`catalogo.dto.ts`.

### 4.3 `atributos-graduado`

`apps/api/src/modules/atributos-graduado/`:

- `application/use-cases/gestionar-atributos.use-case.ts` — movido tal
  cual desde `plan-estudios/application/use-cases/`.
- `application/ports/atributos.port.ts` — `RepositorioAtributoPort`
  (movido desde `plan-estudios/application/ports/acreditacion.port.ts`
  — el nombre del archivo actual es engañoso, no tiene relación con
  `AcreditacionCrossModuloPort` de §4.2, revisar al mover).
- `application/ports/atributos-cross-modulo.port.ts` (nuevo) — lo que
  `plan-estudios` necesita para seguir calculando cobertura de
  competencias por atributo (`CompetenciaAtributo` es una tabla puente
  con FK real a ambos lados — el puerto expone lectura, la escritura
  de la relación se decide durante el plan de implementación según
  qué módulo "posee" hoy esa tabla puente en el código).
- `infrastructure/persistence/atributos.repository.ts` — movido desde
  `atributo.repository.ts`.
- `infrastructure/http/atributos.controller.ts` + `dto/atributos.dto.ts`
  — nuevo controller propio; hoy las rutas de Atributos cuelgan de
  `CompetenciasController` (`/competencias/atributos`,
  `/competencias/cobertura`) dentro de `catalogo.controller.ts` — se
  extraen a rutas propias (`/atributos-graduado`, a confirmar el
  prefijo exacto durante el plan).

### `plan-estudios`, después de los tres movimientos

- Dejan de vivir ahí `Facultad`/`Carrera`/`Ciclo`, `ObjetivoEducacional`
  y `AtributoGraduado`, junto con su CRUD. Donde `plan-estudios`
  necesite datos de cualquiera de los tres, consume el puerto
  cross-módulo correspondiente — igual que ya hace con
  `AcreditacionPort` en dirección inversa (recibido desde
  `mejora-continua`).
- Las FKs reales que cruzan hacia estos tres módulos se mantienen
  (§2.6) — el cambio es de propiedad de código/módulo, no de
  integridad de datos.

### Prisma (`apps/api/prisma/schema.prisma`)

- Tres schemas nuevos: `@@schema("academico")`,
  `@@schema("objetivos_educacionales")`,
  `@@schema("atributos_graduado")`, agregados a la lista de schemas
  del datasource.
- `Facultad`/`Carrera`/`Ciclo` migran a `academico`;
  `ObjetivoEducacional` a `objetivos_educacionales`; `AtributoGraduado`
  (+ sus tablas puente `CompetenciaAtributo`/`PlanAtributo`, a decidir
  durante el plan si migran con él o se quedan como tabla compartida)
  a `atributos_graduado`. Las FKs cruzadas (§2.6) se mantienen
  explícitas en el modelo.
- Tres migraciones generadas con `prisma migrate dev`, revisadas a
  mano antes de aplicar — mover tablas entre schemas de Postgres es
  `ALTER TABLE ... SET SCHEMA`, no un `DROP`/`CREATE`, así que no hay
  pérdida de datos, pero conviene verificar el SQL generado en los
  tres casos, especialmente las tablas puente de Atributo.

### Test de guardia

Tres archivos nuevos (`apps/api/src/modules/academico/aislamiento.spec.ts`,
`.../objetivos-educacionales/aislamiento.spec.ts`,
`.../atributos-graduado/aislamiento.spec.ts`) + actualización de
`apps/api/src/modules/plan-estudios/aislamiento.spec.ts`:

- `plan-estudios` solo puede importar, de cada módulo nuevo, su
  archivo `*-cross-modulo.port.js` — mismo patrón que la regla ya
  existente para `mejora-continua`.
- Ninguno de los tres módulos nuevos importa nada de `plan-estudios`
  (relación de un solo sentido).

### RBAC por carrera (`objetivos-educacionales`, `atributos-graduado`)

Los casos de uso de estos dos módulos (no `academico`, que es de
alcance institucional/Admin) exigen permiso acotado a la carrera
activa del actor — `AuthorizationPort.puede(actorId, 'objetivo.gestionar'
| 'objetivo.leer', carreraId)` y su equivalente `atributo.*` (ya
existente en el seed). §2.5 tiene el detalle de qué falta verificar
sobre los permisos de Objetivo.

## 5. Arquitectura — pieza 3: AppShell del frontend

**`apps/web/src/app/AppLayout.tsx`**:

- `ENLACES` (array plano de 10 entradas) se reemplaza por una
  estructura de árbol: secciones con título +
  ítems, cada ítem con su `permiso` opcional igual que hoy (el
  filtrado por permiso no cambia, solo la forma de agrupar). Las
  secciones y sus ítems, en esta fase, son **los mismos módulos que
  existen hoy** reorganizados — Fase 0 no agrega ni quita ninguna
  pantalla real, solo cambia cómo se agrupan visualmente.
- El sidebar renderiza secciones colapsables/agrupadas en vez de una
  lista plana.
- **Precisión sobre Objetivos/Atributos**: el backend de estos dos
  (§4.2, §4.3) se mueve en esta fase; el frontend, en cambio, solo
  repunta `ObjetivosPage.tsx`/`AtributosPage.tsx` a las rutas nuevas
  (`api/*.api.ts`) sin reconstruirlas — siguen siendo las mismas
  pantallas de hoy, solo hablando con el backend nuevo. El sidebar
  agrupado "01-08 · Criterios de Acreditación" completo (como en el
  mockup del usuario) es contenido de la **Fase 2 (Director)**, que es
  donde se decide de verdad cómo se navega por carrera activa — acá
  alcanza con que la estructura de árbol del sidebar ya soporte
  agrupar así, sin que Fase 0 tenga que resolver el detalle de cada
  criterio.

**`ScopeSelector`** (nuevo, `shared/components/ui/ScopeSelector.tsx`):

- Caja translúcida en la cabecera del sidebar. Recibe el ámbito activo
  como prop (texto) — en esta fase muestra el nombre de la carrera a
  cargo si `carreraACargo` no es null, o "Universidad Continental" si
  es un rol sin carrera (Admin). El dropdown real (cambiar de ámbito)
  es contenido de una fase futura si hace falta — aquí es la pieza
  visual y su contrato de props, sin lógica de cambio de contexto
  todavía, porque las Fases 1-3 son las que definen qué significa
  "cambiar de ámbito" para cada rol.

**Tokens** (`apps/web/src/styles/global.css`):

- Un token nuevo: `--color-estado-encurso-fg` / `--color-estado-encurso-bg`
  (morado, para el estado "en curso" que no tiene equivalente hoy).
  Nada más se agrega ni se modifica — ver §2.1.

**Componentes base nuevos** (`shared/components/ui/`), sin contenido
real todavía (las Fases 1-3 los llenan con datos reales vía
`@tanstack/react-query`, nunca arrays literales en JSX):

- `KpiCard.tsx` — props tipadas (`label`, `value`, `trend?`).
- `DataPanel.tsx` — panel de tabla con fila tag/título/meta/barra/chip.
- `StatusChip.tsx` — variantes sobre los tokens de estado existentes
  (+ el nuevo "en curso").
- `PendingList.tsx`, `SecondaryCardGrid.tsx`, `ReportBridgeCard.tsx` —
  contenedores de layout, sin lógica de negocio.

`RecommendedActionCard` y el motor de reglas **no** son parte de esta
fase — Fase 4.

## 6. Testing

- `vista-principal.spec.ts` (frontend) — los 4 casos de §3.
- Tres `aislamiento.spec.ts` nuevos (`academico`,
  `objetivos-educacionales`, `atributos-graduado`) + actualización de
  `plan-estudios/aislamiento.spec.ts` (backend) — igual rigor que el ya
  existente para `mejora-continua`.
- Specs de integración de los tres repositorios nuevos contra Postgres
  real, mismo patrón que el resto del proyecto (Testcontainers/DB
  desechable) — con foco especial en las tablas puente de Atributo
  (`CompetenciaAtributo`/`PlanAtributo`), que son las únicas con FK en
  ambos sentidos cruzando schema.
- Tests del permiso acotado por carrera en `GestionarObjetivos`/
  `GestionarAtributos` (§4, "RBAC por carrera"): un Director sin
  `carreraACargo` sobre esa carrera es rechazado, uno con ella puede.
- Cobertura `domain/`+`application/` de los tres módulos ≥80%, mismo
  RNF de siempre.
- Sin test E2E nuevo en esta fase — el AppShell reorganiza navegación
  existente, no agrega flujos de usuario nuevos que verificar.

## 7. Fuera de alcance (explícito)

- Ninguna pantalla de inicio por rol (Fases 1-3).
- El motor de acciones recomendadas (Fase 4).
- Selector de ámbito funcional para cambiar de carrera/contexto
  (contenido real de Fases 1-3).
- Mapeo de Coordinador Académico/Usuario Consultor a una vista
  específica — la función de prioridad de §3 los deja fuera de las 3
  vistas nombradas por el usuario; decidir qué ven es una decisión de
  producto para cuando se diseñe esa vista, no de esta fase.
- Cualquier cambio al **modelo de datos** de `ObjetivoEducacional` o
  `AtributoGraduado` (§2.3) — ambos se mueven de módulo, ninguno gana
  `carreraId` ni deja de ser catálogo institucional compartido.
- La pantalla completa "Criterio 02"/"Criterio 03" tal como aparece en
  el mockup del usuario (sidebar agrupado por los 8 criterios,
  navegación por carrera activa) — eso es Fase 2 (Director). Fase 0
  solo repunta las páginas actuales al backend nuevo (§5).
