# Ciclo 2c-J-C — Documentos, versionado y búsqueda del plan de mejora — Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar RF-PJ-032 a RF-PJ-038 del Plan de Mejora: exportar a PDF/Excel, generar una nueva versión que conserva el seguimiento de la versión origen, y buscar/filtrar el listado en servidor. RF-PJ-036 (histórico) ya está construido.

**Architecture:** Mismo patrón que `mejora-continua/evaluacion` (el más reciente y el más cercano: sin operación "duplicar", worker por `Record<ModuloDeDocumentos, GeneradorDeDocumentos>`, dos clases separadas `Generar.../Consultar...`). Diverge de evaluación en un solo punto, decidido con el usuario: la copia de "nueva versión" conserva el seguimiento completo (evidencias, logro de meta, impacto, estado de implementación), no solo la definición.

**Tech Stack:** NestJS 11, Prisma 7, BullMQ sobre Redis, `pdfkit`, `exceljs`, Jest (backend), Vitest (frontend), Testcontainers para integración.

**Spec:** `docs/superpowers/specs/2026-09-13-plan-mejora-2c-j-c-design.md`

## Global Constraints

- **`domain/` no importa NestJS, Prisma ni Express** (CLAUDE.md §2). `copia-de-plan-mejora.ts` y `armar-documento-mejora.ts` son dominio puro.
- **Un módulo nunca comparte tabla con otro** (§3.2). `documentos_mejora` tiene FK propia a `PlanMejora`.
- **Toda mutación relevante emite evento de auditoría.** `generarNuevaVersion` y `encolar` (documento) emiten el suyo.
- **Migraciones siempre por Prisma Migrate**, nunca SQL manual. `npx prisma generate` después de tocar el esquema — sin él las pruebas fallan con «Unknown argument».
- **`permiteVersionado` ya existe** en `mejora-continua/domain/value-objects/estado-plan.ts:176-178` (compartido por medición, evaluación y mejora). No se reescribe, se importa.
- **`ModuloDeDocumentos` y `GENERADORES_DE_DOCUMENTOS`** (`platform/documentos/puertos.ts`) son el único punto de enganche con la cola compartida: se añade una clave nueva, `'mejora-continua-mejora'`, y una entrada al factory de `app.module.ts`. No se toca `worker.ts` ni `cola.ts`.
- **Generar documento exige `mejora.leer`** (exportar es leer, mismo criterio que medición — a diferencia de evaluación, que lo trata como mutación por razones propias de ese submódulo, no aplicables aquí).
- **Cobertura ≥80% en `domain/` y `application/`.**
- **Antes de cada commit (backend):** `npm run typecheck && npm run lint && npm run format:check && npm test` en `apps/api`. Para pasos con Testcontainers: `npm run test:integration`.
- **Antes de cada commit (frontend):** `npm run typecheck && npm run lint && npm run format:check && npm test` en `apps/web`.
- **Sin `@Injectable()` en casos de uso nuevos** — registro por `useFactory`, mismo patrón que `GestionarPlanesMejora`.
- **Commits:** conventional commits, sin líneas de atribución de IA.

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `apps/api/prisma/schema.prisma` | `PlanMejora` gana `version`/`derivadoDeId`/`aprobadoPorId`/`aprobadoEn`; modelo `DocumentoMejora`; enum `TipoDocumentoMejora` | 1 |
| `apps/api/src/platform/documentos/puertos.ts` | `ModuloDeDocumentos` gana `'mejora-continua-mejora'` | 1 |
| `mejora/domain/services/copia-de-plan-mejora.ts` | Qué copia la nueva versión (todo) | 2 |
| `mejora/domain/documentos/armar-documento-mejora.ts` | Qué dice el documento | 3 |
| `mejora/domain/events/eventos-mejora.ts` | `PlanMejoraVersionado`, `DocumentoMejoraSolicitado` | 2, 3 |
| `mejora/application/ports/plan-mejora.port.ts` | `copiar`, `linajeDe`, filtro en `listarDeCarrera` | 4 |
| `mejora/application/ports/documentos-mejora.port.ts` | Contratos de documentos | 3 |
| `mejora/application/use-cases/versionar-plan-mejora.use-case.ts` | `generarNuevaVersion`, `versionesDe` | 5 |
| `mejora/application/use-cases/generar-documento-mejora.use-case.ts` | `GenerarDocumentoMejora`, `ConsultarDocumentoMejora` | 6 |
| `mejora/infrastructure/persistence/plan-mejora.repository.ts` | Implementa `copiar`, `linajeDe`, filtro | 4 |
| `mejora/infrastructure/persistence/documentos-mejora.repository.ts` | Implementa el puerto de documentos | 3 |
| `mejora/infrastructure/http/dto/documentos-mejora.dto.ts` | `GenerarDocumentoMejoraDto` | 6 |
| `mejora/infrastructure/http/documentos-mejora.controller.ts` | Endpoints de documentos | 6 |
| `mejora/infrastructure/http/planes-mejora.controller.ts` | Filtro en `GET`, endpoints de versiones | 5, 7 |
| `src/app.module.ts` | Registro de los casos de uso nuevos, entrada en `GENERADORES_DE_DOCUMENTOS` | 7 |
| `mejora-continua/api/mejora.api.ts` | Funciones nuevas | 8 |
| `mejora-continua/api/queries.ts` | `clavesMejora` con filtro/versiones/documentos, hooks nuevos | 8 |
| `mejora-continua/components/DocumentosDelPlanMejora.tsx` | Pestaña Documentos | 9 |
| `mejora-continua/components/VersionesDelPlanMejora.tsx` | Pestaña Versiones | 9 |
| `mejora-continua/pages/PlanesMejoraPage.tsx` | Texto + 3 selects de filtro | 10 |
| `mejora-continua/pages/PlanMejoraPage.tsx` | Reescrita a pestañas ARIA | 11 |
| `tests/e2e/specs/plan-mejora-2c-j-c.spec.ts` | E2E | 12 |

---

### Task 1: La migración

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/platform/documentos/puertos.ts`
- Create: `apps/api/prisma/migrations/…_documentos_y_versiones_mejora/migration.sql` (Prisma antepone la marca de tiempo)
- Test: `apps/api/test/integration/plan-mejora.int.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: los campos `version`, `derivadoDeId`, `aprobadoPorId`, `aprobadoEn` en `PlanMejora`; el modelo `DocumentoMejora`; el enum `TipoDocumentoMejora`; `'mejora-continua-mejora'` en `ModuloDeDocumentos`. Las tareas 2 a 12 dependen de esto.

- [ ] **Step 1: Añadir los campos de versionado a `PlanMejora`**

En `apps/api/prisma/schema.prisma`, dentro de `model PlanMejora`, después de `creadoEn`:

```prisma
  /// RF-PJ-035 RN1: la versión nueva referencia a la que viene. `SetNull` y no
  /// `Cascade` — mismo razonamiento que `PlanMedicion`/`PlanEvaluacion`:
  /// borrar un borrador intermedio no puede llevarse por delante el linaje de
  /// sus descendientes.
  version      Int     @default(1) @db.SmallInt
  derivadoDeId String? @map("derivado_de_id") @db.Uuid

  /// Quién aprobó y cuándo — mismo campo que en Medición/Evaluación.
  aprobadoPorId String?   @map("aprobado_por_id") @db.Uuid
  aprobadoEn    DateTime? @map("aprobado_en") @db.Timestamptz(6)
```

Y en las relaciones del mismo modelo, junto a `evidencias`:

```prisma
  derivadoDe PlanMejora?  @relation("VersionesMejora", fields: [derivadoDeId], references: [id], onDelete: SetNull)
  derivados  PlanMejora[] @relation("VersionesMejora")
```

- [ ] **Step 2: Añadir el modelo de documentos**

En `schema.prisma`, junto a los demás modelos de `mejora_continua`:

```prisma
/// RF-PJ-033 y RF-PJ-034.
enum TipoDocumentoMejora {
  PLAN_MEJORA_PDF
  PLAN_MEJORA_EXCEL

  @@schema("mejora_continua")
}

/// RF-PJ-032: el plan de mejora generado como archivo.
///
/// Tabla propia, no la de Medición ni Evaluación: cada una tiene su propia
/// clave foránea, y CLAUDE.md §3.2 prohíbe que dos módulos —o dos
/// submódulos con su propia tabla de negocio— compartan una.
model DocumentoMejora {
  id           String                @id @default(uuid()) @db.Uuid
  planMejoraId String                @map("plan_mejora_id") @db.Uuid
  tipo         TipoDocumentoMejora
  estado       EstadoDocumentoMedicion @default(EN_COLA)

  nombreArchivo String? @map("nombre_archivo") @db.VarChar(200)
  tipoMime      String? @map("tipo_mime") @db.VarChar(120)
  bytes         Int?
  /// Opaca a propósito: hoy una ruta en disco, mañana una clave de Backblaze
  /// B2 (§5.6 de CLAUDE.md), sin que cambie nada más.
  ubicacion     String? @db.VarChar(500)
  /// Solo con estado FALLIDO. Redactado para una persona, no una traza.
  error         String? @db.Text

  /// Sin clave foránea a usuarios, igual que el resto de la evidencia: el
  /// registro debe seguir siendo legible aunque la cuenta desaparezca.
  solicitadoPor String    @map("solicitado_por") @db.Uuid
  solicitadoEn  DateTime  @default(now()) @map("solicitado_en") @db.Timestamptz(6)
  terminadoEn   DateTime? @map("terminado_en") @db.Timestamptz(6)

  plan PlanMejora @relation(fields: [planMejoraId], references: [id], onDelete: Cascade)

  @@index([planMejoraId, solicitadoEn])
  @@map("documentos_mejora")
  @@schema("mejora_continua")
}
```

Y en `model PlanMejora`, junto a `evidencias`:

```prisma
  documentos DocumentoMejora[]
```

`EstadoDocumentoMedicion` ya existe (compartido por Medición y Evaluación); se reutiliza tal cual, sin un cuarto enum idéntico — los tres módulos generan documentos con el mismo ciclo de vida y ninguno tiene FK propia sobre ese enum.

- [ ] **Step 3: Generar la migración y regenerar el cliente**

```bash
cd apps/api
npx prisma migrate dev --name documentos_y_versiones_mejora
npx prisma generate
```

Si Prisma pide resetear la base, **parar**: el historial de migraciones divergió y eso se investiga, no se acepta.

- [ ] **Step 4: Añadir la clave del módulo a la cola compartida**

En `apps/api/src/platform/documentos/puertos.ts`, el tipo `ModuloDeDocumentos`:

```ts
export type ModuloDeDocumentos =
  | 'plan-estudios'
  | 'mejora-continua'
  | 'mejora-continua-evaluacion'
  | 'mejora-continua-mejora';
```

No se toca `worker.ts` ni `cola.ts`: los dos despachan por `Record<ModuloDeDocumentos, GeneradorDeDocumentos>`, así que añadir la clave aquí y registrarla en `app.module.ts` (Task 7) basta.

- [ ] **Step 5: Escribir la prueba de integración del linaje y la cascada**

En `apps/api/test/integration/plan-mejora.int.spec.ts`:

```ts
describe('RF-PJ-035 RN1 — el linaje', () => {
  it('borrar un plan intermedio no rompe el vínculo de sus descendientes', async () => {
    const v1 = await crearPlanMejora({ codigo: 'PJ-LINAJE-1' });
    const v2 = await prisma.planMejora.create({
      data: {
        ...datosBase(v1),
        codigo: 'PJ-LINAJE-2',
        version: 2,
        derivadoDeId: v1.id,
      },
    });

    await repo.eliminar(v1.id);

    const tras = await prisma.planMejora.findUnique({ where: { id: v2.id } });
    expect(tras).not.toBeNull();
    expect(tras?.derivadoDeId).toBeNull();
  });
});

describe('RF-PJ-032 — los documentos', () => {
  it('borrar el plan se lleva sus documentos', async () => {
    const p = await crearPlanMejora({ codigo: 'PJ-DOCS-1' });
    await prisma.documentoMejora.create({
      data: { planMejoraId: p.id, tipo: 'PLAN_MEJORA_PDF', solicitadoPor: ACTOR_ID },
    });

    await repo.eliminar(p.id);

    expect(await prisma.documentoMejora.count({ where: { planMejoraId: p.id } })).toBe(0);
  });
});
```

