# Selector de vista por rol — Fundación compartida — Design

## 1. Qué es esto

Primer sub-proyecto de "las Fases 1-3" que la Fase 0 del dashboard dejó
deliberadamente sin construir (ver
`docs/superpowers/specs/2026-09-22-dashboard-fase0-fundacion-design.md`,
"Fuera de alcance"). El usuario compartió 3 mockups reales (Admin,
Director de Carrera, Docente) con el contenido exacto que quiere para
cada vista de inicio, más un selector de pestañas para cambiar entre
las vistas que le correspondan a un usuario.

Ese trabajo es demasiado grande para un solo spec — son 3 verticales de
datos independientes (Admin↔`academico`, Director↔`mejora-continua`,
Docente↔`evaluacion`) que solo comparten la plomería de "qué vista
mostrar". Este spec cubre **solo esa plomería compartida**: el
interruptor de vista y el cascarón vacío de cada una. El contenido real
de cada vista es su propio sub-proyecto (spec → plan → implementación
aparte), a construir después de este.

## 2. Decisiones ya tomadas con el usuario

1. **Vista de Docente, alcance de datos**: se acota a lo que ya existe
   en el modelo (`AsignaturaEvaluada.docenteId`) — "asignaturas donde
   tengo una evaluación asignada", no una carga docente formal. No se
   construye ninguna tabla nueva de asignación docente↔asignatura en
   este trabajo. (Esta decisión afecta al sub-proyecto de la vista de
   Docente, no a este spec, pero queda registrada aquí porque se tomó
   en la misma conversación.)
2. **Selector de pestañas, alcance de seguridad**: solo muestra las
   pestañas de los roles que el usuario realmente tiene — nunca todas
   las 3 sin importar el rol. Es el tema central de este spec.
3. **Backend nuevo para las vistas de contenido**: se construye lo que
   haga falta (no una versión recortada solo-frontend) — aplica a los
   sub-proyectos 2-4, no a este.
4. **Roles sin vista propia** (`COORDINADOR_ACADEMICO`,
   `USUARIO_CONSULTOR`): siguen viendo la página genérica actual
   (módulos activos + cobertura de criterios), sin cambios, hasta que
   exista un mockup para ellos.

## 3. Arquitectura

### 3.1 Estructura de archivos

`ResumenPage` vive hoy en `apps/web/src/features/plan-estudios/pages/ResumenPage.tsx`
— un lugar equivocado, porque no es contenido de Plan de Estudios, es
la página de inicio de toda la app. Se mueve a un feature propio:

```
apps/web/src/features/dashboard/
  pages/
    ResumenPage.tsx          — despachador (Step 3.2)
    ResumenGenerico.tsx      — el contenido actual de ResumenPage, extraído tal cual
    VistaAdminInicio.tsx     — stub vacío (ver 3.4)
    VistaDirectorInicio.tsx  — stub vacío
    VistaDocenteInicio.tsx   — stub vacío
  components/
    SelectorDeVista.tsx      — las pestañas (ver 3.3)
```

`App.tsx` actualiza el import de `ResumenPage` a la ruta nueva — la
propia ruta (`/`, `index`) no cambia.

### 3.2 `ResumenPage` — despachador

Componente delgado, sin lógica propia más allá de decidir qué
renderizar:

```typescript
export function ResumenPage() {
  const { vistaActiva } = useSesion();

  switch (vistaActiva) {
    case 'ADMIN_SISTEMA':
      return <VistaAdminInicio />;
    case 'DIRECTOR_CARRERA':
      return <VistaDirectorInicio />;
    case 'DOCENTE':
      return <VistaDocenteInicio />;
    default:
      // COORDINADOR_ACADEMICO, USUARIO_CONSULTOR, o null (sin rol reconocido)
      return <ResumenGenerico />;
  }
}
```

`vistaActiva` es `RolVista | null`, ya definido en
`apps/web/src/features/auth/domain/vista-principal.ts` (Fase 0a) — este
spec no cambia su tipo ni su lógica de prioridad, solo lo consume.

### 3.3 `SelectorDeVista`

```typescript
const ROLES_CON_VISTA_PROPIA = ['ADMIN_SISTEMA', 'DIRECTOR_CARRERA', 'DOCENTE'] as const;

const ETIQUETA: Record<(typeof ROLES_CON_VISTA_PROPIA)[number], string> = {
  ADMIN_SISTEMA: 'Administrador',
  DIRECTOR_CARRERA: 'Director de carrera',
  DOCENTE: 'Docente',
};

export function SelectorDeVista() {
  const { identidad, vistaActiva, cambiarVista } = useSesion();

  const disponibles = ROLES_CON_VISTA_PROPIA.filter((rol) =>
    identidad?.roles.includes(rol),
  );

  // Con 0 o 1 rol de los 3, no hay nada que cambiar — no se renderiza nada.
  if (disponibles.length < 2) return null;

  return (
    <div role="tablist" aria-label="Cambiar vista" className="flex gap-1 rounded-lg bg-superficie-tenue p-1">
      {disponibles.map((rol) => (
        <button
          key={rol}
          type="button"
          role="tab"
          aria-selected={vistaActiva === rol}
          onClick={() => cambiarVista(rol)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-semibold transition',
            vistaActiva === rol
              ? 'bg-superficie text-uc-primary shadow-sm'
              : 'text-tinta-suave hover:text-tinta',
          )}
        >
          {ETIQUETA[rol]}
        </button>
      ))}
    </div>
  );
}
```

