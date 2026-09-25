# Evidencias del docente — Design

## 1. Qué es esto

Sub-proyecto 4a de las vistas de inicio por rol. La vista de inicio del
Docente (mockup «Hola, Jorge», sub-proyecto 4b) enseña «evidencias pendientes
por subir» y un botón «Subir evidencia», pero hoy un Docente **no puede subir
evidencias**: su rol solo tiene `evaluacion.leer`, y registrar evidencias
(RF-PE-020) exige `evaluacion.editar`, que tienen los roles que arman el plan
de evaluación. El usuario decidió construir esa capacidad.

Este sub-proyecto la construye: un Docente registra y retira **enlaces de
evidencia** solo en las evaluaciones que tiene asignadas, sin tocar lo que
registró un coordinador. Además deja listo el listado «mis evaluaciones», que
reutilizará la vista de inicio del Docente (4b). La vista de inicio y el ajuste
del selector para el rol doble Coordinador + Docente son 4b, no este spec.

## 2. Decisiones ya tomadas con el usuario

1. **Partir en 4a y 4b**, en ese orden: 4a (esto) primero, porque 4b enlaza a
   lo que 4a construye.
2. **El Docente puede agregar y quitar las suyas.** No toca las que registró un
   coordinador. Para saber cuáles son suyas se marca quién registró cada
   evidencia (columna nueva con migración).
3. **Solo planes de evaluación Vigentes.** El coordinador puede editar
   evidencias en Borrador o Vigente (RF-PE-006 RN2); el docente solo actúa donde
   el plan ya rige.
4. **Las evidencias que ya existen** quedan «no propias»: el Docente las ve pero
   no las retira.
5. **Solo enlaces**, como hoy: sin subida de archivos y sin editar una evidencia
   (se retira y se agrega otra).

## 3. Datos y permiso

### 3.1 Esquema

`Evidencia` (`prisma/schema.prisma`, modelo `Evidencia`, tabla `evidencia`) gana:

```prisma
/// Quién la registró, si fue un docente por su cuenta. Nulo: la registró un
/// coordinador o es anterior a este campo — el docente no puede retirarla.
/// Sin clave foránea, como `docenteId` en `AsignaturaEvaluada`: el registro
/// debe seguir siendo legible aunque la cuenta desaparezca.
registradaPorId String? @map("registrada_por_id") @db.Uuid
```

Migración con Prisma Migrate (`migrate dev` para generarla; en despliegue
`migrate deploy`). Las filas existentes quedan en nulo.

### 3.2 Permiso nuevo

`evidencia.registrar` — «Registrar evidencias de las evaluaciones asignadas»,
módulo `mejora-continua`. En `prisma/seed.ts`:

- se añade a la tabla de permisos y a la lista del rol `DOCENTE`;
- ningún otro rol lo recibe: los coordinadores siguen usando `evaluacion.editar`.

En `auth/domain/services/politica-de-autorizacion.ts` se añade a
`PERMISOS_ACOTADOS_A_CARRERA`, para que solo valga sobre la carrera del usuario
(su carrera a cargo). Es un permiso de escritura, y esa lista existe justo para
los de escritura.

**Despliegue:** para que los docentes ya existentes reciban el permiso hay que
correr la migración y volver a ejecutar el seed (`npm run db:seed`), que es
idempotente y reescribe los permisos de cada rol.

## 4. Backend

Submódulo nuevo `mejora-continua/mis-evidencias/` con `domain/`, `application/`
e `infrastructure/`, el mismo molde que `resumen/`. Es un submódulo propio y no
métodos nuevos del repositorio de configuración de evaluación: ese puerto lo
fingen varios archivos de prueba y ampliarlo rompería su compilación
(la misma razón del Ruling 2 del plan de la vista del Director).

### 4.1 Puerto de lectura y escritura

