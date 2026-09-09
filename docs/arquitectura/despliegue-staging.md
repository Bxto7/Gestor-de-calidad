# Arquitectura de despliegue — Entorno de pruebas (Staging)

> Diseño de la arquitectura de despliegue del Sistema de Gestión de la Calidad
> para su entorno de pruebas (staging), con una condición de diseño explícita:
> **la forma más óptima para llevarlo a producción después**. Esto no es un
> entorno "de juguete": staging debe ser una réplica fiel y reducida de
> producción, donde corren la suite completa de E2E, las pruebas de carga (k6)
> y la aceptación con usuarios piloto, tal como exige `CLAUDE.md` §5.3 y §6.4.

---

## 1. Objetivo y principios de diseño

| Principio | Qué significa en la práctica |
|---|---|
| **Staging = producción en miniatura** | Misma topología, mismas imágenes, mismo pipeline. La diferencia entre entornos son variables (dominios, secretos, recursos), nunca arquitectura. |
| **Un solo mecanismo de despliegue** | El mismo script y el mismo `docker compose` despliegan staging y producción; solo cambia el archivo de entorno (`--env-file`). |
| **Un solo repositorio de artefactos** | Toda imagen y artefacto vive en `ghcr.io`, identificado por digest/SHA. Nada se reconstruye en el servidor. |
| **Migraciones explícitas** | `prisma migrate deploy` corre como paso del pipeline antes de levantar `api`, nunca al arrancar el contenedor (`infra/README.md`). |
| **Nada sensible expuesto** | PostgreSQL y Redis solo en la red interna de Docker. El único puerto público es 80/443 a través de Caddy. |
| **Rollback por cambio de referencia** | El despliegue apunta a un SHA; revertir es volver a apuntar al SHA anterior, no reconstruir. |

La consecuencia directa: **lo que se implemente y pruebe aquí es exactamente lo que llegará a producción**. El ajuste staging→producción no debe requerir más que cambiar variables y dominio.

---

## 2. Estado actual (verificado en código, septiembre de 2026)

| Pieza | Estado |
|---|---|
| Compose dev (postgres+redis, puertos 5433/6380) | ✅ existe — `infra/docker/docker-compose.yml` |
| Dockerfile de la API | ❌ no existe |
| Dockerfile / artefacto del frontend | ❌ no existe |
| `docker-compose.staging.yml` | ❌ no existe |
| Caddyfile | ❌ no existe (`infra/caddy/` vacío) |
| Workflow de build de imágenes + push a ghcr.io | ❌ pendiente (`ci.yml` §5.4-6) |
| Workflow de deploy + smoke tests | ❌ pendiente (§5.4-7/8) |
| Script de backup (`pg_dump` → B2) | ❌ no existe (`infra/scripts/` vacío) |
| VPS aprovisionado | ❌ no existe según `ci.yml` |

**Datos del código que condicionan el diseño:**
- API NestJS 11, ESM, Node 22 (`engines: ^20.19.0 || >=22.12.0`), puerto `3000`, prefijo global `api/v1`, Swagger en `/api/docs`.
- Dos entry points de la misma compilación: `dist/main.js` (HTTP) y `dist/worker.js` (sin servidor, consume la cola BullMQ `documentos` con concurrency 2).
- Prisma 7 multi-schema: `auth`, `plan_estudios`, `auditoria`, `mejora_continua`. El cliente generado **no se versiona** (`src/platform/database/generated`) → el build de imagen debe ejecutar `prisma generate`.
- `prisma.config.ts` lee `DATABASE_URL` de env; driver adapter `@prisma/adapter-pg`.
- Variables exigidas al arrancar: `JWT_SECRET` (≥32 chars), `DATABASE_URL`, `REDIS_URL`. Opcionales con default: `PORT` (3000), `THROTTLE_LIMIT` (120/min), `TRUST_PROXY` (0), `DOCUMENTOS_DIR` (`./var/documentos`).
- Frontend Vite: build estático con ruta base `/`; en producción usa `VITE_API_URL` por defecto `/api/v1` (mismo origen — lo resuelve Caddy). No existe `THROTTLE_TTL`: el TTL está fijo en 60 s en código.
- Seed (`prisma/seed.ts`): solo el catálogo idempotente de permisos; no crea usuarios (§6.5 — el primer admin se crea con `npm run usuario:crear`).

