# Actas de Aprobación — pantalla (lista + detalle)

## 1. Por qué este ciclo existe y dónde acaba

El backend de Actas llegó a un punto usable de punta a punta: crear
(2c-AC-A), cargar y editar contenido (2c-AC-B), transicionar hasta
Aprobada (2c-AC-C, este mismo día), y listar (RF-AC-020). Los propios
diseños anteriores dejaron dicho que la pantalla no valía la pena
construirla hasta que el acta pudiera aprobarse — ese momento ya llegó.

Este ciclo agrega la interfaz: una página de lista y una de detalle,
siguiendo el mismo patrón ya establecido por `medicion`, `evaluacion` y
`mejora` dentro de `features/mejora-continua`. No hay diseño visual
nuevo que inventar — es mirroring de un patrón ya consolidado en tres
lugares del propio repo.

**No tiene número de ciclo `2c-AC-X`** porque no mapea a un bloque de RF
nuevo: consume endpoints que ya existen (000–017, 020). Se nombra solo
por fecha y tema.

## 2. Decisión ya tomada con el usuario

`periodoMedicionId` (opcional en el backend, solo filtra la sección
Competencia al cargar acciones) **no entra en el formulario de crear
acta en este ciclo**. El acta nace solo con `periodoAcademico`; la
sección Competencia queda vacía hasta que un ciclo futuro agregue el
selector. Confirmado explícitamente: menos formulario, YAGNI sobre un
campo opcional que no bloquea nada.

## 3. Arquitectura

Dos páginas nuevas, mismo patrón que `PlanesMedicionPage`/`PlanMedicionPage`:

- **`ActasPage`** (`/mejora-continua/actas`) — lista. Selector de
  carrera (`useCarreras()`, mismo patrón que `PlanesMejoraPage`),
  filtros de estado y texto libre, botón "Nueva acta" con modal
  (`ModalNuevaActa`, mismo estilo que `ModalNuevoPlan` de
  `PlanesMedicionPage.tsx`) que solo pide `periodoAcademico`. Tabla con
  código, periodo académico y estado (badge, mismo mapa de tonos que
  `TONO` en `PlanMedicionPage.tsx`, adaptado a los 5 estados del acta).
  Cada fila navega a `ActaPage`.
- **`ActaPage`** (`/mejora-continua/actas/:id`) — detalle, secciones
  apiladas verticalmente (no tabs, mismo criterio que `PlanMedicionPage`):
  1. Cabecera: título, objetivo, convocada por, fecha/lugar de reunión,
     lugar/fecha de emisión, comentario. Editable solo si
     `permiteEdicion(acta.estado)` (Borrador) y `puede('actas.editar')`
     — mismo criterio que `editable` en `PlanMedicionPage`.
  2. Asistentes: lista editable de nombres (reemplazo completo al
     guardar, como ya hace `reemplazarAsistentes` en el backend — no
     hay alta/baja individual, es un textarea o lista de campos que se
     guarda entera).
  3. Acciones del periodo: botón "Cargar acciones del periodo"
     (idempotente, dispara `cargarAccionesDelPeriodo`) + tabla agrupada
     por aspecto (Criterio, Objetivo, Competencia — mismo orden fijo
     que el backend) con checkbox de `incluida` por fila, que dispara
     `actualizarSeleccionDeAcciones`.
  4. Textos institucionales: dos áreas de texto (introducción, acuerdo
     de cierre), editables en Borrador.
  5. Estado del acta: mismo patrón exacto que la fila de transición de
     `PlanMedicionPage.tsx` líneas 190–211 — `transicionesDisponibles(acta.estado)`
     filtrado por `puede('actas.' + permiso)`, cada botón dispara la
     transición directo si `!exigeComentario`, o abre `ModalObservacion`
     (reutilizado tal cual, ya es genérico) si la transición es
     `rechazar`.
  6. Eliminar (solo Borrador, RF-AC-017 RN2), con confirmación simple.

## 4. Capas nuevas

