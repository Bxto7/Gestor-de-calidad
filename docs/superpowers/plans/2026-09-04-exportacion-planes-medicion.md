# Exportación del plan de medición — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un plan de medición se pueda exportar a Excel y a PDF, generados fuera del request y descargables cuando estén listos.

**Architecture:** La maquinaria de documentos que hoy vive en `plan-estudios` sube a `platform/` sin cambiar de comportamiento. Mejora Continua añade lo suyo: qué dice su documento (dominio), su propia tabla, y su generador. La cola de BullMQ se comparte y el trabajo pasa a declarar de qué módulo es.

**Tech Stack:** NestJS 11, Prisma 7, BullMQ sobre Redis, `pdfkit`, `exceljs`, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-04-exportacion-planes-medicion-design.md`

## Global Constraints

- **El traslado a `platform/` es su propia tarea y su propio commit.** Ni una línea de funcionalidad nueva dentro, ni un renombre «de paso»: solo rutas de importación.
- **No se da por bueno hasta que pasen las cuatro suites:** 689 unitarias, 227 de integración, 174 de frontend y 19 E2E.
- **`domain/` no importa NestJS, Prisma ni Express** (CLAUDE.md §2). Lo que el documento dice es dominio puro.
- **Un módulo nunca comparte tabla con otro** (§3.2). `documentos_medicion` va en el esquema `mejora_continua`.
- **`armar-documentos.ts` NO sube a `platform/`.** Qué dice el resumen de un plan de estudios es contenido de ese módulo.
- **En PDF la matriz va por competencia; en Excel, como cuadrícula** (spec §3.5).
- **Todos los endpoints exigen `medicion.leer`**: exportar es leer.
- **Migraciones siempre por Prisma Migrate.** Tras cambiar el esquema, `npx prisma generate` antes de correr pruebas: el cliente no se regenera solo y las pruebas fallan con «Unknown argument».
- **Antes de cada commit:** `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm test` en el paquete tocado.
- **Las pruebas de integración exigen base desechable:** `DATABASE_URL` apuntando a `sgc_test`.

---

### Task 1: El traslado a `platform/`

**Files:**
- Create: `apps/api/src/platform/documentos/documento.ts`
- Create: `apps/api/src/platform/documentos/puertos.ts`
- Create: `apps/api/src/platform/documentos/pdfkit.renderer.ts`
- Create: `apps/api/src/platform/documentos/exceljs.renderer.ts`
- Create: `apps/api/src/platform/documentos/almacen-en-disco.ts`
- Delete: los cinco originales en `apps/api/src/modules/plan-estudios/`
- Modify: `apps/api/src/modules/plan-estudios/application/ports/documentos.port.ts`, `domain/documentos/armar-documentos.ts`, `src/app.module.ts`, `src/worker.module.ts` y todo lo que importe de las rutas viejas

**Interfaces:**
- Consumes: nada.
- Produces, desde `platform/documentos/`:
  - `documento.ts`: `Documento`, `Tabla`, `Columna`, `Alineacion` y el resto del modelo neutro, sin cambios.
  - `puertos.ts`: `AlmacenDeArchivosPort`, `RenderizadorPdfPort`, `RenderizadorHojaPort`, y los símbolos `ALMACEN_ARCHIVOS`, `RENDERIZADOR_PDF`, `RENDERIZADOR_HOJA`.
  - Los tres adaptadores con sus nombres de clase actuales.

  Las tareas 4 y 5 los consumen desde `mejora-continua`.

**Esta tarea no cambia comportamiento.** Lo que la verifica son las suites que ya existen.

- [ ] **Step 1: Mover los cinco archivos**

```bash
cd apps/api
mkdir -p src/platform/documentos
git mv src/modules/plan-estudios/domain/documentos/documento.ts src/platform/documentos/documento.ts
git mv src/modules/plan-estudios/infrastructure/documents/pdfkit.renderer.ts src/platform/documentos/pdfkit.renderer.ts
git mv src/modules/plan-estudios/infrastructure/documents/exceljs.renderer.ts src/platform/documentos/exceljs.renderer.ts
git mv src/modules/plan-estudios/infrastructure/documents/almacen-en-disco.ts src/platform/documentos/almacen-en-disco.ts
```

`git mv` y no copiar y borrar: conserva el historial del archivo, que es lo que permite ver por qué una línea dice lo que dice.

- [ ] **Step 2: Partir el puerto**

De `plan-estudios/application/ports/documentos.port.ts` se sacan a `platform/documentos/puertos.ts` **solo** las tres interfaces genéricas y sus símbolos:

```ts
/**
 * Contratos de generación y almacenamiento de documentos.
 *
 * Viven en `platform/` y no dentro de un módulo porque no son de ninguno: el
 * modelo de documento es neutro —títulos, párrafos y tablas— y los dos
 * renderizadores no saben de qué habla lo que dibujan. Estaban en
 * `plan-estudios` solo porque fue el primero en necesitarlos.
 *
 * Lo que NO está aquí es qué dice cada documento: eso es contenido de
 * acreditación y lo escribe cada módulo en su propio `domain/`.
 */

import type { Documento } from './documento.js';

export interface AlmacenDeArchivosPort {
  /** Devuelve la ubicación con la que después se recupera. */
  guardar(clave: string, contenido: Buffer): Promise<string>;
  leer(ubicacion: string): Promise<Buffer>;
}

export interface RenderizadorPdfPort {
  render(documento: Documento): Promise<Buffer>;
}

export interface RenderizadorHojaPort {
  render(documento: Documento): Promise<Buffer>;
}