---

## 3. Decisión de hosting

### ✅ Decidido: segundo VPS pequeño (Hetzner CX23) — elegido el 7 de septiembre de 2026

- **2 vCPU / 4 GB / 40 GB NVMe**, ~$6–7/mes (`CLAUDE.md` §7.2).
- Aislamiento total: las pruebas de carga (k6), la suite E2E completa y la aceptación con usuarios piloto **no compiten con producción** ni pueden degradarla.
- El pipeline de staging no toca jamás los secretos ni los contenedores de producción.
- Costo mínimo (unos soles), y elimina la clase completa de bugs "funciona en staging porque comparte el VPS con prod".

### Alternativa descartada: mismo VPS que producción

- Dos **stacks Completely independientes** (`name: sgc-staging` / `name: sgc-prod`): redes, volúmenes y contenedores separados. Nunca se comparte una base de datos ni una cola entre entornos.
- Un único Caddy "router" en 80/443 que enruta por hostname a la red de cada stack.
- **No se eligió** porque la suite completa de pruebas (carga/accesibilidad) debe correr sin riesgo de afectar producción — exactamente el caso de este proyecto según `CLAUDE.md` §7.2. Queda documentada como referencia, no como plan B activo.

> **Independientemente de la opción, el compose y el pipeline son idénticos.** La
> única diferencia visible es dónde corre y qué dominio apunta. Por eso este
> diseño es neutral al hosting.

---

## 4. Topología de servicios

```
                         ┌─────────────── VPS staging (Hetzner CX23) ───────────────┐
                         │                                                          │
 Internet ── 80 ───────▶ │  caddy  (HTTP sobre IP hoy; TLS automático con dominio)  │
                         │   ├── /          ──▶  web/current (build de Vite)        │
                         │   ├── /api/*     ──▶  api:3000    (reverse_proxy)        │
                         │   └── /api/docs  ──▶  Swagger (mismo proxy, bearer)      │
                         │                                                          │
                         │            ┌────── red interna sgc-net ──────┐           │
                         │            │                                 │           │
                         │   api ─────┤──▶ postgres:16  (multi-schema)  │           │
                         │   (3000)   │──▶ redis:7     (BullMQ)         │           │
                         │            │                                 │           │
                         │  worker ───┼──▶ redis:7    (cola `documentos`)│          │
                         │  (sin HTTP)│──▶ volumen sgc_documentos       │           │
                         │            │     (PDF/Excel generados)       │           │
                         │            └─────────────────────────────────┘           │
                         │                                                          │
                         │  Volúmenes con nombre: sgc_postgres, sgc_redis,           │
                         │  sgc_documentos, web/ (estáticos versionados por SHA)     │
                         └──────────────────────────────────────────────────────────┘
```

**Reglas de la topología:**
- `api` y `worker` son **la misma imagen**, con distinto comando (`node dist/main.js` vs `node dist/worker.js`), como ya define `infra/README.md`.
- Caddy publica **80 hoy** (IP sin TLS) y **80+443** cuando exista dominio — es el **único** servicio con puertos al host.
- PostgreSQL y Redis **sin puertos publicados** en staging/producción (los puertos no estándar 5433/6380 son solo del compose de desarrollo).
- Los documentos generados viven en un volumen con nombre (`DOCUMENTOS_DIR`), con clave opaca en la BD — listo para migrar a B2 cuando producción lo pida (`infra/README.md`).

---

## 5. Artefactos de build

