# Cambios MVP1 — Bloque 3: «Facultades» para el Administrador y alcance de lectura del Director

- Fecha: 2026-09-30
- Origen: `Requerimientos de Cambios y Observaciones - MVP1.md` (documento externo, no versionado en el repo)
- Cubre: RF-CH-007, RF-CH-008, RF-CH-009
- Bloque 3 de 10 de la iniciativa "Cambios y observaciones MVP1". Depende del Bloque 1 (`plan.acceder`, `RutaConPermiso`, matriz en `matriz-de-accesos.ts`) y del Bloque 2 (el Director ya gestiona a los docentes de su carrera).

## 1. Alcance

- **RF-CH-007.** El Administrador ve el módulo Plan de Estudios con la etiqueta «Facultades», en el menú y en el encabezado. Los demás roles lo siguen viendo como «Plan de Estudios». Es el mismo módulo: solo cambia la etiqueta.
- **RF-CH-008.** Dentro de ese módulo el Administrador solo ve facultades y carreras. No ve planes, objetivos, competencias, asignaturas ni malla. Si teclea la URL de un apartado oculto, vuelve al listado de facultades.
- **RF-CH-009.** El Director, al entrar al módulo, ve solo la carrera que tiene asignada y lo que cuelga de ella. Si teclea la URL de otra carrera se le deniega el acceso. El listado general de carreras queda oculto.

**No cubre en este bloque:**
- Los catálogos de objetivos y competencias (`GET /objetivos`, `GET /competencias`): los acota por plan el Bloque 4 (RF-CH-015 y 017).
- Atributos y criterios de acreditación (Bloque 5) y los submódulos de Mejora Continua (Bloque 6).
- Docentes: ya están acotados a la carrera del Director desde el Bloque 2.

**Decisiones ya tomadas con el usuario:**
- La restricción del Director se **aplica en el API**, no solo en la interfaz.
- El mecanismo es un **permiso-marca de alcance de lectura** (`lectura.solo_su_carrera`), no variantes acotadas de cada permiso.
- El Director ve, al abrir «Plan de Estudios», **una sola tarjeta con su carrera** y sus acciones «Abrir plan» o «Crear plan». No entra directo al plan.

## 2. Estado actual (verificado en código)

- Las lecturas del módulo no están acotadas por carrera, y es un diseño deliberado: `GestionarPlanes.listar` documenta que «un director puede consultar planes ajenos, lo que no puede es modificarlos». RF-CH-009 lo contradice para el Director.
- `PERMISOS_ACOTADOS_A_CARRERA` (`politica-de-autorizacion.ts`) solo contiene permisos de **escritura**, y `puede()` los exige contra la carrera del usuario. Meter ahí los `.leer` rompería a Consultor, Docente y Administrador, que no tienen carrera asignada.
- Puntos de lectura que hoy autorizan sin mirar la carrera: `GestionarCarreras.listar/porId`, `GestionarPlanes.listar/versionesDe`, `ConsultarPlan`, `ConsultarHistorial` (aprobaciones, justificaciones, comparar), `ConsultarReportes`, `GestionarAsignaturas` (tres lecturas del plan). `plan.leer` recibe `plan.carreraId` en algunas llamadas, pero como no es un permiso acotado la política lo ignora.
- El Administrador tiene hoy `plan.leer`, `plan.leer_historico`, `objetivo.leer`, `competencia.leer` y `asignatura.leer`: se añadieron para que no abriera un plan a medias. Su inicio depende de `usuario.gestionar` y el aviso de inactivar una facultad de `facultad.leer`/`facultad.inactivar`; ninguno usa lo que pierde.
- En la web, `CarrerasPage` muestra «Abrir plan» solo con `plan.leer` y «Crear plan» con `plan.crear` sobre esa carrera. Pide `usePlanes()` siempre.
- La etiqueta «Plan de Estudios» está fija en `SECCIONES` (`AppLayout.tsx`) y en las migas de `FacultadesPage` y `CarrerasPage`.
- `RutaConPermiso` redirige siempre a `/`.

## 3. Diseño

### 3.1 Matriz de accesos

- **Permiso nuevo `lectura.solo_su_carrera`** (módulo `auth`), asignado **solo** a `DIRECTOR_CARRERA`. No concede lectura de nada: solo acota las que ya tiene.
- **Administrador:** se le retiran `plan.leer`, `plan.leer_historico`, `objetivo.leer`, `competencia.leer` y `asignatura.leer`. Conserva `plan.acceder` (entrar al módulo), `facultad.*`, `carrera.*`, `auditoria.leer`, `usuario.gestionar` y `rol.gestionar`.
- Consultor, Docente y Coordinador no cambian.

### 3.2 API: alcance de lectura

**Política (dominio, función pura).** En `politica-de-autorizacion.ts`:

```ts
export type AlcanceDeLectura =
  | { readonly tipo: 'TODAS' }
  | { readonly tipo: 'CARRERA'; readonly carreraId: string | null };

export function alcanceDeLectura(contexto: ContextoDeAutorizacion): AlcanceDeLectura;
export function puedeLeerCarrera(alcance: AlcanceDeLectura, carreraId: string): boolean;
```

Con el permiso-marca el alcance es `CARRERA` con la carrera a cargo del usuario; sin él, `TODAS`. Un Director sin carrera asignada tiene alcance `CARRERA` con `null`: no puede leer ninguna.

