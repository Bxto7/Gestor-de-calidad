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

### Requisitos

| Requisito | Versión | Cómo comprobarlo |
|---|---|---|
| Node.js | **22.23.2**, la que fija [`.nvmrc`](.nvmrc). `engines` acepta `^20.19.0 \|\| >=22.12.0` | `node -v` |
| npm | 10.x, el que ya trae Node 22 | `npm -v` |
| Docker con Compose v2 | cualquiera reciente | `docker compose version` |

Usa 22 y no 20: Node 20 llegó a fin de vida en abril de 2026 y ya no recibe
parches de seguridad (`CLAUDE.md` §4.6). Con `nvm` instalado, `nvm use` en la
raíz toma la versión de `.nvmrc`.

Cuatro puertos deben estar libres antes de empezar:

| Puerto | Quién lo ocupa |
|---|---|
| `3000` | API NestJS |
| `5173` | frontend (Vite) |
| `5433` | PostgreSQL del compose — **no** el 5432 |
| `6380` | Redis del compose — **no** el 6379 |

Los dos últimos no son los estándar a propósito: el motivo está comentado en
[`infra/docker/docker-compose.yml`](infra/docker/docker-compose.yml) y en
`apps/api/.env.example`.

El orden importa: base de datos, después API, después frontend. La API no
arranca sin PostgreSQL, y el frontend sin la API se ve pero no autentica.

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

### 4. Comprobar que quedó bien

Con las dos partes levantadas:

```bash
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/docs           # 200
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/facultades  # 401
curl -o /dev/null -w '%{http_code}\n' http://localhost:5173/                   # 200
curl -o /dev/null -w '%{http_code}\n' http://localhost:5173/api/v1/auth/yo     # 401
```

Los `401` son la respuesta correcta, no un fallo: son rutas protegidas y se
está pidiendo sin token, así que confirman que el guardia JWT está en pie. Un
`404` en su lugar significaría que la ruta no llegó a registrarse.

En el arranque, la API lista todas sus rutas y termina con estas dos líneas:

```
[PrismaService] Conexión a PostgreSQL establecida.
[Arranque] API escuchando en http://localhost:3000/api/v1
```

Si en el log aparecen rutas pero no la línea de PrismaService, el problema es
la base de datos, no la aplicación. Y la suite completa debe quedar en verde:

```bash
cd apps/api && npm test        # 991 pruebas en 51 archivos
```

La suite de integración corre aparte y **vacía tablas con `TRUNCATE`**: exige una
base desechable y se niega a arrancar contra cualquier otra. Nómbrala `sgc_test`
—lo que hace CI— y se reconoce sola:

```bash
docker exec sgc_postgres psql -U sgc -d postgres -c 'CREATE DATABASE sgc_test OWNER sgc;'

cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public'
npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run test:integration
```

El seed no es opcional aquí: sin el catálogo de atributos del graduado, catorce
pruebas fallan por datos que faltan y no por un fallo real.

### Problemas conocidos al levantar

| Síntoma | Causa | Solución |
|---|---|---|
| `Nest can't resolve dependencies of X (?)` y la app no arranca | Se usó `npm run start:dev`. `tsx` transpila con esbuild, que no emite los metadatos de decoradores de los que depende la inyección de NestJS | `npm run build && npm start`. **No** añadas `@Inject()` a mano en los constructores: es rodear el problema, no arreglarlo — compilando con `tsc` la inyección se resuelve sola |
| `Port 5173 is in use, trying another one...` | Quedó un Vite vivo de una sesión anterior | `netstat -ano \| findstr :5173` y `taskkill /PID <pid> /F` en Windows; `lsof -ti:5173 \| xargs kill` en Linux/macOS |
| La API arranca pero sirve código viejo, o `Cannot find module dist/main.js` | `dist/` quedó a medias de una compilación interrumpida | `rm -rf apps/api/dist && npm run build` |
| `authentication failed for user "sgc"` | `DATABASE_URL` apunta al 5432, donde responde otro PostgreSQL que no conoce al usuario `sgc` | Comprueba que el `.env` diga `5433`, el puerto que publica el compose |
| `Cannot find module './generated/client.js'` al compilar | Falta generar el cliente Prisma. Se genera dentro de `src/platform/database/generated/`, que no se versiona: tras clonar el repo no existe | `cd apps/api && npx prisma generate` |
| El login responde `429` | El rate limiting de §4.4: cinco intentos por minuto y por IP | Espera un minuto. El límite del login está fijo en el controlador; `THROTTLE_LIMIT` solo mueve el global de 120/min, no este |
| `Falta DATABASE_URL. Revisa el .env o las variables del entorno.` | No se copió el `.env` | `cp apps/api/.env.example apps/api/.env`. Falla al arrancar y no en la primera consulta, a propósito |

Ninguno de estos deja el repositorio en mal estado. Si algo quedó a medias,
`git status` lo enseña y `git restore .` lo deshace: los servicios y los
artefactos de compilación viven fuera del control de versiones.

## Estado

**Funciona hoy, contra la base de datos real:**

- Autenticación completa: login, sesión persistente, renovación de token con
  rotación del refresh, guardia de rutas y cierre de sesión.
- API del módulo Plan de Estudios: facultades y carreras (RF001–RF019),
  catálogo de objetivos y competencias (RF033–RF046), asignaturas
  (RF047–RF059), malla curricular (RF061–RF071) y ciclo de vida del plan
  (RF020–RF032, RF076).
