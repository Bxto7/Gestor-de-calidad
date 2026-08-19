# `apps/web/src` — Frontend React + Vite

Organización **por feature**, espejando los bounded contexts del backend. Un feature del
frontend nunca importa desde otro feature; lo compartido sube a `shared/`.

| Carpeta | Contenido |
|---|---|
| `app/` | Router, providers (`QueryClient`, auth context), layout raíz |
| `features/<modulo>/api/` | Llamadas HTTP + hooks de `@tanstack/react-query` |
| `features/<modulo>/schemas/` | Esquemas `zod`, compartidos con `react-hook-form` |
| `features/<modulo>/components/` | Componentes propios del feature |
| `features/<modulo>/hooks/` | Lógica de UI reutilizable dentro del feature |
| `features/<modulo>/pages/` | Componentes de ruta |
| `shared/components/ui/` | Primitivas de UI sin dominio (Button, Dialog, Table) |
| `shared/lib/` | Cliente HTTP, formateo, helpers |
| `styles/` | Entrada de Tailwind y tokens de tema |

## Notas de stack (`CLAUDE.md` §4.1)

- **Malla curricular:** drag & drop con `@dnd-kit/core` (no `react-beautiful-dnd`) —
  mejor mantenido y accesible.
- **Estado de servidor:** `@tanstack/react-query`. No duplicar datos del servidor en
  estado global.
- **Estado de UI:** React state; `zustand` solo si crece la complejidad. Evitar Redux
  salvo necesidad real.
- **Listados:** `@tanstack/react-table` (asignaturas, histórico de versiones).

## Recordatorio de seguridad

Las validaciones de la UI son de **experiencia de usuario**, no de correctitud. Todo
invariante de negocio se protege en el dominio del backend (`CLAUDE.md` §3.3).
