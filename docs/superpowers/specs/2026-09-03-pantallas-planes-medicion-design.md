# Pantallas de Planes de Medición — Diseño

*Validado el 2026-09-03. Consume la API del ciclo 2a (`2026-09-03-planes-medicion-nucleo-design.md`).*

## 1. Por qué este ciclo existe

Dos ciclos seguidos entregaron API sin interfaz: **28 endpoints que nadie consume**. Eso tiene un costo que no se ve en las pruebas — ningún consumidor real ha validado todavía si la forma en que esos endpoints devuelven los datos sirve para pintar algo. Si `GET /matriz` resulta incómodo de renderizar, es más barato descubrirlo ahora que después de construir el ciclo 2b encima.

Hay además un requisito que solo el frontend puede satisfacer y que hoy es inverificable: **RNF09** pide que los tres estados de una celda se distingan *sin abrir el detalle*.

Este ciclo cubre **solo las pantallas de planes de medición**. Las de atributos del graduado y criterios de acreditación son CRUD parecidos a los que ya existen y no enseñan nada nuevo sobre el diseño; van en un ciclo posterior.

## 2. Estado de partida verificado

Contrastado contra el código, no supuesto:

| Pieza | Estado real |
|---|---|
| Estructura | `features/<nombre>/{api,components,domain,hooks,pages,schemas}`. Cuatro features: `auth`, `plan-estudios`, `reportes`, `usuarios`. |
| Datos | `@tanstack/react-query`. Los componentes solo hablan con `api/queries.ts`; nunca importan el cliente HTTP. Claves jerarquizadas para invalidar por prefijo. |
| Primitivos de UI | Un solo archivo, `shared/components/ui/index.tsx`: `Badge`, `Boton`, `Tarjeta`, `Campo`, `Entrada`, `AreaTexto`, `Selector`, `Modal`, `EstadoVacio`, `Cargando`, `CabeceraSeccion`. |
| Permisos en la UI | `puede('medicion.editar')` desde `ProveedorSesion`. El menú ya filtra por permiso. |
| Formularios | `react-hook-form` + `zod`. |
| Pruebas | **Ninguna de componente.** Las 107 existentes son de dominio puro. No hay `@testing-library/react` ni `jsdom`. |
| Accesibilidad | `eslint-plugin-jsx-a11y` instalado (estática). Sin `axe-core`. |
| Playwright | No existe: ni configuración, ni dependencia, ni en CI. |
| Tamaño de páginas | `PlanEstudiosPage` 866 líneas, `MallaCurricularPage` 667, `AsignaturasPage` 594. |

## 3. Decisiones de diseño

### 3.1 La matriz: tabla nativa con vía alternativa por teclado

La matriz llega a 750 celdas (50 competencias × 15 periodos), cada una con tres estados más la alerta.

**Decisión:** `<table>` semántica con cada celda como `<button aria-pressed>`, **más un control «programar periodos» por fila de competencia** que abre la lista de periodos como casillas.

Se evaluaron tres caminos. La tabla nativa sola deja hasta 750 paradas de tabulador y llegar a la última celda con el teclado es inviable. El patrón `grid` de ARIA —una sola parada, flechas para moverse— lo resuelve, pero exige implementar *roving tabindex*. `@tanstack/react-table` añadiría una dependencia que el proyecto nunca instaló y no resuelve la accesibilidad, que habría que escribir igual.

La tabla nativa con vía alternativa gana porque **es el precedente del repositorio**. Cuando `MallaCurricularPage` renunció a `@dnd-kit` y usó la API nativa de arrastre, añadió un selector de ciclo por asignatura, y su comentario lo justifica: *«aquí no es un extra sino la única vía no-ratón»*. Aplicar el mismo criterio da: quien usa ratón trabaja sobre la cuadrícula; quien usa teclado tiene una vía corta que no exige atravesarla.

El costo aceptado: hay dos caminos para la misma operación y ambos deben mantenerse coherentes. Se cubre con pruebas que comprueban que los dos escriben lo mismo.

### 3.2 La matriz sale de la página

`PlanEstudiosPage` tiene 866 líneas. Es el patrón actual, pero repetirlo con la matriz daría un archivo que no se puede probar sin montar la página entera, y la matriz es justo lo que hay que probar.

**Decisión:** `MatrizProgramacion` como componente propio en `components/`, que recibe datos y devuelve intenciones por callback. No conoce react-query ni el cliente HTTP: la página le pasa lo que ya tiene y decide qué hacer con lo que devuelve. Así se puede probar con datos literales.

### 3.3 Pruebas de componente, no de flujo

CLAUDE.md §6.4 pide Playwright para E2E y `axe-core` para accesibilidad. Ninguno existe.

**Decisión:** este ciclo añade `@testing-library/react` y `jsdom` a `apps/web`, y prueba los componentes nuevos. Playwright y `axe-core` quedan para un ciclo propio que cubra también las 13 pantallas existentes.

Justificación: montar navegador es infraestructura que merece su propio ciclo y su propia integración con CI, y mezclarla aquí haría que la funcionalidad y el andamiaje compitieran por atención. Testing Library cubre lo que más riesgo tiene —los estados de celda, la alerta, la navegación— sin esa complejidad.