export const ALMACEN_ARCHIVOS = Symbol('AlmacenDeArchivosPort');
export const RENDERIZADOR_PDF = Symbol('RenderizadorPdfPort');
export const RENDERIZADOR_HOJA = Symbol('RenderizadorHojaPort');
```

Los símbolos exactos y los nombres de las interfaces se copian del archivo original **sin renombrar nada**. En `documentos.port.ts` se dejan `TrabajoDocumento`, `RepositorioDocumentosPort`, `ColaDeDocumentosPort`, `RepositorioDatosDocumentoPort`, `TIPOS_DOCUMENTO` y `ESTADOS_TRABAJO`, que sí son de Plan de Estudios, y se reexportan los tres contratos para no romper a quien ya los importaba:

```ts
export type {
  AlmacenDeArchivosPort,
  RenderizadorPdfPort,
  RenderizadorHojaPort,
} from '../../../../platform/documentos/puertos.js';
export {
  ALMACEN_ARCHIVOS,
  RENDERIZADOR_PDF,
  RENDERIZADOR_HOJA,
} from '../../../../platform/documentos/puertos.js';
```

- [ ] **Step 3: Arreglar los imports hasta que el typecheck calle**

```bash
cd apps/api
npm run typecheck
```

Cada error señala un archivo que importaba de la ruta vieja. Se corrige la ruta y **nada más**. Repetir hasta que salga limpio. Los sospechosos: `armar-documentos.ts`, `generar-documentos.use-case.ts`, `app.module.ts`, `worker.module.ts` y los specs de documentos.

- [ ] **Step 4: Comprobar que no cambió nada**

Este paso es el que autoriza a seguir. Si algo falla aquí, se arregla **antes** de escribir una línea de la Task 2.

```bash
cd apps/api
npm test
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
npm run typecheck && npm run lint && npm run format:check
```

Expected: 689 unitarias y 227 de integración, exactamente las mismas que antes. Ni una más ni una menos: un traslado que cambia el recuento no fue un traslado.

- [ ] **Step 5: Comprobar que los documentos se siguen generando de verdad**

El typecheck no prueba que un PDF salga. Con los servicios levantados:

```bash
cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start &
npm run start:worker &
```

Y desde el navegador o con `curl`, encolar un resumen de un plan de estudios y comprobar que llega a `Listo` con bytes. Si el worker no lo procesa, el traslado rompió el cableado de inyección, que es justo lo que el typecheck no ve.

- [ ] **Step 6: Commitear el traslado, solo**

```bash
cd /d/App-ICACIT
git add apps/api/src/
git commit -m "La maquinaria de documentos sube a platform/, sin cambiar nada"
```

---

### Task 2: La tabla

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/…_documentos_medicion/migration.sql`
- Test: `apps/api/test/integration/plan-medicion.int.spec.ts`

**Interfaces:**
- Consumes: el modelo `PlanMedicion`.
- Produces: el modelo `DocumentoMedicion` y el enum `TipoDocumentoMedicion`. Las tareas 3 a 6 dependen de ellos.

- [ ] **Step 1: Añadir el modelo al esquema**

En `apps/api/prisma/schema.prisma`, junto a los demás modelos de `mejora_continua`:

```prisma
/// RF-PM-028 y RF-PM-029.
enum TipoDocumentoMedicion {
  PLAN_MEDICION_PDF
  PLAN_MEDICION_EXCEL

  @@schema("mejora_continua")
}

/// RF-PM-027: el plan de medición generado como archivo.
///
/// Tabla propia y no la de Plan de Estudios: aquella tiene clave foránea a
/// `PlanEstudios`, y CLAUDE.md §3.2 prohíbe que dos módulos compartan tabla.
/// Generalizarla a «apunta a cualquier entidad» la dejaría sin clave foránea, y
/// con ella se perdería el borrado en cascada.
model DocumentoMedicion {
  id             String                @id @default(uuid()) @db.Uuid
  planMedicionId String                @map("plan_medicion_id") @db.Uuid
  tipo           TipoDocumentoMedicion
  estado         EstadoDocumento       @default(EN_COLA)

  nombreArchivo String? @map("nombre_archivo") @db.VarChar(200)
  tipoMime      String? @map("tipo_mime") @db.VarChar(120)
  bytes         Int?
  /// Opaca a propósito: hoy una ruta en disco, mañana una clave de Backblaze B2
  /// (§5.6), sin que cambie nada más.
  ubicacion     String? @db.VarChar(500)
  /// Solo con estado FALLIDO. Redactado para una persona, no una traza.
  error         String? @db.Text

  /// Sin clave foránea a usuarios, igual que el resto de la evidencia: el
  /// registro debe seguir siendo legible aunque la cuenta desaparezca.
  solicitadoPor String    @map("solicitado_por") @db.Uuid
  solicitadoEn  DateTime  @default(now()) @map("solicitado_en") @db.Timestamptz(6)
  terminadoEn   DateTime? @map("terminado_en") @db.Timestamptz(6)

  plan PlanMedicion @relation(fields: [planMedicionId], references: [id], onDelete: Cascade)

  @@index([planMedicionId, solicitadoEn])
  @@map("documentos_medicion")
  @@schema("mejora_continua")
}
```

Y en `model PlanMedicion`, junto a `programacion`:

```prisma
  documentos   DocumentoMedicion[]
```

`EstadoDocumento` ya existe en el esquema de `plan_estudios`. Si Prisma se queja de que un enum de otro esquema no puede usarse aquí, declarar uno propio con los mismos valores y anotar por qué:

```prisma
/// Mismos valores que el de `plan_estudios`, duplicado porque un enum no cruza
/// esquemas. Si divergen, el worker enrutará mal.
enum EstadoDocumentoMedicion {
  EN_COLA
  GENERANDO
  LISTO
  FALLIDO

  @@schema("mejora_continua")
}
```

- [ ] **Step 2: Generar la migración y regenerar el cliente**

```bash
cd apps/api
npx prisma migrate dev --name documentos_medicion
npx prisma generate
```

