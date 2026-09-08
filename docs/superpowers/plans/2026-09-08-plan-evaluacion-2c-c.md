# Ciclo 2c-C — Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar un plan de evaluación indirecta (RF-PE-022 a 030) y cerrar
el hueco de autorización por carrera de todo `mejora-continua`.

**Architecture:** La indirecta reutiliza las dos tablas de 2c-B —
`ConfiguracionCompetencia` y `MedicionAlcanzada` no tienen nada específico de la
directa, y `PeriodoMedicion` ya sirve de periodo y de año. Lo nuevo es una
columna (el responsable) y una tabla (las indicaciones, que cuelgan del año).
El alcance por carrera entra primero porque todo lo demás lo hereda.

**Tech Stack:** NestJS 11, Prisma 7 (multiSchema), PostgreSQL 16, React 18 +
Vite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-08-plan-evaluacion-2c-c-design.md`

## Global Constraints

- **Aislamiento (CLAUDE.md §3.2):** `mejora-continua` solo importa de
  `plan-estudios` el puerto `application/ports/contenido-curricular.port.js`, y
  de `auth` los puertos `ports/authorization.port.js`,
  `ports/directorio-usuarios.port.js` y la ruta
  `infrastructure/http/jwt.guard.js`. Lo vigila `mejora-continua/aislamiento.spec.ts`.
- **`domain/` no importa NestJS, Prisma ni Express.**
- **Auditoría no opcional (§2):** todo caso de uso que muta emite un evento de
  dominio **y una prueba lo cubre** (§6.6).
- **Cobertura ≥80 %** en `domain/` y `application/`.
- **Si toca UI, `axe-core` en verde; si cambia un endpoint, Swagger al día** (§6.6).
- **Prisma:** `npx prisma generate` es obligatorio tras tocar el esquema.
  Prisma 7 bloquea `migrate reset`; usa `migrate deploy`.
- **`tsx` no emite `emitDecoratorMetadata`.** Nest construye las clases
  `@Injectable` sin dependencias y falla en silencio. Para levantar la API:
  `npm run build && node dist/main.js`, **nunca** `tsx`.
- **Índices únicos parciales y `CHECK` se escriben a mano** en el SQL de la
  migración: Prisma no los expresa.
- **`@Recortado()`** vive en `src/platform/http/recortado.ts`. No lo redefinas:
  sin él, `"   "` supera un `@MinLength(1)`.
- **Cifras de partida:** 769 unitarias de API, 269 de integración, 214 de web,
  31 recorridos E2E. Cada tarea informa la cifra que **observa**, no la que este
  plan predice.

### Comandos

```bash
cd apps/api && npm test                       # unitarias
cd apps/api && export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|') && npm run test:integration
cd apps/web && npm test
docker start sgc_postgres sgc_redis           # si están parados
```

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `auth/domain/services/politica-de-autorizacion.ts` | El conjunto acotado gana ocho permisos | 1 |
| Los seis casos de uso de `mejora-continua` | Pasan la carrera a `puede()` | 1 |
| `prisma/schema.prisma` + migración | Columna, tabla, enum e índice | 2 |
| `evaluacion/application/ports/configuracion-evaluacion.port.ts` | Tres métodos y dos campos nuevos | 3 |
| `evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.ts` | Su implementación | 3 |
| `evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts` | Responsable, indicaciones, resultados | 4 |
| `evaluacion/infrastructure/http/dto/configuracion-evaluacion.dto.ts` | Tres DTO | 5 |
| `evaluacion/infrastructure/http/configuracion-evaluacion.controller.ts` | Dos endpoints | 5 |
| `web/.../components/ConfiguracionDelAnio.tsx` | La tarjeta del año | 6 |
| `web/.../pages/PlanEvaluacionPage.tsx` | Ramifica por tipo | 6 |
| `tests/e2e/specs/configuracion-indirecta.spec.ts` | El recorrido | 7 |

---

## Task 1: La carrera entra en la decisión

Va primera porque todo lo demás la hereda, y **entera en una tarea** porque
`puede()` falla cerrada: añadir los permisos al conjunto sin arreglar a la vez
las llamadas dejaría el módulo denegando todo. No se puede partir sin romperlo.

**Files:**
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts:35-46`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts:299-302`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/gestionar-planes-evaluacion.use-case.ts:234`
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/use-cases/configurar-plan-medicion.use-case.ts:181`
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/use-cases/gestionar-planes-medicion.use-case.ts:312`
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/use-cases/programar-mediciones.use-case.ts:218`
- Modify: `apps/api/src/modules/mejora-continua/medicion/application/use-cases/versionar-planes-medicion.use-case.ts:108`
- Test: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
- Test: los `.spec.ts` de los seis casos de uso

**Interfaces:**
- Consumes: `AuthorizationPort.puede(usuarioId, permiso, carreraId?)`, que ya
  acepta el tercer argumento; `ContenidoCurricularPort.planPorId(planEstudiosId)`,
  que devuelve `PlanBase` con `carreraId: string`.
- Produces: cada caso de uso gana un privado
  `private async carreraDe(planEstudiosId: string): Promise<string>`; la firma
  de `exigir` pasa a `(actor: Actor, permiso: string, carreraId: string | null)`.

**Los ocho permisos que se acotan** (los dos `.leer` **no**, ver spec §6.2):

```
medicion.crear   medicion.editar   medicion.eliminar   medicion.aprobar
evaluacion.crear evaluacion.editar evaluacion.eliminar evaluacion.aprobar
```

- [ ] **Step 1: La prueba de que el conjunto acota lo que dice**

En `politica-de-autorizacion.spec.ts`:

```ts
describe('los permisos de mejora-continua se acotan a la carrera', () => {
  const contexto = (permisos: string[], carreraACargo: string | null) => ({
    permisos: new Set(permisos),
    carreraACargo,
  });

  it.each([
    'medicion.crear', 'medicion.editar', 'medicion.eliminar', 'medicion.aprobar',
    'evaluacion.crear', 'evaluacion.editar', 'evaluacion.eliminar', 'evaluacion.aprobar',
  ])('%s sobre la carrera de otro se deniega', (permiso) => {
    const d = puede(contexto([permiso], 'carrera-A'), permiso, 'carrera-B');
    expect(d.permitido).toBe(false);
  });

  it.each(['medicion.leer', 'evaluacion.leer'])(
    '%s no se acota: consultar planes ajenos sigue permitido',
    (permiso) => {
      // La política del proyecto, escrita en el comentario de la constante:
      // un Director consulta planes de otras carreras, no los modifica.
      expect(puede(contexto([permiso], 'carrera-A'), permiso, 'carrera-B').permitido).toBe(true);
    },
  );

  it('un permiso acotado sin carrera se deniega, no se asume', () => {
    // Es la propiedad que hace seguro este refactor: si una llamada olvida
    // pasar la carrera, falla de forma ruidosa en vez de dejar el hueco.
    const d = puede(contexto(['evaluacion.editar'], 'carrera-A'), 'evaluacion.editar', null);
    expect(d.permitido).toBe(false);
    expect(d.motivo).toContain('acotado a una carrera');
  });
});
```

- [ ] **Step 2: Ejecutar y verla fallar**

`cd apps/api && npx vitest run src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
Esperado: fallan los ocho casos del primer `it.each` (hoy la política los deja
pasar porque no están en el conjunto). Los otros dos bloques pasan ya.

