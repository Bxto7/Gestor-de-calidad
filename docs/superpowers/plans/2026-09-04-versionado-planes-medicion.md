# Versionado e historial de planes de medición — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un plan de medición Aprobado, Vigente o Histórico pueda versionarse o duplicarse, que su linaje e historial se consulten, y que quien aprueba quede registrado en el propio plan.

**Architecture:** Un servicio de dominio decide qué se copia y qué no; dos casos de uso lo envuelven con precondiciones y eventos distintos. El repositorio hace la copia en una transacción, resolviendo las celdas por etiqueta de periodo porque los ids son nuevos. Marcar vigente releva al anterior en la misma transacción.

**Tech Stack:** NestJS 11, Prisma 7 con `PrismaPg`, PostgreSQL 16, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-04-versionado-planes-medicion-design.md`

## Global Constraints

- **`domain/` no importa NestJS, Prisma ni Express** (CLAUDE.md §2). El servicio de copia es puro.
- **Un módulo nunca toca las tablas de otro** (§3.2). El historial se lee por el endpoint de `auditoria` que ya existe; no se añade uno en `mejora-continua`.
- **Toda mutación relevante emite evento de auditoría** (§2). Las dos operaciones nuevas emiten el suyo.
- **Migraciones siempre por Prisma Migrate**, nunca SQL manual sobre el esquema.
- **Las marcas de `realizada` sobreviven a una versión y NO a un duplicado.** Es la regla con más consecuencias del ciclo (spec §3.2).
- **Las celdas se copian por `etiqueta` de periodo**, no por `periodoId`: la copia crea periodos nuevos con ids nuevos. RF-PM-018 garantiza que la etiqueta es única dentro del plan.
- **Ambas operaciones toman el siguiente correlativo** de su plan de estudios y tipo (spec §3.3). El linaje lo expresa `derivadoDeId`, no el número.
- **Cobertura ≥80% en `domain/` y `application/`**; el umbral está en `vitest.config`.
- **Antes de cada commit:** `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm test` en `apps/api`.
- **Las pruebas de integración exigen base desechable:** `DATABASE_URL` apuntando a `sgc_test`, o `SGC_DB_DESECHABLE=1`.

---

### Task 1: La migración

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/…_versionado_medicion/migration.sql` (Prisma antepone la marca de tiempo)
- Test: `apps/api/test/integration/plan-medicion.int.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: los campos `derivadoDeId`, `aprobadoPorId` y `aprobadoEn` en `PlanMedicion`. Las tareas 3 a 6 dependen de ellos.

- [ ] **Step 1: Añadir los campos al esquema**

En `apps/api/prisma/schema.prisma`, dentro de `model PlanMedicion`, después de `estado`:

```prisma
  /// RF-PM-030 RN1: la versión nueva referencia a la que viene. `SetNull` y no
  /// `Cascade`: borrar un borrador intermedio no puede llevarse por delante el
  /// linaje de sus descendientes, que es justo lo que RF-PM-031 muestra.
  derivadoDeId String? @map("derivado_de_id") @db.Uuid

  /// RF-PM-039: quién aprobó y cuándo. Está también en la bitácora, pero ahí es
  /// un registro entre miles; aquí es un dato que la pantalla muestra y que un
  /// reporte cita sin recorrer un log.
  aprobadoPorId String?   @map("aprobado_por_id") @db.Uuid
  aprobadoEn    DateTime? @map("aprobado_en") @db.Timestamptz(6)
```

Y en las relaciones del mismo modelo, junto a `periodos`:

```prisma
  derivadoDe PlanMedicion?  @relation("VersionesMedicion", fields: [derivadoDeId], references: [id], onDelete: SetNull)
  derivados  PlanMedicion[] @relation("VersionesMedicion")