`prisma generate` explícito: sin él, las pruebas fallan con «Unknown argument» porque el cliente sigue siendo el anterior. Pasó en el ciclo del versionado.

- [ ] **Step 3: Escribir la prueba de la cascada**

En `apps/api/test/integration/plan-medicion.int.spec.ts`:

```ts
describe('RF-PM-027 — los documentos del plan', () => {
  it('borrar el plan se lleva sus documentos', async () => {
    // `Cascade` y no `SetNull`: un documento sin plan no le sirve a nadie, y
    // dejaría archivos en disco que ya no se pueden pedir por ninguna pantalla.
    const p = await crear('DIRECTA', 'PM-DOCS-D-v1');
    await prisma.documentoMedicion.create({
      data: {
        planMedicionId: p.id,
        tipo: 'PLAN_MEDICION_PDF',
        solicitadoPor: ACTOR_ID,
      },
    });

    await repo.eliminar(p.id);

    expect(await prisma.documentoMedicion.count({ where: { planMedicionId: p.id } })).toBe(0);
  });
});
```

- [ ] **Step 4: Ejecutar**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npx prisma migrate deploy
npm run test:integration -- test/integration/plan-medicion.int.spec.ts
```

Expected: PASS, 33 pruebas.

- [ ] **Step 5: Comprobar que el esquema y las migraciones no divergen**

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: sin diferencias. Es el mismo paso que corre el CI.

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/prisma/ apps/api/test/
git commit -m "El plan de medición tiene su propia tabla de documentos"
```

---

### Task 3: Qué dice el documento

**Files:**
- Create: `apps/api/src/modules/mejora-continua/domain/documentos/armar-documento-medicion.ts`
- Test: `apps/api/src/modules/mejora-continua/domain/documentos/armar-documento-medicion.spec.ts`

**Interfaces:**
- Consumes: `Documento`, `Tabla` y `Columna` de `platform/documentos/documento.js` (Task 1).
- Produces:
  - `DatosParaDocumentoMedicion` — lo que el armador necesita.
  - `armarDocumentoMedicion(datos: DatosParaDocumentoMedicion, formato: 'pdf' | 'excel'): Documento`

  La Task 5 lo consume.

- [ ] **Step 1: Escribir las pruebas en rojo**

`armar-documento-medicion.spec.ts`:

