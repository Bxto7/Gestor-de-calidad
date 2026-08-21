# SGC — Sistema de Gestión de la Calidad Universitaria

Plataforma modular para la gestión de acreditación y calidad académica. El contexto
completo (visión, arquitectura, stack, despliegue y costos) está en
[`CLAUDE.md`](./CLAUDE.md).

## Alcance actual (MVP 1)

Dos módulos en construcción paralela:

1. **Auth, Roles y Permisos** — transversal, base de todos los demás módulos.
2. **Plan de Estudios** — 131 RF + 24 RNF especificados.

## Estructura del repositorio

```
apps/
  api/                     Monolito NestJS modular hexagonal
    prisma/                Esquema y migraciones (Prisma Migrate)
    src/
      modules/
        auth/              domain / application / infrastructure
        plan-estudios/     domain / application / infrastructure
        auditoria/         bitácora append-only vía DomainEvents
      shared-kernel/       tipos compartidos, mínimo por diseño
      platform/            plomería NestJS transversal (config, prisma, colas, logging)
    test/                  integración y e2e
  web/                     React 18 + Vite + Tailwind, organizado por feature
infra/
  docker/                  compose y Dockerfiles del VPS core
  caddy/                   reverse proxy, TLS, estáticos
  scripts/                 backups y utilidades de despliegue
docs/
  arquitectura/            ADRs y diagramas
  requisitos/              RF / RNF por módulo
.github/workflows/         CI/CD (lint, typecheck, tests, build, deploy)
```

Cada frontera relevante tiene su propio `README.md` con las reglas que la gobiernan:
[`apps/api/src`](apps/api/src/README.md) ·
[`shared-kernel`](apps/api/src/shared-kernel/README.md) ·
[`platform`](apps/api/src/platform/README.md) ·
[`apps/web/src`](apps/web/src/README.md) ·
[`infra`](infra/README.md)

## Las tres reglas que no se negocian

1. **Regla de dependencia:** `infrastructure → application → domain`. El dominio no
   importa NestJS, Prisma ni Express.
2. **Aislamiento entre módulos:** ningún módulo accede a entidades, repositorios ni
   tablas de otro. Solo puertos.
3. **La IA vive fuera del monolito:** siempre detrás de `RecommendationPort`, en el
   servicio Python separado.

## Levantar el proyecto en local

Requisitos: **Node 22 LTS** (`.nvmrc`) y **Docker**.

### 1. Base de datos

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Publica PostgreSQL 16 en el puerto **5433**, no en el 5432 habitual, para no
chocar con otro PostgreSQL que ya esté corriendo en la máquina.

### 2. API

```bash
cd apps/api
npm install
cp .env.example .env          # el .env real nunca se versiona (§5.7)
npx prisma generate
npx prisma migrate deploy
npm run db:seed               # roles y permisos; NO crea usuarios
```

El seed no crea ninguna cuenta a propósito: una cuenta sembrada con contraseña
conocida acabaría en el VPS (§6.5). El primer administrador se crea a mano:

```bash
SGC_PASSWORD='TuContraseña' npm run usuario:crear --   --email admin@tu-universidad.edu.pe --nombre "Nombre Apellido" --rol ADMIN_SISTEMA
```

La contraseña va por variable de entorno y no como argumento: los argumentos
quedan en el historial del shell y se ven en la lista de procesos.

Roles disponibles: `ADMIN_SISTEMA`, `DIRECTOR_CARRERA`, `COORDINADOR_ACADEMICO`,
`DOCENTE`, `USUARIO_CONSULTOR`. Los tres del medio trabajan sobre una carrera
concreta y exigen además `--carrera <CÓDIGO>`.

Para arrancar:

```bash
npm run build && npm start    # API en http://localhost:3000/api/v1
```

> `npm run start:dev` **no funciona todavía**. `tsx` transpila con esbuild y
> esbuild no emite los metadatos de decoradores que NestJS necesita para
> resolver la inyección de dependencias, así que el contenedor arranca vacío.
> Se resuelve con `unplugin-swc`; hasta entonces, `build` + `start`.

La documentación OpenAPI queda en <http://localhost:3000/api/docs>.

### 3. Frontend

```bash
cd apps/web
npm install
npm run dev                   # http://localhost:5173
```

Vite reenvía `/api` al backend, así que el código pide en relativo y no
distingue entre desarrollo y producción, donde Caddy sirve ambos bajo el mismo
dominio (§5.2). De paso, no hay CORS que configurar.

## Estado

**Funciona hoy, contra la base de datos real:**

- Autenticación completa: login, sesión persistente, renovación de token,
  guardia de rutas y cierre de sesión.
- API del módulo Plan de Estudios: facultades y carreras (RF001–RF019),
  catálogo de objetivos y competencias (RF033–RF046), asignaturas
  (RF047–RF059), malla curricular (RF061–RF071) y ciclo de vida del plan
  (RF020–RF032, RF076).
- Bitácora de auditoría append-only sobre cada mutación relevante.

**Todavía no:**

- Las ocho pantallas del módulo funcionan sobre un almacén en memoria: se ven y
  se navegan, pero lo que se edite ahí **no llega a la base de datos**. Falta
  reemplazar la capa de datos del frontend por llamadas HTTP.
- Cuatro endpoints menores: auditoría, historial de aprobaciones,
  justificaciones y comparación de versiones.
- Generación de PDF y Excel (RF072/RF073), reportes (RF101–RF110) y gestión de
  usuarios desde la interfaz.
- Despliegue: no hay Dockerfile de la API ni compose de producción.
