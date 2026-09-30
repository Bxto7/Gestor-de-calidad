# Cambios MVP1 — Bloque 2: rol Docente y gestión de docentes por el Director

- Fecha: 2026-09-29
- Origen: `Requerimientos de Cambios y Observaciones - MVP1.md` (documento externo, no versionado en el repo)
- Cubre: RF-CH-006, RF-CH-010, RF-CH-011, RF-CH-012, RF-CH-013, RF-CH-014
- Bloque 2 de 10 de la iniciativa "Cambios y observaciones MVP1". Depende del Bloque 1 (guard de ruta `RutaConPermiso`, matriz de accesos en `matriz-de-accesos.ts`).

## 1. Alcance

El Director de carrera gestiona los docentes de su carrera desde una sección nueva «Docentes» dentro de «Secciones de este plan»: crear, cambiar contraseña, inactivar, reactivar y eliminar. Cada docente queda asociado automáticamente a la carrera del Director. El rol Docente pierde los accesos de módulo que el documento no le da.

**No cubre en este bloque:**
- Que el docente sea seleccionable como responsable de una acción de mejora (documento, sección 6 — Bloque de Mejora Continua). Este bloque solo deja al docente inactivo fuera de `GET /docentes`, que ya alimenta la elección de responsable de evaluación.
- El renombre «Facultades» y el filtro por carrera del Director (RF-CH-007 a 009) — Bloque 3.
- Reactivar entidades de otras secciones (RF-CH-023).

**Decisiones ya tomadas con el usuario:**
- El Docente **conserva** «Mis evidencias» y su inicio actual (construidos en 4a/4b), además de Planes de Mejora. El documento dice «únicamente Planes de Mejora más el dashboard»; se prefiere lo aditivo antes que tirar trabajo hecho.
- El docente inicia sesión **con un correo**: el campo se etiqueta «Usuario» pero exige formato de correo. No hay cambios de esquema en `usuarios`.
- Enfoque A: gestión de docentes propia dentro de `auth`, con un permiso propio. No se abre la gestión general de usuarios al Director.

## 2. Estado actual (verificado en código)

- Un docente ya es un `Usuario` con el rol `DOCENTE` y una fila en `usuario_carrera` (una sola carrera por usuario, garantizado por `UNIQUE(usuario_id)`).
- Solo el Administrador crea cuentas (`usuario.gestionar`, `GestionarUsuarios`). La contraseña la genera el sistema y se muestra una vez (`passwordTemporal`).
- No existe eliminar usuarios. Inactivar ya existe (`estado: INACTIVO`): la cuenta pierde todos sus permisos en `AuthorizationAdapter.contextoDe`, y `cambiarPassword` del repositorio revoca las sesiones abiertas.
- `GET /docentes` (en `configuracion-evaluacion.controller.ts`, exige `evaluacion.leer`) lista las cuentas activas con rol DOCENTE.
- Las referencias a un docente viven en otros módulos y **sin clave foránea**, a propósito, para que el histórico siga legible si la cuenta desaparece: `AsignaturaEvaluada.docenteId`, `ConfiguracionCompetencia.responsableId` (cuenta de cualquier rol) y `Evidencia.registradaPorId`. Otras tablas (`EventoAuditoria`, aprobaciones) guardan además el nombre.
- Los casos de uso publican eventos de dominio con `eventos.publicar([new Evento(actor, …)])` (ver `gestionar-usuarios.use-case.ts`).
- «Secciones de este plan» es una lista de enlaces en `PlanEstudiosPage.tsx` (~línea 475).
- Hoy no hay política de contraseñas: las temporales las genera el sistema.

## 3. Diseño

### 3.1 Permisos

Permiso nuevo `docente.gestionar` (módulo `auth` en el catálogo), asignado **solo** al Director de carrera. Cubre listar, crear, cambiar contraseña, inactivar, reactivar y eliminar.

Se añade a la lista de permisos de escritura acotados por carrera de `politica-de-autorizacion.ts`: el caso de uso lo consulta con la carrera del Director, y la política exige que esa sea su carrera a cargo.

El caso de uso opera siempre sobre `carreraACargoDe(actor)`. Un docente que no pertenece a esa carrera responde `NoEncontrado`, no `AccesoDenegado`: no se revela que existe.

**Rol Docente (RF-CH-006, RN4).** Se le retiran los permisos que abren módulos que el documento no le da: `plan.acceder`, `medicion.leer`, `evaluacion.leer`, `atributo.leer`, `criterio.leer`, `actas.leer`. Conserva Planes de Mejora (`mejora.leer`), «Mis evidencias» (`evidencia.registrar`) y su inicio. También conserva los permisos de **lectura de datos** que las pantallas de Planes de Mejora, el inicio y la cabecera consumen (por ejemplo `objetivo.leer`, `competencia.leer`, `carrera.leer`). La lista exacta se fija en el plan de implementación, verificando qué endpoint llama cada pantalla; un permiso que una pantalla del Docente necesite no se retira aunque el módulo correspondiente se le oculte.

### 3.2 Backend (`auth`)

Caso de uso nuevo `GestionarDocentes` en `auth/application/use-cases/`, sobre el repositorio de usuarios existente (`RepositorioGestionUsuariosPort`), ampliado con `eliminar(id)`.