- **`domain/estado-acta.ts`** — espejo cliente de
  `transiciones-acta.ts` del backend. Solo 3 acciones:
  `enviar-a-revision`, `aprobar`, `rechazar`. Misma forma que
  `domain/estado-medicion.ts` (`TRANSICIONES`, `transicionesDisponibles`,
  `describirTransicion`, `permiteEdicion`). Es una copia de la regla, no
  una autoridad — el backend re-valida cada transición, tal como ya
  advierte el comentario de cabecera de `estado-medicion.ts`.
- **`domain/tipos.ts`** — se agregan `Acta`, `ActaResumen`,
  `AsistenteActa`, `AccionDelActa`, calcados de `DatosActa`/`ActaResumen`/
  `AccionDelActa` del backend (`acta-aprobacion.port.ts`,
  `gestionar-actas.use-case.ts`).
- **`api/actas.api.ts`** — funciones planas sobre `cliente.get/post/
  patch/put/delete`: `listarActas`, `obtenerActa`, `crearActa`,
  `editarCabeceraActa`, `reemplazarAsistentesActa`, `cargarAcciones`,
  `actualizarSeleccion`, `editarTextosActa`, `transicionarActa`,
  `eliminarActa`. Una por endpoint HTTP ya existente.
- **`api/queries.ts`** — hooks de React Query (`useActas`, `useActa`,
  `useCrearActa`, `useEditarCabeceraActa`, etc.), mismo patrón de
  invalidación con `scope: { id: 'acta:' + id }` que ya usa
  `useMutacionDeEvaluacion` para escrituras serializadas sobre la misma
  acta, e invalidación de la clave de lista en cada mutación exitosa.
- **Rutas en `App.tsx`**: `mejora-continua/actas` → `ActasPage`,
  `mejora-continua/actas/:id` → `ActaPage`.
- **Entrada de menú en `AppLayout.tsx`**: mismo array `ENLACES`, mismo
  lugar que sus tres hermanos, permiso `actas.leer`.

## 5. Manejo de errores

Mismo patrón `ejecutar()` que ya usan `PlanMedicionPage`/
`PlanEvaluacionPage`/`PlanMejoraPage`: envuelve la mutación, captura
`ErrorDeNegocio` y muestra su mensaje (que ya trae el motivo de negocio
legible desde el backend — RF-AC-016 devuelve los motivos de bloqueo en
texto plano), sin inventar mensajes nuevos en el cliente.

## 6. Accesibilidad y pruebas

- Componentes de UI compartidos (`Boton`, `Campo`, `Selector`, `Modal`,
  `Tarjeta`, `Badge`) ya cumplen WCAG 2.1 AA (§6.3 de CLAUDE.md) — no
  se introduce ningún elemento nuevo fuera de ese catálogo.
- Definition of Done §6.6: como esta PR toca UI, corre `axe-core` sobre
  ambas pantallas nuevas antes de darla por terminada.
- Tests: mismo nivel que `PlanesMejoraPage.test.tsx`/
  `PlanMejoraPage.test.tsx` (los dos hermanos que sí tienen test de
  componente en este momento) — render con datos de prueba, filtros,
  flujo de transición feliz y el caso de completitud bloqueante
  (RF-AC-016) mostrando el motivo. `estado-acta.test.ts` con el mismo
  nivel de cobertura que `estado-medicion.ts` si tiene test propio
  (confirmar al implementar).
- Playwright E2E: **no entra en este ciclo** (ver §7). El subconjunto
  rápido de PRs de la sección 6.4 de CLAUDE.md no lo exige para cada
  pantalla nueva, solo para "flujos críticos" ya cubiertos; agregar
  Actas a esa lista es una decisión aparte, no implícita en este ciclo.

## 7. Lo que este diseño no resuelve

- Selector de `periodoMedicionId` en el alta (§2).
- Cualquier UI de Emitida/Histórica — no hay backend detrás todavía
  (exportación RF-AC-018/019 sin construir, sin plantilla institucional
  real disponible).
- Exportación a Excel/PDF desde la pantalla.
- Playwright E2E del flujo de aprobación de actas.
- Permisos/auditoría formal por operación más allá de lo que ya cubre
  el patrón `exigir()` + eventos del backend (RF-AC-023/025/026) — no
  hay nada nuevo que la UI necesite para esto.
