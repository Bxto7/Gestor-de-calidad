# CLAUDE.md — Contexto del proyecto para Claude Code

> Este archivo es el punto de entrada de contexto para Claude Code y contiene **todo** lo necesario: visión del proyecto, arquitectura, stack, calidad/pruebas, despliegue y costos.

---

## 1. Qué es este proyecto

**Sistema de Gestión de la Calidad Universitaria (SGC)** — plataforma modular y extensible para la gestión de acreditación y calidad académica de una universidad peruana.

No es una app de alcance fijo: se concibe desde el día 1 para incorporar módulos adicionales de gestión de calidad en el tiempo, y capacidades de IA/recomendación en más de un módulo futuro. Toda decisión de diseño debe priorizar **bajo acoplamiento y extensibilidad** sobre atajos que optimicen solo el módulo actual.

### Alcance actual (MVP 1)

Se están construyendo **en paralelo**:
1. **Módulo de Autenticación, Roles y Permisos** (transversal, del que dependen todos los demás módulos)
2. **Módulo de Plan de Estudios** (131 RF + 24 RNF ya especificados) — Facultades, Carreras, Plan de Estudios versionado, Objetivos Educacionales, Competencias, Asignaturas, Malla Curricular, Aprobación, Validaciones de consistencia, Reportes.

### Fuera de alcance en MVP 1 (pero la arquitectura debe dejar espacio)

- Más módulos de gestión de calidad (no definidos aún en detalle)
- `RF-PEND-01`: recomendación de asignaturas comparando mallas de otras universidades
- Automatización/recomendación en otros módulos futuros

### Calidad como requisito no negociable

Este sistema existe para ayudar a la universidad a sostener procesos de acreditación bajo distintos marcos (ICACIT hoy; a futuro, potencialmente SINEACE-CONEAU, licenciamiento SUNEDU u otros marcos internacionales). Por eso el propio software debe poder demostrar el mismo rigor de calidad que exige evaluar en los programas académicos — no basta con que funcione. La **sección 6** define el marco de estándares de referencia (ISO/IEC 25000, ISO/IEC/IEEE 29119, OWASP ASVS, WCAG), la estrategia de pruebas y dónde se ejecuta cada nivel de prueba, y cómo encajan ahí los agentes y skills ya configurados en `agents/` y `skills/`.

Auth/Roles es desarrollado en paralelo con Plan de Estudios como MVP 1.

---

## 2. Convenciones de código

- **TypeScript estricto** (`strict: true`) en frontend y backend. Nada de `any` sin justificar con comentario.
- **Arquitectura por módulo:** cada módulo de NestJS sigue `domain/ application/ infrastructure/`. La capa de dominio no importa nada de NestJS, Prisma ni Express — debe ser testeable de forma aislada.
- **Nomenclatura:** entidades y casos de uso en español (coherente con el dominio del negocio: `PlanDeEstudios`, `Asignatura`, `MotorDeValidaciones`), nombres técnicos de infraestructura (repos, DTOs, controllers) en inglés cuando sea el patrón del framework.
- **Testing:** cobertura ≥80% en lógica de dominio (RNF del proyecto). Unit tests con Jest para dominio/aplicación; tests de integración para adaptadores (Prisma, colas, PDF). El diseño y la documentación de pruebas siguen el vocabulario y la estructura de **ISO/IEC/IEEE 29119** (niveles de prueba, técnicas basadas en riesgo, trazabilidad requisito↔caso de prueba) — ver sección 6.4 para el detalle de niveles y dónde corre cada uno.
- **Migraciones de base de datos:** siempre vía Prisma Migrate, nunca cambios manuales al esquema en producción.
- **Auditoría:** cualquier caso de uso que modifique una entidad relevante (Plan de Estudios, Asignatura, aprobaciones) debe registrar el evento en la bitácora de auditoría (append-only, usuario + fecha + detalle). No es opcional.
- **Validaciones de consistencia** (prerrequisitos circulares, coherencia de ciclos, créditos, competencias mínimas) viven en un servicio de dominio desacoplado (`MotorDeValidaciones`), no dispersas en controllers.

### Reglas de negocio clave a respetar

1. **Máquina de estados del Plan de Estudios:** `Borrador → En revisión → Aprobado → Vigente → Histórico`. Edición solo permitida en `Borrador`/`En revisión`. Nunca saltar transiciones.
2. **Versionado:** las versiones `Histórico` son inmutables. Nueva versión siempre se genera a partir del plan `Vigente`.
3. **Una única versión `Vigente` por carrera** — invariante que debe protegerse a nivel de dominio, no solo de UI.
4. **RBAC transversal:** casi toda operación (crear, editar, aprobar, consultar histórico) está sujeta a control de acceso por rol. Los roles se definen en el módulo de Auth; los demás módulos consumen permisos, no los redefinen.

### Qué NO hacer

- No acoplar el módulo de Plan de Estudios (ni ningún módulo futuro) directamente a un modelo de IA — siempre a través del puerto `RecommendationPort`.
- No implementar lógica de negocio en controllers ni en componentes de infraestructura.
- No usar el ORM (Prisma) directamente desde la capa de dominio.
- No introducir Kubernetes, service mesh, ni microservicios adicionales sin que el crecimiento real de carga u organización lo justifique.
- No agregar un ORM/acceso a datos dentro de `domain/`.
- No permitir que dos módulos compartan tablas directamente — si necesitan datos del otro, es a través de un puerto.
- No meter lógica de IA/ML dentro del monolito Node.js — vive en el servicio Python separado, sin excepciones "por ahora es más rápido".
- No convertir `shared-kernel/` en un cajón de sastre que reintroduce acoplamiento entre módulos.