### 5.1 Imagen de la API (`ghcr.io/<org>/sgc-api`)

Una sola imagen, dos entry points. Multi-stage:

```dockerfile
# apps/api/Dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate          # el cliente NO se versiona: generarlo en build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build                # tsc -> dist/main.js + dist/worker.js

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]     # el worker lo sobreescribe el compose
```

**Cambio requerido en `apps/api/package.json`:** mover `prisma` (CLI) y `tsx` de `devDependencies` a `dependencies`. Motivo: el pipeline ejecuta `prisma migrate deploy` y `tsx prisma/seed.ts` **dentro del contenedor en el VPS**, y la imagen runtime no puede correrlos si quedaron fuera de `node_modules`. Es práctica común del ecosistema Prisma; el costo es algo de tamaño de imagen, a cambio de un contenedor autosuficiente (no requiere una imagen de migración separada).

**Tags:** `ghcr.io/<org>/sgc-api:<sha-corto>` (inmutable) + `:staging` y `:latest` (punteros móviles). Rollback = volver al tag `<sha>`.

### 5.2 Frontend (`ghcr.io/<org>/sgc-web`)

El frontend **no tiene contenedor de servicio** (decisión de `CLAUDE.md` §5.2: Caddy sirve los estáticos), pero para transportar el build al VPS se publica como **imagen OCI de contenido**:

```dockerfile
# apps/web/Dockerfile — imagen de transporte, no de servicio
FROM scratch
COPY dist/ /web/
```

En el VPS, el despliegue extrae el contenido sin correr nada:

```bash
docker run --rm -v /srv/sgc/<env>/web/<sha>:/out ghcr.io/<org>/sgc-web:<sha> \
  cp -r /web/. /out/
```

Esto mantiene **un único repositorio de artefactos** (ghcr.io), digests verificables y rollback por SHA, sin añadir un runtime Node en el servidor.

> Alternativa más simple (si se prefiere evitar la imagen `scratch`): el job de
> deploy sube el build por `rsync`/SSH a un directorio versionado. Funciona,
> pero rompe la unicidad del mecanismo de artefactos. Recomendada la imagen.

### 5.3 Caché de build

Build en CI con `docker/buildx` + caché de capas (`ghcr.io/<org>/sgc-api-cache`). La capa `npm ci` cambia poco y es la más cara: sin caché, cada deploy reconstruye todas las dependencias.

---

## 6. Composición por entorno

Un **único compose** parametrizado con `--env-file` (staging/prod comparten el archivo; el `.env` del servidor define entorno, dominios y secretos). Vive en `infra/docker/docker-compose.yml` **deployment** — el compose de desarrollo actual se renombra como `docker-compose.dev.yml` para evitar ambigüedad (o se mueve a `infra/docker/dev/`).

