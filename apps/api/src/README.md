# `apps/api/src` — Monolito modular hexagonal

Estructura interna del core NestJS. Ver `CLAUDE.md` §3.1–3.5 para el razonamiento completo.

## Regla de dependencia (no negociable)

```
infrastructure ──▶ application ──▶ domain
```

- `domain/` **no importa nada** de `application/`, `infrastructure/`, NestJS, Prisma ni Express.
  Debe poder testearse con `jest` sin levantar el framework.
- `application/` depende solo de `domain/` y **define** los `ports/` (interfaces).
- `infrastructure/` **implementa** los ports y es la única capa que conoce el framework y el ORM.

## Regla entre módulos (no negociable)

Un módulo nunca importa entidades ni repositorios de otro módulo, ni consulta sus tablas.
Toda comunicación cruzada pasa por un puerto expuesto explícitamente.

Ejemplo: `plan-estudios` no consulta la tabla de roles — pide la decisión al
`AuthorizationPort` que expone `auth`.

## Qué va en cada carpeta

| Carpeta | Contenido | Ejemplos |
|---|---|---|
| `modules/*/domain/entities` | Entidades con sus invariantes | `PlanDeEstudios`, `Asignatura` |
| `modules/*/domain/value-objects` | Value objects inmutables | `EstadoPlan`, `Version`, `Creditos` |
| `modules/*/domain/services` | Servicios de dominio puros | `MotorDeValidaciones` |
| `modules/*/domain/events` | Eventos de dominio emitidos por las entidades | `PlanAprobado` |
| `modules/*/application/use-cases` | Un caso de uso por archivo | `AprobarPlan`, `GenerarNuevaVersion` |
| `modules/*/application/ports` | Interfaces que infraestructura implementa | `RepositorioPlanPort`, `RecommendationPort` |
| `modules/*/infrastructure/persistence` | Repositorios Prisma | `PlanRepositoryPrisma` |
| `modules/*/infrastructure/http` | Controllers, DTOs, guards | `PlanController` |
| `shared-kernel/` | Tipos genuinamente compartidos entre módulos (mínimo) | `DomainEvent`, `Result` |
| `platform/` | Plomería NestJS transversal, sin dominio | `PrismaModule`, filtros, logging |

## Nomenclatura

Dominio y casos de uso en **español** (coherente con el negocio: `PlanDeEstudios`,
`MotorDeValidaciones`). Artefactos técnicos de infraestructura en **inglés** cuando ese
sea el patrón del framework (`PlanRepositoryPrisma`, `CrearPlanDto`).
