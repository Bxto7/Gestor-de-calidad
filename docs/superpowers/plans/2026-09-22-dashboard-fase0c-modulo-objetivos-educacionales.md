# Fase 0c — Módulo `objetivos-educacionales` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar `ObjetivoEducacional` del módulo `plan-estudios` hacia un
módulo `objetivos-educacionales` de primer nivel, sin agregarle
`carreraId` (sigue siendo catálogo institucional) y sin romper a
`mejora-continua`, que hoy consume sus datos a través de un puerto
compartido con Criterio de acreditación.

**Architecture:** Módulo nuevo `objetivos-educacionales/` con
`domain/application/infrastructure` propios. El puerto cross-módulo que
hoy expone `plan-estudios` a `mejora-continua`
(`AcreditacionPort`/`acreditacion-cross-modulo.port.ts`) mezcla Criterio
(se queda en `plan-estudios`) y Objetivo (se muda) en una sola interfaz
— se divide en dos: `AcreditacionPort` se angosta a solo Criterio, y un
`ObjetivosCrossModuloPort` nuevo, propio de `objetivos-educacionales`,
cubre lo de Objetivo. El único consumidor real de los dos métodos de
Objetivo en `mejora-continua` (`GestionarPlanesMejora`, un solo archivo
— los otros dos que el `grep` inicial encontró solo lo mencionan en un
comentario) pasa a inyectar ambos puertos por separado.

**Tech Stack:** NestJS + Prisma 7 (`multiSchema`) + Vitest, sin
dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-22-dashboard-fase0-fundacion-design.md`
(§2.3, §2.4, §2.5, §2.6, §4.2 — tercera de las cinco piezas de la Fase 0).
Depende de que el molde de `academico` (Fase 0b, plan hermano) ya esté
construido — no como prerrequisito de código (los dos módulos no se
tocan entre sí), sino porque este plan replica exactamente su patrón de
migración de schema, puerto cross-módulo y test de guardia.

## Global Constraints

- TypeScript estricto, sin `any` sin justificar (CLAUDE.md §2).
- Un módulo nunca importa el repositorio ni las entidades de otro
  directamente — solo por puerto expuesto explícitamente (CLAUDE.md §3.1).
- Las migraciones de base de datos van siempre por Prisma Migrate
  (CLAUDE.md §2).
- Cobertura `domain/`/`application/` ≥80% (RNF del proyecto).
- `ObjetivoEducacional` **no** gana `carreraId` — sigue siendo catálogo
  institucional compartido, decisión ya tomada (§2.3 del spec de Fase 0,
  RF-PJ-023 RN1 ya lo documenta así en el código actual).

---

### Task 1: Migración de Prisma — `ObjetivoEducacional` al schema `objetivos_educacionales`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_mueve_objetivo_educacional/migration.sql`
  (generado, no escrito a mano)

**Interfaces:**
- Produces: `ObjetivoEducacional` vive en
  `@@schema("objetivos_educacionales")`; la FK real
  `PlanObjetivo.objetivoId → ObjetivoEducacional.id` (`onDelete: Restrict`)
  se mantiene, cruzando schema. Consumido por todas las tareas siguientes.

- [ ] **Step 1: Agregar el schema al datasource**

En `apps/api/prisma/schema.prisma`, la línea de schemas (ya trae
`"academico"` si la Fase 0b corrió antes; si no, agrégalos juntos):

```prisma
  schemas  = ["auth", "plan_estudios", "auditoria", "mejora_continua", "academico", "objetivos_educacionales"]
```

- [ ] **Step 2: Mover `ObjetivoEducacional`**

El modelo está hoy en `apps/api/prisma/schema.prisma`
(`model ObjetivoEducacional`, busca `@@map("objetivos_educacionales")`
para ubicarlo exacto — el nombre de tabla ya coincide con el nuevo
nombre de schema, son cosas distintas, no lo confundas). Cambiar
`@@schema("plan_estudios")` por `@@schema("objetivos_educacionales")` —
nada más del cuerpo cambia.

La FK `PlanObjetivo.objetivoId → ObjetivoEducacional.id` no necesita
ningún cambio de sintaxis — Prisma `multiSchema` la permite cruzando
schemas. `PlanObjetivo` (la tabla puente) se queda en `plan_estudios`:
tiene FK real también hacia `PlanEstudios`, y es lógicamente parte del
plan, no del catálogo.

- [ ] **Step 3: Generar la migración**

```bash
cd apps/api && npx prisma migrate dev --name mueve_objetivo_educacional
```

Expected: `ALTER TABLE "plan_estudios"."objetivos_educacionales" SET SCHEMA "objetivos_educacionales"`
— no un `DROP`/`CREATE`. Si no es así, no apliques la migración; revisa
el Step 2 (mismo procedimiento de verificación que la Fase 0b, Task 1).

- [ ] **Step 4: Regenerar el cliente**

```bash
cd apps/api && npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(objetivos-educacionales): migra ObjetivoEducacional a su propio schema (Fase 0c)"
```

---

### Task 2: Dominio, puertos y caso de uso de `objetivos-educacionales`

**Files:**
- Create: `apps/api/src/modules/objetivos-educacionales/domain/value-objects/codigos.ts`
- Create: `apps/api/src/modules/objetivos-educacionales/domain/events/eventos-objetivo.ts`
- Create: `apps/api/src/modules/objetivos-educacionales/application/ports/objetivos.port.ts`
- Create: `apps/api/src/modules/objetivos-educacionales/application/ports/objetivos-cross-modulo.port.ts`
- Create: `apps/api/src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.ts`
- Test: `apps/api/src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.spec.ts`

**Interfaces:**
- Produces: `GestionarObjetivos`, `RepositorioObjetivoPort`,
  `DatosObjetivo`, `FiltroObjetivo`, `REPOSITORIO_OBJETIVO` (mismos
  nombres y forma que hoy en `plan-estudios`, salvo `FiltroObjetivo` que
  reemplaza al `FiltroCatalogo` compartido — ver Step 3).
  `ObjetivosCrossModuloPort` con `objetivosEducacionales(): Promise<DatosObjetivoMejora[]>`
  y `objetivoPorId(id): Promise<DatosObjetivoMejora | null>` — consumido
  por la Task 3 (adaptador) y por `mejora-continua` (Task 5).

Esta tarea trabaja en paralelo al código viejo de `plan-estudios` (no lo
borra todavía) — igual que la Fase 0b.

- [ ] **Step 1: Copia local de `limpiarNombre` y `siguienteCodigoObjetivo`**

Mismo criterio que ya se aplicó en la Fase 0b para `academico`: son
funciones puras sin ningún import, y el archivo original ya declara que
se comparten "literalmente" hacia el frontend — duplicar es el patrón
establecido, no importar cruzando el módulo.

```typescript
// apps/api/src/modules/objetivos-educacionales/domain/value-objects/codigos.ts

/**
 * Copia deliberada de `limpiarNombre` y `siguienteCodigoObjetivo` en
 * `plan-estudios/domain/value-objects/codigos.ts` — mismo criterio que
 * ya se aplicó para `academico` en la Fase 0b: son funciones puras sin
 * dependencias, duplicarlas es más simple y más aislado que importarlas
 * cruzando el módulo.
 */

/** RF034 — OE-01, OE-02… */
export function siguienteCodigoObjetivo(codigosExistentes: readonly string[]): string {
  return correlativo('OE', codigosExistentes);
}

function correlativo(prefijo: string, codigosExistentes: readonly string[]): string {
  const numeros = codigosExistentes
    .filter((c) => c.startsWith(`${prefijo}-`))
    .map((c) => Number.parseInt(c.slice(prefijo.length + 1), 10))
    .filter((n) => Number.isFinite(n));

  const siguiente = numeros.length === 0 ? 1 : Math.max(...numeros) + 1;
  return `${prefijo}-${String(siguiente).padStart(2, '0')}`;
}

export function limpiarNombre(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}
```

