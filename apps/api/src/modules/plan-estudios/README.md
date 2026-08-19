# Módulo `plan-estudios`

Bounded context del MVP 1 (131 RF + 24 RNF). Ver `CLAUDE.md` §3.3–3.4.

## Invariantes que protege el dominio (no la UI)

1. Una carrera tiene **como máximo una** versión `Vigente` a la vez.
2. Las versiones `Histórico` son **inmutables** — modificarlas falla en dominio.
3. El grafo de prerrequisitos/correquisitos **no puede tener ciclos**.
4. Edición permitida **solo** en `Borrador` o `En revisión`.

## Máquina de estados

```
Borrador ──▶ En revisión ──▶ Aprobado ──▶ Vigente ──▶ Histórico
```

Implementada como máquina de estados explícita en `domain/` — no un `string` libre con
`if`s dispersos. Cada transición valida precondiciones y emite un evento de auditoría.

## Carpetas propias de este módulo

| Carpeta | Rol |
|---|---|
| `domain/services/` | `MotorDeValidaciones`: prerrequisitos circulares, coherencia de ciclos, créditos, competencias mínimas. Corre consolidado antes de `Aprobado` y devuelve una **lista estructurada** de errores/advertencias, no excepciones sueltas |
| `infrastructure/documents/` | Generación de PDF y Excel. Se **dispara** desde un caso de uso pero se **ejecuta** como job en cola (RNF: < 5s bajo carga) |
| `infrastructure/queue/` | Processors BullMQ que consumen esos jobs |
| `infrastructure/recommendation/` | Adaptadores del `RecommendationPort`. En MVP 1 solo `NullRecommendationAdapter` (no-op) |

## Punto de extensión de IA

El puerto existe desde el día 1; el adaptador real no.

```typescript
// application/ports/recommendation.port.ts
export interface RecommendationPort {
  sugerirAsignaturas(mallaActual: MallaCurricular): Promise<SugerenciaAsignatura[]>;
}
```

Cuando entre `RF-PEND-01`, se agrega `HttpRecommendationAdapter` en
`infrastructure/recommendation/` apuntando al servicio Python. **El dominio no se toca.**