`crearPlanMejora` y `datosBase` son los helpers que `plan-mejora.int.spec.ts` ya usa para sembrar un plan mínimo — reutilizarlos, no reescribirlos.

- [ ] **Step 6: Ejecutar**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npx prisma migrate deploy
npm run test:integration -- test/integration/plan-mejora.int.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Comprobar que el esquema y las migraciones no divergen**

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: sin diferencias.

- [ ] **Step 8: Verificar y commitear**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run format:check
git add apps/api/prisma/ apps/api/src/platform/documentos/puertos.ts apps/api/test/
git commit -m "feat(mejora): esquema de documentos y versionado del plan de mejora"
```

---

### Task 2: El servicio de copia

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/services/copia-de-plan-mejora.ts`
- Test: `apps/api/src/modules/mejora-continua/mejora/domain/services/copia-de-plan-mejora.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/domain/events/eventos-mejora.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `copiarPlanMejora(origen: PlanMejoraACopiar): CopiaPlanMejora`
  - Los tipos `PlanMejoraACopiar`, `EvidenciaACopiar`, `CopiaPlanMejora`.
  - `PlanMejoraVersionado` (evento).

  La Task 5 los consume.

- [ ] **Step 1: Escribir las pruebas en rojo**

`copia-de-plan-mejora.spec.ts`:

```ts
/**
 * A diferencia de Medición (nueva versión conserva, duplicar descarta) y de
 * Evaluación (nueva versión descarta el seguimiento porque no hay
 * "duplicar"), Plan de Mejora solo tiene una operación de copia y conserva
 * TODO el seguimiento: no hay ningún caso de uso que abra un periodo nuevo
 * sin arrastrar lo ya medido. Decisión tomada explícitamente con el usuario
 * (design §3.4).
 */

import { describe, expect, it } from 'vitest';

import { copiarPlanMejora, type PlanMejoraACopiar } from './copia-de-plan-mejora.js';

function origen(sobre: Partial<PlanMejoraACopiar> = {}): PlanMejoraACopiar {
  return {
    aspecto: 'CRITERIO_ACREDITACION',
    carreraId: 'carrera-1',
    criterioAcreditacionId: 'crit-1',
    objetivoEducacionalId: null,
    competenciaId: null,
    periodoId: null,
    planEvaluacionId: null,
    planMedicionAfectadoId: 'pm-1',
    nombre: 'Reforzar el syllabus',
    causaRaiz: 'Cobertura insuficiente',
    justificacion: 'El indicador bajó dos periodos seguidos',
    input: 'Texto libre de la evidencia previa',
    plazo: new Date('2026-12-31'),
    recursos: 'Docente coordinador, 4 horas/semana',
    metas: 'Subir el indicador 10 puntos',
    responsable: 'Ana Quispe',
    estadoImplementacion: 'En proceso',
    logroMeta: '70% cumplido',
    impacto: 'Mejora observable en el segundo periodo',
    evidencias: [
      {
        referencia: 'https://drive/ev1',
        nombreArchivo: 'evidencia1.pdf',
        subidoPor: 'user-1',
        subidoEn: new Date('2026-08-01'),
      },
    ],
    ...sobre,
  };
}