- [ ] **Step 2: Eventos propios de Objetivo**

El original (`eventos-catalogo.ts`, en `plan-estudios`) declara 4 clases
genéricas (`ElementoCatalogoCreado`, `ElementoCatalogoEditado`,
`ElementoCatalogoEstadoCambiado`, `ElementoCatalogoEliminado`)
compartidas entre Objetivo y Competencia, parametrizadas por un string
`tipo: 'Objetivo' | 'Competencia'`. Ya en su propio módulo, Objetivo no
necesita ese discriminador — nunca va a construir el evento con
`'Competencia'`. Se declaran versiones propias, más simples, sin el
parámetro `tipo`. Antes de escribir esto, lee
`apps/api/src/modules/plan-estudios/domain/events/eventos-catalogo.ts`
completo para replicar exactamente el texto de cada `detalle` (el
`nombre` del evento y el formato del mensaje deben seguir siendo
reconocibles en la bitácora, aunque la clase cambie de nombre):

```typescript
// apps/api/src/modules/objetivos-educacionales/domain/events/eventos-objetivo.ts

/**
 * Eventos de dominio de Objetivo Educacional.
 *
 * Movido de `plan-estudios/domain/events/eventos-catalogo.ts` (Fase 0c).
 * Ahí eran 4 clases genéricas compartidas con Competencia, parametrizadas
 * por un `tipo: 'Objetivo' | 'Competencia'` — ya en su propio módulo, ese
 * discriminador no hace falta: estas 4 son solo para Objetivo.
 */

import { DomainEvent, type Actor } from '../../../../shared-kernel/domain-events/domain-event.js';

export class ObjetivoCreado extends DomainEvent {
  readonly nombre = 'objetivo.creado';
  readonly entidad = 'ObjetivoEducacional' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreObjetivo: string,
  ) {
    super(actor);
    this.detalle = `Objetivo educacional ${codigo} "${nombreObjetivo}" registrado.`;
  }
}

export class ObjetivoEditado extends DomainEvent {
  readonly nombre = 'objetivo.editado';
  readonly entidad = 'ObjetivoEducacional' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreAntes: string,
    nombreDespues: string,
    descripcionCambio: boolean,
  ) {
    super(actor);
    const partes = [
      nombreAntes !== nombreDespues ? `nombre: "${nombreAntes}" → "${nombreDespues}"` : null,
      descripcionCambio ? 'descripción actualizada' : null,
    ].filter((p): p is string => p !== null);
    this.detalle = `Objetivo educacional ${codigo}: ${partes.length > 0 ? partes.join(', ') : 'sin cambios detectables'}.`;
  }
}

export class ObjetivoEstadoCambiado extends DomainEvent {
  readonly nombre = 'objetivo.estado';
  readonly entidad = 'ObjetivoEducacional' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    activo: boolean,
    planesVinculados: number,
  ) {
    super(actor);
    this.detalle =
      `Objetivo educacional ${codigo} ${activo ? 'reactivado' : 'inactivado'}` +
      (planesVinculados > 0 ? ` (${planesVinculados} plan(es) vinculado(s)).` : '.');
  }
}

export class ObjetivoEliminado extends DomainEvent {
  readonly nombre = 'objetivo.eliminado';
  readonly entidad = 'ObjetivoEducacional' as const;
  readonly detalle: string;

  constructor(
    actor: Actor,
    readonly entidadId: string,
    codigo: string,
    nombreObjetivo: string,
  ) {
    super(actor);
    this.detalle = `Objetivo educacional ${codigo} "${nombreObjetivo}" eliminado.`;
  }
}
```

**Verificación de contenido, antes de seguir:** compara el `detalle` que
acabas de escribir contra lo que produce `ElementoCatalogoCreado`/
`ElementoCatalogoEditado`/`ElementoCatalogoEstadoCambiado`/
`ElementoCatalogoEliminado` del archivo original **cuando se les llama
con `tipo: 'Objetivo'`** — si el texto que arma alguna de las 4 clases
originales para el caso Objetivo difiere de lo que escribiste arriba
(revisa sobre todo `ElementoCatalogoEditado`, que es la más compleja),
ajusta el texto para que coincida — la bitácora existente no debe
cambiar de forma para las filas ya escritas, y las nuevas deben leerse
igual que las viejas.

- [ ] **Step 3: Puerto `objetivos.port.ts`**

```typescript
// apps/api/src/modules/objetivos-educacionales/application/ports/objetivos.port.ts

/**
 * Puerto del catálogo de objetivos educacionales.
 *
 * Movido de `plan-estudios/application/ports/catalogo.port.ts` (Fase 0c)
 * — ahí compartía archivo con `RepositorioCompetenciaPort` bajo un
 * `FiltroCatalogo` genérico; aquí es `FiltroObjetivo`, mismo campo por
 * campo, sin el genérico que ya no hace falta con un solo consumidor.
 */

export interface DatosObjetivo {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly activo: boolean;
  readonly planesVinculados: number;
}

export interface FiltroObjetivo {
  readonly texto?: string;
  readonly activo?: boolean;
}

export interface RepositorioObjetivoPort {
  listar(filtro?: FiltroObjetivo): Promise<DatosObjetivo[]>;
  porId(id: string): Promise<DatosObjetivo | null>;
  codigos(): Promise<string[]>;
  crear(codigo: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  actualizar(id: string, nombre: string, descripcion: string): Promise<DatosObjetivo>;
  cambiarEstado(id: string, activo: boolean): Promise<DatosObjetivo>;
  eliminar(id: string): Promise<void>;
  existeNombre(nombre: string, idIgnorado?: string): Promise<boolean>;
}

export const REPOSITORIO_OBJETIVO = Symbol('RepositorioObjetivoPort');
```

Verifica contra `apps/api/src/modules/plan-estudios/application/ports/catalogo.port.ts`
(el `RepositorioObjetivoPort`/`DatosObjetivo` original, dentro de ese
archivo) que no falta ningún método ni campo — cópialo si tu lectura
difiere de lo que este Step trae arriba, el pliego puede haber quedado
desactualizado si alguien tocó ese puerto después de escribirse este
plan.

- [ ] **Step 4: Puerto cross-módulo**

```typescript
// apps/api/src/modules/objetivos-educacionales/application/ports/objetivos-cross-modulo.port.ts

/**
 * Lo único que `mejora-continua` puede saber de `objetivos-educacionales`
 * (CLAUDE.md §3.1) — mismo criterio que `AcreditacionPort` ya usaba para
 * la parte de Objetivo, ahora separado a su propio puerto porque
 * `ObjetivoEducacional` tiene su propio módulo (Fase 0c).
 *
 * `DatosObjetivoMejora` es intencionalmente idéntico en forma al tipo que
 * `AcreditacionPort` ya exponía para esto — no se le agrega ni quita
 * ningún campo, para no tocar la lógica de `GestionarPlanesMejora`
 * (Task 5), solo de dónde viene el tipo.
 */

export interface DatosObjetivoMejora {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
}

export interface ObjetivosCrossModuloPort {
  /** RF-PJ-023 RN1: catálogo global, sin acotar por carrera. */
  objetivosEducacionales(): Promise<DatosObjetivoMejora[]>;
  objetivoPorId(id: string): Promise<DatosObjetivoMejora | null>;
}

export const OBJETIVOS_CROSS_MODULO = Symbol('ObjetivosCrossModuloPort');
```