| Operación | Regla |
|---|---|
| `listar(actor)` | Docentes (rol DOCENTE) de la carrera del Director, activos e inactivos. |
| `crear(actor, {nombreCompleto, email, password})` | Rol DOCENTE y carrera del Director puestos por el sistema (RF-CH-012, sin selector). Los tres campos son obligatorios. El correo es único en todo el sistema (RF-CH-011 RN2), comparado en minúsculas. Contraseña de mínimo 8 caracteres. Sin carrera a cargo → `ReglaDeNegocioViolada`. |
| `cambiarPassword(actor, id, password)` | Solo cambia la contraseña; nombre, correo y carrera no se tocan (RF-CH-013). Revoca las sesiones abiertas del docente (comportamiento existente de `cambiarPassword`). |
| `inactivar` / `reactivar(actor, id)` | Cambia `estado`. Inactivo: sin sesión ni permisos, y fuera de `GET /docentes`. No borra nada (RF-CH-014 RN1). |
| `eliminar(actor, id)` | Ver 3.3. |

La contraseña la escribe el Director; el sistema no genera ni muestra contraseña temporal en este flujo. La contraseña nunca aparece en un evento, en la bitácora ni en la respuesta.

Eventos de dominio: `DocenteCreado`, `PasswordDeDocenteCambiada`, `DocenteInactivado`, `DocenteReactivado`, `DocenteEliminado`, en el mismo estilo que `UsuarioCreado` y `PasswordRestablecida`. Todos llevan actor, id y correo del docente.

Endpoints, en un controlador nuevo de `auth` con el prefijo `/carrera/docentes` (el `GET /docentes` de evaluación se mantiene tal cual y no se toca): `GET`, `POST`, `PATCH :id/password`, `PATCH :id/estado`, `DELETE :id`. Todos exigen `docente.gestionar`.

### 3.3 Eliminar con integridad referencial (RF-CH-014)

`auth` define el puerto `DocenteEnUsoPort` con `enUso(docenteId): Promise<{ enUso: boolean; motivos: string[] }>`. `mejora-continua` lo implementa (`DocenteEnUsoAdapter`) consultando sus tres tablas:

- `AsignaturaEvaluada.docenteId` — «asignatura evaluada en un plan de evaluación».
- `ConfiguracionCompetencia.responsableId` — «responsable de una configuración de evaluación».
- `Evidencia.registradaPorId` — «evidencia registrada».

Se conecta en `app.module.ts`, igual que `ConteoDeUsuariosPort`. Ni `auth` conoce las tablas de `mejora-continua` ni al revés.

`eliminar`: si `enUso`, lanza `ReglaDeNegocioViolada` con los motivos y la sugerencia de inactivar (RF-CH-014, flujo alternativo). Si no, borra el usuario; las filas de `usuario_rol`, `usuario_carrera` y `refresh_tokens` se van por `ON DELETE CASCADE`. Solo se eliminan cuentas con rol DOCENTE de la carrera del Director: nunca un Director, Coordinador ni Administrador.

### 3.4 Interfaz

- Enlace «Docentes» en «Secciones de este plan» (`PlanEstudiosPage.tsx`), visible con `docente.gestionar`.
- Ruta `plan-estudios/planes/:planId/docentes`, dentro del grupo `RutaConPermiso permiso="plan.acceder"` y con un guard interno `RutaConPermiso permiso="docente.gestionar"`.
- `DocentesPage`: listado (nombre, usuario, estado) con acciones «Editar contraseña», «Inactivar»/«Reactivar» y «Eliminar», y el botón «Nuevo docente».
- Modal de alta (nombre completo, usuario, contraseña; **sin selector de carrera**) y modal de contraseña. El resto de acciones piden confirmación.
- Si el backend bloquea el borrado, el modal muestra los motivos y ofrece «Inactivar» como alternativa.
- Listado vacío: mensaje y botón «Nuevo docente».

### 3.5 Pruebas (TDD)

- Unitarias del caso de uso con puertos falsos: cada operación, la carrera automática, correo duplicado, docente de otra carrera (`NoEncontrado`), eliminar en uso y no en uso, no eliminar roles distintos de DOCENTE.
- `matriz-de-accesos.spec.ts`: `docente.gestionar` solo en Director; el Docente sin los permisos de módulo retirados y con los de lectura que sus pantallas necesitan.
- Integración del `DocenteEnUsoAdapter` contra Postgres (Testcontainers), con una fila en cada una de las tres tablas.
- Componente: `DocentesPage` y los modales (alta sin selector de carrera, bloqueo con motivos).
- e2e con axe: la sección Docentes con la cuenta `e2e-director`.

## 4. Riesgos y decisiones abiertas

- **El Docente pierde pantallas.** Un docente de prueba que hoy navegaba a Medición, Evaluación, Acreditación o Actas deja de poder hacerlo. Es el comportamiento pedido (RF-CH-002 RN4). Los e2e con `e2e-docente` deben revisarse.
- **Contraseña puesta por el Director.** Es lo que pide el documento (RF-CH-011), a costa de que el Director conoce la contraseña inicial. No se obliga cambio en el primer acceso; no está pedido y queda como mejora futura.
- **Migración de datos.** Las cuentas DOCENTE existentes pierden permisos al volver a correr el seed. Es el comportamiento buscado, pero hay que avisarlo antes de aplicarlo en un entorno compartido.
- **Un docente pertenece a una única carrera** (RF-CH-012 RN1): reasignarlo exige eliminarlo y volver a crearlo, sujeto a la integridad de 3.3.
- **Responsable de acciones de mejora.** El documento lo menciona como uso que bloquea el borrado, pero las acciones de mejora con responsable-docente pertenecen a un bloque posterior. Cuando exista, su tabla se añade al `DocenteEnUsoAdapter`; hoy no hay nada que consultar.
