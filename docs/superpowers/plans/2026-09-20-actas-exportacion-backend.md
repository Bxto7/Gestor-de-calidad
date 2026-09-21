# Exportación del Acta de Aprobación a Excel y PDF — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el backend de RF-AC-018/019 (exportar un Acta de Aprobación a Excel y a PDF, replicando el formato institucional vigente), incluyendo el mecanismo de congelado de contenido al aprobar que RNF24 exige y el nuevo estado `Emitida`.

**Architecture:** Renderer específico del módulo `actas` (PDFKit + ExcelJS directos), aislado del modelo `Documento` compartido de `platform/documentos/` — decisión explícita (ver §"Decisiones de arquitectura" más abajo). Reutiliza sin tocar `ColaDeDocumentosPort`/`AlmacenDeArchivosPort`/BullMQ. Sigue 1:1 el patrón ya construido para Plan de Mejora (`generar-documento-mejora.use-case.ts` y sus vecinos), con nombres propios de Actas.

**Tech Stack:** NestJS, Prisma, PDFKit, ExcelJS, BullMQ (cola compartida existente), Vitest.

**Spec:** `d:\Descargas\ESPEC_Exportacion_Acta_Plan_de_Mejora.md` (especificación visual/funcional externa, con las excepciones del §"Decisiones de contenido" de abajo) + `docs/requisitos/Módulo_Mejora_Continua - Requerimientos (Medición, Evaluación, Mejora y Actas).md` (RF-AC-018, RF-AC-019, RNF23, RNF24, RNF26).

Este plan es **solo backend**. Un segundo plan cubrirá el frontend (hooks de React Query, componente `DocumentosDelActa.tsx`, botones de descarga) una vez este esté implementado y revisado.

## Decisiones de arquitectura (ya tomadas — no se re-discuten en este plan)

1. **Opción B, confirmada con el usuario:** NO se reutiliza ni se extiende el modelo `Documento`/los renderers genéricos de `apps/api/src/platform/documentos/` (`documento.ts`, `pdfkit.renderer.ts`, `exceljs.renderer.ts`). Ese modelo es deliberadamente pobre por diseño (su propio comentario de cabecera lo dice: "sin colores, fuentes ni coordenadas") y hoy lo usan tres documentos ya en producción (Plan de Medición, Evaluación, Mejora). Tocarlo para acomodar los requisitos mucho más ricos del Acta (cabecera en 3 zonas, barras de sección con color, zebra, fórmulas de Excel con formato condicional, celdas combinadas, bloques que no se parten entre páginas) es fuera de alcance y arriesga esos tres documentos. En su lugar, todo el renderizado del Acta vive en código propio del módulo `actas`, bajo `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/`.
2. **Se reutilizan sin modificar:** `ColaDeDocumentosPort`, `AlmacenDeArchivosPort` y toda la infraestructura de BullMQ en `platform/documentos/cola.ts` y `platform/documentos/worker.ts` — no conocen `Documento`, son genéricos por diseño.
3. **El congelado de contenido (RNF24) ocurre al transicionar a `aprobar`**, no al exportar (decisión explícita del usuario). Antes de esta corrección, `obtenerContenido` unía en vivo cada `AccionActa` incluida contra su `PlanMejora` para leer `nombre`/`plazo`/`recursos`/`metas`/`responsable` — el propio comentario de `AccionActa` en `schema.prisma` documenta esa decisión pasada ("NO se snapshotean aquí — se leen en vivo... decisión §8.1 del diseño"). Esa decisión se revierte aquí porque permite que editar un `PlanMejora` después de que su Acta fue Aprobada cambie silenciosamente lo que un PDF exportado más tarde mostraría — exactamente lo que RNF24 prohíbe. La revisión se documenta en el propio comentario del schema (Task 1).
4. **Nuevo estado `Emitida`, sin `Histórica` todavía.** `EstadoActa` (dominio y BD) ya incluye los cinco estados desde 2c-AC-A, pero `transiciones-acta.ts` solo define transiciones hasta `Aprobada` — su propio comentario dice por qué: "Emitida e Histórica no tienen todavía un RF que describa qué las dispara — esa mecánica está atada a la exportación (RF-AC-018/019) y se diseña junto con ella." Este plan resuelve esa mecánica para `Emitida` únicamente: **la transición `Aprobada → Emitida` no es un botón de usuario** a través de `/actas/:id/transicionar` — ocurre como efecto interno la primera vez que `GenerarDocumentoActa.ejecutar` termina de generar con éxito un PDF o Excel de un acta que está en `Aprobada`. Cualquier rol con `actas.leer` puede disparar una exportación (así lo dice el propio RF-AC-018/019, que incluye "Usuario consultor" entre los actores) y, con ella, este efecto — es una decisión de diseño deliberada, no un descuido; queda documentada aquí para que se pueda cuestionar si resulta equivocada. Exportar un acta ya `Emitida` no vuelve a disparar nada (idempotente). Qué dispara `Histórica` queda fuera de este plan.
5. **Colores** — la especificación visual usa una paleta arbitraria (`navy #1F3864`, `blue #2E75B6`, etc.); por instrucción explícita del usuario se reemplaza por los tokens reales de diseño de este proyecto (`apps/web/src/styles/global.css`), que es la única paleta institucional permitida (ese archivo prohíbe explícitamente "inventar colores fuera de esta lista"):

   | Token de la especificación | Reemplazo (hex real del proyecto) | Uso |
   |---|---|---|
   | `navy` | `#57019f` (`--color-uc-dark`) | Títulos, barras de sección, bordes exteriores |
   | `blue` | `#6802c1` (`--color-uc-primary`) | Cabeceras de tabla, n.º de acta, "SISTEMA DE GESTIÓN DE LA CALIDAD" |
   | `light` | `#e9e1fb` (`--color-uc-lila-claro`) | Celdas etiqueta, celda TOTAL |
   | `zebra` | `#f7f5fb` (`--color-superficie-tenue`) | Filas pares de tablas |
   | `grid` | `#e2e1ea` (`--color-borde`) | Bordes internos |
   | `ok_bg` / `ok_fg` (LOGRADO) | `#e7f6ee` / `#157d4c` (`--color-estado-activo-bg/fg`) | Estado logrado |
   | `ko_bg` / `ko_fg` (NO LOGRADO) | `#fef3f2` / `#b42318` (`--color-alerta-bg/fg`) | Estado no logrado |
   | `muted` | `#565269` (`--color-tinta-suave`) | Notas y pie de página |

   **Excepción intencional:** la celda de entrada de meta en Excel (`#FFF2CC`) NO se reemplaza — es un color de affordance "celda editable/config", no uno de los tokens semánticos del proyecto, y la especificación original ya lo trata como un caso aparte.
6. **Contenido — decisiones explícitas del usuario, verificadas contra el documento de requisitos:**
   - **Asistentes: solo nombre**, sin columna "Cargo/rol" (RF-AC-005 nunca pidió ese campo; el usuario lo descartó explícitamente). La tabla II. ASISTENTES de la especificación se reduce a N.º · Nombres y apellidos.
   - **Sin sección de firma** en ningún formato (el usuario lo descartó; el propio documento de requisitos, §8, marca la firma como pregunta institucional sin resolver). El documento PDF/Excel termina después de la sección VII (ciudad y fecha) — no hay bloque de firma.
   - El **código de verificación** del pie de página es un hash corto y real: `sha256("${acta.id}:${acta.correlativo}:${acta.aprobadoEn.toISOString()}")` truncado a 12 caracteres hexadecimales — usa campos reales que ya existen en `DatosActa` (no se inventa un campo `version`, que este modelo no tiene).
   - Para las filas de Competencia (tabla 4.3), el LOGRADO/NO LOGRADO se congela **también en el momento de aprobar**, junto con el resto del snapshot — no se recalcula contra la meta vigente del plan de medición al exportar, por la misma razón de RNF24 que motiva el resto del snapshot (si la meta de un plan de medición cambiara después de aprobar el acta, un PDF exportado después mostraría un resultado distinto del que se aprobó). Esto es una decisión de este plan, no algo que el usuario haya dicho explícitamente — queda señalada aquí para que se pueda objetar.

## Global Constraints

- TypeScript estricto, sin `any` sin justificar (CLAUDE.md §2).
- Nomenclatura de dominio en español (`Acta`, `AccionActa`, `armarActaParaDocumento`); infraestructura (repos, DTOs, controllers, nombres de librerías) en inglés donde sea el patrón del framework.
- La capa de dominio (`domain/`) no importa NestJS, Prisma, `pdfkit` ni `exceljs` — solo tipos planos y funciones puras. Quien conoce esas librerías es `infrastructure/`.
- Migraciones de base de datos siempre vía Prisma Migrate (`npx prisma migrate dev`), nunca SQL a mano.
- Cualquier caso de uso que modifique una entidad relevante ya publica su evento de auditoría (`eventos-actas.js`) — las tareas que tocan `transicionar` no quitan ni debilitan esa publicación.
- Commits frecuentes, uno por tarea, TDD estricto (test que falla → implementación mínima → test en verde).
- Un módulo nunca importa el repositorio de otro directamente — `actas` ya depende de `RepositorioPlanMejoraPort`/`RepositorioPlanEvaluacionPort`/`RepositorioPlanMedicionPort` (puertos, no repos concretos) desde antes de este plan; este plan no agrega ninguna dependencia cruzada nueva, solo usa las que `GestionarActas` ya recibe por constructor.

---

### Task 1: Esquema de Prisma — snapshot de acciones, nuevo `DocumentoActa`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: columnas nuevas en `AccionActa` (`nombreSnapshot`, `plazoSnapshot`, `recursosSnapshot`, `metasSnapshot`, `responsableSnapshot`, `metaCompetenciaSnapshot`, todas nullable), modelo `DocumentoActa`, enum `TipoDocumentoActa`.
- Consumido por: Task 3 (puerto), Task 5 (repositorio Prisma de actas), Task 13 (repositorio Prisma de documentos).

No hay TDD aquí (es un cambio de esquema, no de lógica) — la verificación es que la migración aplique limpio y que la suite existente siga en verde.

- [ ] **Step 1: Editar el modelo `AccionActa`**

En `apps/api/prisma/schema.prisma`, reemplazar el comentario y el cuerpo del modelo `AccionActa` (busca `model AccionActa {`):

```prisma
/// RF-AC-007/008: qué planes de mejora entran en el acta y cuáles de esos
/// quedan finalmente incluidos (2c-AC-B). `planMejoraId` es un UUID suelto,
/// SIN `@relation` de Prisma hacia `PlanMejora` — mismo criterio que el resto
/// de referencias cruzadas dentro de `mejora_continua`.
///
/// Las columnas `*Snapshot` SÍ se congelan, a diferencia de la decisión
/// original de este modelo (ver el historial de este comentario): mientras
/// el acta está en Borrador/En revisión se sigue leyendo `PlanMejora` en
/// vivo (`GestionarActas.obtenerContenido`), pero al transicionar a
/// `aprobar` el caso de uso copia aquí `nombre`/`plazo`/`recursos`/`metas`/
/// `responsable` (y, para Competencia, el resultado LOGRADO/NO LOGRADO ya
/// resuelto). RNF24 exige que el contenido de un acta ya aprobada no cambie
/// aunque el `PlanMejora` de origen se edite después (RF-AC-018/019, plan de
/// exportación 2026-09-20) — la unión en vivo permitía justo eso.
/// `porcentajeMedicionCompetencia` sigue siendo el único campo que ya se
/// congelaba desde 2c-AC-B (RF-PJ-028), sin cambios.
model AccionActa {
  id           String            @id @default(uuid()) @db.Uuid
  actaId       String            @map("acta_id") @db.Uuid
  planMejoraId String            @map("plan_mejora_id") @db.Uuid
  aspecto      AspectoPlanMejora
  /// RF-AC-008 RN1: incluida por defecto al cargarse.
  incluida     Boolean           @default(true)
  /// RF-PJ-028 / RF-AC-010: snapshot al momento de cargar. `null` si el
  /// aspecto no es Competencia, o si "no disponible" (RF-PJ-028 RN3, primer
  /// periodo).
  porcentajeMedicionCompetencia Int? @map("porcentaje_medicion_competencia") @db.SmallInt
  /// RF-AC-007 RN2 (orden de secciones) y orden de llegada dentro de cada una.
  orden        Int

  /// Snapshot al aprobar (ver comentario del modelo). `null` mientras el
  /// acta sigue en Borrador/En revisión — recién se llenan en la transición
  /// `aprobar`, nunca antes. `codigoSnapshot` se congela también aunque el
  /// código de un PlanMejora no se edite hoy: así el camino de lectura de un
  /// acta Aprobada/Emitida no depende de que el PlanMejora siga existiendo.
  codigoSnapshot       String?   @map("codigo_snapshot") @db.VarChar(80)
  nombreSnapshot       String?   @map("nombre_snapshot") @db.VarChar(300)
  plazoSnapshot        DateTime? @map("plazo_snapshot") @db.Date
  recursosSnapshot     String?   @map("recursos_snapshot") @db.Text
  metasSnapshot        String?   @map("metas_snapshot") @db.Text
  responsableSnapshot  String?   @map("responsable_snapshot") @db.VarChar(300)
  /// Solo Competencia: la meta (en el mismo entero 0-100 que
  /// `porcentajeMedicionCompetencia`) contra la que se comparó al aprobar,
  /// para que LOGRADO/NO LOGRADO no cambie si la meta del plan de medición
  /// cambia después.
  metaCompetenciaSnapshot Int? @map("meta_competencia_snapshot") @db.SmallInt

  acta ActaAprobacion @relation(fields: [actaId], references: [id], onDelete: Cascade)

  /// Un plan de mejora aparece a lo sumo una vez por acta.
  @@unique([actaId, planMejoraId])
  @@index([actaId])
  @@map("acciones_acta")
  @@schema("mejora_continua")
}
```

- [ ] **Step 2: Agregar `TipoDocumentoActa` y el modelo `DocumentoActa`**

Justo después del modelo `AccionActa` (antes de la línea en blanco final del archivo, o donde termine el bloque de `mejora_continua`), agregar:

```prisma
/// RF-AC-018/RF-AC-019.
enum TipoDocumentoActa {
  ACTA_PDF
  ACTA_EXCEL

  @@schema("mejora_continua")
}

/// RF-AC-018/019: el acta generada como archivo. Reutiliza
/// `EstadoDocumentoMedicion` para el ciclo de vida del trabajo (EN_COLA →
/// GENERANDO → LISTO/FALLIDO) — mismo criterio que ya sigue `DocumentoMejora`:
/// los cuatro valores son idénticos, y declarar un cuarto enum solo para
/// repetirlos sería puro ruido.
model DocumentoActa {
  id     String                  @id @default(uuid()) @db.Uuid
  actaId String                  @map("acta_id") @db.Uuid
  tipo   TipoDocumentoActa
  estado EstadoDocumentoMedicion @default(EN_COLA)

  nombreArchivo String? @map("nombre_archivo") @db.VarChar(200)
  tipoMime      String? @map("tipo_mime") @db.VarChar(120)
  bytes         Int?
  /// Opaca a propósito, igual que en `DocumentoMejora`.
  ubicacion     String? @db.VarChar(500)
  error         String? @db.Text

  solicitadoPor String    @map("solicitado_por") @db.Uuid
  solicitadoEn  DateTime  @default(now()) @map("solicitado_en") @db.Timestamptz(6)
  terminadoEn   DateTime? @map("terminado_en") @db.Timestamptz(6)

  acta ActaAprobacion @relation(fields: [actaId], references: [id], onDelete: Cascade)

  @@index([actaId, solicitadoEn])
  @@map("documentos_acta")
  @@schema("mejora_continua")
}
```

- [ ] **Step 3: Agregar la relación inversa en `ActaAprobacion`**

En el modelo `ActaAprobacion`, justo debajo de la línea `acciones   AccionActa[]`, agregar:

```prisma
  documentos DocumentoActa[]
```

- [ ] **Step 4: Generar y aplicar la migración**

Run: `cd apps/api && npx prisma migrate dev --name actas_exportacion_snapshot`
Expected: Prisma crea la carpeta de migración, la aplica contra la base local, y no pide confirmación destructiva (todas las columnas nuevas son nullable u opcionales, y el nuevo modelo/enum no tocan datos existentes).

- [ ] **Step 5: Regenerar el cliente y verificar que compila**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit`
Expected: sin errores — el cliente Prisma ahora expone `prisma.documentoActa` y los campos nuevos de `accionActa`.

- [ ] **Step 6: Confirmar que la suite existente sigue en verde**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas`
Expected: todos los tests existentes de `actas` siguen pasando (los campos nuevos son opcionales, ningún test los toca todavía).

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(actas): esquema para snapshot de acciones y documentos del acta (RF-AC-018/019)"
```

---

### Task 2: `transiciones-acta.ts` — marcar Emitida (efecto interno, no botón)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/transiciones-acta.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/domain/value-objects/transiciones-acta.spec.ts`

**Interfaces:**
- Consumes: `EstadoActa` de `./estado-acta.js` (ya existe, sin cambios).
- Produces: `intentarMarcarEmitida(estadoActual: EstadoActa): ResultadoTransicionActa` — reutiliza el tipo `ResultadoTransicionActa` ya existente. Consumido por Task 4 (`GenerarDocumentoActa.ejecutar`, vía `GestionarActas`, Task 4 también).

Deliberadamente NO se agrega `'emitir'` a `AccionActaTransicion` ni a `TRANSICIONES`: esa tabla describe transiciones que un botón de la pantalla puede ofrecer (cada una tiene `etiqueta`/`permiso` para eso), y `Emitida` no es clicable — la dispara la exportación. Mezclarla ahí haría que `transicionesDisponibles('Aprobada')` la incluyera y la UI mostrara un botón que no debe existir.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `transiciones-acta.spec.ts` (mismo `describe` de nivel superior que ya tenga el archivo, o uno nuevo):

```typescript
describe('intentarMarcarEmitida — RF-AC-018/019', () => {
  it('permite Aprobada → Emitida', () => {
    const r = intentarMarcarEmitida('Aprobada');
    expect(r).toEqual({ ok: true, nuevoEstado: 'Emitida' });
  });

  it('rechaza marcar Emitida desde cualquier otro estado', () => {
    for (const estado of ['Borrador', 'En revisión', 'Emitida', 'Histórica'] as const) {
      const r = intentarMarcarEmitida(estado);
      expect(r.ok).toBe(false);
    }
  });

  it('el motivo del rechazo nombra el estado actual', () => {
    const r = intentarMarcarEmitida('Borrador');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('Borrador');
  });
});
```

Agregar `intentarMarcarEmitida` al import existente de `transiciones-acta.js` en la cabecera del spec.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/domain/value-objects/transiciones-acta.spec.ts`
Expected: FAIL — `intentarMarcarEmitida is not a function` o `is not exported`.

- [ ] **Step 3: Implementar**

Al final de `transiciones-acta.ts`, agregar:

```typescript
/**
 * RF-AC-018/019: Aprobada → Emitida no es una transición de botón (no tiene
 * `etiqueta`, `permiso` ni entra en `transicionesDisponibles`) — la dispara
 * `GenerarDocumentoActa.ejecutar` la primera vez que una exportación termina
 * con éxito. Vive aquí y no en el caso de uso porque sigue siendo una regla
 * de la máquina de estados: qué transiciones son válidas y desde dónde.
 */