- [ ] **Step 5: Escribir el test que falla**

Copiar los `describe`/`it` de `GestionarObjetivos` desde
`apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`
a `apps/api/src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.spec.ts`
(deja los de `GestionarCompetencias` donde están — no se tocan en este
plan). Actualiza los imports:

- `from '../ports/catalogo.port.js'` → `from '../ports/objetivos.port.js'`
- `from '../../domain/events/eventos-catalogo.js'` → `from '../../domain/events/eventos-objetivo.js'`,
  y las referencias a `ElementoCatalogoCreado`/`ElementoCatalogoEditado`/
  `ElementoCatalogoEstadoCambiado`/`ElementoCatalogoEliminado` en las
  aserciones de los tests pasan a `ObjetivoCreado`/`ObjetivoEditado`/
  `ObjetivoEstadoCambiado`/`ObjetivoEliminado` — y donde el test original
  comprobaba el campo `tipo === 'Objetivo'` del evento genérico, esa
  aserción se elimina (las clases nuevas no tienen ese campo, ya no hace
  falta comprobarlo: el propio tipo de la clase ya lo distingue).
- `from '../../domain/value-objects/codigos.js'` → `from '../../domain/value-objects/codigos.js'`
  (misma ruta relativa, apunta al archivo nuevo del Step 1 — no cambia
  porque `objetivos-educacionales/domain/value-objects/` tiene la misma
  profundidad que `plan-estudios/domain/value-objects/`).
- El import de `AuthorizationPort` no cambia de ruta relativa (mismo
  nivel bajo `modules/`).

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales`
Expected: FAIL — `Cannot find module '../../application/use-cases/gestionar-objetivos.use-case.js'`.

- [ ] **Step 7: Crear `gestionar-objetivos.use-case.ts`**

```typescript
// apps/api/src/modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.ts

/**
 * Casos de uso de objetivos educacionales (RF033–RF039).
 *
 * Movido de `plan-estudios` (Fase 0c del dashboard por rol) — ver §2.4
 * del spec de Fase 0. Objetivo y Competencia compartían archivo y
 * eventos genéricos en `plan-estudios`; separados, cada uno vive en su
 * propio módulo con su propio vocabulario de eventos (ver
 * `eventos-objetivo.ts`, Task 2 Step 2).
 */

import type {
  Actor,
  PublicadorDeEventos,
} from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
  ReglaDeNegocioViolada,
} from '../../../../shared-kernel/errors/errores.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import {
  ObjetivoCreado,
  ObjetivoEditado,
  ObjetivoEliminado,
  ObjetivoEstadoCambiado,
} from '../../domain/events/eventos-objetivo.js';
import { limpiarNombre, siguienteCodigoObjetivo } from '../../domain/value-objects/codigos.js';
import type { DatosObjetivo, FiltroObjetivo, RepositorioObjetivoPort } from '../ports/objetivos.port.js';

export class GestionarObjetivos {
  constructor(
    private readonly objetivos: RepositorioObjetivoPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
  ) {}

  /** RF035 y RF039: listado con búsqueda sobre nombre y código. */
  async listar(actor: Actor, filtro?: FiltroObjetivo): Promise<DatosObjetivo[]> {
    await this.exigir(actor, 'objetivo.leer');
    return this.objetivos.listar(filtro);
  }

  async porId(actor: Actor, id: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.leer');
    const objetivo = await this.objetivos.porId(id);
    if (!objetivo) throw new NoEncontrado('el objetivo educacional', id);
    return objetivo;
  }

  /** RF033 y RF034: alta con código correlativo generado por el sistema. */
  async crear(actor: Actor, nombre: string, descripcion: string): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.gestionar');
    const limpio = await this.validar(nombre, descripcion);

    const codigo = siguienteCodigoObjetivo(await this.objetivos.codigos());
    const creado = await this.objetivos.crear(codigo, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([new ObjetivoCreado(actor, creado.id, creado.codigo, creado.nombre)]);
    return creado;
  }

  /** RF036: RN1 dice que el código no cambia al editar, y por eso no se toca. */
  async editar(
    actor: Actor,
    id: string,
    nombre: string,
    descripcion: string,
  ): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    const limpio = await this.validar(nombre, descripcion, id);
    const editado = await this.objetivos.actualizar(id, limpio.nombre, limpio.descripcion);

