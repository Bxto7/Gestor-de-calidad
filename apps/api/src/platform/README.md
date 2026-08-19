# `platform`

Plomería transversal a nivel de framework. **No contiene reglas de negocio.**

| Carpeta | Contenido |
|---|---|
| `config/` | Carga y validación tipada de variables de entorno |
| `database/` | `PrismaModule` / `PrismaService` compartido por los repositorios de cada módulo |
| `queue/` | Configuración de BullMQ/Redis; cada módulo registra sus propias colas |
| `http/` | Exception filters, interceptors, pipe de validación (`zod`/`class-validator`) |
| `logging/` | Logger estructurado JSON a stdout (`CLAUDE.md` §5.8) |

## Diferencia con `shared-kernel/`

- `shared-kernel/` es **dominio compartido**: puro, sin framework, lo consume `domain/`.
- `platform/` es **infraestructura compartida**: conoce NestJS y Prisma, y solo lo
  consume la capa `infrastructure/` de los módulos.

Que `platform/` exista es justamente lo que evita que esa plomería termine contaminando
`shared-kernel/`.