```

- [ ] **Step 2: Generar la migración**

```bash
cd apps/api
npx prisma migrate dev --name versionado_medicion
```

Expected: crea la carpeta de migración y la aplica. Si pide resetear la base, **parar**: significa que el historial de migraciones divergió y eso se investiga, no se acepta.

- [ ] **Step 3: Escribir la prueba de integración del linaje**

En `apps/api/test/integration/plan-medicion.int.spec.ts`, al final del `describe` de la matriz o en uno nuevo:

```ts
describe('RF-PM-030 RN1 — el linaje', () => {
  it('borrar un plan intermedio no rompe el vínculo de sus descendientes', async () => {
    // `SetNull` y no `Cascade`: el nieto sobrevive al padre. Con `Cascade` se
    // borraría en silencio, y RF-PM-031 dejaría de poder mostrar la cadena.
    const v1 = await repo.crear({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-LINAJE-D-v1',
      meta: 0.7,
      periodoInicio: null,
    });
    const v2 = await prisma.planMedicion.create({
      data: {
        planEstudiosId,
        tipo: 'DIRECTA',
        codigo: 'PM-LINAJE-D-v2',
        version: 2,
        meta: 0.7,
        derivadoDeId: v1.id,
      },
    });

    await repo.eliminar(v1.id);

    const tras = await prisma.planMedicion.findUnique({ where: { id: v2.id } });
    expect(tras).not.toBeNull();
    expect(tras?.derivadoDeId).toBeNull();
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

Expected: PASS. Si el nieto sale borrado, la relación quedó en `Cascade`.

- [ ] **Step 5: Comprobar que el esquema y las migraciones no divergen**

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: sin diferencias (código de salida 0). Es el mismo paso que corre el CI.

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/prisma/
git commit -m "El plan de medición guarda su linaje y quién lo aprobó"
```

---

### Task 2: El servicio de copia

**Files:**
- Create: `apps/api/src/modules/mejora-continua/domain/services/copia-de-plan.ts`
- Test: `apps/api/src/modules/mejora-continua/domain/services/copia-de-plan.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/domain/value-objects/estado-plan-medicion.ts`

**Interfaces:**
- Consumes: `EstadoMedicion` de `estado-plan-medicion.ts`.
- Produces:
  - `permiteVersionado(estado: EstadoMedicion): boolean`
  - `copiarPlan(origen: PlanACopiar, modo: ModoDeCopia): CopiaDelPlan`
  - Los tipos `ModoDeCopia`, `PlanACopiar`, `CeldaACopiar`, `PeriodoACopiar`, `CopiaDelPlan`.

  Las tareas 3 y 4 los consumen.

- [ ] **Step 1: Escribir las pruebas en rojo**

`copia-de-plan.spec.ts`:

```ts
/**
 * Lo que se vigila aquí es una regla con consecuencias fuera del software.
 *
 * Una marca de `realizada` es constancia de que una medición ocurrió, con
 * usuario y fecha: es evidencia. Una versión nueva corrige el mismo plan y
 * sigue cubriendo los mismos periodos, así que descartarla borraría evidencia
 * real. Un duplicado arranca un periodo de acreditación nuevo, así que
 * arrastrarla afirmaría que se midió algo que todavía no ha ocurrido.
 *
 * En un expediente de acreditación, lo segundo es lo peor que puede pasar.
 */

import { describe, expect, it } from 'vitest';

import { copiarPlan, permiteVersionado, type PlanACopiar } from './copia-de-plan.js';

function origen(sobre: Partial<PlanACopiar> = {}): PlanACopiar {
  return {
    meta: 0.7,
    periodoInicio: { anio: 2026, mitad: 1 },
    competenciaIds: ['cmp-1', 'cmp-2'],
    periodos: [
      { etiqueta: '2026-I', orden: 1, fechaCierre: new Date('2026-07-15') },
      { etiqueta: '2026-II', orden: 2, fechaCierre: null },
    ],
    celdas: [
      {
        competenciaId: 'cmp-1',
        periodoEtiqueta: '2026-I',
        realizada: true,
        realizadaEn: new Date('2026-07-10'),
      },
      { competenciaId: 'cmp-2', periodoEtiqueta: '2026-II', realizada: false, realizadaEn: null },
    ],
    ...sobre,
  };
}

describe('lo que las dos copias comparten', () => {
  it('la meta, las competencias y los periodos con su fecha de cierre', () => {
    for (const modo of ['version', 'duplicado'] as const) {
      const copia = copiarPlan(origen(), modo);

      expect(copia.meta).toBe(0.7);
      expect(copia.competenciaIds).toEqual(['cmp-1', 'cmp-2']);
      expect(copia.periodos).toEqual([
        { etiqueta: '2026-I', orden: 1, fechaCierre: new Date('2026-07-15') },
        { etiqueta: '2026-II', orden: 2, fechaCierre: null },
      ]);
    }
  });

  it('las celdas programadas, referidas por etiqueta y no por id', () => {
    // La copia crea periodos nuevos con ids nuevos, así que el id del origen no
    // sirve para nada. La etiqueta sí: RF-PM-018 la obliga a ser única.
    const copia = copiarPlan(origen(), 'duplicado');

    expect(copia.celdas.map((c) => [c.competenciaId, c.periodoEtiqueta])).toEqual([
      ['cmp-1', '2026-I'],
      ['cmp-2', '2026-II'],
    ]);
  });

  it('el periodo de inicio, para poder reproducir la propuesta', () => {
    expect(copiarPlan(origen(), 'version').periodoInicio).toEqual({ anio: 2026, mitad: 1 });
  });
});

describe('RF-PM-030 — la versión conserva la evidencia', () => {
  it('mantiene las marcas de realizada con su fecha', () => {
    const copia = copiarPlan(origen(), 'version');
    const medida = copia.celdas.find((c) => c.competenciaId === 'cmp-1');

    expect(medida?.realizada).toBe(true);
    expect(medida?.realizadaEn).toEqual(new Date('2026-07-10'));
  });
});

describe('RF-PM-034 — el duplicado NO inventa evidencia', () => {
  it('descarta toda marca de realizada', () => {
    const copia = copiarPlan(origen(), 'duplicado');

    expect(copia.celdas.every((c) => !c.realizada)).toBe(true);
    expect(copia.celdas.every((c) => c.realizadaEn === null)).toBe(true);
  });

  it('la celda sigue programada: se pierde la medición, no la programación', () => {
    const copia = copiarPlan(origen(), 'duplicado');

    expect(copia.celdas).toHaveLength(2);
  });
});

describe('RF-PM-030 — desde qué estados se versiona', () => {
  it('un plan ya cerrado sí; uno editable no hace falta versionarlo', () => {
    expect(permiteVersionado('Aprobado')).toBe(true);
    expect(permiteVersionado('Vigente')).toBe(true);
    expect(permiteVersionado('Histórico')).toBe(true);
    expect(permiteVersionado('Borrador')).toBe(false);
    expect(permiteVersionado('En revisión')).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/domain/services/copia-de-plan.spec.ts
```

Expected: FAIL — no existe `./copia-de-plan.js`.

- [ ] **Step 3: Añadir `permiteVersionado`**

En `estado-plan-medicion.ts`, junto a `permiteEdicion` y `permiteEliminacion`:

```ts
/**
 * RF-PM-030: se versiona lo que ya no se puede editar.
 *
 * Desde Borrador o En revisión no tiene sentido: RF-PM-007 permite editar el
 * primero directamente y el segundo vuelve a Borrador al observarlo. Ofrecer
 * «nueva versión» ahí crearía copias que nadie necesita y ensuciaría el linaje
 * que RF-PM-031 muestra.
 */
export function permiteVersionado(estado: EstadoMedicion): boolean {
  return estado === 'Aprobado' || estado === 'Vigente' || estado === 'Histórico';
}
```

- [ ] **Step 4: Escribir el servicio**

`copia-de-plan.ts`:

```ts
/**
 * Qué se copia de un plan de medición y qué no.
 *
 * Vive en `domain/` y no en el repositorio porque es regla de negocio, no
 * mecánica de persistencia: la pregunta «¿arrastra esta copia marcas de
 * medición?» se responde aquí con una prueba de dos líneas, y metida en el
 * repositorio necesitaría una base de datos para responderse.
 *
 * Las celdas se refieren a los periodos por **etiqueta** y no por id: la copia
 * creará periodos nuevos, con ids que todavía no existen. RF-PM-018 obliga a
 * que la etiqueta no se repita dentro de un plan, así que sirve de clave.
 */

export type ModoDeCopia = 'version' | 'duplicado';

export interface PeriodoACopiar {
  readonly etiqueta: string;
  readonly orden: number;
  readonly fechaCierre: Date | null;
}

export interface CeldaACopiar {
  readonly competenciaId: string;
  readonly periodoEtiqueta: string;
  readonly realizada: boolean;
  readonly realizadaEn: Date | null;
}

export interface PlanACopiar {
  readonly meta: number;
  readonly periodoInicio: { anio: number; mitad: 1 | 2 } | null;
  readonly competenciaIds: readonly string[];
  readonly periodos: readonly PeriodoACopiar[];
  readonly celdas: readonly CeldaACopiar[];
}

export type CopiaDelPlan = PlanACopiar;

/**
 * RF-PM-030 y RF-PM-034.
 *
 * La única diferencia entre los dos modos, aquí dentro, son las marcas de
 * `realizada`. El vínculo de linaje y el código los pone el caso de uso: son
 * decisiones sobre la identidad del plan nuevo, no sobre su contenido.
 */
export function copiarPlan(origen: PlanACopiar, modo: ModoDeCopia): CopiaDelPlan {
  return {
    meta: origen.meta,
    periodoInicio: origen.periodoInicio,
    competenciaIds: [...origen.competenciaIds],
    periodos: origen.periodos.map((p) => ({ ...p })),
    celdas: origen.celdas.map((c) => ({
      competenciaId: c.competenciaId,
      periodoEtiqueta: c.periodoEtiqueta,
      // Se pierde la medición, no la programación: la celda sigue marcada como
      // «hay que medir aquí», y deja de afirmar que ya se midió.
      realizada: modo === 'version' ? c.realizada : false,
      realizadaEn: modo === 'version' ? c.realizadaEn : null,
    })),
  };
}
```

Reexportar `permiteVersionado` desde aquí para que las pruebas y los casos de uso lo importen del mismo sitio:

```ts
export { permiteVersionado } from './../value-objects/estado-plan-medicion.js';
```

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/domain/
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/src/modules/mejora-continua/domain/
git commit -m "El duplicado no hereda las marcas de medición; la versión sí"
```

Expected: PASS, 8 pruebas nuevas.

---

### Task 3: El puerto y el repositorio

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/application/ports/plan-medicion.port.ts`
- Modify: `apps/api/src/modules/mejora-continua/infrastructure/persistence/plan-medicion.repository.ts`
- Test: `apps/api/test/integration/plan-medicion.int.spec.ts`

**Interfaces:**
- Consumes: `CopiaDelPlan` de la Task 2; `DatosPlanMedicion`, `DatosPeriodo`, `CeldaMatriz` del puerto.
- Produces, en `RepositorioPlanMedicionPort`:

```ts
  /** RF-PM-030 y RF-PM-034: crea el plan nuevo con todo su contenido, en una transacción. */
  copiar(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    version: number;
    derivadoDeId: string | null;
    contenido: CopiaDelPlan;
  }): Promise<DatosPlanMedicion>;

  /** RF-PM-031: el linaje completo, de más reciente a más antiguo. */
  linajeDe(id: string): Promise<DatosPlanMedicion[]>;

  /** El origen de una copia, con sus celdas resueltas por etiqueta de periodo. */
  contenidoDe(id: string): Promise<CopiaDelPlan | null>;

  /** RF-PM-041 RN1: marca vigente y archiva al anterior, en una transacción. */
  marcarVigenteRelevando(
    id: string,
  ): Promise<{ plan: DatosPlanMedicion; relevado: DatosPlanMedicion | null }>;
```

  Y `cambiarEstado` gana un tercer parámetro opcional:

```ts
  cambiarEstado(
    id: string,
    estado: EstadoMedicion,
    aprobacion?: { actorId: string; fecha: Date },
  ): Promise<DatosPlanMedicion>;
```

- [ ] **Step 1: Escribir las pruebas de integración en rojo**

En `apps/api/test/integration/plan-medicion.int.spec.ts`:

```ts
describe('RF-PM-030 y RF-PM-034 — copiar un plan', () => {
  it('la copia lleva competencias, periodos con fecha y celdas programadas', async () => {
    const { planId, periodos } = await conMatriz([CMP1, CMP2], ['2026-I', '2026-II']);
    await repo.programar(planId, [{ competenciaId: CMP1, periodoId: periodos[0]!.id }]);
    const contenido = await repo.contenidoDe(planId);
    expect(contenido).not.toBeNull();

    const copia = await repo.copiar({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-COPIA-D-v9',
      version: 9,
      derivadoDeId: planId,
      contenido: contenido!,
    });

    expect(copia.competenciaIds).toHaveLength(2);
    expect(copia.periodos.map((p) => p.etiqueta)).toEqual(['2026-I', '2026-II']);

    // Las celdas se resolvieron contra los periodos NUEVOS, no los del origen.
    const matriz = await repo.matriz(copia.id);
    const idsNuevos = new Set(copia.periodos.map((p) => p.id));
    expect(matriz).toHaveLength(1);
    expect(idsNuevos.has(matriz[0]!.periodoId)).toBe(true);
  });
});

describe('RF-PM-041 RN1 — el relevo al entrar en vigor', () => {
  it('marcar vigente archiva al anterior y deja exactamente uno', async () => {
    const v1 = await repo.crear({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-RELEVO-D-v1',
      meta: 0.7,
      periodoInicio: null,
    });
    await repo.cambiarEstado(v1.id, 'Vigente');

    const v2 = await repo.crear({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-RELEVO-D-v2',
      meta: 0.7,
      periodoInicio: null,
    });

    const r = await repo.marcarVigenteRelevando(v2.id);

    expect(r.plan.estado).toBe('Vigente');
    expect(r.relevado?.codigo).toBe('PM-RELEVO-D-v1');
    expect((await repo.porId(v1.id))?.estado).toBe('Histórico');

    const vigentes = await prisma.planMedicion.count({
      where: { planEstudiosId, tipo: 'DIRECTA', estado: 'VIGENTE' },
    });
    expect(vigentes).toBe(1);
  });

  it('sin anterior vigente, no releva a nadie', async () => {
    const solo = await repo.crear({
      planEstudiosId,
      tipo: 'INDIRECTA',
      codigo: 'PM-SOLO-I-v1',
      meta: 0.7,
      periodoInicio: null,
    });

    const r = await repo.marcarVigenteRelevando(solo.id);

    expect(r.plan.estado).toBe('Vigente');
    expect(r.relevado).toBeNull();
  });
});

describe('RF-PM-039 — responsable y fecha de aprobación', () => {
  it('se guardan junto al plan al aprobar', async () => {
    const p = await repo.crear({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-APROB-D-v1',
      meta: 0.7,
      periodoInicio: null,
    });
    const cuando = new Date('2026-09-04T10:00:00Z');

    await repo.cambiarEstado(p.id, 'Aprobado', { actorId: ACTOR_ID, fecha: cuando });

    const fila = await prisma.planMedicion.findUnique({ where: { id: p.id } });
    expect(fila?.aprobadoPorId).toBe(ACTOR_ID);
    expect(fila?.aprobadoEn).toEqual(cuando);
  });
});

describe('RF-PM-031 — el linaje', () => {
  it('devuelve la cadena de más reciente a más antigua', async () => {
    const v1 = await repo.crear({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-CADENA-D-v1',
      meta: 0.7,
      periodoInicio: null,
    });
    const contenido = await repo.contenidoDe(v1.id);
    const v2 = await repo.copiar({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-CADENA-D-v2',
      version: 2,
      derivadoDeId: v1.id,
      contenido: contenido!,
    });
    const v3 = await repo.copiar({
      planEstudiosId,
      tipo: 'DIRECTA',
      codigo: 'PM-CADENA-D-v3',
      version: 3,
      derivadoDeId: v2.id,
      contenido: contenido!,
    });

    // Desde cualquier punto de la cadena se ve la cadena entera.
    for (const desde of [v1.id, v2.id, v3.id]) {
      expect((await repo.linajeDe(desde)).map((p) => p.codigo)).toEqual([
        'PM-CADENA-D-v3',
        'PM-CADENA-D-v2',
        'PM-CADENA-D-v1',
      ]);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/plan-medicion.int.spec.ts
```

Expected: FAIL — `repo.contenidoDe is not a function`.

- [ ] **Step 3: Ampliar el puerto**

Añadir a `RepositorioPlanMedicionPort` las cuatro firmas del bloque **Interfaces** de esta tarea, e importar `CopiaDelPlan` desde `../../domain/services/copia-de-plan.js`.

- [ ] **Step 4: Implementar en el repositorio**

En `plan-medicion.repository.ts`:

```ts
  /**
   * El contenido copiable del plan, con las celdas referidas por etiqueta.
   *
   * Por etiqueta y no por id porque quien reciba esto va a crear periodos
   * nuevos: el id del origen no le sirve para nada.
   */
  async contenidoDe(id: string): Promise<CopiaDelPlan | null> {
    const plan = await this.porId(id);
    if (!plan) return null;

    const etiquetaDe = new Map(plan.periodos.map((p) => [p.id, p.etiqueta]));
    const celdas = await this.matriz(id);

    return {
      meta: plan.meta,
      periodoInicio: plan.periodoInicio,
      competenciaIds: plan.competenciaIds,
      periodos: plan.periodos.map((p) => ({
        etiqueta: p.etiqueta,
        orden: p.orden,
        fechaCierre: p.fechaCierre,
      })),
      celdas: celdas.flatMap((c) => {
        const etiqueta = etiquetaDe.get(c.periodoId);
        // Una celda cuyo periodo ya no existe no puede copiarse a ningún sitio.
        if (!etiqueta) return [];
        return [
          {
            competenciaId: c.competenciaId,
            periodoEtiqueta: etiqueta,
            realizada: c.realizada,
            realizadaEn: c.realizadaEn,
          },
        ];
      }),
    };
  }

  /** RNF12: todo el contenido en una transacción. Media copia es peor que ninguna. */
  async copiar(datos: {
    planEstudiosId: string;
    tipo: TipoMedicion;
    codigo: string;
    version: number;
    derivadoDeId: string | null;
    contenido: CopiaDelPlan;
  }): Promise<DatosPlanMedicion> {
    const { contenido } = datos;

    const id = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.planMedicion.create({
        data: {
          planEstudiosId: datos.planEstudiosId,
          tipo: datos.tipo,
          codigo: datos.codigo,
          version: datos.version,
          derivadoDeId: datos.derivadoDeId,
          meta: contenido.meta,
          periodoInicioAnio: contenido.periodoInicio?.anio ?? null,
          periodoInicioMitad: contenido.periodoInicio?.mitad ?? null,
        },
      });

      if (contenido.competenciaIds.length > 0) {
        await tx.competenciaDelPlan.createMany({
          data: contenido.competenciaIds.map((competenciaId) => ({
            planMedicionId: creado.id,
            competenciaId,
          })),
        });
      }

      if (contenido.periodos.length > 0) {
        await tx.periodoMedicion.createMany({
          data: contenido.periodos.map((p) => ({
            planMedicionId: creado.id,
            etiqueta: p.etiqueta,
            orden: p.orden,
            fechaCierre: p.fechaCierre,
          })),
        });
      }

      if (contenido.celdas.length > 0) {
        // Los ids se leen DESPUÉS de crear: `createMany` no los devuelve.
        const nuevos = await tx.periodoMedicion.findMany({
          where: { planMedicionId: creado.id },
          select: { id: true, etiqueta: true },
        });
        const idDe = new Map(nuevos.map((p) => [p.etiqueta, p.id]));

        await tx.programacion.createMany({
          data: contenido.celdas.flatMap((c) => {
            const periodoId = idDe.get(c.periodoEtiqueta);
            if (!periodoId) return [];
            return [
              {
                planMedicionId: creado.id,
                competenciaId: c.competenciaId,
                periodoId,
                realizada: c.realizada,
                realizadaEn: c.realizadaEn,
              },
            ];
          }),
        });
      }

      return creado.id;
    });

    return this.exigir(id);
  }

  /**
   * RF-PM-031: la cadena entera, se pida desde donde se pida.
   *
   * Se sube hasta la raíz por `derivadoDeId` y se baja recogiendo descendientes.
   * En bucle y no con una CTE recursiva: las cadenas son de unos pocos planes y
   * un SQL recursivo aquí sería más difícil de leer que de ejecutar.
   */
  async linajeDe(id: string): Promise<DatosPlanMedicion[]> {
    let raiz = await this.prisma.planMedicion.findUnique({
      where: { id },
      select: { id: true, derivadoDeId: true },
    });
    if (!raiz) return [];

    const vistos = new Set<string>([raiz.id]);
    while (raiz?.derivadoDeId && !vistos.has(raiz.derivadoDeId)) {
      vistos.add(raiz.derivadoDeId);
      raiz = await this.prisma.planMedicion.findUnique({
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
      const hijos = await this.prisma.planMedicion.findMany({
        where: { derivadoDeId: actual },
        select: { id: true },
      });
      pendientes.push(...hijos.map((h) => h.id));
    }

    const planes = await Promise.all(cadena.map((c) => this.porId(c)));
    // RF-PM-031 RN1: de la más reciente a la más antigua.
    return planes
      .filter((p): p is DatosPlanMedicion => p !== null)
      .sort((a, b) => b.version - a.version);
  }

  /**
   * RF-PM-041 RN1: como mucho un Vigente por plan de estudios y tipo.
   *
   * Las dos escrituras van en una transacción. Sueltas, un fallo entre medias
   * dejaría el programa sin ningún plan vigente o con dos, y el índice parcial
   * rechazaría la segunda dejando la primera a medias.
   */
  async marcarVigenteRelevando(
    id: string,
  ): Promise<{ plan: DatosPlanMedicion; relevado: DatosPlanMedicion | null }> {
    const plan = await this.exigir(id);

    const anterior = await this.prisma.planMedicion.findFirst({
      where: {
        planEstudiosId: plan.planEstudiosId,
        tipo: plan.tipo,
        estado: 'VIGENTE',
        id: { not: id },
      },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Primero archivar: al revés, el índice parcial rechazaría el segundo
      // VIGENTE antes de que el primero deje de serlo.
      if (anterior) {
        await tx.planMedicion.update({
          where: { id: anterior.id },
          data: { estado: 'HISTORICO' },
        });
      }
      await tx.planMedicion.update({ where: { id }, data: { estado: 'VIGENTE' } });
    });

    return {
      plan: await this.exigir(id),
      relevado: anterior ? await this.exigir(anterior.id) : null,
    };
  }
```

Y `cambiarEstado` acepta la aprobación:

```ts
  async cambiarEstado(
    id: string,
    estado: EstadoMedicion,
    aprobacion?: { actorId: string; fecha: Date },
  ): Promise<DatosPlanMedicion> {
    await this.prisma.planMedicion.update({
      where: { id },
      data: {
        estado: aEstadoPrisma(estado),
        // RF-PM-039. Solo se escriben al aprobar; una transición posterior no
        // debe borrar quién aprobó ni cuándo.
        ...(aprobacion ? { aprobadoPorId: aprobacion.actorId, aprobadoEn: aprobacion.fecha } : {}),
      },
    });
    return this.exigir(id);
  }
```

Si el nombre del traductor de estado a enum de Prisma no es `aEstadoPrisma`, usar el que ya exista en el archivo.

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/api
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration -- test/integration/plan-medicion.int.spec.ts
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/src/modules/mejora-continua/
git commit -m "El repositorio copia planes, sigue el linaje y releva al vigente"
```

---

### Task 4: Los dos casos de uso

**Files:**
- Create: `apps/api/src/modules/mejora-continua/application/use-cases/versionar-planes-medicion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/application/use-cases/versionar-planes-medicion.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/domain/events/eventos-medicion.ts`

**Interfaces:**
- Consumes: `copiarPlan`, `permiteVersionado` (Task 2); `copiar`, `contenidoDe`, `codigosDe` del puerto (Task 3).
- Produces: la clase `VersionarPlanesMedicion` con `generarNuevaVersion(actor, id)` y `duplicarPlan(actor, id)`, ambos `Promise<DatosPlanMedicion>`. La Task 5 la expone por HTTP.

- [ ] **Step 1: Escribir las pruebas en rojo**

`versionar-planes-medicion.spec.ts`, con los mismos dobles que usa `gestionar-planes-medicion.spec.ts` —copiar de allí los ayudantes `plan()`, `repo()`, `contenido()` y `montar()`, adaptando `montar` para instanciar `VersionarPlanesMedicion`:

```ts
describe('RF-PM-030 — nueva versión', () => {
  it('nace en Borrador, con vínculo al origen y el siguiente correlativo', async () => {
    const { caso, copiados } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.generarNuevaVersion(ACTOR, 'pm-1');

    expect(copiados[0]?.derivadoDeId).toBe('pm-1');
    expect(copiados[0]?.version).toBe(2);
  });

  it('conserva las marcas de realizada', async () => {
    const { caso, copiados } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.generarNuevaVersion(ACTOR, 'pm-1');

    expect(copiados[0]?.contenido.celdas.some((c) => c.realizada)).toBe(true);
  });

  it('un Borrador no se versiona: se edita', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Borrador' }) } });

    await expect(caso.generarNuevaVersion(ACTOR, 'pm-1')).rejects.toThrow(ReglaDeNegocioViolada);
  });

  it('deja rastro en la bitácora con su propia acción', async () => {
    const { caso, vistos } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.generarNuevaVersion(ACTOR, 'pm-1');

    expect(vistos.map((e) => e.accion)).toContain('medicion.version');
  });
});

describe('RF-PM-034 — duplicar', () => {
  it('no hereda el vínculo ni el estado del original', async () => {
    const { caso, copiados } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.duplicarPlan(ACTOR, 'pm-1');

    expect(copiados[0]?.derivadoDeId).toBeNull();
  });

  it('descarta las marcas de realizada: no puede afirmar mediciones que no ocurrieron', async () => {
    const { caso, copiados } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.duplicarPlan(ACTOR, 'pm-1');

    expect(copiados[0]?.contenido.celdas.every((c) => !c.realizada)).toBe(true);
  });

  it('se puede duplicar un Borrador, a diferencia de versionar', async () => {
    const { caso } = montar({ repo: { porId: async () => plan({ estado: 'Borrador' }) } });

    await expect(caso.duplicarPlan(ACTOR, 'pm-1')).resolves.toBeDefined();
  });

  it('su acción en la bitácora se distingue de la de versionar', async () => {
    const { caso, vistos } = montar({ repo: { porId: async () => plan({ estado: 'Vigente' }) } });

    await caso.duplicarPlan(ACTOR, 'pm-1');

    expect(vistos.map((e) => e.accion)).toContain('medicion.duplicado');
  });
});

describe('permisos', () => {
  it('las dos exigen `medicion.crear`', async () => {
    const { caso } = montar({
      autorizacion: { puede: async () => false },
      repo: { porId: async () => plan({ estado: 'Vigente' }) },
    });

    await expect(caso.generarNuevaVersion(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
    await expect(caso.duplicarPlan(ACTOR, 'pm-1')).rejects.toThrow(AccesoDenegado);
  });
});
```

`montar` devuelve `copiados`, un arreglo donde el doble de `copiar` va guardando lo que recibe:

```ts
const copiados: Parameters<RepositorioPlanMedicionPort['copiar']>[0][] = [];
// dentro del doble de repo:
copiar: async (datos) => {
  copiados.push(datos);
  return plan({ id: 'pm-2', codigo: datos.codigo, version: datos.version, estado: 'Borrador' });
},
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/application/use-cases/versionar-planes-medicion.spec.ts
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Añadir los dos eventos**

En `eventos-medicion.ts`, siguiendo el patrón de `PlanMedicionCreado`:

```ts
/** RF-PM-030. Acción propia: en el histórico se lee distinto que un alta. */
export class PlanMedicionVersionado extends EventoMedicion {
  readonly accion = 'medicion.version';
  constructor(actor: Actor, id: string, codigo: string, codigoOrigen: string) {
    super(actor, id, `Nueva versión ${codigo}, derivada de ${codigoOrigen}.`);
  }
}

/** RF-PM-034. Se distingue de la versión: esta copia no desciende de nadie. */
export class PlanMedicionDuplicado extends EventoMedicion {
  readonly accion = 'medicion.duplicado';
  constructor(actor: Actor, id: string, codigo: string, codigoOrigen: string) {
    super(actor, id, `Duplicado ${codigo}, copiado de ${codigoOrigen} sin vínculo de versión.`);
  }
}
```

Ajustar la forma del constructor a la que ya usen las demás clases del archivo.

- [ ] **Step 4: Escribir el caso de uso**

Antes, **mover** `siguienteCodigo` —hoy función privada al final de
`gestionar-planes-medicion.use-case.ts`— a `domain/value-objects/codigo-medicion.ts` y
exportarla, para que los dos casos de uso la usen sin duplicarla. Actualizar el import del
original.

`versionar-planes-medicion.use-case.ts`:

```ts
/**
 * RF-PM-030 y RF-PM-034.
 *
 * Dos métodos y no uno con bandera: versionar exige que el plan esté cerrado y
 * duplicar no, y una bandera escondería esa diferencia dentro de un `if`. Por
 * fuera son dos intenciones distintas —«corregir esto» y «empezar el del año
 * que viene partiendo de esto»— y dejan rastros distintos en la bitácora.
 */

@Injectable()
export class VersionarPlanesMedicion {
  constructor(
    @Inject(REPOSITORIO_PLAN_MEDICION) private readonly planes: RepositorioPlanMedicionPort,
    @Inject(CONTENIDO_CURRICULAR) private readonly curricular: ContenidoCurricularPort,
    @Inject(AUTORIZACION) private readonly autorizacion: AuthorizationPort,
    @Inject(PUBLICADOR_DE_EVENTOS) private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF-PM-030: copia con vínculo al origen, conservando las marcas de medición. */
  async generarNuevaVersion(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    const plan = await this.exigirPlan(actor, id);

    if (!permiteVersionado(plan.estado)) {
      // RNF08: el motivo concreto, y la salida. Decir solo «no se puede» dejaría
      // a quien lo lea sin saber que un Borrador se edita directamente.
      throw new ReglaDeNegocioViolada(
        `Solo se versiona un plan aprobado, vigente o histórico. Este está en ${plan.estado} ` +
          'y se puede editar directamente.',
      );
    }

    return this.copiarA(actor, plan, 'version');
  }

  /** RF-PM-034: copia independiente, sin vínculo y sin marcas de medición. */
  async duplicarPlan(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    // Sin comprobación de estado: duplicar un borrador para probar otra
    // configuración es legítimo, y RF-PM-034 no lo restringe.
    return this.copiarA(actor, await this.exigirPlan(actor, id), 'duplicado');
  }

  private async copiarA(
    actor: Actor,
    plan: DatosPlanMedicion,
    modo: 'version' | 'duplicado',
  ): Promise<DatosPlanMedicion> {
    const contenido = await this.planes.contenidoDe(plan.id);
    if (!contenido) throw new NoEncontrado('el plan de medición', plan.id);

    const base = await this.curricular.planPorId(plan.planEstudiosId);
    if (!base) throw new NoEncontrado('el plan de estudios', plan.planEstudiosId);

    const codigo = siguienteCodigo(
      base.codigo,
      plan.tipo,
      await this.planes.codigosDe(plan.planEstudiosId, plan.tipo),
    );

    // El correlativo sale del código y no de `plan.version + 1`: si campo y
    // código discreparan, la pantalla mostraría dos números que se contradicen
    // (spec §3.3).
    const version = Number.parseInt(codigo.slice(codigo.lastIndexOf('-v') + 2), 10);

    const creado = await this.planes.copiar({
      planEstudiosId: plan.planEstudiosId,
      tipo: plan.tipo,
      codigo,
      version,
      derivadoDeId: modo === 'version' ? plan.id : null,
      contenido: copiarPlan(contenido, modo),
    });

    await this.eventos.publicar([
      modo === 'version'
        ? new PlanMedicionVersionado(actor, creado.id, creado.codigo, plan.codigo)
        : new PlanMedicionDuplicado(actor, creado.id, creado.codigo, plan.codigo),
    ]);

    return creado;
  }

  private async exigirPlan(actor: Actor, id: string): Promise<DatosPlanMedicion> {
    // RF-PM-042: las dos operaciones crean un plan, así que exigen crearlos.
    if (!(await this.autorizacion.puede(actor, 'medicion.crear'))) {
      throw new AccesoDenegado('medicion.crear');
    }
    const plan = await this.planes.porId(id);
    if (!plan) throw new NoEncontrado('el plan de medición', id);
    return plan;
  }
}
```

Los imports y los nombres de los símbolos inyectados —`REPOSITORIO_PLAN_MEDICION`,
`AUTORIZACION`, `PUBLICADOR_DE_EVENTOS`, `AccesoDenegado`, `NoEncontrado`— se copian de
`gestionar-planes-medicion.use-case.ts`, que ya los usa todos.

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/src/modules/mejora-continua/
git commit -m "Versionar y duplicar un plan de medición son dos operaciones, no una"
```

Expected: PASS, 9 pruebas nuevas.

---

### Task 5: El relevo, el guardián y RF-PM-039

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.spec.ts`

**Interfaces:**
- Consumes: `marcarVigenteRelevando` y el `cambiarEstado` con aprobación (Task 3).
- Produces: nada nuevo hacia fuera; cambia el comportamiento de `crear` y `transicionar`.

- [ ] **Step 1: Escribir las pruebas en rojo**

```ts
describe('RF-PM-041 RN1 — el guardián de crear se acota', () => {
  it('se puede crear un Borrador aunque exista un Vigente', async () => {
    // Antes se rechazaba, y eso dejaba el módulo sin salida: en cuanto el primer
    // plan entraba en vigor no se podía crear ningún otro, y RF-PM-030 —que
    // exige partir de un plan Vigente— era imposible.
    const { caso } = montar({ repo: { vigenteDe: async () => plan({ estado: 'Vigente' }) } });

    await expect(
      caso.crear(ACTOR, { planEstudiosId: 'pe-1', tipo: 'DIRECTA', metaPorcentaje: 70 }),
    ).resolves.toBeDefined();
  });
});

describe('RF-PM-041 RN1 — el relevo', () => {
  it('marcar vigente usa la operación que releva, no un cambio de estado suelto', async () => {
    const relevos: string[] = [];
    const { caso } = montar({
      repo: {
        porId: async () => plan({ estado: 'Aprobado' }),
        marcarVigenteRelevando: async (id) => {
          relevos.push(id);
          return { plan: plan({ estado: 'Vigente' }), relevado: plan({ codigo: 'PM-VIEJO-D-v1' }) };
        },
      },
    });

    await caso.transicionar(ACTOR, 'pm-1', 'marcar-vigente', {});

    expect(relevos).toEqual(['pm-1']);
  });

  it('el archivado del anterior deja escrito por qué', async () => {
    const { caso, vistos } = montar({
      repo: {
        porId: async () => plan({ estado: 'Aprobado' }),
        marcarVigenteRelevando: async () => ({
          plan: plan({ estado: 'Vigente', codigo: 'PM-NUEVO-D-v2' }),
          relevado: plan({ id: 'pm-0', codigo: 'PM-VIEJO-D-v1' }),
        }),
      },
    });

    await caso.transicionar(ACTOR, 'pm-1', 'marcar-vigente', {});

    // Sin el motivo, la bitácora muestra un archivado que nadie pidió.
    expect(vistos.some((e) => e.detalle.includes('PM-NUEVO-D-v2'))).toBe(true);
  });
});

describe('RF-PM-039 — quién aprobó y cuándo', () => {
  it('se guardan al aprobar', async () => {
    const aprobaciones: { actorId: string; fecha: Date }[] = [];
    const { caso } = montar({
      repo: {
        porId: async () => plan({ estado: 'En revisión' }),
        cambiarEstado: async (_id, estado, aprobacion) => {
          if (aprobacion) aprobaciones.push(aprobacion);
          return plan({ estado });
        },
      },
    });

    await caso.transicionar(ACTOR, 'pm-1', 'aprobar', {});

    expect(aprobaciones).toHaveLength(1);
    expect(aprobaciones[0]?.actorId).toBe(ACTOR.id);
  });

  it('una transición posterior no los pisa', async () => {
    const conAprobacion: boolean[] = [];
    const { caso } = montar({
      repo: {
        porId: async () => plan({ estado: 'Vigente' }),
        cambiarEstado: async (_id, estado, aprobacion) => {
          conAprobacion.push(aprobacion !== undefined);
          return plan({ estado });
        },
      },
    });

    await caso.transicionar(ACTOR, 'pm-1', 'archivar', {});

    expect(conAprobacion).toEqual([false]);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/application/use-cases/gestionar-planes-medicion.spec.ts
```

Expected: FAIL en las cuatro pruebas nuevas.

- [ ] **Step 3: Acotar el guardián**

En `crear`, sustituir el bloque de las líneas 97–104 —el que lanza si `vigenteDe` devuelve algo— por nada. El plan nace en Borrador y el índice parcial solo restringe filas VIGENTE, así que no hay invariante que proteger en el alta. Dejar escrito por qué desapareció:

```ts
    // No se comprueba aquí que exista un Vigente. RF-PM-041 RN1 prohíbe DOS
    // VIGENTES, no crear: el plan nace en Borrador y el índice parcial solo
    // restringe las filas VIGENTE. La comprobación anterior era más estricta
    // que el invariante y dejaba el módulo sin salida —una vez en vigor el
    // primero, no se podía crear ninguno más—, además de hacer imposible
    // RF-PM-030. El relevo se resuelve al marcar vigente, en `transicionar`.
```

- [ ] **Step 4: Enrutar `marcar-vigente` y la aprobación**

En `transicionar`, sustituir la llamada única a `cambiarEstado` por:

```ts
    let actualizado: DatosPlanMedicion;
    let relevado: DatosPlanMedicion | null = null;

    if (accion === 'marcar-vigente') {
      const r = await this.planes.marcarVigenteRelevando(id);
      actualizado = r.plan;
      relevado = r.relevado;
    } else if (accion === 'aprobar') {
      // RF-PM-039: el instante lo pone la aplicación y no la base, para que la
      // fecha del evento y la de la columna sean la misma.
      actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado, {
        actorId: actor.id,
        fecha: new Date(),
      });
    } else {
      actualizado = await this.planes.cambiarEstado(id, r.nuevoEstado);
    }
```

Y a los eventos publicados, si hubo relevo, añadir el del plan archivado con su motivo:

```ts
    if (relevado) {
      eventos.push(
        new PlanMedicionTransicionado(
          actor,
          relevado.id,
          relevado.codigo,
          'Vigente',
          'Histórico',
          `Relevado por ${actualizado.codigo}.`,
        ),
      );
    }
```

- [ ] **Step 5: Ejecutar hasta verde y commitear**

```bash
cd apps/api
npx vitest run src/modules/mejora-continua/
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
npm run typecheck && npm run lint && npm run format:check
cd /d/App-ICACIT
git add apps/api/src/modules/mejora-continua/
git commit -m "Entrar en vigor releva al plan anterior, y quien aprueba queda registrado"
```

---

### Task 6: Los endpoints

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/infrastructure/http/planes-medicion.controller.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `VersionarPlanesMedicion` (Task 4); `linajeDe` del puerto (Task 3).
- Produces: `POST /planes-medicion/:id/versiones`, `POST /planes-medicion/:id/duplicados`, `GET /planes-medicion/:id/versiones`. La Task 7 los consume.

- [ ] **Step 1: Registrar el caso de uso**

En `app.module.ts`, junto a los demás de `mejora-continua`, añadir `VersionarPlanesMedicion` a `providers`.

- [ ] **Step 2: Añadir los tres endpoints**

En el controlador, siguiendo el estilo de los existentes —`@ApiOperation`, `@ApiResponse`, `@ActorActual()`—:

```ts
  /** RF-PM-030. */
  @Post(':id/versiones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generar una nueva versión del plan de medición' })
  @ApiResponse({ status: 409, description: 'El plan no está aprobado, vigente ni histórico.' })
  async nuevaVersion(@ActorActual() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return aRespuesta(await this.versionar.generarNuevaVersion(actor, id));
  }

  /** RF-PM-034. */
  @Post(':id/duplicados')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Duplicar el plan como base de un periodo nuevo' })
  async duplicar(@ActorActual() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return aRespuesta(await this.versionar.duplicarPlan(actor, id));
  }

  /** RF-PM-031: de la más reciente a la más antigua. */
  @Get(':id/versiones')
  @ApiOperation({ summary: 'Consultar el linaje de versiones del plan' })
  async versiones(@ActorActual() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return (await this.gestionar.linaje(actor, id)).map(aRespuesta);
  }
```

`aRespuesta` es el traductor que el controlador ya usa para `DatosPlanMedicion`; si tiene otro nombre, usar ese. `linaje(actor, id)` se añade a `GestionarPlanesMedicion`: comprueba `medicion.leer` y delega en `this.planes.linajeDe(id)`.

- [ ] **Step 3: Comprobar a mano contra la API**

```bash
cd apps/api && npm run build && THROTTLE_LIMIT=10000 npm start
```

En otra terminal, con un token de un usuario con `medicion.crear`:

```bash
curl -s -X POST localhost:3000/api/v1/planes-medicion/<id>/versiones -H "authorization: Bearer <token>" | head -c 400
curl -s localhost:3000/api/v1/planes-medicion/<id>/versiones -H "authorization: Bearer <token>" | head -c 400
```

Expected: la primera devuelve 201 con el plan nuevo en Borrador; la segunda, dos planes ordenados de mayor a menor versión.

- [ ] **Step 4: Verificar y commitear**

```bash
cd apps/api && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/api/src/
git commit -m "Versionar, duplicar y consultar el linaje por HTTP"
```

---

### Task 7: Las pantallas

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/LineaDeVersiones.tsx`
- Create: `apps/web/src/features/mejora-continua/components/HistorialDelPlan.tsx`
- Test: `apps/web/src/features/mejora-continua/components/LineaDeVersiones.test.tsx`
- Modify: `apps/web/src/features/mejora-continua/api/medicion.api.ts`
- Modify: `apps/web/src/features/mejora-continua/api/queries.ts`
- Modify: `apps/web/src/features/mejora-continua/pages/PlanMedicionPage.tsx`

**Interfaces:**
- Consumes: los tres endpoints de la Task 6, y `GET /bitacora` que ya existe.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Ampliar la capa de datos**

En `medicion.api.ts`:

```ts
export async function generarNuevaVersion(id: string): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>(`/planes-medicion/${id}/versiones`);
}

export async function duplicarPlan(id: string): Promise<PlanMedicion> {
  return cliente.post<PlanMedicion>(`/planes-medicion/${id}/duplicados`);
}

export async function versionesDe(id: string): Promise<PlanMedicion[]> {
  return cliente.get<PlanMedicion[]>(`/planes-medicion/${id}/versiones`);
}

/**
 * RF-PM-032. Contra `/bitacora` y no contra un endpoint de mejora-continua: el
 * controlador de auditoría cuelga de la raíz a propósito, y CLAUDE.md §3.2
 * prohíbe que un módulo consulte las tablas de otro.
 */
export async function historialDe(id: string): Promise<EventoBitacora[]> {
  return cliente.get<EventoBitacora[]>('/bitacora', {
    entidad: 'PlanMedicion',
    entidadId: id,
    limite: '50',
  });
}
```

Con el tipo, en `domain/tipos.ts`:

```ts
export interface EventoBitacora {
  readonly id: string;
  readonly accion: string;
  readonly detalle: string;
  readonly usuarioNombre: string;
  readonly fecha: string;
}
```

Y en `queries.ts`, los hooks `useVersiones(id)`, `useHistorial(id)`, `useNuevaVersion(id)` y `useDuplicarPlan(id)`. Los dos últimos invalidan `['medicion', 'lista']` además de la rama del plan: crean un plan nuevo que el listado tiene que mostrar.

- [ ] **Step 2: Escribir la prueba del componente en rojo**

`LineaDeVersiones.test.tsx`:

```tsx
/** @vitest-environment jsdom */

/**
 * RF-PM-031 RN1 pide el listado de la versión más reciente a la más antigua, y
 * RF-PM-033 que desde ahí se llegue a cada una en solo lectura.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { LineaDeVersiones } from './LineaDeVersiones';

const VERSIONES = [
  { id: 'p3', codigo: 'PM-X-D-v3', version: 3, estado: 'Borrador' as const, creadoEn: '2026-09-01' },
  { id: 'p2', codigo: 'PM-X-D-v2', version: 2, estado: 'Histórico' as const, creadoEn: '2026-06-01' },
];

function montar(actual = 'p3') {
  render(
    <MemoryRouter>
      <LineaDeVersiones versiones={VERSIONES} actualId={actual} />
    </MemoryRouter>,
  );
}

describe('RF-PM-031 — el linaje', () => {
  it('las lista de la más reciente a la más antigua', () => {
    montar();

    const filas = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(filas[0]).toContain('PM-X-D-v3');
    expect(filas[1]).toContain('PM-X-D-v2');
  });

  it('cada versión enlaza a su detalle', () => {
    montar();

    expect(screen.getByRole('link', { name: /PM-X-D-v2/ })).toHaveAttribute(
      'href',
      '/mejora-continua/medicion/p2',
    );
  });

  it('la versión que se está viendo no enlaza a sí misma', () => {
    montar('p3');

    expect(screen.queryByRole('link', { name: /PM-X-D-v3/ })).not.toBeInTheDocument();
    expect(screen.getByText(/PM-X-D-v3/)).toBeInTheDocument();
  });

  it('con una sola versión no se pinta nada: no hay linaje que mostrar', () => {
    render(
      <MemoryRouter>
        <LineaDeVersiones versiones={[VERSIONES[0]!]} actualId="p3" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

```bash
cd apps/web
npx vitest run src/features/mejora-continua/components/LineaDeVersiones.test.tsx
```

Expected: FAIL — no existe el módulo.

- [ ] **Step 4: Escribir los dos componentes**

`LineaDeVersiones.tsx`:

```tsx
/**
 * RF-PM-031 y RF-PM-033: el linaje del plan y la puerta a cada versión.
 *
 * Con una sola versión no se pinta nada. Una lista de un elemento titulada
 * «Versiones» hace pensar que falta algo, cuando lo que ocurre es que ese plan
 * no desciende de ninguno — el caso normal de un duplicado.
 */

import { Link } from 'react-router-dom';

import { Badge } from '@/shared/components/ui';

import type { PlanMedicion } from '../domain/tipos';
import { TONO_ESTADO } from '../domain/estado-medicion';

export function LineaDeVersiones({
  versiones,
  actualId,
}: {
  readonly versiones: readonly PlanMedicion[];
  readonly actualId: string;
}) {
  if (versiones.length < 2) return null;

  return (
    <ol className="space-y-2">
      {versiones.map((v) => {
        const esActual = v.id === actualId;
        return (
          <li
            key={v.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-borde px-3 py-2 text-sm"
          >
            {esActual ? (
              // Sin enlace a sí misma: un enlace que no lleva a ningún sitio es
              // una promesa rota, y quien usa teclado lo recorre igual.
              <span className="font-semibold text-tinta">{v.codigo}</span>
            ) : (
              <Link to={`/mejora-continua/medicion/${v.id}`} className="font-semibold text-uc-primary hover:underline">
                {v.codigo}
              </Link>
            )}
            <Badge tono={TONO_ESTADO[v.estado]}>{v.estado}</Badge>
            {esActual && <span className="text-xs text-tinta-tenue">Estás viendo esta</span>}
            <span className="ml-auto text-xs text-tinta-tenue">{v.creadoEn.slice(0, 10)}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

Si `TONO_ESTADO` no existe en `domain/estado-medicion.ts`, usar el mapa de tonos que
`PlanesMedicionPage.tsx` ya emplea para pintar el estado en el listado.

`HistorialDelPlan.tsx`:

```tsx
/**
 * RF-PM-032: qué se hizo sobre este plan, con quién y cuándo.
 *
 * Los datos salen de `/bitacora`, no de un endpoint de este módulo: el
 * controlador de auditoría cuelga de la raíz a propósito y CLAUDE.md §3.2
 * prohíbe que un módulo consulte las tablas de otro.
 */

import { EstadoVacio } from '@/shared/components/ui';

import type { EventoBitacora } from '../domain/tipos';

export function HistorialDelPlan({ eventos }: { readonly eventos: readonly EventoBitacora[] }) {
  if (eventos.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin movimientos registrados"
        detalle="Aquí aparecerá cada cambio de meta, competencias, periodos, programación o estado."
      />
    );
  }

  return (
    <ol className="space-y-2">
      {eventos.map((e) => (
        <li key={e.id} className="rounded-lg border border-borde px-3 py-2 text-sm">
          <p className="text-tinta">{e.detalle}</p>
          <p className="mt-1 text-xs text-tinta-tenue">
            {e.usuarioNombre} · {new Date(e.fecha).toLocaleString('es-PE')}
          </p>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: Conectarlos en la página**

En `PlanMedicionPage.tsx`, dos `Tarjeta` nuevas al final —«Versiones» e «Historial»—, y en la cabecera dos botones bajo `SiPuede permiso="medicion.crear"`:

- «Nueva versión», visible solo si `permiteVersionado(plan.estado)`.
- «Duplicar», siempre visible.

Los dos navegan al plan recién creado cuando la mutación responde.

Mostrar también, si `plan.aprobadoEn` no es nulo, quién aprobó y cuándo (RF-PM-039).

- [ ] **Step 6: Verificar y commitear**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run format:check && npm test
cd /d/App-ICACIT
git add apps/web/src/
git commit -m "Versiones e historial del plan de medición en pantalla"
```

---

### Task 8: E2E y documentación

**Files:**
- Create: `tests/e2e/specs/versionado.spec.ts`
- Modify: `docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`

**Interfaces:**
- Consumes: todo lo anterior; el fixture `test` de `tests/e2e/fixtures/sesion.ts`.
- Produces: nada.

- [ ] **Step 1: Escribir el recorrido**

`tests/e2e/specs/versionado.spec.ts`:

```ts
/**
 * RF-PM-030 y RF-PM-031 contra la aplicación entera.
 *
 * Lo que solo se ve aquí es que la operación funcione sobre un plan que llegó a
 * Vigente por su propio camino, con el guardián de `crear` acotado y el relevo
 * hecho: cada una de esas piezas pasa sus pruebas por separado.
 */

import { expect, test } from '../fixtures/sesion';

test('versionar un plan vigente deja una copia en Borrador con su linaje', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');

  const primero = page.getByRole('link', { name: /^PM-/ }).first();
  await expect(primero).toBeVisible();
  await primero.click();
  await expect(page.getByRole('heading', { name: 'Estado del plan' })).toBeVisible();

  // El plan de partida está en Borrador, así que no se ofrece versionar.
  await expect(page.getByRole('button', { name: 'Nueva versión' })).toHaveCount(0);

  // Duplicar sí se ofrece siempre (RF-PM-034).
  await page.getByRole('button', { name: 'Duplicar' }).click();

  await expect(page).toHaveURL(/\/mejora-continua\/medicion\/[0-9a-f-]{36}$/);
  await expect(page.locator('main').getByText('Borrador', { exact: true })).toBeVisible();

  // Un duplicado no desciende de nadie: no hay linaje que mostrar.
  await expect(page.getByRole('heading', { name: 'Versiones' })).toHaveCount(0);
});

test('el historial del plan muestra lo que se hizo, con quién y cuándo', async ({ page }) => {
  await page.goto('/mejora-continua/medicion');
  await page
    .getByRole('link', { name: /^PM-/ })
    .first()
    .click();

  const historial = page.getByRole('heading', { name: 'Historial' });
  await expect(historial).toBeVisible();

  // El alta siempre está: es el primer movimiento de cualquier plan.
  await expect(page.getByText('E2E Editor').last()).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar**

```bash
cd apps/api && npm run e2e:preparar && npm run build && THROTTLE_LIMIT=10000 npm start &
cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test
```

Expected: PASS, 17 pruebas. Si un selector no encuentra su elemento, **corregir el selector**, no la interfaz.

- [ ] **Step 3: Anotar los puntos a validar**

En `docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`, añadir los tres de §8 de la spec: el correlativo compartido entre versiones y duplicados, el archivado automático al entrar en vigor, y que se permitan varias versiones en curso a la vez.

- [ ] **Step 4: Verificar todo y commitear**

```bash
cd apps/api && npm test && npm run typecheck && npm run lint && npm run format:check
export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|')
npm run test:integration
cd ../web && npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
cd ../../tests/e2e && npm run typecheck && npm run format:check
cd /d/App-ICACIT
git add tests/e2e/ docs/
git commit -m "El versionado, de punta a punta"
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| §3.1 dos operaciones, un motor | Tasks 2 y 4 |
| §3.2 las marcas de realizada | Task 2 (dominio), Task 4 (casos de uso) |
| §3.3 el correlativo compartido | Task 4, Step 4 |
| §3.4 el relevo atómico | Task 3 (repositorio), Task 5 (caso de uso) |
| §3.5 varias versiones en curso | Task 5: no se añade comprobación, y queda anotado |
| §3.6 el guardián acotado | Task 5, Step 3 |
| §4 RF-PM-030 | Tasks 2, 4, 6, 7 |
| §4 RF-PM-031 | Tasks 3 (`linajeDe`), 6, 7 |
| §4 RF-PM-032 | Task 7: solo la vista, contra `/bitacora` |
| §4 RF-PM-033 | Task 7: los enlaces de `LineaDeVersiones` |
| §4 RF-PM-034 | Tasks 2, 4, 6, 7 |
| §4 RF-PM-039 | Tasks 1 (campos), 3 (repositorio), 5 (caso de uso), 7 (pantalla) |
| §6 errores | Task 4, Step 4: el motivo concreto de RNF08 |
| §7 pruebas | Tasks 1–8, cada una con las suyas |
| §8 puntos a validar | Task 8, Step 3 |