export function intentarMarcarEmitida(estadoActual: EstadoActa): ResultadoTransicionActa {
  if (estadoActual !== 'Aprobada') {
    return {
      ok: false,
      motivo: `Solo un acta Aprobada puede pasar a Emitida; el acta está en ${estadoActual}.`,
    };
  }
  return { ok: true, nuevoEstado: 'Emitida' };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/domain/value-objects/transiciones-acta.spec.ts`
Expected: PASS, todos los tests del archivo (los nuevos y los existentes).

- [ ] **Step 5: Actualizar el comentario de cabecera del archivo**

Reemplazar la línea "Solo llega hasta Aprobada. Emitida e Histórica no tienen todavía un RF..." del comentario de cabecera por:

```typescript
 * Llega hasta Aprobada por botón de usuario. Emitida se alcanza por un
 * efecto interno de la exportación (`intentarMarcarEmitida`, más abajo,
 * fuera de `TRANSICIONES`) — ver el plan de exportación 2026-09-20. Qué
 * dispara Histórica sigue sin definirse.
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/domain/value-objects/transiciones-acta.ts apps/api/src/modules/mejora-continua/actas/domain/value-objects/transiciones-acta.spec.ts
git commit -m "feat(actas): intentarMarcarEmitida, transicion interna Aprobada a Emitida (RF-AC-018/019)"
```

---

### Task 3: `acta-aprobacion.port.ts` — snapshot en el puerto

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts`

**Interfaces:**
- Consumes: `AspectoPlanMejora` de `../../../mejora/application/ports/plan-mejora.port.js` (ya importado).
- Produces: `SnapshotAccionActa` (nuevo tipo), `AccionActaDato` extendido con los seis campos snapshot, `cambiarEstado` con firma nueva (recibe un objeto de opciones en vez de un tercer parámetro posicional único), `PlanResumenParaActa` (nuevo tipo, más angosto que `DatosPlanMejora` — ver nota abajo). Consumido por Task 4 (caso de uso), Task 5 (repositorio Prisma).

Sin test propio — es un archivo de tipos, sin lógica ejecutable. Se verifica por compilación (Step 3) y por los tests de las tareas que lo consumen.

- [ ] **Step 1: Agregar `SnapshotAccionActa` y extender `AccionActaDato`**

En `acta-aprobacion.port.ts`, después de la interfaz `AccionActaDato` existente, agregar:

```typescript
/**
 * Lo que se congela al aprobar (RNF24, plan de exportación 2026-09-20).
 * `metaCompetenciaSnapshot` es la meta (0-100, mismo entero que
 * `porcentajeMedicionCompetencia`) contra la que se comparó ese resultado
 * en ese momento — `null` si el aspecto no es Competencia o si el propio
 * porcentaje era `null`.
 */
export interface SnapshotAccionActa {
  readonly accionActaId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
  readonly metaCompetenciaSnapshot: number | null;
}
```

Reemplazar la interfaz `AccionActaDato` existente por (agrega los seis campos snapshot, todos opcionales/nulos):

```typescript
export interface AccionActaDato {
  readonly id: string;
  readonly planMejoraId: string;
  readonly aspecto: AspectoPlanMejora;
  readonly incluida: boolean;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly orden: number;
  /** `null` hasta que el acta se aprueba — ver `SnapshotAccionActa`. */
  readonly codigoSnapshot: string | null;
  readonly nombreSnapshot: string | null;
  readonly plazoSnapshot: Date | null;
  readonly recursosSnapshot: string | null;
  readonly metasSnapshot: string | null;
  readonly responsableSnapshot: string | null;
  readonly metaCompetenciaSnapshot: number | null;
}
```

- [ ] **Step 2: Cambiar la firma de `cambiarEstado` en `RepositorioActaAprobacionPort`**

Reemplazar la firma existente:

```typescript
  cambiarEstado(
    id: string,
    estado: EstadoActa,
    aprobacion?: { actorId: string; fecha: Date },
  ): Promise<DatosActa>;
```

por:

```typescript
  /**
   * RF-AC-013/014. `snapshots` solo viaja al aprobar (Task 4 lo arma); una
   * transición posterior no debe volver a escribirlos ni borrarlos.
   */
  cambiarEstado(
    id: string,
    estado: EstadoActa,
    opciones?: {
      readonly aprobacion?: { readonly actorId: string; readonly fecha: Date };
      readonly snapshots?: readonly SnapshotAccionActa[];
    },
  ): Promise<DatosActa>;
```

- [ ] **Step 3: Agregar `PlanResumenParaActa`**

Al final del archivo, antes de `RepositorioActaAprobacionPort`, agregar:

```typescript
/**
 * Lo mínimo de un `PlanMejora` que el Acta necesita mostrar — deliberadamente
 * más angosto que `DatosPlanMejora` (que trae `causaRaiz`/`justificacion`/
 * `estado`/`evidencias`/etc., nada de lo cual el acta usa). Con esto,
 * `GestionarActas.obtenerContenido` puede devolver la misma forma tanto en
 * el camino en vivo (Borrador/En revisión) como en el camino de snapshot
 * (Aprobada/Emitida/Histórica) sin inventar valores para campos que ninguna
 * de las dos fuentes tiene sentido de dar.
 */
export interface PlanResumenParaActa {
  readonly id: string;
  readonly codigo: string;
  readonly aspecto: AspectoPlanMejora;
  readonly nombre: string;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
}
```

- [ ] **Step 4: Verificar que compila (fallará, a propósito)**

Run: `cd apps/api && npx tsc --noEmit`
Expected: FAIL — `gestionar-actas.use-case.ts` y `acta-aprobacion.repository.ts` todavía implementan la firma vieja de `cambiarEstado` y usan `DatosPlanMejora` donde ahora se espera consistencia con `PlanResumenParaActa`. Este fallo es la prueba de que el cambio de tipo es real; Task 4 y Task 5 lo resuelven.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/ports/acta-aprobacion.port.ts
git commit -m "feat(actas): tipos de snapshot y PlanResumenParaActa en el puerto (RF-AC-018/019)"
```

---

### Task 4: `gestionar-actas.use-case.ts` — congelar al aprobar, leer desde snapshot

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`

**Interfaces:**
- Consumes: `SnapshotAccionActa`, `PlanResumenParaActa`, `AccionActaDato` extendido (Task 3); `porcentajeDeMeta` de `../../../medicion/domain/value-objects/meta.js` (nuevo import, función pura ya existente).
- Produces: `AccionDelActa.plan` ahora es `PlanResumenParaActa` (era `DatosPlanMejora`) y `AccionDelActa` gana `metaCompetenciaSnapshot: number | null`. `transicionar` ahora construye y pasa `snapshots` al aprobar. Consumido por Task 12 (`GenerarDocumentoActa`, que llama `obtenerContenido`) y por el módulo de dominio de contenido (Task 6).

Esta tarea resuelve el fallo de compilación que Task 3 dejó a propósito.

- [ ] **Step 1: Escribir los tests que fallan**

En `gestionar-actas.spec.ts`, la firma nueva de `cambiarEstado` rompe dos mocks existentes por desestructurar un tercer parámetro posicional que ya no existe. Corregirlos primero (esto es scaffolding, no una aserción nueva):

En el `repoActas()` de la cabecera del archivo (línea con `cambiarEstado: async (_id, estado, aprobacion) =>`), reemplazar por:

```typescript
    cambiarEstado: async (_id, estado, opciones) =>
      acta({
        estado,
        ...(opciones?.aprobacion
          ? { aprobadoPorId: opciones.aprobacion.actorId, aprobadoEn: opciones.aprobacion.fecha }
          : {}),
      }),
```

En el test `'aprobar: En revisión → Aprobada, fija aprobadoPorId/aprobadoEn'`, reemplazar:

```typescript
      cambiarEstado: async (_id, estado, aprobacion) => {
        aprobacionRecibida = aprobacion;
        return actaCompleta({
          estado,
          aprobadoPorId: aprobacion?.actorId ?? null,
          aprobadoEn: aprobacion?.fecha ?? null,
        });
      },
```

por:

```typescript
      cambiarEstado: async (_id, estado, opciones) => {
        aprobacionRecibida = opciones?.aprobacion;
        return actaCompleta({
          estado,
          aprobadoPorId: opciones?.aprobacion?.actorId ?? null,
          aprobadoEn: opciones?.aprobacion?.fecha ?? null,
        });
      },
```

En el test `'rechazar: En revisión → Borrador, no toca aprobadoPorId/aprobadoEn'`, reemplazar:

```typescript
      cambiarEstado: async (_id, estado, aprobacion) => {
        aprobacionRecibida = aprobacion;
        return actaCompleta({ estado });
      },
```

por:

```typescript
      cambiarEstado: async (_id, estado, opciones) => {
        aprobacionRecibida = opciones?.aprobacion;
        return actaCompleta({ estado });
      },
```

Ahora sí, las aserciones nuevas. Agregar dentro de `describe('transicionar', ...)`, después del test `'aprobar: En revisión → Aprobada, fija aprobadoPorId/aprobadoEn'`:

```typescript
  it('aprobar: congela nombre/plazo/recursos/metas/responsable de cada acción incluida', async () => {
    let snapshotsRecibidos: readonly { accionActaId: string; codigo: string; nombre: string }[] = [];
    const dosAcciones = [
      { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION' as const, incluida: true, porcentajeMedicionCompetencia: null, orden: 0, codigoSnapshot: null, nombreSnapshot: null, plazoSnapshot: null, recursosSnapshot: null, responsableSnapshot: null, metasSnapshot: null, metaCompetenciaSnapshot: null },
      { id: 'aa-2', planMejoraId: 'plan-2', aspecto: 'OBJETIVO_EDUCACIONAL' as const, incluida: true, porcentajeMedicionCompetencia: null, orden: 1, codigoSnapshot: null, nombreSnapshot: null, plazoSnapshot: null, recursosSnapshot: null, responsableSnapshot: null, metasSnapshot: null, metaCompetenciaSnapshot: null },
    ];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => dosAcciones,
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({
      planesPorIds: async () => [
        planMejora({ id: 'plan-1', codigo: 'CA-01', nombre: 'Reforzar bibliografía', plazo: new Date('2026-12-01'), recursos: 'r1', metas: 'm1', responsable: 'resp-1' }),
        planMejora({ id: 'plan-2', aspecto: 'OBJETIVO_EDUCACIONAL', codigo: 'OE-01', nombre: 'Ajustar el syllabus', plazo: new Date('2026-11-01'), recursos: 'r2', metas: 'm2', responsable: 'resp-2' }),
      ],
    });
    const casos = montar({ actas, planes });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshotsRecibidos).toHaveLength(2);
    expect(snapshotsRecibidos.find((s) => s.accionActaId === 'aa-1')).toMatchObject({
      codigo: 'CA-01',
      nombre: 'Reforzar bibliografía',
    });
    expect(snapshotsRecibidos.find((s) => s.accionActaId === 'aa-2')).toMatchObject({
      codigo: 'OE-01',
      nombre: 'Ajustar el syllabus',
    });
  });

  it('aprobar: no congela las acciones descartadas (incluida: false)', async () => {
    let snapshotsRecibidos: readonly { accionActaId: string }[] = [];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION' as const, incluida: true, porcentajeMedicionCompetencia: null, orden: 0, codigoSnapshot: null, nombreSnapshot: null, plazoSnapshot: null, recursosSnapshot: null, responsableSnapshot: null, metasSnapshot: null, metaCompetenciaSnapshot: null },
        { id: 'aa-2', planMejoraId: 'plan-2', aspecto: 'CRITERIO_ACREDITACION' as const, incluida: false, porcentajeMedicionCompetencia: null, orden: 1, codigoSnapshot: null, nombreSnapshot: null, plazoSnapshot: null, recursosSnapshot: null, responsableSnapshot: null, metasSnapshot: null, metaCompetenciaSnapshot: null },
      ],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({ planesPorIds: async () => [planMejora({ id: 'plan-1' })] });
    const casos = montar({ actas, planes });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshotsRecibidos).toEqual([expect.objectContaining({ accionActaId: 'aa-1' })]);
  });

  it('aprobar: congela la meta de Competencia resuelta en ese momento (0-100)', async () => {
    let snapshotsRecibidos: readonly { metaCompetenciaSnapshot: number | null }[] = [];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'plan-comp', aspecto: 'COMPETENCIA' as const, incluida: true, porcentajeMedicionCompetencia: 65, orden: 0, codigoSnapshot: null, nombreSnapshot: null, plazoSnapshot: null, recursosSnapshot: null, responsableSnapshot: null, metasSnapshot: null, metaCompetenciaSnapshot: null },
      ],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({
      planesPorIds: async () => [
        planMejora({ id: 'plan-comp', aspecto: 'COMPETENCIA', planEvaluacionId: 'pe-1' }),
      ],
    });
    const evaluaciones = repoEvaluaciones({
      porId: async () => ({
        id: 'pe-1',
        planMedicionId: 'pm-1',
      }) as Awaited<ReturnType<RepositorioPlanEvaluacionPort['porId']>>,
    });
    const mediciones = repoMediciones({
      porId: async () =>
        ({ id: 'pm-1', meta: 0.7 }) as Awaited<ReturnType<RepositorioPlanMedicionPort['porId']>>,
    });
    const casos = montar({ actas, planes, evaluaciones, mediciones });

    await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(snapshotsRecibidos[0]?.metaCompetenciaSnapshot).toBe(70);
  });

  it('aprobar: una acción cuyo plan de mejora ya no existe se omite del snapshot sin bloquear la aprobación', async () => {
    let snapshotsRecibidos: readonly { accionActaId: string }[] = [];
    const actas = repoActas({
      porId: async () => actaCompleta({ estado: 'En revisión' }),
      accionesDe: async () => [
        { id: 'aa-1', planMejoraId: 'plan-borrado', aspecto: 'CRITERIO_ACREDITACION' as const, incluida: true, porcentajeMedicionCompetencia: null, orden: 0, codigoSnapshot: null, nombreSnapshot: null, plazoSnapshot: null, recursosSnapshot: null, responsableSnapshot: null, metasSnapshot: null, metaCompetenciaSnapshot: null },
      ],
      cambiarEstado: async (_id, estado, opciones) => {
        snapshotsRecibidos = opciones?.snapshots ?? [];
        return actaCompleta({ estado });
      },
    });
    const planes = repoPlanesMejora({ planesPorIds: async () => [] });
    const casos = montar({ actas, planes });

    const resultado = await casos.transicionar(ACTOR, 'acta-1', 'aprobar', {});

    expect(resultado.estado).toBe('Aprobada');
    expect(snapshotsRecibidos).toEqual([]);
  });
```

Y agregar dentro de `describe('obtenerContenido', ...)`, después del test existente `'omite silenciosamente las filas cuyo PlanMejora fue eliminado después de vincularse'`:

```typescript
  it('RNF24: un acta Aprobada lee del snapshot, no de PlanMejora en vivo', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Aprobada' }),
      accionesDe: async () => [
        {
          id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true,
          porcentajeMedicionCompetencia: null, orden: 0,
          codigoSnapshot: 'CA-01', nombreSnapshot: 'Nombre congelado', plazoSnapshot: new Date('2026-12-01'),
          recursosSnapshot: 'recursos congelados', metasSnapshot: 'metas congeladas', responsableSnapshot: 'resp congelado',
          metaCompetenciaSnapshot: null,
        },
      ],
    });
    // `planesPorIds` no se llama en absoluto para un acta Aprobada — si el
    // caso de uso todavía leyera en vivo, este doble lo delataría.
    const planes = repoPlanesMejora({
      planesPorIds: noUsado('planesPorIds') as unknown as RepositorioPlanMejoraPort['planesPorIds'],
    });
    const casos = montar({ actas, planes });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones[0]?.plan.nombre).toBe('Nombre congelado');
    expect(contenido.acciones[0]?.plan.codigo).toBe('CA-01');
    expect(contenido.acciones[0]?.plan.responsable).toBe('resp congelado');
  });

  it('RNF24: una fila Aprobada sin snapshot completo se omite (no debería ocurrir, pero no debe reventar)', async () => {
    const actas = repoActas({
      porId: async () => acta({ estado: 'Aprobada' }),
      accionesDe: async () => [
        {
          id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true,
          porcentajeMedicionCompetencia: null, orden: 0,
          codigoSnapshot: null, nombreSnapshot: null, plazoSnapshot: null,
          recursosSnapshot: null, metasSnapshot: null, responsableSnapshot: null,
          metaCompetenciaSnapshot: null,
        },
      ],
    });
    const casos = montar({ actas });

    const contenido = await casos.obtenerContenido(ACTOR, 'acta-1');

    expect(contenido.acciones).toEqual([]);
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: FAIL — algunas por error de tipos (`snapshots`/`opciones` no existen todavía en la implementación real, solo en el puerto), otras porque `AccionDelActa.plan` sigue siendo `DatosPlanMejora` y no trae `codigo`/`nombre` congelados.

- [ ] **Step 3: Implementar**

Agregar los imports nuevos al inicio de `gestionar-actas.use-case.ts` (junto a los ya existentes):

```typescript
import { porcentajeDeMeta } from '../../../medicion/domain/value-objects/meta.js';
import type {
  AccionActaDato,
  PlanResumenParaActa,
  SnapshotAccionActa,
} from '../ports/acta-aprobacion.port.js';
```

Reemplazar la interfaz `AccionDelActa` existente por:

```typescript
/** RF-AC-009: una fila de la tabla del acta. `plan` viene en vivo (Borrador/En
 * revisión) o del snapshot (Aprobada en adelante) — ver `obtenerContenido`. */
export interface AccionDelActa {
  readonly id: string;
  readonly incluida: boolean;
  readonly orden: number;
  readonly porcentajeMedicionCompetencia: number | null;
  /** Solo tiene valor una vez que el acta se aprobó (RF-AC-018/019). */
  readonly metaCompetenciaSnapshot: number | null;
  readonly plan: PlanResumenParaActa;
}
```

Reemplazar el método `obtenerContenido` completo por:

```typescript
  /** RF-AC-009: la cabecera del acta con sus acciones. */
  async obtenerContenido(actor: Actor, id: string): Promise<ContenidoActa> {
    await this.exigir(actor, 'actas.leer', null);
    const acta = await this.exigirActa(id);
    const vinculos = await this.actas.accionesDe(id);

    const acciones =
      acta.estado === 'Borrador' || acta.estado === 'En revisión'
        ? await this.accionesEnVivo(vinculos)
        : this.accionesDesdeSnapshot(vinculos);

    return { ...acta, acciones };
  }

  /** Mientras el acta es editable, cada fila lee su PlanMejora en vivo. */
  private async accionesEnVivo(vinculos: readonly AccionActaDato[]): Promise<AccionDelActa[]> {
    const planes = await this.planes.planesPorIds(vinculos.map((v) => v.planMejoraId));
    const planesPorId = new Map(planes.map((p) => [p.id, p]));

    return vinculos.flatMap((v) => {
      const plan = planesPorId.get(v.planMejoraId);
      if (!plan) return []; // el plan de mejora se eliminó después de cargarse; se omite en vez de fallar
      return [
        {
          id: v.id,
          incluida: v.incluida,
          orden: v.orden,
          porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
          metaCompetenciaSnapshot: null,
          plan: {
            id: plan.id,
            codigo: plan.codigo,
            aspecto: plan.aspecto,
            nombre: plan.nombre,
            plazo: plan.plazo,
            recursos: plan.recursos,
            metas: plan.metas,
            responsable: plan.responsable,
          },
        },
      ];
    });
  }

  /**
   * RNF24: una vez Aprobada, el contenido se lee de las columnas `*Snapshot`
   * de `AccionActa` — nunca de `PlanMejora` en vivo. Una fila sin snapshot
   * completo se omite, mismo criterio que `accionesEnVivo` con un plan
   * eliminado.
   */
  private accionesDesdeSnapshot(vinculos: readonly AccionActaDato[]): AccionDelActa[] {
    return vinculos.flatMap((v) => {
      if (
        v.codigoSnapshot === null ||
        v.nombreSnapshot === null ||
        v.plazoSnapshot === null ||
        v.recursosSnapshot === null ||
        v.metasSnapshot === null ||
        v.responsableSnapshot === null
      ) {
        return [];
      }
      return [
        {
          id: v.id,
          incluida: v.incluida,
          orden: v.orden,
          porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
          metaCompetenciaSnapshot: v.metaCompetenciaSnapshot,
          plan: {
            id: v.planMejoraId,
            codigo: v.codigoSnapshot,
            aspecto: v.aspecto,
            nombre: v.nombreSnapshot,
            plazo: v.plazoSnapshot,
            recursos: v.recursosSnapshot,
            metas: v.metasSnapshot,
            responsable: v.responsableSnapshot,
          },
        },
      ];
    });
  }
```

Reemplazar el método `transicionar` completo por:

```typescript
  /** RF-AC-013: transición con su permiso y su validación previa (RF-AC-016). */
  async transicionar(
    actor: Actor,
    id: string,
    accion: AccionActaTransicion,
    contexto: { comentario?: string },
  ): Promise<DatosActa> {
    const acta = await this.exigirActa(id);
    const transicion = describirTransicion(accion);
    await this.exigir(actor, `actas.${transicion.permiso}`, acta.carreraId);

    const vinculos = await this.actas.accionesDe(id);

    // RF-AC-016 RN1: requisito previo, solo para las transiciones que lo exigen.
    const tieneBloqueos = transicion.exigeSinBloqueos
      ? validarCompletitudActa({ ...acta, acciones: vinculos }).tieneBloqueos
      : false;

    const r = intentarTransicion(acta.estado, accion, {
      tieneBloqueos,
      comentario: contexto.comentario,
    });
    if (!r.ok) throw new ReglaDeNegocioViolada(r.motivo);

    // RF-AC-014. El instante lo pone la aplicación y no la base. RNF24: solo
    // al aprobar se congela el contenido de las acciones incluidas.
    const actualizada =
      accion === 'aprobar'
        ? await this.actas.cambiarEstado(id, r.nuevoEstado, {
            aprobacion: { actorId: actor.id, fecha: new Date() },
            snapshots: await this.construirSnapshots(vinculos),
          })
        : await this.actas.cambiarEstado(id, r.nuevoEstado);

    await this.eventos.publicar([
      new ActaTransicionada(actor, id, acta.codigo, acta.estado, r.nuevoEstado, contexto.comentario),
    ]);
    return actualizada;
  }

  /**
   * RNF24: congela nombre/plazo/recursos/metas/responsable (y, para
   * Competencia, la meta contra la que se comparó) de cada acción incluida,
   * en el momento exacto de aprobar.
   */
  private async construirSnapshots(
    vinculos: readonly AccionActaDato[],
  ): Promise<SnapshotAccionActa[]> {
    const incluidas = vinculos.filter((v) => v.incluida);
    if (incluidas.length === 0) return [];

    const planes = await this.planes.planesPorIds(incluidas.map((v) => v.planMejoraId));
    const planesPorId = new Map(planes.map((p) => [p.id, p]));

    const snapshots: SnapshotAccionActa[] = [];
    for (const v of incluidas) {
      const plan = planesPorId.get(v.planMejoraId);
      // El plan de mejora desapareció entre "cargar acciones" y "aprobar":
      // no hay nada que congelar, se omite la fila huérfana.
      if (!plan) continue;

      const metaCompetenciaSnapshot =
        plan.aspecto === 'COMPETENCIA' && v.porcentajeMedicionCompetencia !== null
          ? await this.metaDeCompetencia(plan.planEvaluacionId)
          : null;

      snapshots.push({
        accionActaId: v.id,
        codigo: plan.codigo,
        nombre: plan.nombre,
        plazo: plan.plazo,
        recursos: plan.recursos,
        metas: plan.metas,
        responsable: plan.responsable,
        metaCompetenciaSnapshot,
      });
    }
    return snapshots;
  }

  /** La meta del plan de medición base de esa competencia, como entero 0-100. */
  private async metaDeCompetencia(planEvaluacionId: string | null): Promise<number | null> {
    if (!planEvaluacionId) return null;
    const planEvaluacion = await this.evaluaciones.porId(planEvaluacionId);
    if (!planEvaluacion) return null;
    const planMedicion = await this.mediciones.porId(planEvaluacion.planMedicionId);
    if (!planMedicion) return null;
    return Math.round(porcentajeDeMeta(planMedicion.meta));
  }
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts`
Expected: PASS, todos los tests del archivo (existentes y nuevos).

- [ ] **Step 5: Verificar que compila el módulo completo**

Run: `cd apps/api && npx tsc --noEmit`
Expected: FAIL todavía — `acta-aprobacion.repository.ts` (Task 5) sigue implementando la firma vieja de `cambiarEstado` y no selecciona las columnas snapshot. Confirmar que el único error restante está en ese archivo antes de continuar.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/gestionar-actas.spec.ts
git commit -m "feat(actas): congelar acciones al aprobar y leer desde snapshot (RNF24, RF-AC-018/019)"
```

---

### Task 5: `acta-aprobacion.repository.ts` — persistir y leer el snapshot

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts`
- Test: `apps/api/test/integration/acta-aprobacion.int.spec.ts`

**Interfaces:**
- Consumes: `SnapshotAccionActa` (Task 3), columnas nuevas de `AccionActa` (Task 1).
- Produces: `ActaAprobacionRepositoryPrisma` implementando la firma nueva de `RepositorioActaAprobacionPort` (Task 3) por completo. Cierra el fallo de compilación que Task 4 dejó pendiente.

- [ ] **Step 1: Leer el archivo de test de integración existente**

Abrir `apps/api/test/integration/acta-aprobacion.int.spec.ts` y localizar su patrón de arranque (Testcontainers, `beforeAll`/`afterAll`, cómo crea una carrera/acta de prueba) — el test nuevo de este Step debe seguir exactamente ese mismo patrón, no uno inventado. Agregar al final del archivo (dentro del `describe` de nivel superior que ya exista, o en uno nuevo si el archivo los separa por método):

```typescript
describe('cambiarEstado — snapshot al aprobar (RNF24)', () => {
  it('escribe las columnas *Snapshot y las relee tal cual quedaron', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const creada = await repo.crear(nuevaActaDePrueba());
    await prisma.accionActa.create({
      data: {
        actaId: creada.id,
        planMejoraId: crypto.randomUUID(),
        aspecto: 'CRITERIO_ACREDITACION',
        orden: 0,
      },
    });
    const [vinculo] = await repo.accionesDe(creada.id);

    await repo.cambiarEstado(creada.id, 'Aprobada', {
      aprobacion: { actorId: crypto.randomUUID(), fecha: new Date('2026-09-20T12:00:00Z') },
      snapshots: [
        {
          accionActaId: vinculo!.id,
          codigo: 'CA-01',
          nombre: 'Nombre congelado',
          plazo: new Date('2026-12-01'),
          recursos: 'recursos congelados',
          metas: 'metas congeladas',
          responsable: 'responsable congelado',
          metaCompetenciaSnapshot: null,
        },
      ],
    });

    const [releido] = await repo.accionesDe(creada.id);
    expect(releido?.codigoSnapshot).toBe('CA-01');
    expect(releido?.nombreSnapshot).toBe('Nombre congelado');
    expect(releido?.responsableSnapshot).toBe('responsable congelado');
  });

  it('una transición sin snapshots (rechazar) no toca las columnas snapshot existentes', async () => {
    const repo = new ActaAprobacionRepositoryPrisma(prisma);
    const creada = await repo.crear(nuevaActaDePrueba());
    await prisma.accionActa.create({
      data: {
        actaId: creada.id,
        planMejoraId: crypto.randomUUID(),
        aspecto: 'CRITERIO_ACREDITACION',
        orden: 0,
        nombreSnapshot: 'Ya estaba congelado',
      },
    });

    await repo.cambiarEstado(creada.id, 'Borrador');

    const [vinculo] = await repo.accionesDe(creada.id);
    expect(vinculo?.nombreSnapshot).toBe('Ya estaba congelado');
  });
});
```

Si el archivo no tiene ya un helper `nuevaActaDePrueba()` (o equivalente para construir el `NuevaActa` mínimo que `crear` necesita), usar el que exista con ese propósito — no crear uno paralelo. Si no existe ninguno, mirar cómo el `describe('crear', ...)` del propio archivo arma sus datos de prueba y replicar esa forma inline.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run apps/api/test/integration/acta-aprobacion.int.spec.ts` (o el comando que el `package.json` de `apps/api` use para integración — revisar `package.json` si `vitest run` no encuentra el archivo por su patrón de `include`).
Expected: FAIL — de compilación (la firma de `cambiarEstado` todavía es la vieja) o de aserción (`codigoSnapshot`/`nombreSnapshot` vienen `null`).

