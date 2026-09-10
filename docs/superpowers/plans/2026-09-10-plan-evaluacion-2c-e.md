# Ciclo 2c-E — Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el submódulo Plan de Evaluación (RF-PE-031 a 037 y 042):
generar y exportar el plan, versionarlo, y registrar quién lo aprobó y cuándo.

**Architecture:** La infraestructura de documentos **ya es genérica** y vive en
`platform/documentos/`: un modelo neutro `Documento`, dos renderizadores, una
cola y un almacén. Evaluación solo aporta su armador de dominio y su tabla de
trabajos. El versionado calca la relación reflexiva de `PlanMedicion`, pero
copia **solo la definición**.

**Tech Stack:** NestJS 11, Prisma 7 (multiSchema), PostgreSQL 16, BullMQ sobre
Redis, `pdfkit` + `exceljs`, React 18 + Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-plan-evaluacion-2c-e-design.md`

## Global Constraints

- **Aislamiento (CLAUDE.md §3.2):** `mejora-continua` solo importa de
  `plan-estudios` el puerto `contenido-curricular.port.js`, y de `auth` los dos
  puertos más `infrastructure/http/jwt.guard.js`. Lo vigila
  `mejora-continua/aislamiento.spec.ts`, que tiene controles positivos: si
  alguna regla deja de encontrar imports, falla.
- **`domain/` no importa NestJS, Prisma ni Express.** El armador es dominio
  puro: recibe datos y devuelve un `Documento`. No conoce `pdfkit`.
- **Auditoría no opcional (§2, §6.6):** todo caso de uso que muta emite un
  evento de dominio **y una prueba lo cubre**.
- **Cobertura ≥80 %** en `domain/` y `application/`.
- **§6.6:** si toca UI, `axe-core` en verde; si cambia un endpoint, Swagger al día.
- **Nada de `any` sin justificar con comentario.** `npm run lint` y
  `npm run typecheck` limpios, y **se declaran en el informe**.
- **Prisma 7 bloquea `migrate reset`.** Usa `migrate deploy`. `npx prisma generate`
  es obligatorio tras tocar el esquema.
- **`tsx` no emite `emitDecoratorMetadata`**: Nest construye las clases
  `@Injectable` sin dependencias y falla en silencio. Para levantar la API,
  `npm run build && node dist/main.js`, **nunca** `tsx`.
- **Ningún guion de usar y tirar se commitea.** La suite de integración protege
  la base con `exigirBaseDesechable()`; comprobaciones sueltas se ejecutan y se
  descartan.
- **Cifras de partida:** 945 unitarias de API, 297 de integración, 227 de web,
  36 recorridos E2E. Informa las que **observes**.

### Comandos

```bash
docker start sgc_postgres sgc_redis
cd apps/api && npm test
cd apps/api && export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|') && npm run test:integration
cd apps/web && npm test
cd apps/api && npm run lint && npm run typecheck
```

---

## Lo que ya existe y no hay que construir

Leer esto ahorra medio ciclo.

| Pieza | Dónde | Qué hace |
|---|---|---|
| `Documento` | `platform/documentos/documento.ts` | Modelo neutro: `nombreArchivo`, `titulo`, `subtitulo`, `metadatos[]`, `secciones[]`, `pie` |
| Renderizadores | `platform/documentos/pdfkit.renderer.ts`, `exceljs.renderer.ts` | **Genéricos.** Dibujan cualquier `Documento` |
| Cola y almacén | `platform/documentos/cola.ts`, `almacen-en-disco.ts` | BullMQ + disco, ya cableados |
| Worker | `platform/documentos/worker.ts` | Despacha por clave de módulo; no conoce ningún módulo |
| `siguienteCodigoEvaluacion` | `evaluacion/domain/value-objects/codigo-evaluacion.ts` | El código de la versión siguiente |
| `permiteVersionado` | `mejora-continua/domain/value-objects/estado-plan.ts` | Aprobado, vigente o histórico |
| `transicionar` | `gestionar-planes-evaluacion.use-case.ts:200` | Las cinco acciones, con `contexto: { comentario? }` |
| Historial por entidad | `auditoria`, permiso `auditoria.leer_entidad` | `GET /auditoria?entidad=…&entidadId=…` |

**El gemelo a calcar** es `medicion/`: `armar-documento-medicion.ts`,
`generar-documento-medicion.use-case.ts`, `documentos-medicion.repository.ts`,
`documentos-medicion.controller.ts` y `versionar-planes-medicion.use-case.ts`.

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `prisma/schema.prisma` + migración | Tabla, dos enums, relación reflexiva, dos columnas | 1 |
| `evaluacion/domain/documentos/armar-documento-evaluacion.ts` | Qué dice el documento, para los dos tipos de plan | 2 |
| `evaluacion/application/ports/documentos-evaluacion.port.ts` | El contrato del repositorio de trabajos | 3 |
| `evaluacion/infrastructure/persistence/documentos-evaluacion.repository.ts` | Su implementación Prisma | 3 |
| `evaluacion/application/use-cases/generar-documento-evaluacion.use-case.ts` | Encolar, ejecutar, estado, listar, descargar | 4 |
| `platform/documentos/puertos.ts` | Una clave más en `ModuloDeDocumentos` | 4 |
| `evaluacion/application/use-cases/versionar-planes-evaluacion.use-case.ts` | La copia de solo la definición | 5 |
| `evaluacion/infrastructure/http/documentos-evaluacion.controller.ts` + DTO | La puerta HTTP de documentos y versiones | 6 |
| `apps/web/.../PlanEvaluacionPage.tsx` + pestañas | Documentos, versiones e historial | 7 |
| `tests/e2e/specs/documentos-evaluacion.spec.ts` | El recorrido | 8 |

---

## Task 1: El esquema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_documentos_y_versiones_evaluacion/migration.sql`
- Test: `apps/api/test/integration/documentos-evaluacion.int.spec.ts`

**Interfaces:**
- Produces: los modelos `DocumentoEvaluacion`, los enums
  `TipoDocumentoEvaluacion` y `EstadoDocumentoEvaluacion`, la relación
  `derivadoDe`/`derivados` y las columnas `aprobadoPorId`/`aprobadoEn` de
  `PlanEvaluacion`. Todo lo consumen las tareas 3, 4 y 5.