- [ ] **Step 3: Añadir los ocho al conjunto**

En `politica-de-autorizacion.ts`, dentro de `PERMISOS_ACOTADOS_A_CARRERA`, tras
`'malla.editar',`:

```ts
  // Mejora Continua, por la misma razón que los de arriba: el rol dice
  // «de su carrera». Los dos `.leer` quedan fuera a propósito, como los de
  // Plan de Estudios — consultar un plan ajeno se permite, modificarlo no.
  'medicion.crear',
  'medicion.editar',
  'medicion.eliminar',
  'medicion.aprobar',
  'evaluacion.crear',
  'evaluacion.editar',
  'evaluacion.eliminar',
  'evaluacion.aprobar',
```

- [ ] **Step 4: Verla pasar**

Mismo comando. Esperado: PASS.

Ahora las 769 unitarias fallarán en los casos de uso que usan el adaptador real.
Es lo esperado y lo arregla el paso siguiente.

- [ ] **Step 5: Resolver la carrera en cada caso de uso**

En `configurar-plan-evaluacion.use-case.ts`, cambia `exigir` y añade el resolutor:

```ts
  /**
   * La carrera del plan, para acotar el permiso.
   *
   * Sale de la cadena que ya existe —evaluación → medición → plan de estudios—
   * y no de una columna propia: desnormalizarla es una migración que se añade
   * el día que el número lo justifique, y hoy no hay número.
   */
  private async carreraDe(planEstudiosId: string): Promise<string> {
    const plan = await this.curricular.planPorId(planEstudiosId);
    if (!plan) {
      throw new NoEncontrado(`No existe el plan de estudios ${planEstudiosId}.`);
    }
    return plan.carreraId;
  }

  private async exigir(actor: Actor, permiso: string, carreraId: string | null): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, permiso, carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
```

En cada método que muta, el orden pasa a ser: resolver el plan y su base
**antes** de exigir el permiso, porque la carrera sale de la base. Por ejemplo,
en `guardarCompetencia`:

```ts
    const plan = await this.exigirPlan(planEvaluacionId);
    const base = await this.exigirBase(plan.planMedicionId);
    await this.exigir(actor, 'evaluacion.editar', await this.carreraDe(base.planEstudiosId));
    this.exigirDefinicionEditable(plan);
```

Las lecturas (`configuracion`, `asignaturasElegibles`, `docentes`) pasan `null`
y **no cambian de conducta**: sus permisos no están acotados.

Repite el patrón en los otros cinco ficheros de la lista. En
`gestionar-planes-medicion` y `versionar-planes-medicion` la carrera sale del
`planEstudiosId` del propio plan de medición, sin el salto por evaluación. En
`gestionar-planes-evaluacion`, para **crear** un plan la carrera sale del plan
de medición base que llega en la petición.

- [ ] **Step 6: La prueba de que un actor de otra carrera recibe 403**

En `configurar-plan-evaluacion.spec.ts`, con el doble de autorización
devolviendo denegado cuando la carrera no coincide:

```ts
it('un editor de otra carrera no puede tocar la configuración', async () => {
  autorizacion.puede = vi.fn(async (_id, _permiso, carreraId) =>
    carreraId === 'carrera-propia'
      ? { permitido: true as const }
      : { permitido: false as const, motivo: 'No dirige esa carrera.' },
  );

  await expect(
    casos.guardarCompetencia(ACTOR, 'ev-1', 'c-1', { instrumento: 'Rúbrica', frecuencia: null }),
  ).rejects.toThrow(AccesoDenegado);

  // Y la carrera que se pasó es la del plan, no una inventada:
  expect(autorizacion.puede).toHaveBeenCalledWith(ACTOR.id, 'evaluacion.editar', 'carrera-ajena');
});
```

Ajusta el doble de `ContenidoCurricularPort` para que `planPorId` devuelva
`carreraId: 'carrera-ajena'`.

Y **una prueba equivalente en cada uno de los seis casos de uso**, no solo en
este. La spec pide cubrir los ocho permisos acotados, y la propiedad que se
comprueba es la misma en todos: que la carrera que llega a `puede()` es la del
plan sobre el que se opera, y no `null`. La forma más barata de no dejarse
ninguno es una tabla por fichero:

```ts
it.each([
  ['guardarCompetencia', () => casos.guardarCompetencia(ACTOR, 'ev-1', 'c-1', DATOS)],
  ['guardarAsignaturas', () => casos.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'p-1', [])],
  ['guardarPorcentaje',  () => casos.guardarPorcentaje(ACTOR, 'ev-1', 'c-1', 'p-1', 50)],
  ['guardarEvidencias',  () => casos.guardarEvidencias(ACTOR, 'ae-1', [])],
])('%s pasa la carrera del plan, no null', async (_nombre, ejecutar) => {
  await ejecutar().catch(() => undefined);
  expect(autorizacion.puede).toHaveBeenCalledWith(ACTOR.id, expect.any(String), 'carrera-ajena');
});
```

Comprueba por mutación que esta tabla tiene dientes: devuelve `null` como tercer
argumento en **uno solo** de los métodos y confirma que cae **una sola** fila.
Si caen todas o ninguna, la tabla no está ejercitando lo que dice.

- [ ] **Step 7: Las tres suites en verde**

Las tres. Informa las cifras observadas.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "La carrera entra en la decisión de autorización de mejora-continua"
```

---

## Task 2: El esquema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_indicaciones_y_responsable/migration.sql`
- Test: `apps/api/test/integration/indicaciones.int.spec.ts`

