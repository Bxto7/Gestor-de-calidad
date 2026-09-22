# Fase 0a — Rol expuesto en `auth` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer los roles reales del usuario autenticado (`/auth/yo`) y dar
al frontend una función pura que decida, a partir de esos roles, qué vista
de inicio le corresponde — sin resolverlo en el backend a un solo rol,
porque el modelo es N-M real.

**Architecture:** Un método nuevo en el puerto de autorización
(`rolesDe`), implementado en su adaptador Prisma existente; el caso de uso
de sesión lo agrega a lo que ya devuelve. En el frontend, una función pura
con orden de prioridad fijo, y el proveedor de sesión la usa para exponer
`vistaActiva`/`cambiarVista` sin construir ninguna interfaz todavía.

**Tech Stack:** NestJS + Prisma (backend), React + Vitest (frontend), sin
dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-22-dashboard-fase0-fundacion-design.md`
(secciones 2.2 y 3 — esta es la primera de las cinco piezas de la Fase 0).

## Global Constraints

- TypeScript estricto, sin `any` sin justificar (CLAUDE.md §2).
- La capa de dominio/aplicación no importa Prisma/NestJS directamente —
  aquí no aplica un cambio de capa, pero los archivos tocados respetan la
  frontera existente (el puerto es la interfaz, el adaptador es quien
  conoce Prisma).
- No se cachea nada de autorización (ya documentado en
  `authorization.adapter.ts`: un cambio de rol debe surtir efecto de
  inmediato).
- Cobertura de `domain/`/`application/` ≥80% (RNF del proyecto) — los
  archivos que tocamos aquí ya están cubiertos por specs existentes que se
  extienden, no se crean de cero.

---

### Task 1: `rolesDe` en `AuthorizationPort` + `ConsultarSesion` expone `roles`

**Files:**
- Modify: `apps/api/src/modules/auth/application/ports/authorization.port.ts`
- Modify: `apps/api/src/modules/auth/infrastructure/authorization.adapter.ts`
- Modify: `apps/api/src/modules/auth/application/use-cases/consultar-sesion.use-case.ts`
- Test: `apps/api/src/modules/auth/application/use-cases/consultar-sesion.spec.ts`

**Interfaces:**
- Produces: `AuthorizationPort.rolesDe(usuarioId: string): Promise<readonly string[]>`.
  `SesionActual` gana `readonly roles: readonly string[]`. Ambos consumidos
  por Task 3 (frontend) vía la respuesta real de `/auth/yo`.

No se toca `SesionController` — ya delega en `ConsultarSesion.ejecutar`,
así que el campo nuevo viaja solo con este cambio.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido completo de
`apps/api/src/modules/auth/application/use-cases/consultar-sesion.spec.ts`
por:

```typescript
/**
 * Pruebas de la consulta de sesión.
 *
 * Poco código, pero es el que decide qué botones ve cada rol, y ahora
 * también qué vista de inicio corresponde (Fase 0). Lo que se fija aquí es
 * que no invente ni omita: la interfaz confía en esta respuesta para
 * ofrecer solo lo que el backend va a permitir.
 */

import { describe, expect, it } from 'vitest';

import type { AuthorizationPort } from '../ports/authorization.port.js';
import { ConsultarSesion } from './consultar-sesion.use-case.js';

function montar(
  permisos: string[],
  carreraACargo: string | null = null,
  roles: string[] = [],
) {
  const consultas: string[] = [];

  const autorizacion: AuthorizationPort = {
    puede: async () => ({ permitido: true }),
    permisosDe: async (usuarioId) => {
      consultas.push(usuarioId);
      return new Set(permisos);
    },
    carreraACargoDe: async () => carreraACargo,
    rolesDe: async () => roles,
  };

  return { caso: new ConsultarSesion(autorizacion), consultas };
}