- [ ] **Step 1: Declarar los enums y la tabla**

En `schema.prisma`, junto a los demás enums de `mejora_continua`:

```prisma
/// RF-PE-032 y RF-PE-033. Propios y no compartidos con medición aunque los
/// valores rimen: son dos ciclos de vida documentales que pueden divergir, y un
/// enum compartido entre submódulos es acoplamiento disfrazado de reutilización.
enum TipoDocumentoEvaluacion {
  PLAN_EVALUACION_PDF
  PLAN_EVALUACION_EXCEL

  @@schema("mejora_continua")
}

enum EstadoDocumentoEvaluacion {
  EN_COLA
  GENERANDO
  LISTO
  FALLIDO

  @@schema("mejora_continua")
}

model DocumentoEvaluacion {
  id               String                    @id @default(uuid()) @db.Uuid
  planEvaluacionId String                    @map("plan_evaluacion_id") @db.Uuid
  tipo             TipoDocumentoEvaluacion
  estado           EstadoDocumentoEvaluacion @default(EN_COLA)

  nombreArchivo String? @map("nombre_archivo") @db.VarChar(200)
  tipoMime      String? @map("tipo_mime") @db.VarChar(120)
  bytes         Int?
  /// Opaca a propósito: hoy una ruta en disco, mañana una clave de Backblaze B2
  /// (§5.6). No sale nunca en el objeto que viaja al navegador: se lee por su
  /// propio método.
  ubicacion     String? @db.VarChar(500)
  /// Solo con estado FALLIDO. Redactado para una persona, no una traza.
  error         String? @db.Text

  /// Sin clave foránea a usuarios, igual que el resto de la evidencia: el
  /// registro debe seguir siendo legible aunque la cuenta desaparezca.
  solicitadoPor String    @map("solicitado_por") @db.Uuid
  solicitadoEn  DateTime  @default(now()) @map("solicitado_en") @db.Timestamptz(6)
  terminadoEn   DateTime? @map("terminado_en") @db.Timestamptz(6)

  plan PlanEvaluacion @relation(fields: [planEvaluacionId], references: [id], onDelete: Cascade)

  /// El listado va del más reciente al más antiguo, y siempre de un plan.
  @@index([planEvaluacionId, solicitadoEn])
  @@map("documentos_evaluacion")
  @@schema("mejora_continua")
}
```

- [ ] **Step 2: Ampliar `PlanEvaluacion`**

Dentro de `model PlanEvaluacion`, tras `estado`:

```prisma
  /// RF-PE-042: quién aprobó y cuándo. Está también en la bitácora, pero ahí es
  /// un evento entre miles; aquí es un dato del plan que la pantalla enseña sin
  /// consultar otro módulo. No se borran al pasar a Vigente o Histórico: son el
  /// registro de quién autorizó este documento.
  aprobadoPorId String?   @map("aprobado_por_id") @db.Uuid
  aprobadoEn    DateTime? @map("aprobado_en") @db.Timestamptz(6)

  /// RF-PE-034 RN1: la versión nueva referencia a la que la originó.
  /// `SetNull` y no `Cascade`: borrar una versión no puede llevarse su
  /// descendencia, que es evidencia por sí misma.
  derivadoDeId String? @map("derivado_de_id") @db.Uuid
```

Y entre las relaciones:

```prisma
  derivadoDe  PlanEvaluacion?  @relation("VersionesEvaluacion", fields: [derivadoDeId], references: [id], onDelete: SetNull)
  derivados   PlanEvaluacion[] @relation("VersionesEvaluacion")
  documentos  DocumentoEvaluacion[]
```

- [ ] **Step 3: Generar y aplicar la migración**

```bash
cd apps/api && npx prisma migrate dev --name documentos_y_versiones_evaluacion --create-only
npx prisma migrate deploy && npx prisma generate
```

`migrate deploy`, nunca `migrate reset`: Prisma 7 lo bloquea.

**Aplícala también a la base de pruebas**, o las de integración fallarán con
`relation … does not exist`:

```bash
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|') && npx prisma migrate deploy
```

- [ ] **Step 4: Las pruebas de integración**

En `documentos-evaluacion.int.spec.ts`. Copia el `beforeEach` de
`documentos-medicion.int.spec.ts`, que ya trunca en el orden correcto:

```ts
it('nace en cola y llega a listo con sus datos', async () => {
  const t = await prisma.documentoEvaluacion.create({
    data: { planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_PDF', solicitadoPor: ACTOR_ID },
  });
  expect(t.estado).toBe('EN_COLA');

  await prisma.documentoEvaluacion.update({
    where: { id: t.id },
    data: { estado: 'LISTO', bytes: 4096, terminadoEn: new Date() },
  });
  const listo = await prisma.documentoEvaluacion.findUnique({ where: { id: t.id } });
  expect(listo?.bytes).toBe(4096);
});

it('borrar el plan se lleva sus documentos', async () => {
  await prisma.documentoEvaluacion.create({
    data: { planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_EXCEL', solicitadoPor: ACTOR_ID },
  });
  await prisma.planEvaluacion.delete({ where: { id: planId } });
  expect(await prisma.documentoEvaluacion.count()).toBe(0);
});

it('borrar la versión de origen no se lleva la derivada', async () => {
  // RF-PE-034 RN1 con SetNull: el linaje se pierde, la evidencia no.
  const v2 = await prisma.planEvaluacion.create({
    data: { planMedicionId: baseId, codigo: 'EV-PE-E2E-v1-D-v2', version: 2, derivadoDeId: planId },
  });
  await prisma.planEvaluacion.delete({ where: { id: planId } });

  const superviviente = await prisma.planEvaluacion.findUnique({ where: { id: v2.id } });
  expect(superviviente).not.toBeNull();
  expect(superviviente?.derivadoDeId).toBeNull();
});
```

- [ ] **Step 5: Ejecutarlas y comprobar el `SetNull` por mutación**

```bash
cd apps/api && export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|') && npx vitest run --config vitest.integration.config.ts test/integration/documentos-evaluacion.int.spec.ts
```

