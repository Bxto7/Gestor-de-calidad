# `infra`

Infraestructura del VPS core (Hetzner + Docker Compose). Ver `CLAUDE.md` §5.

| Carpeta | Contenido previsto |
|---|---|
| `docker/` | `docker-compose.yml` (dev), `docker-compose.prod.yml`, `api.Dockerfile` |
| `caddy/` | `Caddyfile` — reverse proxy, TLS automático, sirve el frontend estático |
| `scripts/` | `backup-db.sh` (`pg_dump` diario → Backblaze B2), utilidades de despliegue |

## Topología de servicios

```
api        # NestJS, imagen construida en CI
worker     # mismo código que api, proceso dedicado a consumir colas BullMQ
postgres   # PostgreSQL 16, volumen persistente
redis      # cola + cache
caddy      # reverse proxy + TLS + estáticos del frontend
```

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