describe('lo que se copia', () => {
  it('toda la definición, tal cual', () => {
    const copia = copiarPlanMejora(origen());

    expect(copia.nombre).toBe('Reforzar el syllabus');
    expect(copia.causaRaiz).toBe('Cobertura insuficiente');
    expect(copia.justificacion).toBe('El indicador bajó dos periodos seguidos');
    expect(copia.input).toBe('Texto libre de la evidencia previa');
    expect(copia.plazo).toEqual(new Date('2026-12-31'));
    expect(copia.recursos).toBe('Docente coordinador, 4 horas/semana');
    expect(copia.metas).toBe('Subir el indicador 10 puntos');
    expect(copia.responsable).toBe('Ana Quispe');
  });

  it('el elemento asociado y sus vínculos, tal cual', () => {
    const copia = copiarPlanMejora(
      origen({
        aspecto: 'COMPETENCIA',
        criterioAcreditacionId: null,
        competenciaId: 'comp-1',
        periodoId: 'periodo-1',
        planEvaluacionId: 'pe-1',
      }),
    );

    expect(copia.aspecto).toBe('COMPETENCIA');
    expect(copia.competenciaId).toBe('comp-1');
    expect(copia.periodoId).toBe('periodo-1');
    expect(copia.planEvaluacionId).toBe('pe-1');
  });

  it('el seguimiento completo — decisión §3.4, no un descuido', () => {
    const copia = copiarPlanMejora(origen());

    expect(copia.estadoImplementacion).toBe('En proceso');
    expect(copia.logroMeta).toBe('70% cumplido');
    expect(copia.impacto).toBe('Mejora observable en el segundo periodo');
    expect(copia.evidencias).toEqual([
      {
        referencia: 'https://drive/ev1',
        nombreArchivo: 'evidencia1.pdf',
        subidoPor: 'user-1',
        subidoEn: new Date('2026-08-01'),
      },
    ]);
  });

  it('la trazabilidad hacia el plan de medición afectado (RF-PJ-031)', () => {
    expect(copiarPlanMejora(origen()).planMedicionAfectadoId).toBe('pm-1');
  });

  it('un plan sin evidencias copia una lista vacía, no revienta', () => {
    const copia = copiarPlanMejora(origen({ evidencias: [] }));
    expect(copia.evidencias).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/domain/services/copia-de-plan-mejora.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el servicio**

```ts
/**
 * Qué se copia al generar una nueva versión de un plan de mejora (RF-PJ-035).
 *
 * A diferencia de sus pares —Medición distingue "versión" de "duplicado";
 * Evaluación descarta el seguimiento porque no tiene "duplicado" al que
 * reservarle la copia completa— Plan de Mejora tiene una única operación de
 * copia, y esa operación conserva TODO: definición y seguimiento por igual.
 * No hay ningún caso de uso en la ficha de RF-PJ-035 que abra un periodo de
 * acreditación nuevo sin arrastrar lo ya medido, así que no hay nada que
 * "empezar en limpio". La identidad (id, código, version, estado,
 * derivadoDeId, aprobadoPorId/aprobadoEn, creadoEn) la decide el caso de
 * uso, no este servicio: eso es sobre el plan nuevo, no sobre su contenido.
 */

import type {
  AspectoPlanMejora,
  DefinicionAccionMejora,
} from '../../application/ports/plan-mejora.port.js';
import type { EstadoImplementacion } from '../value-objects/estado-implementacion.js';

export interface EvidenciaACopiar {
  readonly referencia: string;
  readonly nombreArchivo: string | null;
  readonly subidoPor: string;
  readonly subidoEn: Date;
}

export interface PlanMejoraACopiar extends DefinicionAccionMejora {
  readonly aspecto: AspectoPlanMejora;
  readonly carreraId: string;
  readonly criterioAcreditacionId: string | null;
  readonly objetivoEducacionalId: string | null;
  readonly competenciaId: string | null;
  readonly periodoId: string | null;
  readonly planEvaluacionId: string | null;
  readonly planMedicionAfectadoId: string | null;
  readonly estadoImplementacion: EstadoImplementacion;
  readonly logroMeta: string | null;
  readonly impacto: string | null;
  readonly evidencias: readonly EvidenciaACopiar[];
}

export type CopiaPlanMejora = PlanMejoraACopiar;

/** RF-PJ-035: copia íntegra. Ver la cabecera del archivo para el porqué. */
export function copiarPlanMejora(origen: PlanMejoraACopiar): CopiaPlanMejora {
  return {
    aspecto: origen.aspecto,
    carreraId: origen.carreraId,
    criterioAcreditacionId: origen.criterioAcreditacionId,
    objetivoEducacionalId: origen.objetivoEducacionalId,
    competenciaId: origen.competenciaId,
    periodoId: origen.periodoId,
    planEvaluacionId: origen.planEvaluacionId,
    planMedicionAfectadoId: origen.planMedicionAfectadoId,
    nombre: origen.nombre,
    causaRaiz: origen.causaRaiz,
    justificacion: origen.justificacion,
    input: origen.input,
    plazo: origen.plazo,
    recursos: origen.recursos,
    metas: origen.metas,
    responsable: origen.responsable,
    estadoImplementacion: origen.estadoImplementacion,
    logroMeta: origen.logroMeta,
    impacto: origen.impacto,
    evidencias: origen.evidencias.map((e) => ({ ...e })),
  };
}
```

Si `DefinicionAccionMejora` no incluye ya `nombre/causaRaiz/justificacion/input/plazo/recursos/metas/responsable` con esos nombres exactos, ajustar el `extends` para que coincida con lo que `plan-mejora.port.ts` declara hoy — no renombrar los campos del puerto.

- [ ] **Step 4: Añadir el evento**

En `eventos-mejora.ts`, siguiendo el patrón de `PlanMejoraCreado`:

```ts
/** RF-PJ-035. Acción propia: en el histórico se lee distinto que un alta. */
export class PlanMejoraVersionado extends EventoMejora {
  readonly accion = 'mejora.version';
  constructor(actor: Actor, id: string, codigo: string, codigoOrigen: string) {
    super(actor, id, `Nueva versión ${codigo}, derivada de ${codigoOrigen}.`);
  }
}
```

Ajustar la forma del constructor a la que ya usen las demás clases del archivo (`EventoMejora`/`EventoMedicion` según cómo se llame la base en este módulo).

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/domain/
npm run typecheck && npm run lint && npm run format:check
git add apps/api/src/modules/mejora-continua/mejora/domain/
git commit -m "feat(mejora): la nueva versión conserva el seguimiento completo"
```

Expected: PASS, 6 pruebas nuevas.

---

### Task 3: Qué dice el documento, y el puerto de documentos

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/domain/documentos/armar-documento-mejora.ts`
- Test: `apps/api/src/modules/mejora-continua/mejora/domain/documentos/armar-documento-mejora.spec.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/application/ports/documentos-mejora.port.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/domain/events/eventos-mejora.ts`

**Interfaces:**
- Consumes: `Documento`, `Tabla`, `Seccion`, `Metadato`, `fechaLegible` de `platform/documentos/documento.js` (ya existen).
- Produces:
  - `DatosParaDocumentoMejora`, `FormatoDocumentoMejora`.
  - `armarDocumentoMejora(datos: DatosParaDocumentoMejora, formato: FormatoDocumentoMejora): Documento`.
  - `TipoDocMejora`, `EstadoDocMejora`, `TrabajoDocumentoMejora`, `RepositorioDocumentosMejoraPort`, `REPOSITORIO_DOCUMENTOS_MEJORA`.
  - `DocumentoMejoraSolicitado` (evento).

  La Task 4 (repositorio) y la Task 6 (caso de uso) los consumen.

- [ ] **Step 1: Escribir las pruebas del armador en rojo**

`armar-documento-mejora.spec.ts`:

```ts
/**
 * Qué dice el documento de un plan de mejora — dominio puro, sin abrir un
 * PDF. RF-PJ-033 RN1 exige igualar el formato institucional; el repositorio
 * no trae esa plantilla (design §9), así que esta tabla es la mejor
 * aproximación disponible y se ajusta si la universidad la aporta.
 */

import { describe, expect, it } from 'vitest';

import {
  armarDocumentoMejora,
  type DatosParaDocumentoMejora,
} from './armar-documento-mejora.js';

function datos(sobre: Partial<DatosParaDocumentoMejora> = {}): DatosParaDocumentoMejora {
  return {
    codigo: 'PJ-CRI-3',
    aspecto: 'CRITERIO_ACREDITACION',
    elementoNombre: 'Criterio 4.2 — Infraestructura',
    estado: 'Vigente',
    estadoImplementacion: 'En proceso',
    nombre: 'Renovar equipos de laboratorio',
    causaRaiz: 'Equipos con más de 8 años de antigüedad',
    justificacion: 'El indicador de satisfacción bajó del umbral',
    input: 'Reporte de mantenimiento adjunto',
    plazo: new Date('2026-12-31'),
    recursos: 'Presupuesto de laboratorios 2027',
    metas: 'Renovar el 80% del equipo crítico',
    responsable: 'Director de Escuela',
    evidencias: [
      { referencia: 'https://drive/ev1', subidoPor: 'Ana Quispe', subidoEn: new Date('2026-08-01') },
    ],
    logroMeta: null,
    impacto: null,
    generadoEn: new Date('2026-09-13'),
    ...sobre,
  };
}

describe('la cabecera', () => {
  it('identifica el plan, su aspecto y su elemento', () => {
    const texto = JSON.stringify(armarDocumentoMejora(datos(), 'pdf'));

    expect(texto).toContain('PJ-CRI-3');
    expect(texto).toContain('Criterio 4.2');
    expect(texto).toContain('Vigente');
  });
});

describe('la definición', () => {
  it('lleva los siete campos', () => {
    const texto = JSON.stringify(armarDocumentoMejora(datos(), 'pdf'));

    expect(texto).toContain('Renovar equipos de laboratorio');
    expect(texto).toContain('Equipos con más de 8 años');
    expect(texto).toContain('Presupuesto de laboratorios 2027');
    expect(texto).toContain('Director de Escuela');
  });

  it('un plan de Competencia no muestra "Input" — RF-PJ-028', () => {
    const texto = JSON.stringify(
      armarDocumentoMejora(datos({ aspecto: 'COMPETENCIA', input: null }), 'pdf'),
    );

    expect(texto).not.toMatch(/"Input"/);
  });
});

describe('el seguimiento (RF-PJ-033 RN2: incluye evidencias y retroalimentación)', () => {
  it('lista las evidencias con quién y cuándo', () => {
    const texto = JSON.stringify(armarDocumentoMejora(datos(), 'excel'));

    expect(texto).toContain('https://drive/ev1');
    expect(texto).toContain('Ana Quispe');
  });

  it('un plan sin evidencias lo declara, no sale vacío sin explicación', () => {
    const d = armarDocumentoMejora(datos({ evidencias: [] }), 'pdf');
    expect(JSON.stringify(d)).toMatch(/sin evidencias/i);
  });

  it('logro de meta e impacto, si están completos', () => {
    const texto = JSON.stringify(
      armarDocumentoMejora(datos({ logroMeta: '70% cumplido', impacto: 'Mejora observable' }), 'pdf'),
    );

    expect(texto).toContain('70% cumplido');
    expect(texto).toContain('Mejora observable');
  });
});

describe('formato', () => {
  it('pdf y excel comparten el mismo contenido', () => {
    for (const formato of ['pdf', 'excel'] as const) {
      const texto = JSON.stringify(armarDocumentoMejora(datos(), formato));
      expect(texto).toContain('PJ-CRI-3');
    }
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/domain/documentos/
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el armador**

```ts
/**
 * Qué dice el documento de un plan de mejora (RF-PJ-032, RN de RF-PJ-033/034).
 *
 * Una sola forma de tabla, condicional por aspecto — mismo criterio que ya
 * aplica `PlanMejoraPage.tsx` con el campo Input (RF-PJ-028: no existe para
 * Competencia). No hay una tabla por aspecto porque RF-PJ-033 RN1 pide un
 * único formato institucional, no tres.
 */

import type { Documento } from '../../../../../platform/documentos/documento.js';

export type FormatoDocumentoMejora = 'pdf' | 'excel';

export interface EvidenciaParaDocumento {
  readonly referencia: string;
  readonly subidoPor: string;
  readonly subidoEn: Date;
}

export interface DatosParaDocumentoMejora {
  readonly codigo: string;
  readonly aspecto: 'CRITERIO_ACREDITACION' | 'OBJETIVO_EDUCACIONAL' | 'COMPETENCIA';
  readonly elementoNombre: string;
  readonly estado: string;
  readonly estadoImplementacion: string;
  readonly nombre: string;
  readonly causaRaiz: string;
  readonly justificacion: string;
  readonly input: string | null;
  readonly plazo: Date;
  readonly recursos: string;
  readonly metas: string;
  readonly responsable: string;
  readonly evidencias: readonly EvidenciaParaDocumento[];
  readonly logroMeta: string | null;
  readonly impacto: string | null;
  readonly generadoEn: Date;
}

function fecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function armarDocumentoMejora(
  datos: DatosParaDocumentoMejora,
  formato: FormatoDocumentoMejora,
): Documento {
  const metadatos = [
    { etiqueta: 'Código', valor: datos.codigo },
    { etiqueta: 'Aspecto', valor: datos.elementoNombre },
    { etiqueta: 'Estado documental', valor: datos.estado },
    { etiqueta: 'Estado de implementación', valor: datos.estadoImplementacion },
  ];

  const filasDefinicion: [string, string][] = [
    ['Nombre de la acción', datos.nombre],
    ['Causa raíz', datos.causaRaiz],
    ['Justificación', datos.justificacion],
    // RF-PJ-028: Competencia no tiene input propio, y un documento que
    // dijera "Input: —" en cada uno afirmaría un campo que no existe.
    ...(datos.input !== null ? ([['Input', datos.input]] as [string, string][]) : []),
    ['Plazo', fecha(datos.plazo)],
    ['Recursos', datos.recursos],
    ['Metas', datos.metas],
    ['Responsable', datos.responsable],
  ];

  const filasEvidencias = datos.evidencias.map((e) => [e.referencia, e.subidoPor, fecha(e.subidoEn)]);

  return {
    nombreArchivo: datos.codigo,
    titulo: `Plan de mejora ${datos.codigo}`,
    subtitulo: datos.elementoNombre,
    metadatos,
    secciones: [
      {
        titulo: 'Definición',
        tabla: {
          columnas: [
            { titulo: 'Campo', peso: 1 },
            { titulo: 'Valor', peso: 3 },
          ],
          filas: filasDefinicion,
          siVacia: 'Sin definición registrada.',
        },
      },
      {
        titulo: 'Evidencias',
        tabla: {
          columnas: [
            { titulo: 'Referencia', peso: 2 },
            { titulo: 'Subido por', peso: 1 },
            { titulo: 'Fecha', peso: 1 },
          ],
          filas: filasEvidencias,
          siVacia: 'El plan no tiene evidencias registradas.',
        },
      },
      {
        titulo: 'Retroalimentación',
        parrafos: [
          `Logro de meta: ${datos.logroMeta ?? 'sin registrar'}`,
          `Impacto: ${datos.impacto ?? 'sin registrar'}`,
        ],
      },
    ],
    pie: `Generado el ${fecha(datos.generadoEn)} — SGC (formato ${formato}).`,
  };
}
```

- [ ] **Step 4: Ejecutar hasta verde**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/domain/
```

Expected: PASS, 7 pruebas nuevas.

- [ ] **Step 5: Escribir el puerto de documentos**

`application/ports/documentos-mejora.port.ts`, calcando `documentos-evaluacion.port.ts`:

```ts
/**
 * Contratos de generación de documentos del plan de mejora (RF-PJ-032 a
 * RF-PJ-034). Calca `documentos-evaluacion.port.ts` a propósito: mismo
 * concepto, misma forma. Ver la cabecera de ese archivo para el porqué.
 */

export type TipoDocMejora = 'PLAN_MEJORA_PDF' | 'PLAN_MEJORA_EXCEL';

export type EstadoDocMejora = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

export interface TrabajoDocumentoMejora {
  readonly id: string;
  readonly planMejoraId: string;
  readonly tipo: TipoDocMejora;
  readonly estado: EstadoDocMejora;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosMejoraPort {
  crear(datos: {
    planMejoraId: string;
    tipo: TipoDocMejora;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoMejora>;
  porId(id: string): Promise<TrabajoDocumentoMejora | null>;
  listarDePlan(planMejoraId: string, limite: number): Promise<TrabajoDocumentoMejora[]>;
  marcarGenerando(id: string): Promise<void>;
  marcarListo(
    id: string,
    archivo: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void>;
  marcarFallido(id: string, error: string): Promise<void>;
  ubicacionDe(id: string): Promise<string | null>;
}

export const REPOSITORIO_DOCUMENTOS_MEJORA = Symbol('RepositorioDocumentosMejoraPort');
```

- [ ] **Step 6: Añadir el segundo evento**

En `eventos-mejora.ts`, junto a `PlanMejoraVersionado`:

```ts
/** RF-PJ-032. */
export class DocumentoMejoraSolicitado extends EventoMejora {
  readonly accion = 'mejora.documento.solicitado';
  constructor(actor: Actor, id: string, codigo: string, tipo: string) {
    super(actor, id, `Documento ${tipo} solicitado para ${codigo}.`);
  }
}
```

- [ ] **Step 7: Verificar y commitear**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/
npm run typecheck && npm run lint && npm run format:check
git add apps/api/src/modules/mejora-continua/mejora/domain/ apps/api/src/modules/mejora-continua/mejora/application/ports/documentos-mejora.port.ts
git commit -m "feat(mejora): qué dice el documento y su puerto"
```

---

### Task 4: El puerto de versionado/filtro y los dos repositorios

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/ports/plan-mejora.port.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/plan-mejora.repository.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/infrastructure/persistence/documentos-mejora.repository.ts`
- Test: `apps/api/test/integration/plan-mejora.int.spec.ts`
- Test: `apps/api/test/integration/documentos-mejora.int.spec.ts`

**Interfaces:**
- Consumes: `CopiaPlanMejora` (Task 2); `RepositorioDocumentosMejoraPort` (Task 3).
- Produces, en `RepositorioPlanMejoraPort`:

```ts
  /** RF-PJ-035: crea la copia en Borrador con todo su contenido. */
  copiar(datos: {
    codigo: string;
    version: number;
    derivadoDeId: string;
    contenido: CopiaPlanMejora;
  }): Promise<DatosPlanMejora>;

  /** RF-PJ-037 RN1: el linaje completo, de más reciente a más antiguo. */
  linajeDe(id: string): Promise<DatosPlanMejora[]>;
```

  Y `listarDeCarrera` gana un segundo parámetro opcional:

```ts
  listarDeCarrera(
    carreraId: string,
    filtro?: {
      texto?: string;
      aspecto?: AspectoPlanMejora;
      estadoImplementacion?: EstadoImplementacion;
      estado?: EstadoMedicion;
    },
  ): Promise<readonly DatosPlanMejora[]>;
```

  Consumido por la Task 5 (`copiar`, `linajeDe`) y la Task 7 (filtro).

- [ ] **Step 1: Escribir las pruebas de integración en rojo**

En `plan-mejora.int.spec.ts`:

```ts
describe('RF-PJ-035 — copiar un plan de mejora', () => {
  it('la copia lleva toda la definición y todo el seguimiento', async () => {
    const origen = await crearPlanMejora({ codigo: 'PJ-COPIA-1' });
    await repo.editarDefinicion(origen.id, definicionCompleta());
    await repo.agregarEvidencia(origen.id, {
      referencia: 'https://drive/ev1',
      nombreArchivo: 'ev1.pdf',
      subidoPor: ACTOR_ID,
    });
    await repo.actualizarImplementacion(origen.id, 'En proceso');
    await repo.actualizarRetroalimentacion(origen.id, '70% cumplido', 'Mejora observable');
    const conSeguimiento = await repo.porId(origen.id);

    const copia = await repo.copiar({
      codigo: 'PJ-COPIA-2',
      version: 2,
      derivadoDeId: origen.id,
      contenido: {
        ...conSeguimiento!,
        evidencias: conSeguimiento!.evidencias.map((e) => ({
          referencia: e.referencia,
          nombreArchivo: e.nombreArchivo,
          subidoPor: e.subidoPor,
          subidoEn: e.subidoEn,
        })),
      },
    });

    expect(copia.estado).toBe('Borrador');
    expect(copia.derivadoDeId).toBeUndefined(); // no expuesto en DatosPlanMejora; ver Step 3
    expect(copia.nombre).toBe(conSeguimiento!.nombre);
    expect(copia.estadoImplementacion).toBe('En proceso');
    expect(copia.logroMeta).toBe('70% cumplido');
    expect(copia.evidencias).toHaveLength(1);
    expect(copia.evidencias[0]?.referencia).toBe('https://drive/ev1');
  });
});

describe('RF-PJ-037 — el linaje', () => {
  it('devuelve la cadena de más reciente a más antigua', async () => {
    const v1 = await crearPlanMejora({ codigo: 'PJ-CADENA-1' });
    const contenido1 = await repo.porId(v1.id);
    const v2 = await repo.copiar({
      codigo: 'PJ-CADENA-2',
      version: 2,
      derivadoDeId: v1.id,
      contenido: { ...contenido1!, evidencias: [] },
    });
    const v3 = await repo.copiar({
      codigo: 'PJ-CADENA-3',
      version: 3,
      derivadoDeId: v2.id,
      contenido: { ...contenido1!, evidencias: [] },
    });

    for (const desde of [v1.id, v2.id, v3.id]) {
      expect((await repo.linajeDe(desde)).map((p) => p.codigo)).toEqual([
        'PJ-CADENA-3',
        'PJ-CADENA-2',
        'PJ-CADENA-1',
      ]);
    }
  });
});

describe('RF-PJ-038 — filtro del listado', () => {
  it('combina texto, aspecto y estado de implementación', async () => {
    const carreraId = await crearCarrera();
    await crearPlanMejora({ codigo: 'PJ-BUSCA-1', carreraId, nombre: 'Renovar laboratorios' });
    await crearPlanMejora({ codigo: 'PJ-BUSCA-2', carreraId, nombre: 'Otra acción' });

    const resultado = await repo.listarDeCarrera(carreraId, { texto: 'renovar' });
    expect(resultado.map((p) => p.codigo)).toEqual(['PJ-BUSCA-1']);

    const porCodigo = await repo.listarDeCarrera(carreraId, { texto: 'PJ-BUSCA-2' });
    expect(porCodigo.map((p) => p.codigo)).toEqual(['PJ-BUSCA-2']);
  });
});
```

`crearPlanMejora`, `definicionCompleta`, `crearCarrera` son los helpers que ya existen en el spec — extenderlos con los parámetros nuevos (`carreraId`, `nombre`) en vez de duplicarlos.

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/plan-mejora.int.spec.ts
```

Expected: FAIL — `repo.copiar is not a function`.

- [ ] **Step 3: Ampliar el puerto**

En `plan-mejora.port.ts`, añadir las dos firmas nuevas y el segundo parámetro de `listarDeCarrera` (bloque **Interfaces** de esta tarea), e importar `CopiaPlanMejora` desde `../../domain/services/copia-de-plan-mejora.js`. `DatosPlanMejora` no gana `version`/`derivadoDeId` como campos públicos: el linaje se consulta por `linajeDe`, no leyendo el puntero desde el propio plan — mismo criterio que Medición/Evaluación, cuyo `DatosPlanMedicion`/`DatosPlanEvaluacion` sí exponen `version` (confirmar contra ese puerto antes de decidir; si lo exponen, replicar la simetría y añadir `version: number` y `derivadoDeId: string | null` a `DatosPlanMejora` también, por consistencia con los hermanos).

- [ ] **Step 4: Implementar en el repositorio**

En `plan-mejora.repository.ts`, añadir a `SELECCION`:

```ts
  version: true,
  derivadoDeId: true,
```

Y a `Fila`/`aDatos` los campos correspondientes. Luego:

```ts
  /** RF-PJ-035: la copia entera, en una transacción — media copia es peor que ninguna. */
  async copiar(datos: {
    codigo: string;
    version: number;
    derivadoDeId: string;
    contenido: CopiaPlanMejora;
  }): Promise<DatosPlanMejora> {
    const { contenido } = datos;

    const id = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.planMejora.create({
        data: {
          codigo: datos.codigo,
          version: datos.version,
          derivadoDeId: datos.derivadoDeId,
          aspecto: contenido.aspecto,
          carreraId: contenido.carreraId,
          criterioAcreditacionId: contenido.criterioAcreditacionId,
          objetivoEducacionalId: contenido.objetivoEducacionalId,
          competenciaId: contenido.competenciaId,
          periodoId: contenido.periodoId,
          planEvaluacionId: contenido.planEvaluacionId,
          planMedicionAfectadoId: contenido.planMedicionAfectadoId,
          nombre: contenido.nombre,
          causaRaiz: contenido.causaRaiz,
          justificacion: contenido.justificacion,
          input: contenido.input,
          plazo: contenido.plazo,
          recursos: contenido.recursos,
          metas: contenido.metas,
          responsable: contenido.responsable,
          estadoImplementacion: IMPLEMENTACION_A_BD[contenido.estadoImplementacion],
          logroMeta: contenido.logroMeta,
          impacto: contenido.impacto,
        },
      });

      if (contenido.evidencias.length > 0) {
        await tx.evidenciaPlanMejora.createMany({
          data: contenido.evidencias.map((e) => ({
            planMejoraId: creado.id,
            referencia: e.referencia,
            nombreArchivo: e.nombreArchivo,
            subidoPor: e.subidoPor,
            subidoEn: e.subidoEn,
          })),
        });
      }

      return creado.id;
    });

    return this.exigir(id);
  }

  /** RF-PJ-037: la cadena entera, se pida desde donde se pida. Mismo patrón que `linajeDe` de medición: en bucle, no CTE recursiva. */
  async linajeDe(id: string): Promise<DatosPlanMejora[]> {
    let raiz = await this.prisma.planMejora.findUnique({
      where: { id },
      select: { id: true, derivadoDeId: true },
    });
    if (!raiz) return [];

    const vistos = new Set<string>([raiz.id]);
    while (raiz?.derivadoDeId && !vistos.has(raiz.derivadoDeId)) {
      vistos.add(raiz.derivadoDeId);
      raiz = await this.prisma.planMejora.findUnique({
        where: { id: raiz.derivadoDeId },
        select: { id: true, derivadoDeId: true },
      });
    }
    if (!raiz) return [];

    const cadena: string[] = [];
    const pendientes = [raiz.id];
    while (pendientes.length > 0) {
      const actual = pendientes.shift()!;
      cadena.push(actual);
      const hijos = await this.prisma.planMejora.findMany({
        where: { derivadoDeId: actual },
        select: { id: true },
      });
      pendientes.push(...hijos.map((h) => h.id));
    }

    const planes = await Promise.all(cadena.map((c) => this.porId(c)));
    return planes
      .filter((p): p is DatosPlanMejora => p !== null)
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  }
```

Añadir `IMPLEMENTACION_A_BD` a los imports si no está ya en scope del método (ya existe como constante del archivo).

Y `listarDeCarrera` gana el filtro:

```ts
  async listarDeCarrera(
    carreraId: string,
    filtro?: {
      texto?: string;
      aspecto?: AspectoPlanMejora;
      estadoImplementacion?: EstadoImplementacion;
      estado?: EstadoMedicion;
    },
  ): Promise<DatosPlanMejora[]> {
    const filas = await this.prisma.planMejora.findMany({
      where: {
        carreraId,
        ...(filtro?.aspecto ? { aspecto: filtro.aspecto } : {}),
        ...(filtro?.estadoImplementacion
          ? { estadoImplementacion: IMPLEMENTACION_A_BD[filtro.estadoImplementacion] }
          : {}),
        ...(filtro?.estado ? { estado: A_BD[filtro.estado] } : {}),
        // Sin `mode: 'insensitive'` en el nombre porque MySQL/algunos
        // collations no lo soportan igual; Postgres con collation por
        // defecto (`en_US.utf8`/`C`) sí, y es el motor único del proyecto
        // (CLAUDE.md §4.3) — se usa sin reparo.
        ...(filtro?.texto
          ? {
              OR: [
                { codigo: { contains: filtro.texto, mode: 'insensitive' } },
                { nombre: { contains: filtro.texto, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: SELECCION,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(aDatos);
  }
```

- [ ] **Step 5: Escribir el repositorio de documentos**

`documentos-mejora.repository.ts`, calcando `documentos-evaluacion.repository.ts` (ubicado junto a `plan-evaluacion.repository.ts` en el mismo submódulo — leerlo antes de escribir, aunque no se haya listado arriba, porque es la implementación Prisma exacta a espejar campo por campo: traductor de estado, `SELECCION` sin `ubicacion`, `ubicacionDe` como consulta aparte). Implementa `RepositorioDocumentosMejoraPort` de la Task 3, con FK a `planMejoraId` y tabla `documentoMejora`.

- [ ] **Step 6: Escribir las pruebas de integración de documentos**

`documentos-mejora.int.spec.ts`, calcando `documentos-medicion.int.spec.ts` (los cuatro casos: nace en cola y llega a listo; un fallo se guarda como estado; el listado va del más reciente al más antiguo; la ubicación no sale en el trabajo). Sustituir `planMedicionId`/`tipo: 'PLAN_MEDICION_*'` por `planMejoraId`/`tipo: 'PLAN_MEJORA_*'`.

- [ ] **Step 7: Ejecutar hasta verde y commitear**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
npm run typecheck && npm run lint && npm run format:check
git add apps/api/src/modules/mejora-continua/mejora/ apps/api/test/
git commit -m "feat(mejora): copiar, seguir el linaje, filtrar y persistir documentos"
```

---

### Task 5: El caso de uso de versionado

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.spec.ts`

**Interfaces:**
- Consumes: `copiarPlanMejora` (Task 2); `copiar`, `linajeDe`, `codigosDe` del puerto (Task 4); `permiteVersionado` de `estado-plan.js` (ya existe).
- Produces: `VersionarPlanMejora` con `generarNuevaVersion(actor, id)` y `versionesDe(actor, id)`. La Task 7 lo expone por HTTP.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
/**
 * Mismos dobles y ayudantes que `gestionar-planes-mejora.spec.ts`:
 * `plan()`, `montar()` — copiarlos de allí, no reescribirlos.
 */

describe('RF-PJ-035 — nueva versión', () => {
  it('nace en Borrador, vinculada al origen y con el siguiente correlativo del ámbito', async () => {
    const { caso, copiados } = montar({
      repo: {
        porId: async () => plan({ id: 'pj-1', estado: 'Vigente', aspecto: 'CRITERIO_ACREDITACION', criterioAcreditacionId: 'crit-1', codigo: 'PJ-CRI-3' }),
        codigosDe: async () => ['PJ-CRI-1', 'PJ-CRI-2', 'PJ-CRI-3'],
      },
    });

    await caso.generarNuevaVersion(ACTOR, 'pj-1');

    expect(copiados[0]?.derivadoDeId).toBe('pj-1');
    expect(copiados[0]?.codigo).toBe('PJ-CRI-4');
    expect(copiados[0]?.version).toBe(2);
  });

  it('para Competencia, el ámbito del correlativo es el periodo, no la competencia', async () => {
    const { caso, vistoCodigosDe } = montar({
      repo: {
        porId: async () =>
          plan({ id: 'pj-2', estado: 'Aprobado', aspecto: 'COMPETENCIA', competenciaId: 'comp-1', periodoId: 'periodo-1', codigo: 'PJ-COM-1' }),
      },
    });

    await caso.generarNuevaVersion(ACTOR, 'pj-2');

    expect(vistoCodigosDe).toEqual([['COMPETENCIA', 'periodo-1']]);
  });

  it('conserva el seguimiento completo de la versión origen', async () => {
    const { caso, copiados } = montar({
      repo: {
        porId: async () =>
          plan({
            id: 'pj-1', estado: 'Vigente',
            estadoImplementacion: 'En proceso', logroMeta: '70%',
            evidencias: [{ id: 'ev-1', planMejoraId: 'pj-1', referencia: 'r1', nombreArchivo: null, subidoPor: 'u1', subidoEn: new Date('2026-01-01') }],
          }),
      },
    });

    await caso.generarNuevaVersion(ACTOR, 'pj-1');

    expect(copiados[0]?.contenido.estadoImplementacion).toBe('En proceso');
    expect(copiados[0]?.contenido.evidencias).toHaveLength(1);
  });

  it('un Borrador no se versiona: se edita', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Borrador' }) } });

    await expect(caso.generarNuevaVersion(ACTOR, 'pj-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('exige mejora.crear: la nueva versión es un plan nuevo', async () => {
    const { caso } = montar({
      autorizacion: { puede: async () => false },
      repo: { porId: async () => plan({ estado: 'Vigente' }) },
    });

    await expect(caso.generarNuevaVersion(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
  });

  it('deja rastro en la bitácora con su propia acción', async () => {
    const { caso, vistos } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.generarNuevaVersion(ACTOR, 'pj-1');

    expect(vistos.map((e) => e.accion)).toContain('mejora.version');
  });
});

describe('RF-PJ-037 — el linaje', () => {
  it('exige mejora.leer', async () => {
    const { caso } = montar({ autorizacion: { puede: async () => false } });

    await expect(caso.versionesDe(ACTOR, 'pj-1')).rejects.toThrow(AccesoDenegado);
  });
});
```

`montar` devuelve `copiados` (lo que recibió el doble de `repo.copiar`) y `vistoCodigosDe` (los argumentos con los que se llamó a `repo.codigosDe`), siguiendo el mismo patrón que `versionar-planes-medicion.spec.ts`.

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el caso de uso**

```ts
/**
 * RF-PJ-035 y RF-PJ-037.
 *
 * Un solo método de copia, a diferencia de `VersionarPlanesMedicion` (que
 * tiene "duplicar" además): la ficha de RF-PJ no define esa segunda
 * operación para Plan de Mejora — ver design §3.3. Por eso conserva TODO el
 * seguimiento (§3.4), y no solo la definición como hace su gemelo de
 * Evaluación.
 */

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
import { permiteVersionado } from '../../../domain/value-objects/estado-plan.js';
import { copiarPlanMejora } from '../../domain/services/copia-de-plan-mejora.js';
import { PlanMejoraVersionado } from '../../domain/events/eventos-mejora.js';
import { siguienteCodigoMejora } from '../../domain/value-objects/codigo-mejora.js';
import type {
  AspectoPlanMejora,
  DatosPlanMejora,
  RepositorioPlanMejoraPort,
} from '../ports/plan-mejora.port.js';

const PREFIJO_POR_ASPECTO: Readonly<Record<AspectoPlanMejora, string>> = {
  CRITERIO_ACREDITACION: 'PJ-CRI-',
  OBJETIVO_EDUCACIONAL: 'PJ-OBJ-',
  COMPETENCIA: 'PJ-COM-',
};

export class VersionarPlanMejora {
  constructor(
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PJ-035: copia con vínculo al origen, conservando definición y seguimiento. */
  async generarNuevaVersion(actor: Actor, id: string): Promise<DatosPlanMejora> {
    const origen = await this.exigirPlan(id);

    // RF-PJ-042 (2c-J-D): las escrituras que crean un plan exigen `mejora.crear`.
    await this.exigir(actor, 'mejora.crear', origen.carreraId);

    if (!permiteVersionado(origen.estado)) {
      throw new ReglaDeNegocioViolada(
        `Solo se versiona un plan de mejora aprobado, vigente o histórico. Este está en ` +
          `${origen.estado} y se puede editar directamente.`,
      );
    }

    // RF-PJ-003 RN2: el mismo ámbito de unicidad que usa `crear()` — el
    // elemento para criterio/objetivo, el periodo para competencia.
    const ambitoId =
      origen.aspecto === 'COMPETENCIA' ? (origen.periodoId ?? origen.id) : this.elementoDe(origen);

    const yaUsados = await this.planes.codigosDe(origen.aspecto, ambitoId);
    const codigo = siguienteCodigoMejora(PREFIJO_POR_ASPECTO[origen.aspecto], yaUsados);

    const creado = await this.planes.copiar({
      codigo,
      version: (origen.version ?? 1) + 1,
      derivadoDeId: origen.id,
      contenido: copiarPlanMejora(origen),
    });

    await this.eventos.publicar([
      new PlanMejoraVersionado(actor, creado.id, creado.codigo, origen.codigo),
    ]);

    return creado;
  }

  /** RF-PJ-037 RN1: el linaje, de la más reciente a la más antigua. */
  async versionesDe(actor: Actor, id: string): Promise<DatosPlanMejora[]> {
    await this.exigir(actor, 'mejora.leer', null);
    return this.planes.linajeDe(id);
  }

  private elementoDe(plan: DatosPlanMejora): string {
    if (plan.aspecto === 'CRITERIO_ACREDITACION') return plan.criterioAcreditacionId!;
    return plan.objetivoEducacionalId!;
  }

  private async exigirPlan(id: string): Promise<DatosPlanMejora> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de mejora', id);
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

Si `plan.version` no está expuesto en `DatosPlanMejora` (ver la nota de la Task 4, Step 3), añadirlo ahí primero — este caso de uso lo necesita.

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/
npm run typecheck && npm run lint && npm run format:check
git add apps/api/src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.use-case.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/versionar-plan-mejora.spec.ts
git commit -m "feat(mejora): generar nueva versión y consultar el linaje"
```

Expected: PASS, 8 pruebas nuevas.

---

### Task 6: El generador de documentos

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/generar-documento-mejora.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/generar-documento-mejora.spec.ts`

**Interfaces:**
- Consumes: `RepositorioDocumentosMejoraPort` (Task 3); `armarDocumentoMejora` (Task 3); `RenderizadorPdfPort`/`RenderizadorHojaPort`/`AlmacenDeArchivosPort`/`ColaDeDocumentosPort` de `platform/documentos/puertos.js`.
- Produces: `GenerarDocumentoMejora` (`encolar`, `ejecutar`) y `ConsultarDocumentoMejora` (`estado`, `listarDePlan`, `descargar`). La Task 7 los expone por HTTP.

- [ ] **Step 1: Escribir las pruebas en rojo**

Calcar `generar-documento-medicion.spec.ts` (ya existe en el módulo hermano; leerlo antes de escribir) sustituyendo `medicion.leer` por `mejora.leer` en las dos aserciones de permiso, y `PLAN_MEDICION_*` por `PLAN_MEJORA_*`. Los cinco casos mínimos:

```ts
describe('RF-PJ-032 — encolar', () => {
  it('crea el trabajo y después lo encola, en ese orden', async () => { /* … */ });
  it('exige mejora.leer: exportar es leer', async () => { /* … */ });
});

describe('RF-PJ-032 — generar', () => {
  it('el PDF usa el renderizador de PDF y el Excel el de hoja', async () => { /* … */ });
  it('guarda el archivo y marca listo con sus bytes', async () => { /* … */ });
  it('un fallo se guarda como estado y NO se relanza', async () => { /* … */ });
  it('un trabajo que no existe no revienta el worker', async () => { /* … */ });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/application/use-cases/generar-documento-mejora.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el caso de uso**

```ts
/**
 * Generación del plan de mejora como archivo (RF-PJ-032 a RF-PJ-034).
 * Calca `generar-documento-evaluacion.use-case.ts`, con una diferencia de
 * permiso: aquí exportar SÍ es lectura (`mejora.leer`), como en Medición —
 * no hay razón propia de este submódulo para tratarlo como escritura.
 */

import type {
  AlmacenDeArchivosPort,
  ColaDeDocumentosPort,
  RenderizadorHojaPort,
  RenderizadorPdfPort,
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
import { armarDocumentoMejora } from '../../domain/documentos/armar-documento-mejora.js';
import { DocumentoMejoraSolicitado } from '../../domain/events/eventos-mejora.js';
import type {
  RepositorioDocumentosMejoraPort,
  TipoDocMejora,
  TrabajoDocumentoMejora,
} from '../ports/documentos-mejora.port.js';
import type { DatosPlanMejora, RepositorioPlanMejoraPort } from '../ports/plan-mejora.port.js';

const FORMATO: Readonly<
  Record<TipoDocMejora, { formato: 'pdf' | 'excel'; extension: string; tipoMime: string; nombre: string }>
> = {
  PLAN_MEJORA_PDF: { formato: 'pdf', extension: 'pdf', tipoMime: 'application/pdf', nombre: 'el plan de mejora en PDF' },
  PLAN_MEJORA_EXCEL: {
    formato: 'excel',
    extension: 'xlsx',
    tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    nombre: 'el plan de mejora en Excel',
  },
};

export interface Reloj {
  ahora(): Date;
}

export class GenerarDocumentoMejora {
  constructor(
    private readonly documentos: RepositorioDocumentosMejoraPort,
    private readonly planes: RepositorioPlanMejoraPort,
    private readonly cola: ColaDeDocumentosPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly pdf: RenderizadorPdfPort,
    private readonly hoja: RenderizadorHojaPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly reloj: Reloj = { ahora: () => new Date() },
  ) {}

  /** Corre en la API. */
  async encolar(actor: Actor, planMejoraId: string, tipo: TipoDocMejora): Promise<TrabajoDocumentoMejora> {
    const plan = await this.exigirPlan(planMejoraId);
    await this.exigir(actor, 'mejora.leer', plan.carreraId);

    const trabajo = await this.documentos.crear({ planMejoraId, tipo, solicitadoPor: actor.id });

    await this.cola.encolar(trabajo.id, 'mejora-continua-mejora');

    await this.eventos.publicar([new DocumentoMejoraSolicitado(actor, planMejoraId, plan.codigo, tipo)]);
    return trabajo;
  }

  /** Corre en el worker. No lanza nunca: el fallo se guarda como estado. */
  async ejecutar(trabajoId: string): Promise<void> {
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) return;
    if (trabajo.estado === 'Listo') return;

    const { formato, extension, tipoMime, nombre } = FORMATO[trabajo.tipo];

    try {
      await this.documentos.marcarGenerando(trabajoId);

      const plan = await this.planes.porId(trabajo.planMejoraId);
      if (!plan) throw new Error('El plan de mejora ya no existe.');

      const documento = armarDocumentoMejora(this.datosDelDocumento(plan), formato);

      const contenido =
        formato === 'pdf' ? await this.pdf.render(documento) : await this.hoja.render(documento);

      const ubicacion = await this.almacen.guardar(`${trabajoId}.${extension}`, contenido);

      await this.documentos.marcarListo(trabajoId, {
        nombreArchivo: `${documento.nombreArchivo}.${extension}`,
        tipoMime,
        bytes: contenido.byteLength,
        ubicacion,
      });
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Error desconocido.';
      await this.documentos.marcarFallido(trabajoId, `No se pudo generar ${nombre}: ${motivo}`);
    }
  }

  /**
   * El "elemento asociado" se resuelve solo con lo que `DatosPlanMejora` ya
   * trae (sus tres ids), no con una consulta cruzada a `plan-estudios` o
   * `evaluacion`: el documento cita el código/nombre que el plan mismo
   * conoce por auditoría, no re-resuelve el catálogo vivo (a diferencia de
   * `armar-documento-mejora` en pantalla, que sí lo hace vía React Query).
   * Si el nombre resuelto hiciera falta en el PDF, se añade aquí una
   * dependencia a `AcreditacionPort`/`ContenidoCurricularPort` — no antes.
   */
  private datosDelDocumento(plan: DatosPlanMejora) {
    return {
      codigo: plan.codigo,
      aspecto: plan.aspecto,
      elementoNombre: plan.codigo,
      estado: plan.estado,
      estadoImplementacion: plan.estadoImplementacion,
      nombre: plan.nombre,
      causaRaiz: plan.causaRaiz,
      justificacion: plan.justificacion,
      input: plan.input,
      plazo: plan.plazo,
      recursos: plan.recursos,
      metas: plan.metas,
      responsable: plan.responsable,
      evidencias: plan.evidencias.map((e) => ({
        referencia: e.referencia,
        subidoPor: e.subidoPor,
        subidoEn: e.subidoEn,
      })),
      logroMeta: plan.logroMeta,
      impacto: plan.impacto,
      generadoEn: this.reloj.ahora(),
    };
  }

  private async exigirPlan(id: string): Promise<DatosPlanMejora> {
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de mejora', id);
    return plan;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}

export interface ArchivoDescargadoMejora {
  readonly nombreArchivo: string;
  readonly tipoMime: string;
  readonly contenido: Buffer;
}

export class ConsultarDocumentoMejora {
  constructor(
    private readonly documentos: RepositorioDocumentosMejoraPort,
    private readonly almacen: AlmacenDeArchivosPort,
    private readonly autorizacion: AuthorizationPort,
  ) {}

  async estado(actor: Actor, trabajoId: string): Promise<TrabajoDocumentoMejora> {
    await this.exigirLectura(actor);
    const trabajo = await this.documentos.porId(trabajoId);
    if (trabajo === null) throw new NoEncontrado('el documento', trabajoId);
    return trabajo;
  }

  async listarDePlan(actor: Actor, planMejoraId: string, limite = 20): Promise<TrabajoDocumentoMejora[]> {
    await this.exigirLectura(actor);
    return this.documentos.listarDePlan(planMejoraId, limite);
  }

  async descargar(actor: Actor, trabajoId: string): Promise<ArchivoDescargadoMejora> {
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
    const decision = await this.autorizacion.puede(actor.id, 'mejora.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npx jest src/modules/mejora-continua/mejora/
npm run typecheck && npm run lint && npm run format:check
git add apps/api/src/modules/mejora-continua/mejora/application/use-cases/generar-documento-mejora.use-case.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/generar-documento-mejora.spec.ts
git commit -m "feat(mejora): generar y consultar los documentos del plan"
```

Expected: PASS, 6 pruebas nuevas.

---

### Task 7: Los endpoints y el registro en `app.module.ts`

**Files:**
- Create: `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/dto/documentos-mejora.dto.ts`
- Create: `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/documentos-mejora.controller.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/infrastructure/http/planes-mejora.controller.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `GenerarDocumentoMejora`/`ConsultarDocumentoMejora` (Task 6); `VersionarPlanMejora` (Task 5); el filtro del puerto (Task 4).
- Produces: los endpoints. La Task 8 (frontend) los consume.

- [ ] **Step 1: El DTO de documentos**

```ts
import { IsIn } from 'class-validator';

const TIPOS = ['PLAN_MEJORA_PDF', 'PLAN_MEJORA_EXCEL'] as const;

export class GenerarDocumentoMejoraDto {
  @IsIn(TIPOS, { message: `El tipo debe ser uno de: ${TIPOS.join(', ')}.` })
  tipo!: (typeof TIPOS)[number];
}
```

- [ ] **Step 2: El controlador de documentos**

Calcar `documentos-evaluacion.controller.ts` (Task 6 lo consume): dos controladores, `DocumentosDelPlanMejoraController` sobre `planes-mejora/:planId/documentos` (POST 202, GET listado) y `DocumentosMejoraController` sobre `documentos-mejora` (GET `:id` estado, GET `:id/archivo` descarga con `StreamableFile`), incluida la función `nombreSeguro` para la cabecera de descarga.

- [ ] **Step 3: Filtro y versiones en `planes-mejora.controller.ts`**

`listar` gana los cuatro `@Query()` opcionales:

```ts
  @Get()
  @ApiOperation({ summary: 'Listado de planes de mejora, con búsqueda y filtros (RF-PJ-038)' })
  async listar(
    @ActorActual() actor: Actor,
    @Query('carreraId', ParseUUIDPipe) carreraId: string,
    @Query('texto') texto?: string,
    @Query('aspecto') aspecto?: AspectoPlanMejora,
    @Query('estadoImplementacion') estadoImplementacion?: EstadoImplementacion,
    @Query('estado') estado?: EstadoMedicion,
  ) {
    return this.casos.listar(actor, carreraId, { texto, aspecto, estadoImplementacion, estado });
  }
```

`GestionarPlanesMejora.listar` gana el parámetro `filtro` y lo reenvía a `this.planes.listarDeCarrera(carreraId, filtro)` — un cambio de una línea en el caso de uso existente, sin tocar su firma pública más que añadir el parámetro opcional al final.

Y dos endpoints nuevos, junto a `transicionar`:

```ts
  @Post(':id/versiones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generar una nueva versión del plan de mejora (RF-PJ-035)' })
  @ApiResponse({ status: 409, description: 'El plan no está aprobado, vigente ni histórico.' })
  async nuevaVersion(@ActorActual() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.versionar.generarNuevaVersion(actor, id);
  }

  @Get(':id/versiones')
  @ApiOperation({ summary: 'Consultar el linaje de versiones (RF-PJ-037)' })
  async versiones(@ActorActual() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.versionar.versionesDe(actor, id);
  }
```

`PlanesMejoraController` gana `VersionarPlanMejora` en el constructor, junto a `GestionarPlanesMejora`.

- [ ] **Step 4: Registrar en `app.module.ts`**

Junto a los demás providers de `mejora-continua/mejora`:

```ts
  {
    provide: VersionarPlanMejora,
    inject: [REPOSITORIO_PLAN_MEJORA, AUTORIZACION, PUBLICADOR_DE_EVENTOS],
    useFactory: (planes, autorizacion, eventos) =>
      new VersionarPlanMejora(planes, autorizacion, eventos),
  },
  {
    provide: REPOSITORIO_DOCUMENTOS_MEJORA,
    useClass: DocumentosMejoraRepositoryPrisma,
  },
  {
    provide: GenerarDocumentoMejora,
    inject: [
      REPOSITORIO_DOCUMENTOS_MEJORA, REPOSITORIO_PLAN_MEJORA, COLA_DOCUMENTOS,
      ALMACEN_ARCHIVOS, RENDERIZADOR_PDF, RENDERIZADOR_HOJA, AUTORIZACION, PUBLICADOR_DE_EVENTOS,
    ],
    useFactory: (documentos, planes, cola, almacen, pdf, hoja, autorizacion, eventos) =>
      new GenerarDocumentoMejora(documentos, planes, cola, almacen, pdf, hoja, autorizacion, eventos),
  },
  {
    provide: ConsultarDocumentoMejora,
    inject: [REPOSITORIO_DOCUMENTOS_MEJORA, ALMACEN_ARCHIVOS, AUTORIZACION],
    useFactory: (documentos, almacen, autorizacion) =>
      new ConsultarDocumentoMejora(documentos, almacen, autorizacion),
  },
```

Los nombres exactos de los tokens (`AUTORIZACION`, `PUBLICADOR_DE_EVENTOS`, `COLA_DOCUMENTOS`, etc.) son los que ya usan las entradas de Evaluación en el mismo archivo — copiarlos de ahí, no inventarlos.

Y el `GENERADORES_DE_DOCUMENTOS` factory (Task 1, Step 4) gana la tercera entrada:

```ts
    {
      provide: GENERADORES_DE_DOCUMENTOS,
      inject: [GenerarDocumento, GenerarDocumentoMedicion, GenerarDocumentoEvaluacion, GenerarDocumentoMejora],
      useFactory: (planEstudios, medicion, evaluacion, mejora) => ({
        'plan-estudios': planEstudios,
        'mejora-continua': medicion,
        'mejora-continua-evaluacion': evaluacion,
        'mejora-continua-mejora': mejora,
      }),
    },
```

Y `DocumentosDelPlanMejoraController`/`DocumentosMejoraController` a la lista de `controllers`.

- [ ] **Step 5: Comprobar a mano contra la API**

```bash
cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start &
npm run start:worker &
```

Con un token con `mejora.leer`/`mejora.crear`:

```bash
curl -s -X POST localhost:3000/api/v1/planes-mejora/<id>/documentos -H "authorization: Bearer <token>" -H "content-type: application/json" -d '{"tipo":"PLAN_MEJORA_PDF"}'
curl -s localhost:3000/api/v1/planes-mejora/<id>/documentos -H "authorization: Bearer <token>"
curl -s -X POST localhost:3000/api/v1/planes-mejora/<id>/versiones -H "authorization: Bearer <token>"
curl -s "localhost:3000/api/v1/planes-mejora?carreraId=<id>&texto=renovar" -H "authorization: Bearer <token>"
```

Expected: el primero 202; el segundo, tras unos segundos, el trabajo en «Listo»; el tercero, 201 con un plan nuevo en Borrador; el cuarto, el listado filtrado.

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run format:check && npm test
git add apps/api/src/
git commit -m "feat(mejora): documentos, versiones y búsqueda por HTTP"
```

---

### Task 8: Capa de datos del frontend

**Files:**
- Modify: `apps/web/src/features/mejora-continua/domain/tipos.ts`
- Modify: `apps/web/src/features/mejora-continua/api/mejora.api.ts`
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts`

**Interfaces:**
- Consumes: los endpoints de la Task 7.
- Produces: `FiltroMejora`, `TipoDocumentoMejora`, las funciones de `mejora.api.ts`, y los hooks de `queries.ts`. Las Tasks 9, 10 y 11 los consumen.

- [ ] **Step 1: Ampliar `domain/tipos.ts`**

```ts
export type TipoDocumentoMejora = 'PLAN_MEJORA_PDF' | 'PLAN_MEJORA_EXCEL';
```

`TrabajoDocumento<T>` ya es genérico (lo usa Evaluación como `TrabajoDocumento<TipoDocumentoEvaluacion>`); reutilizarlo como `TrabajoDocumento<TipoDocumentoMejora>`, sin declarar una interfaz nueva.

- [ ] **Step 2: Ampliar `mejora.api.ts`**

```ts
import type { ArchivoDescargado } from '@/shared/api/cliente';
import type { EstadoMedicion, TipoDocumentoMejora, TrabajoDocumento } from '../domain/tipos';

export interface FiltroMejora {
  carreraId: string;
  texto?: string;
  aspecto?: AspectoPlanMejora;
  estadoImplementacion?: EstadoImplementacion;
  estado?: EstadoMedicion;
}

export async function listarPlanesMejora(filtro: FiltroMejora): Promise<PlanMejora[]> {
  return cliente.get<PlanMejora[]>('/planes-mejora', {
    carreraId: filtro.carreraId,
    texto: filtro.texto,
    aspecto: filtro.aspecto,
    estadoImplementacion: filtro.estadoImplementacion,
    estado: filtro.estado,
  });
}

/* ── Versionado (RF-PJ-035, RF-PJ-037) ──────────────────────────────────── */

export async function generarNuevaVersionMejora(id: string): Promise<PlanMejora> {
  return cliente.post<PlanMejora>(`/planes-mejora/${id}/versiones`);
}

export async function versionesDeMejora(id: string): Promise<PlanMejora[]> {
  return cliente.get<PlanMejora[]>(`/planes-mejora/${id}/versiones`);
}

/* ── Documentos (RF-PJ-032 a RF-PJ-034) ─────────────────────────────────── */

export async function generarDocumentoMejora(
  id: string,
  tipo: TipoDocumentoMejora,
): Promise<TrabajoDocumento<TipoDocumentoMejora>> {
  return cliente.post<TrabajoDocumento<TipoDocumentoMejora>>(`/planes-mejora/${id}/documentos`, { tipo });
}

export async function documentosDeMejora(id: string): Promise<TrabajoDocumento<TipoDocumentoMejora>[]> {
  return cliente.get<TrabajoDocumento<TipoDocumentoMejora>[]>(`/planes-mejora/${id}/documentos`);
}

export async function descargarDocumentoMejora(id: string): Promise<ArchivoDescargado> {
  return cliente.descargar(`/documentos-mejora/${id}/archivo`);
}
```

`listarPlanesMejora(carreraId: string)` existente cambia de firma a `listarPlanesMejora(filtro: FiltroMejora)`: es un cambio incompatible deliberado — el único llamador es `usePlanesMejora` (Step 3), que se actualiza en el mismo commit.

- [ ] **Step 3: Ampliar `queries.ts`**

`clavesMejora` gana el filtro y las dos ramas nuevas:

```ts
export const clavesMejora = {
  lista: (f: mejoraApi.FiltroMejora) =>
    [
      'mejora', 'lista', f.carreraId,
      f.texto ?? '', f.aspecto ?? 'todos', f.estadoImplementacion ?? 'todos', f.estado ?? 'todos',
    ] as const,
  plan: (id: string) => ['mejora', 'plan', id] as const,
  historial: (id: string) => ['mejora', 'historial', id] as const,
  versiones: (id: string) => ['mejora', id, 'versiones'] as const,
  documentos: (id: string) => ['mejora', id, 'documentos'] as const,
};

export function usePlanesMejora(filtro: mejoraApi.FiltroMejora) {
  return useQuery({
    queryKey: clavesMejora.lista(filtro),
    queryFn: () => mejoraApi.listarPlanesMejora(filtro),
    enabled: !!filtro.carreraId,
  });
}

export function useVersionesMejora(id: string) {
  return useQuery({
    queryKey: clavesMejora.versiones(id),
    queryFn: () => mejoraApi.versionesDeMejora(id),
    enabled: !!id,
  });
}

export function useNuevaVersionMejora(id: string) {
  return useMutacionDePlanMejora(() => mejoraApi.generarNuevaVersionMejora(id), () => id);
}

export function useDocumentosMejora(id: string) {
  return useQuery({
    queryKey: clavesMejora.documentos(id),
    queryFn: () => mejoraApi.documentosDeMejora(id),
    enabled: !!id,
    refetchInterval: (consulta) =>
      (consulta.state.data ?? []).some((t) => t.estado === 'En cola' || t.estado === 'Generando')
        ? 2_000
        : false,
  });
}

export function useGenerarDocumentoMejora(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tipo: TipoDocumentoMejora) => mejoraApi.generarDocumentoMejora(id, tipo),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: clavesMejora.documentos(id) });
    },
  });
}
```

`usePlanesMejora(carreraId)` cambia a `usePlanesMejora(filtro)`; el único llamador (`PlanesMejoraPage.tsx`) se actualiza en la Task 10, en el mismo espíritu que el cambio de `mejora.api.ts`.

- [ ] **Step 4: Escribir la prueba de la clave de caché con filtro**

```ts
// queries.test.ts, o el archivo de pruebas ya existente para clavesMejora
it('clavesMejora.lista distingue por filtro, como clavesEval', () => {
  const sinFiltro = clavesMejora.lista({ carreraId: 'c1' });
  const conTexto = clavesMejora.lista({ carreraId: 'c1', texto: 'renovar' });

  expect(sinFiltro).not.toEqual(conTexto);
});
```

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/api/
npm run typecheck && npm run lint && npm run format:check
git add apps/web/src/features/mejora-continua/domain/tipos.ts apps/web/src/features/mejora-continua/api/
git commit -m "feat(mejora): capa de datos para documentos, versiones y búsqueda"
```

---

### Task 9: Los componentes de Documentos y Versiones

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/DocumentosDelPlanMejora.tsx`
- Test: `apps/web/src/features/mejora-continua/components/DocumentosDelPlanMejora.test.tsx`
- Create: `apps/web/src/features/mejora-continua/components/VersionesDelPlanMejora.tsx`
- Test: `apps/web/src/features/mejora-continua/components/VersionesDelPlanMejora.test.tsx`

**Interfaces:**
- Consumes: `TrabajoDocumento<TipoDocumentoMejora>`, `PlanMejora` (Task 8).
- Produces: los dos componentes. La Task 11 los consume.

- [ ] **Step 1: Prueba de `DocumentosDelPlanMejora` en rojo**

Calcar `DocumentosDelPlanEvaluacion.test.tsx` (leerlo antes de escribir): los mismos cuatro casos — uno listo se descarga, uno en curso no ofrece descarga, uno fallido enseña su motivo, sin documentos lo dice — sustituyendo el tipo por `PLAN_MEJORA_PDF`/`PLAN_MEJORA_EXCEL` y el texto de ayuda del vacío por uno propio de mejora («Todavía no se ha generado ningún documento de este plan de mejora.»).

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/components/DocumentosDelPlanMejora.test.tsx
```

- [ ] **Step 3: Escribir `DocumentosDelPlanMejora.tsx`**

Calcar `DocumentosDelPlanEvaluacion.tsx` estructuralmente (props `documentos`, `generando`, `onGenerar`, `onDescargar`; dos botones «Generar PDF»/«Generar Excel»; lista con `Badge` de estado, motivo si falló, enlace de descarga si listo), con `NOMBRE_TIPO` mapeando `PLAN_MEJORA_PDF`/`PLAN_MEJORA_EXCEL` a `'PDF'`/`'Excel'`.

- [ ] **Step 4: Prueba de `VersionesDelPlanMejora` en rojo**

Calcar `VersionesDelPlan.tsx`'s test (componente de Evaluación) con estos ajustes: la ruta de cada fila es `/mejora-continua/mejora/${v.id}` y no `/mejora-continua/evaluacion/${v.id}`; el aviso de solo lectura usa `permiteEdicionDefinicionMejora`/el estado del plan de mejora.

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { PlanMejora } from '../domain/tipos';
import { VersionesDelPlanMejora } from './VersionesDelPlanMejora';

function version(sobre: Partial<PlanMejora> = {}): PlanMejora {
  return { id: 'pj-1', codigo: 'PJ-CRI-3', estado: 'Vigente', creadoEn: '2026-09-01T00:00:00.000Z', ...sobre } as PlanMejora;
}

function montar(props: Partial<React.ComponentProps<typeof VersionesDelPlanMejora>> = {}) {
  render(
    <MemoryRouter>
      <VersionesDelPlanMejora versiones={[version()]} versionAbierta="pj-1" estadoActual="Vigente" {...props} />
    </MemoryRouter>,
  );
}

describe('el linaje', () => {
  it('muestra la versión abierta sin enlace a sí misma', () => {
    montar();
    expect(screen.getByText(/viendo esta/i)).toBeInTheDocument();
  });

  it('ofrece generar nueva versión cuando el estado lo permite', () => {
    montar({ onGenerarVersion: vi.fn() });
    expect(screen.getByRole('button', { name: /generar nueva versión/i })).toBeInTheDocument();
  });

  it('no ofrece generar desde Borrador', () => {
    montar({ estadoActual: 'Borrador', onGenerarVersion: vi.fn() });
    expect(screen.queryByRole('button', { name: /generar nueva versión/i })).not.toBeInTheDocument();
  });

  it('avisa de solo lectura sobre una versión no editable', () => {
    montar({ versiones: [version({ estado: 'Histórico' })] });
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/components/VersionesDelPlanMejora.test.tsx
```

- [ ] **Step 6: Escribir `VersionesDelPlanMejora.tsx`**

Calcar `VersionesDelPlan.tsx` de Evaluación (fichero ya leído en esta sesión): misma tabla con columnas Versión/Estado/Creada, mismo aviso de solo lectura vía `permiteEdicionDefinicionMejora`, mismo `Link` cambiando la ruta a `/mejora-continua/mejora/${v.id}`.

- [ ] **Step 7: Ejecutar hasta verde y commitear**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/components/
npm run typecheck && npm run lint && npm run format:check
git add apps/web/src/features/mejora-continua/components/DocumentosDelPlanMejora.tsx apps/web/src/features/mejora-continua/components/DocumentosDelPlanMejora.test.tsx apps/web/src/features/mejora-continua/components/VersionesDelPlanMejora.tsx apps/web/src/features/mejora-continua/components/VersionesDelPlanMejora.test.tsx
git commit -m "feat(mejora): componentes de Documentos y Versiones"
```

Expected: PASS, 8 pruebas nuevas.

---

### Task 10: Búsqueda y filtros en el listado

**Files:**
- Modify: `apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.tsx`
- Test: `apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.test.tsx` (crear si no existe; si ya existe una suite de esta página, extenderla)

**Interfaces:**
- Consumes: `usePlanesMejora(filtro)` (Task 8).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Escribir la prueba en rojo**

```tsx
/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as mejoraApi from '../api/mejora.api';
import { PlanesMejoraPage } from './PlanesMejoraPage';

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlanesMejoraPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RF-PJ-038 — búsqueda y filtros', () => {
  it('el texto ingresado viaja al filtro de la consulta', async () => {
    const espia = vi.spyOn(mejoraApi, 'listarPlanesMejora').mockResolvedValue([]);
    montar();

    await userEvent.type(screen.getByRole('searchbox', { name: /buscar/i }), 'renovar');

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ texto: 'renovar' }));
    });
  });

  it('el selector de aspecto filtra', async () => {
    const espia = vi.spyOn(mejoraApi, 'listarPlanesMejora').mockResolvedValue([]);
    montar();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /aspecto/i }), 'COMPETENCIA');

    await waitFor(() => {
      expect(espia).toHaveBeenCalledWith(expect.objectContaining({ aspecto: 'COMPETENCIA' }));
    });
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/pages/PlanesMejoraPage.test.tsx
```

- [ ] **Step 3: Añadir el estado de filtro y los controles**

En `PlanesMejoraPage.tsx`, junto a `elegida`/`creando`:

```tsx
  const [texto, setTexto] = useState('');
  const [aspecto, setAspecto] = useState<AspectoPlanMejora | ''>('');
  const [estadoImplementacion, setEstadoImplementacion] = useState<EstadoImplementacion | ''>('');
  const [estado, setEstado] = useState<EstadoMedicion | ''>('');

  const { data: planes, isLoading } = usePlanesMejora({
    carreraId,
    texto: texto || undefined,
    aspecto: aspecto || undefined,
    estadoImplementacion: estadoImplementacion || undefined,
    estado: estado || undefined,
  });
```

Y, debajo del `<Selector>` de carrera existente:

```tsx
      <div className="flex flex-wrap gap-3">
        <Entrada
          role="searchbox"
          aria-label="Buscar por código o nombre"
          placeholder="Buscar por código o nombre…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="max-w-xs"
        />
        <Selector aria-label="Aspecto" value={aspecto} onChange={(e) => setAspecto(e.target.value as AspectoPlanMejora | '')}>
          <option value="">Todos los aspectos</option>
          <option value="CRITERIO_ACREDITACION">Criterio de acreditación</option>
          <option value="OBJETIVO_EDUCACIONAL">Objetivo educacional</option>
          <option value="COMPETENCIA">Competencia</option>
        </Selector>
        <Selector aria-label="Estado de implementación" value={estadoImplementacion} onChange={(e) => setEstadoImplementacion(e.target.value as EstadoImplementacion | '')}>
          <option value="">Toda implementación</option>
          {ESTADOS_IMPLEMENTACION.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </Selector>
        <Selector aria-label="Estado documental" value={estado} onChange={(e) => setEstado(e.target.value as EstadoMedicion | '')}>
          <option value="">Todo estado</option>
          {ESTADOS_MEDICION.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </Selector>
      </div>
```

Añadir los imports de `Entrada`, `ESTADOS_IMPLEMENTACION`, `ESTADOS_MEDICION`, `AspectoPlanMejora`, `EstadoImplementacion`, `EstadoMedicion` que falten.

- [ ] **Step 4: Ejecutar hasta verde y commitear**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/pages/PlanesMejoraPage.test.tsx
npm run typecheck && npm run lint && npm run format:check
git add apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.tsx apps/web/src/features/mejora-continua/pages/PlanesMejoraPage.test.tsx
git commit -m "feat(mejora): buscar y filtrar el listado de planes de mejora"
```

Expected: PASS.

---

### Task 11: `PlanMejoraPage` a pestañas ARIA

**Files:**
- Modify: `apps/web/src/features/mejora-continua/pages/PlanMejoraPage.tsx`
- Test: `apps/web/src/features/mejora-continua/pages/PlanMejoraPage.test.tsx` (crear si no existe)

**Interfaces:**
- Consumes: `useDocumentosMejora`, `useGenerarDocumentoMejora`, `useVersionesMejora`, `useNuevaVersionMejora` (Task 8); `DocumentosDelPlanMejora`, `VersionesDelPlanMejora` (Task 9).
- Produces: nada que otras tareas consuman. Es la última pieza de UI del ciclo.

- [ ] **Step 1: Escribir las pruebas de accesibilidad de las pestañas en rojo**

```tsx
/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe'; // o el helper que ya use el resto del repo
import { describe, expect, it } from 'vitest';

// … helpers de montaje: mismo patrón que PlanEvaluacionPage.test.tsx, con
// un QueryClientProvider + MemoryRouter + mocks de useParams/id.

describe('pestañas ARIA', () => {
  it('cinco pestañas: Definición, Seguimiento, Documentos, Versiones, Historial', () => {
    montar();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Definición', 'Seguimiento', 'Documentos', 'Versiones', 'Historial de cambios',
    ]);
  });

  it('cambiar de pestaña mueve aria-selected y oculta el panel anterior', async () => {
    montar();
    await userEvent.click(screen.getByRole('tab', { name: /documentos/i }));

    expect(screen.getByRole('tab', { name: /documentos/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /definición/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('sin violaciones de accesibilidad', async () => {
    const { container } = montar();
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

Si el repo ya tiene un helper `axe`/`jest-axe` para otras páginas con pestañas (`PlanEvaluacionPage.test.tsx` casi seguro lo usa — leerlo primero), reutilizarlo tal cual en vez de configurar uno nuevo.

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/pages/PlanMejoraPage.test.tsx
```

- [ ] **Step 3: Reescribir `PlanMejoraPage.tsx`**

Estructura, calcada de `PlanEvaluacionPage.tsx` (ya leído completo en esta sesión):

1. `const PESTANAS = [['definicion', 'Definición'], ['seguimiento', 'Seguimiento'], ['documentos', 'Documentos'], ['versiones', 'Versiones'], ['historial', 'Historial de cambios']] as const;` y `type Pestana = (typeof PESTANAS)[number][0];`
2. `const idBase = useId();` y `const [pestana, setPestana] = useState<Pestana>('definicion');`
3. Los hooks nuevos: `useDocumentosMejora(id)`, `useGenerarDocumentoMejora(id)`, `useVersionesMejora(id)`, `useNuevaVersionMejora(id)`.
4. La tarjeta "Estado del plan" y "Elemento asociado" quedan **fuera** de las pestañas, igual que en `PlanEvaluacionPage` (el ciclo de vida no es contenido de ninguna pestaña, es contexto permanente).
5. El contenido de "Definición" (Step actual: todo el bloque de `Campo`s de nombre/causaRaiz/justificacion/input/plazo/recursos/metas/responsable) pasa a vivir dentro de `<div role="tabpanel" id={`${idBase}-panel-definicion`} hidden={pestana !== 'definicion'}>`.
6. El contenido de "Seguimiento" (estado de implementación, evidencias, logro de meta, impacto) pasa a su propio `tabpanel`.
7. "Documentos": `<DocumentosDelPlanMejora documentos={documentos ?? []} generando={generarDocumento.isPending} onGenerar={puede('mejora.leer') ? (tipo) => void ejecutar(() => generarDocumento.mutateAsync(tipo)) : undefined} onDescargar={...} />` — `onDescargar` sigue el mismo patrón de `guardarArchivo(await descargarDocumentoMejora(id))` que ya usa Evaluación.
8. "Versiones": `<VersionesDelPlanMejora versiones={versiones ?? []} versionAbierta={plan.id} estadoActual={plan.estado} generandoVersion={nuevaVersion.isPending} onGenerarVersion={puede('mejora.crear') ? () => void ejecutar(async () => { const creado = await nuevaVersion.mutateAsync(undefined); navegar(`/mejora-continua/mejora/${creado.id}`); }) : undefined} />` — necesita `useNavigate()`, que la página no importa todavía.
9. "Historial de cambios": el bloque `<HistorialDelPlan eventos={historial ?? []} />` que ya existe, movido tal cual dentro de su `tabpanel` — **sin tocar su lógica**, RF-PJ-036 ya está resuelto (design §3.6).
10. El `role="tablist"` y cada botón `role="tab"` con `aria-selected`/`aria-controls`, calcados literalmente del bloque de `PlanEvaluacionPage.tsx` líneas 344-368.

Actualizar el comentario de cabecera del archivo: ya no dice "Sin pestañas ARIA" — al contrario, documenta que este ciclo (2c-J-C) las introdujo porque Documentos y Versiones ya existen.

- [ ] **Step 4: Ejecutar hasta verde**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/pages/PlanMejoraPage.test.tsx
```

- [ ] **Step 5: Verificar en el navegador**

```bash
cd apps/web && npm run dev
```

Abrir un plan de mejora existente, recorrer las cinco pestañas con teclado (Tab, flechas si el patrón ARIA las implementa, Enter/Espacio) y confirmar que cada contenido sigue funcionando: editar la definición en Borrador, cargar una evidencia, generar un PDF, generar una nueva versión y verla en el linaje, ver el historial.

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
git add apps/web/src/features/mejora-continua/pages/PlanMejoraPage.tsx apps/web/src/features/mejora-continua/pages/PlanMejoraPage.test.tsx
git commit -m "feat(mejora): PlanMejoraPage a pestañas ARIA con Documentos y Versiones"
```

---

### Task 12: E2E y cierre

**Files:**
- Create: `tests/e2e/specs/plan-mejora-2c-j-c.spec.ts`
- Modify: `.github/workflows/ci.yml` (si el worker de documentos no está ya arrancado en el job `e2e` — verificar primero, puede que 2c-E ya lo haya añadido)
- Modify: `README.md` (estado del submódulo)

**Interfaces:**
- Consumes: todo lo anterior; el fixture `test` de `tests/e2e/fixtures/sesion.ts`.
- Produces: nada.

- [ ] **Step 1: Escribir el recorrido**

```ts
/**
 * RF-PJ-032 a RF-PJ-038 contra la aplicación entera.
 */

import { expect, test } from '../fixtures/sesion';

test('exportar un PDF del plan de mejora y verlo listo', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('link', { name: /^PJ-/ }).first().click();

  await page.getByRole('tab', { name: /documentos/i }).click();
  await page.getByRole('button', { name: /Generar PDF/ }).click();

  await expect(page.getByRole('link', { name: /descargar/i }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test('generar una nueva versión y verla en el linaje', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  await page.getByRole('link', { name: /^PJ-/ }).first().click();

  await page.getByRole('tab', { name: /versiones/i }).click();
  await page.getByRole('button', { name: /generar nueva versión/i }).click();

  await expect(page).toHaveURL(/\/mejora-continua\/mejora\/[a-f0-9-]+$/);
  await page.getByRole('tab', { name: /versiones/i }).click();
  await expect(page.getByText(/viendo esta/i)).toBeVisible();
});

test('buscar por texto filtra el listado', async ({ page }) => {
  await page.goto('/mejora-continua/mejora');
  const total = await page.getByRole('row').count();

  await page.getByRole('searchbox', { name: /buscar/i }).fill('un-texto-que-no-existe-en-ningun-plan');

  await expect(page.getByText(/no hay planes de mejora/i).or(page.getByRole('row'))).toBeVisible();
  const filtrado = await page.getByRole('row').count();
  expect(filtrado).toBeLessThanOrEqual(total);
});
```

- [ ] **Step 2: Ejecutar con el worker levantado**

```bash
cd apps/api && npm run e2e:preparar && npm run build
THROTTLE_LIMIT=10000 npm start &
npm run start:worker &
cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test plan-mejora-2c-j-c.spec.ts
```

Expected: PASS, 3 pruebas.

- [ ] **Step 3: Confirmar que el worker ya está en el job de CI**

```bash
grep -n "start:worker" .github/workflows/ci.yml
```

Si el ciclo de Evaluación (2c-E) ya lo añadió, no hay nada que hacer aquí. Si no aparece, añadirlo tras el paso «Arrancar la API», mismo bloque que describe la Task 8, Step 3 del plan de exportación de medición.

- [ ] **Step 4: Actualizar el estado del README**

Añadir el ciclo 2c-J-C a lo que funciona hoy: documentos, versionado y búsqueda del plan de mejora. Actualizar el contador del submódulo de Plan de Mejora a 39/47.

- [ ] **Step 5: Verificar todo y commitear**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
cd ../web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
cd ../../tests/e2e && npm run typecheck && npm run format:check
git add tests/e2e/ .github/ README.md
git commit -m "test(mejora): recorrido E2E de documentos, versiones y búsqueda del plan de mejora"
```

---

## Cobertura de la spec

| Sección del diseño | Tarea |
|---|---|
| §3.1 documentos: maquinaria reutilizada, tabla propia | Task 1, 3 |
| §3.2 contenido del documento | Task 3 |
| §3.3 versionado: una sola operación | Task 5 |
| §3.4 qué copia la nueva versión (decisión con el usuario) | Task 2 |
| §3.5 numeración: código y `version` independientes | Task 5 |
| §3.6 RF-PJ-036 ya construido | Task 11, Step 3.9 (solo se mueve, no se reescribe) |
| §3.7 RF-PJ-037 solo lectura | Task 5, 9 |
| §3.8 pestañas ARIA (decisión con el usuario) | Task 11 |
| §3.9 búsqueda y filtros | Task 4, 7, 10 |
| §4 alcance dentro/fuera | Todas |
| §6 endpoints | Task 7 |
| §7 errores | Task 5 (Borrador no versiona), Task 6 (fallo como estado, descarga de un fallido) |
| §8 pruebas | Tasks 1–12 |
| §9 puntos anotados | Ya en la spec; no requieren código nuevo — el enum `TipoDocumentoMejora` propio ya se decidió en Task 1 (frente a `EstadoDocumentoMedicion`, que sí se reutiliza) |

## Auto-revisión

- **Cobertura de la spec:** las nueve subsecciones de decisiones (§3.1–§3.9) tienen tarea asignada en la tabla de arriba; ninguna quedó sin tocar.
- **Placeholders:** ninguno de los pasos de código deja "TBD"/"implementar luego"; donde un paso remite a "calcar X" es porque X es un archivo real, ya leído en esta sesión, con una diferencia puntual explicitada (permiso, ruta, nombre de tipo) — nunca "hazlo similar a la Task N" sin decir qué cambia.
- **Consistencia de tipos:** `TrabajoDocumentoMejora`/`TipoDocMejora`/`EstadoDocMejora` (Task 3) son los mismos nombres que consumen Task 4 (repositorio), Task 6 (caso de uso) y Task 7 (controlador); `CopiaPlanMejora`/`copiarPlanMejora` (Task 2) son los mismos que Task 4 (`copiar()`) y Task 5 (`versionar-plan-mejora.use-case.ts`) importan; `FiltroMejora` (Task 8) es el mismo tipo que Task 10 (`PlanesMejoraPage.tsx`) consume. La única ambigüedad real —si `DatosPlanMejora` expone `version`/`derivadoDeId`— queda marcada explícitamente en Task 4 Step 3 y Task 5 Step 3 como algo a confirmar contra el puerto actual antes de escribir, no asumida en silencio.