Después, contra la base de pruebas, recrea la clave foránea con `ON DELETE
CASCADE` en vez de `SET NULL` y confirma que **cae solo la tercera prueba**.
Restaura la restricción original y confírmalo con `\d`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Las tablas de documentos y versiones del plan de evaluación"
```

---

## Task 2: El armador de dominio

Es la tarea con más criterio del ciclo y la que decide si el documento sirve.

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/domain/documentos/armar-documento-evaluacion.ts`
- Test: `apps/api/src/modules/mejora-continua/evaluacion/domain/documentos/armar-documento-evaluacion.spec.ts`

**Interfaces:**
- Consumes: `Documento`, `Seccion`, `Tabla`, `Metadato` de
  `platform/documentos/documento.js`.
- Produces, para la Task 4:

```ts
export type FormatoDocumentoEvaluacion = 'pdf' | 'excel';

export interface DatosParaDocumentoEvaluacion {
  readonly codigo: string;
  readonly version: number;
  readonly estado: string;
  readonly tipo: 'DIRECTA' | 'INDIRECTA';
  readonly carreraNombre: string;
  readonly planBaseCodigo: string;
  readonly competencias: readonly {
    readonly id: string;
    readonly codigo: string;
    readonly nombre: string;
    readonly instrumento: string | null;
    readonly frecuencia: string | null;
    readonly responsableNombre: string | null;
  }[];
  readonly periodos: readonly { readonly id: string; readonly etiqueta: string }[];
  readonly mediciones: readonly {
    readonly competenciaId: string;
    readonly periodoId: string;
    readonly porcentajeAlcanzado: number | null;
    readonly asignaturas: readonly {
      readonly codigo: string;
      readonly nombre: string;
      readonly entregable: string;
      readonly docenteNombre: string | null;
      readonly evidencias: number;
    }[];
  }[];
  readonly indicaciones: readonly {
    readonly periodoId: string;
    readonly grupoObjetivo: string;
    readonly instruccion: string;
    readonly enlaceInstrumento: string;
    readonly enlaceResultados: string | null;
  }[];
  readonly generadoEn: Date;
}

export function armarDocumentoEvaluacion(
  datos: DatosParaDocumentoEvaluacion,
  formato: FormatoDocumentoEvaluacion,
): Documento;
```

- [ ] **Step 1: Las pruebas**

```ts
const BASE: DatosParaDocumentoEvaluacion = {
  codigo: 'EV-PE-ISI-2026-v1-D-v1', version: 1, estado: 'Vigente', tipo: 'DIRECTA',
  carreraNombre: 'Ingeniería de Sistemas', planBaseCodigo: 'PM-ISI-2026-D-v1',
  competencias: [{ id: 'c-1', codigo: 'CPE-01', nombre: 'Resolver problemas',
    instrumento: 'Rúbrica', frecuencia: 'Semestral', responsableNombre: null }],
  periodos: [{ id: 'p-1', etiqueta: '2026-I' }],
  mediciones: [{ competenciaId: 'c-1', periodoId: 'p-1', porcentajeAlcanzado: 80,
    asignaturas: [{ codigo: 'ISI-101', nombre: 'Algoritmos', entregable: 'Proyecto',
      docenteNombre: 'Ana Docente', evidencias: 2 }] }],
  indicaciones: [], generadoEn: new Date('2026-09-10T12:00:00Z'),
};

it('la cabecera lleva el código, el tipo y el estado', () => {
  // RF-PE-033 RN1, literal.
  const d = armarDocumentoEvaluacion(BASE, 'pdf');
  const etiquetas = d.metadatos.map((m) => m.etiqueta);
  expect(etiquetas).toEqual(expect.arrayContaining(['Código', 'Tipo', 'Estado']));
  expect(d.metadatos.find((m) => m.etiqueta === 'Estado')?.valor).toBe('Vigente');
  expect(d.metadatos.find((m) => m.etiqueta === 'Tipo')?.valor).toBe('Directa');
});

it('un plan directo lleva sus asignaturas y ninguna sección de indicaciones', () => {
  const d = armarDocumentoEvaluacion(BASE, 'pdf');
  const titulos = d.secciones.map((s) => s.titulo);
  expect(titulos).toContain('Asignaturas evaluadas');
  expect(titulos).not.toContain('Indicaciones de medición');
});

it('un plan indirecto lleva sus indicaciones y ninguna sección de asignaturas', () => {
  const d = armarDocumentoEvaluacion(
    { ...BASE, tipo: 'INDIRECTA', mediciones: [{ ...BASE.mediciones[0]!, asignaturas: [] }],
      indicaciones: [{ periodoId: 'p-1', grupoObjetivo: 'EGRESADOS',
        instruccion: 'Encuesta anual', enlaceInstrumento: 'https://e.test/f',
        enlaceResultados: null }] },
    'pdf',
  );
  const titulos = d.secciones.map((s) => s.titulo);
  expect(titulos).toContain('Indicaciones de medición');
  expect(titulos).not.toContain('Asignaturas evaluadas');
});

it('un periodo sin porcentaje se exporta igual, diciendo que falta', () => {
  // RF-PE-031 RN1 y RF-PE-032 RN1: se exporta lo que hay, incompleto incluido.
  const d = armarDocumentoEvaluacion(
    { ...BASE, mediciones: [{ ...BASE.mediciones[0]!, porcentajeAlcanzado: null }] },
    'excel',
  );
  const matriz = d.secciones.find((s) => s.titulo === 'Medición alcanzada')!;
  expect(matriz.tabla!.filas.flat()).toContain('Sin registrar');
});

it('un plan sin competencias produce documento, no una tabla muda', () => {
  const d = armarDocumentoEvaluacion({ ...BASE, competencias: [], mediciones: [] }, 'pdf');
  const comp = d.secciones.find((s) => s.titulo === 'Competencias')!;
  expect(comp.tabla!.filas).toEqual([]);
  expect(comp.tabla!.siVacia).toMatch(/competencia/i);
});

it('el pie declara de dónde salió y cuándo', () => {
  // Un PDF que acaba en un expediente de acreditación tiene que poder decirlo.
  const d = armarDocumentoEvaluacion(BASE, 'pdf');
  expect(d.pie).toMatch(/SGC/);
  expect(d.pie).toMatch(/2026/);
});

it('el nombre del archivo lleva el código, sin extensión', () => {
  expect(armarDocumentoEvaluacion(BASE, 'pdf').nombreArchivo)
    .toBe('plan-evaluacion-EV-PE-ISI-2026-v1-D-v1');
});
```

