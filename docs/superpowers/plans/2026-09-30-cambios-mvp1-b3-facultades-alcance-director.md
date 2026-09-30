# Cambios MVP1 — Bloque 3: «Facultades» para el Administrador y alcance de lectura del Director — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Administrador vea el módulo Plan de Estudios como «Facultades» y solo con facultades y carreras (RF-CH-007 y 008), y que el Director solo lea datos de la carrera que tiene a cargo, aplicado en el API (RF-CH-009).

**Architecture:** Un permiso-marca `lectura.solo_su_carrera` (solo Director) y una función pura de política, `alcanceDeLectura`, deciden el alcance. Un puerto nuevo y pequeño, `AlcanceDeLecturaPort`, lo expone a `academico` y `plan-estudios` sin tocar `AuthorizationPort` (que tiene 18 dobles en los tests). Cada lectura conserva su permiso y añade la comprobación de alcance. En la web, `RutaConPermiso` gana un destino de redirección, el menú puede llevar una etiqueta alternativa por permiso y `CarrerasPage` gana un modo `mi-carrera` para el Director.

**Tech Stack:** NestJS + Prisma + Vitest (apps/api, `npm test` unitarias, `npm run test:integration` contra PostgreSQL desechable), React + react-query + Vitest/Testing Library (apps/web), Playwright + axe (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-09-30-cambios-mvp1-b3-facultades-alcance-director-design.md`

## Global Constraints

- El permiso-marca se llama exactamente `lectura.solo_su_carrera`, módulo `auth`, y solo lo tiene `DIRECTOR_CARRERA`.
- Fuera de alcance responde `NoEncontrado` (404), nunca `AccesoDenegado`: no se revela que el recurso existe. La única excepción es el panel institucional de Reportes, que responde `AccesoDenegado`.
- Un usuario con la marca y sin carrera asignada no lee nada: listados vacíos y detalles 404.
- El puerto `AlcanceDeLecturaPort` va como **último** parámetro **obligatorio** de cada constructor; nunca con un valor por defecto «sin restricción».
- `AuthorizationPort` no cambia.
- Los catálogos `GET /objetivos` y `GET /competencias`, y las facultades, no se acotan en este bloque.
- Código, comentarios y textos de interfaz en español neutro, como el resto del proyecto. Commits convencionales en español, **sin** `Co-Authored-By` ni atribución de IA.
- **Pruebas de integración:** hacen `TRUNCATE`. Solo contra la base desechable `sgc_test` (`postgresql://sgc:sgc@localhost:5433/sgc_test`), nunca contra la de desarrollo. Tras cambiar la matriz hay que volver a correr el seed en ella (Tarea 2, Paso 1).
- **Formato:** ejecutar `prettier --write` solo sobre los archivos que se tocaron, nunca sobre carpetas enteras (reformatea archivos ajenos y ensucia el diff).
- **e2e:** antes de cada pasada completa correr `npm run e2e:preparar`; al terminar, apagar también el **worker** de documentos (no escucha ningún puerto).

## Review Focus

- Un Director que pide por id un plan, una carrera, sus versiones, su historial, sus asignaturas o su reporte cuando son de **otra carrera** recibe 404 —no 403 y no los datos— en cada una de esas lecturas — Tareas 3, 4 y 5.
- Un Director **sin carrera asignada** no lee nada: listados vacíos y detalles 404 — Tareas 1, 3, 4 y 5.
- Consultor, Docente, Coordinador y Administrador (sin la marca) **siguen leyendo todo lo que leían**: cada caso de uso tiene su caso «sin restricción» — Tareas 3, 4 y 5.
- El Administrador que teclea `/plan-estudios/planes/:id` (o cualquier apartado del plan) vuelve al listado de facultades, y su pantalla de carreras no pide planes — Tarea 6.
- El panel institucional de Reportes no le entrega al Director datos agregados de otras carreras (403), y la pantalla de Reportes le abre en «Búsqueda de planes» en vez de mostrarle un error — Tareas 5 y 7.

---

### Task 1: Función de alcance y matriz de accesos

**Files:**
- Modify: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.ts`
- Test: `apps/api/src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
- Modify: `apps/api/src/modules/auth/domain/matriz-de-accesos.ts`
- Test: `apps/api/src/modules/auth/domain/matriz-de-accesos.spec.ts`

**Interfaces:**
- Produces (política):
  - `PERMISO_LECTURA_SOLO_SU_CARRERA: 'lectura.solo_su_carrera'`
  - `type AlcanceDeLectura = { readonly tipo: 'TODAS' } | { readonly tipo: 'CARRERA'; readonly carreraId: string | null }`
  - `alcanceDeLectura(contexto: ContextoDeAutorizacion): AlcanceDeLectura`
  - `puedeLeerCarrera(alcance: AlcanceDeLectura, carreraId: string): boolean`
- Produces (matriz): el permiso `lectura.solo_su_carrera` en el catálogo, asignado solo al Director; el Administrador sin `plan.leer`, `plan.leer_historico`, `objetivo.leer`, `competencia.leer` y `asignatura.leer`.

- [ ] **Step 1: Escribir los tests de la política (fallan)**

En `politica-de-autorizacion.spec.ts`, añadir `alcanceDeLectura` y `puedeLeerCarrera` a la lista de imports de `./politica-de-autorizacion.js` y, al final del archivo:

```ts
describe('alcance de lectura (RF-CH-009)', () => {
  const marca = 'lectura.solo_su_carrera';

  it('sin la marca el alcance es TODAS aunque tenga carrera a cargo', () => {
    const contexto: ContextoDeAutorizacion = {
      permisos: new Set(['plan.leer']),
      carreraACargo: ISI,
    };
    expect(alcanceDeLectura(contexto)).toEqual({ tipo: 'TODAS' });
  });

  it('con la marca el alcance es la carrera a cargo', () => {
    const contexto: ContextoDeAutorizacion = {
      permisos: new Set(['plan.leer', marca]),
      carreraACargo: ISI,
    };
    expect(alcanceDeLectura(contexto)).toEqual({ tipo: 'CARRERA', carreraId: ISI });
  });

  it('con la marca y sin carrera asignada el alcance es CARRERA sin carrera: no lee ninguna', () => {
    const contexto: ContextoDeAutorizacion = {
      permisos: new Set([marca]),
      carreraACargo: null,
    };
    expect(alcanceDeLectura(contexto)).toEqual({ tipo: 'CARRERA', carreraId: null });
  });

  it('puedeLeerCarrera: TODAS lee cualquiera', () => {
    expect(puedeLeerCarrera({ tipo: 'TODAS' }, ISI)).toBe(true);
    expect(puedeLeerCarrera({ tipo: 'TODAS' }, IIN)).toBe(true);
  });

  it('puedeLeerCarrera: CARRERA lee solo la suya', () => {
    const alcance = { tipo: 'CARRERA', carreraId: ISI } as const;
    expect(puedeLeerCarrera(alcance, ISI)).toBe(true);
    expect(puedeLeerCarrera(alcance, IIN)).toBe(false);
  });

  it('puedeLeerCarrera: CARRERA sin carrera no lee ninguna', () => {
    expect(puedeLeerCarrera({ tipo: 'CARRERA', carreraId: null }, ISI)).toBe(false);
  });
});
```

- [ ] **Step 2: Escribir los tests de la matriz (fallan)**

En `matriz-de-accesos.spec.ts`:

1. Reemplazar el array esperado del test `'ADMIN_SISTEMA: …'` por este (y renombrar el test a `'ADMIN_SISTEMA: solo Facultades y Sistema; no lee contenido de planes (RF-CH-008)'`):

```ts
      [
        'auditoria.leer',
        'carrera.crear',
        'carrera.editar',
        'carrera.inactivar',
        'carrera.leer',
        'facultad.crear',
        'facultad.editar',
        'facultad.inactivar',
        'facultad.leer',
        'plan.acceder',
        'rol.gestionar',
        'usuario.gestionar',
      ].sort(),
```

2. En el array esperado de `DIRECTOR_CARRERA` añadir `'lectura.solo_su_carrera',`.
3. Dentro del mismo `describe`, antes de su `});` final, añadir:

```ts
  it('solo el Director tiene lectura.solo_su_carrera', () => {
    const quienes = ROLES.filter((r) => r.permisos.includes('lectura.solo_su_carrera')).map(
      (r) => r.codigo,
    );
    expect(quienes).toEqual(['DIRECTOR_CARRERA']);
  });

  it('el Administrador no tiene ningún permiso de lectura de planes ni de su contenido', () => {
    const permisos = permisosOrdenados('ADMIN_SISTEMA');
    for (const ajeno of [
      'plan.leer',
      'plan.leer_historico',
      'objetivo.leer',
      'competencia.leer',
      'asignatura.leer',
    ]) {
      expect(permisos).not.toContain(ajeno);
    }
  });
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/auth/domain`
Expected: FAIL — los imports `alcanceDeLectura` y `puedeLeerCarrera` no existen (los 6 tests de política fallan), el Administrador todavía tiene los cinco permisos y ningún rol tiene `lectura.solo_su_carrera`.

- [ ] **Step 4: Implementar la política**

En `politica-de-autorizacion.ts`, al final del archivo:

```ts
/**
 * Permiso-marca del alcance de lectura (RF-CH-009).
 *
 * No concede lectura de nada: solo acota las lecturas que el rol ya tiene a la
 * carrera que el usuario tiene a cargo. Es un permiso y no un `if` sobre el
 * nombre del rol porque §3.5 pide que lo que un rol puede se configure como
 * dato: darle o quitarle este alcance a otro rol no exige tocar código.
 */
export const PERMISO_LECTURA_SOLO_SU_CARRERA = 'lectura.solo_su_carrera';

export type AlcanceDeLectura =
  | { readonly tipo: 'TODAS' }
  | { readonly tipo: 'CARRERA'; readonly carreraId: string | null };

/**
 * Qué carreras puede leer el usuario.
 *
 * Con la marca y sin carrera asignada el alcance es `CARRERA` con `null`, no
 * `TODAS`: quien está restringido y no tiene carrera no debe leer nada, y
 * confundirlo con «sin restricción» sería abrirle todo justo por no haberle
 * asignado la carrera.
 */
export function alcanceDeLectura(contexto: ContextoDeAutorizacion): AlcanceDeLectura {
  if (!contexto.permisos.has(PERMISO_LECTURA_SOLO_SU_CARRERA)) return { tipo: 'TODAS' };
  return { tipo: 'CARRERA', carreraId: contexto.carreraACargo };
}

export function puedeLeerCarrera(alcance: AlcanceDeLectura, carreraId: string): boolean {
  if (alcance.tipo === 'TODAS') return true;
  return alcance.carreraId !== null && alcance.carreraId === carreraId;
}
```

- [ ] **Step 5: Implementar la matriz**

En `matriz-de-accesos.ts`:

- En el catálogo `PERMISOS`, después de `['docente.gestionar', 'Gestionar los docentes de su carrera', 'auth'],` añadir:

```ts
  ['lectura.solo_su_carrera', 'Leer solo los datos de la carrera que tiene a cargo', 'auth'],
```

- En `DIRECTOR_CARRERA`, después de `'docente.gestionar',` añadir `'lectura.solo_su_carrera',`.
- En `ADMIN_SISTEMA`: leer su bloque (`Read` de `matriz-de-accesos.ts` alrededor de `codigo: 'ADMIN_SISTEMA'`) y reemplazar sus comentarios y su lista `permisos` por:

```ts
    // Dueño de la estructura y de las cuentas. Desde el Bloque 3 (RF-CH-008) ve
    // el módulo Plan de Estudios como «Facultades» y solo hasta las carreras:
    // no lee planes ni su contenido (objetivos, competencias, asignaturas). Antes
    // sí los leía, para no abrir un plan a medias; el documento de cambios
    // decide que no le corresponden.
    //
    // Conserva `plan.acceder` para entrar al módulo. Lo que sigue fuera, a
    // propósito: no crea ni edita contenido, no aprueba planes y no tiene
    // `reporte.generar`.
    permisos: [
      'facultad.leer',
      'facultad.crear',
      'facultad.editar',
      'facultad.inactivar',
      'carrera.leer',
      'carrera.crear',
      'carrera.editar',
      'carrera.inactivar',
      'plan.acceder',
      'auditoria.leer',
      'usuario.gestionar',
      'rol.gestionar',
    ],
```

- [ ] **Step 6: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/auth/domain`
Expected: PASS (todos los tests del directorio, incluidos los de bloques anteriores y la guarda «todo permiso asignado a un rol existe en el catálogo»).

- [ ] **Step 7: Suite completa, typecheck y formato de los archivos tocados**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx prettier --write src/modules/auth/domain/matriz-de-accesos.ts src/modules/auth/domain/matriz-de-accesos.spec.ts src/modules/auth/domain/services/politica-de-autorizacion.ts src/modules/auth/domain/services/politica-de-autorizacion.spec.ts`
Expected: `tsc` sin errores y suite en verde. Si `aislamiento.spec.ts` da timeouts de 5 s, repetirlo solo: es carga, no fallo.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/auth/domain
git commit -m "feat(auth): alcance de lectura por carrera y matriz sin lectura de planes para el Administrador

Añade lectura.solo_su_carrera (solo Director) y la función pura
alcanceDeLectura/puedeLeerCarrera. Al Administrador se le retiran plan.leer,
plan.leer_historico, objetivo.leer, competencia.leer y asignatura.leer
(RF-CH-008)."
```

---

### Task 2: `AlcanceDeLecturaPort` y su adaptador

**Files:**
- Create: `apps/api/src/modules/auth/application/ports/alcance-de-lectura.port.ts`
- Modify: `apps/api/src/modules/auth/infrastructure/authorization.adapter.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/integration/alcance-de-lectura.int.spec.ts`

**Interfaces:**
- Consumes (Tarea 1): `alcanceDeLectura`, `puedeLeerCarrera`, `AlcanceDeLectura` de la política.
- Produces:
  - `interface AlcanceDeLecturaPort { alcanceDeLectura(usuarioId: string): Promise<AlcanceDeLectura>; puedeLeerCarrera(usuarioId: string, carreraId: string): Promise<boolean> }`
  - `export type { AlcanceDeLectura }` reexportado desde el puerto, y el token `ALCANCE_DE_LECTURA`.
  - `AuthorizationAdapter implements AuthorizationPort, AlcanceDeLecturaPort`.
  Las Tareas 3, 4 y 5 los consumen.

- [ ] **Step 1: Preparar la base desechable con la matriz nueva**

La base de desarrollo **no** sirve: los tests de integración hacen `TRUNCATE`. `sgc_test` ya existe (la creó el Bloque 2); hay que aplicarle el esquema y volver a correr el seed para que el Director reciba la marca:

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc_test'
npx prisma migrate deploy
npm run db:seed
```

Expected: «No pending migrations» o «All migrations have been successfully applied», y «Listo. No se creó ningún usuario…». Si `sgc_test` no existe, crearla primero con el driver `pg` (`CREATE DATABASE sgc_test`). Si Postgres no responde, comprobar que los contenedores estén arriba (`docker start sgc_postgres sgc_redis`). Todos los comandos `test:integration` de este plan van con esa misma `DATABASE_URL`.

- [ ] **Step 2: Escribir el test de integración (falla)**

Crear `apps/api/test/integration/alcance-de-lectura.int.spec.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthorizationAdapter } from '../../src/modules/auth/infrastructure/authorization.adapter.js';
import { PrismaService } from '../../src/platform/database/prisma.service.js';

const prisma = new PrismaService();
const adaptador = new AuthorizationAdapter(prisma);

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auth.usuarios, academico.carreras, academico.facultades
    RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function crearCarrera(codigo: string): Promise<string> {
  const f = await prisma.facultad.create({ data: { nombre: `Facultad ${codigo}` } });
  const c = await prisma.carrera.create({
    data: { facultadId: f.id, nombre: `Carrera ${codigo}`, codigo, duracionAnios: 5 },
  });
  return c.id;
}

async function crearUsuario(
  email: string,
  codigoRol: string,
  carreraId: string | null,
  estado: 'ACTIVO' | 'INACTIVO' = 'ACTIVO',
) {
  const rol = await prisma.rol.findUnique({ where: { codigo: codigoRol } });
  if (!rol) throw new Error(`Falta el rol ${codigoRol}: ejecuta \`npm run db:seed\`.`);
  return prisma.usuario.create({
    data: {
      email,
      nombreCompleto: email,
      passwordHash: 'x',
      estado,
      roles: { create: { rolId: rol.id } },
      ...(carreraId ? { carreras: { create: { carreraId } } } : {}),
    },
  });
}