**Interfaces:**
- Produces: el enum `GrupoObjetivo` y el modelo `IndicacionDeMedicion`, que la
  Task 3 consume; la columna `ConfiguracionCompetencia.responsableId`.

- [ ] **Step 1: Declarar el enum, la columna y la tabla**

En `schema.prisma`, junto a los demás enums de `mejora_continua`:

```prisma
/// RF-PE-028. Cerrado y no texto libre: RN1 exige una indicación por grupo y
/// año, y con texto libre «Docentes» y «docentes» serían dos grupos distintos
/// y el índice único no protegería nada. Sin OTRO a propósito: dos «OTRO» en
/// el mismo año chocarían contra el único sin que se entienda por qué.
enum GrupoObjetivo {
  EGRESADOS
  EMPLEADORES
  DOCENTES
  ESTUDIANTES

  @@schema("mejora_continua")
}
```

En `model ConfiguracionCompetencia`, tras `frecuencia`:

```prisma
  /// RF-PE-024. UUID de una cuenta de cualquier rol —quien aplica una encuesta
  /// a egresados suele ser un coordinador, no un docente—, sin clave foránea:
  /// el registro debe seguir siendo legible aunque la cuenta desaparezca,
  /// igual que `docenteId` en AsignaturaEvaluada.
  responsableId String? @map("responsable_id") @db.Uuid
```

Y el modelo nuevo:

```prisma
model IndicacionDeMedicion {
  id               String @id @default(uuid()) @db.Uuid
  planEvaluacionId String @map("plan_evaluacion_id") @db.Uuid
  /// El periodo —el «año», en un plan indirecto— es un UUID del plan de
  /// medición base, sin FK, como en MedicionAlcanzada.
  periodoId        String @map("periodo_id") @db.Uuid

  grupoObjetivo     GrupoObjetivo @map("grupo_objetivo")
  instruccion       String        @db.VarChar(1000)
  /// RF-PE-029 RN1: el del instrumento es obligatorio; el de resultados no,
  /// «puede completarse después» — por eso vive del lado del seguimiento.
  enlaceInstrumento String        @map("enlace_instrumento") @db.VarChar(500)
  enlaceResultados  String?       @map("enlace_resultados") @db.VarChar(500)

  plan PlanEvaluacion @relation(fields: [planEvaluacionId], references: [id], onDelete: Cascade)

  /// RF-PE-028 RN1: «una por cada grupo objetivo» y año. Sin índice aparte
  /// sobre (plan, periodo): las consultas van por esas dos y este único ya
  /// sirve de prefijo.
  @@unique([planEvaluacionId, periodoId, grupoObjetivo])
  @@map("indicacion_medicion")
  @@schema("mejora_continua")
}
```

En `model PlanEvaluacion`, añade la relación inversa: `indicaciones IndicacionDeMedicion[]`.

- [ ] **Step 2: Generar la migración y añadirle a mano el índice de Evidencia**

```bash
cd apps/api && npx prisma migrate dev --name indicaciones_y_responsable --create-only
```

Al final del `migration.sql` generado, añade:

```sql
-- Deuda de 2c-B, dictaminada para este ciclo por ser el siguiente que toca el
-- esquema. `Evidencia` es la única de las cuatro tablas de aquel ciclo cuya
-- clave foránea no encabeza ningún índice: las otras tres lo obtienen gratis
-- de su UNIQUE. Afecta al DELETE CASCADE y al deleteMany que
-- `reemplazarEvidencias` ejecuta en cada guardado.
CREATE INDEX "evidencia_asignatura_evaluada_id_idx"
  ON "mejora_continua"."evidencia" ("asignatura_evaluada_id");
```

Añade el mismo `@@index([asignaturaEvaluadaId])` al modelo `Evidencia` del
esquema, para que no se desincronicen.

- [ ] **Step 3: Aplicar y generar el cliente**

```bash
cd apps/api && npx prisma migrate deploy && npx prisma generate
```

`migrate deploy`, no `migrate reset`: Prisma 7 lo bloquea.

- [ ] **Step 4: Las pruebas de integración**

En `indicaciones.int.spec.ts`, con el `beforeEach` que trunca —copia el de
`documentos-medicion.int.spec.ts`, y **trunca también `auth.usuarios`**, que en
2c-B se olvidó:

```ts
it('no admite dos indicaciones del mismo grupo en el mismo año', async () => {
  await crear({ grupoObjetivo: 'EGRESADOS' });
  await expect(crear({ grupoObjetivo: 'EGRESADOS' })).rejects.toThrow();
});

it('el mismo grupo en años distintos sí', async () => {
  await crear({ grupoObjetivo: 'EGRESADOS', periodoId: anio2026 });
  await expect(crear({ grupoObjetivo: 'EGRESADOS', periodoId: anio2027 })).resolves.toBeDefined();
});

it('borrar el plan se lleva sus indicaciones', async () => {
  await crear({ grupoObjetivo: 'DOCENTES' });
  await prisma.planEvaluacion.delete({ where: { id: planId } });
  expect(await prisma.indicacionDeMedicion.count()).toBe(0);
});

it('borrar una indicación no toca el porcentaje del año', async () => {
  // RF-PE-030 RN1, y la razón de que las indicaciones cuelguen del año y no
  // del cruce: si colgaran de MedicionAlcanzada, borrarlas lo arrastraría.
  await prisma.medicionAlcanzada.create({
    data: { planEvaluacionId: planId, competenciaId: comp, periodoId: anio2026, porcentajeAlcanzado: 80 },
  });
  const i = await crear({ grupoObjetivo: 'EMPLEADORES' });
  await prisma.indicacionDeMedicion.delete({ where: { id: i.id } });

  const m = await prisma.medicionAlcanzada.findFirst({ where: { planEvaluacionId: planId } });
  expect(m?.porcentajeAlcanzado).toBe(80);
});
```

- [ ] **Step 5: Ejecutarlas**

```bash
cd apps/api && export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d'"' -f2 | sed 's|/sgc?|/sgc_test?|') && npx vitest run --config vitest.integration.config.ts test/integration/indicaciones.int.spec.ts
```

- [ ] **Step 6: Comprobar que el único es real**