- [ ] **Step 2: Verlas fallar**

`cd apps/api && npx vitest run src/modules/mejora-continua/evaluacion/domain/documentos/`
Esperado: no compila, la función no existe.

- [ ] **Step 3: Implementar**

Lee `medicion/domain/documentos/armar-documento-medicion.ts` entero antes de
escribir: su reparto en funciones pequeñas —`cabecera`, `seccionResumen`,
`seccionCompetencias`— es el patrón a seguir, y sus comentarios explican
decisiones que aquí valen igual.

**La ramificación por tipo va en un solo sitio.** Las secciones comunes
—resumen, competencias, periodos, medición alcanzada— se arman siempre; solo la
última difiere:

```ts
    secciones: [
      seccionResumen(datos),
      seccionCompetencias(datos),
      seccionPeriodos(datos),
      seccionMedicionAlcanzada(datos, formato),
      datos.tipo === 'DIRECTA' ? seccionAsignaturas(datos) : seccionIndicaciones(datos),
    ],
```

Los renderizadores no saben de tipos de plan, y no deben.

**`siVacia` es obligatorio en cada tabla** y tiene que decir qué falta, no
«sin datos»: una tabla vacía sin explicación no distingue un plan sin
asignaturas de un fallo al generarlo.

- [ ] **Step 4: Verlas pasar y mutar**

Ejecuta. Después, tres mutaciones, cada una restaurada antes de la siguiente:

| Mutación | Debe caer |
|---|---|
| `seccionAsignaturas` se arma también para `INDIRECTA` | «un plan indirecto lleva sus indicaciones…» |
| `porcentajeAlcanzado: null` se imprime como cadena vacía | «un periodo sin porcentaje…» |
| Quitar `Estado` de los metadatos | «la cabecera lleva el código, el tipo y el estado» |

Cada una debe tumbar **exactamente** su prueba.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "El armador del documento del plan de evaluación"
```

---

## Task 3: El puerto y el repositorio de documentos

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/application/ports/documentos-evaluacion.port.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/documentos-evaluacion.repository.ts`
- Test: `apps/api/test/integration/documentos-evaluacion.int.spec.ts` (amplía el de la Task 1)

**Interfaces:**
- Consumes: el modelo `DocumentoEvaluacion` de la Task 1.
- Produces, para la Task 4:

```ts
export type TipoDocEvaluacion = 'PLAN_EVALUACION_PDF' | 'PLAN_EVALUACION_EXCEL';
export type EstadoDocEvaluacion = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

/** Lo que viaja al navegador. **Sin `ubicacion`**, a propósito. */
export interface TrabajoDocumentoEvaluacion {
  readonly id: string;
  readonly planEvaluacionId: string;
  readonly tipo: TipoDocEvaluacion;
  readonly estado: EstadoDocEvaluacion;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosEvaluacionPort {
  crear(datos: {
    planEvaluacionId: string;
    tipo: TipoDocEvaluacion;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoEvaluacion>;
  porId(id: string): Promise<TrabajoDocumentoEvaluacion | null>;
  listarDePlan(planEvaluacionId: string, limite: number): Promise<TrabajoDocumentoEvaluacion[]>;
  marcarGenerando(id: string): Promise<void>;
  marcarListo(id: string, archivo: {
    nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string;
  }): Promise<void>;
  marcarFallido(id: string, error: string): Promise<void>;
  /** La ubicación **solo** por aquí: no viaja en el trabajo. */
  ubicacionDe(id: string): Promise<string | null>;
}

export const REPOSITORIO_DOCUMENTOS_EVALUACION = Symbol(
  'RepositorioDocumentosEvaluacionPort',
);
```

**El estado viaja en el vocabulario del dominio** —`'En cola'`, no
`'EN_COLA'`—: el enum en MAYÚSCULAS es de PostgreSQL, y dejarlo salir hasta la
pantalla obligaría al frontend a traducirlo.

- [ ] **Step 1: Las pruebas**

```ts
it('un fallo se guarda como estado, no se pierde', async () => {
  // El trabajo corre en otro proceso: cuando falla no hay ninguna petición HTTP
  // viva a la que devolverle un error, y sin esto la pantalla esperaría para
  // siempre un archivo que no va a llegar.
  const t = await repo.crear({ planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_PDF', solicitadoPor: ACTOR_ID });
  await repo.marcarFallido(t.id, 'El plan no tiene competencias.');

  const f = await repo.porId(t.id);
  expect(f?.estado).toBe('Fallido');
  expect(f?.error).toBe('El plan no tiene competencias.');
});

it('un error larguísimo se recorta en vez de tumbar el UPDATE', async () => {
  // El fallo al guardar el fallo es el peor: dejaría el trabajo en «Generando»
  // para siempre.
  const t = await repo.crear({ planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_PDF', solicitadoPor: ACTOR_ID });
  await repo.marcarFallido(t.id, 'x'.repeat(9000));
  expect((await repo.porId(t.id))?.error).toHaveLength(2000);
});

it('la ubicación no sale en el trabajo, solo por su método', async () => {
  const t = await repo.crear({ planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_PDF', solicitadoPor: ACTOR_ID });
  await repo.marcarListo(t.id, { nombreArchivo: 'p.pdf', tipoMime: 'application/pdf', bytes: 10, ubicacion: '/secreto/p.pdf' });

  expect(JSON.stringify(await repo.porId(t.id))).not.toContain('/secreto/');
  expect(JSON.stringify(await repo.listarDePlan(planId, 10))).not.toContain('/secreto/');
  expect(await repo.ubicacionDe(t.id)).toBe('/secreto/p.pdf');
});

it('el listado va del más reciente al más antiguo, y es de un plan', async () => {
  await repo.crear({ planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_PDF', solicitadoPor: ACTOR_ID });
  await repo.crear({ planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_EXCEL', solicitadoPor: ACTOR_ID });

  const lista = await repo.listarDePlan(planId, 10);
  expect(lista[0]!.tipo).toBe('PLAN_EVALUACION_EXCEL');
  expect(await repo.listarDePlan(otroPlanId, 10)).toEqual([]);
});

it('el estado viaja en el vocabulario del dominio, no en MAYÚSCULAS', async () => {
  const t = await repo.crear({ planEvaluacionId: planId, tipo: 'PLAN_EVALUACION_PDF', solicitadoPor: ACTOR_ID });
  expect(t.estado).toBe('En cola');
});
```