---

## 3. Arquitectura

### 3.1 Estilo arquitectónico

**Monolito modular internamente hexagonal, con servicios satélite externos para cargas que no encajan en el core transaccional** (principalmente IA/recomendación, y almacenamiento de objetos).

**Por qué no microservicios completos:** con un equipo de 3-5 personas, operar N servicios independientes (cada uno con su propio despliegue, base de datos, observabilidad, versión de librerías) consume una fracción significativa de la capacidad del equipo en trabajo puramente operativo, sin aportar valor de negocio en esta etapa.

**Por qué no monolito "tradicional" (sin fronteras internas):** sin aislamiento interno, cada módulo nuevo tiende a generar acoplamiento cruzado con el código existente — exactamente el problema que el sistema Excel actual ya tiene (tablas maestras nunca conectadas, fórmulas y referencias cruzadas frágiles). La arquitectura hexagonal dentro del monolito da el aislamiento de un microservicio sin el costo operativo de desplegarlo por separado. Si en el futuro un módulo específico necesita escalar de forma independiente, se extrae a su propio servicio cambiando solo el adaptador de transporte — el dominio no se toca.

**Regla no negociable:** un módulo nunca importa el repositorio o las entidades de otro módulo directamente. La comunicación entre módulos es siempre a través de una interfaz de servicio expuesta explícitamente (puerto).

### 3.2 Estructura de módulos (bounded contexts)

Cada módulo de negocio (`auth`, `plan-estudios`, y los que se agreguen después) sigue la misma estructura interna:

```
src/
  modules/
    auth/
      domain/            # Entidades, value objects, reglas de negocio puras
      application/        # Casos de uso (use cases), puertos (interfaces)
      infrastructure/      # Adaptadores: Prisma repos, controllers HTTP, JWT
    plan-estudios/
      domain/
        entities/          # PlanDeEstudios, Asignatura, Ciclo, Competencia...
        value-objects/      # EstadoPlan, Version, Creditos...
        services/            # MotorDeValidaciones (dominio puro, sin infra)
      application/
        use-cases/           # CrearPlan, AprobarPlan, GenerarNuevaVersion...
        ports/                 # RepositorioPlanPort, RecommendationPort...
      infrastructure/
        persistence/           # PlanRepositoryPrisma (implementa el port)
        http/                    # Controllers, DTOs
        documents/               # Generación de PDF/Excel
    shared-kernel/            # Tipos/utilidades genuinamente compartidos (mínimo)
```

**Regla de dependencia:** `domain` no importa nada de `application` ni `infrastructure`. `application` depende de `domain` y define los `ports` (interfaces) que `infrastructure` implementa.

**Regla entre módulos:** un módulo nunca accede a las tablas ni entidades de otro módulo directamente. Si `plan-estudios` necesita saber el rol del usuario actual, lo obtiene a través de un puerto/servicio expuesto por `auth` (ej. `AuthorizationPort`), nunca haciendo una query directa a las tablas de usuarios/roles.

### 3.3 Modelo de dominio (Plan de Estudios)

```
Facultad 1──N Carrera
Carrera  1──N PlanDeEstudios (versionado; única versión "Vigente" por carrera)
PlanDeEstudios N──M ObjetivoEducacional
PlanDeEstudios N──M Competencia (a nivel de plan)
PlanDeEstudios 1──N Asignatura
Asignatura N──M Competencia
Asignatura N──1 Ciclo
Asignatura N──M Asignatura (prerrequisitos/correquisitos — grafo dirigido, sin ciclos)
Ciclo pertenece a Carrera
```

**Invariantes de dominio a proteger (no solo validar en el frontend):**

- Una carrera tiene como máximo **una** versión `Vigente` de su plan de estudios en un momento dado.
- Las versiones `Histórico` son **inmutables** — cualquier intento de modificación debe fallar a nivel de dominio.
- El grafo de prerrequisitos/correquisitos de asignaturas **no puede tener ciclos**.
- Edición de un Plan de Estudios solo es posible en estados `Borrador` o `En revisión`.

### 3.4 Flujos clave

**Máquina de estados del Plan de Estudios:**
```
Borrador ──▶ En revisión ──▶ Aprobado ──▶ Vigente ──▶ Histórico
```
Implementada como máquina de estados explícita en el dominio (no un campo `string` libre + `if`s dispersos). Cada transición valida sus precondiciones y emite un evento de auditoría.

**Versionado:** generar una nueva versión parte siempre del plan `Vigente`, crea una copia en `Borrador`, y mantiene el historial completo enlazado. El plan anterior no se toca hasta que la nueva versión llega a `Vigente`.

**Motor de validaciones de consistencia:** servicio de dominio desacoplado (`MotorDeValidaciones`), invocado antes de permitir la transición a `Aprobado`. Corre de forma consolidada: prerrequisitos circulares, coherencia de ciclos, competencias/objetivos mínimos, créditos por ciclo. Devuelve una lista estructurada de errores/advertencias, no lanza excepciones sueltas.