- Aprobaciones, justificaciones y comparación de versiones (RF082–RF099).
- Generación de PDF y Excel (RF072/RF073) encolada en BullMQ y ejecutada por el
  worker, fuera del request HTTP.
- Reportes y panel estadístico (RF101–RF110).
- Módulo de Mejora Continua, submódulo **Planes de Medición completo, 47 de
  47**: alta y ciclo de vida del plan, competencias agrupadas por atributo del
  graduado, periodos, matriz de programación, marcado de mediciones
  realizadas, motor de consistencia, versionado y duplicado con su linaje,
  historial, y exportación a PDF y Excel (RF-PM-027 a RF-PM-029) por la misma
  cola de BullMQ, con el worker enrutando cada trabajo a su módulo.
- Submódulo **Planes de Evaluación completo, 49 de 49 (RF-PE-001 a RF-PE-042)**: alta de
  un plan de evaluación a partir de un plan de medición Aprobado o Vigente, que
  hereda el tipo y la meta (nunca se repiten a mano); tarjeta de lo heredado
  —competencias y periodos del plan de medición base, en solo lectura, sin
  casillas ni campos editables porque RF-PE-010 y RF-PE-011 no dejan añadir ni
  quitar desde aquí—; el mismo ciclo de vida de estados que Planes de
  Medición, con permisos propios (`evaluacion.*`) y su propia entrada en la
  bitácora; la **configuración directa por competencia y periodo**
  (RF-PE-013 a RF-PE-021): instrumento y frecuencia —uno por competencia, vale
  para todos los periodos—, las asignaturas y el docente responsable de cada
  cruce competencia×periodo que la matriz del plan de medición base programó,
  y el porcentaje alcanzado, que RF-PE-006 RN2 deja registrar también con el
  plan ya Vigente aunque su definición —instrumento, frecuencia, asignaturas—
  se cierre al aprobarlo; y la **configuración indirecta por competencia y
  año** (RF-PE-022 a RF-PE-030): instrumento, frecuencia y responsable de cada
  competencia —comunes a todos los años del plan, no solo el que se está
  editando—, el porcentaje alcanzado por año, y las indicaciones de medición
  por grupo objetivo (Egresados, Empleadores, Docentes, Estudiantes) con su
  enlace al instrumento de recolección y, cuando ya se aplicó, al de los
  resultados —estas últimas editables y eliminables con confirmación
  (RF-PE-030) mientras el plan está en Borrador, y el enlace a resultados
  también sobre un plan ya Vigente (RF-PE-006 RN2); enviar a revisión, aprobar
  u observar con comentarios, con responsable y fecha de aprobación quedando
  en el propio plan (RF-PE-038 a RF-PE-042); **generar y exportar** el plan a
  PDF y Excel (RF-PE-031 a RF-PE-033) por la misma cola de BullMQ que Planes de
  Medición, calcando su formato mientras no exista el institucional (D-14); y
  **versionar** (RF-PE-034 a RF-PE-037): la versión nueva copia la definición
  —instrumento, frecuencia, responsable, asignaturas o indicaciones— pero nunca
  el seguimiento —porcentaje alcanzado, evidencias, enlace a resultados—, que
  es lo que ocurrió en un periodo concreto y no se hereda; el linaje se
  consulta de la más reciente a la más antigua, y una versión histórica se abre
  en solo lectura.
- Pantallas de Atributos del Graduado y de Criterios de Acreditación, con el
  aviso de impacto al editar un atributo que ya usan competencias o planes
  (RF120–RF123, RF128–RF132).
- Gestión de cuentas de usuario y bitácora de accesos, sobre la auditoría
  append-only que registra cada mutación relevante (RF078, RF080).
- El frontend consume todo eso por HTTP con `@tanstack/react-query`: plan de
  estudios, mejora continua, reportes y usuarios trabajan contra la API. Ya no
  queda ningún almacén en memoria.
- Pruebas en verde: 991 unitarias en la API, 239 en el frontend, 305 de
  integración en dieciocho suites contra un PostgreSQL real y desechable, y 40
  recorridos E2E con Playwright —nueve de ellos con `axe-core` sobre WCAG 2.1
  AA—. Los guiones de carga k6 viven en `tests/carga/`.
- CI en GitHub Actions con los quality gates de §6.6: typecheck, lint, formato,
  cobertura, `npm audit` y Semgrep, más un job de E2E que levanta PostgreSQL,
  Redis, la API y el worker.

**Todavía no:**

- Despliegue: `infra/` solo tiene el compose de desarrollo. Faltan el Dockerfile
  de la API, el compose de producción, el `Caddyfile` y los guiones de backup.
- No existe Staging (§5.3): las cifras de carga salen de una máquina de
  desarrollo, no del VPS. Son orientativas hasta medirlas allí.
- E2E y accesibilidad cubren el flujo de Mejora Continua, no el resto de
  pantallas. La revisión manual de accesibilidad que §6.4 pide en Staging sigue
  pendiente.
- Recarga en caliente del backend: `npm run start:dev` no funciona. La causa es
  que `tsx` (esbuild) no emite `emitDecoratorMetadata`, así que Nest cree que
  las clases con `@Injectable()` no tienen dependencias y las construye vacías
  —sin error al arrancar, reventando al primer uso—. El arreglo es migrar a
  `unplugin-swc`; mientras tanto, para probar contra la API real hay que
  compilar (`npm run build`) y ejecutar `dist/`.