- [ ] **Step 2: Verlas fallar, implementar, verlas pasar**

Calca `documentos-medicion.repository.ts`, incluido el recorte del error a 2000
caracteres.

- [ ] **Step 3: Mutar**

Haz que `porId` incluya `ubicacion` en el objeto devuelto: debe caer **solo** «la
ubicación no sale en el trabajo». Restaura.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "El repositorio de documentos del plan de evaluación"
```

---

## Task 4: El caso de uso de documentos

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/generar-documento-evaluacion.use-case.ts`
- Create: su `.spec.ts` hermano
- Modify: `apps/api/src/platform/documentos/puertos.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: el puerto de la Task 3, el armador de la Task 2,
  `ContenidoCurricularPort`, `RepositorioConfiguracionEvaluacionPort`.
- Produces, para la Task 6: `encolar(actor, planEvaluacionId, tipo)`,
  `ejecutar(trabajoId)`, `estado(actor, trabajoId)`,
  `listarDePlan(actor, planEvaluacionId, limite)`,
  `descargar(actor, trabajoId)`.

- [ ] **Step 1: La clave del worker**

`platform/documentos/puertos.ts` declara hoy:

```ts
export type ModuloDeDocumentos = 'plan-estudios' | 'mejora-continua';
```

El worker despacha por esa clave para saber en qué tabla buscar el trabajo, y
`'mejora-continua'` ya significa «la tabla de medición». **Añade un valor, no
renombres el existente**: renombrarlo rompería los trabajos que ya estén en
Redis.

```ts
/**
 * Qué tabla mira el worker para encontrar el trabajo.
 *
 * `'mejora-continua'` es histórico y significa **medición**: se llamó así
 * cuando era el único submódulo del módulo con documentos. No se renombra
 * porque los trabajos ya encolados en Redis llevan ese valor escrito.
 */
export type ModuloDeDocumentos =
  | 'plan-estudios'
  | 'mejora-continua'
  | 'mejora-continua-evaluacion';
```

El worker no cambia: indexa un `Record` y la clave nueva entra sola. En
`app.module.ts`, el proveedor de `GENERADORES_DE_DOCUMENTOS` gana una entrada
más apuntando al caso de uso nuevo.

- [ ] **Step 2: Las pruebas**

```ts
it('encolar deja el trabajo en cola y lo manda a la cola con su clave', async () => {
  const t = await casos.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_PDF');
  expect(t.estado).toBe('En cola');
  expect(cola.encolado).toEqual({ trabajoId: t.id, modulo: 'mejora-continua-evaluacion' });
});

it('encolar sobre un plan que no existe es 404, y no encola nada', async () => {
  await expect(casos.encolar(ACTOR, 'ev-inventado', 'PLAN_EVALUACION_PDF'))
    .rejects.toThrow(NoEncontrado);
  expect(cola.encolado).toBeNull();
});

it('ejecutar no lanza nunca: un fallo se guarda como estado', async () => {
  // El worker no tiene a quién devolverle una excepción. Si esto lanzara, el
  // trabajo se quedaría en «Generando» para siempre.
  curricular.planPorId = async () => null;
  await expect(casos.ejecutar(trabajoId)).resolves.toBeUndefined();
  expect((await documentos.porId(trabajoId))?.estado).toBe('Fallido');
});

it('descargar un trabajo que no está listo es 409, nombrando el estado', async () => {
  await expect(casos.descargar(ACTOR, trabajoEnCola)).rejects.toThrow(/En cola/);
});