`RepositorioMisEvidenciasPort` (en `mis-evidencias/application/ports/`) y su
adaptador Prisma. Métodos, con nombres exactos que usarán el caso de uso y sus
pruebas:

```typescript
interface EvaluacionAsignada {
  id: string;                              // AsignaturaEvaluada.id
  asignaturaId: string;
  competenciaId: string;
  entregable: string;
  periodo: { id: string; etiqueta: string; fechaCierre: Date | null };
  planEvaluacion: { id: string; codigo: string };
  evidencias: { id: string; enlace: string; descripcion: string; registradaPorId: string | null }[];
}

interface ContextoDeEvaluacion {           // lo mínimo para autorizar una operación
  asignaturaEvaluadaId: string;
  docenteId: string | null;
  planEvaluacionId: string;
  estadoPlan: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'VIGENTE' | 'HISTORICO';
  planEstudiosId: string;                  // vía plan de evaluación → plan de medición
  totalEvidencias: number;
}

interface RepositorioMisEvidenciasPort {
  /** Evaluaciones del docente en planes de evaluación VIGENTES del plan de estudios. */
  evaluacionesDelDocente(docenteId: string, planEstudiosId: string): Promise<readonly EvaluacionAsignada[]>;
  contextoDeEvaluacion(asignaturaEvaluadaId: string): Promise<ContextoDeEvaluacion | null>;
  contextoDeEvidencia(evidenciaId: string): Promise<(ContextoDeEvaluacion & { evidenciaId: string; registradaPorId: string | null }) | null>;
  /** Añade al final: `orden` = máximo actual + 1, en una transacción. */
  agregarEvidencia(asignaturaEvaluadaId: string, datos: { enlace: string; descripcion: string; registradaPorId: string }): Promise<{ id: string }>;
  retirarEvidencia(evidenciaId: string): Promise<void>;
}
export const REPOSITORIO_MIS_EVIDENCIAS = Symbol('RepositorioMisEvidenciasPort');
```

### 4.2 Caso de uso `GestionarMisEvidencias`

En `mis-evidencias/application/use-cases/`. Consume `AuthorizationPort`,
`PlanVigenteDeCarreraPort` (ya permitido por la guardia de aislamiento),
`ContenidoCurricularPort` (nombres de asignaturas y competencias) y el
publicador de eventos de auditoría que usan los demás casos de uso de
`mejora-continua`. Tres métodos:

- **`listar(actor)`**: comprueba `evaluacion.leer` (sin carrera) primero; luego la
  carrera con `carreraACargoDe(actor.id)` — sin carrera: `ReglaDeNegocioViolada`
  «Esta vista necesita una carrera asignada.»; el plan de estudios vigente con
  `planVigenteDeCarrera` — sin plan vigente: lista vacía; y las evaluaciones
  asignadas al actor. Resuelve nombres con `asignaturasDelPlan` y
  `competenciasDelPlan` (lo que ya no esté en el plan se muestra con un nombre
  genérico y se cuenta). Cada evidencia sale con `propia = registradaPorId === actor.id`
  y cada evaluación con `puedeAgregar = evidencias.length < 20`.
- **`agregar(actor, asignaturaEvaluadaId, { enlace, descripcion })`**: resuelve
  `contextoDeEvaluacion` y obtiene la carrera con
  `ContenidoCurricularPort.planPorId(contexto.planEstudiosId)` (campo `carreraId`),
  igual que hace el coordinador en `carreraDe`; luego comprueba en este orden: existe; `evidencia.registrar` sobre esa carrera;
  `docenteId === actor.id`; el plan está `VIGENTE`; `totalEvidencias < 20`. Añade y
  deja constancia de auditoría.
- **`retirar(actor, evidenciaId)`**: resuelve `contextoDeEvidencia` y comprueba lo
  mismo que `agregar` (salvo el tope), más `registradaPorId === actor.id`. Retira y
  deja constancia.