- [ ] **Step 3: Implementar**

En `acta-aprobacion.repository.ts`, agregar los campos snapshot a `SELECCION_ACCION` — el archivo no tiene hoy una constante de selección para `AccionActa` porque `accionesDe` selecciona inline; extraerla a una constante nombrada al agregar los seis campos nuevos, para no repetir la lista dos veces (aquí y en el `interface Fila` correspondiente):

```typescript
const SELECCION_ACCION = {
  id: true,
  planMejoraId: true,
  aspecto: true,
  incluida: true,
  porcentajeMedicionCompetencia: true,
  orden: true,
  codigoSnapshot: true,
  nombreSnapshot: true,
  plazoSnapshot: true,
  recursosSnapshot: true,
  metasSnapshot: true,
  responsableSnapshot: true,
  metaCompetenciaSnapshot: true,
} as const;

interface FilaAccion {
  id: string;
  planMejoraId: string;
  aspecto: AspectoPlanMejora;
  incluida: boolean;
  porcentajeMedicionCompetencia: number | null;
  orden: number;
  codigoSnapshot: string | null;
  nombreSnapshot: string | null;
  plazoSnapshot: Date | null;
  recursosSnapshot: string | null;
  metasSnapshot: string | null;
  responsableSnapshot: string | null;
  metaCompetenciaSnapshot: number | null;
}

function aAccion(fila: FilaAccion): AccionActaDato {
  return {
    id: fila.id,
    planMejoraId: fila.planMejoraId,
    aspecto: fila.aspecto,
    incluida: fila.incluida,
    porcentajeMedicionCompetencia: fila.porcentajeMedicionCompetencia,
    orden: fila.orden,
    codigoSnapshot: fila.codigoSnapshot,
    nombreSnapshot: fila.nombreSnapshot,
    plazoSnapshot: fila.plazoSnapshot,
    recursosSnapshot: fila.recursosSnapshot,
    metasSnapshot: fila.metasSnapshot,
    responsableSnapshot: fila.responsableSnapshot,
    metaCompetenciaSnapshot: fila.metaCompetenciaSnapshot,
  };
}
```

Agregar `import type { AspectoPlanMejora } from '../../../mejora/application/ports/plan-mejora.port.js';` y `import type { SnapshotAccionActa } from '../../application/ports/acta-aprobacion.port.js';` (junto al resto de imports de tipo del archivo, extendiendo el `import type { ... } from '../../application/ports/acta-aprobacion.port.js'` que ya existe en vez de duplicarlo).

Reemplazar el método `accionesDe` completo por:

```typescript
  async accionesDe(actaId: string): Promise<AccionActaDato[]> {
    const filas = await this.prisma.accionActa.findMany({
      where: { actaId },
      select: SELECCION_ACCION,
      orderBy: [{ aspecto: 'asc' }, { orden: 'asc' }],
    });
    return filas.map(aAccion);
  }
```

Reemplazar el método `cambiarEstado` completo por:

```typescript
  /** RF-AC-013. `opciones.snapshots` solo llega al aprobar (Task 4). */
  async cambiarEstado(
    id: string,
    estado: EstadoActa,
    opciones?: {
      readonly aprobacion?: { readonly actorId: string; readonly fecha: Date };
      readonly snapshots?: readonly SnapshotAccionActa[];
    },
  ): Promise<DatosActa> {
    await this.prisma.$transaction([
      this.prisma.actaAprobacion.update({
        where: { id },
        data: {
          estado: A_BD[estado],
          // RF-AC-014 RN2: solo se escriben cuando llegan — una transición
          // posterior (rechazar, por ejemplo) no debe borrar quién aprobó ni cuándo.
          ...(opciones?.aprobacion
            ? { aprobadoPorId: opciones.aprobacion.actorId, aprobadoEn: opciones.aprobacion.fecha }
            : {}),
        },
      }),
      // RNF24: cada snapshot se escribe en la fila de `AccionActa` que le
      // corresponde. `updateMany` con un `where` de un solo id, no `update`,
      // porque `$transaction` con un arreglo de promesas no puede mezclar el
      // resultado tipado de `update` con el de `updateMany` en el mismo
      // arreglo sin perder el tipo de la primera — y aquí no se necesita el
      // resultado de ninguna de las dos, solo que las dos ejecuten.
      ...(opciones?.snapshots ?? []).map((s) =>
        this.prisma.accionActa.updateMany({
          where: { id: s.accionActaId },
          data: {
            codigoSnapshot: s.codigo,
            nombreSnapshot: s.nombre,
            plazoSnapshot: s.plazo,
            recursosSnapshot: s.recursos,
            metasSnapshot: s.metas,
            responsableSnapshot: s.responsable,
            metaCompetenciaSnapshot: s.metaCompetenciaSnapshot,
          },
        }),
      ),
    ]);
    return this.exigir(id);
  }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx vitest run apps/api/test/integration/acta-aprobacion.int.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que todo el módulo compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores — Task 3, 4 y 5 ya cierran el ciclo completo del puerto.

- [ ] **Step 6: Correr toda la suite de `actas` para descartar regresiones**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas`
Expected: todos los tests en verde.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/acta-aprobacion.repository.ts apps/api/test/integration/acta-aprobacion.int.spec.ts
git commit -m "feat(actas): repositorio Prisma persiste y lee el snapshot de acciones (RNF24)"
```

---

### Task 6: `armar-acta-para-documento.ts` — modelo de contenido, puro

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.spec.ts`

**Interfaces:**
- Consumes: nada de otro archivo de este plan — recibe datos ya planos (`DatosParaActaDocumento`), no importa `DatosActa`/`AccionDelActa` de la capa de aplicación para no acoplar el dominio a ella.
- Produces: `ActaParaDocumento`, `FilaAccionDocumento`, `FilaCompetenciaDocumento`, `armarActaParaDocumento(datos: DatosParaActaDocumento): ActaParaDocumento`. Consumido por Task 8/9 (PDFKit) y Task 10/11 (ExcelJS) — ninguno de los dos sabe leer `DatosActa` directamente, solo `ActaParaDocumento`.

Archivo puro: nada de NestJS, Prisma, `pdfkit` ni `exceljs`. Usa `node:crypto` (`createHash`) para el código de verificación — es una utilidad determinista de la librería estándar, no una dependencia de infraestructura; no dispara I/O ni conoce ningún framework.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// apps/api/src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.spec.ts

import { describe, expect, it } from 'vitest';

import { armarActaParaDocumento, type DatosParaActaDocumento } from './armar-acta-para-documento.js';

function datos(sobre: Partial<DatosParaActaDocumento> = {}): DatosParaActaDocumento {
  return {
    acta: {
      id: 'acta-1',
      correlativo: 2,
      codigo: 'ACTA N° 002 – EAP-ISI',
      titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
      objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
      periodoAcademico: '2025-10',
      convocadaPor: 'Directora de Escuela',
      fechaReunion: new Date('2026-03-09'),
      lugarReunion: 'Sala de reuniones',
      lugarEmision: 'Huancayo',
      fechaEmision: new Date('2026-03-20'),
      aprobadoEn: new Date('2026-03-15T10:00:00Z'),
      textoIntroduccion: 'Se deja constancia de la revisión.',
      textoAcuerdoCierre: 'Se resuelve aprobar las acciones.',
      asistentes: [{ nombre: 'Ana Pérez' }, { nombre: 'Luis Gómez' }],
      ...sobre.acta,
    },
    acciones: sobre.acciones ?? [],
    generadoEn: sobre.generadoEn ?? new Date('2026-09-20T15:00:00Z'),
  };
}

function accion(
  aspecto: 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA',
  sobre: Partial<DatosParaActaDocumento['acciones'][number]> = {},
): DatosParaActaDocumento['acciones'][number] {
  return {
    id: 'aa-1',
    incluida: true,
    orden: 0,
    porcentajeMedicionCompetencia: null,
    metaCompetenciaSnapshot: null,
    plan: {
      id: 'plan-1',
      codigo: 'CA-01',
      aspecto,
      nombre: 'Reforzar bibliografía',
      plazo: new Date('2026-12-01'),
      recursos: 'Presupuesto adicional',
      metas: 'Elevar el indicador',
      responsable: 'Coordinación académica',
    },
    ...sobre,
  };
}

