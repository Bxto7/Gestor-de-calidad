# Fase 0e — AppShell del frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el sidebar de lista plana por uno agrupado en
secciones colapsables, agregar el `ScopeSelector` (pieza visual, sin
lógica de cambio de contexto todavía) y dejar listos los componentes
base (`KpiCard`, `DataPanel`, `StatusChip`, `PendingList`,
`SecondaryCardGrid`, `ReportBridgeCard`) que las Fases 1-3 van a llenar
con datos reales. Ninguna pantalla ni ruta nueva — los mismos 10 ítems
de navegación que existen hoy, solo reagrupados.

**Architecture:** Todo el cambio vive en `apps/web`. `AppLayout.tsx`
cambia su array plano `ENLACES` por una estructura de árbol
(`SECCIONES`), sin tocar la lógica de filtrado por permiso ni las rutas
de `App.tsx` (no se agrega, mueve ni quita ninguna ruta — solo cambia
cómo se agrupan visualmente los links que ya existen). Los componentes
nuevos se agregan al archivo único ya establecido
(`shared/components/ui/index.tsx`) — este proyecto no usa un archivo
por componente, y este plan sigue esa convención, no la cambia.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind v4, sin
dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-22-dashboard-fase0-fundacion-design.md`
(§2.1, §5 — última de las cinco piezas de la Fase 0). Independiente de
las Fases 0b/0c/0d en cuanto a código (no importa nada de los módulos
backend nuevos) — puede ejecutarse en cualquier orden respecto a ellas.

## Global Constraints

- TypeScript estricto (CLAUDE.md §2).
- Tokens de color: **no inventar** fuera de los ya definidos en
  `global.css`, salvo el único agregado explícito de este plan (Task 1),
  justificado por contraste WCAG 2.1 AA — mismo criterio que ya exige el
  comentario de cabecera de ese archivo.
- Sin datos mockeados hardcodeados en componentes — los componentes
  nuevos de este plan son props tipadas puras, sin ningún array literal
  de contenido de negocio (eso es explícitamente trabajo de las Fases
  1-3, no de esta).
- Responsive/accesible: focus visible, contraste AA, `aria-label` en
  botones de ícono — mismos estándares que ya sigue el resto del
  proyecto (ver `Modal`/`Boton` en `shared/components/ui/index.tsx`
  como referencia de lo ya establecido).

---

### Task 1: Token de color nuevo y `ScopeSelector`

**Files:**
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/shared/components/ui/index.tsx`

**Interfaces:**
- Produces: token CSS `--color-estado-encurso-fg`/`--color-estado-encurso-bg`
  (utilidades Tailwind `text-estado-encurso-fg`/`bg-estado-encurso-bg`,
  mismo patrón que los 4 pares de estado ya existentes). Componente
  `ScopeSelector` exportado desde `shared/components/ui/index.tsx`.
  Consumido por la Task 2.

- [ ] **Step 1: Agregar el token, con su contraste verificado**

En `apps/web/src/styles/global.css`, dentro del bloque `@theme`, después
de los 4 pares de estado ya existentes (`--color-estado-aprobado-bg`,
línea ~48 hoy), agregar:

```css
  /* Morado / en curso — contraste verificado 7.74:1 sobre su fondo (AA exige 4.5:1). */
  --color-estado-encurso-fg: #6802c1;
  --color-estado-encurso-bg: #f3edfb;
```