it('pasa la carrera del plan a puede(), no null', async () => {
  await casos.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_PDF').catch(() => undefined);
  expect(autorizacion.puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.editar', 'carrera-ajena');
});

it('cada encolado deja constancia', async () => {
  await casos.encolar(ACTOR, 'ev-1', 'PLAN_EVALUACION_EXCEL');
  expect(publicados.at(-1)?.nombre).toBe('evaluacion.documento');
});
```

- [ ] **Step 3: Implementar**

Calca `generar-documento-medicion.use-case.ts`. Los cinco métodos y, sobre
todo, la promesa que `ejecutar` cumple: **no lanza nunca**, envuelve todo en
`try/catch` y llama a `marcarFallido`.

Las lecturas (`estado`, `listarDePlan`, `descargar`) exigen `evaluacion.leer`
con `carreraId` nulo — no está acotado. `encolar` exige `evaluacion.editar` con
la carrera resuelta por `carreraDe`, como el resto del módulo desde 2c-C.

- [ ] **Step 4: Verlas pasar y mutar**

| Mutación | Debe caer |
|---|---|
| `encolar` manda `'mejora-continua'` como clave | «lo manda a la cola con su clave» |
| `ejecutar` deja escapar la excepción | «ejecutar no lanza nunca» |
| Quitar `dejarConstancia` de `encolar` | «cada encolado deja constancia» |
| `carreraDe(...)` → `null` | «pasa la carrera del plan a puede()» |

- [ ] **Step 5: Comprobar en caliente**

```bash
cd apps/api && npm run build && node dist/main.js   # nunca tsx
```

En otra terminal, `npm run start:worker`. Encola un PDF y un Excel y comprueba
que los dos llegan a `LISTO` y que el archivo se abre.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "El caso de uso de documentos del plan de evaluación"
```

---

## Task 5: El versionado, y quién aprobó

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/versionar-planes-evaluacion.use-case.ts`
- Create: su `.spec.ts` hermano
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts`
- Modify: el puerto y el repositorio de `plan-evaluacion`

**Interfaces:**
- Produces, para la Task 6: `generarNuevaVersion(actor, id): Promise<DatosPlanEvaluacion>`
  y `versionesDe(actor, id): Promise<DatosPlanEvaluacion[]>`.

- [ ] **Step 1: Las pruebas del versionado**

```ts
it('la versión nueva nace en Borrador, con el código siguiente y el vínculo al origen', async () => {
  const v2 = await casos.generarNuevaVersion(ACTOR, 'ev-1');
  expect(v2.estado).toBe('Borrador');
  expect(v2.version).toBe(2);
  expect(v2.derivadoDeId).toBe('ev-1');
});

it('copia la definición: instrumento, frecuencia, responsable, asignaturas e indicaciones', async () => {
  await casos.generarNuevaVersion(ACTOR, 'ev-1');
  const copiado = configuraciones.copiado!;
  expect(copiado.competencias[0]).toMatchObject({
    instrumento: 'Rúbrica', frecuencia: 'Semestral', responsableId: 'u-9',
  });
  expect(copiado.asignaturas[0]).toMatchObject({ entregable: 'Proyecto', docenteId: 'd-1' });
  expect(copiado.indicaciones[0]).toMatchObject({ grupoObjetivo: 'EGRESADOS' });
});

it('NO copia el seguimiento: ni porcentaje, ni evidencias, ni enlace a resultados', async () => {
  // La decisión de fondo del ciclo. El seguimiento es lo que ocurrió en un
  // periodo concreto; copiarlo inventaría mediciones que nadie tomó.
  await casos.generarNuevaVersion(ACTOR, 'ev-1');
  const copiado = configuraciones.copiado!;
  expect(copiado.mediciones.every((m) => m.porcentajeAlcanzado === null)).toBe(true);
  expect(copiado.asignaturas.every((a) => a.evidencias.length === 0)).toBe(true);
  expect(copiado.indicaciones.every((i) => i.enlaceResultados === null)).toBe(true);
});

it('pero sí crea las filas de medición vacías, que son la rejilla', async () => {
  await casos.generarNuevaVersion(ACTOR, 'ev-1');
  expect(configuraciones.copiado!.mediciones).toHaveLength(1);
});

it('la versión original no se toca', async () => {
  const antes = { ...(await planes.porId('ev-1'))! };
  await casos.generarNuevaVersion(ACTOR, 'ev-1');
  expect(await planes.porId('ev-1')).toEqual(antes);
});

it('la versión nueva no hereda la aprobación de su antecesora', async () => {
  const v2 = await casos.generarNuevaVersion(ACTOR, 'ev-1');
  expect(v2.aprobadoPorId).toBeNull();
  expect(v2.aprobadoEn).toBeNull();
});

it('un Borrador no se versiona, y el error dice por qué', async () => {
  plan.estado = 'Borrador';
  await expect(casos.generarNuevaVersion(ACTOR, 'ev-1'))
    .rejects.toThrow(/se puede editar directamente/);
});

it('se versiona desde aprobado, vigente e histórico', async () => {
  for (const estado of ['Aprobado', 'Vigente', 'Histórico'] as const) {
    plan.estado = estado;
    await expect(casos.generarNuevaVersion(ACTOR, 'ev-1')).resolves.toBeDefined();
  }
});

it('las versiones se listan de la más reciente a la más antigua', async () => {
  const lista = await casos.versionesDe(ACTOR, 'ev-1');
  expect(lista.map((v) => v.version)).toEqual([3, 2, 1]);
});
```

- [ ] **Step 2: La prueba de RF-PE-042**

En `gestionar-planes-evaluacion.spec.ts`:

```ts
it('aprobar registra quién y cuándo', async () => {
  const antes = Date.now();
  const plan = await casos.transicionar(ACTOR, 'ev-1', 'aprobar', {});
  expect(plan.aprobadoPorId).toBe(ACTOR.id);
  expect(plan.aprobadoEn!.getTime()).toBeGreaterThanOrEqual(antes);
});

it('las demás transiciones no tocan el responsable de aprobación', async () => {
  await casos.transicionar(ACTOR, 'ev-1', 'aprobar', {});
  const vigente = await casos.transicionar(ACTOR, 'ev-1', 'marcar-vigente', {});
  expect(vigente.aprobadoPorId).toBe(ACTOR.id);
});
```

- [ ] **Step 3: Verlas fallar, implementar, verlas pasar**

`permiteVersionado` ya existe en
`mejora-continua/domain/value-objects/estado-plan.ts` — **no escribas otro
predicado**. El mensaje de error debe decir que un borrador se edita
directamente, como el de medición: decir solo «no se puede» deja a quien lo lea
sin saber la salida.

La copia va en una **transacción**: o entran todas las filas o ninguna.

**No se calca `duplicarPlan`.** Medición lo tiene porque un plan de medición se
copia entre carreras; uno de evaluación cuelga siempre de un plan de medición
concreto. YAGNI.

**Y esperas una asimetría con el gemelo: es deliberada.**
`versionar-planes-medicion.use-case.ts:44` documenta *«copia con vínculo al
origen, **conservando las marcas de medición**»* — lo contrario de lo que hace
esta tarea. No son la misma cosa: la «marca» de medición es el booleano
`realizada` de una `Programacion`, que dice **qué se planificó medir**; el
porcentaje alcanzado dice **cuánto se midió de verdad**. Uno es intención, el
otro resultado. Escríbelo en el comentario de cabecera del caso de uso, o la
próxima revisión lo leerá como un descuido.

- [ ] **Step 4: Mutar**

| Mutación | Debe caer |
|---|---|
| La copia arrastra `porcentajeAlcanzado` | «NO copia el seguimiento» |
| La copia no crea filas de medición | «pero sí crea las filas de medición vacías» |
| `permiteVersionado` acepta también `Borrador` | «un Borrador no se versiona» |
| `aprobar` no escribe `aprobadoEn` | «aprobar registra quién y cuándo» |

En el bucle de estados, comprueba **en qué iteración** falla: si cae en la
primera, el bucle podría no estar recorriendo el resto.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "El versionado del plan de evaluación, y quién lo aprobó"
```

---

## Task 6: Los endpoints

**Files:**
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/documentos-evaluacion.controller.ts`
- Create: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/dto/documentos-evaluacion.dto.ts`
- Modify: `planes-evaluacion.controller.ts` (las dos rutas de versiones)
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces, para la Task 7:

| Verbo y ruta | Cuerpo o respuesta |
|---|---|
| `POST /planes-evaluacion/:id/documentos` | `{ tipo: 'PLAN_EVALUACION_PDF' \| 'PLAN_EVALUACION_EXCEL' }` |
| `GET /planes-evaluacion/:id/documentos` | `TrabajoDocumentoEvaluacion[]` |
| `GET /documentos-evaluacion/:trabajoId` | `TrabajoDocumentoEvaluacion` |
| `GET /documentos-evaluacion/:trabajoId/archivo` | El binario, con `Content-Disposition` |
| `POST /planes-evaluacion/:id/versiones` | El plan nuevo |
| `GET /planes-evaluacion/:id/versiones` | El linaje, de más reciente a más antigua |

- [ ] **Step 1: El DTO**

```ts
export class GenerarDocumentoEvaluacionDto {
  @ApiProperty({ enum: ['PLAN_EVALUACION_PDF', 'PLAN_EVALUACION_EXCEL'] })
  @IsIn(['PLAN_EVALUACION_PDF', 'PLAN_EVALUACION_EXCEL'])
  tipo!: TipoDocEvaluacion;
}
```

- [ ] **Step 2: Los controladores**

Calca `documentos-medicion.controller.ts`, incluida la cabecera de descarga.
Registra el controlador nuevo en `app.module.ts`.

**Actualiza la cabecera del fichero de `planes-evaluacion.controller.ts`** si
enumera rutas: con las dos de versiones, la cuenta cambia. En los dos ciclos
anteriores esa clase de cabecera se quedó desfasada y hubo que volver a ella.

- [ ] **Step 3: Comprobar en caliente**

```bash
cd apps/api && npm run build && node dist/main.js
```

Comprueba: 401 sin token; 400 con `tipo: 'DOCX'`; 404 encolando sobre un plan
inexistente; 409 descargando un trabajo en cola; 409 versionando un Borrador; y
que `GET /planes-evaluacion/:id/versiones` devuelve el linaje ordenado.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Los endpoints de documentos y versiones del plan de evaluación"
```

---

## Task 7: Las pantallas

**Files:**
- Modify: `apps/web/src/features/mejora-continua/pages/PlanEvaluacionPage.tsx`
- Create: `apps/web/src/features/mejora-continua/components/DocumentosDelPlan.tsx` + su test
- Create: `apps/web/src/features/mejora-continua/components/VersionesDelPlan.tsx` + su test
- Modify: `apps/web/src/features/mejora-continua/api/` y `queries.ts`

**Interfaces:**
- Produces, para la Task 8, los textos que el E2E busca **literales**: botones
  **«Generar PDF»** y **«Generar Excel»**, encabezados **«Documentos»**,
  **«Versiones»** e **«Historial de cambios»**, botón **«Descargar»**, y el
  estado visible del trabajo con las palabras **«En cola»**, **«Generando»**,
  **«Listo»** y **«Fallido»**.

- [ ] **Step 1: La descarga, que tiene una trampa**

**No uses `<a href>`.** El token vive en `sessionStorage`, así que un enlace
directo va sin cabecera de autorización y devuelve 401. Se pide con `fetch`, se
recibe un blob y se guarda con `guardarArchivo`, que **ya existe** en
`shared/api/cliente`. Es un error que este proyecto ya pagó en el ciclo de
exportación de medición.

- [ ] **Step 2: El sondeo del estado**

Un trabajo tarda. La pestaña consulta el estado con `refetchInterval` mientras
haya alguno en `En cola` o `Generando`, y **deja de sondear** cuando todos han
terminado — un intervalo que no para es una fuga de peticiones que nadie ve.

```ts
export function useDocumentosDelPlan(planId: string) {
  return useQuery({
    queryKey: clavesEval.documentos(planId),
    queryFn: () => evaluacionApi.documentosDelPlan(planId),
    refetchInterval: (q) => {
      const hay = (q.state.data ?? []).some(
        (t) => t.estado === 'En cola' || t.estado === 'Generando',
      );
      return hay ? 2000 : false;
    },
  });
}
```

- [ ] **Step 3: Las pruebas de componente**

Usa un ayudante `montar(props?)` que devuelva los `vi.fn()`, como hace
`ConfiguracionDelAnio.test.tsx`.

```tsx
const LISTO = { id: 't-1', tipo: 'PLAN_EVALUACION_PDF', estado: 'Listo',
  nombreArchivo: 'plan.pdf', bytes: 4096, error: null } as const;
const EN_CURSO = { ...LISTO, id: 't-2', estado: 'Generando', nombreArchivo: null } as const;
const FALLIDO = { ...LISTO, id: 't-3', estado: 'Fallido', nombreArchivo: null,
  error: 'El plan no tiene competencias.' } as const;

it('un trabajo fallido enseña su motivo, no un estado mudo', () => {
  montar({ documentos: [FALLIDO] });
  expect(screen.getByText('Fallido')).toBeVisible();
  expect(screen.getByText('El plan no tiene competencias.')).toBeVisible();
});

it('solo se puede descargar lo que está listo', () => {
  montar({ documentos: [LISTO, EN_CURSO] });
  const botones = screen.getAllByRole('button', { name: 'Descargar' });
  expect(botones).toHaveLength(1);
});

it('descargar pide el archivo con la sesión, no con un enlace', async () => {
  // El token vive en sessionStorage: un `<a href>` iría sin cabecera y daría
  // 401. Si esta prueba encuentra un enlace, el fallo ya está cometido.
  const p = montar({ documentos: [LISTO] });
  await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));

  expect(p.onDescargar).toHaveBeenCalledWith('t-1');
  expect(screen.queryByRole('link', { name: 'Descargar' })).not.toBeInTheDocument();
});

it('generar encola el tipo que se pulsó', async () => {
  const p = montar({ documentos: [] });
  await userEvent.click(screen.getByRole('button', { name: 'Generar Excel' }));
  expect(p.onGenerar).toHaveBeenCalledWith('PLAN_EVALUACION_EXCEL');
});

it('sin ningún documento lo dice, en vez de una lista muda', () => {
  montar({ documentos: [] });
  expect(screen.getByText(/todavía no se ha generado/i)).toBeVisible();
});
```

Y para `VersionesDelPlan.test.tsx`:

```tsx
const LINAJE = [
  { id: 'ev-3', codigo: 'EV-…-v3', version: 3, estado: 'Borrador' },
  { id: 'ev-2', codigo: 'EV-…-v2', version: 2, estado: 'Histórico' },
  { id: 'ev-1', codigo: 'EV-…-v1', version: 1, estado: 'Histórico' },
] as const;

it('las versiones se listan de la más reciente a la más antigua', () => {
  // RF-PE-035 RN1, literal.
  montar({ versiones: LINAJE });
  const filas = screen.getAllByRole('row').slice(1); // sin la cabecera
  expect(filas.map((f) => f.textContent)).toEqual([
    expect.stringContaining('v3'),
    expect.stringContaining('v2'),
    expect.stringContaining('v1'),
  ]);
});

it('una versión histórica se abre en solo lectura', async () => {
  // RF-PE-037 RN1: ninguna opción de edición sobre versiones históricas.
  montar({ versiones: LINAJE, versionAbierta: 'ev-2' });
  expect(screen.getByText(/solo lectura/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
});

it('el botón de generar versión no aparece sobre un Borrador', () => {
  // permiteVersionado excluye Borrador: un borrador se edita directamente.
  montar({ versiones: LINAJE, estadoActual: 'Borrador' });
  expect(screen.queryByRole('button', { name: 'Generar nueva versión' }))
    .not.toBeInTheDocument();
});
```

- [ ] **Step 3b: El sondeo, que necesita relojes falsos**

```tsx
it('deja de sondear cuando ningún trabajo está en curso', async () => {
  vi.useFakeTimers();
  const p = montar({ documentos: [EN_CURSO] });

  await vi.advanceTimersByTimeAsync(2100);
  expect(p.onRefetch).toHaveBeenCalledTimes(1);

  p.conDocumentos([LISTO]);          // el trabajo terminó
  await vi.advanceTimersByTimeAsync(6000);
  expect(p.onRefetch).toHaveBeenCalledTimes(1);   // no volvió a pedir

  vi.useRealTimers();
});
```

Un intervalo que no para es una fuga de peticiones que nadie ve hasta que la
pestaña lleva horas abierta.

- [ ] **Step 4: El historial**

La pestaña «Historial de cambios» consulta
`GET /auditoria?entidad=PlanEvaluacion&entidadId=<id>`. **No hay endpoint nuevo
en `mejora-continua`**: el permiso `auditoria.leer_entidad` existe para esto.

**Comprueba que el rol Coordinador Académico lo tiene.** Si no, añádelo en
`prisma/seed.ts` — sin él, quien más edita estos planes no ve su propio
historial, que es el hueco exacto que el comentario de
`consultar-bitacora.use-case.ts:64` describe para medición.

- [ ] **Step 5: Mutar**

Reduce el botón de generar a un `return` sin llamada: debe caer más de una
prueba. Si no cae ninguna, las pruebas no prueban el generado.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Las pantallas de documentos, versiones e historial"
```

---

## Task 8: De punta a punta

**Files:**
- Create: `tests/e2e/specs/documentos-evaluacion.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts`
- Modify: `CLAUDE.md`, `README.md`, `docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`

- [ ] **Step 1: El recorrido de documentos**

```ts
test('generar un PDF y descargarlo', async ({ page }) => {
  await abrirPlanEvaluacion(page);
  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByRole('button', { name: 'Generar PDF' }).click();

  // El worker tarda: se espera al estado, no a un tiempo fijo.
  await expect(page.getByText('Listo')).toBeVisible({ timeout: 30_000 });

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar' }).first().click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
});
```

**El worker tiene que estar corriendo** (`npm run start:worker` en `apps/api`) o
el trabajo se queda en cola para siempre. Dilo en el informe si lo arrancas.

- [ ] **Step 2: El recorrido del versionado**

```ts
test('generar una versión deja intacta la original', async ({ page }) => {
  await abrirPlanEvaluacionVigente(page);
  // Escribe un porcentaje ANTES de versionar: sin esto, comprobar que la copia
  // no lo arrastra no distingue «no se copió» de «nunca existió».
  await registrarPorcentaje(page, 'CPE-01', '80');

  await page.getByRole('tab', { name: 'Versiones' }).click();
  await page.getByRole('button', { name: 'Generar nueva versión' }).click();
  await expect(page.getByText(/v2/)).toBeVisible();

  // La v2 nace sin el seguimiento…
  await page.getByRole('link', { name: /v2/ }).click();
  await expect(page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' }))
    .toHaveValue('');

  // …y la v1 conserva el suyo.
  await volverA(page, 'v1');
  await expect(page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' }))
    .toHaveValue('80');
});
```

- [ ] **Step 3: Accesibilidad**

Añade las pestañas nuevas a `accesibilidad.spec.ts` **con contenido real**: un
documento generado en la lista y una versión en el linaje antes de analizar. En
un ciclo anterior se analizó el estado vacío y `axe` no vio ningún campo.

- [ ] **Step 4: La divergencia del formato**

En `CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`, con el formato de D-10 y D-13:
`RF-PE-032` RN2 y `RF-PE-033` RN2 exigen «formato igual al institucional», esa
plantilla no está en el repositorio, se calcó el de medición. Marcada
**PENDIENTE**. Actualiza los recuentos de la cabecera del fichero.

- [ ] **Step 5: Los recuentos**

Ejecuta las cuatro suites y **usa las cifras que observes**.

- `CLAUDE.md` §1: `RF-PE` pasa a **49 de 49**; el total, de 190 a **201 de 243**,
  un **83 %**. Comprueba: 60+13+47+49+32+0 = 201, y 60+13+47+49+47+27 = 243.
- **Añade `038`, `039` y `040` a la lista de «construido sin cita»**, con su
  razón: `transicionar` los cubre desde 2c-A y recibe el comentario en su
  contexto.
- `README.md`: las cifras de las suites.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Los documentos y el versionado del plan de evaluación, de punta a punta"
```