```ts
/**
 * Qué dice el documento de un plan de medición.
 *
 * Es dominio puro y se prueba sin abrir un PDF: lo que decide este archivo es
 * el CONTENIDO —qué se cuenta, cómo se agrupa, qué se declara cuando falta
 * algo— y eso es material de acreditación. El dibujo lo hacen los
 * renderizadores de `platform/`, que no saben de qué hablan.
 */

import { describe, expect, it } from 'vitest';

import {
  armarDocumentoMedicion,
  type DatosParaDocumentoMedicion,
} from './armar-documento-medicion.js';

function datos(sobre: Partial<DatosParaDocumentoMedicion> = {}): DatosParaDocumentoMedicion {
  return {
    codigo: 'PM-PE-ISI-2026-v2-D-v1',
    tipo: 'DIRECTA',
    metaPorcentaje: 70,
    estado: 'Vigente',
    planEstudiosCodigo: 'PE-ISI-2026-v2',
    carreraNombre: 'Ingeniería de Sistemas e Informática',
    aprobadoPor: 'Ana Quispe',
    aprobadoEn: new Date('2026-08-01'),
    generadoEn: new Date('2026-09-04'),
    grupos: [
      {
        atributo: 'AG-I08 — Análisis de Problema',
        competencias: [{ codigo: 'CPE-01', nombre: 'Resolver problemas' }],
      },
    ],
    periodos: [
      { etiqueta: '2026-I', fechaCierre: new Date('2026-07-15') },
      { etiqueta: '2026-II', fechaCierre: null },
    ],
    celdas: [{ competenciaCodigo: 'CPE-01', periodoEtiqueta: '2026-I', realizada: true }],
    ...sobre,
  };
}

describe('la cabecera', () => {
  it('identifica el plan, su base y su meta', () => {
    const d = armarDocumentoMedicion(datos(), 'pdf');
    const texto = JSON.stringify(d);

    expect(texto).toContain('PM-PE-ISI-2026-v2-D-v1');
    expect(texto).toContain('PE-ISI-2026-v2');
    expect(texto).toContain('70');
  });

  it('dice quién aprobó y cuándo, si está aprobado (RF-PM-039)', () => {
    const texto = JSON.stringify(armarDocumentoMedicion(datos(), 'pdf'));

    expect(texto).toContain('Ana Quispe');
  });

  it('un plan sin aprobar no inventa un aprobador', () => {
    const texto = JSON.stringify(
      armarDocumentoMedicion(datos({ aprobadoPor: null, aprobadoEn: null }), 'pdf'),
    );

    expect(texto).not.toContain('Ana Quispe');
    expect(texto).not.toContain('null');
  });
});

describe('RF-PM-029 — la matriz en PDF va por competencia', () => {
  it('una fila por competencia, listando sus periodos', () => {
    // Quince columnas no caben en una página vertical, y el renderizador de PDF
    // ya avisa de ese límite en su propio código.
    const d = armarDocumentoMedicion(datos(), 'pdf');
    const tablas = JSON.stringify(d);

    expect(tablas).toContain('CPE-01');
    expect(tablas).toContain('2026-I');
  });

  it('una competencia sin programar lo dice, en vez de salir vacía', () => {
    const d = armarDocumentoMedicion(datos({ celdas: [] }), 'pdf');

    expect(JSON.stringify(d)).toMatch(/sin programar/i);
  });
});

describe('RF-PM-028 — la matriz en Excel va como cuadrícula', () => {
  it('una columna por periodo', () => {
    // `Seccion` es `{ titulo, parrafos?, tabla? }`: no hay más estructura que
    // esa, y la matriz se reconoce por tener más columnas que las tablas de
    // competencias y periodos, que tienen dos y tres.
    const d = armarDocumentoMedicion(datos(), 'excel');
    const matriz = d.secciones.find((s) => (s.tabla?.columnas.length ?? 0) > 2);

    expect(matriz).toBeDefined();
    // Una columna de competencia más una por cada uno de los dos periodos.
    expect(matriz?.tabla?.columnas).toHaveLength(3);
  });

  it('distingue programada de ya medida', () => {
    const d = armarDocumentoMedicion(datos(), 'excel');
    const texto = JSON.stringify(d);

    // La celda medida y la solo programada no pueden verse igual: una es
    // evidencia de que la medición ocurrió y la otra una intención.
    expect(texto).toMatch(/realizada|medida/i);
  });
});

describe('lo que los dos formatos comparten', () => {
  it('las competencias van agrupadas por atributo del graduado', () => {
    for (const formato of ['pdf', 'excel'] as const) {
      expect(JSON.stringify(armarDocumentoMedicion(datos(), formato))).toContain('AG-I08');
    }
  });

  it('los periodos llevan su fecha de cierre, y su ausencia se dice', () => {
    for (const formato of ['pdf', 'excel'] as const) {
      const texto = JSON.stringify(armarDocumentoMedicion(datos(), formato));
      expect(texto).toContain('2026-II');
    }
  });

  it('un plan vacío se exporta igual y lo declara', () => {
    // Un documento que dice «este plan no tiene competencias» es información;
    // uno que falla al generarse, no.
    const d = armarDocumentoMedicion(datos({ grupos: [], periodos: [], celdas: [] }), 'pdf');

    expect(JSON.stringify(d)).toMatch(/no tiene competencias|sin competencias/i);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/domain/documentos/
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Leer el modelo de documento antes de escribir**

```bash
cat src/platform/documentos/documento.ts
cat src/modules/plan-estudios/domain/documentos/armar-documentos.ts | head -60
```

El armador de Plan de Estudios es el ejemplo a seguir, y la misma forma de declarar una tabla vacía. **No se copia su contenido**, que es de otro módulo.

La forma del modelo, para no adivinarla:

```ts
Documento  = { nombreArchivo, titulo, subtitulo, metadatos: Metadato[], secciones: Seccion[], pie }
Seccion    = { titulo, parrafos?: string[], tabla?: Tabla }
Metadato   = { etiqueta, valor }
Tabla      = { columnas: Columna[], filas: string[][], … }
Columna    = { titulo, peso, alineacion? }
```

No hay más estructura que esa: ni bloques, ni anidamiento. Una sección tiene
párrafos, una tabla, o ambos.

- [ ] **Step 4: Escribir el armador**

Puntos que las pruebas fijan:

- `armarDocumentoMedicion(datos, formato)` devuelve un `Documento` del modelo neutro.
- La cabecera va en `metadatos`, que es la lista de pares `{ etiqueta, valor }` que el modelo ya tiene para eso: código, plan de estudios base, carrera, tipo, meta y estado. Si `aprobadoPor` es `null`, **ese metadato no se añade**: no se escribe «Aprobado por: null».
- Las competencias van en una tabla agrupadas por atributo, con el atributo como fila de grupo o como primera columna.
- Los periodos van en su tabla, con la fecha de cierre o «sin fecha» cuando falta.
- **La matriz depende del formato.** En `'pdf'`, una fila por competencia y una columna con los periodos en que se mide, separados por coma; las que no tienen ninguno dicen «Sin programar». En `'excel'`, una columna por periodo y en cada celda «Realizada», «Programada» o vacío.
- El pie lleva `generadoEn`, como el resto de documentos del sistema.

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/src/modules/mejora-continua/domain/
git commit -m "Qué dice el documento de un plan de medición"
```

Expected: PASS, 10 pruebas nuevas.

---

### Task 4: El puerto y el repositorio

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/ports/documentos-medicion.port.ts`
- Create: `apps/api/src/modules/mejora-continua/infrastructure/persistence/documentos-medicion.repository.ts`
- Test: `apps/api/test/integration/documentos-medicion.int.spec.ts`

**Interfaces:**
- Consumes: `DatosParaDocumentoMedicion` (Task 3); el modelo `DocumentoMedicion` (Task 2).
- Produces:

```ts
export const TIPOS_DOCUMENTO_MEDICION = ['PLAN_MEDICION_PDF', 'PLAN_MEDICION_EXCEL'] as const;
export type TipoDocumentoMedicion = (typeof TIPOS_DOCUMENTO_MEDICION)[number];

export const ESTADOS_TRABAJO = ['En cola', 'Generando', 'Listo', 'Fallido'] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

export interface TrabajoDocumentoMedicion {
  readonly id: string;
  readonly planMedicionId: string;
  readonly tipo: TipoDocumentoMedicion;
  readonly estado: EstadoTrabajo;
  readonly nombreArchivo: string | null;
  readonly tipoMime: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoPor: string;
  readonly solicitadoEn: Date;
  readonly terminadoEn: Date | null;
}

export interface RepositorioDocumentosMedicionPort {
  crear(datos: {
    planMedicionId: string;
    tipo: TipoDocumentoMedicion;
    solicitadoPor: string;
  }): Promise<TrabajoDocumentoMedicion>;
  porId(id: string): Promise<TrabajoDocumentoMedicion | null>;
  listarDePlan(planMedicionId: string, limite: number): Promise<TrabajoDocumentoMedicion[]>;
  marcarGenerando(id: string): Promise<void>;
  marcarListo(
    id: string,
    datos: { nombreArchivo: string; tipoMime: string; bytes: number; ubicacion: string },
  ): Promise<void>;
  marcarFallido(id: string, error: string): Promise<void>;
  ubicacionDe(id: string): Promise<string | null>;
}