**Errores.** Si la evaluación o la evidencia no existe, si no es del usuario o si la
evidencia no es suya, siempre `AccesoDenegado` (un solo tipo a propósito: distinguirlos
diría a quien no debe si el recurso existe). Plan que no está Vigente o tope alcanzado:
`ReglaDeNegocioViolada` con un mensaje para una persona («El plan de evaluación X no
está vigente; ya no admite evidencias.» / «Esta evaluación ya tiene 20 evidencias.»).

**Auditoría.** La misma constancia que deja `guardarEvidencias` del coordinador
(mismo tipo de evento y bitácora), con el texto «evidencia registrada por el docente»
/ «evidencia retirada por el docente». El implementador reutiliza el mecanismo de
`dejarConstancia` de `configurar-plan-evaluacion.use-case.ts`, no inventa uno nuevo.

### 4.3 Interacción con el «guardar evidencias» del coordinador

`reemplazarEvidencias` (repositorio de configuración de evaluación, hoy: borra todas
y recrea con `orden` 0..n) pasa a **conservar `registradaPorId`** de las filas cuyo
`enlace` y `descripcion` no cambian, para que un coordinador que edita la lista no
convierta en «ajenas» las evidencias que registró un docente. Su firma no cambia. Si
el coordinador quita una evidencia del docente, se quita: tiene autoridad sobre el
plan. Se prueba con integración (§7).

### 4.4 Endpoints