Contra la base de pruebas, `\d mejora_continua.indicacion_medicion`. Confirma
que el índice único está sobre las **tres** columnas y en ese orden. Si lo
recreas sin `grupo_objetivo` para mutarlo, la primera prueba debe caer.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Las indicaciones de medición, y el responsable por competencia"
```

---

## Task 3: El puerto y el repositorio

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/ports/configuracion-evaluacion.port.ts`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/persistence/configuracion-evaluacion.repository.ts`
- Test: `apps/api/test/integration/configuracion-evaluacion.int.spec.ts`

**Interfaces:**
- Consumes: el modelo y el enum de la Task 2.
- Produces, para la Task 4:

```ts
export type GrupoObjetivo = 'EGRESADOS' | 'EMPLEADORES' | 'DOCENTES' | 'ESTUDIANTES';

export interface DatosIndicacion {
  readonly id: string;
  readonly periodoId: string;
  readonly grupoObjetivo: GrupoObjetivo;
  readonly instruccion: string;
  readonly enlaceInstrumento: string;
  readonly enlaceResultados: string | null;
}
```

`DatosConfiguracionCompetencia` gana `readonly responsableId: string | null;`
y `ConfiguracionDelPlan` gana `readonly indicaciones: readonly DatosIndicacion[];`.

Tres métodos nuevos en `RepositorioConfiguracionEvaluacionPort`:

```ts
  /**
   * RF-PE-028 a RF-PE-030. **Reemplaza el conjunto entero del año**: las que no
   * vengan se borran. Editar es mandar la lista con el texto cambiado;
   * eliminar, mandarla sin esa entrada.
   *
   * Conserva `enlaceResultados` de las que sobreviven, emparejando por grupo
   * objetivo: el enlace a resultados es seguimiento y lo escribe otro endpoint,
   * así que reemplazar la definición no puede tirarlo.
   */
  reemplazarIndicaciones(
    planEvaluacionId: string,
    periodoId: string,
    indicaciones: readonly {
      grupoObjetivo: GrupoObjetivo;
      instruccion: string;
      enlaceInstrumento: string;
    }[],
  ): Promise<void>;

  /** RF-PE-029. Solo el enlace a resultados; lo demás es definición. */
  guardarResultados(indicacionId: string, enlaceResultados: string | null): Promise<void>;

  /** Para resolver el plan desde la ruta que no lo lleva. */
  planDeIndicacion(indicacionId: string): Promise<string | null>;
```

- [ ] **Step 1: La prueba que fija la conducta delicada**

```ts
it('reemplazar las indicaciones conserva el enlace a resultados de las que siguen', async () => {
  // El enlace a resultados es seguimiento y lo escribe otro endpoint. Si
  // reemplazar la definición lo tirara, alguien perdería el enlace al pulsar
  // «Guardar» sin haber tocado esa fila.
  await repo.reemplazarIndicaciones(planId, anio, [
    { grupoObjetivo: 'EGRESADOS', instruccion: 'Encuesta anual', enlaceInstrumento: 'https://e.test/f' },
  ]);
  const [i] = (await repo.del(planId)).indicaciones;
  await repo.guardarResultados(i!.id, 'https://e.test/r');

  await repo.reemplazarIndicaciones(planId, anio, [
    { grupoObjetivo: 'EGRESADOS', instruccion: 'Encuesta anual v2', enlaceInstrumento: 'https://e.test/f' },
  ]);

  const [tras] = (await repo.del(planId)).indicaciones;
  expect(tras!.instruccion).toBe('Encuesta anual v2');
  expect(tras!.enlaceResultados).toBe('https://e.test/r');
});

it('reemplazar borra las que no vienen', async () => {
  await repo.reemplazarIndicaciones(planId, anio, [
    { grupoObjetivo: 'EGRESADOS', instruccion: 'A', enlaceInstrumento: 'https://e.test/a' },
    { grupoObjetivo: 'DOCENTES', instruccion: 'B', enlaceInstrumento: 'https://e.test/b' },
  ]);
  await repo.reemplazarIndicaciones(planId, anio, [
    { grupoObjetivo: 'EGRESADOS', instruccion: 'A', enlaceInstrumento: 'https://e.test/a' },
  ]);

  const grupos = (await repo.del(planId)).indicaciones.map((i) => i.grupoObjetivo);
  expect(grupos).toEqual(['EGRESADOS']);
});

it('reemplazar un año no toca los otros años', async () => {
  await repo.reemplazarIndicaciones(planId, anio2026, [
    { grupoObjetivo: 'EGRESADOS', instruccion: 'A', enlaceInstrumento: 'https://e.test/a' },
  ]);
  await repo.reemplazarIndicaciones(planId, anio2027, []);

  expect((await repo.del(planId)).indicaciones).toHaveLength(1);
});

it('el responsable viaja de ida y vuelta', async () => {
  await repo.guardarCompetencia({
    planEvaluacionId: planId, competenciaId: comp,
    instrumento: 'Encuesta', frecuencia: 'Anual', responsableId: RESPONSABLE,
  });
  expect((await repo.del(planId)).competencias[0]!.responsableId).toBe(RESPONSABLE);
});
```

- [ ] **Step 2: Verlas fallar**

Esperado: no compila — `reemplazarIndicaciones` no existe.

- [ ] **Step 3: Implementar**

`reemplazarIndicaciones` en una transacción, **borrando solo las que no vienen**
y actualizando las que sobreviven, nunca borrando todo y recreando —eso tiraría
`enlaceResultados`:

```ts
  async reemplazarIndicaciones(planEvaluacionId, periodoId, indicaciones) {
    const grupos = indicaciones.map((i) => i.grupoObjetivo);
    await this.prisma.$transaction(async (tx) => {
      await tx.indicacionDeMedicion.deleteMany({
        where: { planEvaluacionId, periodoId, grupoObjetivo: { notIn: grupos } },
      });
      for (const i of indicaciones) {
        await tx.indicacionDeMedicion.upsert({
          where: {
            planEvaluacionId_periodoId_grupoObjetivo: {
              planEvaluacionId, periodoId, grupoObjetivo: i.grupoObjetivo,
            },
          },
          create: { planEvaluacionId, periodoId, ...i },
          update: { instruccion: i.instruccion, enlaceInstrumento: i.enlaceInstrumento },
        });
      }
    });
  }
```

El `update` **no menciona `enlaceResultados`**: por eso sobrevive.

`del()` añade la lectura de indicaciones con `orderBy: [{ periodoId: 'asc' }, { grupoObjetivo: 'asc' }]`.

- [ ] **Step 4: Verlas pasar y mutar**

Ejecuta. Después comprueba por mutación: cambia el `update` para que incluya
`enlaceResultados: null` y confirma que **solo** cae la primera prueba; cambia
el `deleteMany` a borrar todo y confirma que también cae. Restaura.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "El repositorio aprende a guardar indicaciones y responsables"
```