describe('AuthorizationAdapter.alcanceDeLectura', () => {
  it('un Director con carrera queda restringido a ella', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: sis,
    });
  });

  it('un Director sin carrera queda restringido y sin carrera: no lee ninguna', async () => {
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', null);

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({
      tipo: 'CARRERA',
      carreraId: null,
    });
  });

  it('un Consultor no está restringido', async () => {
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await adaptador.alcanceDeLectura(consultor.id)).toEqual({ tipo: 'TODAS' });
  });

  it('un Coordinador con carrera a cargo tampoco: la marca es solo del Director', async () => {
    const sis = await crearCarrera('SIS');
    const coordinador = await crearUsuario('coo@x.pe', 'COORDINADOR_ACADEMICO', sis);

    expect(await adaptador.alcanceDeLectura(coordinador.id)).toEqual({ tipo: 'TODAS' });
  });

  it('una cuenta inactiva se queda sin permisos, y sin la marca: TODAS (su permiso de lectura ya falla)', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis, 'INACTIVO');

    expect(await adaptador.alcanceDeLectura(director.id)).toEqual({ tipo: 'TODAS' });
  });
});

describe('AuthorizationAdapter.puedeLeerCarrera', () => {
  it('el Director lee su carrera y no otra', async () => {
    const sis = await crearCarrera('SIS');
    const civ = await crearCarrera('CIV');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', sis);

    expect(await adaptador.puedeLeerCarrera(director.id, sis)).toBe(true);
    expect(await adaptador.puedeLeerCarrera(director.id, civ)).toBe(false);
  });

  it('el Director sin carrera no lee ninguna', async () => {
    const sis = await crearCarrera('SIS');
    const director = await crearUsuario('dir@x.pe', 'DIRECTOR_CARRERA', null);

    expect(await adaptador.puedeLeerCarrera(director.id, sis)).toBe(false);
  });

  it('el Consultor lee cualquiera', async () => {
    const sis = await crearCarrera('SIS');
    const consultor = await crearUsuario('con@x.pe', 'USUARIO_CONSULTOR', null);

    expect(await adaptador.puedeLeerCarrera(consultor.id, sis)).toBe(true);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cd apps/api && npm run test:integration -- alcance-de-lectura`
Expected: FAIL — `adaptador.alcanceDeLectura is not a function` (los 8 tests).

- [ ] **Step 4: Implementar el puerto y el adaptador**

Crear `apps/api/src/modules/auth/application/ports/alcance-de-lectura.port.ts`:

```ts
/**
 * Qué carreras puede leer un usuario (RF-CH-009).
 *
 * Es un puerto aparte de `AuthorizationPort` a propósito: aquel lo doblan a mano
 * decenas de pruebas de otros módulos, y añadirle métodos obligaría a tocarlas
 * todas por algo que solo consultan las lecturas que cuelgan de una carrera.
 *
 * El tipo `AlcanceDeLectura` se reexporta aquí para que los demás módulos lo
 * importen de un puerto y no del dominio de `auth`.
 */

import type { AlcanceDeLectura } from '../../domain/services/politica-de-autorizacion.js';

export type { AlcanceDeLectura };

export interface AlcanceDeLecturaPort {
  /** `TODAS` sin restricción; `CARRERA` con la carrera a cargo (o `null` si no tiene). */
  alcanceDeLectura(usuarioId: string): Promise<AlcanceDeLectura>;

  /** ¿Puede este usuario leer datos de esta carrera? */
  puedeLeerCarrera(usuarioId: string, carreraId: string): Promise<boolean>;
}

/** Token de inyección. */
export const ALCANCE_DE_LECTURA = Symbol('AlcanceDeLecturaPort');
```

En `authorization.adapter.ts`:

- Cambiar el import de la política a:

```ts
import {
  alcanceDeLectura as decidirAlcance,
  puede as decidir,
  puedeLeerCarrera as decidirLectura,
  type AlcanceDeLectura,
  type ContextoDeAutorizacion,
  type Decision,
} from '../domain/services/politica-de-autorizacion.js';
```

- Añadir, junto al import de `AuthorizationPort`: `import type { AlcanceDeLecturaPort } from '../application/ports/alcance-de-lectura.port.js';`
- Cambiar la declaración a `export class AuthorizationAdapter implements AuthorizationPort, AlcanceDeLecturaPort {`.
- Después del método `rolesDe(...)` y antes de `contextoDe`, añadir:

```ts
  async alcanceDeLectura(usuarioId: string): Promise<AlcanceDeLectura> {
    return decidirAlcance(await this.contextoDe(usuarioId));
  }

  async puedeLeerCarrera(usuarioId: string, carreraId: string): Promise<boolean> {
    return decidirLectura(await this.alcanceDeLectura(usuarioId), carreraId);
  }
```

En `app.module.ts`, junto a los imports del puerto de autorización añadir:

```ts
import {
  ALCANCE_DE_LECTURA,
  type AlcanceDeLecturaPort,
} from './modules/auth/application/ports/alcance-de-lectura.port.js';
```

y justo después de la línea `{ provide: AUTHORIZATION_PORT, useClass: AuthorizationAdapter },` añadir:

```ts
    // El mismo adaptador cumple los dos puertos: una sola instancia, una sola lectura de permisos.
    { provide: ALCANCE_DE_LECTURA, useExisting: AUTHORIZATION_PORT },
```

(El tipo `AlcanceDeLecturaPort` se usa en las Tareas 3 a 5; si el linter marca el import como no usado, dejar por ahora solo `ALCANCE_DE_LECTURA` y añadir el tipo en la primera tarea que lo necesite.)

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run test:integration -- alcance-de-lectura`
Expected: PASS (8 tests).

- [ ] **Step 6: Typecheck, suite completa y commit**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx prettier --write src/modules/auth/application/ports/alcance-de-lectura.port.ts src/modules/auth/infrastructure/authorization.adapter.ts test/integration/alcance-de-lectura.int.spec.ts`
Expected: sin errores, suite en verde.

```bash
git add apps/api/src/modules/auth apps/api/src/app.module.ts apps/api/test/integration/alcance-de-lectura.int.spec.ts
git commit -m "feat(auth): AlcanceDeLecturaPort — qué carreras puede leer un usuario"
```

---

### Task 3: Carreras acotadas al alcance del usuario

**Files:**
- Modify: `apps/api/src/modules/academico/application/use-cases/gestionar-carreras.use-case.ts`
- Test: `apps/api/src/modules/academico/application/use-cases/gestionar-carreras.spec.ts`
- Modify: `apps/api/src/app.module.ts` (fábrica de `GestionarCarreras`)

**Interfaces:**
- Consumes (Tarea 2): `AlcanceDeLecturaPort`, `ALCANCE_DE_LECTURA`.
- Produces: `new GestionarCarreras(carreras, facultades, autorizacion, eventos, alcance)`; `listar` filtra a la carrera del usuario cuando su alcance es `CARRERA`; `porId` responde `NoEncontrado` si la carrera no está en alcance.

- [ ] **Step 1: Escribir los tests (fallan)**

En `gestionar-carreras.spec.ts`:

1. Junto a los imports de tipos añadir:

```ts
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
```

2. Después de la función `denegar()`, añadir los dos dobles:

```ts
function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Un Director: solo lee la carrera indicada (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}
```

3. En `montarCarreras`, añadir a `opciones` `carreras?: DatosCarreraCompleta[];` y `alcance?: AlcanceDeLecturaPort;`; cambiar en `repoCarrera` la línea de `listar` para devolver `opciones.carreras ?? [carrera()]`:

```ts
    listar: async (filtro) => {
      filtrosCarrera.push(filtro);
      return opciones.carreras ?? [carrera()];
    },
```

y el constructor por:

```ts
  const caso = new GestionarCarreras(
    repoCarrera,
    repoFacultad,
    opciones.autorizacion ?? permitirTodo(),
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );
```

4. Al final del archivo añadir:

```ts
describe('RF-CH-009 — alcance de lectura de carreras', () => {
  const isi = carrera({ id: 'car-isi', nombre: 'Sistemas' });
  const iin = carrera({ id: 'car-iin', nombre: 'Industrial' });

  it('sin restricción, listar devuelve todas', async () => {
    const { caso } = montarCarreras({ carreras: [isi, iin] });
    expect((await caso.listar(ACTOR)).map((c) => c.id)).toEqual(['car-isi', 'car-iin']);
  });

  it('con alcance de carrera, listar devuelve solo la suya', async () => {
    const { caso } = montarCarreras({ carreras: [isi, iin], alcance: soloCarrera('car-isi') });
    expect((await caso.listar(ACTOR)).map((c) => c.id)).toEqual(['car-isi']);
  });

  it('con alcance de carrera y sin carrera asignada, listar devuelve la lista vacía', async () => {
    const { caso } = montarCarreras({ carreras: [isi, iin], alcance: soloCarrera(null) });
    expect(await caso.listar(ACTOR)).toEqual([]);
  });

  it('porId de la carrera propia la devuelve', async () => {
    const { caso } = montarCarreras({ carrera: isi, alcance: soloCarrera('car-isi') });
    await expect(caso.porId(ACTOR, 'car-isi')).resolves.toMatchObject({ id: 'car-isi' });
  });

  it('porId de una carrera ajena responde NoEncontrado, no AccesoDenegado', async () => {
    const { caso } = montarCarreras({ carrera: iin, alcance: soloCarrera('car-isi') });
    await expect(caso.porId(ACTOR, 'car-iin')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('el permiso carrera.leer sigue yendo primero: sin él, AccesoDenegado aunque la carrera sea propia', async () => {
    const { caso } = montarCarreras({
      carrera: isi,
      alcance: soloCarrera('car-isi'),
      autorizacion: denegar(),
    });
    await expect(caso.porId(ACTOR, 'car-isi')).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/academico/application/use-cases/gestionar-carreras.spec.ts`
Expected: FAIL — el filtrado no existe todavía: «con alcance de carrera, listar devuelve solo la suya» devuelve las dos, «sin carrera asignada» devuelve las dos y «porId de una carrera ajena» la devuelve en vez de fallar. Los demás tests siguen pasando.

- [ ] **Step 3: Implementar**

En `gestionar-carreras.use-case.ts`:

- Añadir el import `import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';` junto al de `AuthorizationPort`.
- Añadir el parámetro al constructor:

```ts
  constructor(
    private readonly carreras: RepositorioCarreraPort,
    private readonly facultades: RepositorioFacultadPort,
    private readonly autorizacion: AuthorizationPort,
    private readonly eventos: PublicadorDeEventos,
    private readonly alcance: AlcanceDeLecturaPort,
  ) {}
```

- Reemplazar `listar` y `porId` por:

```ts
  /**
   * RF013 / RF016: filtros combinables.
   *
   * RF-CH-009: quien solo lee su carrera recibe únicamente esa. El filtro se
   * aplica sobre el resultado y no dentro del repositorio: son pocas carreras y
   * así la regla vive en un solo sitio.
   */
  async listar(
    actor: Actor,
    filtro?: { facultadId?: string; texto?: string; activa?: boolean },
  ): Promise<DatosCarreraCompleta[]> {
    await this.exigir(actor, 'carrera.leer');
    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    const todas = await this.carreras.listar(filtro);
    if (alcance.tipo === 'TODAS') return todas;
    return todas.filter((c) => c.id === alcance.carreraId);
  }

  async porId(actor: Actor, id: string): Promise<DatosCarreraCompleta> {
    await this.exigir(actor, 'carrera.leer');
    const carrera = await this.carreras.porId(id);
    if (!carrera) throw new NoEncontrado('la carrera', id);
    // NoEncontrado y no AccesoDenegado: no se revela que la carrera existe.
    if (!(await this.alcance.puedeLeerCarrera(actor.id, carrera.id))) {
      throw new NoEncontrado('la carrera', id);
    }
    return carrera;
  }
```

- [ ] **Step 4: Cablear en `app.module.ts`**

Reemplazar la fábrica de `GestionarCarreras` por:

```ts
      provide: GestionarCarreras,
      inject: [
        REPOSITORIO_CARRERA,
        REPOSITORIO_FACULTAD,
        AUTHORIZATION_PORT,
        PUBLICADOR_EVENTOS,
        ALCANCE_DE_LECTURA,
      ],
      useFactory: (
        carreras: RepositorioCarreraPort,
        facultades: RepositorioFacultadPort,
        autorizacion: AuthorizationPort,
        eventos: PublicadorDeEventos,
        alcance: AlcanceDeLecturaPort,
      ) => new GestionarCarreras(carreras, facultades, autorizacion, eventos, alcance),
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd apps/api && npx vitest run src/modules/academico && npx tsc --noEmit -p tsconfig.json`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 6: Suite completa y commit**

Run: `cd apps/api && npx vitest run && npx prettier --write src/modules/academico/application/use-cases/gestionar-carreras.use-case.ts src/modules/academico/application/use-cases/gestionar-carreras.spec.ts src/app.module.ts`
Expected: suite en verde.

```bash
git add apps/api/src
git commit -m "feat(academico): las carreras se acotan al alcance de lectura del usuario (RF-CH-009)"
```

---

### Task 4: Planes, detalle e historial acotados

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-planes.use-case.ts`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/consultar-plan.use-case.ts`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/consultar-historial.use-case.ts`
- Test: `gestionar-planes.spec.ts`, `consultar-plan.spec.ts`, `consultar-historial.spec.ts` (mismo directorio)
- Modify: `apps/api/src/app.module.ts` (fábricas de `GestionarPlanes`, `ConsultarPlan` y `ConsultarHistorial`)

**Interfaces:**
- Consumes (Tarea 2): `AlcanceDeLecturaPort`, `ALCANCE_DE_LECTURA`.
- Produces:
  - `new GestionarPlanes(planes, contenido, autorizacion, eventos, generarId, alcance)`
  - `new ConsultarPlan(planes, contenido, autorizacion, alcance)`
  - `new ConsultarHistorial(planes, asignaturas, contenido, aprobaciones, autorizacion, eventos, alcance)`
  - `GestionarPlanes.listar` fuerza el `carreraId` del filtro; `versionesDe`, `ConsultarPlan.ejecutar`, `ConsultarHistorial.aprobacionesDe/justificacionesDe/compararVersiones` responden `NoEncontrado` fuera de alcance.

- [ ] **Step 1: Escribir los tests de `GestionarPlanes` (fallan)**

En `gestionar-planes.spec.ts`:

1. Junto a los imports de tipos: `import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';`
2. Después de la constante `ISI`, añadir:

```ts
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

/** Un Director: solo lee la carrera indicada (o ninguna si es `null`). */
function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}
```

3. En las `opciones` de `montar` añadir `alcance?: AlcanceDeLecturaPort;` y cambiar la construcción por:

```ts
  const caso = new GestionarPlanes(
    repo,
    contenido,
    autorizacion,
    eventos,
    { nuevo: () => `nuevo-${++n}` },
    opciones.alcance ?? sinRestriccion(),
  );
```

4. Al final del archivo:

```ts
describe('RF-CH-009 — alcance de lectura de planes', () => {
  it('sin restricción, listar no toca el filtro', async () => {
    const { caso, filtros } = montar();
    await caso.listar(ACTOR, { estado: 'Vigente' });
    expect(filtros).toEqual([{ estado: 'Vigente' }]);
  });

  it('con alcance de carrera, listar fuerza la carrera propia aunque se pida otra', async () => {
    const { caso, filtros } = montar({ alcance: soloCarrera(ISI) });
    await caso.listar(ACTOR, { carreraId: IIN, estado: 'Vigente' });
    expect(filtros).toEqual([{ carreraId: ISI, estado: 'Vigente' }]);
  });

  it('con alcance de carrera y sin filtro, listar pide igualmente solo la propia', async () => {
    const { caso, filtros } = montar({ alcance: soloCarrera(ISI) });
    await caso.listar(ACTOR);
    expect(filtros).toEqual([{ carreraId: ISI }]);
  });

  it('con alcance de carrera y sin carrera asignada, listar devuelve la lista vacía sin consultar', async () => {
    const { caso, filtros } = montar({ alcance: soloCarrera(null) });
    expect(await caso.listar(ACTOR)).toEqual([]);
    expect(filtros).toEqual([]);
  });

  it('versionesDe de la carrera propia devuelve el histórico', async () => {
    const { caso } = montar({ alcance: soloCarrera(ISI) });
    expect(await caso.versionesDe(ACTOR, ISI)).toHaveLength(2);
  });

  it('versionesDe de una carrera ajena responde NoEncontrado, no AccesoDenegado', async () => {
    const { caso } = montar({ alcance: soloCarrera(ISI) });
    await expect(caso.versionesDe(ACTOR, IIN)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('versionesDe sin restricción lee cualquier carrera', async () => {
    const { caso } = montar();
    expect(await caso.versionesDe(ACTOR, IIN)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Escribir los tests de `ConsultarPlan` (fallan)**

En `consultar-plan.spec.ts`:

1. Import del puerto (como arriba) y, después de la constante `ISI`:

```ts
function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}
```

2. En el tipo de las `opciones` de `montar` añadir `alcance?: AlcanceDeLecturaPort;` (junto a `plan`, `permisos`, …) y cambiar el último `return` por `return new ConsultarPlan(planes, contenido, autorizacion, opciones.alcance ?? sinRestriccion());`.
3. Añadir a la sección `describe('Precondiciones', …)` estos tres tests:

```ts
  it('el plan de la carrera propia se lee con alcance de carrera', async () => {
    const caso = montar({ plan: plan('Borrador'), alcance: soloCarrera(ISI) });
    await expect(caso.ejecutar('plan-1', ACTOR)).resolves.toMatchObject({
      plan: { id: 'plan-1' },
    });
  });

  it('el plan de otra carrera responde NoEncontrado con alcance de carrera', async () => {
    const caso = montar({ plan: plan('Borrador'), alcance: soloCarrera('car-iin') });
    await expect(caso.ejecutar('plan-1', ACTOR)).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('con alcance de carrera y sin carrera asignada no se lee ningún plan', async () => {
    const caso = montar({ plan: plan('Borrador'), alcance: soloCarrera(null) });
    await expect(caso.ejecutar('plan-1', ACTOR)).rejects.toBeInstanceOf(NoEncontrado);
  });
```

- [ ] **Step 3: Escribir los tests de `ConsultarHistorial` (fallan)**

En `consultar-historial.spec.ts`: leer primero el inicio de `montar` y de `repoPlanes` (`Read` del archivo hasta la línea ~95) para ver qué `carreraId` devuelven `planes.porId` y qué forma tiene `opciones.planes`. Después:

1. Import del puerto y dobles `sinRestriccion()` / `soloCarrera(...)` igual que arriba, tras las constantes del archivo.
2. Añadir `alcance?: AlcanceDeLecturaPort;` a `opciones` de `montar` y pasar `opciones.alcance ?? sinRestriccion()` como **último** argumento de `new ConsultarHistorial(...)`.
3. Añadir estos tests (`ISI` es la carrera que la política del archivo da a los planes; si `repoPlanes` usa otra constante para el `carreraId` del plan, usar esa en lugar de `ISI` en los `soloCarrera(...)` de los casos propios):

```ts
describe('RF-CH-009 — alcance de lectura del historial', () => {
  it('aprobacionesDe del plan propio devuelve los pasos', async () => {
    const { caso } = montar({ alcance: soloCarrera(ISI) });
    expect(await caso.aprobacionesDe(ACTOR, 'plan-a')).toHaveLength(1);
  });

  it('aprobacionesDe de un plan de otra carrera responde NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-iin') });
    await expect(caso.aprobacionesDe(ACTOR, 'plan-a')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('justificacionesDe de un plan de otra carrera responde NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-iin') });
    await expect(caso.justificacionesDe(ACTOR, 'plan-a')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin restricción se sigue leyendo cualquier plan', async () => {
    const { caso } = montar();
    expect(await caso.aprobacionesDe(ACTOR, 'plan-a')).toHaveLength(1);
  });
});
```

Y en el `describe` de comparar versiones que ya exista, o en uno nuevo al final si no hay, un test que use dos planes de otra carrera con `soloCarrera('car-iin')` y espere `NoEncontrado` de `compararVersiones(ACTOR, 'plan-a', 'plan-b')` (copiar del test existente de comparar la forma de `opciones.planes` con dos planes de la misma carrera).

- [ ] **Step 4: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-planes.spec.ts src/modules/plan-estudios/application/use-cases/consultar-plan.spec.ts src/modules/plan-estudios/application/use-cases/consultar-historial.spec.ts`
Expected: FAIL — los casos «ajena»/«sin carrera»/«fuerza la carrera» fallan porque los casos de uso todavía no consultan el alcance; los casos «sin restricción» y «propia» pasan.

- [ ] **Step 5: Implementar `GestionarPlanes`**

En `gestionar-planes.use-case.ts`: añadir el import del puerto junto al de `AuthorizationPort`, añadir `private readonly alcance: AlcanceDeLecturaPort,` como **último** parámetro del constructor (después de `generarId`) y reemplazar `listar` y `versionesDe` por:

```ts
  /**
   * RF024 / RF030 / RF031: listado con filtros combinables.
   *
   * RF-CH-009: quien solo lee su carrera recibe únicamente sus planes; el
   * `carreraId` que pida el filtro se sobrescribe. Antes la lectura no se
   * acotaba (un director podía consultar planes ajenos); el documento de
   * cambios lo revierte para el Director.
   */
  async listar(actor: Actor, filtro?: FiltroPlanes): Promise<ResumenPlan[]> {
    await this.exigir(actor, 'plan.leer', null);

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'CARRERA') {
      if (alcance.carreraId === null) return [];
      return (await this.planes.listar({ ...filtro, carreraId: alcance.carreraId })).map(resumen);
    }
    return (await this.planes.listar(filtro)).map(resumen);
  }

  /** RF076 / RF091: el histórico de versiones de una carrera. */
  async versionesDe(actor: Actor, carreraId: string): Promise<ResumenPlan[]> {
    await this.exigir(actor, 'plan.leer_historico', null);
    if (!(await this.alcance.puedeLeerCarrera(actor.id, carreraId))) {
      throw new NoEncontrado('la carrera', carreraId);
    }
    return (await this.planes.versionesDeCarrera(carreraId)).map(resumen);
  }
```

- [ ] **Step 6: Implementar `ConsultarPlan`**

En `consultar-plan.use-case.ts`: import del puerto, añadir `private readonly alcance: AlcanceDeLecturaPort,` como último parámetro del constructor y reemplazar el bloque de lectura de `ejecutar` (desde el comentario «La lectura no está acotada…» hasta el `if (!lectura.permitido) …`) por:

```ts
    // El permiso va primero: sin `plan.leer` es AccesoDenegado. Después el
    // alcance (RF-CH-009): un plan de otra carrera responde NoEncontrado, no
    // AccesoDenegado, para no revelar que existe. `plan.leer` sigue sin figurar
    // entre los permisos acotados de la política: el alcance de lectura lo
    // decide la marca `lectura.solo_su_carrera`, no la carrera del permiso.
    const lectura = await this.autorizacion.puede(actor.id, 'plan.leer', plan.carreraId);
    if (!lectura.permitido) throw new AccesoDenegado(lectura.motivo);
    if (!(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
```

- [ ] **Step 7: Implementar `ConsultarHistorial`**

En `consultar-historial.use-case.ts`: import del puerto, añadir `private readonly alcance: AlcanceDeLecturaPort,` como **último** parámetro del constructor (después de `eventos`), y:

- Reemplazar `exigirLectura` por:

```ts
  private async exigirLectura(actor: Actor, planId: string): Promise<void> {
    const plan = await this.planes.porId(planId);
    if (!plan) throw new NoEncontrado('el plan de estudios', planId);

    const decision = await this.autorizacion.puede(actor.id, 'plan.leer', plan.carreraId);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);

    // RF-CH-009: fuera de alcance responde NoEncontrado, como si no existiera.
    if (!(await this.alcance.puedeLeerCarrera(actor.id, plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
  }
```

- En `compararVersiones`, justo después de la comprobación `plan.leer_historico` (`if (!decision.permitido) throw new AccesoDenegado(decision.motivo);`), añadir:

```ts
    // Las dos versiones son de la misma carrera (comprobado arriba): basta mirar una.
    if (!(await this.alcance.puedeLeerCarrera(actor.id, a.carreraId))) {
      throw new NoEncontrado('el plan de estudios', idA);
    }
```

- [ ] **Step 8: Cablear en `app.module.ts`**

- `GestionarPlanes`: añadir `ALCANCE_DE_LECTURA` al final de `inject`, `alcance: AlcanceDeLecturaPort` al final de los parámetros del `useFactory` y pasar `alcance` como último argumento: `new GestionarPlanes(planes, contenido, autorizacion, eventos, { nuevo: () => randomUUID() }, alcance)`.
- `ConsultarPlan`: `inject: [REPOSITORIO_PLAN, REPOSITORIO_CONTENIDO, AUTHORIZATION_PORT, ALCANCE_DE_LECTURA]`, parámetro `alcance: AlcanceDeLecturaPort` y `new ConsultarPlan(planes, contenido, autorizacion, alcance)`.
- `ConsultarHistorial`: `ALCANCE_DE_LECTURA` al final de `inject`, `alcance: AlcanceDeLecturaPort` al final de los parámetros y `new ConsultarHistorial(planes, asignaturas, contenido, aprobaciones, autorizacion, eventos, alcance)`.
- Si el import del tipo `AlcanceDeLecturaPort` no estaba (Tarea 2 o 3), añadirlo ahora.

- [ ] **Step 9: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios && npx tsc --noEmit -p tsconfig.json`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 10: Suite completa y commit**

Run: `cd apps/api && npx vitest run && npx prettier --write src/modules/plan-estudios/application/use-cases/gestionar-planes.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-planes.spec.ts src/modules/plan-estudios/application/use-cases/consultar-plan.use-case.ts src/modules/plan-estudios/application/use-cases/consultar-plan.spec.ts src/modules/plan-estudios/application/use-cases/consultar-historial.use-case.ts src/modules/plan-estudios/application/use-cases/consultar-historial.spec.ts src/app.module.ts`
Expected: suite en verde.

```bash
git add apps/api/src
git commit -m "feat(plan-estudios): planes, detalle e historial se acotan al alcance de lectura del usuario (RF-CH-009)"
```

---

### Task 5: Asignaturas y Reportes acotados

**Files:**
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts`
- Modify: `apps/api/src/modules/plan-estudios/application/use-cases/consultar-reportes.use-case.ts`
- Test: `gestionar-asignaturas.spec.ts` (existente) y `consultar-reportes.spec.ts` (nuevo), mismo directorio
- Modify: `apps/api/src/app.module.ts` (fábricas de `GestionarAsignaturas` y `ConsultarReportes`)

**Interfaces:**
- Consumes (Tarea 2): `AlcanceDeLecturaPort`, `ALCANCE_DE_LECTURA`.
- Produces:
  - `new GestionarAsignaturas(asignaturas, planes, contenido, autorizacion, eventos, alcance)`
  - `new ConsultarReportes(reportes, autorizacion, alcance)`
  - `GestionarAsignaturas.listar/porId/impactoDeInactivar` responden `NoEncontrado` fuera de alcance; `ConsultarReportes.buscarPlanes` fuerza la carrera, `reporteDePlan` responde `NoEncontrado` fuera de alcance y `panel` responde `AccesoDenegado` a quien tiene alcance `CARRERA`.

- [ ] **Step 1: Escribir los tests de `GestionarAsignaturas` (fallan)**

En `gestionar-asignaturas.spec.ts`: import del puerto y, tras la constante `ISI`, los dobles `sinRestriccion()` y `soloCarrera(...)` (idénticos a los de las Tareas 3 y 4). En las `opciones` de `montar` añadir `alcance?: AlcanceDeLecturaPort;` y cambiar la construcción por:

```ts
  const caso = new GestionarAsignaturas(
    repo,
    planes,
    contenido,
    autorizacion,
    eventos,
    opciones.alcance ?? sinRestriccion(),
  );
```

Leer antes el helper `plan(...)` del archivo para confirmar que devuelve un plan de `carreraId: ISI`; si usa otra, ajustar los `soloCarrera(...)` de los casos propios. Al final del archivo:

```ts
describe('RF-CH-009 — alcance de lectura de asignaturas', () => {
  it('listar las asignaturas de un plan de la carrera propia', async () => {
    const { caso } = montar({ alcance: soloCarrera(ISI) });
    await expect(caso.listar(ACTOR, 'plan-1')).resolves.toBeDefined();
  });

  it('listar las de un plan de otra carrera responde NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-iin') });
    await expect(caso.listar(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sinCiclo hereda el mismo alcance', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-iin') });
    await expect(caso.sinCiclo(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('porId de una asignatura de otra carrera responde NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-iin') });
    await expect(caso.porId(ACTOR, 'asig-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('impactoDeInactivar de una asignatura de otra carrera responde NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera('car-iin') });
    await expect(caso.impactoDeInactivar(ACTOR, 'asig-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('con alcance de carrera y sin carrera asignada no se lee ninguna', async () => {
    const { caso } = montar({ alcance: soloCarrera(null) });
    await expect(caso.listar(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin restricción se lee cualquier plan', async () => {
    const { caso } = montar();
    await expect(caso.listar(ACTOR, 'plan-1')).resolves.toBeDefined();
  });
});
```

(Si el id de asignatura que el fake `porId` del repositorio acepta no es `'asig-1'`, usar el que use el resto del archivo: el fake devuelve la misma asignatura para cualquier id.)

- [ ] **Step 2: Escribir el spec nuevo de `ConsultarReportes` (falla)**

Crear `consultar-reportes.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Actor } from '../../../../shared-kernel/domain-events/domain-event.js';
import {
  AccesoDenegado,
  NoEncontrado,
} from '../../../../shared-kernel/errors/errores.js';
import type { AlcanceDeLecturaPort } from '../../../auth/application/ports/alcance-de-lectura.port.js';
import type { AuthorizationPort } from '../../../auth/application/ports/authorization.port.js';
import type {
  DatosReportePlan,
  FiltroBusqueda,
  RepositorioReportesPort,
} from '../ports/reportes.port.js';
import { ConsultarReportes } from './consultar-reportes.use-case.js';

const ACTOR: Actor = { id: 'u-1', nombre: 'Director de Sistemas' };
const ISI = 'car-isi';
const IIN = 'car-iin';

function sinRestriccion(): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'TODAS' }),
    puedeLeerCarrera: async () => true,
  };
}

function soloCarrera(carreraId: string | null): AlcanceDeLecturaPort {
  return {
    alcanceDeLectura: async () => ({ tipo: 'CARRERA', carreraId }),
    puedeLeerCarrera: async (_usuarioId, carrera) => carreraId !== null && carrera === carreraId,
  };
}

function datosDePlan(carreraId: string): DatosReportePlan {
  return {
    plan: { id: 'plan-1', codigo: 'PE-ISI-2026-v1', version: 1, estado: 'Vigente', carreraId },
    carrera: 'Sistemas',
    facultad: 'Ingeniería',
    asignaturas: [],
    ciclos: [],
  };
}

function montar(
  opciones: {
    alcance?: AlcanceDeLecturaPort;
    plan?: DatosReportePlan | null;
    permitido?: boolean;
  } = {},
) {
  const busquedas: FiltroBusqueda[] = [];
  let paneles = 0;

  // Solo lo que este caso de uso toca del repositorio.
  const reportes = {
    buscarPlanes: async (filtro: FiltroBusqueda) => {
      busquedas.push(filtro);
      return [];
    },
    datosDePlan: async () => (opciones.plan === undefined ? datosDePlan(ISI) : opciones.plan),
    panel: async () => {
      paneles += 1;
      return {
        facultades: 0,
        carreras: 0,
        planesPorEstado: [],
        asignaturas: 0,
        competencias: 0,
        objetivos: 0,
        carrerasSinPlanVigente: [],
        atributosSinCubrir: [],
        totalAtributos: 0,
      };
    },
  } as unknown as RepositorioReportesPort;

  const autorizacion = {
    puede: async () =>
      opciones.permitido === false
        ? { permitido: false as const, motivo: 'Falta el permiso plan.leer.' }
        : { permitido: true as const },
  } as unknown as AuthorizationPort;

  const caso = new ConsultarReportes(reportes, autorizacion, opciones.alcance ?? sinRestriccion());
  return { caso, busquedas, paneles: () => paneles };
}

describe('buscarPlanes', () => {
  it('sin restricción respeta el filtro que se pide', async () => {
    const { caso, busquedas } = montar();
    await caso.buscarPlanes(ACTOR, { carreraId: IIN });
    expect(busquedas[0]?.carreraId).toBe(IIN);
  });

  it('con alcance de carrera fuerza la carrera propia aunque se pida otra', async () => {
    const { caso, busquedas } = montar({ alcance: soloCarrera(ISI) });
    await caso.buscarPlanes(ACTOR, { carreraId: IIN, texto: 'sist' });
    expect(busquedas[0]).toMatchObject({ carreraId: ISI, texto: 'sist' });
  });

  it('con alcance de carrera y sin carrera asignada devuelve la lista vacía sin consultar', async () => {
    const { caso, busquedas } = montar({ alcance: soloCarrera(null) });
    expect(await caso.buscarPlanes(ACTOR, {})).toEqual([]);
    expect(busquedas).toEqual([]);
  });

  it('sin plan.leer es AccesoDenegado antes de mirar el alcance', async () => {
    const { caso } = montar({ permitido: false, alcance: soloCarrera(ISI) });
    await expect(caso.buscarPlanes(ACTOR, {})).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe('reporteDePlan', () => {
  it('el plan de la carrera propia devuelve su reporte', async () => {
    const { caso } = montar({ alcance: soloCarrera(ISI) });
    await expect(caso.reporteDePlan(ACTOR, 'plan-1')).resolves.toMatchObject({
      plan: { id: 'plan-1' },
    });
  });

  it('el plan de otra carrera responde NoEncontrado', async () => {
    const { caso } = montar({ alcance: soloCarrera(IIN) });
    await expect(caso.reporteDePlan(ACTOR, 'plan-1')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('un plan inexistente responde NoEncontrado', async () => {
    const { caso } = montar({ plan: null });
    await expect(caso.reporteDePlan(ACTOR, 'x')).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('sin restricción lee el reporte de cualquier plan', async () => {
    const { caso } = montar({ plan: datosDePlan(IIN) });
    await expect(caso.reporteDePlan(ACTOR, 'plan-1')).resolves.toBeDefined();
  });
});

describe('panel institucional', () => {
  it('sin restricción devuelve el panel', async () => {
    const { caso, paneles } = montar();
    await caso.panel(ACTOR);
    expect(paneles()).toBe(1);
  });

  it('con alcance de carrera responde AccesoDenegado y no consulta los agregados', async () => {
    const { caso, paneles } = montar({ alcance: soloCarrera(ISI) });
    await expect(caso.panel(ACTOR)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(paneles()).toBe(0);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts src/modules/plan-estudios/application/use-cases/consultar-reportes.spec.ts`
Expected: FAIL — en asignaturas, los casos «otra carrera» y «sin carrera» no fallan todavía; en reportes, el spec entero falla o los casos de alcance no se cumplen porque el constructor aún no recibe el puerto.

- [ ] **Step 4: Implementar `GestionarAsignaturas`**

En `gestionar-asignaturas.use-case.ts`: import del puerto, `private readonly alcance: AlcanceDeLecturaPort,` como **último** parámetro del constructor (después de `eventos`) y un método privado nuevo junto a `exigirPlan`/`exigir`:

```ts
  /**
   * RF-CH-009: fuera de alcance responde NoEncontrado, como si el recurso no
   * existiera. Va después del permiso: sin `asignatura.leer` sigue siendo
   * AccesoDenegado.
   */
  private async exigirAlcance(
    actor: Actor,
    carreraId: string,
    recurso: string,
    id: string,
  ): Promise<void> {
    if (!(await this.alcance.puedeLeerCarrera(actor.id, carreraId))) {
      throw new NoEncontrado(recurso, id);
    }
  }
```

y en las tres lecturas, justo después de su `await this.exigir(actor, 'asignatura.leer', plan.carreraId);`:

- `listar` (recurso `'el plan de estudios'`, id `planId`): `await this.exigirAlcance(actor, plan.carreraId, 'el plan de estudios', planId);`
- `porId` (recurso `'la asignatura'`, id `id`): `await this.exigirAlcance(actor, plan.carreraId, 'la asignatura', id);`
- `impactoDeInactivar` (recurso `'la asignatura'`, id `id`): `await this.exigirAlcance(actor, plan.carreraId, 'la asignatura', id);`

(`sinCiclo` delega en `listar`, así que hereda la comprobación.)

- [ ] **Step 5: Implementar `ConsultarReportes`**

En `consultar-reportes.use-case.ts`: import del puerto (`AlcanceDeLecturaPort`) y de `AccesoDenegado` si no estuviera, `private readonly alcance: AlcanceDeLecturaPort,` como **último** parámetro del constructor y reemplazar `buscarPlanes`, `reporteDePlan` (solo su arranque), `panel` y el comentario/método `exigirLectura`:

```ts
  /** Búsqueda global: por código de plan, carrera o facultad, a la vez. */
  async buscarPlanes(actor: Actor, filtro: FiltroBusqueda): Promise<PlanEncontrado[]> {
    await this.exigirLectura(actor);

    // RF-CH-009: quien solo lee su carrera busca únicamente entre sus planes; el
    // `carreraId` que pida el filtro se sobrescribe.
    let acotado = filtro;
    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'CARRERA') {
      if (alcance.carreraId === null) return [];
      acotado = { ...filtro, carreraId: alcance.carreraId };
    }

    return this.reportes.buscarPlanes({
      ...acotado,
      limite: Math.min(filtro.limite ?? LIMITE_MAXIMO, LIMITE_MAXIMO),
    });
  }
```

En `reporteDePlan`, justo después de `if (!datos) throw new NoEncontrado('el plan de estudios', planId);`:

```ts
    // RF-CH-009: fuera de alcance responde NoEncontrado, como si no existiera.
    if (!(await this.alcance.puedeLeerCarrera(actor.id, datos.plan.carreraId))) {
      throw new NoEncontrado('el plan de estudios', planId);
    }
```

Reemplazar `panel` y `exigirLectura` por:

```ts
  /**
   * Panel estadístico general.
   *
   * Es institucional: agrega todas las carreras y no se acota. Quien solo lee su
   * carrera (RF-CH-009) no puede verlo sin ver datos de las demás; un panel «solo
   * de mi carrera» sería otro producto y se pediría como requisito aparte.
   */
  async panel(actor: Actor): Promise<DatosPanel> {
    await this.exigirLectura(actor);

    const alcance = await this.alcance.alcanceDeLectura(actor.id);
    if (alcance.tipo === 'CARRERA') {
      throw new AccesoDenegado(
        'El panel general es institucional: tu acceso se limita a los datos de tu carrera.',
      );
    }
    return this.reportes.panel(MARCO_VIGENTE);
  }

  /**
   * El permiso. El alcance por carrera (RF-CH-009) se aplica aparte, en cada
   * lectura: la marca `lectura.solo_su_carrera` acota lo que el rol ya puede leer.
   */
  private async exigirLectura(actor: Actor): Promise<void> {
    const decision = await this.autorizacion.puede(actor.id, 'plan.leer', null);
    if (!decision.permitido) throw new AccesoDenegado(decision.motivo);
  }
```

- [ ] **Step 6: Cablear en `app.module.ts`**

- `GestionarAsignaturas`: `ALCANCE_DE_LECTURA` al final de `inject`, `alcance: AlcanceDeLecturaPort` al final de los parámetros y `new GestionarAsignaturas(asignaturas, planes, contenido, autorizacion, eventos, alcance)`.
- `ConsultarReportes`: `inject: [REPOSITORIO_REPORTES, AUTHORIZATION_PORT, ALCANCE_DE_LECTURA]` y

```ts
      useFactory: (
        reportes: RepositorioReportesPort,
        autorizacion: AuthorizationPort,
        alcance: AlcanceDeLecturaPort,
      ) => new ConsultarReportes(reportes, autorizacion, alcance),
```

- [ ] **Step 7: Ejecutar y ver que pasan**

Run: `cd apps/api && npx vitest run src/modules/plan-estudios && npx tsc --noEmit -p tsconfig.json`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 8: Suite completa, lint y commit**

Run: `cd apps/api && npx vitest run && npx eslint src/modules/plan-estudios src/modules/academico src/modules/auth src/app.module.ts && npx prettier --write src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.use-case.ts src/modules/plan-estudios/application/use-cases/gestionar-asignaturas.spec.ts src/modules/plan-estudios/application/use-cases/consultar-reportes.use-case.ts src/modules/plan-estudios/application/use-cases/consultar-reportes.spec.ts src/app.module.ts`
Expected: suite en verde y sin errores de lint.

```bash
git add apps/api/src
git commit -m "feat(plan-estudios): asignaturas y reportes se acotan al alcance de lectura del usuario (RF-CH-009)

El panel general de Reportes es institucional y responde AccesoDenegado a quien
solo lee su carrera."
```

---

### Task 6: Web — «Facultades» y rutas del plan para el Administrador

**Files:**
- Modify: `apps/web/src/features/auth/components/RutaConPermiso.tsx`
- Test: `apps/web/src/features/auth/components/RutaConPermiso.test.tsx`
- Modify: `apps/web/src/app/App.tsx` (rutas del plan)
- Test: `apps/web/src/app/RutasDeLaAplicacion.test.tsx`
- Modify: `apps/web/src/app/AppLayout.tsx` (etiqueta alternativa por permiso)
- Test: `apps/web/src/app/AppLayout.test.tsx`
- Modify: `apps/web/src/features/plan-estudios/api/queries.ts` (`usePlanes` con `enabled`)
- Modify: `apps/web/src/features/plan-estudios/pages/FacultadesPage.tsx` y `CarrerasPage.tsx` (migas y consulta de planes)

**Interfaces:**
- Produces: `RutaConPermiso({ permiso, redirigirA? })` con `redirigirA` por defecto `'/'`; `EnlaceNav`/`SeccionNav` con `sinPermiso?: { readonly permiso: string; readonly etiqueta: string }`; `usePlanes(filtros?, opciones?: { enabled?: boolean })`.

- [ ] **Step 1: Escribir los tests (fallan)**

En `RutaConPermiso.test.tsx`, dentro del `describe('RutaConPermiso', …)`, añadir:

```tsx
  it('redirige al destino indicado en vez de a "/" cuando se pide otro', () => {
    render(
      <ContextoSesion.Provider value={{ ...sesionBase, puede: () => false }}>
        <MemoryRouter initialEntries={['/protegida']}>
          <Routes>
            <Route path="/" element={<div>inicio</div>} />
            <Route path="/otra" element={<div>otra pantalla</div>} />
            <Route element={<RutaConPermiso permiso="mejora.leer" redirigirA="/otra" />}>
              <Route path="/protegida" element={<div>contenido protegido</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSesion.Provider>,
    );

    expect(screen.getByText('otra pantalla')).toBeInTheDocument();
    expect(screen.queryByText('inicio')).not.toBeInTheDocument();
  });
```

En `RutasDeLaAplicacion.test.tsx`, dentro del `describe`, añadir:

```tsx
  /** Lo que conserva el Administrador desde el Bloque 3: entra al módulo pero no lee planes. */
  const COMO_ADMINISTRADOR = ['plan.acceder', 'facultad.leer', 'carrera.leer'];

  it.each([
    '/plan-estudios/planes/p1',
    '/plan-estudios/planes/p1/objetivos',
    '/plan-estudios/planes/p1/asignaturas',
    '/plan-estudios/planes/p1/malla',
  ])('el Administrador que teclea %s vuelve al listado de facultades', async (ruta) => {
    montarEn(ruta, COMO_ADMINISTRADOR);

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/plan-estudios$/));
  });

  it('el Administrador se queda en el listado de facultades', async () => {
    montarEn('/plan-estudios', COMO_ADMINISTRADOR);

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/plan-estudios$/));
  });

  it('con plan.leer se entra al detalle de un plan', async () => {
    montarEn('/plan-estudios/planes/p1', ['plan.acceder', 'plan.leer']);

    await waitFor(() =>
      expect(screen.getByTestId('ruta')).toHaveTextContent('/plan-estudios/planes/p1'),
    );
  });
```

En `AppLayout.test.tsx`, primero **ajustar un test que ya existe**: en `describe('AppLayout — entrada «Plan de Estudios»')`, el test `'aparece cuando el usuario tiene plan.acceder'` da hoy solo `plan.acceder` y espera el enlace «Plan de Estudios»; con la etiqueta nueva ese usuario vería «Facultades». Cambiar su `puede` a `(permiso: string) => permiso === 'plan.acceder' || permiso === 'plan.leer'` y su título a `'aparece como «Plan de Estudios» cuando el usuario tiene plan.acceder y plan.leer'`. Los otros dos tests de ese `describe` siguen valiendo tal cual.

Después, al final del archivo (antes de `function CapturaUbicacion` si sigue ahí o después del último `describe`):

```tsx
describe('AppLayout — el módulo se llama «Facultades» para quien no lee planes (RF-CH-007)', () => {
  it('sin plan.leer el enlace y su sección dicen «Facultades»', () => {
    montar({
      puede: (permiso: string) => permiso === 'plan.acceder',
    });

    expect(screen.getByRole('link', { name: 'Facultades' })).toHaveAttribute(
      'href',
      '/plan-estudios',
    );
    expect(screen.queryByRole('link', { name: 'Plan de Estudios' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Facultades' })).toBeInTheDocument();
  });

  it('con plan.leer sigue diciendo «Plan de Estudios»', () => {
    montar({
      puede: (permiso: string) => permiso === 'plan.acceder' || permiso === 'plan.leer',
    });

    expect(screen.getByRole('link', { name: 'Plan de Estudios' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Facultades' })).not.toBeInTheDocument();
  });
});
```

El botón de la sección se llama por su título (es el `button` con `aria-expanded`); hoy el título es «Plan de estudios» (con minúscula), por eso el de «Facultades» se comprueba solo en el primer test. Verificar al ejecutar que `getByRole('button', { name: 'Facultades' })` encuentra el botón de sección y no otro elemento; si hubiera ambigüedad, acotar con `within(screen.getByRole('navigation'))`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/features/auth/components/RutaConPermiso.test.tsx src/app`
Expected: FAIL — `redirigirA` se ignora (redirige a `/`), el Administrador que teclea una ruta del plan **entra** al plan (aún no hay guard `plan.leer`) y el menú sigue diciendo «Plan de Estudios».

- [ ] **Step 3: Implementar `RutaConPermiso`**

En `RutaConPermiso.tsx`, actualizar el comentario de cabecera con un párrafo (`redirigirA`: a dónde se manda a quien no tiene el permiso; por defecto `/`, el resumen, que es un destino válido para cualquier rol autenticado) y reemplazar el componente por:

```tsx
export function RutaConPermiso({
  permiso,
  redirigirA = '/',
}: {
  permiso: string;
  /** A dónde se manda a quien no tiene el permiso. Por defecto, el resumen. */
  redirigirA?: string;
}) {
  const { puede } = useSesion();

  if (!puede(permiso)) return <Navigate to={redirigirA} replace />;

  return <Outlet />;
}
```

- [ ] **Step 4: Implementar el guard de las rutas del plan**

En `App.tsx`, dentro de `RutasDeLaAplicacion`, en el grupo `<Route element={<RutaConPermiso permiso="plan.acceder" />}>`, dejar `plan-estudios` y `plan-estudios/facultades/:facultadId` donde están y meter el resto (`planes/:planId`, `objetivos`, `competencias`, `asignaturas`, `malla` y el subgrupo `docentes`) bajo un grupo nuevo:

```tsx
                  <Route element={<RutaConPermiso permiso="plan.leer" redirigirA="/plan-estudios" />}>
                    <Route path="plan-estudios/planes/:planId" element={<PlanEstudiosPage />} />
                    {/* …las rutas objetivos, competencias, asignaturas y malla, sin cambios… */}
                    {/* …y el grupo docentes con su guard docente.gestionar, sin cambios… */}
                  </Route>
```

Mover el contenido existente tal cual; solo cambia el `Route` que lo envuelve.

- [ ] **Step 5: Implementar la etiqueta alternativa del menú**

En `AppLayout.tsx`:

- Añadir a `EnlaceNav` y a `SeccionNav`:

```ts
  /**
   * Etiqueta alternativa: si el usuario NO tiene `permiso`, se muestra `etiqueta`
   * en lugar de la habitual. Sirve para que el módulo Plan de Estudios se llame
   * «Facultades» cuando el usuario no lee planes (RF-CH-007).
   */
  readonly sinPermiso?: { readonly permiso: string; readonly etiqueta: string };
```

- En `SECCIONES`, la sección del plan pasa a:

```ts
  {
    titulo: 'Plan de estudios',
    sinPermiso: { permiso: 'plan.leer', etiqueta: 'Facultades' },
    enlaces: [
      {
        a: '/plan-estudios',
        etiqueta: 'Plan de Estudios',
        sinPermiso: { permiso: 'plan.leer', etiqueta: 'Facultades' },
        icono: IconoPlan,
        exacto: false,
        permiso: 'plan.acceder',
      },
    ],
  },
```

- En el render del menú, junto a `visibles`, añadir un helper local y usarlo:

```tsx
            {SECCIONES.map((seccion) => {
              const etiquetaDe = (
                habitual: string,
                alternativa?: { readonly permiso: string; readonly etiqueta: string },
              ) => (alternativa && !puede(alternativa.permiso) ? alternativa.etiqueta : habitual);
              const tituloSeccion =
                seccion.titulo === null
                  ? null
                  : etiquetaDe(seccion.titulo, seccion.sinPermiso);
```

y sustituir, en ese bloque: `visibles.map(({ a, etiqueta, icono: Icono, exacto }) => …` por `visibles.map(({ a, etiqueta, sinPermiso, icono: Icono, exacto }) => …` mostrando `{etiquetaDe(etiqueta, sinPermiso)}` en lugar de `{etiqueta}`, y todos los usos de `seccion.titulo` posteriores a la comprobación de `null` (`colapsadas.has(...)`, `key`, `alternarSeccion(...)` y el texto del botón) por `tituloSeccion`.

- [ ] **Step 6: `usePlanes` con `enabled` y migas de las pantallas**

En `queries.ts`, reemplazar `usePlanes` por:

```ts
export function usePlanes(
  filtros?: { carreraId?: string; estado?: string },
  opciones?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: claves.planes(filtros),
    queryFn: () => api.listarPlanes(filtros),
    enabled: opciones?.enabled ?? true,
  });
}
```

En `CarrerasPage.tsx`: la línea `const { data: planes } = usePlanes();` pasa a `const { data: planes } = usePlanes(undefined, { enabled: puede('plan.leer') });` (moviendo la desestructuración `const { puede, puedeEn } = useSesion();` **antes** de esa línea) y las migas del `useEffect` pasan a:

```tsx
    publicar({
      migas:
        puede('plan.leer')
          ? [
              { etiqueta: 'Plan de Estudios', a: '/plan-estudios' },
              { etiqueta: 'Facultades', a: '/plan-estudios' },
              { etiqueta: facultad?.nombre ?? 'Carreras' },
            ]
          : [
              { etiqueta: 'Facultades', a: '/plan-estudios' },
              { etiqueta: facultad?.nombre ?? 'Carreras' },
            ],
      acciones: null,
    });
```

En `FacultadesPage.tsx` añadir `const { puede } = useSesion();` (importar `useSesion` de `@/features/auth/hooks/contexto-sesion` si no estuviera) y cambiar las migas a `migas: puede('plan.leer') ? [{ etiqueta: 'Plan de Estudios', a: '/plan-estudios' }, { etiqueta: 'Facultades' }] : [{ etiqueta: 'Facultades' }]`.

- [ ] **Step 7: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run src/features/auth src/app src/features/plan-estudios && npx tsc -b`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 8: Suite completa, lint y commit**

Run: `cd apps/web && npx vitest run && npx eslint src/app src/features/auth src/features/plan-estudios && npx prettier --write src/features/auth/components/RutaConPermiso.tsx src/features/auth/components/RutaConPermiso.test.tsx src/app/App.tsx src/app/AppLayout.tsx src/app/AppLayout.test.tsx src/app/RutasDeLaAplicacion.test.tsx src/features/plan-estudios/api/queries.ts src/features/plan-estudios/pages/FacultadesPage.tsx src/features/plan-estudios/pages/CarrerasPage.tsx`
Expected: suite en verde y sin errores de lint.

```bash
git add apps/web/src
git commit -m "feat(web): el módulo se llama «Facultades» para el Administrador y el plan le queda cerrado (RF-CH-007 y 008)"
```

---

### Task 7: Web — el Director ve solo su carrera y Reportes sin panel

**Files:**
- Modify: `apps/web/src/features/plan-estudios/pages/CarrerasPage.tsx` (prop `modo`)
- Create: `apps/web/src/features/plan-estudios/pages/EntradaPlanEstudios.tsx`
- Test: `apps/web/src/features/plan-estudios/pages/CarrerasPage.test.tsx` (nuevo) y `EntradaPlanEstudios.test.tsx` (nuevo)
- Modify: `apps/web/src/app/App.tsx` (elemento de la ruta `plan-estudios`)
- Modify: `apps/web/src/features/reportes/pages/ReportesPage.tsx`
- Test: `apps/web/src/features/reportes/pages/ReportesPage.test.tsx` (nuevo)

**Interfaces:**
- Consumes (Tarea 6): `usePlanes(filtros, { enabled })`.
- Produces: `CarrerasPage({ modo?: 'facultad' | 'mi-carrera' })`; `EntradaPlanEstudios` (elige `CarrerasPage modo="mi-carrera"` o `FacultadesPage` según `puede('lectura.solo_su_carrera')`); `ReportesPage` que no ofrece «Panel general» a quien tiene esa marca.

- [ ] **Step 1: Escribir los tests de `CarrerasPage` (fallan)**

Crear `apps/web/src/features/plan-estudios/pages/CarrerasPage.test.tsx`. Antes, leer `apps/web/src/app/encabezado.tsx` (contexto `CtxEncabezado` y el tipo `ContextoEncabezado`) y `apps/web/src/features/plan-estudios/api/plan-estudios.api.ts` (formas de `Carrera` y del plan que devuelve `listarPlanes`) para construir los datos; el test:

```tsx
/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CtxEncabezado, type ContextoEncabezado } from '@/app/encabezado';
import { ContextoSesion, type ValorSesion } from '@/features/auth/hooks/contexto-sesion';

import * as api from '../api/plan-estudios.api';
import { CarrerasPage } from './CarrerasPage';

const carreraIsi = {
  id: 'c1',
  facultadId: 'f1',
  nombre: 'Ingeniería de Sistemas',
  codigo: 'ISI',
  duracionAnios: 5,
  estado: 'Activo' as const,
};

function montar(opciones: { permisos: readonly string[]; modo?: 'facultad' | 'mi-carrera' }) {
  const migas: string[][] = [];
  const encabezado: ContextoEncabezado = {
    publicar: (e) => void migas.push(e.migas.map((m) => m.etiqueta)),
  };
  const tiene = (p: string) => opciones.permisos.includes(p);
  const sesion: ValorSesion = {
    identidad: { id: 'u1', nombre: 'Usuario', permisos: [...opciones.permisos], roles: [], carreraACargo: 'c1' },
    cargando: false,
    puede: tiene,
    dirigeCarrera: () => true,
    puedeEn: tiene,
    roles: [],
    vistaActiva: null,
    cambiarVista: () => undefined,
    entrar: () => undefined,
    salir: () => Promise.resolve(),
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContextoSesion.Provider value={sesion}>
        <CtxEncabezado.Provider value={encabezado}>
          <MemoryRouter>
            <CarrerasPage {...(opciones.modo ? { modo: opciones.modo } : {})} />
          </MemoryRouter>
        </CtxEncabezado.Provider>
      </ContextoSesion.Provider>
    </QueryClientProvider>,
  );
  return { migas };
}

afterEach(() => vi.restoreAllMocks());

describe('CarrerasPage — modo mi-carrera (Director, RF-CH-009)', () => {
  it('muestra su carrera como una sola tarjeta, con «Mi carrera» como título', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    montar({ permisos: ['carrera.leer', 'plan.crear', 'plan.leer'], modo: 'mi-carrera' });

    expect(await screen.findByRole('heading', { name: 'Mi carrera' })).toBeInTheDocument();
    expect(await screen.findAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Crear plan' })).toBeInTheDocument();
  });

  it('no ofrece el buscador, el filtro de estado ni el enlace a facultades', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    montar({ permisos: ['carrera.leer', 'plan.leer'], modo: 'mi-carrera' });

    await screen.findAllByRole('article');
    expect(screen.queryByLabelText('Buscar carrera')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filtrar por estado')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Volver a facultades' })).not.toBeInTheDocument();
  });

  it('sin carrera asignada (lista vacía) muestra un aviso en vez de la tarjeta', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    montar({ permisos: ['carrera.leer', 'plan.leer'], modo: 'mi-carrera' });

    expect(await screen.findByText(/no tienes una carrera asignada/i)).toBeInTheDocument();
  });

  it('publica una sola miga: «Plan de Estudios»', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    const { migas } = montar({ permisos: ['carrera.leer', 'plan.leer'], modo: 'mi-carrera' });

    await screen.findAllByRole('article');
    expect(migas.at(-1)).toEqual(['Plan de Estudios']);
  });
});

describe('CarrerasPage — el Administrador (RF-CH-008)', () => {
  it('sin plan.leer no pide los planes y las migas dicen «Facultades»', async () => {
    vi.spyOn(api, 'listarFacultades').mockResolvedValue([]);
    vi.spyOn(api, 'listarCarreras').mockResolvedValue([carreraIsi]);
    const planes = vi.spyOn(api, 'listarPlanes').mockResolvedValue([]);
    const { migas } = montar({ permisos: ['carrera.leer'] });

    await screen.findAllByRole('article');
    expect(planes).not.toHaveBeenCalled();
    expect(migas.at(-1)?.[0]).toBe('Facultades');
    expect(screen.queryByRole('button', { name: /plan/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Escribir los tests de `EntradaPlanEstudios` y de `ReportesPage` (fallan)**

Crear `EntradaPlanEstudios.test.tsx` en el mismo directorio: con `vi.mock('./CarrerasPage', …)` y `vi.mock('./FacultadesPage', …)` que rendericen `<div>modo mi carrera</div>` y `<div>listado de facultades</div>` (el de `CarrerasPage` debe además exponer el `modo` recibido: `CarrerasPage: ({ modo }: { modo?: string }) => <div>carreras {modo}</div>`), montar `<EntradaPlanEstudios />` dentro de un `ContextoSesion.Provider` con `puede` configurable y comprobar:

```tsx
  it('con lectura.solo_su_carrera muestra CarrerasPage en modo mi-carrera', () => {
    montar((p) => p === 'lectura.solo_su_carrera');
    expect(screen.getByText('carreras mi-carrera')).toBeInTheDocument();
    expect(screen.queryByText('listado de facultades')).not.toBeInTheDocument();
  });

  it('sin esa marca muestra el listado de facultades', () => {
    montar(() => false);
    expect(screen.getByText('listado de facultades')).toBeInTheDocument();
  });
```

Crear `apps/web/src/features/reportes/pages/ReportesPage.test.tsx`: montar `<ReportesPage />` con un `ContextoSesion.Provider` (mismo `ValorSesion` base de los demás tests, con `puede` configurable), `MemoryRouter` y `QueryClientProvider`; simular con `vi.mock('../api/reportes.api', …)` las tres consultas (`panel`, `buscarPlanes`/la de búsqueda y la de accesos; leer `reportes.api.ts` para los nombres exactos) devolviendo estructuras vacías válidas. Tests:

```tsx
  it('con la marca de alcance de carrera no ofrece la pestaña «Panel general» y abre en la búsqueda', async () => {
    montar((p) => p === 'lectura.solo_su_carrera' || p === 'plan.leer');
    expect(screen.queryByRole('button', { name: 'Panel general' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Búsqueda de planes' })).toBeInTheDocument();
  });

  it('sin la marca ofrece «Panel general» y abre en él', () => {
    montar((p) => p === 'plan.leer');
    expect(screen.getByRole('button', { name: 'Panel general' })).toBeInTheDocument();
  });
```

(La pestaña es un `Pestanya`; comprobar en el DOM su rol real —`tab` o `button`— con `screen.debug()` en la primera ejecución y ajustar el `getByRole` de estos dos tests.)

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd apps/web && npx vitest run src/features/plan-estudios/pages src/features/reportes`
Expected: FAIL — `CarrerasPage` no acepta `modo`, `EntradaPlanEstudios` no existe y `ReportesPage` siempre ofrece «Panel general».

- [ ] **Step 4: Implementar el modo `mi-carrera` en `CarrerasPage`**

En `CarrerasPage.tsx`:

- Firma: `export function CarrerasPage({ modo = 'facultad' }: { modo?: 'facultad' | 'mi-carrera' } = {}) {` y `const miCarrera = modo === 'mi-carrera';`.
- Migas del `useEffect`: si `miCarrera`, `[{ etiqueta: 'Plan de Estudios' }]`; si no, las de la Tarea 6.
- Cabecera: `titulo={miCarrera ? 'Mi carrera' : (facultad?.nombre ?? 'Carreras')}`, `descripcion={miCarrera ? 'La carrera a tu cargo y su plan de estudios.' : 'Carreras profesionales asociadas a esta facultad.'}`; el enlace «Volver a facultades» solo se renderiza si `!miCarrera`.
- La barra de búsqueda y el `Selector` de estado (el `div` con `mb-5 flex flex-wrap gap-3`) solo se renderizan si `!miCarrera`; el aviso de facultad inactiva también.
- Estado vacío: si `miCarrera` y no hay carreras, `EstadoVacio` con `titulo="Sin carrera asignada"` y `detalle="No tienes una carrera asignada. Pide a un administrador que te la asigne para poder gestionar su plan de estudios."`.

- [ ] **Step 5: Implementar `EntradaPlanEstudios` y la ruta**

Crear `EntradaPlanEstudios.tsx`:

```tsx
/**
 * Qué ve quien abre «Plan de Estudios» (RF-CH-009).
 *
 * Quien solo lee su carrera no navega por facultades: ve una sola tarjeta, la de
 * su carrera. El resto ve el listado de facultades de siempre. Se decide por la
 * marca `lectura.solo_su_carrera`, la misma que acota las lecturas del API, y no
 * por el nombre del rol.
 */

import { useSesion } from '@/features/auth/hooks/contexto-sesion';

import { CarrerasPage } from './CarrerasPage';
import { FacultadesPage } from './FacultadesPage';

export function EntradaPlanEstudios() {
  const { puede } = useSesion();

  if (puede('lectura.solo_su_carrera')) return <CarrerasPage modo="mi-carrera" />;
  return <FacultadesPage />;
}
```

En `App.tsx`, importar `EntradaPlanEstudios` y cambiar `<Route path="plan-estudios" element={<FacultadesPage />} />` por `<Route path="plan-estudios" element={<EntradaPlanEstudios />} />` (mantener el import de `FacultadesPage` si se sigue usando en otro sitio; si no, quitarlo).

- [ ] **Step 6: Implementar la pestaña de Reportes**

En `ReportesPage.tsx`: leer la sesión con la marca y adaptar el estado inicial y la pestaña:

```tsx
export function ReportesPage() {
  const { puede } = useSesion();
  // El panel general es institucional: el API se lo niega a quien solo lee su
  // carrera (RF-CH-009), así que ni se ofrece ni es la pestaña de partida.
  const verPanel = !puede('lectura.solo_su_carrera');
  const [pestana, setPestana] = useState<Pestana>(verPanel ? 'panel' : 'busqueda');
```

(La línea `const { puede } = useSesion();` que ya existe más abajo se elimina para no duplicarla.) Y envolver la pestaña y su contenido:

```tsx
        {verPanel && (
          <Pestanya activa={pestana === 'panel'} onClick={() => setPestana('panel')}>
            Panel general
          </Pestanya>
        )}
```

```tsx
      {pestana === 'panel' && verPanel && <PanelGeneral />}
```

- [ ] **Step 7: Ejecutar y ver que pasan**

Run: `cd apps/web && npx vitest run src/features/plan-estudios src/features/reportes src/app && npx tsc -b`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 8: Suite completa, lint y commit**

Run: `cd apps/web && npx vitest run && npx eslint src/features/plan-estudios src/features/reportes src/app && npx prettier --write src/features/plan-estudios/pages/CarrerasPage.tsx src/features/plan-estudios/pages/CarrerasPage.test.tsx src/features/plan-estudios/pages/EntradaPlanEstudios.tsx src/features/plan-estudios/pages/EntradaPlanEstudios.test.tsx src/features/reportes/pages/ReportesPage.tsx src/features/reportes/pages/ReportesPage.test.tsx src/app/App.tsx`
Expected: suite en verde y sin errores de lint.

```bash
git add apps/web/src
git commit -m "feat(web): el Director ve solo su carrera y Reportes no le ofrece el panel general (RF-CH-009)"
```

---

### Task 8: e2e — «Facultades» para el Administrador y alcance del Director

**Files:**
- Create: `tests/e2e/specs/alcance-de-lectura.spec.ts`

**Interfaces:**
- Consumes (Tareas 1 a 7): la matriz nueva, el alcance en el API y la web. Usa las cuentas `admin` y `director` que ya crea `global-setup`.

- [ ] **Step 1: Escribir el spec**

Crear `tests/e2e/specs/alcance-de-lectura.spec.ts`:

```ts
/**
 * «Facultades» para el Administrador (RF-CH-007 y 008) y alcance de lectura del
 * Director (RF-CH-009), contra la API real.
 *
 * El alcance se prueba con una segunda carrera que el Administrador crea por API:
 * la base de esta suite solo trae la carrera E2E. No hay endpoint para borrar
 * carreras (solo inactivarlas), así que cada corrida deja una carrera y una
 * facultad con nombre único; es el precio de probar «una carrera que no es la
 * tuya» sin depender de datos sembrados aparte.
 */

import type { APIRequestContext } from '@playwright/test';

import { tokenDe } from '../fixtures/api';
import { expect, test } from '../fixtures/sesion';
import { API } from '../global-setup';

function cabeceras(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

/** Una carrera ajena a la del Director, creada por el Administrador. */
async function crearCarreraAjena(request: APIRequestContext): Promise<string> {
  const h = cabeceras(await tokenDe('admin'));
  const sufijo = Date.now().toString().slice(-7);

  const facultad = await request.post(`${API}/facultades`, {
    headers: h,
    data: { nombre: `Facultad ajena ${sufijo}` },
  });
  expect(facultad.ok()).toBe(true);
  const { id: facultadId } = (await facultad.json()) as { id: string };

  const carrera = await request.post(`${API}/facultades/${facultadId}/carreras`, {
    headers: h,
    data: { nombre: `Carrera ajena ${sufijo}`, codigo: `AJ${sufijo}`, duracionAnios: 5 },
  });
  expect(carrera.ok()).toBe(true);
  return ((await carrera.json()) as { id: string }).id;
}

async function idDelPlanE2E(request: APIRequestContext): Promise<string> {
  const respuesta = await request.get(`${API}/planes`, {
    headers: cabeceras(await tokenDe('director')),
  });
  expect(respuesta.ok()).toBe(true);
  const plan = ((await respuesta.json()) as { id: string; codigo: string }[]).find((p) =>
    p.codigo.startsWith('PE-E2E'),
  );
  expect(plan, 'No hay plan de estudios E2E: falta `npm run e2e:preparar`.').toBeDefined();
  return plan!.id;
}

test.describe('el Director solo lee su carrera (API)', () => {
  test('GET /carreras devuelve solo la suya y el detalle de una ajena es 404', async ({
    request,
  }) => {
    const ajena = await crearCarreraAjena(request);
    const h = cabeceras(await tokenDe('director'));

    const listado = await request.get(`${API}/carreras`, { headers: h });
    expect(listado.ok()).toBe(true);
    const carreras = (await listado.json()) as { id: string; codigo: string }[];
    expect(carreras).toHaveLength(1);
    expect(carreras[0]?.codigo).toBe('E2E');
    expect(carreras.map((c) => c.id)).not.toContain(ajena);

    const detalle = await request.get(`${API}/carreras/${ajena}`, { headers: h });
    expect(detalle.status()).toBe(404);
  });

  test('GET /planes fuerza su carrera aunque se pida la ajena, y el reporte del panel se le niega', async ({
    request,
  }) => {
    const ajena = await crearCarreraAjena(request);
    const h = cabeceras(await tokenDe('director'));

    const planes = await request.get(`${API}/planes`, { headers: h, params: { carreraId: ajena } });
    expect(planes.ok()).toBe(true);
    const filas = (await planes.json()) as { carreraId?: string; codigo: string }[];
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((p) => p.codigo.startsWith('PE-E2E'))).toBe(true);

    const versiones = await request.get(`${API}/carreras/${ajena}/versiones`, { headers: h });
    expect(versiones.status()).toBe(404);

    const panel = await request.get(`${API}/reportes/panel`, { headers: h });
    expect(panel.status()).toBe(403);
  });

  test('el Administrador sigue viendo todas las carreras', async ({ request }) => {
    const ajena = await crearCarreraAjena(request);
    const listado = await request.get(`${API}/carreras`, {
      headers: cabeceras(await tokenDe('admin')),
    });
    const ids = ((await listado.json()) as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(ajena);
    expect(ids.length).toBeGreaterThan(1);
  });
});

test.describe('con la cuenta de administrador', () => {
  test.use({ rol: 'admin' });

  test('el módulo se llama «Facultades» y el plan de una carrera no se abre', async ({
    page,
    request,
  }) => {
    const planId = await idDelPlanE2E(request);

    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav.getByRole('link', { name: 'Facultades' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Plan de Estudios' })).toHaveCount(0);

    await page.goto(`/plan-estudios/planes/${planId}`);
    await expect(page).toHaveURL(/\/plan-estudios$/);
    await expect(page.getByRole('heading', { name: 'Facultades', level: 1 })).toBeVisible();
  });
});

test.describe('con la cuenta de director', () => {
  test.use({ rol: 'director' });

  test('Plan de Estudios muestra una sola tarjeta, la de su carrera', async ({ page, request }) => {
    await crearCarreraAjena(request);

    await page.goto('/plan-estudios');
    await expect(page.getByRole('heading', { name: 'Mi carrera', level: 1 })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('E2E');
    await expect(page.getByLabel('Buscar carrera')).toHaveCount(0);
  });

  test('Reportes abre en la búsqueda y no ofrece el panel general', async ({ page }) => {
    await page.goto('/reportes');
    await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();
    await expect(page.getByText('Panel general')).toHaveCount(0);
    await expect(page.getByText('Búsqueda de planes')).toBeVisible();
  });
});
```

- [ ] **Step 2: Levantar la pila completa con el código nuevo**

En el worktree, instalar dependencias si faltan (`npm ci` en `apps/api`, `apps/web` y `tests/e2e`; o enlazar el `node_modules` de `tests/e2e` del repo principal con una unión de directorio). Base de desarrollo (no la desechable), con esquema y matriz al día:

```bash
cd apps/api
export DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc'
npx prisma migrate deploy
npx tsx prisma/seed.ts        # aplica la matriz nueva a los roles
npm run e2e:preparar
npm run build
```

Las cuentas `e2e-*` ya existen (si faltan, crearlas con los comandos de `tests/e2e/README.md`). Los procesos se arrancan cargando el `.env` del repo principal con `node --env-file=<ruta a apps/api/.env>` (el worktree no lo tiene), cada uno en su propia terminal o en segundo plano:

```bash
cd apps/api && THROTTLE_LIMIT=10000 node --env-file=<.env del repo principal> --enable-source-maps dist/main.js
cd apps/api && node --env-file=<.env del repo principal> --enable-source-maps dist/worker.js
cd apps/web && npm run build && npm run preview -- --port 4173
```

Antes de arrancar, **comprobar que no queda ningún worker viejo** (`Get-CimInstance Win32_Process` filtrando `worker.js`): dos workers compitiendo por la cola guardan los PDF en carpetas distintas y dan falsos fallos de descarga. Copiar `var/documentos` del repo principal al worktree si la base tiene documentos previos.

Expected: la API responde 401 en `http://localhost:3000/api/v1/auth/yo` y `http://localhost:4173/` responde 200.

- [ ] **Step 3: Ejecutar el spec nuevo**

Run: `cd tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test alcance-de-lectura.spec.ts --reporter=line`
Expected: PASS (6 tests). Si «Facultades» no aparece en el menú del Administrador, comprobar que el seed del Paso 2 corrió (la cuenta `e2e-admin` no debe tener `plan.leer`). Si el `heading` de nivel 1 no coincide, mirar en `CabeceraSeccion` qué nivel renderiza y ajustar solo el selector del test.

- [ ] **Step 4: Ejecutar la suite completa**

Esperar un minuto (el login admite cinco intentos por minuto y ya se gastaron), reiniciar los datos e2e y correr todo:

Run: `cd apps/api && DATABASE_URL='postgresql://sgc:sgc@localhost:5433/sgc' npm run e2e:preparar && cd ../../tests/e2e && SGC_E2E_PASSWORD='E2E.Pruebas.2026!' npx playwright test --reporter=line`
Expected: PASS (71 tests: los 65 previos más estos 6). En particular deben seguir pasando las pruebas del Director (`docentes.spec.ts`, `accesibilidad.spec.ts` con `e2e-director`) y las del Administrador; si alguna prueba previa fallara porque el Director ya no lee otra carrera o el Administrador ya no lee planes, es un hallazgo real de este bloque: corregir el spec afectado explicando por qué.

- [ ] **Step 5: Apagar todo y commit**

Detener la API, el **worker** y `vite preview`, y quitar la unión de `node_modules` si se creó. Luego:

```bash
cd tests/e2e && npx prettier --check specs/alcance-de-lectura.spec.ts
git add tests/e2e/specs/alcance-de-lectura.spec.ts
git commit -m "test(e2e): «Facultades» para el Administrador y alcance de lectura del Director (RF-CH-007 a 009)"
```

---

## Verificación final

- [ ] `cd apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json && npx eslint .` — verde.
- [ ] `cd apps/api && npm run test:integration` en la base `sgc_test` — verde.
- [ ] `cd apps/web && npx vitest run && npx tsc -b && npx eslint .` — verde.
- [ ] `tests/e2e`: suite completa en verde (Tarea 8, Paso 4).
- [ ] **Antes de aplicar en un entorno compartido:** volver a correr `npx tsx prisma/seed.ts`. El Administrador pierde cinco permisos de lectura y el Director gana la marca `lectura.solo_su_carrera`; es lo pedido (RF-CH-008 y 009), pero un Administrador o un Director de prueba que dependía de leer planes o carreras ajenas dejará de poder.