describe('Identidad y permisos', () => {
  it('devuelve el identificador y el nombre que vienen del token', async () => {
    // No se releen de la base: el token ya los trae verificados y volver a
    // consultarlos sería una petición de más en cada arranque.
    const { caso } = montar([]);
    const sesion = await caso.ejecutar('u-1', 'Directora de Sistemas');

    expect(sesion.id).toBe('u-1');
    expect(sesion.nombre).toBe('Directora de Sistemas');
  });

  it('los permisos se piden para ese usuario, no para otro', async () => {
    const { caso, consultas } = montar(['plan.leer']);
    await caso.ejecutar('u-7', 'Alguien');
    expect(consultas).toEqual(['u-7']);
  });

  it('devuelve los permisos ordenados', async () => {
    // Estable entre llamadas: facilita comparar y cachear en el cliente.
    const { caso } = montar(['plan.leer', 'asignatura.gestionar', 'facultad.crear']);
    const sesion = await caso.ejecutar('u-1', 'Alguien');

    expect(sesion.permisos).toEqual(['asignatura.gestionar', 'facultad.crear', 'plan.leer']);
  });

  it('un usuario sin permisos devuelve lista vacía, no null', async () => {
    // La interfaz hace `permisos.includes(...)`: un null la rompería en vez de
    // limitarse a no mostrar nada.
    const { caso } = montar([]);
    expect((await caso.ejecutar('u-1', 'Alguien')).permisos).toEqual([]);
  });

  it('incluye la carrera que dirige cuando el rol está acotado a una', async () => {
    const { caso } = montar(['plan.aprobar'], 'car-isi');
    expect((await caso.ejecutar('u-1', 'Directora')).carreraACargo).toBe('car-isi');
  });

  it('null cuando no dirige ninguna', async () => {
    // Distinto de "las dirige todas": quien no tiene carrera asignada no manda
    // en ninguna, y la interfaz debe tratarlo así.
    const { caso } = montar(['facultad.crear']);
    expect((await caso.ejecutar('u-1', 'Administrador')).carreraACargo).toBeNull();
  });

  it('devuelve los roles del usuario, ordenados', async () => {
    const { caso } = montar([], null, ['DOCENTE', 'ADMIN_SISTEMA']);
    const sesion = await caso.ejecutar('u-1', 'Alguien');
    expect(sesion.roles).toEqual(['ADMIN_SISTEMA', 'DOCENTE']);
  });

  it('un usuario sin roles devuelve lista vacía, no null', async () => {
    const { caso } = montar([]);
    expect((await caso.ejecutar('u-1', 'Alguien')).roles).toEqual([]);
  });

  it('los roles se piden para el mismo usuario que los permisos', async () => {
    const consultas: string[] = [];
    const autorizacion: AuthorizationPort = {
      puede: async () => ({ permitido: true }),
      permisosDe: async () => new Set(),
      carreraACargoDe: async () => null,
      rolesDe: async (usuarioId) => {
        consultas.push(usuarioId);
        return ['DOCENTE'];
      },
    };
    await new ConsultarSesion(autorizacion).ejecutar('u-9', 'Alguien');
    expect(consultas).toEqual(['u-9']);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd apps/api && npx vitest run src/modules/auth/application/use-cases/consultar-sesion.spec.ts`
Expected: FAIL — `rolesDe` no existe en el tipo `AuthorizationPort`
(error de TypeScript, no solo de test) y `SesionActual` no tiene `roles`.

- [ ] **Step 3: Agregar `rolesDe` al puerto**

En `apps/api/src/modules/auth/application/ports/authorization.port.ts`,
reemplazar el contenido completo por:

```typescript
/**
 * `AuthorizationPort` — la ÚNICA superficie por la que otros módulos consultan
 * autorización (§3.5).
 *
 * `plan-estudios` depende de esta interfaz y nunca de las tablas `usuarios`,
 * `roles` ni `usuario_carrera`, que viven en el schema `auth`. Esa es la regla
 * de §3.2 y aquí es donde se materializa.
 *
 * La interfaz vive en `auth/application/ports/` porque `auth` es quien la
 * expone; los demás módulos la importan como contrato, no como implementación.
 */

import type { Decision } from '../../domain/services/politica-de-autorizacion.js';

export interface AuthorizationPort {
  /**
   * Decide si el usuario puede ejercer `permiso` sobre un recurso de
   * `carreraId`.
   *
   * Devuelve una `Decision` con motivo y no un booleano: la capa HTTP necesita
   * explicar por qué denegó, y un `false` pelado obliga a adivinarlo.
   *
   * @param carreraId `null` para operaciones que no cuelgan de una carrera.
   */
  puede(usuarioId: string, permiso: string, carreraId?: string | null): Promise<Decision>;

  /** Permisos efectivos del usuario, para que la UI oculte lo que no aplica. */
  permisosDe(usuarioId: string): Promise<ReadonlySet<string>>;

  /** Carrera que dirige, o `null`. Una sola: un director dirige una carrera. */
  carreraACargoDe(usuarioId: string): Promise<string | null>;

  /**
   * Códigos de rol asignados al usuario (`Rol.codigo`), sin resolver a uno
   * solo: el modelo es N-M real (§3.5, `UsuarioRol`). Quien decide qué vista
   * mostrar con más de uno es el frontend (Fase 0 del dashboard por rol,
   * `vista-principal.ts`), no este puerto.
   */
  rolesDe(usuarioId: string): Promise<readonly string[]>;
}

/** Token de inyección. Evita depender de la clase concreta en los módulos. */
export const AUTHORIZATION_PORT = Symbol('AuthorizationPort');
```

- [ ] **Step 4: Implementar `rolesDe` en el adaptador**

En `apps/api/src/modules/auth/infrastructure/authorization.adapter.ts`,
agregar el método a la clase `AuthorizationAdapter` (junto a
`carreraACargoDe`, antes del `private async contextoDe`):

```typescript
  async rolesDe(usuarioId: string): Promise<readonly string[]> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { roles: { select: { rol: { select: { codigo: true } } } } },
    });
    return usuario?.roles.map((ur) => ur.rol.codigo) ?? [];
  }
```

- [ ] **Step 5: Extender `ConsultarSesion`**

Reemplazar el contenido completo de
`apps/api/src/modules/auth/application/use-cases/consultar-sesion.use-case.ts`
por:

```typescript
/**
 * Caso de uso: quién soy y qué puedo hacer.
 *
 * Existe porque la interfaz necesita algo más que el nombre del usuario. RF111
 * a RF119 piden que cada rol vea solo las acciones que le corresponden, y sin
 * esta información la única forma de averiguarlo sería pulsar el botón y
 * recibir un 403: el permiso se respetaría, pero la experiencia sería la de un
 * sistema que ofrece cosas que no puede cumplir.
 *
 * Va en un endpoint aparte y no dentro de la respuesta del login por dos
 * motivos. Al recargar la página hay un token guardado pero no una respuesta de
 * login que consultar, así que la aplicación tendría que pedirlo igualmente. Y
 * los permisos de un usuario pueden cambiar mientras su sesión sigue viva;
 * releerlos al arrancar es más correcto que arrastrar los del momento de entrar.
 *
 * La lista de permisos **no** es la autorización: es una copia para pintar la
 * pantalla. Quien decide sigue siendo el backend en cada petición.
 *
 * `roles` (Fase 0 del dashboard por rol) tampoco resuelve nada por sí sola:
 * un usuario puede tener varios roles reales (`UsuarioRol` es N-M), y decidir
 * qué vista de inicio le corresponde es responsabilidad del frontend
 * (`vista-principal.ts`), no de este caso de uso.
 */

import type { AuthorizationPort } from '../ports/authorization.port.js';

export interface SesionActual {
  readonly id: string;
  readonly nombre: string;
  readonly permisos: readonly string[];
  readonly roles: readonly string[];
  /** La carrera que dirige, si su rol está acotado a una (§3.5). */
  readonly carreraACargo: string | null;
}

export class ConsultarSesion {
  constructor(private readonly autorizacion: AuthorizationPort) {}

  async ejecutar(usuarioId: string, nombre: string): Promise<SesionActual> {
    const [permisos, roles, carreraACargo] = await Promise.all([
      this.autorizacion.permisosDe(usuarioId),
      this.autorizacion.rolesDe(usuarioId),
      this.autorizacion.carreraACargoDe(usuarioId),
    ]);

    return {
      id: usuarioId,
      nombre,
      // Ordenados para que la respuesta sea estable entre llamadas: facilita
      // comparar y cachear, y hace legible el listado al depurar.
      permisos: [...permisos].sort(),
      roles: [...roles].sort(),
      carreraACargo,
    };
  }
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd apps/api && npx vitest run src/modules/auth/application/use-cases/consultar-sesion.spec.ts`
Expected: PASS, los 9 tests.

- [ ] **Step 7: Arreglar los dobles de `AuthorizationPort` en el resto del backend**

Agregar `rolesDe` a la interfaz rompe la compilación de cualquier objeto
literal tipado como `AuthorizationPort` que no lo implemente — y hay
**65 ocurrencias en 26 archivos** fuera de este plan (contado con `grep
-rc "carreraACargoDe: async" apps/api/src --include="*.spec.ts"` antes de
escribir este plan). No se listan uno por uno aquí porque `tsc` los
encuentra con precisión de línea, y ese es el procedimiento correcto —
más confiable que un buscar-y-reemplazar a ciegas sobre 26 archivos con
formas ligeramente distintas entre sí:

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```

Va a fallar con un error `TS2739` (o similar, "falta la propiedad
`rolesDe`") por cada objeto literal incompleto. Para cada uno: abrir el
archivo en la línea que indica el error, y agregar la línea
`rolesDe: async () => [],` dentro de ese objeto literal (el orden de las
propiedades no importa para TypeScript; ponerla junto a
`carreraACargoDe` mantiene el estilo ya usado en el resto del archivo).
Repetir `tsc --noEmit` y seguir arreglando hasta que la compilación quede
limpia.

Dos archivos que SÍ implementan el puerto pero usan
`as unknown as AuthorizationPort` (`plan-estudios/application/use-cases/generar-documentos.spec.ts`,
`auth/application/use-cases/gestionar-usuarios.spec.ts`) **no van a
aparecer como error** — esa aserción de tipo evita el chequeo de
TypeScript. No hace falta tocarlos: ningún test existente invoca
`.rolesDe(...)` sobre esos dobles, así que no van a fallar en tiempo de
ejecución tampoco. No los "arregles" agregándoles `rolesDe` si `tsc` no
los señaló — sería tocar archivos fuera de lo que este cambio
realmente rompe.

- [ ] **Step 8: Confirmar que ninguna suite se rompió**

Run: `cd apps/api && npx vitest run`
Expected: todos los tests en verde — los 65 dobles arreglados en el Step 7
siguen devolviendo lo mismo que antes en sus métodos existentes, `rolesDe`
solo se agrega, no reemplaza nada.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/auth/application/ports/authorization.port.ts apps/api/src/modules/auth/infrastructure/authorization.adapter.ts apps/api/src/modules/auth/application/use-cases/consultar-sesion.use-case.ts apps/api/src/modules/auth/application/use-cases/consultar-sesion.spec.ts
git add -u apps/api/src
git commit -m "feat(auth): expone los roles del usuario en /auth/yo (Fase 0 dashboard)"
```

`git add -u apps/api/src` agrega también los 26 archivos que el Step 7
tocó — son consecuencia directa y mecánica de este cambio de interfaz, no
un cambio aparte que merezca su propio commit.

---

### Task 2: `vistaPrincipalDe` — función pura de prioridad de rol (frontend)

**Files:**
- Create: `apps/web/src/features/auth/domain/vista-principal.ts`
- Test: `apps/web/src/features/auth/domain/vista-principal.test.ts`

**Interfaces:**
- Consumes: nada (función pura, sin dependencias del resto del proyecto).
- Produces: `RolVista` (tipo unión), `vistaPrincipalDe(roles: readonly
  string[]): RolVista | null`. Consumido por Task 3.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// apps/web/src/features/auth/domain/vista-principal.test.ts

import { describe, expect, it } from 'vitest';

import { vistaPrincipalDe } from './vista-principal';

describe('vistaPrincipalDe', () => {
  it('con un solo rol, devuelve ese rol', () => {
    expect(vistaPrincipalDe(['DOCENTE'])).toBe('DOCENTE');
  });

  it('con varios roles, gana el de mayor prioridad', () => {
    expect(vistaPrincipalDe(['DOCENTE', 'DIRECTOR_CARRERA'])).toBe('DIRECTOR_CARRERA');
    expect(vistaPrincipalDe(['USUARIO_CONSULTOR', 'COORDINADOR_ACADEMICO'])).toBe(
      'COORDINADOR_ACADEMICO',
    );
  });

  it('ADMIN_SISTEMA gana sobre cualquier combinación', () => {
    expect(
      vistaPrincipalDe(['DOCENTE', 'DIRECTOR_CARRERA', 'COORDINADOR_ACADEMICO', 'ADMIN_SISTEMA']),
    ).toBe('ADMIN_SISTEMA');
  });

  it('un rol desconocido se ignora, no rompe', () => {
    expect(vistaPrincipalDe(['ROL_INVENTADO'])).toBeNull();
    expect(vistaPrincipalDe(['ROL_INVENTADO', 'DOCENTE'])).toBe('DOCENTE');
  });

  it('un array vacío devuelve null', () => {
    expect(vistaPrincipalDe([])).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx vitest run src/features/auth/domain/vista-principal.test.ts`
Expected: FAIL — `Cannot find module './vista-principal'`.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/src/features/auth/domain/vista-principal.ts

/**
 * Decide qué vista de inicio (Fases 1-3 del dashboard por rol) le
 * corresponde a un usuario, a partir de sus roles reales.
 *
 * El modelo de `auth` es N-M (un usuario puede tener varios roles a la
 * vez — ver `UsuarioRol` en el backend). Esta función no lo trunca: el
 * backend expone la lista completa (`/auth/yo`, campo `roles`), y aquí se
 * elige cuál vista mostrar primero según un orden de prioridad fijo. Un
 * usuario con más de un rol real puede cambiar de vista después —
 * `vistaPrincipalDe` solo decide la de arranque, no impide las demás.
 */

const PRIORIDAD = [
  'ADMIN_SISTEMA',
  'DIRECTOR_CARRERA',
  'COORDINADOR_ACADEMICO',
  'DOCENTE',
  'USUARIO_CONSULTOR',
] as const;

export type RolVista = (typeof PRIORIDAD)[number];

export function vistaPrincipalDe(roles: readonly string[]): RolVista | null {
  const presentes = new Set(roles);
  for (const rol of PRIORIDAD) {
    if (presentes.has(rol)) return rol;
  }
  return null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx vitest run src/features/auth/domain/vista-principal.test.ts`
Expected: PASS, los 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/domain/vista-principal.ts apps/web/src/features/auth/domain/vista-principal.test.ts
git commit -m "feat(auth): vistaPrincipalDe, prioridad de rol para la vista de inicio (Fase 0 dashboard)"
```

---

### Task 3: `Identidad.roles` + `vistaActiva`/`cambiarVista` en el proveedor de sesión

**Files:**
- Modify: `apps/web/src/features/auth/api/auth.api.ts`
- Modify: `apps/web/src/features/auth/hooks/contexto-sesion.ts`
- Modify: `apps/web/src/features/auth/hooks/ProveedorSesion.tsx`

**Interfaces:**
- Consumes: `RolVista`, `vistaPrincipalDe` (Task 2); el backend real ya
  devuelve `roles` en `/auth/yo` (Task 1).
- Produces: `Identidad.roles: string[]`; `ValorSesion.roles: readonly
  string[]`, `ValorSesion.vistaActiva: RolVista | null`,
  `ValorSesion.cambiarVista: (vista: RolVista) => void`. Consumido por las
  Fases 1-3 (fuera de este plan) para decidir qué AppShell renderizar y
  para el selector de vista cuando el usuario tiene más de un rol.

Sin test nuevo en este paso: ni `ProveedorSesion.tsx` ni `contexto-sesion.ts`
tienen precedente de test propio en este proyecto (son plomería de React,
no lógica de dominio) — la lógica que sí importa ya quedó cubierta en
Task 2. La verificación de este paso es el typecheck (Step 4).

- [ ] **Step 1: `Identidad` gana `roles`**

En `apps/web/src/features/auth/api/auth.api.ts`, reemplazar la interfaz
`Identidad`:

```typescript
export interface Identidad {
  id: string;
  nombre: string;
  permisos: string[];
  /** Códigos de rol asignados (N-M real — ver `vista-principal.ts`). */
  roles: string[];
  /** La carrera que dirige, si su rol está acotado a una. */
  carreraACargo: string | null;
}
```

- [ ] **Step 2: `ValorSesion` gana `roles`/`vistaActiva`/`cambiarVista`**

En `apps/web/src/features/auth/hooks/contexto-sesion.ts`, agregar el
import y los tres campos a la interfaz `ValorSesion` (después de
`puedeEn`, antes de `entrar`):

```typescript
import type { RolVista } from '../domain/vista-principal';
```

```typescript
  /** Roles reales del usuario (puede tener más de uno — N-M). */
  roles: readonly string[];
  /**
   * Vista de inicio activa: la de mayor prioridad por defecto
   * (`vistaPrincipalDe`), o la que el usuario haya elegido con
   * `cambiarVista` si tiene más de un rol real.
   */
  vistaActiva: RolVista | null;
  /** Cambia la vista activa en memoria (sin persistir, sin pedir nada al backend). */
  cambiarVista: (vista: RolVista) => void;
```

- [ ] **Step 3: Calcular `vistaActiva`/`cambiarVista` en el proveedor**

En `apps/web/src/features/auth/hooks/ProveedorSesion.tsx`, agregar el
import:

```typescript
import { vistaPrincipalDe, type RolVista } from '../domain/vista-principal';
```

Después de la declaración de `permisos` (el `useMemo` existente) y antes
de `puede`, agregar:

```typescript
  const vistaPrincipal = useMemo(
    () => (identidad ? vistaPrincipalDe(identidad.roles) : null),
    [identidad],
  );

  const [vistaManual, setVistaManual] = useState<RolVista | null>(null);

  // Un login nuevo (identidad distinta) descarta cualquier elección manual
  // anterior — la próxima vista activa vuelve a ser la de mayor prioridad.
  useEffect(() => {
    setVistaManual(null);
  }, [identidad?.id]);

  const vistaActiva = vistaManual ?? vistaPrincipal;

  const cambiarVista = useCallback((vista: RolVista) => {
    setVistaManual(vista);
  }, []);
```

Y agregar `roles: identidad?.roles ?? []`, `vistaActiva` y `cambiarVista`
al objeto `valor` (el `useMemo` final), con sus dependencias:

```typescript
  const valor = useMemo<ValorSesion>(
    () => ({
      identidad,
      cargando,
      puede,
      dirigeCarrera,
      puedeEn,
      roles: identidad?.roles ?? [],
      vistaActiva,
      cambiarVista,
      entrar,
      salir,
    }),
    [identidad, cargando, puede, dirigeCarrera, puedeEn, vistaActiva, cambiarVista, entrar, salir],
  );
```

- [ ] **Step 4: Typecheck y suite completa del frontend**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: limpio.

Run: `cd apps/web && npx vitest run`
Expected: todos los tests existentes en verde (sin regresión), más los 5
de `vista-principal.test.ts` (Task 2).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/api/auth.api.ts apps/web/src/features/auth/hooks/contexto-sesion.ts apps/web/src/features/auth/hooks/ProveedorSesion.tsx
git commit -m "feat(auth): vistaActiva/cambiarVista en ValorSesion (Fase 0 dashboard)"
```

---

## Al terminar

Con las 3 tareas completas: `/auth/yo` expone `roles`, el frontend tiene
`useSesion().vistaActiva`/`.roles`/`.cambiarVista` listos para que las
Fases 1-3 decidan qué AppShell renderizar. Ningún componente visual nuevo
se agrega en este plan — eso es explícitamente responsabilidad de otras
piezas de la Fase 0 (AppShell, plan aparte) y de las Fases 1-3.

Al cerrar este plan, seguir con
`superpowers:finishing-a-development-branch` si se ejecutó en una rama
propia, o continuar directo con el siguiente plan de la Fase 0
(módulo `academico`) si se está trabajando todos en la misma rama
`dashboard-fase0-fundacion`.
