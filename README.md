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

## Estado

Estructura de carpetas creada. Falta el andamiaje de proyectos (`package.json`,
`tsconfig`, NestJS CLI, Vite) y el esquema Prisma inicial.
