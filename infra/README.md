# `infra`

Infraestructura del VPS core (Hetzner + Docker Compose). Ver `CLAUDE.md` §5.

| Carpeta | Contenido previsto |
|---|---|
| `docker/` | `docker-compose.yml` (dev, ya existe), `docker-compose.prod.yml`, `api.Dockerfile` |
| `caddy/` | `Caddyfile` — reverse proxy, TLS automático, sirve el frontend estático |
| `scripts/` | `backup-db.sh` (`pg_dump` diario → Backblaze B2), utilidades de despliegue |

## Topología de servicios

```
api        # NestJS, imagen construida en CI            -> npm start
worker     # mismo código que api, otro entrypoint      -> npm run start:worker
postgres   # PostgreSQL 16, volumen persistente
redis      # cola de documentos + cache
caddy      # reverse proxy + TLS + estáticos del frontend
```

`api` y `worker` son el mismo build: `dist/main.js` levanta el servidor HTTP y
`dist/worker.js` un contexto sin servidor que consume la cola. El worker genera los PDF y
Excel (§3.4), que ocupan CPU durante cientos de milisegundos y dentro de la API competirían
con las peticiones que la cola existe para no bloquear.

En **desarrollo** el compose levanta solo `postgres` (5433) y `redis` (6380); la API, el
worker y el frontend corren en la máquina. Los puertos no son los estándar a propósito:
apuntar por descuido a otro PostgreSQL da un error de autenticación, pero apuntar a otro
Redis **no da ningún error** — encolaría los trabajos en la cola de otro proyecto y los
consumiría su worker.

Los documentos generados se guardan en el directorio que indique `DOCUMENTOS_DIR`
(`apps/api/var/documentos` en local). En el VPS debe ser un volumen con nombre, o cada
despliegue borraría los archivos ya generados.

El frontend se compila a estáticos y lo sirve Caddy: no necesita contenedor propio.

## Fuera de este compose, a propósito

El servicio de IA (FastAPI) **no** vive aquí. Se despliega por separado en la nube para no
acoplar su ciclo de vida ni sus recursos al VPS core, y solo se aprovisiona cuando
`RF-PEND-01` entre en desarrollo real (`CLAUDE.md` §5.2, §5.5).

## Reglas operativas

- Las migraciones corren como **paso explícito del pipeline** (`prisma migrate deploy`),
  antes de levantar `api` — nunca automáticamente al arrancar el contenedor.
- PostgreSQL y Redis **nunca** expuestos fuera de la red interna de Docker. El firewall de
  Hetzner solo abre 22 (SSH restringido por IP) y 80/443.
- `.env` fuera de control de versiones, con permisos restringidos en el VPS.
