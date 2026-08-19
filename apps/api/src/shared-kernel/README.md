# `shared-kernel`

Tipos y utilidades **genuinamente** compartidos entre módulos. Se mantiene mínimo por
diseño: `CLAUDE.md` §2 prohíbe explícitamente convertirlo en un cajón de sastre que
reintroduzca acoplamiento entre bounded contexts.

## Qué SÍ va aquí

- `domain-events/` — clase base `DomainEvent`, contrato del bus de eventos.
  Es lo que permite que `plan-estudios` emita eventos y `auditoria` los consuma sin
  que ninguno conozca al otro.
- `types/` — primitivas sin dominio: `Result<T, E>`, `UniqueId`, paginación.
- `errors/` — jerarquía base de errores de dominio (`DomainError`, `InvariantViolation`).

## Qué NO va aquí

- Entidades de negocio. Si una entidad parece necesaria en dos módulos, casi siempre
  significa que el puerto entre ambos está mal definido.
- Lógica de un solo módulo "por si acaso otro la usa después".
- Cualquier import de NestJS, Prisma o Express — esto lo consume `domain/`.

## Prueba de olfato

Antes de agregar algo: si al eliminarlo solo se rompe **un** módulo, no pertenece aquí.