---

## Task 4: El caso de uso

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.use-case.ts`
- Test: `apps/api/src/modules/mejora-continua/evaluacion/application/use-cases/configurar-plan-evaluacion.spec.ts`

**Interfaces:**
- Consumes: los tres métodos de la Task 3. El constructor **no cambia**; su
  orden real es `(evaluaciones, mediciones, curricular, configuraciones,
  directorio, autorizacion, eventos)`.
- Produces, para la Task 5:

```ts
  guardarCompetencia(actor, planEvaluacionId, competenciaId,
    datos: { instrumento: string | null; frecuencia: string | null; responsableId: string | null }): Promise<void>;

  guardarIndicaciones(actor, planEvaluacionId, periodoId,
    indicaciones: readonly { grupoObjetivo: GrupoObjetivo; instruccion: string; enlaceInstrumento: string }[]): Promise<void>;

  guardarResultados(actor, indicacionId, enlaceResultados: string | null): Promise<void>;
```

- [ ] **Step 1: Las pruebas**

```ts
it('las indicaciones son definición: solo en Borrador', async () => {
  for (const estado of ['En revisión', 'Aprobado', 'Vigente', 'Histórico'] as const) {
    plan.estado = estado;
    await expect(
      casos.guardarIndicaciones(ACTOR, 'ev-1', 'anio-1', [INDICACION]),
    ).rejects.toThrow(ReglaDeNegocioViolada);
  }
});

it('el enlace a resultados es seguimiento: Borrador y Vigente', async () => {
  // RF-PE-029 RN1: «puede completarse después». Sin esta excepción, el
  // resultado de una encuesta cerrada no podría registrarse nunca.
  for (const estado of ['Borrador', 'Vigente'] as const) {
    plan.estado = estado;
    await expect(
      casos.guardarResultados(ACTOR, 'ind-1', 'https://e.test/r'),
    ).resolves.toBeUndefined();
  }
  for (const estado of ['En revisión', 'Aprobado', 'Histórico'] as const) {
    plan.estado = estado;
    await expect(casos.guardarResultados(ACTOR, 'ind-1', 'https://e.test/r'))
      .rejects.toThrow(ReglaDeNegocioViolada);
  }
});

it('un plan directo no acepta indicaciones', async () => {
  base.tipo = 'DIRECTA';
  await expect(casos.guardarIndicaciones(ACTOR, 'ev-1', 'anio-1', [INDICACION]))
    .rejects.toThrow(/DIRECTA/);
});

it('un plan indirecto no acepta asignaturas', async () => {
  base.tipo = 'INDIRECTA';
  await expect(casos.guardarAsignaturas(ACTOR, 'ev-1', 'c-1', 'anio-1', []))
    .rejects.toThrow(/INDIRECTA/);
});

it('las indicaciones solo caben en un año que la matriz programó', async () => {
  await expect(casos.guardarIndicaciones(ACTOR, 'ev-1', 'anio-inventado', [INDICACION]))
    .rejects.toThrow(ReglaDeNegocioViolada);
});

it('el responsable se guarda tal cual llega', async () => {
  await casos.guardarCompetencia(ACTOR, 'ev-1', 'c-1',
    { instrumento: 'Encuesta', frecuencia: 'Anual', responsableId: 'u-9' });
  expect(configuraciones.guardarCompetencia).toHaveBeenCalledWith(
    expect.objectContaining({ responsableId: 'u-9' }),
  );
});

it('cada guardado deja constancia', async () => {
  await casos.guardarIndicaciones(ACTOR, 'ev-1', 'anio-1', [INDICACION]);
  expect(publicados.at(-1)?.nombre).toBe('evaluacion.configurada');
});

it('y el enlace a resultados también', async () => {
  await casos.guardarResultados(ACTOR, 'ind-1', 'https://e.test/r');
  expect(publicados.at(-1)?.nombre).toBe('evaluacion.configurada');
});
```

Las dos últimas no son adorno: en 2c-B, quitar `dejarConstancia` de tres de los
cuatro guardados dejó las 758 pruebas en verde.

- [ ] **Step 2: Verlas fallar**

- [ ] **Step 3: Implementar**

`guardarIndicaciones` usa `exigirDefinicionEditable`; `guardarResultados`,
`exigirSeguimientoEditable`. **No añadas un tercer guardián.**

`guardarResultados` resuelve el plan con `planDeIndicacion` —la ruta no lo
lleva— y lanza `NoEncontrado` si es `null`.

La comprobación de tipo va en un privado nuevo:

```ts
  /**
   * Un plan hereda el tipo de su base y no lo cambia. Sin esto, un plan directo
   * acumularía indicaciones que su pantalla no muestra y su exportación no
   * imprime: datos huérfanos que nadie vuelve a ver.
   */
  private exigirTipo(base: DatosPlanMedicion, esperado: 'DIRECTA' | 'INDIRECTA'): void {
    if (base.tipo !== esperado) {
      throw new ReglaDeNegocioViolada(
        `El plan de medición base es de tipo ${base.tipo}; esta configuración solo cabe en un plan ${esperado}.`,
      );
    }
  }
```

`guardarIndicaciones` reutiliza `exigirCruceProgramado`, pero el año se comprueba
contra los **periodos** de la base y no contra un cruce competencia×periodo:
añade `exigirPeriodoDeLaBase(base, periodoId)`, que falla si
`base.periodos.every((p) => p.id !== periodoId)`.

- [ ] **Step 4: Verlas pasar**

- [ ] **Step 5: Cuatro mutaciones**

| Mutación | Debe caer |
|---|---|
| `guardarIndicaciones` usa `exigirSeguimientoEditable` | «las indicaciones son definición» |
| `guardarResultados` usa `exigirDefinicionEditable` | «el enlace a resultados es seguimiento» |
| `exigirTipo` no lanza nunca | las dos de tipo |
| Quitar `dejarConstancia` de `guardarIndicaciones` | «cada guardado deja constancia» |

Cada una debe caer **sola**. En los bucles de estados, comprueba que falla en la
iteración que toca y no en la primera — si no, el bucle no está recorriendo.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "El caso de uso de la configuración indirecta"
```

---