**Auditoría:** toda mutación relevante se registra en una tabla append-only (usuario, fecha, entidad, detalle). Se implementa como un `DomainEvent` emitido por los casos de uso y capturado por un listener de infraestructura.

**Generación de documentos:** PDF (resumen del plan, evidencia de aprobación) y Excel (exportación de malla) se generan en la capa de infraestructura del módulo `plan-estudios`, disparados por casos de uso pero ejecutados como **jobs en cola** para no bloquear el request HTTP y cumplir el RNF de generación < 5s bajo carga.

### 3.5 RBAC y módulo de Auth

El módulo `auth` es transversal y los demás módulos lo consumen, nunca lo reimplementan:

- Autenticación: JWT de acceso + refresh token.
- Autorización: modelo rol → permisos, evaluado vía un `AuthorizationPort` que `plan-estudios` (y módulos futuros) consultan antes de ejecutar un caso de uso.
- Roles concretos (Director de carrera, Coordinador académico, Docente, etc.) y sus permisos se configuran como datos, no como código — así agregar un rol nuevo no requiere despliegue.
- Guards de NestJS en la capa HTTP validan el token y delegan la decisión de autorización de negocio al `AuthorizationPort`, no al guard mismo.

### 3.6 Punto de extensión para IA/recomendación

No se implementa en MVP 1, pero se define ya el contrato:

```typescript
// application/ports/recommendation.port.ts (dentro de plan-estudios)
export interface RecommendationPort {
  sugerirAsignaturas(mallaActual: MallaCurricular): Promise<SugerenciaAsignatura[]>;
}
```

- **MVP 1:** implementación no-op o stub (`NullRecommendationAdapter`) — el puerto existe, el adaptador real no.
- **Cuando se implemente RF-PEND-01:** el adaptador real llama al servicio Python/FastAPI vía HTTP/REST.
- **Módulos futuros con IA:** reutilizan el mismo patrón de puerto por módulo, apuntando al mismo servicio de IA compartido si el caso de uso lo permite.

**Patrón de comunicación:**
- **Síncrono (REST)** para consultas puntuales de baja latencia (ej. sugerencias en tiempo real mientras se arma la malla).
- **Asíncrono (cola Redis/BullMQ ya existente en el core)** para tareas pesadas o batch (ej. recomputar comparaciones contra mallas de otras universidades). El core encola el trabajo; el servicio de IA lo consume y publica el resultado.

---

## 4. Stack técnico

### 4.1 Frontend

| Elemento | Elección | Notas |
|---|---|---|
| Framework | React 18 + TypeScript | Ecosistema maduro, gran disponibilidad de talento |
| Build tool | Vite | Arranque e HMR rápidos frente a webpack |
| Estilos | Tailwind CSS | Consistencia visual sin CSS disperso; usable por perfiles no especializados en diseño |
| Drag & drop | `@dnd-kit/core` | Cubre el RNF de interacción drag-and-drop para la malla curricular; más mantenido y accesible que `react-beautiful-dnd` |
| Formularios | `react-hook-form` + `zod` | Validación tipada compartible con el backend |
| Fetching/estado servidor | `@tanstack/react-query` | Cache, reintentos y estados de carga sin reinventar |
| Estado UI local | React state / Zustand si crece la complejidad | Evitar Redux salvo necesidad real |
| Tablas/listas | `@tanstack/react-table` | Listados de asignaturas, histórico de versiones, etc. |

### 4.2 Backend / API

| Elemento | Elección | Notas |
|---|---|---|
| Framework | NestJS (Node.js 20 LTS + TypeScript) | Módulos + DI nativos mapean directo a los bounded contexts; guards para RBAC |
| Validación de entrada | `class-validator` / `zod` (vía pipe) | Consistente con la capa de aplicación |
| API | REST (OpenAPI autogenerado con `@nestjs/swagger`) | Más simple de operar con equipo pequeño que GraphQL |
| ORM | Prisma | Migraciones declarativas, tipado end-to-end, buen ajuste con PostgreSQL |
| Autenticación | `@nestjs/jwt` + `passport-jwt`, `argon2` para hashing | Argon2 sobre bcrypt: mejor resistencia a ataques con hardware dedicado |
| Colas | BullMQ sobre Redis | Generación de documentos, notificaciones, futura comunicación async con IA |
| Documentos | `puppeteer` (PDF vía HTML→PDF) o `pdfkit` (PDF programático), `exceljs` (Excel) | Puppeteer da más control visual; PDFKit es más liviano en recursos |
| Testing | Jest (unit + integración), Supertest (e2e HTTP) | Cobertura ≥80% en `domain/` y `application/`; ver sección 4.7 para el resto del stack de calidad |
| Linting/formato | ESLint + Prettier, `strict` TypeScript | No negociable en CI |

### 4.3 Base de datos

| Elemento | Elección | Notas |
|---|---|---|
| Motor | PostgreSQL 16 | Integridad referencial estricta, transacciones ACID, JSONB si aparecen datos semi-estructurados |
| Migraciones | Prisma Migrate | Versionadas en el repo, aplicadas en CI/CD, nunca cambios manuales en producción |
| Particionado/histórico | Tablas de versiones con FK a plan "padre"; considerar particionado por rango si el histórico crece mucho (no necesario en MVP 1) | |
| Auditoría | Tabla append-only (`audit_log`), sin updates/deletes permitidos a nivel de rol de BD | Refuerza inmutabilidad a nivel de infraestructura |