En `mis-evidencias/infrastructure/http/`, prefijo `mejora-continua/mis-evaluaciones`:

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /mejora-continua/mis-evaluaciones` | — | `MisEvaluaciones` (abajo) |
| `POST /mejora-continua/mis-evaluaciones/:id/evidencias` | `{ enlace, descripcion }` | `{ id }` |
| `DELETE /mejora-continua/mis-evaluaciones/evidencias/:evidenciaId` | — | 204 |

El cuerpo del `POST` reutiliza `EvidenciaDto` (`IsUrl({ require_protocol: true })`,
máximo 2000 caracteres el enlace y 200 la descripción, ya recortada). Los `:id` van
con `ParseUUIDPipe`. El controller no tiene lógica.

```typescript
interface MisEvaluaciones {
  evaluaciones: {
    id: string;                                   // asignatura evaluada
    asignatura: { id: string; codigo: string; nombre: string };
    competencia: { id: string; codigo: string; nombre: string };
    entregable: string;
    periodo: { id: string; etiqueta: string; fechaCierre: string | null };  // AAAA-MM-DD
    planEvaluacion: { id: string; codigo: string };
    evidencias: { id: string; enlace: string; descripcion: string; propia: boolean }[];
    puedeAgregar: boolean;
  }[];
}
```

Orden de la lista: por asignatura (código), luego periodo (fecha de cierre ascendente,
sin fecha al final) y luego competencia (código). La respuesta llega ordenada; el
frontend no ordena.

## 5. Frontend

`apps/web/src/features/mejora-continua/` (misma carpeta de feature que el resto de
Mejora Continua), archivos nuevos:

```
api/mis-evidencias.api.ts          — listar / agregar / retirar
pages/MisEvidenciasPage.tsx        — la pantalla
```

- **Ruta** `/mis-evidencias` en `App.tsx` y entrada «Mis evidencias» en una sección
  nueva «Mi trabajo» del sidebar de `AppLayout.tsx` (`SECCIONES`), con
  `permiso: 'evidencia.registrar'` para que solo la vean quienes pueden usarla.
- **Contenido:** las evaluaciones agrupadas por asignatura. Cada tarjeta muestra la
  competencia, el entregable, el periodo y su fecha de cierre, y las evidencias como
  enlaces que abren en pestaña nueva (`target="_blank"` y `rel="noopener noreferrer"`).
  Un formulario de dos campos (enlace y descripción) agrega; solo las evidencias
  propias tienen botón «Retirar», con confirmación. Sin `puedeAgregar`, el formulario
  no aparece y se explica por qué.
- **Estados:** cargando (esqueleto con `role="status"`), error con «Reintentar»,
  sin evaluaciones («No tienes evaluaciones asignadas en el plan vigente.»), y el 409
  de «necesita una carrera asignada».
- **Datos:** `useQuery` con clave `['mis-evaluaciones', carreraACargo]`; las
  mutaciones invalidan esa clave. Un error de negocio al agregar o retirar se muestra
  en el propio formulario con el mensaje del servidor.
- **Colores:** solo tokens existentes de `global.css`.

## 6. Errores y estados límite

- Docente sin carrera a cargo: 409 con el mensaje esperado.
- Sin plan de estudios vigente o sin evaluaciones asignadas: lista vacía, no error.
- Evaluación de un plan que pasó a Histórico entre que se cargó la pantalla y se
  envía el formulario: 409 con mensaje, y la pantalla recarga la lista.
- Dos envíos a la vez sobre la misma evaluación pueden pasar el tope de 20 por una
  evidencia (la comprobación y la inserción no van bajo un bloqueo). Se acepta y se
  documenta: el tope es una ayuda de uso, no un invariante de dominio.

## 7. Testing

- **Autorización (`politica-de-autorizacion.spec.ts`)**: `evidencia.registrar` está
  acotado a carrera: un usuario con el permiso y la carrera X puede sobre X y no
  sobre Y.
- **Caso de uso, con puertos falsos**: cada rama de §4.2 — sin permiso; sin carrera;
  evaluación inexistente y evaluación de otro docente (ambas `AccesoDenegado`); plan
  no vigente; tope alcanzado; retirar una evidencia ajena o sin autoría; camino feliz
  con constancia de auditoría emitida; el listado marca `propia` y `puedeAgregar` y
  ordena como se dice.
- **Integración del repositorio (`sgc_test`)**: `evaluacionesDelDocente` solo trae
  planes Vigentes y solo las del docente; `agregarEvidencia` asigna `orden` = máximo
  + 1 y guarda la autoría; `retirarEvidencia`; y **el reemplazo del coordinador
  conserva `registradaPorId`** de las filas sin cambios y no lo inventa para las
  nuevas.
- **Integración ensamblada**: dos docentes de la misma carrera — cada uno ve y
  modifica solo lo suyo — y un docente de otra carrera no puede tocar nada.
- **Arranque de la aplicación** con la ruta mapeada (como en el plan del Director:
  `npm run build` y `npm start`, no `start:dev`).
- **Frontend**: la página con el endpoint simulado — lista, agregar (éxito y error del
  servidor), retirar con confirmación, solo las propias tienen «Retirar», sin
  evaluaciones, sin carrera, error con reintento, carga.
- **e2e de accesibilidad** con la cuenta `e2e-docente@sgc.local`. Necesita que
  `scripts/preparar-e2e.ts` deje un plan de evaluación Vigente con al menos una
  evaluación asignada a esa cuenta; si no lo hace hoy, se amplía ese script.

## 8. Limitaciones conocidas (aceptadas)

- Las evidencias registradas antes de este cambio no las puede retirar un docente.
- El tope de 20 puede superarse en un envío concurrente (ver §6).
- El docente solo actúa sobre planes Vigentes: un plan aprobado que aún no rige no
  admite evidencias suyas.
- Un docente con la carrera equivocada asignada no ve nada: la carrera sale de su
  asignación (`UsuarioCarrera`), como en todo el sistema.

## 9. Fuera de alcance

- La vista de inicio del Docente y el ajuste del selector para el rol doble
  Coordinador + Docente (sub-proyecto 4b).
- Subida de archivos y edición de una evidencia existente.
- Notificaciones o recordatorios al docente.
- Cambiar quién puede registrar el porcentaje alcanzado: sigue siendo del
  coordinador.