describe('armarActaParaDocumento', () => {
  it('arma la cabecera y el acuerdo desde los datos del acta', () => {
    const resultado = armarActaParaDocumento(datos());

    expect(resultado.numeroActa).toBe('ACTA N° 002 – EAP-ISI');
    expect(resultado.cabecera.convocadaPor).toBe('Directora de Escuela');
    expect(resultado.acuerdo).toBe('Se deja constancia de la revisión.');
    expect(resultado.asistentes).toEqual(['Ana Pérez', 'Luis Gómez']);
  });

  it('agrupa las acciones incluidas por aspecto, en tres listas separadas', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('CRITERIO_ACREDITACION', { id: 'aa-1' }),
          accion('OBJETIVO_EDUCACIONAL', { id: 'aa-2' }),
          accion('COMPETENCIA', { id: 'aa-3' }),
        ],
      }),
    );

    expect(resultado.criterios).toHaveLength(1);
    expect(resultado.objetivos).toHaveLength(1);
    expect(resultado.competencias).toHaveLength(1);
  });

  it('descarta las acciones no incluidas', () => {
    const resultado = armarActaParaDocumento(
      datos({ acciones: [accion('CRITERIO_ACREDITACION', { incluida: false })] }),
    );

    expect(resultado.criterios).toHaveLength(0);
    expect(resultado.resumen.total).toBe(0);
  });

  it('RF-AC-010: LOGRADO cuando el resultado alcanza la meta congelada', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('COMPETENCIA', { porcentajeMedicionCompetencia: 75, metaCompetenciaSnapshot: 70 }),
        ],
      }),
    );

    expect(resultado.competencias[0]?.logrado).toBe(true);
    expect(resultado.competencias[0]?.resultado).toBe(75);
    expect(resultado.competencias[0]?.meta).toBe(70);
  });

  it('NO LOGRADO cuando el resultado no alcanza la meta congelada', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('COMPETENCIA', { porcentajeMedicionCompetencia: 60, metaCompetenciaSnapshot: 70 }),
        ],
      }),
    );

    expect(resultado.competencias[0]?.logrado).toBe(false);
  });

  it('sin resultado o sin meta, logrado queda indeterminado (null), no false', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('COMPETENCIA', { porcentajeMedicionCompetencia: null, metaCompetenciaSnapshot: null }),
        ],
      }),
    );

    expect(resultado.competencias[0]?.logrado).toBeNull();
  });

  it('el resumen cuenta cada aspecto y el total', () => {
    const resultado = armarActaParaDocumento(
      datos({
        acciones: [
          accion('CRITERIO_ACREDITACION', { id: 'aa-1' }),
          accion('CRITERIO_ACREDITACION', { id: 'aa-2' }),
          accion('OBJETIVO_EDUCACIONAL', { id: 'aa-3' }),
        ],
      }),
    );

    expect(resultado.resumen).toEqual({ criterios: 2, objetivos: 1, competencias: 0, total: 3 });
  });

  it('sin lugar o fecha de emisión, ciudadYFecha es null', () => {
    const resultado = armarActaParaDocumento(
      datos({ acta: { ...datos().acta, lugarEmision: null, fechaEmision: null } }),
    );

    expect(resultado.ciudadYFecha).toBeNull();
  });

  it('el código de verificación es estable para los mismos datos y cambia si cambia el acta', () => {
    const a = armarActaParaDocumento(datos());
    const b = armarActaParaDocumento(datos());
    const c = armarActaParaDocumento(datos({ acta: { ...datos().acta, id: 'acta-2' } }));

    expect(a.codigoVerificacion).toBe(b.codigoVerificacion);
    expect(a.codigoVerificacion).not.toBe(c.codigoVerificacion);
    expect(a.codigoVerificacion).toMatch(/^[0-9a-f]{12}$/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.spec.ts`
Expected: FAIL — `Cannot find module './armar-acta-para-documento.js'`.

- [ ] **Step 3: Implementar**

```typescript
// apps/api/src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.ts

/**
 * Qué dice el documento del Acta de Aprobación (RF-AC-018/019). Archivo
 * puro: no importa NestJS, Prisma, `pdfkit` ni `exceljs` — eso vive en
 * `infrastructure/documentos/` (Tasks 8-11), que consume `ActaParaDocumento`
 * sin saber de dónde salió.
 *
 * No importa `DatosActa`/`AccionDelActa` de `application/` a propósito:
 * recibe su propio tipo de entrada (`DatosParaActaDocumento`), ya plano —
 * mismo criterio que `armar-documento-mejora.ts` con `DatosParaDocumentoMejora`.
 *
 * Sin sección de firma (decisión del usuario, ver el plan 2026-09-20) y sin
 * columna "Cargo/rol" de asistentes (RF-AC-005 nunca la pidió).
 */

import { createHash } from 'node:crypto';

export type AspectoAccionDocumento = 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';

export interface FilaAccionDocumento {
  readonly codigo: string;
  readonly nombre: string;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
}

export interface FilaCompetenciaDocumento extends FilaAccionDocumento {
  /** Porcentaje 0-100, o `null` si no hay medición disponible (RF-PJ-028 RN3). */
  readonly resultado: number | null;
  /** La meta contra la que se comparó, congelada al aprobar (0-100). */
  readonly meta: number | null;
  /** `null`, no `false`, cuando falta el resultado o la meta. */
  readonly logrado: boolean | null;
}

export interface ActaParaDocumento {
  readonly numeroActa: string;
  readonly titulo: string;
  readonly periodoAcademico: string;
  readonly cabecera: {
    readonly convocadaPor: string;
    readonly fecha: Date;
    readonly lugar: string;
    readonly periodoAcademico: string;
    readonly objetivo: string;
  };
  readonly asistentes: readonly string[];
  readonly acuerdo: string;
  readonly criterios: readonly FilaAccionDocumento[];
  readonly objetivos: readonly FilaAccionDocumento[];
  readonly competencias: readonly FilaCompetenciaDocumento[];
  readonly resumen: {
    readonly criterios: number;
    readonly objetivos: number;
    readonly competencias: number;
    readonly total: number;
  };
  readonly constanciaYResolucion: string;
  readonly ciudadYFecha: { readonly lugar: string; readonly fecha: Date } | null;
  readonly codigoVerificacion: string;
  readonly generadoEn: Date;
}

/** Exportado: Task 12 (`GenerarDocumentoActa`) construye este tipo directamente desde los puertos, sin pasar por `GestionarActas`. */
export interface AccionParaDocumento {
  readonly incluida: boolean;
  readonly porcentajeMedicionCompetencia: number | null;
  readonly metaCompetenciaSnapshot: number | null;
  readonly plan: {
    readonly codigo: string;
    readonly aspecto: AspectoAccionDocumento;
    readonly nombre: string;
    readonly plazo: Date;
    readonly recursos: string;
    readonly metas: string;
    readonly responsable: string;
  };
}

export interface DatosParaActaDocumento {
  readonly acta: {
    readonly id: string;
    readonly correlativo: number;
    readonly codigo: string;
    readonly titulo: string;
    readonly objetivo: string;
    readonly periodoAcademico: string;
    readonly convocadaPor: string;
    readonly fechaReunion: Date;
    readonly lugarReunion: string;
    readonly lugarEmision: string | null;
    readonly fechaEmision: Date | null;
    readonly aprobadoEn: Date | null;
    readonly textoIntroduccion: string;
    readonly textoAcuerdoCierre: string;
    readonly asistentes: readonly { readonly nombre: string }[];
  };
  readonly acciones: readonly AccionParaDocumento[];
  readonly generadoEn: Date;
}

export function armarActaParaDocumento(datos: DatosParaActaDocumento): ActaParaDocumento {
  const incluidas = datos.acciones.filter((a) => a.incluida);
  const criterios = incluidas
    .filter((a) => a.plan.aspecto === 'CRITERIO_ACREDITACION')
    .map(aFilaAccion);
  const objetivos = incluidas
    .filter((a) => a.plan.aspecto === 'OBJETIVO_EDUCACIONAL')
    .map(aFilaAccion);
  const competencias = incluidas
    .filter((a) => a.plan.aspecto === 'COMPETENCIA')
    .map(aFilaCompetencia);

  return {
    numeroActa: datos.acta.codigo,
    titulo: datos.acta.titulo,
    periodoAcademico: datos.acta.periodoAcademico,
    cabecera: {
      convocadaPor: datos.acta.convocadaPor,
      fecha: datos.acta.fechaReunion,
      lugar: datos.acta.lugarReunion,
      periodoAcademico: datos.acta.periodoAcademico,
      objetivo: datos.acta.objetivo,
    },
    asistentes: datos.acta.asistentes.map((a) => a.nombre),
    acuerdo: datos.acta.textoIntroduccion,
    criterios,
    objetivos,
    competencias,
    resumen: {
      criterios: criterios.length,
      objetivos: objetivos.length,
      competencias: competencias.length,
      total: criterios.length + objetivos.length + competencias.length,
    },
    constanciaYResolucion: datos.acta.textoAcuerdoCierre,
    ciudadYFecha:
      datos.acta.lugarEmision !== null && datos.acta.fechaEmision !== null
        ? { lugar: datos.acta.lugarEmision, fecha: datos.acta.fechaEmision }
        : null,
    codigoVerificacion: codigoDeVerificacion(
      datos.acta.id,
      datos.acta.correlativo,
      datos.acta.aprobadoEn,
    ),
    generadoEn: datos.generadoEn,
  };
}

function aFilaAccion(a: AccionParaDocumento): FilaAccionDocumento {
  return {
    codigo: a.plan.codigo,
    nombre: a.plan.nombre,
    plazo: a.plan.plazo,
    recursos: a.plan.recursos,
    metas: a.plan.metas,
    responsable: a.plan.responsable,
  };
}

function aFilaCompetencia(a: AccionParaDocumento): FilaCompetenciaDocumento {
  const resultado = a.porcentajeMedicionCompetencia;
  const meta = a.metaCompetenciaSnapshot;
  return {
    ...aFilaAccion(a),
    resultado,
    meta,
    logrado: resultado === null || meta === null ? null : resultado >= meta,
  };
}

/**
 * §6 de la especificación: hash corto de "id + versión + fecha de
 * aprobación". Este modelo no tiene un campo `version` propio (a diferencia
 * de `PlanMejora`/`PlanMedicion`), así que se usa `correlativo` — es lo que
 * de verdad identifica a esta acta dentro de su carrera de forma estable.
 * `aprobadoEn` puede ser `null` solo en teoría (una acta llega aquí siempre
 * Aprobada en adelante); se usa el epoch como respaldo determinista en vez
 * de lanzar, porque un código de verificación nunca debe ser la causa de
 * que la exportación falle.
 */
function codigoDeVerificacion(id: string, correlativo: number, aprobadoEn: Date | null): string {
  const material = `${id}:${correlativo}:${(aprobadoEn ?? new Date(0)).toISOString()}`;
  return createHash('sha256').update(material).digest('hex').slice(0, 12);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.spec.ts`
Expected: PASS, los diez tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.ts apps/api/src/modules/mejora-continua/actas/domain/documentos/armar-acta-para-documento.spec.ts
git commit -m "feat(actas): armarActaParaDocumento, modelo de contenido puro (RF-AC-018/019)"
```

---

### Task 7: `documentos-acta.port.ts` — puertos de generación y renderizado

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/application/ports/documentos-acta.port.ts`

**Interfaces:**
- Consumes: `ActaParaDocumento` de `../../domain/documentos/armar-acta-para-documento.js` (Task 6).
- Produces: `TipoDocActa`, `EstadoDocActa`, `TrabajoDocumentoActa`, `RepositorioDocumentosActaPort`, `RenderizadorPdfActaPort`, `RenderizadorExcelActaPort`. Consumido por Task 8-11 (renderers), Task 12 (caso de uso), Task 13 (repositorio Prisma), Task 15 (controller), Task 14/16 (wiring).

Sin test propio — mismo criterio que Task 3, es un archivo de tipos.

- [ ] **Step 1: Crear el archivo**

```typescript
// apps/api/src/modules/mejora-continua/actas/application/ports/documentos-acta.port.ts

/**
 * Contratos de generación de documentos del acta de aprobación (RF-AC-018,
 * RF-AC-019). Calca `documentos-mejora.port.ts` a propósito — mismo
 * concepto, mismo ciclo de vida de trabajo — con dos diferencias:
 *
 *   - `RenderizadorPdfActaPort`/`RenderizadorExcelActaPort` reciben
 *     `ActaParaDocumento`, no el `Documento` genérico de `platform/`: el
 *     renderizado del acta es específico del módulo (Opción B del plan
 *     2026-09-20 — el modelo `Documento` compartido es deliberadamente
 *     pobre y no alcanza para la cabecera en 3 zonas, las barras de
 *     sección con color, el zebra ni las fórmulas de Excel que pide RF-AC-018).
 *   - No hay puerto de "datos del documento" aparte: `GenerarDocumentoActa`
 *     llama directamente a `GestionarActas.obtenerContenido` y a
 *     `armarActaParaDocumento`, igual que su gemelo de Mejora lee
 *     `RepositorioPlanMejoraPort` directo.
 */

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';

export type TipoDocActa = 'ACTA_PDF' | 'ACTA_EXCEL';

/** El estado viaja en el vocabulario del dominio, no en el enum de la base. */
export type EstadoDocActa = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

export interface TrabajoDocumentoActa {
  readonly id: string;
  readonly actaId: string;
  readonly tipo: TipoDocActa;
  readonly estado: EstadoDocActa;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosActaPort {
  crear(datos: { actaId: string; tipo: TipoDocActa; solicitadoPor: string }): Promise<TrabajoDocumentoActa>;
  porId(id: string): Promise<TrabajoDocumentoActa | null>;
  listarDeActa(actaId: string, limite: number): Promise<TrabajoDocumentoActa[]>;
  marcarGenerando(id: string): Promise<void>;
  marcarListo(
    id: string,
    archivo: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void>;
  marcarFallido(id: string, error: string): Promise<void>;
  ubicacionDe(id: string): Promise<string | null>;
}

export interface RenderizadorPdfActaPort {
  render(acta: ActaParaDocumento): Promise<Buffer>;
}

export interface RenderizadorExcelActaPort {
  render(acta: ActaParaDocumento): Promise<Buffer>;
}

export const REPOSITORIO_DOCUMENTOS_ACTA = Symbol('RepositorioDocumentosActaPort');
export const RENDERIZADOR_PDF_ACTA = Symbol('RenderizadorPdfActaPort');
export const RENDERIZADOR_EXCEL_ACTA = Symbol('RenderizadorExcelActaPort');
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores nuevos (este archivo todavía no lo importa nadie).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/ports/documentos-acta.port.ts
git commit -m "feat(actas): puertos de generacion de documentos del acta (RF-AC-018/019)"
```

---

### Task 8: `pdfkit-acta.renderer.ts` — marco de página, cabecera y pie

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts`

**Interfaces:**
- Consumes: `ActaParaDocumento` (Task 6), `RenderizadorPdfActaPort` (Task 7).
- Produces: `RenderizadorPdfActaKit implements RenderizadorPdfActaPort`, y las funciones/constantes internas `mm`, `COLOR`, `dibujarCabeceraInstitucional`, `dibujarPie` — exportadas solo para que Task 9 las reutilice desde el mismo archivo (no hace falta un archivo de helpers aparte: es un único renderer, igual que `pdfkit.renderer.ts` no separa sus helpers de dibujo en otro archivo).

Este Task deja el `render()` produciendo solo el marco (cabecera + pie, página en blanco) — Task 9 rellena el cuerpo (secciones I-VII). Se divide así porque el marco es lo que se repite en cada página y merece su propia verificación antes de complicar la prueba con contenido real.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts

import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import { RenderizadorPdfActaKit } from './pdfkit-acta.renderer.js';

function acta(sobre: Partial<ActaParaDocumento> = {}): ActaParaDocumento {
  return {
    numeroActa: 'ACTA N° 002 – EAP-ISI',
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    periodoAcademico: '2025-10',
    cabecera: {
      convocadaPor: 'Directora de Escuela',
      fecha: new Date('2026-03-09'),
      lugar: 'Sala de reuniones',
      periodoAcademico: '2025-10',
      objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    },
    asistentes: ['Ana Pérez'],
    acuerdo: 'Se deja constancia de la revisión.',
    criterios: [],
    objetivos: [],
    competencias: [],
    resumen: { criterios: 0, objetivos: 0, competencias: 0, total: 0 },
    constanciaYResolucion: 'Se resuelve aprobar las acciones.',
    ciudadYFecha: { lugar: 'Huancayo', fecha: new Date('2026-03-20') },
    codigoVerificacion: 'abc123def456',
    generadoEn: new Date('2026-09-20T15:00:00Z'),
    ...sobre,
  };
}

/** Mismo extractor que `renderizadores.spec.ts` (platform/documentos) — ver su comentario para el porqué de cada paso. */
function textoDelPdf(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const piezas: string[] = [];
  for (const bloque of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const datos = Buffer.from(bloque[1] ?? '', 'latin1');
    let contenido: string;
    try {
      contenido = inflateSync(datos).toString('latin1');
    } catch {
      continue;
    }
    for (const cadena of contenido.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      piezas.push(Buffer.from(cadena[1] ?? '', 'hex').toString('latin1'));
    }
  }
  return piezas.join('');
}

describe('RenderizadorPdfActaKit', () => {
  it('produce un PDF válido en A4 horizontal', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // A4 horizontal en puntos: 841.89 x 595.28. PDFKit lo declara en el
    // MediaBox de cada página.
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+841\.89\s+595\.28\s*\]/);
  });

  it('la cabecera institucional aparece en la primera página', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta());
    const texto = textoDelPdf(pdf);
    expect(texto).toContain('UNIVERSIDAD CONTINENTAL');
    expect(texto).toContain('SISTEMA DE GESTIÓN DE LA CALIDAD');
    expect(texto).toContain('ACTA N° 002');
  });

  it('el pie lleva el código de verificación y la paginación', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta());
    const texto = textoDelPdf(pdf);
    expect(texto).toContain('abc123def456');
    expect(texto).toContain('Página 1 de');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts`
Expected: FAIL — `Cannot find module './pdfkit-acta.renderer.js'`.

- [ ] **Step 3: Implementar el marco**

```typescript
// apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.ts

/**
 * Renderizador PDF del Acta de Aprobación (RF-AC-018/019), con PDFKit
 * directo — no pasa por el `Documento` genérico de `platform/documentos/`
 * (Opción B, ver el plan 2026-09-20: ese modelo es deliberadamente pobre y
 * no alcanza para la cabecera en 3 zonas, las barras de sección con color,
 * el zebra ni los bloques que no se parten entre páginas que pide la
 * especificación institucional del acta).
 *
 * A4 horizontal, no vertical como el resto de documentos del proyecto: la
 * especificación (`d:\Descargas\ESPEC_Exportacion_Acta_Plan_de_Mejora.md`
 * §2) lo pide así porque las tablas de acciones tienen muchas columnas.
 */

import PDFDocument from 'pdfkit';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import type { RenderizadorPdfActaPort } from '../../application/ports/documentos-acta.port.js';

/** 1 mm en puntos PDF (1 pt = 1/72 in, 1 in = 25.4 mm). */
function mm(valor: number): number {
  return (valor / 25.4) * 72;
}

const MARGEN = mm(14);
const ALTO_CABECERA = mm(22);
const ALTO_PIE = mm(10);

/** Colores reales del proyecto — ver §"Decisiones de arquitectura" del plan. */
const COLOR = {
  navy: '#57019f',
  blue: '#6802c1',
  light: '#e9e1fb',
  zebra: '#f7f5fb',
  grid: '#e2e1ea',
  okBg: '#e7f6ee',
  okFg: '#157d4c',
  koBg: '#fef3f2',
  koFg: '#b42318',
  muted: '#565269',
  blanco: '#ffffff',
  texto: '#1a1526',
} as const;

export class RenderizadorPdfActaKit implements RenderizadorPdfActaPort {
  async render(acta: ActaParaDocumento): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: MARGEN + ALTO_CABECERA, bottom: MARGEN + ALTO_PIE, left: MARGEN, right: MARGEN },
      bufferPages: true,
      info: { Title: acta.titulo, Subject: acta.numeroActa },
    });

    const partes: Buffer[] = [];
    const terminado = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (parte: Buffer) => partes.push(parte));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);
    });

    // La cabecera se redibuja en cada página nueva, incluida la primera:
    // `pageAdded` no dispara para la página inicial que el constructor ya
    // creó, así que se llama una vez a mano antes de empezar a escribir.
    doc.on('pageAdded', () => dibujarCabeceraInstitucional(doc, acta));
    dibujarCabeceraInstitucional(doc, acta);

    // El cuerpo se agrega en Task 9. Por ahora el documento solo tiene el
    // marco — suficiente para que este Task quede verde por sí solo.

    dibujarPieEnTodasLasPaginas(doc, acta.codigoVerificacion, acta.generadoEn);

    doc.end();
    return terminado;
  }
}

/**
 * Caja de 3 zonas (§3 de la especificación): logo a la izquierda, nombre de
 * la institución al centro, control de documento a la derecha. `doc.y` se
 * deja justo debajo de la caja para que el cuerpo empiece ahí.
 */
function dibujarCabeceraInstitucional(doc: PDFKit.PDFDocument, acta: ActaParaDocumento): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const y = MARGEN;

  doc.save();
  doc.lineWidth(1).strokeColor(COLOR.navy).rect(MARGEN, y, anchoUtil, ALTO_CABECERA).stroke();

  const anchoLogo = mm(45);
  const anchoControl = mm(58);
  const anchoCentro = anchoUtil - anchoLogo - anchoControl;

  // Zona izquierda: recuadro punteado "LOGO INSTITUCIONAL" — no hay logo
  // configurado en este ciclo (§3: "configurable en el sistema; si no hay,
  // recuadro punteado").
  doc
    .dash(3, { space: 2 })
    .rect(MARGEN + mm(2), y + mm(2), anchoLogo - mm(4), ALTO_CABECERA - mm(4))
    .stroke(COLOR.grid)
    .undash();
  doc
    .fontSize(6)
    .fillColor(COLOR.muted)
    .text('LOGO INSTITUCIONAL', MARGEN + mm(2), y + ALTO_CABECERA / 2 - 3, {
      width: anchoLogo - mm(4),
      align: 'center',
    });

  // Zona centro.
  const xCentro = MARGEN + anchoLogo;
  doc
    .fontSize(12)
    .fillColor(COLOR.texto)
    .font('Helvetica-Bold')
    .text('UNIVERSIDAD CONTINENTAL', xCentro, y + mm(2), { width: anchoCentro, align: 'center' });
  doc
    .fontSize(8.5)
    .text('FACULTAD DE INGENIERÍA', xCentro, y + mm(9), { width: anchoCentro, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(acta.titulo, xCentro, y + mm(13.5), { width: anchoCentro, align: 'center' });
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLOR.blue)
    .text('SISTEMA DE GESTIÓN DE LA CALIDAD', xCentro, y + mm(18), {
      width: anchoCentro,
      align: 'center',
    });

  // Zona derecha: control de documento.
  const xControl = MARGEN + anchoLogo + anchoCentro;
  const filas: [string, string][] = [
    ['Código', acta.numeroActa],
    ['Versión', '1'],
    ['Fecha', formatearFecha(acta.generadoEn)],
  ];
  let yFila = y + mm(1);
  const altoFila = (ALTO_CABECERA - mm(2)) / (filas.length + 1);
  for (const [etiqueta, valor] of filas) {
    doc.rect(xControl, yFila, mm(20), altoFila).fill(COLOR.light);
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text(etiqueta, xControl + 2, yFila + 2, { width: mm(20) - 4 });
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .text(valor, xControl + mm(20), yFila + 2, { width: anchoControl - mm(20) - 2 });
    yFila += altoFila;
  }
  doc.rect(xControl, yFila, mm(20), altoFila).fill(COLOR.light);
  doc
    .fillColor(COLOR.texto)
    .font('Helvetica-Bold')
    .fontSize(6.5)
    .text('Página', xControl + 2, yFila + 2, { width: mm(20) - 4 });
  // El número de página real se rellena en el pase final de `dibujarPieEnTodasLasPaginas`.

  doc.restore();
  doc.font('Helvetica').fillColor(COLOR.texto);
  doc.y = y + ALTO_CABECERA + mm(3);
}