```yaml
# infra/docker/docker-compose.yml — despliegue (staging y producción)
name: sgc-${ENV}          # sgc-staging | sgc-prod

services:
  api:
    image: ghcr.io/${GHCR_ORG}/sgc-api:${IMAGE_TAG}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: ${DATABASE_URL}        # apunta a postgres interno del stack
      REDIS_URL: ${REDIS_URL}              # apunta a redis interno del stack
      THROTTLE_LIMIT: ${THROTTLE_LIMIT:-120}
      TRUST_PROXY: 1                       # Caddy delante; nº de saltos, no `true`
      DOCUMENTOS_DIR: /var/documentos
    volumes:
      - sgc_documentos:/var/documentos
    networks: [sgc-net]
    healthcheck:
      test: ['CMD-SHELL', "node -e \"fetch('http://localhost:3000/api/v1/planes-medicion').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))\""]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  worker:
    image: ghcr.io/${GHCR_ORG}/sgc-api:${IMAGE_TAG}   # MISMA imagen
    command: ['node', 'dist/worker.js']               # entry point sin HTTP
    restart: unless-stopped
    environment:
      NODE_ENV: production
      REDIS_URL: ${REDIS_URL}
      DOCUMENTOS_DIR: /var/documentos
    volumes:
      - sgc_documentos:/var/documentos
    networks: [sgc-net]
    depends_on:
      redis: { condition: service_healthy }

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: sgc
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}   # secreto del .env del VPS
      POSTGRES_DB: sgc
    volumes:
      - sgc_postgres:/var/lib/postgresql/data
    networks: [sgc-net]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U sgc -d sgc']
      interval: 5s
      timeout: 5s
      retries: 10
    # SIN ports publicados: solo la red interna

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ['redis-server', '--appendonly', 'yes', '--requirepass', '${REDIS_PASSWORD}']
    volumes:
      - sgc_redis:/data
    networks: [sgc-net]
    healthcheck:
      test: ['CMD-SHELL', "redis-cli -a \"$$REDIS_PASSWORD\" ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    # SIN ports publicados

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    environment:
      ENV: ${ENV}                    # selecciona Caddyfile.staging / Caddyfile.prod
    volumes:
      - ./caddy:/etc/caddy:ro         # Caddyfile + Caddyfile.staging + Caddyfile.prod
      - caddy_data:/data              # certificados Let's Encrypt
      - caddy_config:/config
      - ../deploy/web/current:/srv/web:ro   # estáticos versionados (symlink al SHA)
    networks: [sgc-net]

volumes:
  sgc_postgres:
  sgc_redis:
  sgc_documentos:
  caddy_data:
  caddy_config:

networks:
  sgc-net:
    driver: bridge
```

**Notas críticas del archivo:**
- `TRUST_PROXY: 1` es un **número de saltos**, no `true` (`infra/README.md`): confiar sin contarlos permite falsificar `X-Forwarded-For` y esquivar el límite del login.
- `REDIS_URL` debe incluir la password: `redis://:${REDIS_PASSWORD}@redis:6379`. BullMQ ya corre con `maxRetriesPerRequest: null` (`cola.ts`).
- El healthcheck de la API reutiliza el patrón que ya usa CI (`/api/v1/planes-medicion` → 401 = vivo) porque **no existe un endpoint `/health`** en el código; ver §8 pendiente opcional.
- Si staging y producción comparten VPS: dos stacks con `name` distinto, y **un solo Caddy router** que enruta por hostname a cada red (`sgc-staging_sgc-net` / `sgc-prod_sgc-net`). El compose de cada stack deja de publicar 80/443 y Caddy vive en un stack propio. Ver §3 (alternativa).

---

## 7. Caddy

`infra/caddy/Caddyfile.staging` (y el patrón análogo `.prod`):

```
# infra/caddy/Caddyfile.staging
# NOTA DE DOMINIO: hoy no hay dominio, así que Caddy responde por IP en el
# puerto 80, sin TLS (búsqueda directa http://<IP-VPS>).
#
# Cuando exista dominio, el ÚNICO cambio es la primera línea del sitio:
#        :80 {                  ->   staging.tu-dominio.com {
# y descomentar el bloque global de email. Caddy emitirá TLS automático
# (Let's Encrypt, con `caddy_data` persistente) sin tocar nada más.
{
	# email le@tu-dominio.com   # SOLO cuando haya dominio (requisito de Let's Encrypt)
}

:80 {
	encode gzip

	# API: mismo origen que los estáticos, ruta relativa /api/v1 del frontend
	reverse_proxy /api/* api:3000

	# Frontend: build estático versionado por SHA (symlink `current`)
	root * /srv/web
	try_files {path} /index.html
	file_server

	# Headers de seguridad básicos (ASVS L1)
	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
	}

	# No cachear el HTML; cachear agresivamente los assets con hash de Vite
	@nocache path / /index.html
	header @nocache Cache-Control "no-store"
	@hashed path /assets/*
	header @hashed Cache-Control "public, max-age=31536000, immutable"
}
```

