# Módulo `auth`

Módulo transversal del MVP 1. Los demás módulos lo **consumen**, nunca lo reimplementan.
Ver `CLAUDE.md` §3.5 y §4.4.

## Contrato hacia afuera

`application/ports/authorization.port.ts` es la **única** superficie que otros módulos
usan. Nadie fuera de `auth` consulta las tablas `usuarios`, `roles`, `permisos` ni
`rol_permiso`.

## Decisiones fijadas

- JWT de acceso de vida corta + refresh token de vida más larga, **con rotación en cada uso**.
- Passwords con `argon2id` (no bcrypt): mejor resistencia a ataques con hardware dedicado.
- Roles y permisos son **datos, no código** — agregar un rol nuevo no debe requerir un
  despliegue.
- Rate limiting en los endpoints de login (`@nestjs/throttler`) contra fuerza bruta.

## Reparto de responsabilidades en los guards

Los guards de `infrastructure/http/guards/` **solo** validan el token y resuelven la
identidad. La decisión de autorización de negocio se delega al `AuthorizationPort` — no
vive en el guard.

## Cuándo reconsiderar un IAM externo

Solo si más aplicaciones necesitan autenticarse contra el mismo directorio de usuarios,
o si la universidad exige SSO institucional (Active Directory/LDAP). No antes.