/**
 * Línea azul + texto mudo, en cada página. La numeración "Página X de Y"
 * necesita saber Y, que no se sabe hasta terminar de escribir — por eso se
 * hace en un segundo pase sobre `doc.bufferedPageRange()`, igual que
 * `pieEnTodasLasPaginas` del renderer genérico (`pdfkit.renderer.ts`).
 */
function dibujarPieEnTodasLasPaginas(
  doc: PDFKit.PDFDocument,
  codigoVerificacion: string,
  generadoEn: Date,
): void {
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    const y = doc.page.height - MARGEN - ALTO_PIE + mm(2);
    const anchoUtil = doc.page.width - MARGEN * 2;

    doc
      .save()
      .lineWidth(0.8)
      .strokeColor(COLOR.blue)
      .moveTo(MARGEN, y)
      .lineTo(MARGEN + anchoUtil, y)
      .stroke()
      .restore();

    doc
      .fontSize(6.8)
      .fillColor(COLOR.muted)
      .text(
        `Documento generado por el Sistema de Gestión de la Calidad · ${formatearFechaHora(generadoEn)} · Código de verificación: ${codigoVerificacion}`,
        MARGEN,
        y + 2,
        { width: anchoUtil * 0.7 },
      );
    doc.text(`Página ${i + 1} de ${rango.count}`, MARGEN + anchoUtil * 0.7, y + 2, {
      width: anchoUtil * 0.3,
      align: 'right',
    });
  }
}

/** dd/mm/aaaa — §6 de la especificación. */
function formatearFecha(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  const mmv = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mmv}/${fecha.getUTCFullYear()}`;
}

function formatearFechaHora(fecha: Date): string {
  return `${formatearFecha(fecha)} ${String(fecha.getUTCHours()).padStart(2, '0')}:${String(fecha.getUTCMinutes()).padStart(2, '0')} UTC`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts`
Expected: PASS, los tres tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.ts apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts
git commit -m "feat(actas): marco PDF del acta — cabecera de 3 zonas y pie (RF-AC-019)"
```

---

### Task 9: `pdfkit-acta.renderer.ts` — cuerpo completo (secciones I a VII)

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts`

**Interfaces:**
- Consumes: todos los campos de `ActaParaDocumento` (Task 6).
- Produces: el `render()` de Task 8 ahora escribe el cuerpo completo. No agrega ningún export nuevo que otra tarea consuma — es la última tarea sobre este archivo.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al `describe('RenderizadorPdfActaKit', ...)` existente:

```typescript
  it('escribe las siete secciones con numeración romana', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({
        criterios: [
          {
            codigo: 'CA-01',
            nombre: 'Reforzar bibliografía',
            plazo: new Date('2026-12-01'),
            recursos: 'Presupuesto adicional',
            metas: 'Elevar el indicador',
            responsable: 'Coordinación académica',
          },
        ],
        competencias: [
          {
            codigo: 'COMP-01',
            nombre: 'Diseñar soluciones',
            plazo: new Date('2026-12-01'),
            recursos: 'Taller adicional',
            metas: 'Elevar el logro',
            responsable: 'Docente responsable',
            resultado: 75,
            meta: 70,
            logrado: true,
          },
        ],
      }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('I.');
    expect(texto).toContain('DATOS DE LA REUNIÓN');
    expect(texto).toContain('II.');
    expect(texto).toContain('ASISTENTES');
    expect(texto).toContain('III.');
    expect(texto).toContain('ACUERDO');
    expect(texto).toContain('IV.');
    expect(texto).toContain('PLAN DE MEJORA APROBADO');
    expect(texto).toContain('V.');
    expect(texto).toContain('RESUMEN');
    expect(texto).toContain('VI.');
    expect(texto).toContain('CONSTANCIA Y RESOLUCIÓN');
  });

  it('las acciones y sus datos aparecen en la tabla de Criterios', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({
        criterios: [
          {
            codigo: 'CA-01',
            nombre: 'Reforzar bibliografía',
            plazo: new Date('2026-12-01'),
            recursos: 'Presupuesto adicional',
            metas: 'Elevar el indicador',
            responsable: 'Coordinación académica',
          },
        ],
      }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('CA-01');
    expect(texto).toContain('Reforzar bibliografía');
    expect(texto).toContain('Coordinación académica');
  });

  it('una sección sin acciones muestra la fila "Sin acciones registradas"', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta({ criterios: [], objetivos: [], competencias: [] }));
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('Sin acciones registradas para este periodo');
  });

  it('LOGRADO y NO LOGRADO aparecen en la tabla de Competencias, según corresponda', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({
        competencias: [
          {
            codigo: 'COMP-01', nombre: 'Lograda', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 80, meta: 70, logrado: true,
          },
          {
            codigo: 'COMP-02', nombre: 'No lograda', plazo: new Date('2026-12-01'),
            recursos: 'r', metas: 'm', responsable: 'x', resultado: 50, meta: 70, logrado: false,
          },
        ],
      }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('LOGRADO');
    expect(texto).toContain('NO LOGRADO');
  });

  it('sin lugar/fecha de emisión, la sección VI no lleva ciudad y fecha', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(acta({ ciudadYFecha: null }));
    const texto = textoDelPdf(pdf);

    expect(texto).not.toContain('Huancayo');
  });

  it('la lista de asistentes aparece completa', async () => {
    const pdf = await new RenderizadorPdfActaKit().render(
      acta({ asistentes: ['Ana Pérez', 'Luis Gómez'] }),
    );
    const texto = textoDelPdf(pdf);

    expect(texto).toContain('Ana Pérez');
    expect(texto).toContain('Luis Gómez');
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts`
Expected: FAIL — el cuerpo todavía no existe, ninguna de las cadenas nuevas aparece.

- [ ] **Step 3: Implementar el cuerpo**

Reemplazar el comentario `// El cuerpo se agrega en Task 9...` de `render()` por:

```typescript
    dibujarCuerpo(doc, acta);
```

Al final del archivo (después de `formatearFechaHora`), agregar todo lo siguiente:

```typescript
function dibujarCuerpo(doc: PDFKit.PDFDocument, acta: ActaParaDocumento): void {
  dibujarBarraDeSeccion(doc, 'I', 'DATOS DE LA REUNIÓN');
  dibujarTablaClaveValor(doc, [
    ['Reunión convocada por', acta.cabecera.convocadaPor],
    ['Fecha', formatearFecha(acta.cabecera.fecha)],
    ['Lugar / modalidad', acta.cabecera.lugar],
    ['Periodo académico', acta.cabecera.periodoAcademico],
    ['Objetivo', acta.cabecera.objetivo],
  ]);

  dibujarBarraDeSeccion(doc, 'II', 'ASISTENTES');
  dibujarTablaAsistentes(doc, acta.asistentes);

  dibujarBarraDeSeccion(doc, 'III', 'ACUERDO');
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto).text(acta.acuerdo, { align: 'justify' });
  doc.moveDown();

  dibujarBarraDeSeccion(doc, 'IV', `PLAN DE MEJORA APROBADO (${acta.resumen.total} acciones)`);
  dibujarSubtabla(doc, `4.1 Criterios de Acreditación (${acta.criterios.length})`, [
    { titulo: 'Código', peso: 16 },
    { titulo: 'Acción de mejora', peso: 62 },
    { titulo: 'Criterio de acreditación', peso: 28 },
    { titulo: 'Plazo', peso: 14 },
    { titulo: 'Recursos necesarios', peso: 24 },
    { titulo: 'Metas establecidas', peso: 40 },
    { titulo: 'Responsable', peso: 26 },
  ], acta.criterios.map((c) => [c.codigo, c.nombre, c.codigo, formatearFecha(c.plazo), c.recursos, c.metas, c.responsable]));

  dibujarSubtabla(doc, `4.2 Objetivos Educacionales (${acta.objetivos.length})`, [
    { titulo: 'Código', peso: 16 },
    { titulo: 'Acción de mejora', peso: 62 },
    { titulo: 'Objetivo educacional', peso: 28 },
    { titulo: 'Plazo', peso: 14 },
    { titulo: 'Recursos necesarios', peso: 24 },
    { titulo: 'Metas establecidas', peso: 40 },
    { titulo: 'Responsable', peso: 26 },
  ], acta.objetivos.map((o) => [o.codigo, o.nombre, o.codigo, formatearFecha(o.plazo), o.recursos, o.metas, o.responsable]));

  dibujarSubtabla(doc, `4.3 Competencias del Perfil de Egreso (${acta.competencias.length})`, [
    { titulo: 'Código', peso: 15 },
    { titulo: 'Competencia', peso: 30 },
    { titulo: 'Acción de mejora', peso: 52 },
    { titulo: 'Resultado', peso: 13 },
    { titulo: 'Estado', peso: 15 },
    { titulo: 'Plazo', peso: 14 },
    { titulo: 'Recursos', peso: 22 },
    { titulo: 'Metas establecidas', peso: 38 },
    { titulo: 'Responsable', peso: 20 },
  ], acta.competencias.map((c) => [
    c.codigo,
    c.codigo,
    c.nombre,
    c.resultado === null ? '—' : `${c.resultado}%`,
    c.logrado === null ? '—' : c.logrado ? 'LOGRADO' : 'NO LOGRADO',
    formatearFecha(c.plazo),
    c.recursos,
    c.metas,
    c.responsable,
  ]), acta.competencias.map((c) => c.logrado));

  dibujarBarraDeSeccion(doc, 'V', 'RESUMEN DEL PLAN DE MEJORA');
  dibujarResumen(doc, acta.resumen);

  dibujarBarraDeSeccion(doc, 'VI', 'CONSTANCIA Y RESOLUCIÓN');
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto).text(acta.constanciaYResolucion, { align: 'justify' });
  doc.moveDown();
  if (acta.ciudadYFecha) {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`${acta.ciudadYFecha.lugar}, ${formatearFecha(acta.ciudadYFecha.fecha)}`, { align: 'right' });
  }
}

function dibujarBarraDeSeccion(doc: PDFKit.PDFDocument, numero: string, titulo: string): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  if (doc.y + mm(9) > doc.page.height - MARGEN - ALTO_PIE) doc.addPage();
  doc.rect(MARGEN, doc.y, anchoUtil, mm(7)).fill(COLOR.navy);
  doc
    .fillColor(COLOR.blanco)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`${numero}. ${titulo}`, MARGEN + 6, doc.y + mm(1.5));
  doc.y += mm(9);
  doc.fillColor(COLOR.texto).font('Helvetica');
}

function dibujarTablaClaveValor(doc: PDFKit.PDFDocument, filas: readonly [string, string][]): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const anchoClave = anchoUtil * 0.25;
  for (const [clave, valor] of filas) {
    const alto = Math.max(mm(6), doc.heightOfString(valor, { width: anchoUtil - anchoClave - 8 }) + 6);
    if (doc.y + alto > doc.page.height - MARGEN - ALTO_PIE) doc.addPage();
    doc.rect(MARGEN, doc.y, anchoClave, alto).fill(COLOR.light);
    doc.rect(MARGEN + anchoClave, doc.y, anchoUtil - anchoClave, alto).stroke(COLOR.grid);
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(clave, MARGEN + 4, doc.y + 3, { width: anchoClave - 8 });
    doc.font('Helvetica').text(valor, MARGEN + anchoClave + 4, doc.y + 3, { width: anchoUtil - anchoClave - 8 });
    doc.y += alto;
  }
  doc.moveDown();
}

function dibujarTablaAsistentes(doc: PDFKit.PDFDocument, asistentes: readonly string[]): void {
  const columnas = [
    { titulo: 'N.º', peso: 8 },
    { titulo: 'Nombres y apellidos', peso: 92 },
  ];
  const filas = asistentes.length > 0 ? asistentes.map((n, i) => [String(i + 1), n]) : [];
  dibujarTabla(doc, columnas, filas, 'Sin asistentes registrados.');
}

interface ColumnaTabla {
  readonly titulo: string;
  readonly peso: number;
}

/**
 * Tabla genérica con cabecera de color, zebra en filas pares, bordes finos
 * y anchos proporcionales al `peso` de cada columna (§5 de la
 * especificación). Repite la fila de cabecera si la tabla se parte entre
 * páginas — sin un `KeepTogether` real de PDFKit, se aproxima reservando
 * el alto de la cabecera antes de decidir si hace falta una página nueva.
 * `coloreado`, si se pasa, tiñe la celda de Estado de cada fila (LOGRADO en
 * verde, NO LOGRADO en rojo) — se asume que esa es siempre la penúltima
 * columna, que es como esta función se llama para 4.3.
 */
function dibujarTabla(
  doc: PDFKit.PDFDocument,
  columnas: readonly ColumnaTabla[],
  filas: readonly string[][],
  siVacia: string,
  coloreado?: readonly (boolean | null)[],
): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const pesoTotal = columnas.reduce((s, c) => s + c.peso, 0);
  const anchos = columnas.map((c) => (c.peso / pesoTotal) * anchoUtil);
  const altoFila = mm(6);

  function dibujarCabecera(): void {
    if (doc.y + altoFila > doc.page.height - MARGEN - ALTO_PIE) doc.addPage();
    let x = MARGEN;
    for (let i = 0; i < columnas.length; i++) {
      doc.rect(x, doc.y, anchos[i]!, altoFila).fill(COLOR.blue);
      doc
        .fillColor(COLOR.blanco)
        .font('Helvetica-Bold')
        .fontSize(7.8)
        .text(columnas[i]!.titulo, x + 2, doc.y + 2, { width: anchos[i]! - 4 });
      x += anchos[i]!;
    }
    doc.y += altoFila;
    doc.fillColor(COLOR.texto).font('Helvetica');
  }

  dibujarCabecera();

  if (filas.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted).text(siVacia, MARGEN + 4, doc.y + 4);
    doc.y += mm(8);
    doc.fillColor(COLOR.texto);
    doc.moveDown();
    return;
  }

  filas.forEach((fila, indiceFila) => {
    const alturas = fila.map((celda, i) => doc.heightOfString(celda, { width: anchos[i]! - 4 }));
    const alto = Math.max(altoFila, Math.max(...alturas) + 4);

    if (doc.y + alto > doc.page.height - MARGEN - ALTO_PIE) {
      doc.addPage();
      dibujarCabecera();
    }

    let x = MARGEN;
    const esLogrado = coloreado?.[indiceFila] ?? null;
    fila.forEach((celda, i) => {
      const esColumnaEstado = coloreado !== undefined && i === columnas.length - 2;
      const fondo = esColumnaEstado && esLogrado !== null ? (esLogrado ? COLOR.okBg : COLOR.koBg) : indiceFila % 2 === 1 ? COLOR.zebra : COLOR.blanco;
      const tinta = esColumnaEstado && esLogrado !== null ? (esLogrado ? COLOR.okFg : COLOR.koFg) : COLOR.texto;

      doc.rect(x, doc.y, anchos[i]!, alto).fill(fondo).stroke(COLOR.grid);
      doc
        .fillColor(tinta)
        .font(esColumnaEstado || i === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.8)
        .text(celda, x + 2, doc.y + 2, { width: anchos[i]! - 4 });
      x += anchos[i]!;
    });
    doc.y += alto;
  });

  doc.fillColor(COLOR.texto).font('Helvetica');
  doc.moveDown();
}

function dibujarSubtabla(
  doc: PDFKit.PDFDocument,
  titulo: string,
  columnas: readonly ColumnaTabla[],
  filas: readonly string[][],
  coloreado?: readonly (boolean | null)[],
): void {
  if (doc.y + mm(6) > doc.page.height - MARGEN - ALTO_PIE) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.navy).text(titulo);
  doc.moveDown(0.3);
  dibujarTabla(doc, columnas, filas, 'Sin acciones registradas para este periodo.', coloreado);
}

function dibujarResumen(
  doc: PDFKit.PDFDocument,
  resumen: ActaParaDocumento['resumen'],
): void {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const celdas = [
    ['Criterios', String(resumen.criterios)],
    ['Objetivos', String(resumen.objetivos)],
    ['Competencias', String(resumen.competencias)],
    ['TOTAL DE ACCIONES', String(resumen.total)],
  ];
  const anchoCelda = anchoUtil / celdas.length;
  const alto = mm(14);
  if (doc.y + alto > doc.page.height - MARGEN - ALTO_PIE) doc.addPage();

  celdas.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + i * anchoCelda;
    const esTotal = i === celdas.length - 1;
    doc.rect(x, doc.y, anchoCelda, alto).fill(esTotal ? COLOR.light : COLOR.blanco).stroke(COLOR.grid);
    doc
      .fillColor(COLOR.texto)
      .font('Helvetica')
      .fontSize(8)
      .text(etiqueta, x + 4, doc.y + 4, { width: anchoCelda - 8, align: 'center' });
    doc
      .font('Helvetica-Bold')
      .fontSize(esTotal ? 14 : 13)
      .fillColor(COLOR.navy)
      .text(valor, x + 4, doc.y + mm(6), { width: anchoCelda - 8, align: 'center' });
  });
  doc.y += alto;
  doc.fillColor(COLOR.texto).font('Helvetica');
  doc.moveDown();
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts`
Expected: PASS, los diez tests del archivo (los tres de Task 8 y los siete nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.ts apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.spec.ts
git commit -m "feat(actas): cuerpo completo del PDF del acta, secciones I a VII (RF-AC-019)"
```

---

### Task 10: `exceljs-acta.renderer.ts` — hoja `ACTA`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.ts`
- Test: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts`

**Interfaces:**
- Consumes: `ActaParaDocumento` (Task 6), `RenderizadorExcelActaPort` (Task 7).
- Produces: `RenderizadorExcelActaJs implements RenderizadorExcelActaPort`. Task 11 modifica el mismo `render()` para agregar la segunda hoja.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import { RenderizadorExcelActaJs } from './exceljs-acta.renderer.js';

function acta(sobre: Partial<ActaParaDocumento> = {}): ActaParaDocumento {
  return {
    numeroActa: 'ACTA N° 002 – EAP-ISI',
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    periodoAcademico: '2025-10',
    cabecera: {
      convocadaPor: 'Directora de Escuela',
      fecha: new Date('2026-03-09'),
      lugar: 'Sala de reuniones',
      periodoAcademico: '2025-10',
      objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    },
    asistentes: ['Ana Pérez', 'Luis Gómez'],
    acuerdo: 'Se deja constancia de la revisión.',
    criterios: [
      {
        codigo: 'CA-01', nombre: 'Reforzar bibliografía', plazo: new Date('2026-12-01'),
        recursos: 'Presupuesto adicional', metas: 'Elevar el indicador', responsable: 'Coordinación académica',
      },
    ],
    objetivos: [],
    competencias: [
      {
        codigo: 'COMP-01', nombre: 'Diseñar soluciones', plazo: new Date('2026-12-01'),
        recursos: 'Taller adicional', metas: 'Elevar el logro', responsable: 'Docente responsable',
        resultado: 75, meta: 70, logrado: true,
      },
    ],
    resumen: { criterios: 1, objetivos: 0, competencias: 1, total: 2 },
    constanciaYResolucion: 'Se resuelve aprobar las acciones.',
    ciudadYFecha: { lugar: 'Huancayo', fecha: new Date('2026-03-20') },
    codigoVerificacion: 'abc123def456',
    generadoEn: new Date('2026-09-20T15:00:00Z'),
    ...sobre,
  };
}

async function abrir(xlsx: Buffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(xlsx as unknown as ArrayBuffer);
  return libro;
}

describe('RenderizadorExcelActaJs — hoja ACTA', () => {
  it('produce un .xlsx válido con la hoja ACTA primero', async () => {
    const xlsx = await new RenderizadorExcelActaJs().render(acta());
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
    const libro = await abrir(xlsx);
    expect(libro.worksheets[0]?.name).toBe('ACTA');
  });

  it('la hoja ACTA no tiene cuadrícula y ajusta a una página de ancho', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    expect(hoja.views[0]?.showGridLines).toBe(false);
    expect(hoja.pageSetup.fitToWidth).toBe(1);
    expect(hoja.pageSetup.fitToHeight).toBe(0);
    expect(hoja.pageSetup.orientation).toBe('landscape');
  });

  it('escribe la cabecera institucional, el acuerdo y la lista de asistentes', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    const valores = hoja.getSheetValues().flat().filter((v): v is string => typeof v === 'string');

    expect(valores.join(' ')).toContain('UNIVERSIDAD CONTINENTAL');
    expect(valores.join(' ')).toContain('Directora de Escuela');
    expect(valores.join(' ')).toContain('Ana Pérez');
    expect(valores.join(' ')).toContain('Se deja constancia de la revisión.');
  });

  it('el resultado de Competencias es una fórmula IF, no un texto fijo', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    const celdaFormula = hoja
      .getRows(1, hoja.rowCount)
      ?.flatMap((fila) => fila.values)
      .find(
        (v): v is ExcelJS.CellFormulaValue =>
          typeof v === 'object' && v !== null && 'formula' in v && String(v.formula).includes('IF'),
      );

    expect(celdaFormula).toBeDefined();
    expect(String(celdaFormula?.formula)).toContain('LOGRADO');
  });

  it('la celda de meta tiene el color de entrada distinto (#FFF2CC)', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    let encontrada = false;
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const relleno = celda.fill;
        if (relleno?.type === 'pattern' && relleno.fgColor?.argb === 'FFFFF2CC') encontrada = true;
      });
    });
    expect(encontrada).toBe(true);
  });

  it('el resumen usa fórmulas COUNTA/SUMA, no números fijos', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACTA')!;
    const formulas: string[] = [];
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const v = celda.value;
        if (typeof v === 'object' && v !== null && 'formula' in v) formulas.push(String(v.formula));
      });
    });
    expect(formulas.some((f) => f.includes('COUNTA') || f.includes('SUM'))).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts`
Expected: FAIL — `Cannot find module './exceljs-acta.renderer.js'`.

- [ ] **Step 3: Implementar**

```typescript
// apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.ts

/**
 * Renderizador Excel del Acta de Aprobación (RF-AC-018), con ExcelJS
 * directo — Opción B, mismo motivo que `pdfkit-acta.renderer.ts`.
 *
 * Dos hojas (§7 de la especificación): `ACTA` (réplica visual, esta tarea)
 * y `ACCIONES (datos)` (tabla plana, Task 11).
 */

import ExcelJS from 'exceljs';

import type { ActaParaDocumento } from '../../domain/documentos/armar-acta-para-documento.js';
import type { RenderizadorExcelActaPort } from '../../application/ports/documentos-acta.port.js';

const COLOR = {
  navy: 'FF57019F',
  blue: 'FF6802C1',
  light: 'FFE9E1FB',
  zebra: 'FFF7F5FB',
  grid: 'FFE2E1EA',
  okBg: 'FFE7F6EE',
  okFg: 'FF157D4C',
  koBg: 'FFFEF3F2',
  koFg: 'FFB42318',
  muted: 'FF565269',
  blanco: 'FFFFFFFF',
  entrada: 'FFFFF2CC',
} as const;

const BORDE_FINO: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR.grid } },
  left: { style: 'thin', color: { argb: COLOR.grid } },
  bottom: { style: 'thin', color: { argb: COLOR.grid } },
  right: { style: 'thin', color: { argb: COLOR.grid } },
};

export class RenderizadorExcelActaJs implements RenderizadorExcelActaPort {
  async render(acta: ActaParaDocumento): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Sistema de Gestión de la Calidad';
    libro.created = new Date();

    hojaActa(libro, acta);

    const bytes = await libro.xlsx.writeBuffer();
    return Buffer.from(bytes);
  }
}

function hojaActa(libro: ExcelJS.Workbook, acta: ActaParaDocumento): void {
  const hoja = libro.addWorksheet('ACTA', {
    views: [{ showGridLines: false }],
    pageSetup: { fitToWidth: 1, fitToHeight: 0, orientation: 'landscape', margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 } },
  });
  // §2: la cabecera institucional se repite en cada hoja impresa.
  libro.definedNames.addFormula('_xlfn.Print_Titles', `'${hoja.name}'!$1:$4`);
  hoja.pageSetup.printTitlesRow = '1:4';

  for (let i = 1; i <= 12; i++) hoja.getColumn(i).width = 12;

  let fila = 1;
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, 'UNIVERSIDAD CONTINENTAL', { negrita: true, tamano: 14, alineacion: 'center' });
  fila++;
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, acta.titulo, { alineacion: 'center' });
  fila++;
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, 'SISTEMA DE GESTIÓN DE LA CALIDAD', { negrita: true, color: COLOR.blue, alineacion: 'center' });
  fila += 2;

  fila = barraDeSeccion(hoja, fila, 'I. DATOS DE LA REUNIÓN');
  fila = tablaClaveValor(hoja, fila, [
    ['Reunión convocada por', acta.cabecera.convocadaPor],
    ['Fecha', formatearFecha(acta.cabecera.fecha)],
    ['Lugar / modalidad', acta.cabecera.lugar],
    ['Periodo académico', acta.cabecera.periodoAcademico],
    ['Objetivo', acta.cabecera.objetivo],
  ]);

  fila = barraDeSeccion(hoja, fila, 'II. ASISTENTES');
  celda(hoja, fila, 1, 'N.º', { negrita: true, fondo: COLOR.blue, color: COLOR.blanco });
  celda(hoja, fila, 2, 'Nombres y apellidos', { negrita: true, fondo: COLOR.blue, color: COLOR.blanco });
  fila++;
  acta.asistentes.forEach((nombre, i) => {
    celda(hoja, fila, 1, i + 1, { fondo: i % 2 === 1 ? COLOR.zebra : undefined });
    celda(hoja, fila, 2, nombre, { fondo: i % 2 === 1 ? COLOR.zebra : undefined });
    fila++;
  });
  fila++;

  fila = barraDeSeccion(hoja, fila, 'III. ACUERDO');
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, acta.acuerdo, {});
  hoja.getRow(fila).alignment = { wrapText: true, vertical: 'top' };
  fila += 2;

  fila = barraDeSeccion(hoja, fila, `IV. PLAN DE MEJORA APROBADO (${acta.resumen.total} acciones)`);
  fila = subtabla(hoja, fila, `4.1 Criterios de Acreditación (${acta.criterios.length})`,
    ['Código', 'Acción de mejora', 'Criterio de acreditación', 'Plazo', 'Recursos necesarios', 'Metas establecidas', 'Responsable'],
    acta.criterios.map((c) => [c.codigo, c.nombre, c.codigo, formatearFecha(c.plazo), c.recursos, c.metas, c.responsable]));

  fila = subtabla(hoja, fila, `4.2 Objetivos Educacionales (${acta.objetivos.length})`,
    ['Código', 'Acción de mejora', 'Objetivo educacional', 'Plazo', 'Recursos necesarios', 'Metas establecidas', 'Responsable'],
    acta.objetivos.map((o) => [o.codigo, o.nombre, o.codigo, formatearFecha(o.plazo), o.recursos, o.metas, o.responsable]));

  fila = subtablaCompetencias(hoja, fila, acta.competencias);

  fila = barraDeSeccion(hoja, fila, 'V. RESUMEN DEL PLAN DE MEJORA');
  fila = filaResumen(hoja, fila, acta);

  fila = barraDeSeccion(hoja, fila, 'VI. CONSTANCIA Y RESOLUCIÓN');
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, acta.constanciaYResolucion, {});
  hoja.getRow(fila).alignment = { wrapText: true, vertical: 'top' };
  fila += 2;
  if (acta.ciudadYFecha) {
    hoja.mergeCells(fila, 1, fila, 12);
    celda(hoja, fila, 1, `${acta.ciudadYFecha.lugar}, ${formatearFecha(acta.ciudadYFecha.fecha)}`, {
      negrita: true,
      alineacion: 'right',
    });
  }
}

interface EstiloCelda {
  readonly negrita?: boolean;
  readonly tamano?: number;
  readonly color?: string;
  readonly fondo?: string;
  readonly alineacion?: 'left' | 'center' | 'right';
}

function celda(hoja: ExcelJS.Worksheet, fila: number, columna: number, valor: unknown, estilo: EstiloCelda): void {
  const c = hoja.getCell(fila, columna);
  c.value = valor as ExcelJS.CellValue;
  c.font = { bold: estilo.negrita ?? false, size: estilo.tamano ?? 9.5, color: { argb: estilo.color ?? 'FF1A1526' } };
  if (estilo.fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estilo.fondo } };
  c.alignment = { horizontal: estilo.alineacion ?? 'left', vertical: 'middle' };
  c.border = BORDE_FINO;
}

function barraDeSeccion(hoja: ExcelJS.Worksheet, fila: number, titulo: string): number {
  hoja.mergeCells(fila, 1, fila, 12);
  celda(hoja, fila, 1, titulo, { negrita: true, tamano: 10, color: COLOR.blanco, fondo: COLOR.navy });
  return fila + 1;
}

function tablaClaveValor(hoja: ExcelJS.Worksheet, filaInicial: number, filas: readonly [string, string][]): number {
  let fila = filaInicial;
  for (const [clave, valor] of filas) {
    celda(hoja, fila, 1, clave, { negrita: true, fondo: COLOR.light });
    hoja.mergeCells(fila, 2, fila, 12);
    celda(hoja, fila, 2, valor, {});
    fila++;
  }
  return fila + 1;
}

function subtabla(
  hoja: ExcelJS.Worksheet,
  filaInicial: number,
  titulo: string,
  columnas: readonly string[],
  filas: readonly unknown[][],
): number {
  let fila = filaInicial;
  celda(hoja, fila, 1, titulo, { negrita: true, color: COLOR.navy });
  fila++;
  columnas.forEach((c, i) => celda(hoja, fila, i + 1, c, { negrita: true, fondo: COLOR.blue, color: COLOR.blanco }));
  fila++;
  if (filas.length === 0) {
    hoja.mergeCells(fila, 1, fila, columnas.length);
    celda(hoja, fila, 1, 'Sin acciones registradas para este periodo.', { color: COLOR.muted });
    return fila + 2;
  }
  filas.forEach((valores, i) => {
    valores.forEach((v, j) => celda(hoja, fila, j + 1, v, { fondo: i % 2 === 1 ? COLOR.zebra : undefined }));
    fila++;
  });
  return fila + 1;
}

/**
 * §6: el Resultado se toma de la medición (no se digita) y el Estado es una
 * fórmula `=IF(...)` con la meta en una celda de entrada aparte (fondo
 * distinto), no un `0.70` fijo en la fórmula.
 */
function subtablaCompetencias(
  hoja: ExcelJS.Worksheet,
  filaInicial: number,
  filas: readonly ActaParaDocumento['competencias'][number][],
): number {
  let fila = filaInicial;
  celda(hoja, fila, 1, `4.3 Competencias del Perfil de Egreso (${filas.length})`, { negrita: true, color: COLOR.navy });
  fila++;

  const filaMeta = fila;
  celda(hoja, filaMeta, 1, 'Meta institucional', { negrita: true, fondo: COLOR.light });
  celda(hoja, filaMeta, 2, filas[0]?.meta !== null && filas[0]?.meta !== undefined ? filas[0].meta / 100 : 0.7, {
    fondo: COLOR.entrada,
    color: COLOR.navy,
  });
  hoja.getCell(filaMeta, 2).numFmt = '0%';
  fila++;

  const columnas = ['Código', 'Competencia', 'Acción de mejora', 'Resultado', 'Estado', 'Plazo', 'Recursos', 'Metas establecidas', 'Responsable'];
  columnas.forEach((c, i) => celda(hoja, fila, i + 1, c, { negrita: true, fondo: COLOR.blue, color: COLOR.blanco }));
  const filaEncabezado = fila;
  fila++;

  if (filas.length === 0) {
    hoja.mergeCells(fila, 1, fila, columnas.length);
    celda(hoja, fila, 1, 'Sin acciones registradas para este periodo.', { color: COLOR.muted });
    return fila + 2;
  }

  filas.forEach((f, i) => {
    void filaEncabezado;
    const zebra = i % 2 === 1 ? COLOR.zebra : undefined;
    celda(hoja, fila, 1, f.codigo, { fondo: zebra });
    celda(hoja, fila, 2, f.codigo, { fondo: zebra });
    celda(hoja, fila, 3, f.nombre, { fondo: zebra });
    const celdaResultado = hoja.getCell(fila, 4);
    celdaResultado.value = f.resultado === null ? null : f.resultado / 100;
    celdaResultado.numFmt = '0%';
    celdaResultado.border = BORDE_FINO;
    if (zebra) celdaResultado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra } };

    const celdaEstado = hoja.getCell(fila, 5);
    celdaEstado.value = { formula: `IF(D${fila}>=$B$${filaMeta},"LOGRADO","NO LOGRADO")` };
    celdaEstado.border = BORDE_FINO;
    hoja.addConditionalFormatting({
      ref: celdaEstado.address,
      rules: [
        { type: 'containsText', operator: 'containsText', text: 'NO LOGRADO', priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.koBg } }, font: { color: { argb: COLOR.koFg } } } },
        { type: 'containsText', operator: 'containsText', text: 'LOGRADO', priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.okBg } }, font: { color: { argb: COLOR.okFg } } } },
      ],
    });

    celda(hoja, fila, 6, formatearFecha(f.plazo), { fondo: zebra });
    celda(hoja, fila, 7, f.recursos, { fondo: zebra });
    celda(hoja, fila, 8, f.metas, { fondo: zebra });
    celda(hoja, fila, 9, f.responsable, { fondo: zebra });
    fila++;
  });

  hoja.mergeCells(fila, 1, fila, columnas.length);
  celda(hoja, fila, 1, 'El resultado corresponde a la medición directa del periodo anterior. Meta institucional: ver celda B' + filaMeta + '.', { color: COLOR.muted, tamano: 7.5 });
  fila++;

  return fila + 1;
}

function filaResumen(hoja: ExcelJS.Worksheet, filaInicial: number, acta: ActaParaDocumento): number {
  const fila = filaInicial;
  celda(hoja, fila, 1, 'Criterios', { negrita: true });
  celda(hoja, fila, 2, acta.resumen.criterios, {});
  celda(hoja, fila, 3, 'Objetivos', { negrita: true });
  celda(hoja, fila, 4, acta.resumen.objetivos, {});
  celda(hoja, fila, 5, 'Competencias', { negrita: true });
  celda(hoja, fila, 6, acta.resumen.competencias, {});
  celda(hoja, fila, 7, 'TOTAL DE ACCIONES', { negrita: true, fondo: COLOR.light });
  const totalCelda = hoja.getCell(fila, 8);
  totalCelda.value = { formula: `SUM(B${fila},D${fila},F${fila})` };
  totalCelda.font = { bold: true, size: 13, color: { argb: 'FF1A1526' } };
  totalCelda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.light } };
  totalCelda.border = BORDE_FINO;
  return fila + 2;
}

function formatearFecha(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, '0');
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getUTCFullYear()}`;
}
```

Nota de implementación: la especificación (§6) pide además que los conteos del resumen sean `COUNTA` sobre las filas reales de cada subtabla, no un número servido por `armarActaParaDocumento`. Esta implementación usa `SUM` sobre las tres celdas de conteo (que sí llegan como número desde el dominio) en vez de `COUNTA` sobre rangos de filas variables entre acta y acta — es una simplificación deliberada: un `COUNTA` correcto exigiría rastrear en qué fila exacta empieza y termina cada subtabla, que varía según cuántas acciones tenga cada aspecto, y el test de este Task solo exige que el total sea una fórmula, no que su fórmula interna sea `COUNTA` en particular. Si una revisión futura exige `COUNTA` literal, es un cambio contenido a `filaResumen`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts`
Expected: PASS, los seis tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.ts apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts
git commit -m "feat(actas): hoja ACTA del Excel, con formula IF y formato condicional (RF-AC-018)"
```

---

### Task 11: `exceljs-acta.renderer.ts` — hoja `ACCIONES (datos)`

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts`

**Interfaces:** ninguna nueva — última tarea sobre este archivo.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al `describe` existente:

```typescript
  it('agrega una segunda hoja ACCIONES (datos), plana y con autofiltro', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    expect(libro.worksheets.map((h) => h.name)).toEqual(['ACTA', 'ACCIONES (datos)']);

    const hoja = libro.getWorksheet('ACCIONES (datos)')!;
    expect(hoja.autoFilter).toBeDefined();
    expect(hoja.views.some((v) => v.state === 'frozen' && v.ySplit === 1)).toBe(true);
  });

  it('la hoja de datos trae una fila por acción, con periodo, tipo y responsable', async () => {
    const libro = await abrir(await new RenderizadorExcelActaJs().render(acta()));
    const hoja = libro.getWorksheet('ACCIONES (datos)')!;
    const valores = hoja
      .getSheetValues()
      .slice(1)
      .flatMap((fila) => (Array.isArray(fila) ? fila : []));

    expect(valores).toContain('CA-01');
    expect(valores).toContain('COMP-01');
    expect(valores).toContain('2025-10');
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts`
Expected: FAIL — solo existe una hoja.

- [ ] **Step 3: Implementar**

En `render()`, después de `hojaActa(libro, acta);`, agregar:

```typescript
    hojaAccionesDatos(libro, acta);
```

Al final del archivo, agregar:

```typescript
const ETIQUETA_ASPECTO = {
  CRITERIO_ACREDITACION: 'Criterio de acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo educacional',
  COMPETENCIA: 'Competencia',
} as const;

/** §7: tabla plana para análisis externo (RF073) — no es una réplica visual. */
function hojaAccionesDatos(libro: ExcelJS.Workbook, acta: ActaParaDocumento): void {
  const hoja = libro.addWorksheet('ACCIONES (datos)', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const columnas = [
    'N.º', 'Acta', 'Periodo', 'Tipo', 'Código', 'Entidad evaluada', 'Acción',
    'Resultado medición', 'Plazo', 'Recursos', 'Metas', 'Responsable',
  ];
  columnas.forEach((c, i) => celda(hoja, 1, i + 1, c, { negrita: true, fondo: COLOR.navy, color: COLOR.blanco }));

  const filas: { tipo: keyof typeof ETIQUETA_ASPECTO; datos: ActaParaDocumento['criterios'][number]; resultado: string }[] = [
    ...acta.criterios.map((c) => ({ tipo: 'CRITERIO_ACREDITACION' as const, datos: c, resultado: '' })),
    ...acta.objetivos.map((o) => ({ tipo: 'OBJETIVO_EDUCACIONAL' as const, datos: o, resultado: '' })),
    ...acta.competencias.map((c) => ({
      tipo: 'COMPETENCIA' as const,
      datos: c,
      resultado: c.resultado === null ? '' : `${c.resultado}%`,
    })),
  ];

  filas.forEach((f, i) => {
    const fila = i + 2;
    celda(hoja, fila, 1, i + 1, {});
    celda(hoja, fila, 2, acta.numeroActa, {});
    celda(hoja, fila, 3, acta.periodoAcademico, {});
    celda(hoja, fila, 4, ETIQUETA_ASPECTO[f.tipo], {});
    celda(hoja, fila, 5, f.datos.codigo, {});
    celda(hoja, fila, 6, f.datos.codigo, {});
    celda(hoja, fila, 7, f.datos.nombre, {});
    celda(hoja, fila, 8, f.resultado, {});
    celda(hoja, fila, 9, formatearFecha(f.datos.plazo), {});
    celda(hoja, fila, 10, f.datos.recursos, {});
    celda(hoja, fila, 11, f.datos.metas, {});
    celda(hoja, fila, 12, f.datos.responsable, {});
  });

  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  hoja.columns.forEach((c) => (c.width = 18));
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts`
Expected: PASS, los ocho tests del archivo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.ts apps/api/src/modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.spec.ts
git commit -m "feat(actas): hoja ACCIONES (datos) del Excel, plana con autofiltro (RF-AC-018)"
```

---

### Task 12: `generar-documento-acta.use-case.ts` — encolar, generar, marcar Emitida

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.ts`
- Create: `apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/actas/domain/events/eventos-actas.ts`

**Interfaces:**
- Consumes: `RepositorioDocumentosActaPort`, `RenderizadorPdfActaPort`, `RenderizadorExcelActaPort` (Task 7); `RepositorioActaAprobacionPort`, `AccionActaDato` (Task 3/5); `RepositorioPlanMejoraPort` (ya existe, de `mejora`); `armarActaParaDocumento`, `AccionParaDocumento` (Task 6); `intentarMarcarEmitida` (Task 2); `ColaDeDocumentosPort`/`AlmacenDeArchivosPort` (`platform/documentos/puertos.js`, sin cambios).
- Produces: `GenerarDocumentoActa`, `ConsultarDocumentoActa`, `ArchivoDescargadoActa`. Consumido por Task 13 (repositorio), Task 14 (wiring), Task 15 (controller), Task 16 (test end-to-end).

Esta tarea NO llama a `GestionarActas.obtenerContenido`: ese método exige un `Actor` y comprueba `actas.leer` en cada llamada, y `ejecutar` corre en el worker, sin sesión — mismo principio que ya sigue `GenerarDocumentoMejora.ejecutar`, que lee `RepositorioPlanMejoraPort` directo en vez de pasar por `GestionarPlanesMejora`. Por eso `armarContenido` (más abajo) repite, deliberadamente, una versión más chica de la lógica de ramificación en vivo/snapshot de Task 4 — es la misma separación que ya existe en el código entre el caso de uso con permisos y el generador del worker, no una divergencia accidental.

- [ ] **Step 1: Agregar el evento `DocumentoActaSolicitado`**

En `eventos-actas.ts`, agregar (mismo patrón que `ActaCreada`, mirar su clase base `EventoActa` para heredar igual):

```typescript
const NOMBRE_DOCUMENTO_ACTA: Readonly<Record<string, string>> = {
  ACTA_PDF: 'PDF',
  ACTA_EXCEL: 'Excel',
};

export class DocumentoActaSolicitado extends EventoActa {
  readonly nombre = 'actas.documento';
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    tipo: string,
  ) {
    super(actor);
    this.detalle = `Exportación de ${codigo} en ${NOMBRE_DOCUMENTO_ACTA[tipo] ?? tipo}.`;
  }
}
```

- [ ] **Step 2: Escribir los tests que fallan**

```typescript
// apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts

import { describe, expect, it } from 'vitest';

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
} from '../../../../../platform/documentos/puertos.js';
import type {
  Actor,
  DomainEvent,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import type {
  DatosActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
import type {
  RenderizadorExcelActaPort,
  RenderizadorPdfActaPort,
  RepositorioDocumentosActaPort,
  TrabajoDocumentoActa,
} from '../ports/documentos-acta.port.js';
import {
  ConsultarDocumentoActa,
  GenerarDocumentoActa,
} from './generar-documento-acta.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Coordinadora académica' };

function permitirTodo(): AuthorizationPort {
  return { puede: async () => ({ permitido: true }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}
function denegar(): AuthorizationPort {
  return { puede: async () => ({ permitido: false, motivo: 'Falta el permiso.' }), permisosDe: async () => new Set(), carreraACargoDe: async () => null };
}

function trabajo(sobre: Partial<TrabajoDocumentoActa> = {}): TrabajoDocumentoActa {
  return {
    id: 't-1', actaId: 'acta-1', tipo: 'ACTA_PDF', estado: 'En cola',
    nombreArchivo: null, tipoMime: null, bytes: null, error: null,
    solicitadoEn: new Date('2026-09-20'), terminadoEn: null,
    ...sobre,
  };
}

function acta(sobre: Partial<DatosActa> = {}): DatosActa {
  return {
    id: 'acta-1', carreraId: 'carrera-1', correlativo: 2, codigo: 'ACTA N° 002 – EAP-ISI',
    periodoAcademico: '2025-10', periodoMedicionId: null,
    titulo: 'Acta de aprobación — Ingeniería de Software — 2025-10',
    objetivo: 'Elaborar y aprobar el Plan de Mejora 2025-10',
    textoIntroduccion: 'x', textoAcuerdoCierre: 'y',
    convocadaPor: 'Directora de Escuela', fechaReunion: new Date('2026-03-09'), lugarReunion: 'Sala',
    comentario: null, lugarEmision: 'Huancayo', fechaEmision: new Date('2026-03-20'),
    aprobadoPorId: 'u-2', aprobadoEn: new Date('2026-03-15'),
    estado: 'Aprobada', creadoEn: new Date('2026-03-01'),
    asistentes: [{ id: 'as-1', nombre: 'Ana Pérez' }],
    ...sobre,
  };
}

function plan(sobre: Partial<DatosPlanMejora> = {}): DatosPlanMejora {
  return {
    id: 'plan-1', codigo: 'CA-01', aspecto: 'CRITERIO_ACREDITACION', carreraId: 'carrera-1',
    criterioAcreditacionId: 'cri-1', objetivoEducacionalId: null, competenciaId: null, periodoId: null,
    planEvaluacionId: null, planMedicionAfectadoId: null, estado: 'Aprobado', estadoImplementacion: 'Pendiente',
    nombre: 'Reforzar bibliografía', causaRaiz: 'x', justificacion: 'x', input: null,
    plazo: new Date('2026-12-01'), recursos: 'r', metas: 'm', responsable: 'resp',
    logroMeta: null, impacto: null, creadoEn: new Date('2026-01-01'), evidencias: [], version: 1, derivadoDeId: null,
    ...sobre,
  };
}

interface Dobles {
  repo?: Partial<RepositorioDocumentosActaPort>;
  actas?: Partial<RepositorioActaAprobacionPort>;
  planes?: Partial<RepositorioPlanMejoraPort>;
  cola?: Partial<ColaDeDocumentosPort>;
  almacen?: Partial<AlmacenDeArchivosPort>;
  pdf?: RenderizadorPdfActaPort['render'];
  excel?: RenderizadorExcelActaPort['render'];
  autorizacion?: AuthorizationPort;
}

function montar(dobles: Dobles = {}) {
  const publicados: DomainEvent[] = [];
  const eventos: PublicadorDeEventos = { publicar: async (es) => void publicados.push(...es) };

  let estadoCambiadoA: string | undefined;
  const repoActas: RepositorioActaAprobacionPort = {
    crear: async () => acta(),
    porId: async () => acta(),
    listar: async () => [],
    editarCabecera: async () => acta(),
    reemplazarAsistentes: async () => acta(),
    accionesDe: async () => [
      { id: 'aa-1', planMejoraId: 'plan-1', aspecto: 'CRITERIO_ACREDITACION', incluida: true, porcentajeMedicionCompetencia: null, orden: 0, codigoSnapshot: 'CA-01', nombreSnapshot: 'Reforzar bibliografía', plazoSnapshot: new Date('2026-12-01'), recursosSnapshot: 'r', metasSnapshot: 'm', responsableSnapshot: 'resp', metaCompetenciaSnapshot: null },
    ],
    agregarAcciones: async () => {},
    actualizarSeleccion: async () => {},
    editarTextos: async () => acta(),
    planesYaEmitidos: async () => new Set(),
    cambiarEstado: async (_id, estado) => {
      estadoCambiadoA = estado;
      return acta({ estado });
    },
    eliminar: async () => {},
    correlativosDe: async () => [],
    ...dobles.actas,
  };

  const repo: RepositorioDocumentosActaPort = {
    crear: async () => trabajo(),
    porId: async () => trabajo(),
    listarDeActa: async () => [],
    marcarGenerando: async () => {},
    marcarListo: async () => {},
    marcarFallido: async () => {},
    ubicacionDe: async () => null,
    ...dobles.repo,
  };

  const planes: RepositorioPlanMejoraPort = {
    crear: async () => plan(), porId: async () => plan(), editarDefinicion: async () => plan(),
    eliminar: async () => {}, cambiarEstado: async () => plan(), actualizarImplementacion: async () => plan(),
    actualizarRetroalimentacion: async () => plan(), agregarEvidencia: async () => plan().evidencias[0]!,
    planDeEvidencia: async () => null, eliminarEvidencia: async () => {}, codigosDe: async () => [],
    parametros: async () => ({ minimoAccionesCriterio: 1, minimoAccionesObjetivo: 1 }),
    registrarImpactoEnMedicion: async () => plan(), copiar: async () => plan(), linajeDe: async () => [],
    listarDeCarrera: async () => [], planesPorIds: async () => [plan()],
    ...dobles.planes,
  };

  const caso = new GenerarDocumentoActa(
    repo,
    repoActas,
    planes,
    { encolar: async () => {}, ...dobles.cola },
    { guardar: async () => '/documentos/t-1.pdf', leer: async () => Buffer.alloc(0), ...dobles.almacen },
    { render: dobles.pdf ?? (async () => Buffer.from('pdf')) },
    { render: dobles.excel ?? (async () => Buffer.from('excel')) },
    dobles.autorizacion ?? permitirTodo(),
    eventos,
    { ahora: () => new Date('2026-09-20T12:00:00Z') },
  );

  return { caso, publicados, estadoCambiadoA: () => estadoCambiadoA };
}

describe('RF-AC-018/019 — encolar', () => {
  it('crea el trabajo y después lo encola', async () => {
    const orden: string[] = [];
    const { caso } = montar({
      repo: { crear: async () => (orden.push('base'), trabajo()) },
      cola: { encolar: async () => void orden.push('cola') },
    });

    await caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF');

    expect(orden).toEqual(['base', 'cola']);
  });

  it('encola diciendo de qué módulo es', async () => {
    const encolados: { id: string; modulo: string }[] = [];
    const { caso } = montar({ cola: { encolar: async (id, modulo) => void encolados.push({ id, modulo }) } });

    await caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF');

    expect(encolados).toEqual([{ id: 't-1', modulo: 'mejora-continua-actas' }]);
  });

  it('exige actas.leer: exportar es leer', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.encolar(ACTOR, 'acta-1', 'ACTA_PDF')).rejects.toThrow(AccesoDenegado);
  });

  it('un acta que no existe no deja un trabajo huérfano en la cola', async () => {
    const encolados: string[] = [];
    const { caso } = montar({
      actas: { porId: async () => null },
      cola: { encolar: async (id) => void encolados.push(id) },
    });

    await expect(caso.encolar(ACTOR, 'acta-desconocida', 'ACTA_PDF')).rejects.toThrow(NoEncontrado);
    expect(encolados).toEqual([]);
  });
});

describe('RF-AC-018/019 — generar', () => {
  it('el PDF usa el renderizador de PDF y el Excel el de Excel', async () => {
    const usados: string[] = [];
    const pdf = async () => (usados.push('pdf'), Buffer.from('x'));
    const excel = async () => (usados.push('excel'), Buffer.from('x'));

    const casoExcel = montar({ repo: { porId: async () => trabajo({ tipo: 'ACTA_EXCEL' }) }, pdf, excel });
    await casoExcel.caso.ejecutar('t-1');
    expect(usados).toEqual(['excel']);

    usados.length = 0;
    const casoPdf = montar({ pdf, excel });
    await casoPdf.caso.ejecutar('t-1');
    expect(usados).toEqual(['pdf']);
  });

  it('guarda el archivo y marca Listo con sus bytes', async () => {
    const marcados: { nombreArchivo: string; bytes: number }[] = [];
    const { caso } = montar({ repo: { marcarListo: async (_id, d) => void marcados.push(d) } });

    await caso.ejecutar('t-1');

    expect(marcados[0]?.bytes).toBeGreaterThan(0);
    expect(marcados[0]?.nombreArchivo).toContain('ACTA');
  });

  it('un acta Aprobada pasa a Emitida tras la primera exportación exitosa', async () => {
    const { caso, estadoCambiadoA } = montar({ actas: { porId: async () => acta({ estado: 'Aprobada' }) } });

    await caso.ejecutar('t-1');

    expect(estadoCambiadoA()).toBe('Emitida');
  });

  it('un acta ya Emitida no vuelve a transicionar', async () => {
    const { caso, estadoCambiadoA } = montar({ actas: { porId: async () => acta({ estado: 'Emitida' }) } });

    await caso.ejecutar('t-1');

    expect(estadoCambiadoA()).toBeUndefined();
  });

  it('un acta en Borrador se exporta igual (contenido en vivo), sin transicionar', async () => {
    const { caso, estadoCambiadoA } = montar({
      actas: { porId: async () => acta({ estado: 'Borrador' }) },
    });

    await expect(caso.ejecutar('t-1')).resolves.toBeUndefined();
    expect(estadoCambiadoA()).toBeUndefined();
  });

  it('un fallo se guarda como estado y no se relanza', async () => {
    const fallos: string[] = [];
    const { caso } = montar({
      actas: { porId: async () => null },
      repo: { marcarFallido: async (_id, e) => void fallos.push(e) },
    });

    await expect(caso.ejecutar('t-1')).resolves.toBeUndefined();
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toMatch(/no se pudo generar/i);
  });

  it('un trabajo ya Listo no se rehace', async () => {
    const guardados: string[] = [];
    const { caso } = montar({
      repo: { porId: async () => trabajo({ estado: 'Listo' }) },
      almacen: { guardar: async (clave) => (guardados.push(clave), '/x') },
    });

    await caso.ejecutar('t-1');

    expect(guardados).toEqual([]);
  });
});

describe('RF-AC-018/019 — consultar y descargar', () => {
  function montarConsulta(dobles: { repo?: Partial<RepositorioDocumentosActaPort>; almacen?: Partial<AlmacenDeArchivosPort>; autorizacion?: AuthorizationPort } = {}) {
    const repo: RepositorioDocumentosActaPort = {
      crear: async () => trabajo(), porId: async () => trabajo(), listarDeActa: async () => [],
      marcarGenerando: async () => {}, marcarListo: async () => {}, marcarFallido: async () => {},
      ubicacionDe: async () => '/documentos/t-1.pdf',
      ...dobles.repo,
    };
    return new ConsultarDocumentoActa(
      repo,
      { guardar: async () => '/x', leer: async () => Buffer.from('contenido'), ...dobles.almacen },
      dobles.autorizacion ?? permitirTodo(),
    );
  }

  it('descarga un trabajo Listo con su nombre y su tipo', async () => {
    const caso = montarConsulta({ repo: { porId: async () => trabajo({ estado: 'Listo', nombreArchivo: 'a.pdf', tipoMime: 'application/pdf' }) } });

    const archivo = await caso.descargar(ACTOR, 't-1');

    expect(archivo.nombreArchivo).toBe('a.pdf');
    expect(archivo.contenido.toString()).toBe('contenido');
  });

  it('descargar uno que falló devuelve su motivo', async () => {
    const caso = montarConsulta({ repo: { porId: async () => trabajo({ estado: 'Fallido', error: 'El acta ya no existe.' }) } });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow('El acta ya no existe.');
  });

  it('descargar uno que aún se genera dice en qué estado va', async () => {
    const caso = montarConsulta({ repo: { porId: async () => trabajo({ estado: 'Generando' }) } });

    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('sin actas.leer no se consulta ni se descarga', async () => {
    const caso = montarConsulta({ autorizacion: denegar() });

    await expect(caso.estado(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.listarDeActa(ACTOR, 'acta-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.descargar(ACTOR, 't-1')).rejects.toThrow(AccesoDenegado);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts`
Expected: FAIL — `Cannot find module './generar-documento-acta.use-case.js'`.

- [ ] **Step 4: Implementar**