**Consecuencia explícita:** al terminar este ciclo el proyecto seguirá sin pruebas E2E ni verificación automática de WCAG. Es deuda conocida, no un descuido.

## 4. Alcance

### Dentro

| Vista | RF | Qué hace |
|---|---|---|
| Listado | RF-PM-010 | Planes con su estado, filtrables por plan de estudios, tipo y estado |
| Alta | RF-PM-001 – RF-PM-004 | Elegir plan base y tipo, fijar meta, indicar periodo de inicio |
| Detalle | RF-PM-005 – RF-PM-012 | Meta editable, estado, transiciones y baja |
| Competencias | RF-PM-013 – RF-PM-015 | Selección agrupada por atributo del graduado |
| Periodos | RF-PM-016 – RF-PM-021 | Propuesta inicial, edición, fecha de cierre |
| Matriz | RF-PM-022 – RF-PM-026, RF-PM-046 | Programar, marcar realizada, alerta de vencimiento |
| Consistencia | RF-PM-038 | Los hallazgos que bloquean la aprobación |

RNF que aplican: **RNF01** (la UI oculta lo que el permiso no habilita), **RNF08** (el error de negocio se muestra junto al campo), **RNF09** (los tres estados de celda distinguibles sin abrir el detalle), **RNF12** (guardar la matriz es una operación, no una por celda).

### Fuera

- **Pantallas de atributos del graduado y criterios de acreditación.** Ciclo aparte.
- **Playwright y `axe-core`.** Ciclo aparte, con las 13 pantallas existentes dentro.
- **Exportación, versionado y aprobación formal** (RF-PM-027 a RF-PM-045): su API es el ciclo 2b y aún no existe.

## 5. Estructura

```
features/mejora-continua/
  api/
    medicion.api.ts        llamadas HTTP, una función por endpoint
    queries.ts             hooks de react-query; lo único que la UI importa
  domain/
    estado-medicion.ts     copia de la máquina de estados, para anticipar
    tipos.ts
  components/
    MatrizProgramacion.tsx    la cuadrícula y su vía alternativa
    CeldaMatriz.tsx           un botón con sus tres estados y la alerta
    SelectorDePeriodos.tsx    la vía por teclado, por fila
    GrupoDeCompetencias.tsx   selección agrupada por atributo
    PanelConsistencia.tsx     hallazgos de RF-PM-038
  pages/
    PlanesMedicionPage.tsx
    PlanMedicionPage.tsx
    MatrizPage.tsx
```

La copia de la máquina de estados en `domain/` sigue el precedente ya establecido: el backend documenta que *«el frontend mantiene una copia para poder anticipar el resultado sin un round-trip»* y que ambas comparten juego de pruebas para que la divergencia se note.

## 6. Rutas

```
/mejora-continua/medicion                      listado
/mejora-continua/medicion/:id                  detalle, competencias y periodos
/mejora-continua/medicion/:id/matriz           la cuadrícula
```

Entrada nueva en el menú lateral, filtrada por `medicion.leer` como ya hacen las demás.

## 7. Permisos en la interfaz

La UI **oculta** lo que el permiso no habilita, en vez de mostrarlo y fallar al pulsarlo. `puede('medicion.crear')` gobierna el botón de alta; `puede('medicion.editar')` la edición, los periodos y la matriz; `puede('medicion.aprobar')` las transiciones de aprobación.

Esto no sustituye la comprobación del servidor: la UI evita el intento inútil, el `AuthorizationPort` decide.

## 8. Errores

RNF08 pide motivo concreto. El cliente HTTP ya traduce los 409 a `ErrorDeNegocio` con su mensaje; las pantallas lo muestran **junto al campo que lo provocó** cuando se puede atribuir (meta fuera de rango, periodo repetido) y como aviso de la vista cuando es del plan entero (ya existe un Vigente de ese tipo).

## 9. Pruebas

| Qué | Cómo |
|---|---|
| Los tres estados de celda y la alerta (RNF09) | Testing Library sobre `CeldaMatriz`, con datos literales |
| Navegación y marcado en la matriz | Testing Library sobre `MatrizProgramacion` |
| Que la vía por teclado y la cuadrícula escriban lo mismo | Una prueba que ejecuta ambas y compara la intención emitida |
| Que las acciones desaparezcan sin permiso | Testing Library, renderizando con permisos distintos |
| La copia de la máquina de estados | El mismo juego de pruebas que el backend |

## 10. Criterios de aceptación

1. Las siete vistas funcionan contra la API real, no contra datos simulados.
2. Los tres estados de celda y la alerta se distinguen por algo más que el color — RNF09 no dice «color» y WCAG 2.1 AA prohíbe que el color sea el único portador de significado.
3. La matriz se puede operar entera sin ratón.
4. Guardar la matriz es **una** petición, no una por celda (RNF12).
5. `npm test`, typecheck, lint y formato en verde en `apps/web`.
6. Ninguna acción visible que el permiso del usuario no habilite.

## 11. Puntos que la universidad debe validar

- Si la matriz debe poder exportarse desde la pantalla o basta con la exportación del ciclo 2b.
- Si la alerta de RF-PM-046 debe además notificar por correo, o basta con que sea visible.
