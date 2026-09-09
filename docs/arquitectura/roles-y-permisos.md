# Roles y permisos — Sistema de Gestión de la Calidad Universitaria

> Fuente de verdad: `apps/api/prisma/seed.ts` (catálogo de roles y permisos) y
> `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts`
> (aplicación de la política). Este documento describe qué puede hacer cada rol
> a partir de esos dos archivos.

## 1. Cómo funciona la autorización

El permiso responde **qué** puede hacer el actor; el **alcance** responde *sobre
cuál carrera*. Son una conjunción: no basta con tener el permiso.

- **Permisos acotados a carrera** (toda la escritura académica y de mejora
  continua, listados en la política): se ejercen **solo** sobre la carrera que el
  usuario tiene asignada. Un Director puede *consultar* planes de cualquier
  carrera, pero *editar/aprobar* solo los de la suya.
- **Permisos de solo lectura** (los `.leer`): **no** están acotados — se puede
  consultar cualquier carrera.
- Un usuario tiene **una sola** carrera a cargo (lo impone un `UNIQUE` sobre
  `usuario_id` en `usuario_carrera`).
- El rol y la carrera llegan juntos a la decisión: un Director sin carrera
  asignada no puede ejercer ningún permiso acotado.

Permisos acotados a carrera en la política actual:

```
plan.crear, plan.editar, plan.eliminar, plan.enviar_revision, plan.aprobar,
plan.observar, plan.nueva_version, plan.justificar, asignatura.gestionar,
malla.editar,
medicion.crear, medicion.editar, medicion.eliminar, medicion.aprobar,
evaluacion.crear, evaluacion.editar, evaluacion.eliminar, evaluacion.aprobar,
mejora.crear, mejora.editar, mejora.eliminar, mejora.aprobar
```

---

## 2. ADMIN_SISTEMA — Administrador del sistema

**Requiere carrera:** No.
**Filosofía:** dueño de la *estructura y las cuentas* — lee todo, pero **no
decide nada académico**.

| Área | Puede | No puede (a propósito) |
|---|---|---|
| Facultades | leer, crear, editar, inactivar | — |
| Carreras | leer, crear, editar, inactivar | — |
| Planes de estudio | leer, ver histórico | crear, editar, eliminar, aprobar, observar, enviar a revisión, nueva versión |
| Contenido curricular | leer todo (objetivos, competencias, atributos, criterios, asignaturas) | gestionar (crear/editar) contenido |
| Mejora continua | leer planes de medición, evaluación y mejora | crear, editar, aprobar |
| Auditoría | leer la bitácora entera | — |
| Usuarios y roles | gestionar usuarios y sus roles, administrar roles/permisos | — |
| Reportes | **no tiene `reporte.generar`** | generar PDF/Excel (responsabilidad académica) |

**Nota:** por diseño no tiene `reporte.generar` ni ningún `aprobar`. Producir
evidencia documental que sale hacia un expediente de acreditación es una
responsabilidad académica, no de administración.

---

## 3. DIRECTOR_CARRERA — Director de carrera

**Requiere carrera:** Sí (una).
**Filosofía:** gestión y **aprobación** del plan y de la mejora continua **de su
carrera**. Es el rol más poderoso en lo académico.

| Área | Puede |
|---|---|
| Facultades / Carreras | consultar (leer) |
| Planes de estudio | leer, ver histórico, crear, editar, eliminar, enviar a revisión, **aprobar** (único rol), observar/devolver, nueva versión, justificar observaciones |
| Contenido curricular | leer + gestionar: objetivos, competencias, atributos del graduado, criterios de acreditación, asignaturas, malla |
| Plan de medición | leer, crear, editar, eliminar, **aprobar/observar/dar vigencia** |
| Plan de evaluación | leer, crear, editar, eliminar, **aprobar/observar/dar vigencia** |
| Plan de mejora | leer, crear, editar, eliminar, **aprobar/observar/dar vigencia** |
| Reportes | generar PDF y Excel |
| Auditoría | leer historial de cambios |

**Nota:** es el **único** con `plan.aprobar`, `medicion.aprobar`,
`evaluacion.aprobar` y `mejora.aprobar`. Todo lo académico lo hace **sobre su
carrera** — sobre la de otro director solo puede consultar.