## Task 5: Los endpoints

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/dto/configuracion-evaluacion.dto.ts`
- Modify: `apps/api/src/modules/mejora-continua/evaluacion/infrastructure/http/configuracion-evaluacion.controller.ts`
- Modify: el módulo Nest que registra los controladores

**Interfaces:**
- Consumes: los tres métodos de la Task 4.
- Produces, para la Task 6:

| Verbo y ruta | Cuerpo |
|---|---|
| `PUT /planes-evaluacion/:planId/competencias/:competenciaId` | `{ instrumento, frecuencia, responsableId? }` |
| `PUT /planes-evaluacion/:planId/periodos/:periodoId/indicaciones` | `{ indicaciones: [...] }` |
| `PUT /indicaciones/:id/resultados` | `{ enlaceResultados?: string }` |

- [ ] **Step 1: Los DTO**

```ts
export class IndicacionDto {
  @ApiProperty({ enum: ['EGRESADOS', 'EMPLEADORES', 'DOCENTES', 'ESTUDIANTES'] })
  @IsIn(['EGRESADOS', 'EMPLEADORES', 'DOCENTES', 'ESTUDIANTES'])
  grupoObjetivo!: GrupoObjetivo;

  /** `@Recortado()` antes de medir: sin él, `"   "` supera el mínimo. */
  @ApiProperty() @Recortado() @IsString() @MinLength(1) @MaxLength(1000)
  instruccion!: string;

  /** RF-PE-029 RN1: obligatorio, y un enlace que no es un enlace no sirve. */
  @ApiProperty() @IsUrl({ require_protocol: true }) @MaxLength(500)
  enlaceInstrumento!: string;
}

export class IndicacionesDelAnioDto {
  @ApiProperty({ type: [IndicacionDto] })
  @IsArray()
  // Son cuatro grupos objetivo: más de cuatro entradas es un error de carga.
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => IndicacionDto)
  indicaciones!: IndicacionDto[];
}

export class ResultadosDto {
  /** Opcional: RF-PE-029 RN1 permite completarlo después, o vaciarlo. */
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(500)
  enlaceResultados?: string;
}
```

`ConfiguracionCompetenciaDto` gana `@ApiPropertyOptional() @IsOptional() @IsUUID() responsableId?: string;`.

- [ ] **Step 2: El controlador**

En `ConfiguracionEvaluacionController`:

```ts
  @Put('periodos/:periodoId/indicaciones')
  @ApiOperation({ summary: 'Las indicaciones de un año (RF-PE-028 a RF-PE-030)' })
  @ApiResponse({ status: 409, description: 'El plan no es Indirecta, o el año no está en la matriz' })
  async indicaciones(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('periodoId', ParseUUIDPipe) periodoId: string,
    @Body() dto: IndicacionesDelAnioDto,
    @ActorActual() actor: Actor,
  ) {
    return this.casos.guardarIndicaciones(actor, planId, periodoId, dto.indicaciones);
  }
```

Y un controlador aparte, calcado de `EvidenciasController`:

```ts
/**
 * Cuelga de la indicación y **no lleva `planEvaluacionId`**: el caso de uso lo
 * resuelve con `planDeIndicacion`. Lo que eso cierra por construcción es que no
 * se pueda aplicar el estado de otro plan al que se manda en la ruta —pasar un
 * Borrador propio para escribir sobre una indicación de un plan Histórico—.
 * El control por carrera lo da la política de autorización, no esta forma.
 */
@ApiTags('Planes de evaluación')
@ApiBearerAuth()
@Controller('indicaciones/:id')
export class ResultadosController {
  constructor(private readonly casos: ConfigurarPlanEvaluacion) {}

  @Put('resultados')
  @ApiOperation({ summary: 'El enlace a los resultados de una indicación (RF-PE-029)' })
  async resultados(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResultadosDto,
    @ActorActual() actor: Actor,
  ) {
    return this.casos.guardarResultados(actor, id, dto.enlaceResultados ?? null);
  }
}
```

Registra `ResultadosController` en el módulo, junto a `EvidenciasController`.

**Corrige la cabecera del fichero:** ahora son **seis** `PUT`, repartidos 3+3
entre definición y seguimiento. En 2c-B esa cabecera se quedó desfasada y hubo
que volver.

- [ ] **Step 3: Comprobar en caliente**

```bash
cd apps/api && npm run build && node dist/main.js   # nunca tsx
```

Comprueba: 401 sin token; 400 con `grupoObjetivo: 'OTRO'`; 400 con
`enlaceInstrumento: 'drive.example'` (sin protocolo); 400 con `instruccion: '   '`;
404 en `/indicaciones/<uuid inexistente>/resultados`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Los endpoints de la configuración indirecta"
```

---

## Task 6: La pantalla

**Files:**
- Create: `apps/web/src/features/mejora-continua/components/ConfiguracionDelAnio.tsx`
- Create: `apps/web/src/features/mejora-continua/components/ConfiguracionDelAnio.test.tsx`
- Modify: `apps/web/src/features/mejora-continua/pages/PlanEvaluacionPage.tsx`
- Modify: `apps/web/src/features/mejora-continua/api/configuracion-evaluacion.api.ts` y `queries.ts`

**Interfaces:**
- Consumes: los tres endpoints de la Task 5.
- Produces, para la Task 7, los textos que el E2E busca **literales**:
  encabezado **«Configuración por competencia»**; selector **«Año a
  configurar»**; sección **«Indicaciones del año»**; botón **«Guardar el año»**;
  aviso con la palabra **«Guardado»**.

- [ ] **Step 1: Las mutaciones de React Query**

Primero los tipos, en `configuracion-evaluacion.api.ts`, espejo de los del
puerto de la Task 3:

```ts
export type GrupoObjetivo = 'EGRESADOS' | 'EMPLEADORES' | 'DOCENTES' | 'ESTUDIANTES';

/** Lo que se envía: sin `id`, que lo asigna el servidor. */
export interface IndicacionAGuardar {
  readonly grupoObjetivo: GrupoObjetivo;
  readonly instruccion: string;
  readonly enlaceInstrumento: string;
}

/** Lo que se recibe en `ConfiguracionDelPlan.indicaciones`. */
export interface Indicacion extends IndicacionAGuardar {
  readonly id: string;
  readonly periodoId: string;
  readonly enlaceResultados: string | null;
}

export async function guardarIndicaciones(
  planId: string, periodoId: string, indicaciones: readonly IndicacionAGuardar[],
): Promise<void> {
  return cliente.put(`/planes-evaluacion/${planId}/periodos/${periodoId}/indicaciones`,
    { indicaciones });
}

export async function guardarResultados(
  indicacionId: string, enlaceResultados: string | null,
): Promise<void> {
  return cliente.put(`/indicaciones/${indicacionId}/resultados`,
    { enlaceResultados: enlaceResultados ?? undefined });
}
```

