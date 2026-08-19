# Módulo `auditoria`

> **Nota:** `CLAUDE.md` §3.2 nombra explícitamente `auth` y `plan-estudios`. Este módulo
> se agregó porque la auditoría (§2, §3.4, §4.3) necesita tabla y ciclo de vida propios, y
> ponerla en `shared-kernel/` violaría la prohibición de convertirlo en cajón de sastre.
> Si se decide otra ubicación, esta carpeta se elimina.

## Rol

Bitácora **append-only**: usuario + fecha + entidad + detalle. `CLAUDE.md` §2 lo marca
como **no opcional** para toda mutación de entidad relevante (Plan de Estudios,
Asignatura, aprobaciones).

## Cómo se acopla sin acoplarse

Los casos de uso de otros módulos **no llaman a `auditoria`**. Emiten un `DomainEvent`
(clase base en `shared-kernel/domain-events/`), y los listeners de
`infrastructure/listeners/` los capturan aquí.

```
plan-estudios/application/use-cases  ──emite──▶  DomainEvent
                                                      │
                              auditoria/infrastructure/listeners ──▶ audit_log
```

Ninguno de los dos módulos conoce al otro.

## Inmutabilidad en dos niveles

1. **Dominio:** no existe caso de uso de update ni delete sobre un registro.
2. **Base de datos:** el rol de BD de la aplicación no tiene permisos de `UPDATE`/`DELETE`
   sobre `audit_log` (`CLAUDE.md` §4.3).
