# Dashboard por rol — Fase 0: fundación

## 1. Por qué este ciclo existe y dónde acaba

El usuario pidió una reconstrucción grande: un AppShell nuevo, tres
vistas de inicio por rol (Administrador, Director de Carrera, Docente),
una librería de componentes propia y un motor de "acción recomendada"
calculado sobre reglas de negocio reales. Es demasiado para un solo
ciclo — se descompuso en sub-proyectos, cada uno con su propio
spec → plan → implementación:

- **Fase 0** (este documento): la fundación que comparten las tres
  vistas — rol expuesto en `auth`, un módulo `academico` nuevo para
  Facultad/Carrera, y el AppShell del frontend (navegación agrupada,
  `ScopeSelector`, tokens de color reconciliados).
- **Fases 1–3**: una por cada vista de rol (Admin, Director, Docente),
  construidas sobre esta fundación.
- **Fase 4**: el motor de acciones recomendadas, al final, porque
  necesita los KPIs reales que las fases 1-3 exponen.

Este ciclo **no construye ninguna pantalla de inicio todavía**. Termina
cuando: (a) el login expone los roles del usuario, (b) Facultad/Carrera
viven en su propio módulo backend con el mismo aislamiento que ya tienen
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
3. **Alcance de `ObjetivoEducacional`**: se queda como catálogo global,
   sin `carreraId` propio (ya documentado en el código como regla de
   negocio explícita, RF-PJ-023 RN1). La futura pantalla "Criterio 02"
   (Fase 2, Director) filtra ese catálogo por lo ya vinculado al plan
   vigente de la carrera vía la tabla puente existente — no se toca el
   modelo de datos de Objetivo en esta fase ni en las siguientes.
4. **Límite del módulo nuevo**: Facultad + Carrera (+ Ciclo, que hoy
   vive agrupado con ellas) pasan a un módulo `academico` de primer
   nivel. Objetivo se queda dentro de `plan-estudios`, junto a
   Competencia — mismo patrón que ya tiene `AtributoGraduado` hoy
   (separación de fachada, no de módulo backend).
5. **Integridad referencial Carrera↔Plan**: `PlanEstudios.carreraId`
   mantiene una FK real de Postgres, cruzando schemas
   (`academico`↔`plan_estudios`) — Prisma `multiSchema` y Postgres lo
   soportan. No se degrada a un id suelto como sí es el caso,
   correctamente, entre `auth`/`mejora-continua` y `plan-estudios`: ahí
   la relación es genuinamente débil, aquí un Plan sin una Carrera
   válida no tiene sentido de negocio. El aislamiento de **código**
   (nunca acceder al repositorio ajeno directamente, solo por puerto)
   se mantiene igual con o sin la FK de base de datos — son
   preocupaciones distintas.

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
  con un usuario activo). Con tests unitarios que cubran: un solo rol,
  varios roles (gana el de mayor prioridad), rol desconocido/no
  mapeado (se ignora, no rompe), array vacío.
- `hooks/ProveedorSesion.tsx` — expone `roles` y `vistaPrincipal` en
  `ValorSesion`, calculado una vez al cargar la sesión.
- Si el usuario tiene más de un rol real, un selector simple (no es
  parte de esta fase construir su UI final — alcanza con que
  `ValorSesion` permita cambiar la vista activa en memoria; las Fases
  1-3 son las que le dan una superficie visual).

## 4. Arquitectura — pieza 2: módulo `academico`

Calca el molde ya usado para el aislamiento entre `plan-estudios` y
`mejora-continua`: puerto cross-módulo + adaptador + test de guardia.

**Nuevo módulo** `apps/api/src/modules/academico/`:

- `domain/` — sin entidades ricas nuevas (el CRUD actual de
  Facultad/Carrera/Ciclo es anémico, se mantiene así; no se inventa
  lógica de dominio que no exista hoy).
- `application/use-cases/gestionar-facultades.use-case.ts` y
  `gestionar-carreras.use-case.ts` — se separan del actual
  `gestionar-estructura.use-case.ts` (que hoy mezcla ambas clases en
  un archivo), moviéndolas tal cual, sin reescribir su lógica.
- `application/ports/academico.port.ts` — `RepositorioFacultadPort`,
  `RepositorioCarreraPort`, `DatosFacultad`, `DatosCarreraCompleta`
  (movidos desde `plan-estudios/application/ports/estructura.port.ts`
  sin cambiar su forma).
- `application/ports/academico-cross-modulo.port.ts` (nuevo) — lo que
  `plan-estudios` puede seguir consultando de `academico`:
  `carreraPorId(id): Promise<DatosCarreraResumen | null>`,
  `carrerasActivas(): Promise<DatosCarreraResumen[]>` — DTOs planos,
  nunca la entidad completa. Mismo criterio que
  `acreditacion-cross-modulo.port.ts` ya usa desde `mejora-continua`
  hacia `plan-estudios`.
- `infrastructure/persistence/academico.repository.ts` — implementa
  los dos puertos de arriba, movido desde
  `estructura.repository.ts`.
- `infrastructure/http/academico.controller.ts` +
  `dto/academico.dto.ts` — movidos desde `estructura.controller.ts`/
  `estructura.dto.ts`.
- `domain/events/eventos-academico.ts` — movido desde
  `eventos-estructura.ts`.

**`plan-estudios`**:

- Dejan de vivir ahí `Facultad`/`Carrera`/`Ciclo` y su CRUD. Donde
  `plan-estudios` necesite datos de una carrera (crear un plan, listar
  planes por carrera), consume `AcademicoCrossModuloPort` en vez de su
  propio repositorio — igual que ya hace con `AcreditacionPort` en
  dirección inversa.
- `PlanEstudios.carreraId` conserva su FK real (§2.5) — el cambio es
  de propiedad de código/módulo, no de integridad de datos.

**Prisma** (`apps/api/prisma/schema.prisma`):

- Nuevo `@@schema("academico")`, agregado a la lista de schemas del
  datasource.
- `Facultad`, `Carrera`, `Ciclo` migran de `@@schema("plan_estudios")`
  a `@@schema("academico")`. La FK `PlanEstudios.carreraId → Carrera.id`
  se mantiene explícita en el modelo (Prisma `multiSchema` la soporta
  cruzando schemas).
- Migración generada con `prisma migrate dev`, revisada a mano antes
  de aplicar — mover tablas entre schemas de Postgres es
  `ALTER TABLE ... SET SCHEMA`, no un `DROP`/`CREATE`, así que no hay
  pérdida de datos, pero conviene verificar el SQL generado.

**Test de guardia** (`apps/api/src/modules/plan-estudios/aislamiento.spec.ts`
y uno nuevo `apps/api/src/modules/academico/aislamiento.spec.ts`):

- `plan-estudios` solo puede importar de `academico` el archivo
  `ports/academico-cross-modulo.port.js` — mismo patrón que la regla
  ya existente para `mejora-continua`.
- `academico` no importa nada de `plan-estudios` (la relación es de
  un solo sentido: `plan-estudios` consulta a `academico`, no al
  revés).

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
- `academico.aislamiento.spec.ts` + actualización de
  `plan-estudios/aislamiento.spec.ts` (backend) — igual rigor que el ya
  existente para `mejora-continua`.
- Specs de integración de `academico.repository.ts` contra Postgres
  real, mismo patrón que el resto del proyecto (Testcontainers/DB
  desechable).
- Cobertura `domain/`+`application/` de `academico` ≥80%, mismo RNF de
  siempre.
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
- Cualquier cambio al modelo de `ObjetivoEducacional` (§2.3).