`ConfiguracionDelPlan` gana `readonly indicaciones: readonly Indicacion[]`, y
`ConfiguracionCompetencia` gana `readonly responsableId: string | null`.

Y las mutaciones, con el **mismo `scope`** que las demás
(`{ id: 'plan-evaluacion:<id>' }`), que serializa los `PUT` del mismo plan:

```ts
export function useGuardarIndicaciones(planId: string) {
  return useMutacionDeConfiguracion(planId, (v: { periodoId: string; indicaciones: IndicacionAGuardar[] }) =>
    configuracionApi.guardarIndicaciones(planId, v.periodoId, v.indicaciones),
  );
}

export function useGuardarResultados(planId: string) {
  return useMutacionDeConfiguracion(planId, (v: { indicacionId: string; enlaceResultados: string | null }) =>
    configuracionApi.guardarResultados(v.indicacionId, v.enlaceResultados),
  );
}
```

- [ ] **Step 2: `PlanEvaluacionPage` ramifica por tipo**

```tsx
{periodoSeleccionado && configuracion && docentes ? (
  vista.tipo === 'INDIRECTA' ? (
    <ConfiguracionDelAnio key={periodoSeleccionado.id} … />
  ) : (
    <ConfiguracionDelPeriodo key={periodoSeleccionado.id} … />
  )
) : null}
```

`asignaturas` solo se pide para la directa: pasa `enabled: vista?.tipo === 'DIRECTA'`
a `useAsignaturasElegibles`, y quita `asignaturas` de la condición de arriba
—si no, un plan indirecto nunca pintaría la tarjeta.

- [ ] **Step 3: `ConfiguracionDelAnio`**

Calca de `ConfiguracionDelPeriodo` **el patrón de estado**, que costó dos rondas
de arreglos: visible y punto de comparación en un solo `useState`; conciliación
con la configuración refrescada **durante el renderizado**, no en un `useEffect`
(`react-hooks/set-state-in-effect` lo rechaza); y al terminar el guardado, la
base toma el **contenido** de lo enviado y la **identidad** del visible.

Lo que muestra: por competencia programada, instrumento, frecuencia,
**responsable** (selector del directorio) y porcentaje. Debajo, una sección
**«Indicaciones del año»** con hasta cuatro filas, una por grupo objetivo, cada
una con instrucción, enlace al instrumento y —solo si la fila ya tiene `id`—
enlace a resultados.

`editable` y `seguimientoEditable` salen de
`permiteEdicionDefinicionEvaluacion(plan.estado, puede('evaluacion.editar'))` y
`permiteEdicionSeguimientoEvaluacion(...)`, que ya existen. **Las dos, no solo
el estado:** en 2c-B se olvidó el permiso y un lector rellenaba el formulario
entero para perderlo al guardar.

**Nombres accesibles con contexto en la etiqueta visible, todos desde el
principio:** `Instrumento de CPE-01`, `Responsable de CPE-01`,
`Instrucción para EGRESADOS`, `Enlace al instrumento para EGRESADOS`. En 2c-B
se aplicó a la mitad de los campos y hubo que volver.

- [ ] **Step 4: Las pruebas de componente**

Usa un ayudante `montar(props?)` que devuelva los `vi.fn()`, como hace
`ConfiguracionDelPeriodo.test.tsx`.

```tsx
it('guarda solo lo que cambió, y a la competencia a la que le cambió', async () => {
  const p = montar();  // dos competencias programadas: CPE-01 y CPE-02
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Instrumento de CPE-02' }), 'Encuesta',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

  expect(p.onGuardarCompetencia).toHaveBeenCalledTimes(1);
  expect(p.onGuardarCompetencia).toHaveBeenCalledWith('c-2',
    expect.objectContaining({ instrumento: 'Encuesta' }));
});

it('no envía nada si no se tocó nada', async () => {
  const p = montar();
  await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

  expect(p.onGuardarCompetencia).not.toHaveBeenCalled();
  expect(p.onGuardarIndicaciones).not.toHaveBeenCalled();
});

it('una indicación sin instrucción no se envía, pero las completas del año sí', async () => {
  const p = montar();
  await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' }), 'EGRESADOS');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' }), 'Encuesta anual');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Enlace al instrumento para EGRESADOS' }),
    'https://e.test/f');

  // La segunda queda a medias: sin instrucción.
  await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 2' }), 'DOCENTES');

  await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

  expect(p.onGuardarIndicaciones).toHaveBeenCalledWith('anio-1', [
    { grupoObjetivo: 'EGRESADOS', instruccion: 'Encuesta anual',
      enlaceInstrumento: 'https://e.test/f' },
  ]);
});

it('en un plan Vigente el enlace a resultados se edita y la instrucción no', async () => {
  montar({ editable: false, seguimientoEditable: true, configuracion: CON_UNA_INDICACION });

  expect(screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' })).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Enlace a los resultados para EGRESADOS' }),
  ).toBeEnabled();
});

it('el enlace a resultados no aparece en una indicación aún sin guardar', async () => {
  montar();
  await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));

  expect(
    screen.queryByRole('textbox', { name: /Enlace a los resultados/ }),
  ).not.toBeInTheDocument();
});

it('lo que el usuario escribió después de guardar no se pisa', async () => {
  const p = montar();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Instrumento de CPE-01' }), 'Encuesta');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

  await userEvent.type(
    screen.getByRole('textbox', { name: 'Frecuencia de CPE-01' }), 'Anual');
  p.conConfiguracion(CON_EL_INSTRUMENTO_GUARDADO);   // llega el refresco

  expect(screen.getByRole('textbox', { name: 'Frecuencia de CPE-01' })).toHaveValue('Anual');
});

it('aunque la consulta se refresque antes de que el guardado resuelva', async () => {
  // El orden REAL: `onSettled` es async y se espera antes de que `mutateAsync`
  // resuelva, así que el doble debe provocar el rerender DENTRO de sí mismo,
  // antes de resolver su promesa. Una prueba que reenderice después prueba el
  // orden benigno y pasa aunque se pierdan datos: es el fallo exacto que 2c-B
  // dejó pasar una ronda entera.
  let refrescar: (c: ConfiguracionDelPlan) => void = () => {
    throw new Error('El guardado se disparó antes de montar el componente.');
  };
  const onGuardarIndicaciones = vi.fn(async () => {
    await Promise.resolve();
    refrescar(CON_LA_INDICACION_YA_GUARDADA);   // trae el `id` recién asignado
  });

  const p = montar({ onGuardarIndicaciones });
  refrescar = p.conConfiguracion;

  await userEvent.click(screen.getByRole('button', { name: 'Añadir indicación' }));
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' }), 'EGRESADOS');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Instrucción para EGRESADOS' }), 'Encuesta');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Enlace al instrumento para EGRESADOS' }),
    'https://e.test/f');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

  // Y ahora, sin recargar, los resultados de esa fila deben poder escribirse.
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Enlace a los resultados para EGRESADOS' }),
    'https://e.test/r');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar el año' }));

  expect(p.onGuardarResultados).toHaveBeenCalledWith('ind-1', 'https://e.test/r');
});
```