Estos dos valores **coinciden exactamente** con `--color-uc-primary`
(ya en la paleta) y con el fondo morado claro que pidió el usuario para
el estado "en curso" — no son colores nuevos inventados, son una
combinación nueva de un color ya existente sobre un fondo nuevo, y su
contraste (7.74:1, calculado con la fórmula de luminancia relativa de
WCAG) ya supera holgadamente el umbral AA — no hace falta oscurecerlo
como sí fue necesario para los 4 pares que ya tiene el archivo (ver el
comentario de cabecera del archivo, "EXCEPCIÓN APROBADA el 4 de
septiembre de 2026").

- [ ] **Step 2: Extender `TonoBadge` con el estado nuevo (opcional, de bajo costo)**

En `apps/web/src/shared/components/ui/index.tsx`, el tipo `TonoBadge`
y el mapa `TONOS` (líneas ~23-31 hoy) tienen 5 tonos. Agregar un sexto:

```typescript
export type TonoBadge = 'activo' | 'progreso' | 'inactivo' | 'aprobado' | 'encurso' | 'neutro';

const TONOS: Record<TonoBadge, string> = {
  activo: 'text-estado-activo-fg bg-estado-activo-bg',
  progreso: 'text-estado-progreso-fg bg-estado-progreso-bg',
  inactivo: 'text-estado-inactivo-fg bg-estado-inactivo-bg',
  aprobado: 'text-estado-aprobado-fg bg-estado-aprobado-bg',
  encurso: 'text-estado-encurso-fg bg-estado-encurso-bg',
  neutro: 'text-uc-primary bg-uc-lila-claro',
};
```

`Badge` ya acepta cualquier valor de `TonoBadge` por su firma existente
— no hace falta tocar la función `Badge` en sí, solo el tipo y el mapa.

- [ ] **Step 3: `ScopeSelector`**

Agregar al final de `apps/web/src/shared/components/ui/index.tsx`
(después de `CabeceraSeccion`, que es el último componente del archivo
hoy):

```typescript
/* ── Selector de ámbito ───────────────────────────────────────────────── */

/**
 * Caja del sidebar que muestra el ámbito activo (la carrera a cargo, o
 * la universidad entera para roles sin carrera). Fase 0: solo la pieza
 * visual — el dropdown real para cambiar de ámbito es contenido de las
 * Fases 1-3, que son quienes definen qué significa "cambiar de ámbito"
 * para cada rol.
 */
export function ScopeSelector({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="mx-3 mb-2 rounded-xl bg-white/10 px-3 py-2.5">
      <span className="block text-[10px] font-bold tracking-wide text-uc-lila uppercase">
        {etiqueta}
      </span>
      <span className="mt-0.5 block truncate text-sm font-bold text-white">{valor}</span>
    </div>
  );
}
```

Nombrado en inglés (`ScopeSelector`) a diferencia del resto del archivo
(español) porque así lo nombra el spec de Fase 0 (§5) y el mockup del
usuario lo etiqueta "ÁMBITO" — el nombre del componente no tiene que
traducirse para que el texto que muestra esté en español; es
consistente con cómo el resto del proyecto nombra tipos/componentes
técnicos en inglés cuando el patrón lo pide (CLAUDE.md §2).

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```
Expected: limpio. `ScopeSelector`/el tono nuevo de `Badge` no tienen
consumidor todavía (llega en la Task 2) — `tsc` no debería quejarse de
código sin usar en un componente exportado, pero si tu editor/linter sí
lo hace, es una advertencia esperada en este punto, no un error de tipo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles/global.css apps/web/src/shared/components/ui/index.tsx
git commit -m "feat(dashboard): token en-curso y ScopeSelector (Fase 0e)"
```

---

### Task 2: Sidebar agrupado en `AppLayout.tsx`

**Files:**
- Modify: `apps/web/src/app/AppLayout.tsx`

**Interfaces:**
- Consumes: `ScopeSelector` (Task 1).
- Produces: la estructura de árbol `SECCIONES`, que las Fases 1-3
  extenderán con ítems nuevos bajo secciones nuevas (Criterios 01-08,
  etc.) — esta tarea no agrega ninguna sección ni ítem que no exista ya
  como link plano hoy.

- [ ] **Step 1: Reemplazar `ENLACES` por `SECCIONES`**

En `apps/web/src/app/AppLayout.tsx`, reemplazar la constante `ENLACES`
(líneas 26-91 hoy) completa por:

```typescript
interface EnlaceNav {
  readonly a: string;
  readonly etiqueta: string;
  readonly icono: () => ReactElement;
  readonly exacto: boolean;
  readonly permiso?: string;
}

interface SeccionNav {
  /** `null` para el ítem suelto de arriba (Resumen), sin título de sección. */
  readonly titulo: string | null;
  readonly enlaces: readonly EnlaceNav[];
}

/**
 * Menú principal, agrupado por sección (Fase 0e del dashboard por rol).
 *
 * Los mismos 10 destinos que ya existían como lista plana — este plan no
 * agrega, mueve ni quita ninguna ruta, solo cambia cómo se agrupan
 * visualmente. Las Fases 1-3 son las que van a agregar contenido nuevo
 * bajo secciones nuevas (los 8 criterios de acreditación del Director,
 * por ejemplo) — esta estructura ya lo soporta sin cambios adicionales.
 *
 * `permiso` esconde la entrada cuando el rol no la tiene. No es
 * seguridad —esa la aplica el backend en cada petición— sino no ofrecer
 * una puerta que se cierra en la cara.
 */
const SECCIONES: readonly SeccionNav[] = [
  {
    titulo: null,
    enlaces: [{ a: '/', etiqueta: 'Resumen', icono: IconoResumen, exacto: true }],
  },
  {
    titulo: 'Plan de estudios',
    enlaces: [
      { a: '/plan-estudios', etiqueta: 'Plan de Estudios', icono: IconoPlan, exacto: false },
    ],
  },
  {
    titulo: 'Acreditación',
    enlaces: [
      {
        a: '/acreditacion/atributos',
        etiqueta: 'Atributos del Graduado',
        icono: IconoPlan,
        exacto: false,
        permiso: 'atributo.leer',
      },
      {
        a: '/acreditacion/criterios',
        etiqueta: 'Criterios de Acreditación',
        icono: IconoPlan,
        exacto: false,
        permiso: 'criterio.leer',
      },
    ],
  },
  {
    titulo: 'Mejora continua',
    enlaces: [
      {
        a: '/mejora-continua/medicion',
        etiqueta: 'Planes de Medición',
        icono: IconoPlan,
        exacto: false,
        permiso: 'medicion.leer',
      },
      {
        a: '/mejora-continua/evaluacion',
        etiqueta: 'Planes de Evaluación',
        icono: IconoPlan,
        exacto: false,
        permiso: 'evaluacion.leer',
      },
      {
        a: '/mejora-continua/mejora',
        etiqueta: 'Planes de Mejora',
        icono: IconoPlan,
        exacto: false,
        permiso: 'mejora.leer',
      },
      {
        a: '/mejora-continua/actas',
        etiqueta: 'Actas de Aprobación',
        icono: IconoPlan,
        exacto: false,
        permiso: 'actas.leer',
      },
    ],
  },
  {
    titulo: 'Sistema',
    enlaces: [
      {
        a: '/reportes',
        etiqueta: 'Reportes',
        icono: IconoReportes,
        exacto: false,
        permiso: 'plan.leer',
      },
      {
        a: '/usuarios',
        etiqueta: 'Usuarios',
        icono: IconoUsuarios,
        exacto: false,
        permiso: 'usuario.gestionar',
      },
    ],
  },
];
```

- [ ] **Step 2: Estado de colapso por sección**

En el cuerpo de `AppLayout()`, junto a los `useState`/`useMemo` ya
existentes (después de la declaración de `ubicacion`, línea ~116 hoy),
agregar:

```typescript
  // Colapsado por título de sección — vacío por defecto: todas abiertas.
  // No persiste entre sesiones a propósito (Fase 0 no lo pide); si una
  // fase futura quiere recordarlo, es un cambio contenido a este estado.
  const [colapsadas, setColapsadas] = useState<ReadonlySet<string>>(new Set());

  const alternarSeccion = useCallback((titulo: string) => {
    setColapsadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(titulo)) siguiente.delete(titulo);
      else siguiente.add(titulo);
      return siguiente;
    });
  }, []);
```

- [ ] **Step 3: Reemplazar el `<nav>` del sidebar**

El bloque actual (líneas ~172-193 hoy):

```typescript
          <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3" aria-label="Navegación principal">
            {ENLACES.filter((e) => !e.permiso || puede(e.permiso)).map(
              ({ a, etiqueta, icono: Icono, exacto }) => (
                <NavLink
                  key={a}
                  to={a}
                  end={exacto}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-sm font-semibold transition',
                      isActive
                        ? 'border-l-white bg-white/12 text-white'
                        : 'border-l-transparent text-uc-lila hover:bg-white/8 hover:text-white',
                    ].join(' ')
                  }
                >
                  <Icono />
                  {etiqueta}
                </NavLink>
              ),
            )}
          </nav>
```

se reemplaza por:

```typescript
          <nav className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto px-3" aria-label="Navegación principal">
            {SECCIONES.map((seccion) => {
              const visibles = seccion.enlaces.filter((e) => !e.permiso || puede(e.permiso));
              if (visibles.length === 0) return null;

              const contenido = visibles.map(({ a, etiqueta, icono: Icono, exacto }) => (
                <NavLink
                  key={a}
                  to={a}
                  end={exacto}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-sm font-semibold transition',
                      isActive
                        ? 'border-l-white bg-white/12 text-white'
                        : 'border-l-transparent text-uc-lila hover:bg-white/8 hover:text-white',
                    ].join(' ')
                  }
                >
                  <Icono />
                  {etiqueta}
                </NavLink>
              ));

              // El ítem suelto de arriba (Resumen, sin título) no lleva
              // cabecera de sección ni puede colapsarse.
              if (seccion.titulo === null) {
                return (
                  <div key="raiz" className="flex flex-col gap-0.5">
                    {contenido}
                  </div>
                );
              }

              const abierta = !colapsadas.has(seccion.titulo);
              return (
                <div key={seccion.titulo} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => alternarSeccion(seccion.titulo!)}
                    aria-expanded={abierta}
                    className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold tracking-wide text-uc-lila/70 uppercase transition hover:text-uc-lila"
                  >
                    {seccion.titulo}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={abierta ? 'rotate-0 transition-transform' : '-rotate-90 transition-transform'}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {abierta && <div className="flex flex-col gap-0.5">{contenido}</div>}
                </div>
              );
            })}
          </nav>
```

El `overflow-y-auto` agregado en el `<nav>` es necesario porque, a
diferencia de la lista plana de antes, un árbol con todas las secciones
abiertas puede exceder la altura del sidebar en pantallas bajas — sin
esto, los últimos ítems (Reportes/Usuarios) quedarían inalcanzables. No
estaba en el pliego original del usuario, es una consecuencia directa
de agrupar en secciones colapsables, así que se agrega aquí.

- [ ] **Step 4: `ScopeSelector` en la cabecera del sidebar**

Después del bloque de cabecera (isotipo + "Gestión de Calidad", líneas
~154-170 hoy) y antes del `<nav>`, agregar:

```typescript
          <ScopeSelector
            etiqueta="Ámbito"
            valor={identidad?.carreraACargo ? 'Carrera asignada' : 'Universidad Continental'}
          />
```

**Nota real, no placeholder:** `identidad.carreraACargo` hoy es solo un
`id` (`string | null`, confirmado en `auth.api.ts`) — no trae el
**nombre** de la carrera. Mostrar el id crudo en el sidebar sería
ilegible. Hasta que exista un endpoint o un campo que traiga el nombre
(fuera del alcance de este plan — es contenido real de las Fases 1-3,
que sí necesitan datos de carrera reales para sus KPIs), el texto es
"Carrera asignada" en vez del `id` o de un nombre inventado. Esto es
intencional y no un hueco: no hay ningún dato real disponible hoy para
mostrar el nombre, y mostrar cualquier otra cosa sería mockear.

- [ ] **Step 5: Import de `ScopeSelector`**

Agregar a los imports de `AppLayout.tsx` (junto al de `LimiteDeError`,
línea ~14 hoy):

```typescript
import { ScopeSelector } from '@/shared/components/ui';
```

- [ ] **Step 6: Typecheck y arranque real**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```
Expected: limpio.

```bash
cd apps/web && npm run dev
```
Levanta el servidor de desarrollo y, con un navegador (o las
herramientas de Playwright si están disponibles en el entorno), navega
a la aplicación con una sesión real (o simulada) y confirma visualmente:
- Las 5 secciones se ven agrupadas, con "Resumen" arriba sin título de
  sección.
- Cada sección se colapsa/expande al pulsar su cabecera, con la flecha
  rotando.
- El `ScopeSelector` aparece bajo el logo, con "Ámbito" en mayúsculas
  pequeñas y el valor debajo.
- Ningún ítem que antes aparecía dejó de aparecer (compara contra los
  10 de la lista plana original) — sujeto igual que antes al filtro de
  permiso del usuario con el que se prueba.
- El scroll del `<nav>` funciona si las 5 secciones abiertas exceden el
  alto de la ventana (reduce la ventana del navegador para forzarlo si
  hace falta).

Detén el servidor de desarrollo después de confirmar.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/AppLayout.tsx
git commit -m "feat(dashboard): sidebar agrupado en secciones colapsables (Fase 0e)"
```

---

### Task 3: Componentes base para las Fases 1-3

**Files:**
- Modify: `apps/web/src/shared/components/ui/index.tsx`

**Interfaces:**
- Produces: `KpiCard`, `DataPanel`, `PendingList`, `SecondaryCardGrid`,
  `ReportBridgeCard` — todos con props tipadas, sin datos de negocio
  embebidos, listos para que las Fases 1-3 los llenen vía
  `@tanstack/react-query`. `StatusChip` reutiliza `Badge`/`TonoBadge`
  (Task 1) en vez de reimplementar variantes de color — no hace falta
  otro componente de cero, ver Step 1.

Ningún componente de esta tarea se conecta a ninguna ruta ni pantalla
— quedan exportados y sin usar hasta que las Fases 1-3 los consuman.
Es esperado y correcto para esta tarea: construir la pieza reutilizable
antes que la pantalla que la usa, no al revés.

- [ ] **Step 1: `StatusChip` — reutiliza `Badge`, no lo duplica**

El pliego original del usuario pedía un componente `StatusChip`
separado de `Badge`. Revisando el código real: `Badge` ya cubre
exactamente lo mismo que `StatusChip` pedía (texto sobre fondo, por
tono semántico, con el tono `encurso` ya agregado en la Task 1) — crear
un segundo componente con la misma forma sería duplicar, no extender.
**No crees un componente `StatusChip` nuevo.** Las Fases 1-3, cuando
necesiten un chip de estado, usan `Badge` con el `tono` correspondiente
— esto se documenta aquí para que quien lea el plan no busque un
`StatusChip` que no va a existir, y para que un futuro lector del código
entienda por qué falta si lo esperaba por el nombre del pliego original.

- [ ] **Step 2: `KpiCard`**

Agregar al final de `apps/web/src/shared/components/ui/index.tsx`:

```typescript
/* ── Tarjeta de KPI ───────────────────────────────────────────────────── */

/**
 * Una cifra destacada con su etiqueta, para la fila de indicadores de
 * cada vista de inicio (Fases 1-3). `tendencia` es opcional: no todo KPI
 * tiene una comparación temporal con sentido (ej. "Facultades activas"
 * no sube ni baja de un periodo a otro de forma significativa).
 */
export function KpiCard({
  etiqueta,
  valor,
  tendencia,
  className,
}: {
  etiqueta: string;
  valor: string | number;
  tendencia?: { texto: string; positiva: boolean };
  className?: string;
}) {
  return (
    <Tarjeta className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
        {etiqueta}
      </span>
      <span className="text-3xl font-extrabold tracking-tight text-tinta">{valor}</span>
      {tendencia && (
        <span
          className={cn(
            'text-xs font-semibold',
            tendencia.positiva ? 'text-estado-activo-fg' : 'text-alerta-fg',
          )}
        >
          {tendencia.texto}
        </span>
      )}
    </Tarjeta>
  );
}
```

- [ ] **Step 3: `DataPanel`**

```typescript
/* ── Panel de tabla principal ─────────────────────────────────────────── */

/** Una fila del panel de tabla: tag/título/meta/barra de progreso/chip. */
export interface FilaDataPanel {
  readonly id: string;
  readonly tag?: string;
  readonly titulo: string;
  readonly meta?: string;
  /** 0-100. Sin barra si se omite (no toda fila representa un avance). */
  readonly progreso?: number;
  readonly chip?: { texto: string; tono: TonoBadge };
  readonly href?: string;
}

/**
 * Panel de tabla principal de una vista de inicio (Fases 1-3) — filas
 * con tag/título/meta/barra/chip, cada una opcionalmente enlazada. Sin
 * paginación ni orden propios en esta fase: quien lo use decide cuántas
 * filas pasar y en qué orden.
 */
export function DataPanel({
  titulo,
  filas,
  vacio,
  className,
}: {
  titulo: string;
  filas: readonly FilaDataPanel[];
  /** Mensaje cuando `filas` está vacío — sin valor por defecto: cada consumidor lo redacta según su contexto. */
  vacio: string;
  className?: string;
}) {
  return (
    <Tarjeta className={cn('flex flex-col gap-4', className)}>
      <h2 className="text-sm font-extrabold tracking-tight text-tinta">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="py-6 text-center text-sm text-tinta-suave">{vacio}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {filas.map((fila) => (
            <li key={fila.id}>
              {fila.href ? (
                <Link
                  to={fila.href}
                  className="flex items-center gap-3 py-3 transition hover:bg-superficie-tenue"
                >
                  <ContenidoFilaDataPanel fila={fila} />
                </Link>
              ) : (
                <div className="flex items-center gap-3 py-3">
                  <ContenidoFilaDataPanel fila={fila} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

/**
 * Contenido interno de una fila de `DataPanel`, compartido entre la
 * variante enlazada (`Link`) y la simple (`div`) — evita el patrón de
 * "componente polimórfico" (`const Elemento = href ? Link : 'div'`),
 * que TypeScript estricto no tipa de forma segura en JSX: `Link` y
 * `'div'` no aceptan el mismo conjunto de props, así que hay que
 * bifurcar el elemento contenedor y no el "tipo de componente" en sí.
 */
function ContenidoFilaDataPanel({ fila }: { fila: FilaDataPanel }) {
  return (
    <>
      {fila.tag && (
        <span className="shrink-0 rounded-md bg-uc-lila-claro px-2 py-1 text-xs font-bold text-uc-primary">
          {fila.tag}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-tinta">{fila.titulo}</span>
        {fila.meta && <span className="block truncate text-xs text-tinta-suave">{fila.meta}</span>}
        {fila.progreso !== undefined && (
          <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-superficie-tenue">
            <span
              className="block h-full rounded-full bg-uc-primary"
              style={{ width: `${Math.max(0, Math.min(100, fila.progreso))}%` }}
            />
          </span>
        )}
      </span>
      {fila.chip && <Badge tono={fila.chip.tono}>{fila.chip.texto}</Badge>}
    </>
  );
}
```

`Link` ya está disponible en el proyecto vía `react-router-dom` — este
archivo (`shared/components/ui/index.tsx`) no lo importa hoy porque
ningún componente existente lo necesitaba; agrégalo al bloque de
imports del archivo:

```typescript
import { Link } from 'react-router-dom';
```

- [ ] **Step 4: `PendingList`**

```typescript
/* ── Lista de pendientes ──────────────────────────────────────────────── */

export interface ItemPendiente {
  readonly id: string;
  readonly texto: string;
  /** Color del punto — `true` para lo urgente (ej. vence en menos de 7 días). */
  readonly urgente?: boolean;
  readonly href?: string;
}

/**
 * Lista de pendientes con punto de color — "Pendientes de estructura"
 * (Admin), "Pendientes de tu decisión" (Director), "Mis plazos"
 * (Docente), según §6 del pliego original del usuario.
 */
export function PendingList({
  titulo,
  items,
  vacio,
  className,
}: {
  titulo: string;
  items: readonly ItemPendiente[];
  vacio: string;
  className?: string;
}) {
  return (
    <Tarjeta className={cn('flex flex-col gap-3', className)}>
      <h2 className="text-sm font-extrabold tracking-tight text-tinta">{titulo}</h2>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-tinta-suave">{vacio}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <Link
                  to={item.href}
                  className="flex items-start gap-2.5 text-sm text-tinta transition hover:text-uc-primary"
                >
                  <PuntoPendiente urgente={item.urgente} />
                  {item.texto}
                </Link>
              ) : (
                <div className="flex items-start gap-2.5 text-sm text-tinta">
                  <PuntoPendiente urgente={item.urgente} />
                  {item.texto}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

/** El punto de color de una fila de `PendingList` — mismo motivo de bifurcación que `ContenidoFilaDataPanel`. */
function PuntoPendiente({ urgente }: { urgente: boolean | undefined }) {
  return (
    <span
      className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', urgente ? 'bg-alerta-fg' : 'bg-uc-lila')}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 5: `SecondaryCardGrid`**

```typescript
/* ── Grid de tarjetas secundarias ─────────────────────────────────────── */

export interface TarjetaSecundaria {
  readonly id: string;
  readonly titulo: string;
  readonly valor: string | number;
  readonly detalle?: string;
  readonly href?: string;
}

/**
 * Grid de 4 tarjetas secundarias — "Altas recientes" (Admin), "Dentro
 * de Mejora Continua" (Director), "Competencias que evalúo" (Docente).
 * Sin límite forzado a 4 en el componente: quien lo use decide cuántas
 * pasar, el pliego original las describe como 4 pero eso es contenido,
 * no una restricción del componente.
 */
export function SecondaryCardGrid({
  items,
  className,
}: {
  items: readonly TarjetaSecundaria[];
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      {items.map((item) => {
        const tarjeta = (
          <Tarjeta
            className={cn('flex flex-col gap-1', item.href && 'transition hover:border-uc-lila')}
          >
            <span className="text-xs font-semibold text-tinta-suave">{item.titulo}</span>
            <span className="text-xl font-extrabold text-tinta">{item.valor}</span>
            {item.detalle && <span className="text-xs text-tinta-tenue">{item.detalle}</span>}
          </Tarjeta>
        );
        return item.href ? (
          <Link key={item.id} to={item.href}>
            {tarjeta}
          </Link>
        ) : (
          <div key={item.id}>{tarjeta}</div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `ReportBridgeCard`**

```typescript
/* ── Tarjeta puente a Reportes ────────────────────────────────────────── */

/**
 * Enlaza a `/reportes` con un título contextual por rol (§7 del pliego
 * original del usuario: "Cobertura y avance institucional" para Admin,
 * "Resultados vs. meta y cobertura" para Director, "Resultados de mis
 * competencias" para Docente). El texto exacto lo decide quien use el
 * componente — no está cableado aquí, porque es contenido de cada vista
 * de rol, no del componente compartido.
 */
export function ReportBridgeCard({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <Link to="/reportes" className="block">
      <Tarjeta className="flex items-center justify-between gap-3 transition hover:border-uc-lila">
        <span>
          <span className="block text-sm font-extrabold text-tinta">{titulo}</span>
          <span className="mt-0.5 block text-xs text-tinta-suave">{descripcion}</span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-uc-primary"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Tarjeta>
    </Link>
  );
}
```

- [ ] **Step 7: Typecheck**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```
Expected: limpio.

- [ ] **Step 8: Suite completa del frontend**

```bash
cd apps/web && npx vitest run
```
Expected: todo en verde, sin regresión — esta tarea no toca ningún
archivo con test existente, así que el número de tests no cambia
respecto a como quedó al final de la Fase 0a.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/shared/components/ui/index.tsx
git commit -m "feat(dashboard): KpiCard, DataPanel, PendingList, SecondaryCardGrid, ReportBridgeCard (Fase 0e)"
```

---

## Al terminar

El AppShell soporta secciones colapsables (con los mismos 10 destinos
de siempre, sin ninguno nuevo), el `ScopeSelector` está listo aunque
todavía no cambia de contexto, y los 5 componentes base que las Fases
1-3 necesitan existen, tipados, sin datos de negocio embebidos. Con
esto, los cinco planes de la Fase 0 quedan escritos — quedan por
ejecutar los que no se hayan corrido todavía (B, C, D según el estado
al momento de leer esto), y recién con los cinco ejecutados y
revisados, corresponde la revisión final de rama completa +
`finishing-a-development-branch` (Ruling registrado en el ledger de la
Fase 0a: la revisión final se hace una sola vez, al cerrar toda la
Fase 0, no plan por plan).