---

## 4. COORDINADOR_ACADEMICO — Coordinador académico

**Requiere carrera:** Sí (una).
**Filosofía:** apoyo operativo: **arma** el plan y lo envía a revisión, pero
**no aprueba ni observa**. La separación es deliberada: *quien construye no
puede ser quien da el visto bueno* — eso es lo que hace que la aprobación
signifique algo en una auditoría.

| Área | Puede | No puede |
|---|---|---|
| Facultades / Carreras | consultar | — |
| Planes de estudio | leer, ver histórico, crear, editar, enviar a revisión, justificar | **aprobar, observar, eliminar, nueva versión** |
| Contenido curricular | leer + gestionar (objetivos, competencias, atributos, criterios, asignaturas, malla) | — |
| Plan de medición | leer, crear, editar, eliminar | **aprobar** |
| Plan de evaluación | leer, crear, editar, eliminar | **aprobar** |
| Plan de mejora | leer, crear, editar, eliminar | **aprobar** |
| Reportes | generar PDF y Excel | — |
| Auditoría | solo historial de su entidad (`auditoria.leer_entidad`), no la bitácora entera | ver bitácora completa de accesos |

**Nota:** a diferencia del Director, no tiene la bitácora completa (solo la de la
entidad que edita, RF-PM-032), y le falta `plan.eliminar` y `plan.nueva_version`.

---

## 5. DOCENTE — Docente

**Requiere carrera:** Sí (una).
**Filosofía:** solo lectura del detalle curricular ligado a su labor.

| Área | Puede |
|---|---|
| Facultades / Carreras | consultar |
| Planes de estudio | leer (detalle curricular y competencias de las asignaturas que dicta) |
| Contenido curricular | leer objetivos, competencias, atributos del graduado, criterios, asignaturas |
| Mejora continua | leer planes de medición, evaluación y mejora (ver en qué periodos se mide su competencia) |
| Reportes | generar PDF y Excel |

**No puede:** crear/editar nada, aprobar nada, gestionar usuarios, ver auditoría.

---

## 6. USUARIO_CONSULTOR — Usuario consultor

**Requiere carrera:** No.
**Filosofía:** el más restringido — consulta de **planes vigentes**.

| Área | Puede |
|---|---|
| Facultades / Carreras | consultar |
| Planes de estudio | leer (solo vigentes) — sin histórico |
| Contenido curricular | leer atributos y criterios |
| Mejora continua | leer planes de medición, evaluación y mejora |

**No puede:** ver planes históricos, ver detalle de competencias/asignaturas,
generar reportes, ni nada de escritura.

---

## 7. Tabla comparativa rápida

| Acción | Admin | Director | Coordinador | Docente | Consultor |
|---|---|---|---|---|---|
| Gestionar facultades/carreras | ✅ | — | — | — | — |
| Crear/editar plan | — | ✅ | ✅ | — | — |
| **Aprobar plan** | — | ✅ | — | — | — |
| Gestionar contenido curricular | — | ✅ | ✅ | — | — |
| Gestionar plan de medición/evaluación/mejora | — | ✅ | ✅ | — | — |
| **Aprobar medición/evaluación/mejora** | — | ✅ | — | — | — |
| Generar reportes PDF/Excel | — | ✅ | ✅ | ✅ | — |
| Ver auditoría completa | ✅ | ✅ | — | — | — |
| Gestionar usuarios/roles | ✅ | — | — | — | — |

---

## 8. Flujo típico de acreditación

1. **Coordinador** arma el plan de estudios y lo envía a revisión.
2. **Director** lo aprueba, observa o devuelve; también aprueba los planes de
   medición, evaluación y mejora que el Coordinador configura.
3. **Docente** consulta el detalle de su asignatura y ve cuándo se mide.
4. **Consultor** ve los planes vigentes.
5. **Admin** mantiene facultades, carreras, cuentas y roles; ve la auditoría de
   todo.

---

### Enlaces relacionados

- `CLAUDE.md` §3.5 (RBAC), §4.4 (Auth) y §6 (marco de calidad)
- `docs/arquitectura/dependencias.md`