**Dónde se monta**: no en `AppLayout` (afectaría a todas las páginas).
`AppLayout.tsx` ya expone un mecanismo (`CtxEncabezado`) para que cada
página inyecte contenido junto al breadcrumb de su propia cabecera —
`ResumenPage` lo usa para poner `<SelectorDeVista />` ahí. El
implementador debe leer `apps/web/src/app/encabezado.ts` (o donde viva
hoy `CtxEncabezado`/`ContextoEncabezado`/`Encabezado`) para confirmar
la forma exacta de ese contrato antes de escribir esto — no se asume
aquí una API que no se ha verificado en el código real.

Colores: `bg-superficie-tenue`/`bg-superficie`/`text-uc-primary`/
`text-tinta-suave`/`text-tinta` — todos ya existen en
`apps/web/src/styles/global.css`. Ninguno nuevo.

### 3.4 Los 3 stubs

Cada uno, por ahora, es solo esto (mismo molde los 3, cambia el
nombre):

```typescript
export function VistaAdminInicio() {
  return (
    <div className="text-sm text-tinta-suave">
      Vista de Administrador — contenido pendiente (sub-proyecto 2).
    </div>
  );
}
```

El sub-proyecto correspondiente reemplaza el cuerpo entero — esto
existe solo para que `ResumenPage` tenga algo real que importar y para
que el despachador (3.2) sea comprobable con test desde ya, sin esperar
a que el contenido real esté listo.

### 3.5 `ScopeSelector` — valor real

Hoy (`apps/web/src/app/AppLayout.tsx`) `ScopeSelector` recibe
`valor={identidad?.carreraACargo ? 'Carrera asignada' : 'Universidad Continental'}`
— un placeholder de texto fijo, documentado como intencional hasta que
hubiera un dato real que mostrar (ver Fase 0e). Ese dato ya existe: el
endpoint `GET /carreras/:id` (módulo `academico`, Fase 0b) devuelve
`nombre`. Se resuelve así, sin tocar el backend:

```typescript
const { data: carrera } = useQuery({
  queryKey: ['carrera', identidad?.carreraACargo],
  queryFn: () => obtenerCarrera(identidad!.carreraACargo!),
  enabled: !!identidad?.carreraACargo,
});

<ScopeSelector
  etiqueta="Ámbito"
  valor={carrera?.nombre ?? (identidad?.carreraACargo ? 'Cargando…' : 'Universidad Continental')}
/>
```

`obtenerCarrera` se agrega a `apps/web/src/features/plan-estudios/api/`
(o donde ya vivan las llamadas a `/carreras`, revisar
`api/queries.ts`/`*.api.ts` existentes antes de duplicar código) — es
un `fetch` GET simple, ya existe el patrón para copiarlo.

Este cambio se hace donde `AppLayout.tsx` ya renderiza `ScopeSelector`
(línea ~157 hoy) — no se mueve el componente, solo se le pasa el valor
real en vez del placeholder.

## 4. Errores y estados de carga

- `GET /carreras/:id` fallando (red, 404): `ScopeSelector` cae a
  mostrar el id crudo como último recurso, no un mensaje de error — es
  una etiqueta de contexto, no un flujo crítico; un error ahí no debe
  romper el resto del sidebar. `react-query` ya maneja el estado de
  error internamente, no hace falta lógica adicional más allá de un
  `??` con un valor de reserva razonable.
- Un usuario con un rol no reconocido por `vistaPrincipalDe` (`roles`
  vacío o con roles fuera de los 5 conocidos): `vistaActiva` es `null`,
  `ResumenPage` cae al `default` (`ResumenGenerico`) — mismo
  comportamiento de hoy, sin cambios.

## 5. Testing

- `SelectorDeVista.test.tsx` (nuevo): con 0, 1 y 2+ roles de los 3 —
  confirma que no renderiza nada con menos de 2, que renderiza los
  botones correctos con 2+, y que un click llama `cambiarVista` con el
  rol correcto. Mismo patrón de test ya usado para `vistaPrincipalDe`
  (`vista-principal.test.ts`, Fase 0a).
- `ResumenPage.test.tsx` (nuevo): un caso por rama del `switch` —
  `vistaActiva` en cada uno de los 5 valores posibles (incluido `null`)
  renderiza el componente esperado. Se prueba con un doble simple de
  `useSesion()`, mismo criterio que ya usa el resto del proyecto para
  componentes que consumen contexto.
- Sin test nuevo para los 3 stubs (Step 3.4) — no tienen comportamiento
  propio todavía.
- `ScopeSelector` con dato real: cubierto por un test de
  `AppLayout.test.tsx` si ya existe uno (verificar), o uno nuevo
  acotado — confirma que se llama `obtenerCarrera` con el id correcto
  cuando `vistaActiva` es Director/Docente, y que no se llama en
  absoluto para Admin (evita una petición de red innecesaria).

## 6. Fuera de alcance (de este spec, no del proyecto)

- El contenido real de las 3 vistas — sub-proyectos 2, 3 y 4 aparte.
- Persistir `vistaActiva` entre sesiones (hoy es en memoria, se pierde
  al recargar — decisión ya tomada en Fase 0a, no se revisita aquí).
- Cualquier cambio a `AuthorizationPort`/`ConsultarSesion` en el
  backend — este spec no toca el backend en absoluto, todo se resuelve
  con el endpoint `GET /carreras/:id` que ya existe.