**Puerto.** `AuthorizationPort` gana dos métodos, y reexporta el tipo `AlcanceDeLectura` para que los demás módulos lo importen del puerto y no del dominio de `auth`:
- `alcanceDeLectura(usuarioId): Promise<AlcanceDeLectura>`: distingue «sin restricción» (`TODAS`) de «restringido y sin carrera» (`CARRERA` con `carreraId: null`);
- `puedeLeerCarrera(usuarioId, carreraId): Promise<boolean>`.

`AuthorizationAdapter` los implementa reusando `contextoDe`, como el resto. Un usuario INACTIVO ya se queda sin permisos en `contextoDe`, así que su alcance es `TODAS` pero no tiene nada que leer: la comprobación del permiso de lectura sigue yendo primero.

**Casos de uso.** Cada lectura conserva su permiso de siempre y añade el alcance:
- **Listados:** se fuerzan a la carrera del usuario cuando el alcance es `CARRERA`: `GestionarCarreras.listar`, `GestionarPlanes.listar` (el `carreraId` del filtro se sobrescribe), el listado de planes de `ConsultarReportes`. Sin carrera, el resultado es la lista vacía.
- **Detalle y sub-recursos por id:** `GestionarCarreras.porId`, `ConsultarPlan`, `ConsultarHistorial` (aprobaciones, justificaciones, historial, comparar: las dos versiones), `GestionarAsignaturas` (lecturas del plan), `GestionarPlanes.versionesDe`. Si la carrera no está en alcance responden `NoEncontrado`, no `AccesoDenegado`: no se revela que existe.
- **Fuera:** facultades (no cuelgan de una carrera), catálogos de objetivos y competencias (Bloque 4).

### 3.3 Web: el Director

`/plan-estudios` deja de ser siempre `FacultadesPage`. Un componente de entrada decide con `puede('lectura.solo_su_carrera')`: si la tiene, muestra `MiCarreraPage`; si no, `FacultadesPage`.

`MiCarreraPage` muestra la carrera de `identidad.carreraACargo` como una sola tarjeta, con «Abrir plan» (si tiene plan y `plan.leer`) o «Crear plan» (si no, y `plan.crear` sobre su carrera). Sin facultades, sin buscador, sin otras carreras. Si el Director no tiene carrera asignada, muestra un aviso en vez de la tarjeta.

### 3.4 Web: el Administrador

- **Etiqueta.** El enlace del menú y la primera miga se llaman «Facultades» cuando el usuario no tiene `plan.leer`, y «Plan de Estudios» cuando sí. Se decide por permiso y no por nombre de rol: un usuario con ambos roles ve el módulo completo.
- **Rutas del plan.** Las rutas `plan-estudios/planes/:planId/*` se agrupan bajo `RutaConPermiso permiso="plan.leer"` con destino `/plan-estudios`. `RutaConPermiso` gana la prop opcional `redirigirA`, cuyo valor por defecto sigue siendo `/`.
- **Carreras.** `CarrerasPage` deja de pedir `usePlanes()` cuando el usuario no tiene `plan.leer` (habilita la consulta solo con el permiso), y por lo tanto no ofrece «Abrir plan».

### 3.5 Pruebas (TDD)

- **Política:** `alcanceDeLectura` y `puedeLeerCarrera` en sus tres casos (sin marca, con marca y carrera, con marca y sin carrera).
- **Matriz:** `lectura.solo_su_carrera` solo en el Director; el Administrador sin los cinco permisos y con los que conserva; todo permiso de un rol existe en el catálogo (guarda que ya existe).
- **Casos de uso:** cada lectura de 3.2 en modo acotado (carrera propia sí, ajena `NoEncontrado`, listado filtrado) y en modo sin acotar (sin cambio).
- **Puerto/adaptador:** `carreraDeLectura` y `puedeLeerCarrera` contra las tres situaciones.
- **Web:** etiqueta del menú y de las migas según `plan.leer`; `MiCarreraPage` con una sola tarjeta y sus acciones; `RutaConPermiso` con `redirigirA`; `RutasDeLaAplicacion.test.tsx` con el Administrador que teclea una ruta del plan y vuelve a `/plan-estudios`.
- **e2e:** el Administrador crea una segunda carrera por API; el Director no la ve en `GET /carreras` y recibe 404 al pedirla por id; el Administrador ve «Facultades» en el menú y no puede abrir un plan.

## 4. Riesgos y decisiones abiertas

- **El Administrador pierde la lectura de planes.** Es lo que pide RF-CH-008 y revierte una decisión anterior («lee todo, no decide nada académico»). Se le quitan cinco permisos, y un Administrador de prueba que abría planes deja de poder hacerlo. Hay que volver a correr el seed en los entornos existentes.
- **Es un cambio de contrato para el Director.** Un Director que hoy consultaba planes de otras carreras deja de poder. Es el comportamiento pedido, pero cualquier reporte o enlace que dependiera de eso se rompe.
- **Un Director sin carrera asignada** no puede leer nada y ve un aviso. Es coherente con que sus escrituras ya exigen carrera.
- **Los catálogos de objetivos y competencias siguen sin acotar** hasta el Bloque 4. Un Director puede seguir leyéndolos completos por API en el intervalo.
- **El bloque no toca Facultades del Director:** puede seguir leyendo la lista de facultades (no cuelga de una carrera) aunque su pantalla ya no la muestre.