- **Hoy, sin dominio:** un único sitio `:80` responde por IP. Frontend y API comparten origen en `http://<IP-VPS>` con ruta relativa; nada de CORS ni `VITE_API_URL` explícita.
- `try_files ... /index.html` habilita el router del SPA.
- **Transición a dominio:** cambiar `:80 {` → `staging.tu-dominio.com {`, descomentar el `email` global. Caddy consigue el certificado solo (HTTP-01/Let's Encrypt) y sirve en 443; `caddy_data` ya es persistente.
- El patrón `.prod` es idéntico, apuntando a `tu-dominio.com` y con HSTS si se quiere.

---

## 8. Variables de entorno, secretos y datos

### Tabla entorno a entorno

| Variable | Staging (hoy) | Producción (cuando exista) |
|---|---|---|
| `ENV` | `staging` | `prod` |
| `BASE_URL` (URL pública del sitio, para smoke y E2E) | `http://<IP-VPS>` — sin dominio, sin TLS | `https://tu-dominio.com` |
| Hostname en Caddy | `:80` (por IP) | `tu-dominio.com` |
| `JWT_SECRET` | valor A (≥32 chars) | valor B — **nunca igual a staging** |
| `POSTGRES_PASSWORD` | valor C | valor D — nunca igual |
| `REDIS_PASSWORD` | valor E | valor F — nunca igual |
| `THROTTLE_LIMIT` | `120` (igual que prod) | `120` |
| `TRUST_PROXY` | `1` | `1` |

### Dónde viven los secretos

- **CI (GitHub Actions Secrets):** `GHCR_ORG`, `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`. El job de build no necesita los secretos de aplicación: las imágenes se publican antes y el `.env` del VPS nunca viaja por CI.
- **VPS:** `/srv/sgc/<env>/.env` — fuera del repositorio y del contenedor, permisos restringidos (0600), jamás en imágenes. Contiene además `BASE_URL` (la URL pública con la que los scripts de smoke/E2E apuntan al sitio), que hoy es `http://<IP-VPS>` y mañana será `https://staging.tu-dominio.com`.

### Datos de staging

- **Sembrado de catálogo:** `npx tsx prisma/seed.ts` (idempotente, solo permisos).
- **Usuarios:** se crean con `npm run usuario:crear` — **solo datos sintéticos** (§6.5). Nunca datos reales de estudiantes/docentes fuera de producción.
- La base de staging puede destruirse y recrearse sin costo: es un estado desechable que el pipeline debe poder reponer.

### Pendiente opcional que mejora los healthchecks

El código no expone un endpoint `/health`. Para un monitoreo mínimamente decente (Uptime Kuma §5.8) conviene añadir `GET /api/v1/health` que devuelva 200 y estado de conexión a Postgres/Redis **sin exponer detalles internos**. Hasta entonces, el smoke usa el patrón 401 de `/api/v1/planes-medicion` (ya probado en CI).

---

## 9. Pipeline CI/CD

### Flujo

```
PR ──▶ CI completo (existente) ──▶ merge a main
                                    (no despliega nada)

Botón "Run workflow" en GitHub Actions  ──▶ [deploy.yml] build + push imágenes (buildx cache)
                                       │  sgc-api:<sha>, :staging
                                       │  sgc-web:<sha>, :staging
                                       ▼
                     deploy manual a staging (workflow_dispatch):
                       1. SSH staging
                       2. docker compose pull (imágenes por <sha>)
                       3. extraer estáticos sgc-web:<sha> a web/<sha>; symlink current
                       4. docker compose -f ... --env-file .env up -d (con migrate)
                       5. smoke tests (§9 — script smoke.sh)
                       6. (opcional) job manual k6 sobre staging
```

Despliegue **manual a propósito** (decisión del 7 de septiembre de 2026): el botón
`Run workflow` de Actions permite elegir el ref/SHA exacto a desplegar antes de
tocar staging. Nada se despliega solo con el merge.

### `deploy.yml` (nuevo, disparo manual)

```yaml
name: Deploy staging

on:
  workflow_dispatch:        # manual: eliges el ref/SHA en el botón Run workflow

permissions:
  contents: read
  packages: write          # publicar a ghcr.io

jobs:
  build-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7   # usa el ref elegido en el botón (github.sha)
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - name: Imagen API (api + worker)
        uses: docker/build-push-action@v6
        with:
          context: apps/api
          tags: |
            ghcr.io/${{ vars.GHCR_ORG }}/sgc-api:${{ github.sha }}
            ghcr.io/${{ vars.GHCR_ORG }}/sgc-api:staging
          cache-from: type=registry,ref=ghcr.io/${{ vars.GHCR_ORG }}/sgc-api-cache
          cache-to: type=registry,ref=ghcr.io/${{ vars.GHCR_ORG }}/sgc-api-cache,mode=max
          push: true
      - name: Frontend
        run: |
          npm ci && npm run build        # dentro de apps/web
        # y publicar dist/ como ghcr.io/<org>/sgc-web:<sha> (ver 5.2)

  deploy-staging:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_SSH_HOST }}
          username: ${{ secrets.STAGING_SSH_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /srv/sgc/staging
            export IMAGE_TAG=${{ github.sha }}
            bash infra/scripts/deploy.sh staging
```

### Script de despliegue (`infra/scripts/deploy.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
ENV="${1:?uso: deploy.sh <staging|prod>}"
BASE="/srv/sgc/$ENV"
export $(grep -v '^#' "$BASE/.env" | xargs)

cd "$BASE"

# 1. Traer las imágenes inmutables del SHA
docker compose --env-file .env pull

# 2. Frontend: extraer el build versionado y apuntar `current`
SHA="${IMAGE_TAG}"
docker run --rm -v "$BASE/web/$SHA:/out" "ghcr.io/${GHCR_ORG}/sgc-web:$SHA" cp -r /web/. /out/
ln -sfn "$SHA" "$BASE/web/current"

# 3. Migraciones: paso explícito, ANTES de levantar api
docker compose --env-file .env run --rm api npx prisma migrate deploy

# 4. Seed del catálogo (idempotente)
docker compose --env-file .env run --rm api npm run db:seed

# 5. Levantar
docker compose --env-file .env up -d

# 6. Smoke
bash "$BASE/infra/scripts/smoke.sh" staging
```

### Script de smoke (`infra/scripts/smoke.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
ENV="${1:?uso: smoke.sh <staging|prod>}"
BASE="/srv/sgc/$ENV"
BASE_URL="$(grep -E '^BASE_URL=' "$BASE/.env" | cut -d= -f2-)"   # ej: http://203.0.113.10

# Frontend servido: el HTML del SPA responde 200
curl -fsS -o /dev/null -w "web: %{http_code}\n" "$BASE_URL/"

# API viva: endpoint protegido responde 401 (sin credenciales)
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/planes-medicion")
[ "$code" = "401" ] && echo "api: 401 esperado, OK" || { echo "api: $code inesperado"; exit 1; }

# Swagger montado
curl -fsS -o /dev/null -w "docs: %{http_code}\n" "$BASE_URL/api/docs"
```

### `ci.yml` — se amplía, no se reemplaza

El CI actual ya cubre calidad/tests/SAST/cobertura/E2E. El nuevo `deploy.yml` solo añade build+push+deploy. En PR no se publica nada.

---

## 10. Pruebas que corren sobre staging (per CLAUDE.md §6.4)

| Prueba | Dónde | Cómo |
|---|---|---|
| E2E completo (Playwright) | Staging | Job manual/`workflow_dispatch` apuntando `PLAYWRIGHT_BASE_URL=${BASE_URL}` (del `.env`). La suite completa, no el subconjunto de CI. |
| Carga (k6) | Staging **solo** | Job manual `workflow_dispatch` ejecutando `tests/carga/` contra `${BASE_URL}`. Nunca en producción. |
| Accesibilidad manual | Staging | Revisión puntual con `axe-core` sobre las pantallas del flujo. |
| Aceptación con usuarios piloto | Staging | Director de carrera / Coordinador académico contra `${BASE_URL}`. |

Estas validaciones son exactamente las que habilitan promo a producción.

---

## 11. Backups, observabilidad y seguridad

### Backups (`infra/scripts/backup-db.sh`)

- `pg_dump` diario **dentro del contenedor** de postgres del entorno, comprimido, retención local ≥7 días en staging / ≥30 días en producción.
- En producción: subida a Backblaze B2 (`rclone`) con rotación — el componente `b2sync`/`rclone` vive en el estático nativo (no en un contenedor del stack) o como un cron en el host.
- Mismo script para ambos entornos: solo cambia el contenedor y la retención.

```bash
#!/usr/bin/env bash
set -euo pipefail
ENV="${1:?uso: backup-db.sh <staging|prod>}"
CONTAINER="sgc-${ENV}-postgres-1"
STAMP="$(date +%Y%m%d-%H%M%S)"
docker exec "$CONTAINER" pg_dump -U sgc -d sgc -Fc \
  > "/srv/sgc/$ENV/backups/sgc-$STAMP.dump"
find "/srv/sgc/$ENV/backups" -name '*.dump' -mtime +"${RETENTION:-7}" -delete
# Producción además: rclone copyto ... b2:bucket/backups/ ...
```

### Observabilidad

- Logs estructurados a stdout (ya es la convención del proyecto). En staging basta `docker compose logs`; en producción, un recolector si el volumen lo justifica.
- **Uptime Kuma** self-hosted en el VPS (§5.8): heartbeat a `BASE_URL` (hoy `http://<IP>`; cuando haya dominio, `https://staging.tu-dominio.com`) y al `/api/v1/health` cuando exista.
- `restart: unless-stopped` + healthchecks de todos los servicios (sin `depends_on` de "solo arranque": condiciones de salud reales).

### Seguridad de staging

- Misma postura que producción: firewall 22/80/443 en el VPS (hoy el sitio se sirve por 80 sin TLS; cuando haya dominio, Caddy activa TLS en 443), secretos fuera del repo, `TRUST_PROXY=1`, redes internas sin puertos expuestos.
- **Nota sin dominio:** el tráfico a staging va en HTTP por IP. Es aceptable para un entorno de pruebas con datos sintéticos y credenciales propias, pero el primer paso al adquirir un dominio es activar TLS (cambio de una línea en el Caddyfile). Nunca se corre producción sin TLS.
- Los secretos de staging son **distintos** de los de producción, aunque staging no toque datos reales: evita que un compromiso de staging se convierta en uno de producción con credenciales reutilizadas.

---

## 12. Transición a producción (el camino ya allanado)

Cuando el proyecto esté listo para producción, **no se rediseña nada**:

1. Aprovisionar VPS Hetzner CPX21 o CPX31 (mismo procedimiento del checklist §14).
2. Crear `/srv/sgc/prod/.env` con `BASE_URL=https://tu-dominio.com` y secretos propios; apuntar DNS.
3. Añadir secretos SSH de producción al repo.
4. Crear `deploy-prod.yml`: mismo `deploy.sh prod`, disparado por **tag `v*`** (release candidato) — mientras que staging se dispara **manual** vía `workflow_dispatch`.
5. Correr migraciones + seed + smoke igual que staging.
6. Ejecutar la suite E2E completa y k6 contra producción con los mismos checks que validaron el último staging.
7. Activar backups con retención 30 días + B2 + snapshot de Hetzner (§5.6).

La única diferencia de arquitectura entre entornos es el **trigger del deploy** (staging manual; producción por tag `v*`) y los **valores del `.env`** (`BASE_URL`, secretos). Cuando se compre el dominio para staging, el cambio es editar `BASE_URL` en `.env` y la primera línea del Caddyfile — ningún cambio estructural.

---

## 13. Costos (staging)

| Ítem | Costo/mes | Notas |
|---|---|---|
| VPS Hetzner CX23 (2 vCPU/4 GB/40 GB) | ~$6–7 | Decidido: aislamiento para k6 y E2E completo |
| Dominio | $0 por ahora | Sin dominio: staging se sirve por IP en HTTP. Cuando se compre uno (~$1/mes, `CLAUDE.md` §7.1), se activa TLS |
| ghcr.io (imágenes + caché) | $0 | Sin coste hasta cuotas razonables |
| Backups staging (local) | $0 | Retención 7 días local; B2 solo en prod |
| **Total (hoy)** | **≈$6–7/mes** | |

Alternativa misma VPS que prod: **$0 incremental** (solo un poco más de disco/RAM compartidos), con el riesgode interferencia ya descrito en §3.

---

## 14. Checklist de aprovisionamiento (cuando tengas el VPS)

- [ ] Crear VPS Hetzner CX23; firewall: solo 22 (SSH restringido por IP) y 80 (443 también, para cuando haya dominio).
- [ ] **Dominio:** no hace falta para arrancar — Caddy responde por IP en `http://<IP-VPS>`. Cuando compres el dominio: registro A (`staging` → IP), cambiar la primera línea del Caddyfile y `BASE_URL` en `.env`; Caddy hace el TLS solo.
- [ ] Instalar Docker Engine + plugin compose (`apt install docker-compose-plugin`).
- [ ] Crear usuario de deploy sin sudo directo (o con sudo restringido a docker); subir clave SSH pública (`STAGING_SSH_KEY`).
- [ ] Clonar/copiar el repo a `/srv/sgc/staging/` (solo `infra/` y `apps/` alcanzan para deploy).
- [ ] Crear `/srv/sgc/staging/.env` (0600): `ENV`, `GHCR_ORG`, `IMAGE_TAG`, `BASE_URL` (=`http://<IP-VPS>`), `JWT_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `DATABASE_URL`, `REDIS_URL`.
- [ ] GitHub Secrets: `GHCR_ORG`, `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`.
- [ ] Mover `prisma` y `tsx` a `dependencies` en `apps/api/package.json` (requisito del Dockerfile).
- [ ] Crear el endpoint `/api/v1/health` (opcional pero recomendado).
- [ ] Correr el workflow manual; verificar smoke + Swagger + una pantalla del frontend.
- [ ] Uptime Kuma apuntando a staging (opcional).
- [ ] Email transaccional (Resend, si el MVP lo requiere) con reseñas para staging.

---

## 15. Decisiones tomadas (7 de septiembre de 2026)

| # | Decisión | Elección |
|---|---|---|
| 1 | **Hosting de staging** | ✅ VPS Hetzner **CX23 aparte** (~$6–7/mes), aislamiento total |
| 2 | **Dominio** | ⏳ **Pendiente**: hasta que exista, staging se sirve por IP en HTTP (`http://<IP-VPS>`). Al comprar el dominio: `BASE_URL` + primera línea del Caddyfile, y TLS queda activo. Sin cambios estructurales |
| 3 | **Transporte del frontend** | ✅ **Imagen OCI** `sgc-web` (scratch) en ghcr.io — mecanismo único de artefactos, rollback por SHA |
| 4 | **Trigger de deploy a staging** | ✅ **Manual** — `workflow_dispatch` (botón Run workflow); el merge a `main` nunca despliega solo |

> Con estas cuatro decisiones el diseño queda **cerrado y listo para implementar**:
> Dockerfile de API, imagen del frontend, compose de despliegue, Caddyfile,
> `deploy.yml`, `deploy.sh`, `smoke.sh` y `backup-db.sh`. La implementación es el
> siguiente paso cuando se apruebe.