### 4.4 Auth / Roles

Módulo propio dentro del monolito (no un IAM externo tipo Keycloak/Auth0 en esta etapa):

- JWT de acceso de vida corta + refresh token de vida más larga, rotación en cada uso.
- Passwords con `argon2id`.
- Modelo rol → permisos en base de datos (`roles`, `permisos`, `rol_permiso`), consumido vía `AuthorizationPort`.
- Rate limiting en endpoints de login (`@nestjs/throttler`) contra fuerza bruta.

**Cuándo reconsiderar un IAM externo:** si más aplicaciones (no solo este sistema) necesitan autenticarse contra el mismo directorio de usuarios, o si la universidad exige SSO institucional (ej. integración con Active Directory/LDAP existente). No antes.

### 4.5 IA / Recomendación (futuro, no MVP 1)

| Elemento | Elección | Notas |
|---|---|---|
| Framework | FastAPI (Python) | Estándar para servicios ML ligeros, tipado con Pydantic |
| Librerías previstas | `scikit-learn` / `sentence-transformers` (a definir según algoritmo de similitud de mallas) | No se decide en detalle hasta especificar RF-PEND-01 |
| Comunicación | REST síncrono + consumo de cola BullMQ/Redis | Ver sección 3.6 |
| Despliegue | Servicio contenedorizado separado, en la nube | Separado del VPS core para no forzar el stack Python sobre todo el equipo |

### 4.6 Versionado de dependencias — convención

- Node.js 20 LTS fijado en `.nvmrc` y en la imagen Docker.
- Lockfiles (`package-lock.json`) siempre commiteados; CI falla si el lockfile no coincide con `package.json`.
- Actualizaciones de dependencias mayores: PR dedicado, no mezclado con features.

### 4.7 Calidad, pruebas y seguridad

| Elemento | Elección | Notas |
|---|---|---|
| Unit / integración (Node) | Jest + Supertest | Ya definidos en 4.2; cobertura ≥80% en `domain/`/`application/` |
| Infraestructura de pruebas de integración | Testcontainers (Postgres y Redis efímeros) | Evita mocks frágiles de Prisma: cada test de repositorio corre contra una BD real y desechable, no contra staging/producción |
| E2E de frontend | Playwright | Flujos críticos: login, crear/editar plan, drag-and-drop de malla, transición de estados, aprobación |
| Accesibilidad | `jest-axe` / `axe-core` (integrado a Playwright) | Chequeo automatizado alineado a WCAG 2.1 AA en componentes clave — ver 6.4 |
| Pruebas de carga | k6 | Solo contra Staging; valida el RNF de generación de documentos < 5s y tiempos de respuesta bajo concurrencia |
| SAST (análisis estático de seguridad) | Semgrep (reglas OWASP) | Corre en cada PR; bloquea el merge ante hallazgos críticos/altos |
| Análisis de dependencias | `npm audit` + GitHub Dependabot | Alertas automáticas de CVEs en dependencias directas y transitivas |
| Datos de prueba | Factories con datos sintéticos/anonimizados, nunca datos reales de estudiantes o docentes fuera de producción | Ver 6.5 |

Todas estas herramientas tienen una capa gratuita suficiente para el volumen del proyecto — no agregan costo de infraestructura más allá de minutos de CI (ver sección 7.1).

---

## 5. Despliegue e infraestructura

### 5.1 Enfoque general

**VPS privado (Hetzner Cloud) como core, con Docker Compose**, más servicios puntuales en la nube donde realmente aportan valor (almacenamiento de objetos, y más adelante el servicio de IA). No se usa Kubernetes ni orquestación compleja en esta etapa — con un core en un único VPS y un equipo de 3-5 personas, Kubernetes añade una capa de operación que no se justifica todavía. Revisar esta decisión si el número de servicios independientes crece más allá de 3-4, o si aparece una necesidad real de autoscaling horizontal del core.

### 5.2 Topología de servicios (Docker Compose)

```yaml
services:
  api:            # NestJS — imagen construida en CI
  worker:         # Mismo código que api, proceso dedicado a consumir colas BullMQ
  postgres:       # PostgreSQL 16, volumen persistente
  redis:          # Cola + cache
  caddy:          # Reverse proxy, TLS automático, sirve el frontend estático
  # frontend se compila a estáticos y se sirve vía Caddy (no necesita contenedor propio)
```

El servicio de IA (futuro) **no** vive en este `docker-compose.yml` del VPS — se despliega por separado en la nube, para no acoplar su ciclo de vida ni sus recursos al VPS core.

### 5.3 Entornos

| Entorno | Dónde | Propósito |
|---|---|---|
| **Desarrollo local** | Docker Compose en la máquina de cada dev | Réplica fiel de producción a nivel de servicios; pruebas unitarias corren aquí en cada guardado |
| **CI (efímero)** | GitHub Actions, contenedores de servicio (Postgres/Redis) levantados por job | Pruebas de integración, API/contract, subconjunto rápido de E2E, SAST, auditoría de dependencias — se destruye al terminar el job |
| **Staging** | Mismo VPS que producción (contenedores separados, distinto puerto/subdominio) o un segundo VPS pequeño si el presupuesto lo permite | Validar releases antes de producción; correr migraciones aquí primero; suite completa de E2E, pruebas de carga, accesibilidad manual, aceptación con usuarios piloto |
| **Producción** | VPS principal | Solo monitoreo sintético (health checks) — nunca pruebas destructivas ni de carga |