    await this.eventos.publicar([
      new ObjetivoEditado(
        actor,
        id,
        actual.codigo,
        actual.nombre,
        limpio.nombre,
        actual.descripcion !== limpio.descripcion,
      ),
    ]);
    return editado;
  }

  /** RF037: RN1 prohíbe el borrado físico por esta vía. */
  async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<DatosObjetivo> {
    await this.exigir(actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    const cambiado = await this.objetivos.cambiarEstado(id, activo);

    await this.eventos.publicar([
      new ObjetivoEstadoCambiado(actor, id, actual.codigo, activo, actual.planesVinculados),
    ]);
    return cambiado;
  }

  /** RF038: solo lo que no está vinculado a ningún plan. */
  async eliminar(actor: Actor, id: string): Promise<void> {
    await this.exigir(actor, 'objetivo.gestionar');

    const actual = await this.objetivos.porId(id);
    if (!actual) throw new NoEncontrado('el objetivo educacional', id);

    if (actual.planesVinculados > 0) {
      throw new ReglaDeNegocioViolada(
        `No se puede eliminar: ${actual.planesVinculados} plan(es) lo tienen asociado. ` +
          'Inactívalo si ya no debe usarse en planes nuevos.',
      );
    }

    await this.eventos.publicar([new ObjetivoEliminado(actor, id, actual.codigo, actual.nombre)]);
    await this.objetivos.eliminar(id);
  }

  private async validar(
    nombre: string,
    descripcion: string,
    idIgnorado?: string,
  ): Promise<{ nombre: string; descripcion: string }> {
    const limpio = limpiarNombre(nombre);
    const sumilla = descripcion.trim();

    if (!limpio) throw new ReglaDeNegocioViolada('El nombre del objetivo es obligatorio.');
    if (!sumilla) throw new ReglaDeNegocioViolada('La descripción del objetivo es obligatoria.');

    if (await this.objetivos.existeNombre(limpio, idIgnorado)) {
      throw new ReglaDeNegocioViolada('Ya existe otro objetivo educacional con ese nombre.');
    }
    return { nombre: limpio, descripcion: sumilla };
  }

  private async exigir(actor: Actor, permiso: string): Promise<void> {
    // Sin carrera: el catálogo es institucional, igual que la estructura académica.
    const decision = await this.autorizacion.puede(actor.id, permiso, null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
}
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales`
Expected: PASS, todos los casos migrados.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/objetivos-educacionales
git commit -m "feat(objetivos-educacionales): dominio, puertos y caso de uso (Fase 0c)"
```

---

### Task 3: Repositorio Prisma y adaptador cross-módulo

**Files:**
- Create: `apps/api/src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.ts`
- Create: `apps/api/src/modules/objetivos-educacionales/infrastructure/objetivos-cross-modulo.adapter.ts`
- Test: `apps/api/test/integration/objetivos-educacionales.int.spec.ts`

**Interfaces:**
- Consumes: `RepositorioObjetivoPort`, `ObjetivosCrossModuloPort` (Task 2).
- Produces: `ObjetivoRepositoryPrisma`, `ObjetivosCrossModuloAdapter`.
  Consumido por la Task 6 (wiring).

- [ ] **Step 1: Repositorio**

Copiar `ObjetivoRepositoryPrisma` desde
`apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts`
(la clase completa, con su función auxiliar `aObjetivo` y las dos
funciones compartidas `dondeTexto`/`dondeEstado` — cópialas también,
duplicadas, no las importes desde `plan-estudios`: son helpers privados
de 5 líneas cada una, sin exportar, mismo criterio de duplicación que el
resto de este plan) a
`apps/api/src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.ts`.
Actualiza el import de tipos a `from '../../application/ports/objetivos.port.js'`.
Sin cambios de contenido más allá de eso — a diferencia de `academico`,
este repositorio no tiene `$queryRaw` con nombre de schema explícito
(`existeNombre` usa `findFirst` normal de Prisma), así que no hace falta
tocar ninguna cadena SQL.

- [ ] **Step 2: Adaptador cross-módulo**

```typescript
// apps/api/src/modules/objetivos-educacionales/infrastructure/objetivos-cross-modulo.adapter.ts

/**
 * Implementa `ObjetivosCrossModuloPort` envolviendo `ObjetivoRepositoryPrisma`
 * — mismo espíritu que `AcreditacionAdapter` (que hacía esto mismo antes de
 * la Fase 0c, para Criterio y Objetivo juntos).
 */

import { Injectable } from '@nestjs/common';

import type { ObjetivosCrossModuloPort, DatosObjetivoMejora } from '../application/ports/objetivos-cross-modulo.port.js';
import { ObjetivoRepositoryPrisma } from './persistence/objetivos.repository.js';

@Injectable()
export class ObjetivosCrossModuloAdapter implements ObjetivosCrossModuloPort {
  constructor(private readonly objetivos: ObjetivoRepositoryPrisma) {}

  /** RF-PJ-023 RN1: sin filtro de estado — el requisito no lo pide. */
  async objetivosEducacionales(): Promise<DatosObjetivoMejora[]> {
    const filas = await this.objetivos.listar();
    return filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre }));
  }

  async objetivoPorId(id: string): Promise<DatosObjetivoMejora | null> {
    const fila = await this.objetivos.porId(id);
    if (!fila) return null;
    return { id: fila.id, codigo: fila.codigo, nombre: fila.nombre };
  }
}
```

- [ ] **Step 3: Test de integración**

Mismo patrón que el resto del proyecto (`new PrismaService()`, sin
Testcontainers dinámico):

```typescript
// apps/api/test/integration/objetivos-educacionales.int.spec.ts

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ObjetivoRepositoryPrisma } from '../../src/modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const objetivos = new ObjetivoRepositoryPrisma(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE objetivos_educacionales.objetivos_educacionales RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ObjetivoRepositoryPrisma', () => {
  it('crea con código correlativo y relee con planesVinculados en cero', async () => {
    const o = await objetivos.crear('OE-01', 'Formar profesionales íntegros', 'Descripción larga.');
    expect(o.activo).toBe(true);
    expect(o.planesVinculados).toBe(0);

    const releido = await objetivos.porId(o.id);
    expect(releido?.codigo).toBe('OE-01');
  });

  it('existeNombre distingue mayúsculas pero no las trata como el mismo nombre repetido', async () => {
    await objetivos.crear('OE-01', 'Formar profesionales íntegros', 'x');
    expect(await objetivos.existeNombre('formar profesionales íntegros')).toBe(true);
    expect(await objetivos.existeNombre('Otro nombre')).toBe(false);
  });

  it('codigos() devuelve todos los códigos existentes, para calcular el siguiente correlativo', async () => {
    await objetivos.crear('OE-01', 'Uno', 'x');
    await objetivos.crear('OE-02', 'Dos', 'x');
    expect((await objetivos.codigos()).sort()).toEqual(['OE-01', 'OE-02']);
  });
});
```

Confirma con el nombre real de la tabla (`@@map(...)` del modelo
`ObjetivoEducacional`, ya confirmado como `objetivos_educacionales` en
el Step 2 de la Task 1) antes de correr el `TRUNCATE` — si el nombre de
tabla no coincide exactamente, el `TRUNCATE` falla con un error claro,
no en silencio.

- [ ] **Step 4: Correr el test de integración**

```bash
cd apps/api && SGC_DB_DESECHABLE=1 DATABASE_URL="postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public" npx vitest run --config vitest.integration.config.ts test/integration/objetivos-educacionales.int.spec.ts
```
Expected: PASS, los 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/objetivos-educacionales/infrastructure apps/api/test/integration/objetivos-educacionales.int.spec.ts
git commit -m "feat(objetivos-educacionales): repositorio Prisma y adaptador cross-módulo (Fase 0c)"
```

---

### Task 4: Controller/DTO nuevos, y limpieza del lado `plan-estudios`

**Files:**
- Create: `apps/api/src/modules/objetivos-educacionales/infrastructure/http/objetivos.controller.ts`
- Create: `apps/api/src/modules/objetivos-educacionales/infrastructure/http/dto/objetivos.dto.ts`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.ts`
  (quita `GestionarObjetivos`, deja solo `GestionarCompetencias`)
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-catalogo.spec.ts`
  (quita los tests de `GestionarObjetivos`, ya movidos en la Task 2)
- Modify: `apps/api/src/modules/plan-estudios/application/ports/catalogo.port.ts`
  (quita `RepositorioObjetivoPort`/`DatosObjetivo`/`REPOSITORIO_OBJETIVO`)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/persistence/catalogo.repository.ts`
  (quita `ObjetivoRepositoryPrisma`/`aObjetivo`)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/catalogo.controller.ts`
  (quita `ObjetivosController`)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/http/dto/catalogo.dto.ts`
  (quita `DatosObjetivoDto`)
- Modify: `apps/api/src/modules/plan-estudios/domain/events/eventos-catalogo.ts`
  (deja las 4 clases genéricas — las sigue usando `GestionarCompetencias`
  con `tipo: 'Competencia'` — pero revisa si, una vez que solo
  `Competencia` las usa, el parámetro `tipo` se vuelve redundante; **no
  lo simplifiques en esta tarea** aunque lo notes: es una limpieza
  aparte, fuera de alcance de este plan, que toca código de Competencia
  que nadie pidió tocar)
- Modify: `apps/api/src/modules/plan-estudios/application/ports/acreditacion-cross-modulo.port.ts`
  (quita `DatosObjetivoMejora`/`objetivosEducacionales`/`objetivoPorId`
  de `AcreditacionPort`)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.ts`
  (quita la dependencia de `RepositorioObjetivoPort` y los dos métodos)
- Modify: `apps/api/src/modules/plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.spec.ts`
  (quita los tests de los dos métodos de Objetivo)

**Interfaces:**
- Consumes: `GestionarObjetivos` (Task 2).
- Produces: `ObjetivosController`. `AcreditacionPort` queda angosto
  (solo Criterio) — consumido por la Task 5, que es quien de verdad
  necesita este cambio reflejado en `mejora-continua`.

- [ ] **Step 1: Crear el DTO**

```typescript
// apps/api/src/modules/objetivos-educacionales/infrastructure/http/dto/objetivos.dto.ts

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { Recortado } from '../../../../../platform/http/recortado.js';

export class DatosObjetivoDto {
  @Recortado()
  @IsString()
  @Length(5, 300, { message: 'El nombre debe tener entre 5 y 300 caracteres.' })
  nombre!: string;

  // El objetivo educacional es lo que el programa promete que sus egresados
  // sabrán hacer: una descripción de dos palabras no describe nada, y es de las
  // primeras cosas que revisa una acreditación.
  @Recortado()
  @IsString()
  @Length(10, 5000, { message: 'La descripción debe tener al menos 10 caracteres.' })
  descripcion!: string;
}

/** RF039: búsqueda por texto, más filtro de estado. */
export class FiltroObjetivoDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;
}

export class CambiarEstadoObjetivoDto {
  @IsBoolean()
  activo!: boolean;
}
```

- [ ] **Step 2: Crear el controller**

```typescript
// apps/api/src/modules/objetivos-educacionales/infrastructure/http/objetivos.controller.ts

/**
 * Controller de objetivos educacionales. Movido de `plan-estudios`
 * (Fase 0c). Cuelga de la raíz (`/objetivos`), no de un plan: es
 * catálogo institucional, compartido por toda la universidad.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import { ActorActual } from '../../../auth/infrastructure/http/jwt.guard.js';
import { GestionarObjetivos } from '../../application/use-cases/gestionar-objetivos.use-case.js';
import { CambiarEstadoObjetivoDto, DatosObjetivoDto, FiltroObjetivoDto } from './dto/objetivos.dto.js';

@ApiTags('Objetivos educacionales')
@ApiBearerAuth()
@Controller('objetivos')
export class ObjetivosController {
  constructor(private readonly objetivos: GestionarObjetivos) {}

  @Get()
  @ApiOperation({
    summary: 'Listar objetivos educacionales',
    description: 'RF035 y RF039. Cada fila trae cuántos planes lo tienen asociado.',
  })
  async listar(@ActorActual() actor: Actor, @Query() filtro: FiltroObjetivoDto) {
    return this.objetivos.listar(actor, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un objetivo educacional' })
  @ApiResponse({ status: 404, description: 'El objetivo no existe.' })
  async detalle(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    return this.objetivos.porId(actor, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un objetivo educacional',
    description: 'RF033 y RF034. El código correlativo (OE-01…) lo genera el sistema.',
  })
  @ApiResponse({ status: 409, description: 'Ya existe otro objetivo con ese nombre.' })
  async crear(@ActorActual() actor: Actor, @Body() dto: DatosObjetivoDto) {
    return this.objetivos.crear(actor, dto.nombre, dto.descripcion);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar un objetivo educacional',
    description: 'RF036. RN1: el código autogenerado no cambia.',
  })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: DatosObjetivoDto,
  ) {
    return this.objetivos.editar(actor, id, dto.nombre, dto.descripcion);
  }

  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Activar o inactivar un objetivo educacional',
    description: 'RF037. RN1: no elimina el registro; los planes que ya lo usan lo conservan.',
  })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @ActorActual() actor: Actor,
    @Body() dto: CambiarEstadoObjetivoDto,
  ) {
    return this.objetivos.cambiarEstado(actor, id, dto.activo);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un objetivo educacional sin usar',
    description:
      'RF038. Solo si no está asociado a ningún plan: sirve para deshacer un ' +
      'alta equivocada, no para retirar algo en uso. Para eso está inactivar.',
  })
  @ApiResponse({ status: 409, description: 'Hay planes que lo tienen asociado.' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @ActorActual() actor: Actor) {
    await this.objetivos.eliminar(actor, id);
  }
}
```

- [ ] **Step 3: Quitar `GestionarObjetivos` de `plan-estudios`**

En `gestionar-catalogo.use-case.ts`, borrar la sección completa
`/* ── Objetivos educacionales ──── */` (la clase `GestionarObjetivos`
entera) — deja `GestionarCompetencias` y todo lo que usa en su lugar,
sin tocarlo. El import de `limpiarNombre`/`siguienteCodigoObjetivo` en
la cabecera del archivo cambia a solo `limpiarNombre` (Competencia
también lo usa) — quita `siguienteCodigoObjetivo` del import, ya no se
usa en este archivo. El import de
`ElementoCatalogoCreado`/`ElementoCatalogoEditado`/`ElementoCatalogoEstadoCambiado`/
`ElementoCatalogoEliminado` se queda igual — `GestionarCompetencias`
sigue usando las 4.

- [ ] **Step 4: Quitar los tests de `GestionarObjetivos` de `plan-estudios`**

En `gestionar-catalogo.spec.ts`, borrar el `describe` (o los `describe`)
que prueban `GestionarObjetivos` — ya viven en
`objetivos-educacionales/application/use-cases/gestionar-objetivos.spec.ts`
(Task 2). Deja los de `GestionarCompetencias`.

- [ ] **Step 5: Angostar `catalogo.port.ts`**

Quita de `apps/api/src/modules/plan-estudios/application/ports/catalogo.port.ts`:
`DatosObjetivo`, `RepositorioObjetivoPort`, `REPOSITORIO_OBJETIVO`. Deja
`FiltroCatalogo` (Competencia lo sigue usando) y todo lo de
`RepositorioCompetenciaPort`/`DatosCompetencia`/`DatosAtributo`/
`CoberturaAtributo`.

- [ ] **Step 6: Angostar `catalogo.repository.ts`**

Quita `ObjetivoRepositoryPrisma` y su función auxiliar `aObjetivo`.
`dondeTexto`/`dondeEstado` se quedan — `CompetenciaRepositoryPrisma`
también las usa.

- [ ] **Step 7: Angostar `catalogo.controller.ts`**

Quita la clase `ObjetivosController` completa. Deja `CompetenciasController`.
El import de `GestionarObjetivos`/`GestionarCompetencias` pasa a solo
`GestionarCompetencias`. El import de
`DatosObjetivoDto`/`DatosCompetenciaDto`/`FiltroCatalogoDto`/
`CambiarEstadoCatalogoDto` pierde `DatosObjetivoDto` — pero
`FiltroCatalogoDto`/`CambiarEstadoCatalogoDto` **se quedan**:
`CompetenciasController` los sigue usando (son los genéricos
compartidos con Objetivo, y aquí no se duplican porque el consumidor que
queda, Competencia, no se está moviendo — solo se duplicaron en la
Task 4 Step 1 para el lado que sí se mueve).

- [ ] **Step 8: Angostar `catalogo.dto.ts`**

Quita `DatosObjetivoDto`. Deja `DatosCompetenciaDto`, `FiltroCatalogoDto`,
`CambiarEstadoCatalogoDto`.

- [ ] **Step 9: Angostar `AcreditacionPort` a solo Criterio**

En `apps/api/src/modules/plan-estudios/application/ports/acreditacion-cross-modulo.port.ts`,
quitar `DatosObjetivoMejora`, y de la interfaz `AcreditacionPort` quitar
`objetivosEducacionales`/`objetivoPorId`. Deja `DatosCriterioMejora`,
`criteriosActivosDe`, `criterioPorId`, `ACREDITACION_PORT`. Actualiza el
comentario de cabecera del archivo: ya no dice "Solo cubre Criterios y
Objetivos" — pasa a decir "Solo cubre Criterios — Objetivos tiene su
propio puerto cross-módulo desde la Fase 0c
(`objetivos-cross-modulo.port.ts`, en `objetivos-educacionales`)".

- [ ] **Step 10: Angostar `AcreditacionAdapter`**

En `apps/api/src/modules/plan-estudios/infrastructure/acreditacion-cross-modulo.adapter.ts`,
quita el constructor param `@Inject(REPOSITORIO_OBJETIVO) private readonly objetivos: RepositorioObjetivoPort`
y los dos métodos `objetivosEducacionales`/`objetivoPorId`. Deja
`criteriosActivosDe`/`criterioPorId` con su dependencia de
`RepositorioCriterioPort` intacta. Quita el import de
`REPOSITORIO_OBJETIVO`/`RepositorioObjetivoPort` de `catalogo.port.js`
(ya no existe ahí desde el Step 5).

- [ ] **Step 11: Angostar el spec del adaptador**

En `acreditacion-cross-modulo.adapter.spec.ts`, quita los tests de
`objetivosEducacionales`/`objetivoPorId` y cualquier doble que
construyera un `RepositorioObjetivoPort` para pasárselo al constructor
del adaptador (el constructor ya no lo recibe, así que el test no puede
pasarlo).

- [ ] **Step 12: Confirmar los errores esperados**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: FAIL, con errores en `app.module.ts` (todavía referencia el
`ObjetivosController`/`GestionarObjetivos` viejos de `plan-estudios`, se
arregla en la Task 6) y probablemente en
`gestionar-planes-mejora.use-case.ts`/su spec (`mejora-continua`, porque
`AcreditacionPort` ya no tiene los dos métodos de Objetivo que ese
archivo llama — se arregla en la Task 5). Si aparece un error en
cualquier OTRO archivo no mencionado, detente y anótalo en tu informe en
vez de arreglarlo a ciegas — sería una referencia que el escaneo previo
de este plan no capturó.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/modules/objetivos-educacionales/infrastructure/http
git add -u apps/api/src/modules/plan-estudios
git commit -m "feat(objetivos-educacionales): controller propio; AcreditacionPort angostado a Criterio (Fase 0c)"
```

---

### Task 5: `mejora-continua` — inyectar el puerto nuevo por separado

**Files:**
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts`
- Modify: `apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts`

**Interfaces:**
- Consumes: `ObjetivosCrossModuloPort`, `DatosObjetivoMejora` (Task 2,
  `objetivos-educacionales`); `AcreditacionPort` ya angostado (Task 4).
- Produces: `GestionarPlanesMejora` con un parámetro de constructor más
  (9 en vez de 8) — la Task 6 (wiring) necesita el orden exacto.

Este es el único consumidor real en todo `mejora-continua` de los
métodos de Objetivo que hoy vienen de `AcreditacionPort` — verificado
con `grep` antes de escribir este plan: los otros dos archivos que
mencionan `AcreditacionPort` solo lo hacen en un comentario, no en
código real.

- [ ] **Step 1: Actualizar el import y el constructor**

En `gestionar-planes-mejora.use-case.ts`, el import de
`AcreditacionPort` (línea ~54 hoy) se queda igual — sigue viniendo de
`plan-estudios`, solo que ahora más angosto. Agregar, junto a él:

```typescript
import type {
  DatosObjetivoMejora,
  ObjetivosCrossModuloPort,
} from '../../../objetivos-educacionales/application/ports/objetivos-cross-modulo.port.js';
```

En el constructor de la clase (hoy 8 parámetros, `planes`, `acreditacion`,
`evaluaciones`, `mediciones`, `configuraciones`, `curricular`,
`autorizacion`, `eventos`), agregar un noveno parámetro
`private readonly objetivos: ObjetivosCrossModuloPort` — colócalo
inmediatamente después de `acreditacion`, así el orden queda: `planes,
acreditacion, objetivos, evaluaciones, mediciones, configuraciones,
curricular, autorizacion, eventos`. Este orden exacto es el que la
Task 6 (wiring en `app.module.ts`) va a usar — no lo cambies sin avisar
en tu informe.

- [ ] **Step 2: Actualizar los 4 sitios de uso**

Los 4 lugares que hoy llaman `this.acreditacion.criterioPorId(...)`/
`.objetivoPorId(...)`/`.criteriosActivosDe(...)`/`.objetivosEducacionales(...)`
— los dos de Criterio se quedan tal cual
(`this.acreditacion.criterioPorId`/`this.acreditacion.criteriosActivosDe`).
Los dos de Objetivo cambian de `this.acreditacion` a `this.objetivos`:

- `this.acreditacion.objetivoPorId(datos.elementoId)` →
  `this.objetivos.objetivoPorId(datos.elementoId)`
- `this.acreditacion.objetivosEducacionales()` →
  `this.objetivos.objetivosEducacionales()`

Ninguna otra línea de lógica cambia — son sustituciones de receptor, no
de comportamiento.

- [ ] **Step 3: Actualizar el spec**

En `gestionar-planes-mejora.spec.ts`:

1. Cambiar el import de `AcreditacionPort` (línea ~28-32 hoy) para que
   solo traiga `AcreditacionPort`/`DatosCriterioMejora` desde
   `plan-estudios/application/ports/acreditacion-cross-modulo.port.js`
   (ya no tiene `DatosObjetivoMejora`, se movió). Agregar un import
   nuevo:
   ```typescript
   import type {
     DatosObjetivoMejora,
     ObjetivosCrossModuloPort,
   } from '../../../objetivos-educacionales/application/ports/objetivos-cross-modulo.port.js';
   ```
2. Dividir `acreditacionDouble()` en dos funciones:
   ```typescript
   function acreditacionDouble(sobre: Partial<AcreditacionPort> = {}): AcreditacionPort {
     return {
       criteriosActivosDe: async () => [criterioMejora()],
       criterioPorId: async () => criterioMejora(),
       ...sobre,
     };
   }

   function objetivosDouble(sobre: Partial<ObjetivosCrossModuloPort> = {}): ObjetivosCrossModuloPort {
     return {
       objetivosEducacionales: async () => [objetivoMejora()],
       objetivoPorId: async () => objetivoMejora(),
       ...sobre,
     };
   }
   ```
   (`criterioMejora`/`objetivoMejora`, las funciones fixture que
   construyen `DatosCriterioMejora`/`DatosObjetivoMejora`, no cambian.)
3. En la firma de `montar(opciones: {...})`, agregar
   `objetivos?: Partial<ObjetivosCrossModuloPort>;` junto a `acreditacion?: Partial<AcreditacionPort>;`.
4. En el cuerpo de `montar`, el `new GestionarPlanesMejora(...)` pasa a
   9 argumentos, en el mismo orden del Step 1:
   ```typescript
   const caso = new GestionarPlanesMejora(
     planes,
     acreditacionDouble(opciones.acreditacion),
     objetivosDouble(opciones.objetivos),
     evaluacionesDouble(opciones.evaluaciones),
     medicionesDouble(opciones.mediciones),
     configuracionesDouble(opciones.configuraciones),
     curricularDouble(opciones.curricular),
     opciones.autorizacion ?? permitirTodo(),
     publicador,
   );
   ```
5. En las 2 llamadas a `montar({ acreditacion: { objetivoPorId: ... } })`/
   `{ objetivosEducacionales: ... }` (líneas ~535 y ~555 del archivo
   antes de este cambio — verifica la línea real, puede haberse movido):
   cambiar la clave `acreditacion` por `objetivos` en esas dos llamadas
   específicas, y `objetivoPorId`/`objetivosEducacionales` quedan igual
   (son los mismos nombres de método, solo cambia bajo qué clave del
   objeto de opciones de `montar()` van). Las otras 4 llamadas
   (`criterioPorId`/`criteriosActivosDe`, líneas ~478, ~487, ~497, ~522)
   se quedan exactamente como están, bajo `acreditacion`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts`
Expected: PASS, mismo número de tests que antes de este plan (esta tarea
no agrega ni quita casos, solo cambia de dónde vienen dos de los
dobles).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.use-case.ts apps/api/src/modules/mejora-continua/mejora/application/use-cases/gestionar-planes-mejora.spec.ts
git commit -m "feat(objetivos-educacionales): mejora-continua inyecta ObjetivosCrossModuloPort por separado (Fase 0c)"
```

---

### Task 6: Tests de guardia (aislamiento, en 3 direcciones)

**Files:**
- Create: `apps/api/src/modules/objetivos-educacionales/aislamiento.spec.ts`
- Modify: `apps/api/src/modules/plan-estudios/aislamiento.spec.ts`
- Modify: `apps/api/src/modules/mejora-continua/aislamiento.spec.ts`

**Interfaces:**
- Consumes: nada de código de producción.

Tres direcciones a vigilar: `objetivos-educacionales` no importa de
nadie; `plan-estudios` solo puede importar de `objetivos-educacionales`
su puerto cross-módulo (igual que ya hace hacia `academico`, Fase 0b);
`mejora-continua` ya tenía una guardia (`aislamiento.spec.ts`, la que
ya existe con varios `describe`) que permite importar
`ports/acreditacion-cross-modulo.port.js` de `plan-estudios` — hay que
agregarle el puerto nuevo a la lista de permitidos.

- [ ] **Step 1: `objetivos-educacionales/aislamiento.spec.ts`**

Mismo molde que `academico/aislamiento.spec.ts` (Fase 0b) — copia esa
estructura completa y cambia:
- `DE_PLAN_ESTUDIOS` en vez de un nombre nuevo (el patrón que vigila es
  el mismo: nada de `plan-estudios` debería aparecer).
- El nombre del `describe`:
  `'aislamiento de objetivos-educacionales hacia plan-estudios'`.
- El ejemplo del control positivo cambia la ruta de ejemplo a algo de
  `objetivos-educacionales` (ej.
  `DE_PLAN_ESTUDIOS.test('../../plan-estudios/infrastructure/persistence/plan.repository.js')`
  — el mismo ejemplo que ya usa `academico/aislamiento.spec.ts` sirve
  tal cual, no hace falta cambiarlo).

- [ ] **Step 2: Agregar el bloque en `plan-estudios/aislamiento.spec.ts`**

Al final del archivo (después del `describe` de
`'aislamiento de plan-estudios hacia academico'` si la Fase 0b ya
corrió, o después del de `→ mejora-continua` si no), agregar:

```typescript
describe('aislamiento de plan-estudios hacia objetivos-educacionales', () => {
  const DE_OBJETIVOS = /(^|\/)objetivos-educacionales\//;
  const PUERTO_PERMITIDO_OBJETIVOS = 'ports/objetivos-cross-modulo.port.js';

  it('solo importa de objetivos-educacionales el puerto cross-módulo', () => {
    const vistos = importsDe().filter(({ importado }) => DE_OBJETIVOS.test(importado));
    const infractores = vistos
      .filter(({ importado }) => !importado.endsWith(PUERTO_PERMITIDO_OBJETIVOS))
      .map(({ archivo, importado }) => `${archivo} → ${importado}`);

    expect(infractores).toEqual([]);
    expect(vistos).not.toEqual([]);
  });

  it('reconoce un import prohibido de objetivos-educacionales escrito en relativo', () => {
    expect(
      DE_OBJETIVOS.test('../../objetivos-educacionales/infrastructure/persistence/objetivos.repository.js'),
    ).toBe(true);
  });
});
```

Nota: este plan (Task 4) NO deja a `plan-estudios` importando el puerto
cross-módulo de `objetivos-educacionales` — nadie en `plan-estudios`
necesita datos de Objetivo después de la migración (era al revés:
`mejora-continua` los necesitaba, vía `plan-estudios` antes, vía
`objetivos-educacionales` directo ahora). Así que el primer test de
arriba debería pasar con la lista de infractores vacía Y con `vistos`
vacío también — lo cual **rompería el control positivo tal como está
escrito** (`expect(vistos).not.toEqual([])` fallaría, porque
`plan-estudios` no importa nada de `objetivos-educacionales` en
absoluto). Verifica esto de primera mano antes de escribir el test:

- Si `plan-estudios` no importa nada de `objetivos-educacionales`
  (esperado), **no repliques el control positivo `vistos.not.toEqual([])`**
  para este bloque — déjalo solo con
  `expect(infractores).toEqual([])`, sin la comprobación de que "el
  barrido ve algo". Añade en su lugar un comentario explicando por qué
  falta ese control aquí (a diferencia del bloque `→ academico`, que sí
  tiene un consumidor real): "plan-estudios no consume nada de
  objetivos-educacionales hoy — a diferencia de academico, donde sí
  hay un consumo real (crear un plan necesita la carrera). Si en el
  futuro aparece un consumo real, agregar aquí el control positivo
  correspondiente."
- Si al revisar SÍ encuentras algún import real (por ejemplo, si algo
  quedó sin limpiar en la Task 4), inclúyelo en el test tal como está
  arriba, con su control positivo — y avísalo en tu informe, sería una
  señal de que la Task 4 dejó algo a medias.

- [ ] **Step 3: Extender `PUERTO_PERMITIDO` en `mejora-continua/aislamiento.spec.ts`**

La línea hoy (verifica el número de línea real, puede haberse movido):

```typescript
const PUERTO_PERMITIDO = ['ports/contenido-curricular.port.js', 'ports/acreditacion-cross-modulo.port.js'];
```

Cambiar a:

```typescript
const PUERTO_PERMITIDO = [
  'ports/contenido-curricular.port.js',
  'ports/acreditacion-cross-modulo.port.js',
  'ports/objetivos-cross-modulo.port.js',
];
```

Esta es la única línea que cambia en este archivo — el resto de la
guardia (`DE_PLAN_ESTUDIOS`, los controles positivos) sigue funcionando
igual: sigue vigilando que `mejora-continua` no importe de
`plan-estudios` nada fuera de esos 3 puertos, y ahora
`objetivos-cross-modulo.port.js` (que vive en `objetivos-educacionales`,
no en `plan-estudios`) necesita su propio permiso porque el patrón
`DE_PLAN_ESTUDIOS` de esta guardia **no** cubre `objetivos-educacionales`
— verifica que efectivamente hace falta un patrón nuevo
(`DE_OBJETIVOS_EDUCACIONALES`) en vez de solo agregar la cadena a la
lista existente, porque `PUERTO_PERMITIDO` se filtra sobre `DE_PLAN_ESTUDIOS`,
que busca `/plan-estudios/`, no `/objetivos-educacionales/`. Si el
import real de `gestionar-planes-mejora.use-case.ts` hacia
`objetivos-cross-modulo.port.js` no queda cubierto por ningún patrón de
esta guardia, agrégalo como un `describe` nuevo (mismo molde que el de
`→ plan-estudios` ya existente en este archivo), no como una entrada
más de `PUERTO_PERMITIDO` que nunca se evalúa.

- [ ] **Step 4: Correr los tres**

Run: `cd apps/api && npx vitest run src/modules/objetivos-educacionales/aislamiento.spec.ts src/modules/plan-estudios/aislamiento.spec.ts src/modules/mejora-continua/aislamiento.spec.ts`
Expected: PASS en los tres archivos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/objetivos-educacionales/aislamiento.spec.ts apps/api/src/modules/plan-estudios/aislamiento.spec.ts apps/api/src/modules/mejora-continua/aislamiento.spec.ts
git commit -m "test(objetivos-educacionales): guardia de aislamiento en las 3 direcciones (Fase 0c)"
```

---

### Task 7: Wiring en `app.module.ts` y verificación completa

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: todo lo de las Tasks 1-6.
- Produces: el módulo `objetivos-educacionales` queda inyectable;
  `GestionarPlanesMejora` recibe su noveno parámetro.

- [ ] **Step 1: Actualizar imports**

Reemplazar el import de `ObjetivosController` (hoy junto a
`CompetenciasController`, desde `catalogo.controller.js`) — separarlo:

```typescript
import { CompetenciasController } from './modules/plan-estudios/infrastructure/http/catalogo.controller.js';
import { ObjetivosController } from './modules/objetivos-educacionales/infrastructure/http/objetivos.controller.js';
```

Reemplazar el import de `GestionarObjetivos`/`GestionarCompetencias`
(hoy juntos, desde `gestionar-catalogo.use-case.js`):

```typescript
import { GestionarCompetencias } from './modules/plan-estudios/application/use-cases/gestionar-catalogo.use-case.js';
import { GestionarObjetivos } from './modules/objetivos-educacionales/application/use-cases/gestionar-objetivos.use-case.js';
```

Agregar:

```typescript
import {
  REPOSITORIO_OBJETIVO,
  type RepositorioObjetivoPort,
} from './modules/objetivos-educacionales/application/ports/objetivos.port.js';
import {
  OBJETIVOS_CROSS_MODULO,
  type ObjetivosCrossModuloPort,
} from './modules/objetivos-educacionales/application/ports/objetivos-cross-modulo.port.js';
import { ObjetivoRepositoryPrisma } from './modules/objetivos-educacionales/infrastructure/persistence/objetivos.repository.js';
import { ObjetivosCrossModuloAdapter } from './modules/objetivos-educacionales/infrastructure/objetivos-cross-modulo.adapter.js';
```

El import existente de `REPOSITORIO_OBJETIVO`/`RepositorioObjetivoPort`
que hoy apunta a `plan-estudios/application/ports/catalogo.port.js` se
borra (ya no existe ahí desde la Task 4) — reemplazado por el de arriba.

- [ ] **Step 2: Array `controllers`**

`ObjetivosController` ya está en el array (venía de antes) — no hace
falta tocarlo, solo asegurarse de que el import apunte al archivo nuevo
(ya resuelto en el Step 1).

- [ ] **Step 3: Providers**

El provider existente:
```typescript
    { provide: REPOSITORIO_OBJETIVO, useClass: ObjetivoRepositoryPrisma },
```
se queda igual (mismo símbolo, misma forma, ya apunta a la clase nueva
por el import del Step 1). Agregar uno nuevo, junto a él:
```typescript
    { provide: OBJETIVOS_CROSS_MODULO, useClass: ObjetivosCrossModuloAdapter },
```

- [ ] **Step 4: Factory de `GestionarObjetivos`**

La factory existente de `GestionarObjetivos` (si `plan-estudios` la
tenía combinada con `GestionarCompetencias` en algún punto del array de
providers, sepáralas — inyecta el mismo `REPOSITORIO_OBJETIVO`,
`AUTHORIZATION_PORT`, `PUBLICADOR_EVENTOS` que ya tenía, sin cambios de
forma):
```typescript
    {
      provide: GestionarObjetivos,
      inject: [REPOSITORIO_OBJETIVO, AUTHORIZATION_PORT, PUBLICADOR_EVENTOS],
      useFactory: (
        objetivos: RepositorioObjetivoPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
      ) => new GestionarObjetivos(objetivos, autorizacion, eventos),
    },
```

- [ ] **Step 5: Factory de `GestionarPlanesMejora` — el noveno parámetro**

Localiza la factory existente de `GestionarPlanesMejora` (inyecta hoy 8
cosas). Agregar `OBJETIVOS_CROSS_MODULO` a su `inject` — en la misma
posición que la Task 5 usó en el constructor (justo después de
`ACREDITACION_PORT`), y el parámetro correspondiente
`objetivos: ObjetivosCrossModuloPort` en el `useFactory`, pasado a
`new GestionarPlanesMejora(...)` en esa misma posición. El orden real
del constructor (Task 5, Step 1) es la autoridad — si lo que encuentras
aquí no coincide, el orden del constructor manda, ajusta el `inject`
para que calce, no al revés.

- [ ] **Step 6: Typecheck de todo el proyecto**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: limpio. Cualquier error fuera de `app.module.ts` en este punto
es una referencia no capturada por el escaneo previo — documéntala
antes de corregirla.

- [ ] **Step 7: Suite completa del backend**

```bash
cd apps/api && npx vitest run
```
Expected: todo en verde.

- [ ] **Step 8: Suite de integración completa**

```bash
cd apps/api && SGC_DB_DESECHABLE=1 DATABASE_URL="postgresql://sgc:sgc@localhost:5433/sgc_test?schema=public" npx vitest run --config vitest.integration.config.ts test/integration/
```
Expected: todo en verde, incluido `objetivos-educacionales.int.spec.ts`
(Task 3).

- [ ] **Step 9: Levantar la app real**

```bash
cd apps/api && npm run build && node dist/main.js
```
Expected: arranca sin errores, con `/objetivos` registrado en el log de
arranque. Detener el proceso después de confirmar.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(objetivos-educacionales): wiring de DI, módulo queda inyectable (Fase 0c)"
```

---

## Al terminar

`ObjetivoEducacional` vive en su propio módulo, sin `carreraId`, con el
mismo aislamiento por puerto que ya protege a `academico` y
`mejora-continua`. La costura más delicada de este plan —
`AcreditacionPort` dividido en dos, con `GestionarPlanesMejora` como
único consumidor real de la mitad que se movió— queda documentada tanto
en el propio código (comentarios de cabecera actualizados en los
archivos que cambiaron de forma) como en este plan, para que un lector
futuro no tenga que redescubrir por qué un caso de uso de
`mejora-continua` recibe un puerto de un módulo que no es ninguno de sus
dos vecinos habituales.

Al cerrar este plan, seguir con el siguiente de la Fase 0
(`atributos-graduado` — más complejo todavía, porque
`CompetenciaRepositoryPrisma` en `plan-estudios` hoy consulta
`AtributoGraduado` por Prisma directo, sin puerto de por medio, algo que
`ObjetivoEducacional` no tenía), en la misma rama
`dashboard-fase0-fundacion`.