- [ ] **Step 5: Mutar**

Reduce `guardarAnio` a `setMensaje('Guardado.'); return;` — sin `PUT`. Debe caer
más de una. Si no cae ninguna, las pruebas no prueban el guardado.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "La pantalla de configuración del año"
```

---

## Task 7: De punta a punta

**Files:**
- Create: `tests/e2e/specs/configuracion-indirecta.spec.ts`
- Modify: `tests/e2e/specs/accesibilidad.spec.ts`
- Modify: `apps/api/scripts/preparar-e2e.ts`
- Modify: `CLAUDE.md`, `README.md`, `docs/requisitos/CAMBIOS-PARA-EL-DOCUMENTO-FUENTE.md`

- [ ] **Step 1: El fixture necesita un plan indirecto**

`preparar-e2e.ts` crea hoy un plan de medición **DIRECTA**. Añade uno
`INDIRECTA` con dos años (`2026`, `2027`), competencias cargadas y al menos un
cruce programado, y llévalo a Aprobado para que sea base elegible.

Respeta el **orden de borrado** por el `Restrict`, y comprueba que ejecutarlo
**dos veces seguidas** no falla.

- [ ] **Step 2: Dos recorridos**

```ts
test('configurar un año deja los demás intactos', async ({ page }) => {
  await abrirPlanIndirecto(page);
  await page.getByLabel('Año a configurar').selectOption({ label: '2026' });

  await page.getByRole('textbox', { name: 'Instrumento de CPE-01' }).fill('Encuesta');
  // El porcentaje TAMBIÉN se escribe: sin esto, la aserción sobre 2027 no
  // distingue «el porcentaje es por año» de «nunca se guardó». Es el defecto
  // exacto que 2c-B dejó pasar en su recorrido equivalente.
  await page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' }).fill('80');
  await page.getByRole('button', { name: 'Guardar el año' }).click();
  await expect(page.getByText(/Guardado/)).toBeVisible();

  await page.getByLabel('Año a configurar').selectOption({ label: '2027' });

  // El instrumento es común a todos los años (RF-PE-022 RN1): sigue puesto.
  await expect(page.getByRole('textbox', { name: 'Instrumento de CPE-01' }))
    .toHaveValue('Encuesta');
  // El porcentaje es por año (RF-PE-027): 2027 sigue vacío.
  await expect(page.getByRole('spinbutton', { name: 'Porcentaje alcanzado de CPE-01' }))
    .toHaveValue('');
});

test('un plan Vigente deja registrar resultados pero no cambiar la instrucción', async ({ page }) => {
  await abrirPlanIndirecto(page);
  await page.getByLabel('Año a configurar').selectOption({ label: '2026' });

  await page.getByRole('button', { name: 'Añadir indicación' }).click();
  await page.getByRole('combobox', { name: 'Grupo objetivo de la indicación 1' })
    .selectOption('EGRESADOS');
  await page.getByRole('textbox', { name: 'Instrucción para EGRESADOS' })
    .fill('Encuesta a egresados');
  await page.getByRole('textbox', { name: 'Enlace al instrumento para EGRESADOS' })
    .fill('https://forms.example/egresados');
  await page.getByRole('button', { name: 'Guardar el año' }).click();
  await expect(page.getByText(/Guardado/)).toBeVisible();

  // Borrador → En revisión → Aprobado → Vigente, con la cuenta que puede aprobar.
  await llevarAVigente(page);

  await expect(page.getByRole('textbox', { name: 'Instrucción para EGRESADOS' }))
    .toBeDisabled();
  await page.getByRole('textbox', { name: 'Enlace a los resultados para EGRESADOS' })
    .fill('https://drive.example/resultados');
  await page.getByRole('button', { name: 'Guardar el año' }).click();
  await expect(page.getByText(/Guardado/)).toBeVisible();
});
```

`abrirPlanIndirecto` y `llevarAVigente` son ayudantes del propio fichero.
`llevarAVigente` necesita una cuenta con `evaluacion.aprobar`: **`e2e-editor` no
la tiene** —es COORDINADOR_ACADEMICO—, usa `e2e-director`. Y ojo con el orden
alfabético de ficheros: `configuracion-indirecta.spec.ts` corre antes que
`evaluacion.spec.ts`, así que no dejes el plan compartido en un estado que aquel
no espere; crea el tuyo si hace falta.

- [ ] **Step 3: Accesibilidad**

Añade la pantalla del plan indirecto a `accesibilidad.spec.ts`, **con contenido
real**: selecciona un año y añade una indicación antes de analizar. En 2c-A se
analizó el estado vacío y `axe` no vio ningún campo.

- [ ] **Step 4: Los recuentos**

Ejecuta las tres suites y **usa las cifras que observes**, no las que este plan
predice. Actualiza:

- `CLAUDE.md` §1: `RF-PE` pasa de **28** a **37** de 49; el total, de **148** a
  **157** de 243, un **65 %**. Comprueba la aritmética: 60+13+47+37+0+0 = 157, y
  60+13+47+49+47+27 = 243.
- `README.md`: las cifras de las suites.
- Si algún requisito queda construido sin cita, anótalo en la lista de
  «construido sin cita» de `CLAUDE.md`, como se hizo con los cinco de 2c-A.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "La configuración indirecta, de punta a punta"
```