### 5.4 CI/CD (GitHub Actions)

Pipeline por push/PR:

1. **Lint + typecheck** (`eslint`, `tsc --noEmit`)
2. **Pruebas unitarias e integración** (Jest + Testcontainers para Postgres/Redis efímeros; Supertest para e2e de endpoints críticos) — niveles definidos en la sección 6.4
3. **Quality gates de seguridad:** SAST (Semgrep) + auditoría de dependencias (`npm audit`/Dependabot) — bloquean el merge ante hallazgos críticos o altos sin justificar
4. **Verificación de cobertura:** falla el build si `domain/`/`application/` cae por debajo del 80%
5. **Build** de imágenes Docker (api, worker) y build estático del frontend
6. **Push** de imágenes a GitHub Container Registry (ghcr.io) — gratuito para repos del mismo dueño
7. **Deploy** (en push a `main` o tag de release): SSH al VPS, `docker compose pull && docker compose up -d`, ejecutar `prisma migrate deploy` antes de levantar `api`
8. **Smoke tests post-deploy** en Staging (subconjunto de Playwright sobre los flujos críticos) antes de promover a producción

Migraciones de base de datos siempre corren como paso explícito del pipeline, nunca automáticamente al arrancar el contenedor.

### 5.5 Servicio de IA (futuro) — despliegue

- **Opción recomendada para iniciar:** un PaaS simple orientado a contenedores (Fly.io, Railway o un segundo VPS Hetzner dedicado) — evita gestionar Kubernetes solo para un servicio.
- Se comunica con el core vía REST (síncrono) y consumiendo jobs de la misma cola Redis del core (asíncrono).
- Solo se aprovisiona cuando RF-PEND-01 entre en desarrollo real; no antes.

### 5.6 Backups y recuperación

- **Base de datos:** `pg_dump` diario automatizado, subido a Backblaze B2. Retención ≥30 días, con rotación automática de dumps antiguos.
- **Snapshots de VPS:** snapshots automáticos de Hetzner como respaldo adicional a nivel de infraestructura completa.
- **Archivos (PDFs, evidencias):** viven directamente en Backblaze B2, que ya tiene redundancia propia.
- **RTO objetivo ≤4h:** alcanzable con este esquema sin necesidad de infraestructura activa-activa.

### 5.7 Seguridad en infraestructura

