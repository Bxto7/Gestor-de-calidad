# Cambios MVP1 — Bloque 1: RBAC y matriz de accesos vigente

- Fecha: 2026-09-29
- Origen: `Requerimientos de Cambios y Observaciones - MVP1.md` (documento externo, no versionado en el repo)
- Cubre: RF-CH-001 a RF-CH-005
- Bloque 1 de 10 de la iniciativa "Cambios y observaciones MVP1" (ver orden de bloques acordado en la conversación de brainstorming — no hay un documento separado que lo liste; el bloque 2 retoma con el rol Docente y su gestión operativa).

## 1. Alcance

Este bloque es fundacional: establece la matriz de accesos por rol vigente tras el MVP1 y corrige el bug de redirección post-login. Todos los bloques siguientes (Docente, Plan de Estudios, Acreditación, Mejora Continua) dependen de que el mecanismo de bloqueo por permiso a nivel de ruta exista, porque reutilizan el mismo patrón.

**No cubre en este bloque:**
- El rol Docente en sí (RF-CH-006, 010-014) — Bloque 2.
- El renombre "Facultades" para el Administrador (RF-CH-007) — Bloque 3.
- Cualquier permiso o dato nuevo de Acreditación/Mejora Continua más allá de aplicar el guard sobre las rutas que ya existen.

**Decisión ya tomada con el usuario:** el Administrador del sistema conserva acceso al Módulo Sistema (gestión de usuarios/roles, hoy en `/usuarios`) además del Módulo de Facultades. La lectura literal de la sección 1.2 del documento ("únicamente Módulo de Facultades") se descarta porque dejaría al sistema sin forma de dar de alta cuentas de Director de carrera o Coordinador académico.

## 2. Estado actual (verificado en código, no asumido)

- El menú (`SECCIONES` en `apps/web/src/app/AppLayout.tsx`) ya oculta enlaces según `puede(permiso)`, pero el enlace `/plan-estudios` no tiene `permiso` asignado — lo ve cualquier rol autenticado.
- `RutaProtegida` (`apps/web/src/features/auth/components/RutaProtegida.tsx`) es **solo** un guard de autenticación, por diseño explícito documentado en su propio comentario: "Esto no es control de acceso: solo evita pedir datos que el servidor rechazaría." No existe ningún guard de autorización a nivel de ruta hoy.
- El backend ya autoriza cada caso de uso vía `AuthorizationPort.puede(usuarioId, permiso, carreraId)` y expone `permisosDe()` para que el frontend pinte sin ofrecer botones que el backend rechazaría. Los roles y sus permisos ya son datos (tabla `rol`/`permiso`/`rol_permiso`), no código — el ajuste de este bloque es de **datos** (seed), no de arquitectura.
- `identidad.carreraACargo` (campo ya existente en `/auth/yo`) y `puedeEn(permiso, carreraId)` ya implementan el acotamiento por carrera a nivel de frontend. El filtrado por carrera de Plan de Estudios para el Director (RF-CH-009) es Bloque 3, pero el mecanismo base (`carreraACargo`, `puedeEn`) ya existe y se reutiliza.
- Causa raíz confirmada de RF-CH-001: `AccesoPage.tsx` calcula `destino = ubicacion.state.desde ?? '/'` y navega ahí tras un login exitoso. `state.desde` lo escribe `RutaProtegida` con el `pathname` en el que estaba montado cuando pierde la identidad. El botón "Cerrar sesión" (en `AppLayout.tsx`) solo llama a `salir()` (que borra la identidad en memoria) y deja que `RutaProtegida`, todavía en la pantalla vieja, dispare la redirección — grabando esa pantalla como `state.desde`. El siguiente usuario que inicia sesión en ese mismo formulario hereda ese destino sin ninguna comprobación de permiso.

## 3. Diseño

### 3.1 Corrección RF-CH-001

El logout explícito debe navegar a `/acceso` sin `state.desde`. Se distingue de la pérdida de sesión por expiración (donde sí es correcto conservar `desde`, porque es la misma persona a la que se le cae el token a mitad de navegación).

Cambio acotado a `AppLayout.tsx`: el `onClick` del botón de salir pasa de `() => void salir()` a una función que además navega explícitamente:

```ts
async function manejarSalida() {
  await salir();
  navegar('/acceso', { replace: true, state: null });
}
```

Con esto, cuando `RutaProtegida` reacciona al cambio de identidad ya no es la primera en redirigir (la navegación explícita gana), y `state.desde` queda vacío para el siguiente login.

### 3.2 Guard de autorización por ruta — `RutaConPermiso`

Nuevo componente en `apps/web/src/features/auth/components/RutaConPermiso.tsx`, mismo patrón que `RutaProtegida` (usa `useSesion`, `Navigate`, `Outlet`), pero autorización en vez de autenticación:

```ts
export function RutaConPermiso({ permiso }: { permiso: string }) {
  const { puede } = useSesion();
  if (!puede(permiso)) return <Navigate to="/" replace />;
  return <Outlet />;
}
```

`/` es siempre un destino válido para cualquier rol autenticado: `ResumenPage` resuelve la vista de inicio correcta vía `vistaPrincipalDe`, sin necesitar que este guard sepa nada de roles.

En `App.tsx`, se agrupan las rutas existentes bajo el guard correspondiente, anidado dentro de `RutaProtegida` + `AppLayout`:

| Grupo de rutas | Permiso exigido |
|---|---|
| `plan-estudios/*` | `plan.leer` (nuevo uso explícito del permiso ya existente) |
| `acreditacion/*` | ya segmentado por página (`atributo.leer`, `criterio.leer`) — se sube el guard un nivel para que además bloquee la URL, no solo oculte el enlace |
| `mejora-continua/medicion*` | `medicion.leer` |
| `mejora-continua/evaluacion*` | `evaluacion.leer` |
| `mejora-continua/mejora*` | `mejora.leer` |
| `mejora-continua/actas*` | `actas.leer` |
| `usuarios` | `usuario.gestionar` |
| `reportes*` | `plan.leer` (sin cambio; ya es el permiso actual del enlace) |
| `mis-evidencias` | `evidencia.registrar` |

`SECCIONES` no cambia su lógica de ocultamiento — sigue sirviendo para no mostrar un enlace muerto —, pero ahora hay un segundo nivel de verdad (el guard) que además bloquea la URL directa, cerrando el hueco que describe RN de RF-CH-002 a 005.

### 3.3 Ajuste del seed de roles y permisos

Este es el cambio que de verdad implementa "Director pierde acceso a Sistema, Acreditación, Medición, Evaluación y Mejora" y "Coordinador pierde acceso a Plan de Estudios y Sistema": si el guard es correcto pero el seed le sigue dando esos permisos a esos roles, no bloquea nada. Se ajusta la asignación rol→permiso en el seed de Prisma para que quede:

- **Administrador**: permisos de Facultades/Carreras + `usuario.gestionar` + `rol.gestionar` (Sistema). Sin `atributo.*`, `criterio.*`, `medicion.*`, `evaluacion.*`, `mejora.*`, `actas.*`.
- **Director de carrera**: permisos de Plan de Estudios (`plan.leer` y los de escritura que ya tenga) acotados a su carrera. Sin `usuario.gestionar`, `rol.gestionar`, `atributo.*`, `criterio.*`, `medicion.*`, `evaluacion.*`, `mejora.*`.
- **Coordinador académico**: permisos de `atributo.*`, `criterio.*`, `medicion.*`, `evaluacion.*`, `mejora.*`, `actas.*`, acotados a su carrera. Sin `plan.*` (Plan de Estudios) ni `usuario.gestionar`/`rol.gestionar`.
- **Usuario consultor**: sin cambios.

El detalle exacto de qué permisos de escritura existen hoy por rol se confirma al implementar (leyendo el seed actual), no se enumera aquí para no comprometerme con un listado que puede no coincidir byte a byte con el código.

## 4. Pruebas

- `RutaConPermiso.test.tsx`: redirige a `/` cuando falta el permiso; deja pasar (`Outlet`) cuando lo tiene.
- `AppLayout` o `AccesoPage`: test de regresión del bug de RF-CH-001 — usuario A cierra sesión desde una ruta profunda, usuario B inicia sesión, y `B` no aterriza en la ruta de `A` si `B` no tiene permiso sobre ella (y en general, no la hereda salvo que sea un deep-link legítimo de sesión expirada, que es un escenario distinto y no se toca aquí).
- Test de integración del seed: cada rol tiene exactamente el conjunto de permisos de la tabla de la sección 3.3 (evita que una migración futura reintroduzca el permiso equivocado sin que ningún test lo note).

## 5. Riesgos y decisiones abiertas

- El documento fuente no aclara a qué interfaz exacta redirige un Coordinador con URL prohibida ("Acreditación o Mejora Continua", ambiguo). Al usar siempre `/` como destino del guard, esta ambigüedad se resuelve sola: el Coordinador aterriza en su resumen, no en un módulo específico.
- Cambiar el seed de permisos es una migración de datos sobre cuentas que ya existen en desarrollo/staging. Si hay cuentas de prueba con roles Director/Coordinador que dependían de los permisos que se están retirando, dejarán de poder usarlos — es el comportamiento buscado, pero vale la pena avisarlo antes de aplicar la migración en un entorno compartido.