/** Los datos del plan que necesita el documento, en una sola consulta. */
export interface RepositorioDatosDocumentoMedicionPort {
  datosDe(planMedicionId: string): Promise<Omit<DatosParaDocumentoMedicion, 'generadoEn'> | null>;
}

export const REPOSITORIO_DOCUMENTOS_MEDICION = Symbol('RepositorioDocumentosMedicionPort');
export const DATOS_DOCUMENTO_MEDICION = Symbol('RepositorioDatosDocumentoMedicionPort');
```

  La Task 5 los consume. Los nombres repiten los de Plan de Estudios a propósito: son el mismo concepto y leerlos igual ahorra tener que traducir mentalmente.

- [ ] **Step 1: Escribir las pruebas de integración en rojo**

`apps/api/test/integration/documentos-medicion.int.spec.ts`. Se copia la preparación de `plan-medicion.int.spec.ts` —el `beforeEach` con los TRUNCATE, la facultad, la carrera y el plan de estudios— añadiendo `mejora_continua.documentos_medicion` a la lista de tablas que se vacían:

```ts
describe('RF-PM-027 — el ciclo de vida del trabajo', () => {
  it('nace en cola y llega a listo con sus datos', async () => {
    const plan = await crearPlanMedicion();

    const t = await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    expect(t.estado).toBe('En cola');

    await repo.marcarGenerando(t.id);
    expect((await repo.porId(t.id))?.estado).toBe('Generando');

    await repo.marcarListo(t.id, {
      nombreArchivo: 'plan.pdf',
      tipoMime: 'application/pdf',
      bytes: 4096,
      ubicacion: '/var/documentos/abc.pdf',
    });

    const listo = await repo.porId(t.id);
    expect(listo?.estado).toBe('Listo');
    expect(listo?.bytes).toBe(4096);
    expect(listo?.terminadoEn).not.toBeNull();
  });

  it('un fallo se guarda como estado, no se pierde', async () => {
    // El trabajo corre en otro proceso: cuando falla no hay ninguna petición
    // HTTP viva a la que devolverle un error, y sin esto la pantalla esperaría
    // para siempre un archivo que no va a llegar.
    const plan = await crearPlanMedicion();
    const t = await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_EXCEL',
      solicitadoPor: ACTOR_ID,
    });

    await repo.marcarFallido(t.id, 'El plan no tiene competencias.');

    const fallido = await repo.porId(t.id);
    expect(fallido?.estado).toBe('Fallido');
    expect(fallido?.error).toBe('El plan no tiene competencias.');
  });

  it('el listado va del más reciente al más antiguo', async () => {
    const plan = await crearPlanMedicion();
    await repo.crear({ planMedicionId: plan.id, tipo: 'PLAN_MEDICION_PDF', solicitadoPor: ACTOR_ID });
    await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_EXCEL',
      solicitadoPor: ACTOR_ID,
    });

    const lista = await repo.listarDePlan(plan.id, 10);

    expect(lista).toHaveLength(2);
    expect(lista[0]!.tipo).toBe('PLAN_MEDICION_EXCEL');
  });

  it('la ubicación no sale en el trabajo, solo por su método', async () => {
    // El trabajo viaja hasta el navegador; la ubicación es interna y decirla
    // filtraría la estructura del almacenamiento.
    const plan = await crearPlanMedicion();
    const t = await repo.crear({
      planMedicionId: plan.id,
      tipo: 'PLAN_MEDICION_PDF',
      solicitadoPor: ACTOR_ID,
    });
    await repo.marcarListo(t.id, {
      nombreArchivo: 'p.pdf',
      tipoMime: 'application/pdf',
      bytes: 10,
      ubicacion: '/secreto/p.pdf',
    });

    expect(JSON.stringify(await repo.porId(t.id))).not.toContain('/secreto/');
    expect(await repo.ubicacionDe(t.id)).toBe('/secreto/p.pdf');
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/documentos-medicion.int.spec.ts
```

Expected: FAIL — no existe el repositorio.

- [ ] **Step 3: Escribir el puerto**

El bloque **Interfaces** de esta tarea, tal cual, en `application/ports/documentos-medicion.port.ts`.

- [ ] **Step 4: Escribir el repositorio**

`infrastructure/persistence/documentos-medicion.repository.ts`, siguiendo `documentos.repository.ts` de Plan de Estudios: traductor de estado entre el enum de la base y el vocabulario del dominio, `SELECCION` que **no incluye `ubicacion`**, y `ubicacionDe` como consulta aparte.

`RepositorioDatosDocumentoMedicionPort` se implementa en el mismo archivo o en uno hermano: junta el plan, sus competencias con sus atributos —por `ContenidoCurricularPort`, no consultando las tablas de Plan de Estudios—, sus periodos y su matriz.

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/src/ apps/api/test/
git commit -m "El repositorio de documentos del plan de medición"
```

---

### Task 5: El generador y la cola compartida

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/use-cases/generar-documento-medicion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/application/use-cases/generar-documento-medicion.spec.ts`
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/queue/documentos.cola.ts` (el trabajo declara su módulo)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/queue/documentos.worker.ts` (enruta)
- Modify: `apps/api/src/worker.module.ts` y `src/app.module.ts`

**Interfaces:**
- Consumes: el puerto de la Task 4; `armarDocumentoMedicion` (Task 3); `RenderizadorPdfPort`, `RenderizadorHojaPort` y `AlmacenDeArchivosPort` de `platform/documentos/puertos.js` (Task 1).
- Produces: `GenerarDocumentoMedicion` con `encolar(actor, planMedicionId, tipo)` y `ejecutar(trabajoId)`. La Task 6 expone el primero por HTTP; el worker llama al segundo.

**El cambio en la cola es el único punto donde este ciclo toca Plan de Estudios.** El trabajo pasa de `{ trabajoId }` a `{ trabajoId, modulo: 'plan-estudios' | 'mejora-continua' }`, y el worker enruta.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
describe('RF-PM-027 — encolar', () => {
  it('crea el trabajo en cola y lo manda a la cola, en ese orden', async () => {
    // Al revés, el worker podría tomar el trabajo antes de que exista su fila y
    // fallar buscando un identificador que aún no está en la base.
    const orden: string[] = [];
    const { caso } = montar({
      repo: {
        crear: async () => {
          orden.push('base');
          return trabajo();
        },
      },
      cola: {
        encolar: async () => {
          orden.push('cola');
        },
      },
    });

    await caso.encolar(ACTOR, 'pm-1', 'PLAN_MEDICION_PDF');

    expect(orden).toEqual(['base', 'cola']);
  });

  it('exige `medicion.leer`: exportar es leer', async () => {
    const { caso } = montar({ autorizacion: denegar() });

    await expect(caso.encolar(ACTOR, 'pm-1', 'PLAN_MEDICION_PDF')).rejects.toThrow(AccesoDenegado);
  });
});

describe('RF-PM-027 — generar', () => {
  it('el PDF usa el renderizador de PDF y el Excel el de hoja', async () => {
    const usados: string[] = [];
    const { caso } = montar({
      repo: { porId: async () => trabajo({ tipo: 'PLAN_MEDICION_EXCEL' }) },
      renderizadores: {
        pdf: async () => {
          usados.push('pdf');
          return Buffer.from('x');
        },
        hoja: async () => {
          usados.push('hoja');
          return Buffer.from('x');
        },
      },
    });

    await caso.ejecutar('t-1');

    expect(usados).toEqual(['hoja']);
  });

  it('guarda el archivo y marca listo con sus bytes', async () => {
    const marcados: { bytes: number }[] = [];
    const { caso } = montar({
      repo: { marcarListo: async (_id, d) => void marcados.push(d) },
    });

    await caso.ejecutar('t-1');

    expect(marcados[0]?.bytes).toBeGreaterThan(0);
  });

  it('un fallo se guarda como estado y NO se relanza', async () => {
    // Relanzar haría que BullMQ reintentara tres veces algo que va a fallar
    // igual —un plan sin datos no se arregla solo— y dejaría la pantalla
    // esperando durante los tres intentos.
    const fallos: string[] = [];
    const { caso } = montar({
      datos: { datosDe: async () => null },
      repo: { marcarFallido: async (_id, e) => void fallos.push(e) },
    });

    await expect(caso.ejecutar('t-1')).resolves.toBeUndefined();
    expect(fallos).toHaveLength(1);
  });

  it('un trabajo que no existe no revienta el worker', async () => {
    const { caso } = montar({ repo: { porId: async () => null } });

    await expect(caso.ejecutar('t-desconocido')).resolves.toBeUndefined();
  });
});
```

`montar` sigue el patrón de los otros specs del módulo: dobles del repositorio, del almacén, de los dos renderizadores y de la autorización.

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/application/use-cases/generar-documento-medicion.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el caso de uso**

Puntos que las pruebas fijan:

- `encolar` comprueba `medicion.leer`, crea la fila **y después** encola.
- `ejecutar` no lanza nunca: marca generando, arma el documento, renderiza según el tipo, guarda en el almacén y marca listo. Cualquier fallo se captura y se guarda con `marcarFallido`, con un texto redactado para una persona.
- Un trabajo inexistente sale sin hacer nada.
- El nombre del archivo lleva el código del plan y la extensión: `PM-PE-ISI-2026-v2-D-v1.pdf`.

- [ ] **Step 4: Hacer que el trabajo declare su módulo**

En `documentos.cola.ts`:

```ts
/**
 * El trabajo lleva el identificador y de qué módulo sale.
 *
 * El módulo hace falta desde que hay dos que generan documentos: los
 * identificadores viven en tablas distintas y uno de `mejora-continua` no
 * existe en la de `plan-estudios`. Sin este campo, el worker buscaría en la
 * tabla equivocada y marcaría como inexistente un trabajo que sí está.
 */
export interface TrabajoEnCola {
  readonly trabajoId: string;
  readonly modulo: 'plan-estudios' | 'mejora-continua';
}
```

Y en `documentos.worker.ts`, el worker recibe los dos casos de uso y enruta:

```ts
  constructor(
    private readonly generar: GenerarDocumento,
    private readonly generarMedicion: GenerarDocumentoMedicion,
  ) {}
```

```ts
        if (job.data.modulo === 'mejora-continua') {
          await this.generarMedicion.ejecutar(job.data.trabajoId);
        } else {
          await this.generar.ejecutar(job.data.trabajoId);
        }
```

`ColaDeDocumentosPort.encolar` pasa a recibir los dos datos. Actualizar la llamada de Plan de Estudios para que pase `'plan-estudios'`.

**Los trabajos que ya estén en Redis sin `modulo`** caen en el `else`, que es Plan de Estudios: el comportamiento de antes. No hace falta migrar nada.

- [ ] **Step 5: Registrar en los módulos**

En `app.module.ts` y `worker.module.ts`, dar de alta `GenerarDocumentoMedicion` con su factoría, siguiendo el patrón de `GenerarDocumento`. El worker necesita **los dos**.

- [ ] **Step 6: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npm test
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/src/
git commit -m "El plan de medición se genera en la misma cola, con el worker enrutando"
```

---

### Task 6: Los endpoints

**Files:**
- Create: `apps/api/src/modules/mejora-continua/infrastructure/http/documentos-medicion.controller.ts`
- Create: `apps/api/src/modules/mejora-continua/infrastructure/http/dto/documentos-medicion.dto.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `GenerarDocumentoMedicion` (Task 5); el puerto (Task 4).
- Produces: los cuatro endpoints. La Task 7 los consume.

- [ ] **Step 1: Escribir el DTO**

```ts
import { IsIn } from 'class-validator';

import { TIPOS_DOCUMENTO_MEDICION } from '../../../application/ports/documentos-medicion.port.js';

export class GenerarDocumentoMedicionDto {
  @IsIn(TIPOS_DOCUMENTO_MEDICION, {
    message: `El tipo debe ser uno de: ${TIPOS_DOCUMENTO_MEDICION.join(', ')}.`,
  })
  tipo!: (typeof TIPOS_DOCUMENTO_MEDICION)[number];
}
```

- [ ] **Step 2: Escribir el controlador**

Siguiendo `documentos.controller.ts` de Plan de Estudios, con `@ApiOperation` y `@ApiResponse` en cada método:

```
POST /planes-medicion/:id/documentos    202, devuelve el trabajo
GET  /planes-medicion/:id/documentos    del más reciente al más antiguo
GET  /documentos-medicion/:id           estado
GET  /documentos-medicion/:id/archivo   StreamableFile
```

La descarga usa `StreamableFile` y no `@Res()`, por lo mismo que el controlador existente ya explica en su comentario. Un trabajo que no esté `Listo` devuelve 409 con su motivo si falló, no un archivo vacío.

- [ ] **Step 3: Comprobar contra la API levantada**

Este paso encuentra lo que el typecheck no ve: el cableado de inyección y la forma real de la respuesta. En el ciclo anterior destapó que el tipo del puerto no exponía tres columnas.

```bash
cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start &
npm run start:worker &
```

Con un token de un usuario con `medicion.leer`:

```bash
curl -s -X POST localhost:3000/api/v1/planes-medicion/<id>/documentos \
  -H "authorization: Bearer <token>" -H "content-type: application/json" \
  -d '{"tipo":"PLAN_MEDICION_PDF"}'
curl -s localhost:3000/api/v1/planes-medicion/<id>/documentos -H "authorization: Bearer <token>"
```

Expected: el primero devuelve 202 con estado «En cola»; segundos después, el listado lo muestra en «Listo» con bytes. Si se queda en «En cola», el worker no está corriendo o no enruta.

- [ ] **Step 4: Verificar y commitear**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/api/src/
git commit -m "Exportar el plan de medición por HTTP"
```

---

### Task 7: La pantalla

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/DocumentosDelPlan.tsx`
- Test: `apps/web/src/features/mejora-continua/components/DocumentosDelPlan.test.tsx`
- Modify: `apps/web/src/features/mejora-continua/api/medicion.api.ts`, `api/queries.ts`, `domain/tipos.ts`, `pages/PlanMedicionPage.tsx`

**Interfaces:**
- Consumes: los endpoints de la Task 6.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Ampliar tipos y capa de datos**

En `domain/tipos.ts`:

```ts
export type TipoDocumentoMedicion = 'PLAN_MEDICION_PDF' | 'PLAN_MEDICION_EXCEL';
export type EstadoTrabajo = 'En cola' | 'Generando' | 'Listo' | 'Fallido';

export interface TrabajoDocumento {
  readonly id: string;
  readonly tipo: TipoDocumentoMedicion;
  readonly estado: EstadoTrabajo;
  readonly nombreArchivo: string | null;
  readonly bytes: number | null;
  readonly error: string | null;
  readonly solicitadoEn: string;
}
```

En `medicion.api.ts`:

```ts
export async function generarDocumento(
  id: string,
  tipo: TipoDocumentoMedicion,
): Promise<TrabajoDocumento> {
  return cliente.post<TrabajoDocumento>(`/planes-medicion/${id}/documentos`, { tipo });
}

export async function documentosDe(id: string): Promise<TrabajoDocumento[]> {
  return cliente.get<TrabajoDocumento[]>(`/planes-medicion/${id}/documentos`);
}
```

En `queries.ts`, `useDocumentos(id)` y `useGenerarDocumento(id)`. La consulta se refresca sola mientras haya trabajos sin terminar:

```ts
export function useDocumentos(id: string) {
  return useQuery({
    queryKey: claves.documentos(id),
    queryFn: () => api.documentosDe(id),
    enabled: !!id,
    // Mientras algo esté generándose, se vuelve a preguntar. Sin esto la
    // pantalla se queda en «En cola» hasta que alguien recargue, y parece que
    // no funciona cuando en realidad ya terminó.
    refetchInterval: (consulta) =>
      (consulta.state.data ?? []).some((t) => t.estado === 'En cola' || t.estado === 'Generando')
        ? 2_000
        : false,
  });
}
```

- [ ] **Step 2: Escribir la prueba del componente en rojo**

`DocumentosDelPlan.test.tsx`:

```tsx
/** @vitest-environment jsdom */

/**
 * RF-PM-028 y RF-PM-029 en pantalla.
 *
 * Lo que se vigila es que los tres estados de un trabajo se distingan: uno en
 * curso, uno descargable y uno fallido con su motivo. Un fallo que se viera
 * igual que un éxito dejaría a alguien esperando un archivo que no va a llegar.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TrabajoDocumento } from '../domain/tipos';
import { DocumentosDelPlan } from './DocumentosDelPlan';

function trabajo(sobre: Partial<TrabajoDocumento> = {}): TrabajoDocumento {
  return {
    id: 't-1',
    tipo: 'PLAN_MEDICION_PDF',
    estado: 'Listo',
    nombreArchivo: 'PM-X-D-v1.pdf',
    bytes: 4096,
    error: null,
    solicitadoEn: '2026-09-04T10:00:00.000Z',
    ...sobre,
  };
}

function montar(trabajos: TrabajoDocumento[]) {
  render(<DocumentosDelPlan trabajos={trabajos} generando={false} onGenerar={vi.fn()} />);
}

describe('los estados de un trabajo', () => {
  it('uno listo se puede descargar', () => {
    montar([trabajo()]);

    expect(screen.getByRole('link', { name: /descargar/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/documentos-medicion/t-1/archivo'),
    );
  });

  it('uno en curso lo dice y no ofrece descarga', () => {
    montar([trabajo({ estado: 'Generando', nombreArchivo: null, bytes: null })]);

    expect(screen.getByText(/generando/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /descargar/i })).not.toBeInTheDocument();
  });

  it('uno fallido enseña su motivo', () => {
    // Sin el motivo, quien lo vea solo sabe que no funcionó, y volverá a
    // pulsar el botón esperando otro resultado.
    montar([trabajo({ estado: 'Fallido', error: 'El plan no tiene competencias.' })]);

    expect(screen.getByText('El plan no tiene competencias.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /descargar/i })).not.toBeInTheDocument();
  });
});

describe('generar', () => {
  it('ofrece los dos formatos', () => {
    montar([]);

    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument();
  });

  it('sin documentos lo dice, en vez de dejar la zona en blanco', () => {
    montar([]);

    expect(screen.getByText(/todavía no se ha generado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/components/DocumentosDelPlan.test.tsx
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 4: Escribir el componente**

Dos botones —«Generar PDF» y «Generar Excel»— y una lista de trabajos. Cada uno con su tipo, su estado en un `Badge`, la fecha, y según el estado: enlace de descarga si está listo, el motivo si falló, nada más si está en curso. Con la lista vacía, un `EstadoVacio` que diga «Todavía no se ha generado ningún documento».

El enlace de descarga apunta a `/api/v1/documentos-medicion/:id/archivo`.

- [ ] **Step 5: Conectarlo en la página**

Una `Tarjeta` nueva en `PlanMedicionPage.tsx`, titulada «Documentos», entre la matriz y las versiones.

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
cd /d/App-ICACIT
git add apps/web/src/
git commit -m "Exportar el plan de medición desde la pantalla"
```

---

### Task 8: E2E y cierre

**Files:**
- Create: `tests/e2e/specs/exportacion.spec.ts`
- Modify: `README.md` (la sección de estado)

**Interfaces:**
- Consumes: todo lo anterior; el fixture `test` de `tests/e2e/fixtures/sesion.ts`.
- Produces: nada.

**El worker tiene que estar corriendo** para que este recorrido pase. Si no lo está, el trabajo se queda en «En cola» y la prueba lo dirá con ese mensaje.

- [ ] **Step 1: Escribir el recorrido**

```ts
/**
 * RF-PM-027 a RF-PM-029 contra la aplicación entera.
 *
 * Lo que solo se ve aquí es la cadena completa: encolar por HTTP, que el worker
 * —otro proceso— lo tome, genere el archivo y lo guarde, y que la pantalla se
 * entere sola sin que nadie recargue.
 */

import { expect, test } from '../fixtures/sesion';

test('generar un PDF del plan y verlo listo', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  await page.getByRole('link', { name: /^PM-/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await page.getByRole('button', { name: /Generar PDF/ }).click();

  // La lista se refresca sola mientras haya trabajos sin terminar; si esto se
  // queda esperando, o el worker no corre o el refresco automático se rompió.
  await expect(page.getByRole('link', { name: /descargar/i }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test('sin documentos, la tarjeta lo dice', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  await page.getByRole('link', { name: /^PM-/ }).last().click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar con el worker levantado**

```bash
cd apps/api && npm run e2e:preparar && npm run build
THROTTLE_LIMIT=10000 npm start &
npm run start:worker &
cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test
```

Expected: PASS, 21 pruebas. Si un selector no encuentra su elemento, **corregir el selector**, no la interfaz.

- [ ] **Step 3: Añadir el worker al job de CI**

El job `e2e` de `.github/workflows/ci.yml` arranca la API pero no el worker. Sin él, el recorrido nuevo se queda esperando. Después del paso «Arrancar la API»:

```yaml
      - name: Arrancar el worker de documentos
        working-directory: apps/api
        run: npm run start:worker > /tmp/worker.log 2>&1 &
```

- [ ] **Step 4: Actualizar el estado del README**

En la sección «Estado», añadir la exportación del plan de medición a lo que funciona hoy, y dejar dicho que el submódulo de Planes de Medición queda completo: 47 de 47.

- [ ] **Step 5: Verificar todo y commitear**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
cd ../web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
cd ../../tests/e2e && npm run typecheck && npm run format:check
cd /d/App-ICACIT
git add tests/e2e/ .github/ README.md
git commit -m "La exportación, de punta a punta"
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §3.1 la maquinaria sube a `platform/` | Task 1 |
| §3.2 el refactor va primero, solo y verificado | Task 1, Steps 4 y 5 |
| §3.3 tabla propia | Task 2 |
| §3.4 cola compartida, worker enruta | Task 5, Step 4 |
| §3.5 la matriz por formato | Task 3, Step 4 |
| §4 RF-PM-027 | Tasks 3, 4, 5 |
| §4 RF-PM-028 (Excel) | Tasks 3, 5 |
| §4 RF-PM-029 (PDF) | Tasks 3, 5 |
| §4 contenido del documento | Task 3, Step 1 |
| §6 endpoints | Task 6 |
| §7 errores | Task 3 (plan vacío), Task 5 (fallo como estado), Task 6 (descarga de un fallido) |
| §8 pruebas | Tasks 2–8 |
| §9 puntos anotados | Ya en la spec; no requieren código |