- **TLS:** automático vía Caddy (Let's Encrypt), renovación sin intervención manual.
- **Secretos:** variables de entorno vía GitHub Actions Secrets en CI, y `.env` fuera de control de versiones en el VPS (permisos restringidos). Evaluar un gestor de secretos dedicado solo si el número de secretos/entornos crece lo suficiente.
- **Firewall:** reglas a nivel de Hetzner Cloud Firewall — solo 22 (SSH, idealmente restringido por IP), 80/443 abiertos. PostgreSQL y Redis nunca expuestos fuera de la red interna de Docker.
- **Acceso SSH:** solo por llave pública, sin autenticación por password.

### 5.8 Monitoreo y logging

- **Uptime/health checks:** Uptime Kuma self-hosted en el propio VPS, o un servicio gestionado con capa gratuita.
- **Logs de aplicación:** salida estructurada (JSON) de NestJS a stdout, recolectados por Docker; envío a un servicio externo solo si el volumen de incidentes lo justifica.
- **Alertas:** notificación (email/Slack/Telegram) ante caída de `api` o del healthcheck de `postgres`.

### 5.9 Disponibilidad

Con presupuesto de un VPS único, el objetivo realista es **alta disponibilidad operativa** (monitoreo + recuperación rápida), no alta disponibilidad activa-activa. El SLA de ~99% en horario académico es alcanzable con este esquema; **queda pendiente validarlo formalmente con la universidad**.

---

## 6. Calidad de software: estándares, pruebas y agentes

### 6.1 Por qué un marco formal de calidad

Este sistema reemplaza la gestión manual de un proceso de acreditación — el estándar de rigor que se le exige no puede ser menor al que el propio sistema evalúa en los programas académicos. Adoptar modelos de referencia reconocidos (en vez de un criterio de calidad ad-hoc) da trazabilidad y un vocabulario común, en la misma línea que ya se buscaba con la arquitectura hexagonal y los invariantes de dominio explícitos de la sección 3.

**Precisión importante:** salvo que la universidad lo pida explícitamente, nada de esto implica perseguir una *certificación* formal. ISO/IEC 25000 (SQuaRE) e ISO/IEC/IEEE 29119 son **modelos de referencia y de proceso** — se aplican por decisión de ingeniería, no se "obtienen" mediante una auditoría externa como sí ocurre con ISO 9001 o ISO/IEC 27001 (sistemas de gestión certificables). Lo que este documento adopta es su vocabulario y su estructura, aplicados de forma pragmática para un equipo de 3-5 personas — no la plantilla completa de documentación de los estándares.

### 6.2 Estándares de referencia adoptados

| Estándar | Qué cubre | Cómo se usa en este proyecto |
|---|---|---|
| **ISO/IEC 25010:2023** (parte de la familia SQuaRE, ISO/IEC 25000) | Modelo de calidad de producto: 9 características — adecuación funcional, eficiencia de desempeño, compatibilidad, capacidad de interacción, fiabilidad, seguridad, mantenibilidad, flexibilidad y *safety* (esta última, en 2023, se agregó como característica nueva) | Checklist de diseño: cada RNF y cada decisión arquitectónica relevante se puede trazar a una característica — ver la tabla de trazabilidad en 6.3 |
| **ISO/IEC 25012** (SQuaRE) | Modelo de calidad de datos: exactitud, completitud, consistencia, trazabilidad, credibilidad, entre otras | Referencia para el diseño del `MotorDeValidaciones` y del esquema (invariantes de Plan de Estudios, sección 3.3) |
| **ISO/IEC 25040 / 25041** (SQuaRE) | Proceso de evaluación de calidad de producto | Marco para revisiones de calidad periódicas del equipo, no un proceso de certificación |
| **ISO/IEC/IEEE 29119** (partes 1 – conceptos, 2 – procesos, 3 – documentación, 4 – técnicas) | Vocabulario, proceso, documentación y técnicas de diseño de pruebas de software | Estructura de la estrategia de pruebas de la sección 6.4: niveles, técnicas basadas en riesgo, documentación mínima de pruebas |
| **OWASP ASVS 5.0** | ~350 requisitos verificables de seguridad de aplicaciones (autenticación, control de acceso, manejo de datos, criptografía, etc.), en niveles L1–L3 | Objetivo: **Nivel 2** (aplicaciones que manejan datos institucionales sensibles) como checklist de referencia para el agente `security-auditor` |
| **WCAG 2.1, nivel AA** | Accesibilidad web | Checklist para el frontend, reforzado por el skill `ui-ux-pro-max` y pruebas automatizadas con `axe-core` (sección 4.7) |
| **ISO/IEC 12207** | Procesos del ciclo de vida del software (requisitos, diseño, construcción, pruebas, despliegue, mantenimiento) | Referencia general de estructura — ya reflejada de facto en las secciones 2 a 5 de este documento |

Si a futuro la universidad requiere una certificación formal (por ejemplo ISO/IEC 27001 para su SGSI institucional), este documento es el punto de partida de la brecha a cubrir, no el estado final: hoy no se declara conformidad con ningún estándar, se declara la *intención de diseño* alineada a ellos.

### 6.3 Trazabilidad: características de ISO/IEC 25010 ↔ decisiones de este documento

| Característica (ISO 25010:2023) | Cómo se cumple hoy en la arquitectura | Estado |
|---|---|---|
| Adecuación funcional | 131 RF + 24 RNF documentados y trazables por módulo (sección 1) | ✅ ya definido |
| Eficiencia de desempeño | Generación de documentos como jobs en cola, RNF < 5s (3.4); pruebas de carga con k6 en Staging (4.7/6.4) | 🔲 arquitectura lista, tooling de pruebas pendiente de implementar |
| Compatibilidad | API REST + OpenAPI autogenerado (4.2), evita acoplar frontend/backend a un formato propietario | ✅ ya definido |
| Capacidad de interacción (antes "usabilidad") | Tailwind + `@dnd-kit` accesible (4.1); objetivo WCAG 2.1 AA + `axe-core` (4.7/6.2) | 🔲 objetivo definido, pruebas automatizadas pendientes |
| Fiabilidad | Máquina de estados explícita (3.4), auditoría append-only (3.4/5.3), backups diarios + RTO ≤4h (5.6) | ✅ ya definido |
| Seguridad | JWT + refresh, `argon2id`, rate limiting (4.4), RBAC vía `AuthorizationPort` (3.5), TLS + firewall (5.7); SAST + dependency scanning (4.7); objetivo ASVS L2 (6.2) | ✅ controles base definidos / 🔲 gap analysis contra ASVS L2 pendiente |
| Mantenibilidad | Arquitectura hexagonal + aislamiento de módulos (3.1-3.2), dominio sin dependencias de framework, cobertura ≥80% (2) | ✅ ya definido |
| Flexibilidad (antes "portabilidad") | Docker Compose reproducible en local/CI/staging/prod (5.2-5.3); servicio de IA desacoplado vía `RecommendationPort` (3.6) | ✅ ya definido |
| *Safety* (integridad operacional de los datos de acreditación) | Versiones `Histórico` inmutables, invariante de única versión `Vigente` protegida a nivel de dominio (3.3) | ✅ ya definido |

La columna "Estado" es intencionalmente honesta: varias filas describen un objetivo que esta actualización de `CLAUDE.md` fija, no algo que ya esté implementado y probado.

### 6.4 Estrategia y niveles de prueba — dónde se ejecuta cada uno

| Nivel (vocabulario ISO 29119) | Qué prueba | Herramienta | Dónde corre |
|---|---|---|---|
| Pruebas unitarias | Entidades, value objects, `MotorDeValidaciones` (prerrequisitos circulares, créditos, competencias mínimas) | Jest | Local (cada guardado) + CI (cada push/PR) — sin dependencias externas, el dominio no importa Prisma/NestJS |
| Pruebas de integración | Adaptadores: repos Prisma, colas BullMQ, generación de PDF/Excel | Jest + Testcontainers (Postgres/Redis efímeros) | Solo CI — cada PR levanta contenedores desechables; nunca contra la BD de staging/producción |
| Pruebas de API / contrato | Controllers HTTP, DTOs, guards, `AuthorizationPort` | Supertest | CI, contra una instancia de la app con BD efímera |
| Pruebas E2E de frontend | Login, crear/editar plan, drag-and-drop de malla, transición de estados, aprobación | Playwright | CI (subconjunto rápido en cada PR) + Staging (suite completa antes de cada release) |
| Pruebas de regresión de validaciones | Casos derivados de la auditoría del Excel actual (p. ej. el comportamiento de "Insumo de entrada" según bloque) | Jest, tabla de casos con datos anonimizados del Excel auditado | CI — se congelan como regresión porque ya se encontró comportamiento no trivial una vez |
| Pruebas de seguridad | Autenticación, RBAC, inyección, exposición de datos | Semgrep (SAST automático) en cada PR; revisión del agente `security-auditor` en PRs sobre `auth`/endpoints sensibles; pentest puntual antes de manejar datos reales en producción | CI (SAST) + Staging (revisión manual/pentest) — nunca en producción |
| Pruebas de accesibilidad | Componentes de frontend contra WCAG 2.1 AA | `jest-axe` / Playwright + `axe-core` | CI (automatizado) + revisión manual puntual en Staging antes de un release mayor |
| Pruebas de carga/desempeño | RNF de generación de documentos < 5s, tiempos de respuesta bajo concurrencia | k6 | Solo Staging — nunca en producción, nunca en cada PR de CI (demasiado costoso/ruidoso) |
| Pruebas de aceptación | Validación funcional contra los 131 RF documentados | Manual, con Director de carrera/Coordinador académico como usuarios piloto | Staging, antes de cada release a producción |
| Monitoreo sintético | Health checks, disponibilidad | Uptime Kuma (5.8) | Producción — nunca pruebas destructivas o de carga aquí |

**Regla general:** cualquier prueba que pueda modificar o corromper datos corre contra datos sintéticos/anonimizados (local, CI o Staging); nunca contra la base de datos de producción.

### 6.5 Datos de prueba y protección de datos personales

Los seeds/factories usados en local, CI y Staging generan datos sintéticos o anonimizados — nunca datos reales de estudiantes, docentes o egresados fuera de producción. Esto es tanto una buena práctica de ingeniería (evita fugas de datos vía logs de CI, capturas de pantalla de bugs, etc.) como una precaución razonable frente a la normativa peruana de protección de datos personales (Ley N.º 29733 y su reglamento) — vale la pena que el equipo confirme con el área legal/de cumplimiento de la universidad qué categorías de datos del Plan de Estudios y de Auth califican como datos personales antes de decidir qué se puede anonimizar vs. qué requiere consentimiento explícito.

### 6.6 Definición de "Terminado" (Definition of Done) por PR

- Lint + typecheck sin errores.
- Tests unitarios y de integración en verde; cobertura de `domain/`/`application/` ≥80%.
- SAST y auditoría de dependencias sin hallazgos críticos/altos sin resolver o justificar explícitamente.
- Si la PR toca una entidad auditable (Plan de Estudios, Asignatura, aprobaciones): evento de auditoría emitido y cubierto por una prueba.
- Si la PR toca UI: chequeo de accesibilidad automatizado (`axe-core`) en verde.
- Documentación OpenAPI/Swagger actualizada si cambia un endpoint.

### 6.7 Agentes y skills de Claude Code en el proceso de calidad

Ya existen agentes en `agents/` y skills en `skills/`. La tabla siguiente propone un rol para cada uno dentro de este marco de calidad, **basada solo en sus nombres de archivo** — no he leído su contenido. Si ya tienen instrucciones definidas, compártelas y ajusto esta tabla a lo que ya escribiste en vez de proponerlo desde cero.

| Agente / skill | Rol propuesto |
|---|---|
| `security-auditor` (agent) | Dueño del checklist OWASP ASVS L2 (6.2); revisa PRs que tocan `auth`, `AuthorizationPort` o endpoints con datos sensibles; interpreta hallazgos de Semgrep |
| `devops-engineer` (agent) | Dueño del pipeline CI/CD y sus quality gates (5.4); mantiene los contenedores efímeros de Testcontainers |
| `deployment-engineer` (agent) | Dueño de la promoción a producción, smoke tests post-deploy (5.4) y rollback |
| `api-documenter` (agent) | Mantiene el OpenAPI/Swagger sincronizado con el código — parte de "adecuación funcional" (6.3) y del Definition of Done (6.6) |
| `python-pro` / `ml-engineer` (agents) | Cuando arranque RF-PEND-01, dueños del servicio FastAPI y de su propia suite `pytest`, desacoplada de la suite de Node |
| `database-architect` (skill) | Revisión de esquema/migraciones Prisma contra los invariantes de dominio (única versión `Vigente`, grafo sin ciclos) — alineado a ISO/IEC 25012 |
| `senior-backend` / `senior-frontend` (skills) | Revisión de código contra las convenciones de la sección 2 (aislamiento de módulos, dominio sin imports de framework) |
| `ui-ux-pro-max` (skill) | Revisión de accesibilidad e interacción (WCAG 2.1 AA) en los flujos de la sección 6.4 |
| `python-fastapi` / `nlp-embeddings` (skills) | Soporte específico para el futuro servicio de IA (3.6/4.5) — no aplican a MVP 1 |
| `seo-optimizer` (skill) | Sin encaje claro hoy: el sistema es interno y vive detrás de autenticación, no hay una superficie pública que posicionar. Confirmar si hay un sitio institucional público planeado antes de asignarle un rol aquí |

---

## 7. Costos estimados

> Cifras en USD, verificadas en agosto de 2026. Hetzner ajustó precios dos veces durante 2026 (abril y 15 de junio) — verificar el precio vigente antes de contratar. No incluye IGV/impuestos locales ni conversión a soles.

### 7.1 Costo mensual — MVP 1 (Auth + Plan de Estudios, sin IA)

| Ítem | Proveedor | Costo estimado/mes | Notas |
|---|---|---|---|
| VPS core (producción) | Hetzner Cloud, CPX21 (3 vCPU / 4 GB / 80 GB NVMe) | **~$14–18** | Nivel de entrada razonable para el volumen descrito. Incluye 20 TB de tráfico en región EU |
| Almacenamiento de objetos (PDFs, evidencias, dumps de BD) | Backblaze B2 | **~$1–5** | $6–7/TB/mes; volumen esperado en el primer año es de pocas decenas de GB. Egress gratis hasta 3x el almacenamiento promedio |
| Dominio | Cualquier registrador | **~$1** | ~$10–15/año prorrateado |
| TLS/certificados | Let's Encrypt vía Caddy | **$0** | Automático |
| CI/CD | GitHub Actions | **$0** | Plan gratuito suele alcanzar para este volumen; monitorear consumo (los quality gates de la sección 6 añaden minutos de CI, no costo de infraestructura) |
| Registro de imágenes Docker | GitHub Container Registry (ghcr.io) | **$0** | Gratuito hasta cuotas razonables para este tamaño de proyecto |
| Email transaccional | Resend (u otro con capa gratuita similar) | **$0** | Capa gratuita cubre miles de correos/mes; volumen esperado es bajo |
| Monitoreo/uptime | Uptime Kuma self-hosted | **$0** | Alternativa: servicio gestionado con capa gratuita |
| Herramientas de calidad y seguridad (SAST, dependencias, accesibilidad, carga) | Semgrep OSS, `npm audit` + Dependabot, `axe-core`, k6, Testcontainers, Playwright | **$0** | Todas con capa open-source/gratuita suficiente para este volumen (sección 4.7/6.4); consumen minutos de CI, ya contemplados arriba |
| **Total MVP 1** | | **≈ $16–24/mes** | Equivalente a **$190–290/año** |

### 7.2 Refuerzos recomendados

| Ítem | Costo estimado/mes | Cuándo contratarlo |
|---|---|---|
| Snapshots automáticos de Hetzner | ~20% del costo del VPS (~$3–4) | Recomendado desde el día 1 |
| VPS de staging separado (CX23, 2 vCPU/4 GB) | ~$6–7 | Cuando staging en el mismo VPS interfiera con producción, o cuando la suite completa de pruebas de la sección 6.4 necesite correr sin afectar producción |
| Plan Team de GitHub | ~$4/usuario | Solo si el consumo real de minutos de CI supera el free tier |

**Total MVP 1 con refuerzos recomendados: ≈ $25–35/mes.**

### 7.3 Escenario de crecimiento — al incorporar IA/recomendación (RF-PEND-01)

| Ítem | Costo estimado/mes | Notas |
|---|---|---|
| VPS core, escalado a CPX31 (4 vCPU / 8 GB) | **~$20–30** | El core puede necesitar más cabecera al sumar más módulos, independientemente de la IA |
| Servicio de IA (FastAPI) en PaaS orientado a contenedores | **~$5–20** | Depende del uso real de CPU/RAM; empezar en el tier más bajo y medir |
| Almacenamiento de objetos (crece con más históricos/versiones) | **~$3–8** | Sigue siendo marginal a esta escala |
| **Total con IA activa** | | **≈ $35–65/mes** |

### 7.4 Escenario de crecimiento — al sumar módulos adicionales

El costo de infraestructura **no crece linealmente por módulo**, porque los módulos nuevos viven dentro del mismo monolito y comparten el mismo VPS core. Solo se prevé gasto incremental si:

- El histórico de versiones/auditoría crece a un punto que requiere más almacenamiento en disco del VPS (mitigable subiendo de tier o moviendo históricos a almacenamiento frío en B2).
- Un módulo específico necesita escalar de forma independiente al resto (en ese punto se extrae a su propio servicio).

### 7.5 Resumen por horizonte

| Horizonte | Costo mensual aproximado |
|---|---|
| MVP 1, configuración mínima | $16–24 |
| MVP 1 con backups y refuerzos recomendados | $25–35 |
| Con servicio de IA activo | $35–65 |
| Con múltiples módulos + IA, a mediano plazo | A definir según volumen real de datos/usuarios |

### 7.6 Notas finales

- No incluye tiempo de desarrollo/operación del equipo, solo infraestructura.
- El hosting universitario propio (on-premise) sigue siendo alternativa válida si la universidad ya cuenta con servidores — en ese caso estos costos de VPS se reemplazan por el costo de oportunidad de esa infraestructura, manteniendo el almacenamiento de objetos en la nube (recomendado conservar, para separar los backups del mismo hardware que se respalda).
- Verificar precios vigentes antes de comprometerse, especialmente en Hetzner dado el historial de ajustes de precio durante 2026.