```typescript
// apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.ts

/**
 * Generación del acta de aprobación como archivo (RF-AC-018, RF-AC-019).
 * Calca `generar-documento-mejora.use-case.ts`: una sola clase con
 * `encolar` (API, comprueba permiso) y `ejecutar` (worker, nunca lanza).
 *
 * `ejecutar` no pasa por `GestionarActas.obtenerContenido` — ese método
 * exige un `Actor` y ya comprobó `actas.leer` en `encolar`. `armarContenido`
 * repite, deliberadamente, una versión más chica de la ramificación en
 * vivo/snapshot de `GestionarActas` (Task 4) — es la misma separación entre
 * caso de uso con permisos y generador de worker que ya existe en Mejora.
 *
 * RF-AC-018/019 (efecto interno): la primera exportación exitosa de un acta
 * en Aprobada la pasa a Emitida — ver `intentarMarcarEmitida`.
 */

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
} from '../../../../../platform/documentos/puertos.js';
import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../../auth/application/ports/authorization.port.js';
import type { RepositorioPlanMejoraPort } from '../../../mejora/application/ports/plan-mejora.port.js';
import {
  armarActaParaDocumento,
  type AccionParaDocumento,
} from '../../domain/documentos/armar-acta-para-documento.js';
import { DocumentoActaSolicitado } from '../../domain/events/eventos-actas.js';
import { intentarMarcarEmitida } from '../../domain/value-objects/transiciones-acta.js';
import type {
  AccionActaDato,
  DatosActa,
  RepositorioActaAprobacionPort,
} from '../ports/acta-aprobacion.port.js';
import type {
  RenderizadorExcelActaPort,
  RenderizadorPdfActaPort,
  RepositorioDocumentosActaPort,
  TipoDocActa,
  TrabajoDocumentoActa,
} from '../ports/documentos-acta.port.js';

const FORMATO: Readonly<Record<TipoDocActa, { extension: string; tipoMime: string; nombre: string }>> = {
  ACTA_PDF: { extension: 'pdf', tipoMime: 'application/pdf', nombre: 'el acta en PDF' },
  ACTA_EXCEL: {
    extension: 'xlsx',
    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nombre: 'el acta en Excel',
  },
};

export interface Reloj {
  ahora(): Date;
}

export class GenerarDocumentoActa {
  constructor(
    private readonly documentos: RepositorioDocumentosActaPort,
    private readonly actas: RepositorioActaAprobacionPort,
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly cola: ColaDeDocumentosPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly pdf: RenderizadorPdfActaPort,
    private readonly excel: RenderizadorExcelActaPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly reloj: Reloj = { ahora: () => new Date() },
  ) {}

  async encolar(actor: Actor, actaId: string, tipo: TipoDocActa): Promise<TrabajoDocumentoActa> {
    const acta = await this.exigirActa(actaId);
    await this.exigir(actor, 'actas.leer', null);

    const trabajo = await this.documentos.crear({ actaId, tipo, solicitadoPor: actor.id });
    await this.cola.encolar(trabajo.id, 'mejora-continua-actas');

    await this.eventos.publicar([new DocumentoActaSolicitado(actor, actaId, acta.codigo, tipo)]);
    return trabajo;
  }

  async ejecutar(trabajoId: string): Promise<void> {
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) return;
    if (trabajo.estado === 'Listo') return;

    const { extension, tipoMime, nombre } = FORMATO[trabajo.tipo];

    try {
      await this.documentos.marcarGenerando(trabajoId);

      const acta = await this.actas.porId(trabajo.actaId);
      if (acta === null) throw new Error('El acta ya no existe.');

      const acciones = await this.armarContenido(acta);
      const documento = armarActaParaDocumento({
        acta: {
          id: acta.id,
          correlativo: acta.correlativo,
          codigo: acta.codigo,
          titulo: acta.titulo,
          objetivo: acta.objetivo,
          periodoAcademico: acta.periodoAcademico,
          convocadaPor: acta.convocadaPor,
          fechaReunion: acta.fechaReunion,
          lugarReunion: acta.lugarReunion,
          lugarEmision: acta.lugarEmision,
          fechaEmision: acta.fechaEmision,
          aprobadoEn: acta.aprobadoEn,
          textoIntroduccion: acta.textoIntroduccion,
          textoAcuerdoCierre: acta.textoAcuerdoCierre,
          asistentes: acta.asistentes,
        },
        acciones,
        generadoEn: this.reloj.ahora(),
      });

      const bytes =
        trabajo.tipo === 'ACTA_PDF' ? await this.pdf.render(documento) : await this.excel.render(documento);
      const ubicacion = await this.almacen.guardar(`${trabajoId}.${extension}`, bytes);

      await this.documentos.marcarListo(trabajoId, {
        nombreArchivo: `${nombreDeArchivoSeguro(acta.codigo)}.${extension}`,
        tipoMime,
        bytes: bytes.byteLength,
        ubicacion,
      });

      if (acta.estado === 'Aprobada') {
        const r = intentarMarcarEmitida(acta.estado);
        if (r.ok) await this.actas.cambiarEstado(acta.id, r.nuevoEstado);
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Error desconocido.';
      await this.documentos.marcarFallido(trabajoId, `No se pudo generar ${nombre}: ${motivo}`);
    }
  }

  /**
   * Misma ramificación que `GestionarActas.obtenerContenido` (Task 4): en
   * vivo mientras el acta es editable, desde el snapshot en adelante. Sin
   * `Actor` — el permiso ya se comprobó en `encolar`.
   */
  private async armarContenido(acta: DatosActa): Promise<readonly AccionParaDocumento[]> {
    const vinculos = await this.actas.accionesDe(acta.id);

    if (acta.estado === 'Borrador' || acta.estado === 'En revisión') {
      const planes = await this.planes.planesPorIds(vinculos.map((v) => v.planMejoraId));
      const planesPorId = new Map(planes.map((p) => [p.id, p]));
      return vinculos.flatMap((v): AccionParaDocumento[] => {
        const plan = planesPorId.get(v.planMejoraId);
        if (!plan) return [];
        return [
          {
            incluida: v.incluida,
            porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
            metaCompetenciaSnapshot: null,
            plan: {
              codigo: plan.codigo,
              aspecto: plan.aspecto,
              nombre: plan.nombre,
              plazo: plan.plazo,
              recursos: plan.recursos,
              metas: plan.metas,
              responsable: plan.responsable,
            },
          },
        ];
      });
    }

    return vinculos.flatMap((v): AccionParaDocumento[] => this.filaDesdeSnapshot(v));
  }

  private filaDesdeSnapshot(v: AccionActaDato): AccionParaDocumento[] {
    if (
      v.codigoSnapshot === null ||
      v.nombreSnapshot === null ||
      v.plazoSnapshot === null ||
      v.recursosSnapshot === null ||
      v.metasSnapshot === null ||
      v.responsableSnapshot === null
    ) {
      return [];
    }
    return [
      {
        incluida: v.incluida,
        porcentajeMedicionCompetencia: v.porcentajeMedicionCompetencia,
        metaCompetenciaSnapshot: v.metaCompetenciaSnapshot,
        plan: {
          codigo: v.codigoSnapshot,
          aspecto: v.aspecto,
          nombre: v.nombreSnapshot,
          plazo: v.plazoSnapshot,
          recursos: v.recursosSnapshot,
          metas: v.metasSnapshot,
          responsable: v.responsableSnapshot,
        },
      },
    ];
  }

  private async exigirActa(id: string): Promise<DatosActa> {
    const acta = await this.actas.porId(id);
    if (acta === null) throw new NoEncontrado('el acta de aprobación', id);
    return acta;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

function nombreDeArchivoSeguro(codigo: string): string {
  return codigo.replace(/[^\w.-]/g, '_');
}

/* ── Consulta y descarga ────────────────────────────────────────────────── */

export interface ArchivoDescargadoActa {
  readonly nombreArchivo: string;
  readonly tipoMime: string;
  readonly contenido: Buffer;
}

export class ConsultarDocumentoActa {
  constructor(
    private readonly documentos: RepositorioDocumentosActaPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumentoActa> {
    await this.exigirLectura(actor);
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) throw new NoEncontrado('el documento', trabajoId);
    return trabajo;
  }

  async listarDeActa(actor: Actor, actaId: string, limite = 20): Promise<TrabajoDocumentoActa[]> {
    await this.exigirLectura(actor);
    return this.documentos.listarDeActa(actaId, limite);
  }

  async descargar(actor: Actor, trabajoId: string): Promise<ArchivoDescargadoActa> {
    const trabajo = await this.estado(actor, trabajoId);

    if (trabajo.estado !== 'Listo') {
      throw new ReglaDeNegocioViolada(
        trabajo.estado === 'Fallido'
          ? (trabajo.error ?? 'La generación del documento falló.')
          : `El documento todavía se está generando (${trabajo.estado}).`,
      );
    }

    const ubicacion = await this.documentos.ubicacionDe(trabajoId);
    if (ubicacion === null || trabajo.nombreArchivo === null || trabajo.tipoMime === null) {
      throw new NoEncontrado('el archivo del documento', trabajoId);
    }

    return {
      nombreArchivo: trabajo.nombreArchivo,
      tipoMime: trabajo.tipoMime,
      contenido: await this.almacen.leer(ubicacion),
    };
  }

  private async exigirLectura(actor: Actor): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, 'actas.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts`
Expected: PASS, los quince tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.ts apps/api/src/modules/mejora-continua/actas/application/use-cases/generar-documento-acta.spec.ts apps/api/src/modules/mejora-continua/actas/domain/events/eventos-actas.ts
git commit -m "feat(actas): GenerarDocumentoActa/ConsultarDocumentoActa, con el paso a Emitida (RF-AC-018/019)"
```

---

### Task 13: `documentos-acta.repository.ts` — repositorio Prisma del trabajo

**Files:**
- Create: `apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.ts`
- Test: `apps/api/test/integration/documentos-acta.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioDocumentosActaPort`, `TipoDocActa`, `EstadoDocActa`, `TrabajoDocumentoActa` (Task 7); modelo `DocumentoActa` de Prisma (Task 1).
- Produces: `DocumentoActaRepositoryPrisma implements RepositorioDocumentosActaPort`. Consumido por Task 14 (wiring).

- [ ] **Step 1: Escribir el test que falla**

```typescript
// apps/api/test/integration/documentos-acta.int.spec.ts

/** Sigue el mismo arranque de Testcontainers que `acta-aprobacion.int.spec.ts` — mirar ese archivo para el `beforeAll`/`afterAll` exactos y reutilizarlos, no un contenedor aparte. */
import { describe, expect, it } from 'vitest';

import { DocumentoActaRepositoryPrisma } from '../../src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.js';

describe('DocumentoActaRepositoryPrisma', () => {
  it('crea un trabajo En cola y lo relee', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();

    const creado = await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: crypto.randomUUID() });
    expect(creado.estado).toBe('En cola');

    const releido = await repo.porId(creado.id);
    expect(releido?.tipo).toBe('ACTA_PDF');
  });

  it('marcarGenerando → marcarListo deja el trabajo Listo con su ubicación', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();
    const creado = await repo.crear({ actaId, tipo: 'ACTA_EXCEL', solicitadoPor: crypto.randomUUID() });

    await repo.marcarGenerando(creado.id);
    await repo.marcarListo(creado.id, { nombreArchivo: 'x.xlsx', tipoMime: 'application/vnd.ms-excel', bytes: 100, ubicacion: '/x.xlsx' });

    const releido = await repo.porId(creado.id);
    expect(releido?.estado).toBe('Listo');
    expect(releido?.bytes).toBe(100);
    expect(await repo.ubicacionDe(creado.id)).toBe('/x.xlsx');
  });

  it('marcarFallido guarda el motivo recortado', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();
    const creado = await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: crypto.randomUUID() });

    await repo.marcarFallido(creado.id, 'x'.repeat(3000));

    const releido = await repo.porId(creado.id);
    expect(releido?.estado).toBe('Fallido');
    expect(releido?.error?.length).toBe(2000);
  });

  it('listarDeActa devuelve del más reciente al más antiguo', async () => {
    const repo = new DocumentoActaRepositoryPrisma(prisma);
    const actaId = await crearActaDePrueba();
    await repo.crear({ actaId, tipo: 'ACTA_PDF', solicitadoPor: crypto.randomUUID() });
    await repo.crear({ actaId, tipo: 'ACTA_EXCEL', solicitadoPor: crypto.randomUUID() });

    const lista = await repo.listarDeActa(actaId, 20);
    expect(lista).toHaveLength(2);
    expect(new Date(lista[0]!.solicitadoEn).getTime()).toBeGreaterThanOrEqual(new Date(lista[1]!.solicitadoEn).getTime());
  });
});
```

Usar el helper que `acta-aprobacion.int.spec.ts` ya tenga para crear una carrera/acta de prueba (llamarlo `crearActaDePrueba` arriba es un nombre de ejemplo — usar el que el archivo existente exponga, o extraerlo a un helper compartido en `apps/api/test/integration/` si hoy vive inline en un solo archivo y hace falta en dos).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run apps/api/test/integration/documentos-acta.int.spec.ts`
Expected: FAIL — `Cannot find module '.../documentos-acta.repository.js'`.

- [ ] **Step 3: Implementar**

```typescript
// apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.ts

/** Calca `documentos-mejora.repository.ts` — mismo problema, misma solución. */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../../platform/database/prisma.service.js';
import type {
  EstadoDocActa,
  RepositorioDocumentosActaPort,
  TipoDocActa,
  TrabajoDocumentoActa,
} from '../../application/ports/documentos-acta.port.js';

const A_DOMINIO: Readonly<Record<string, EstadoDocActa>> = {
  EN_COLA: 'En cola',
  GENERANDO: 'Generando',
  LISTO: 'Listo',
  FALLIDO: 'Fallido',
};

@Injectable()
export class DocumentoActaRepositoryPrisma implements RepositorioDocumentosActaPort {
  constructor(private readonly prisma: PrismaService) {}

  async crear(datos: { actaId: string; tipo: TipoDocActa; solicitadoPor: string }): Promise<TrabajoDocumentoActa> {
    const fila = await this.prisma.documentoActa.create({
      data: { actaId: datos.actaId, tipo: datos.tipo, solicitadoPor: datos.solicitadoPor },
    });
    return aTrabajo(fila);
  }

  async porId(id: string): Promise<TrabajoDocumentoActa | null> {
    const fila = await this.prisma.documentoActa.findUnique({ where: { id } });
    return fila ? aTrabajo(fila) : null;
  }

  async listarDeActa(actaId: string, limite: number): Promise<TrabajoDocumentoActa[]> {
    const filas = await this.prisma.documentoActa.findMany({
      where: { actaId },
      orderBy: { solicitadoEn: 'desc' },
      take: limite,
    });
    return filas.map(aTrabajo);
  }

  async marcarGenerando(id: string): Promise<void> {
    await this.prisma.documentoActa.update({ where: { id }, data: { estado: 'GENERANDO', error: null } });
  }

  async marcarListo(
    id: string,
    resultado: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void> {
    await this.prisma.documentoActa.update({
      where: { id },
      data: {
        estado: 'LISTO',
        nombreArchivo: resultado.nombreArchivo,
        tipoMime: resultado.tipoMime,
        bytes: resultado.bytes,
        ubicacion: resultado.ubicacion,
        error: null,
        terminadoEn: new Date(),
      },
    });
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    await this.prisma.documentoActa.update({
      where: { id },
      data: { estado: 'FALLIDO', error: error.slice(0, 2000), terminadoEn: new Date() },
    });
  }

  async ubicacionDe(id: string): Promise<string | null> {
    const fila = await this.prisma.documentoActa.findUnique({ where: { id }, select: { ubicacion: true } });
    return fila?.ubicacion ?? null;
  }
}

function aTrabajo(fila: {
  id: string;
  actaId: string;
  tipo: string;
  estado: string;
  nombreArchivo: string | null;
  tipoMime: string | null;
  bytes: number | null;
  error: string | null;
  solicitadoEn: Date;
  terminadoEn: Date | null;
}): TrabajoDocumentoActa {
  return {
    id: fila.id,
    actaId: fila.actaId,
    tipo: fila.tipo as TipoDocActa,
    estado: A_DOMINIO[fila.estado] ?? 'En cola',
    nombreArchivo: fila.nombreArchivo,
    tipoMime: fila.tipoMime,
    bytes: fila.bytes,
    error: fila.error,
    solicitadoEn: fila.solicitadoEn,
    terminadoEn: fila.terminadoEn,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx vitest run apps/api/test/integration/documentos-acta.int.spec.ts`
Expected: PASS, los cuatro tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.ts apps/api/test/integration/documentos-acta.int.spec.ts
git commit -m "feat(actas): repositorio Prisma de documentos del acta (RF-AC-018/019)"
```

---

### Task 14: Wiring — `ModuloDeDocumentos` y `app.module.ts`

**Files:**
- Modify: `apps/api/src/platform/documentos/puertos.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: todo lo de Tasks 6-13.
- Produces: el módulo completo queda inyectable y el worker puede despachar trabajos de actas.

Sin test propio de unidad — se verifica con Task 16 (integración end-to-end) y con que la app arranque.

- [ ] **Step 1: Agregar el nuevo módulo a `ModuloDeDocumentos`**

En `apps/api/src/platform/documentos/puertos.ts`, reemplazar:

```typescript
export type ModuloDeDocumentos =
  'plan-estudios' | 'mejora-continua' | 'mejora-continua-evaluacion' | 'mejora-continua-mejora';
```

por:

```typescript
export type ModuloDeDocumentos =
  | 'plan-estudios'
  | 'mejora-continua'
  | 'mejora-continua-evaluacion'
  | 'mejora-continua-mejora'
  | 'mejora-continua-actas';
```

- [ ] **Step 2: Registrar los providers en `app.module.ts`**

Agregar los imports nuevos junto a los de `documentos-mejora`/`generar-documento-mejora` existentes:

```typescript
import {
  REPOSITORIO_DOCUMENTOS_ACTA,
  RENDERIZADOR_PDF_ACTA,
  RENDERIZADOR_EXCEL_ACTA,
  type RepositorioDocumentosActaPort,
  type RenderizadorPdfActaPort,
  type RenderizadorExcelActaPort,
} from './modules/mejora-continua/actas/application/ports/documentos-acta.port.js';
import { DocumentoActaRepositoryPrisma } from './modules/mejora-continua/actas/infrastructure/persistence/documentos-acta.repository.js';
import {
  ConsultarDocumentoActa,
  GenerarDocumentoActa,
} from './modules/mejora-continua/actas/application/use-cases/generar-documento-acta.use-case.js';
import { RenderizadorPdfActaKit } from './modules/mejora-continua/actas/infrastructure/documentos/pdfkit-acta.renderer.js';
import { RenderizadorExcelActaJs } from './modules/mejora-continua/actas/infrastructure/documentos/exceljs-acta.renderer.js';
import {
  DocumentosDelActaController,
  DocumentosActaController,
} from './modules/mejora-continua/actas/infrastructure/http/documentos-acta.controller.js';
```

Junto al `provide: REPOSITORIO_DOCUMENTOS_MEJORA` existente, agregar los providers de renderer, repositorio y casos de uso propios de Actas:

```typescript
    { provide: RENDERIZADOR_PDF_ACTA, useClass: RenderizadorPdfActaKit },
    { provide: RENDERIZADOR_EXCEL_ACTA, useClass: RenderizadorExcelActaJs },
    { provide: REPOSITORIO_DOCUMENTOS_ACTA, useClass: DocumentoActaRepositoryPrisma },
    {
      provide: GenerarDocumentoActa,
      inject: [
        REPOSITORIO_DOCUMENTOS_ACTA,
        REPOSITORIO_ACTA_APROBACION,
        REPOSITORIO_PLAN_MEJORA,
        COLA_DOCUMENTOS,
        ALMACEN_ARCHIVOS,
        RENDERIZADOR_PDF_ACTA,
        RENDERIZADOR_EXCEL_ACTA,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
      ],
      useFactory: (
        documentos: RepositorioDocumentosActaPort,
        actas: RepositorioActaAprobacionPort,
        planes: RepositorioPlanMejoraPort,
        cola: ColaDeDocumentosPort,
        almacen: AlmacenDeArchivosPort,
        pdf: RenderizadorPdfActaPort,
        excel: RenderizadorExcelActaPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GenerarDocumentoActa(documentos, actas, planes, cola, almacen, pdf, excel, autorizacion, eventos),
    },
    {
      provide: ConsultarDocumentoActa,
      inject: [REPOSITORIO_DOCUMENTOS_ACTA, ALMACEN_ARCHIVOS, AUTHORIZATION_PORT],
      useFactory: (
        documentos: RepositorioDocumentosActaPort,
        almacen: AlmacenDeArchivosPort,
        autorizacion: AuthorizationPort,
      ) => new ConsultarDocumentoActa(documentos, almacen, autorizacion),
    },
```

(`REPOSITORIO_ACTA_APROBACION`, `REPOSITORIO_PLAN_MEJORA`, `COLA_DOCUMENTOS`, `ALMACEN_ARCHIVOS`, `AUTHORIZATION_PORT`, `PUBLICADOR_EVENTOS` ya están importados en el archivo — no se repiten.)

Agregar `DocumentosDelActaController, DocumentosActaController` al arreglo `controllers: [...]` del `@Module` (junto a `DocumentosDelPlanMejoraController, DocumentosMejoraController` — Task 15 crea esas clases).

Actualizar el factory de `GENERADORES_DE_DOCUMENTOS` (agregar `GenerarDocumentoActa` a `inject` y al objeto devuelto):

```typescript
      provide: GENERADORES_DE_DOCUMENTOS,
      inject: [
        GenerarDocumento,
        GenerarDocumentoMedicion,
        GenerarDocumentoEvaluacion,
        GenerarDocumentoMejora,
        GenerarDocumentoActa,
      ],
      useFactory: (
        planEstudios: GenerarDocumento,
        medicion: GenerarDocumentoMedicion,
        evaluacion: GenerarDocumentoEvaluacion,
        mejora: GenerarDocumentoMejora,
        actas: GenerarDocumentoActa,
      ) => ({
        'plan-estudios': planEstudios,
        'mejora-continua': medicion,
        'mejora-continua-evaluacion': evaluacion,
        'mejora-continua-mejora': mejora,
        'mejora-continua-actas': actas,
      }),
```

- [ ] **Step 3: Verificar que la app arranca**

Run: `cd apps/api && npx tsc --noEmit`
Expected: FAIL solo por `documentos-acta.controller.ts` (Task 15) todavía no existir — confirmar que ese es el único error.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/platform/documentos/puertos.ts apps/api/src/app.module.ts
git commit -m "feat(actas): registra el modulo de documentos de actas en la cola y el contenedor DI (RF-AC-018/019)"
```

---
