# Vista de inicio del Administrador — Design

## 1. Qué es esto

Sub-proyecto 2 de las vistas de inicio por rol (el 1, el selector de vista, ya
está en `main`; ver
`docs/superpowers/specs/2026-09-23-dashboard-selector-vista-design.md`).
Reemplaza el stub `VistaAdminInicio` con la pantalla "Estructura
institucional" del mockup que compartió el usuario: cuatro KPIs, lista de
facultades, acción recomendada, pendientes de estructura, altas recientes y un
enlace a Reportes. Usa la paleta institucional existente, no los colores del
mockup.

Es la vista del Administrador institucional (`ADMIN_SISTEMA`). Las vistas de
Director y Docente son sub-proyectos aparte.

## 2. Decisiones ya tomadas con el usuario

1. **Backend nuevo, opción A:** un endpoint propio en `academico` que consume
   un puerto nuevo de `auth`. No se amplía `/reportes/panel` (es de
   `plan-estudios`) ni se compone en el navegador.
2. **"Aprobar alta: Ing. Mecatrónica · solicitada hace 1 semana" se omite.**
   Supone un flujo de solicitud y aprobación de carreras que no existe. Los
   pendientes se limitan a lo calculable hoy. El flujo de altas, si se quiere,
   es un proyecto aparte.
3. **Código de facultad y barra de progreso se derivan.** No se agrega columna
   `codigo` a `Facultad`.

## 3. Backend

### 3.1 Puerto nuevo en `auth`

`ConteoDeUsuariosPort` en `apps/api/src/modules/auth/application/ports/`,
mismo molde que `DirectorioDeUsuariosPort` (puerto pobre: solo números, nunca
datos de usuarios):

```typescript
export interface ConteoPorCarrera {
  /** Usuarios activos asignados a la carrera (cualquier rol acotado a ella). */
  readonly usuarios: number;
  /** De esos, los que tienen el rol DIRECTOR_CARRERA. */
  readonly directores: number;
}

export interface ConteoDeUsuariosPort {
  /** Una entrada por cada id pedido; las carreras sin nadie asignado vienen en cero. */
  conteoPorCarrera(carreraIds: readonly string[]): Promise<Map<string, ConteoPorCarrera>>;
  /** Todas las cuentas activas, tengan o no carrera asignada. */
  totalUsuariosActivos(): Promise<number>;
}

export const CONTEO_USUARIOS = Symbol('ConteoDeUsuariosPort');
```

El adaptador vive en `auth/infrastructure/` y es el único que lee
`usuario_carrera`, `usuarios` y `usuario_rol`. Solo cuentan usuarios con
`estado = ACTIVO`.

### 3.2 Endpoint en `academico`

`GET /estructura-institucional`, protegido con el permiso `usuario.gestionar`
(el que solo tiene el administrador; `facultad.leer` lo tienen todos los roles
y la pantalla muestra conteos de usuarios).

Respuesta:

```typescript
interface EstructuraInstitucional {
  kpis: {
    facultadesActivas: number;
    carreras: number;            // carreras activas
    usuariosConAcceso: number;   // totalUsuariosActivos()
    carrerasSinDirector: number;
  };
  facultades: {
    id: string;
    nombre: string;
    codigo: string;              // derivado, ver 3.3
    activa: boolean;
    carreras: number;            // carreras activas
    usuarios: number;            // suma de usuarios de sus carreras activas
    carrerasSinDirector: number;
    progreso: number;            // 0-100, ver 3.3
    estado: 'ACTIVA' | 'REVISAR' | 'INACTIVA';
  }[];
  carrerasSinDirector: { id: string; nombre: string; facultad: string }[];
  facultadesSinCarreras: { id: string; nombre: string }[];
  altasRecientes: {
    tipo: 'CARRERA' | 'FACULTAD';
    id: string;
    nombre: string;
    contexto: string;            // carrera: nombre de su facultad; facultad: 'Sin carreras aún' o 'N carreras'
    creadoEn: string;            // ISO 8601
  }[];
}
```

Caso de uso `ConsultarEstructuraInstitucional` en
`academico/application/use-cases/`: comprueba el permiso vía `AuthorizationPort`,
lee facultades y carreras por los repositorios propios, pide los conteos al
puerto de `auth` y delega el cálculo en la función de dominio de 3.3. Sin lógica
en el controller.

### 3.3 Reglas derivadas (dominio puro, sin Prisma ni NestJS)

Función `calcularEstructuraInstitucional` en `academico/domain/services/`:

- **Código de facultad:** 3 primeras letras de la última palabra del nombre, en
  mayúsculas y sin acentos. "Facultad de Ingeniería" → `ING`, "Facultad de
  Ciencias de la Empresa" → `EMP`, "Facultad de Ciencias de la Salud" → `SAL`,
  "Facultad de Humanidades" → `HUM`, "Facultad de Derecho" → `DER`. Si la última
  palabra tiene menos de 3 letras se usa entera.
- **Solo cuentan carreras activas** para carreras, usuarios, "sin director" y
  progreso. Una carrera inactiva sin director no es una tarea pendiente.
- **Sin director:** carrera activa cuyo `directores` es 0.
- **Progreso:** carreras activas con director / carreras activas de la
  facultad, redondeado al entero, de 0 a 100. Con 0 carreras es 0.
- **Estado:** `INACTIVA` si la facultad está inactiva; `REVISAR` si está activa
  y (no tiene carreras activas o alguna carrera activa no tiene director);
  `ACTIVA` en otro caso.
- **KPI `facultadesActivas`:** facultades con estado activo. `carreras`: total
  de carreras activas de facultades activas.
- **Altas recientes:** las 4 más nuevas por `creadoEn` entre facultades y
  carreras activas, mezcladas, de más nueva a más vieja. Empate: por nombre.
- **`kpis.carrerasSinDirector`** es exactamente la longitud de la lista
  `carrerasSinDirector`, y `kpis.carreras` la suma de `carreras` de las
  facultades activas: el KPI y el detalle nunca pueden discrepar.
- **Listas:** `facultades` ordenadas por nombre; `carrerasSinDirector` por
  facultad y luego nombre; solo de facultades activas.

### 3.4 Aislamiento

`academico` importa de `auth` únicamente los puertos (`AuthorizationPort`, ya
existente, y `ConteoDeUsuariosPort`). Se amplía `academico/aislamiento.spec.ts`
con una guardia hermana, con su propio control positivo (un patrón que dejara
de casar convertiría la regla en `[]` contra `[]`), que vigila que lo único
importado de `auth` en `application/` y `domain/` sean archivos de
`application/ports/`.

## 4. Frontend

`apps/web/src/features/dashboard/`:

```
api/
  estructura.api.ts          — obtenerEstructuraInstitucional()
pages/
  VistaAdminInicio.tsx       — reemplaza el stub
components/
  AccionRecomendada.tsx      — tarjeta morada del mockup
```

- **Composición con lo ya construido en Fase 0e** (sin componentes de UI
  compartidos nuevos): `KpiCard` ×4, `DataPanel` para las facultades (`tag` =
  código, `meta` = "N carreras · M usuarios", `progreso`, `chip` con tono
  `activo`/`progreso`/`inactivo`), `PendingList`, `SecondaryCardGrid` para las
  altas recientes y `ReportBridgeCard`.
- **`AccionRecomendada`:** componente propio de esta vista. Degradado con los
  tokens `uc-primary`, `uc-v1` y `uc-dark` que ya usa `ResumenGenerico`. Texto:
  "N carreras sin director asignado" y los nombres de las primeras dos. Solo se
  renderiza si `carrerasSinDirector` no está vacío. Su botón "Asignar
  responsables" lleva a `/usuarios`.
- **Enlaces:** "Ver todo" y cada fila de facultad → `/plan-estudios`.
- **Pendientes:** una línea por carrera sin director ("Asignar director a X" /
  "Carrera sin responsable") y por facultad sin carreras ("Registrar carreras de
  X" / "Facultad creada sin carreras"), las carreras primero, máximo 5.
- **Datos:** un solo `useQuery` con clave `['estructura-institucional']`.
- **Colores:** solo tokens existentes de `apps/web/src/styles/global.css`.
  Ninguno nuevo.

## 5. Errores y estados de carga

- **Cargando:** los KPIs y paneles muestran esqueletos; la vista no salta de
  tamaño al llegar los datos.
- **Falla el endpoint** (red, 403, 500): mensaje de error dentro de la vista,
  con botón de reintentar; el shell (sidebar y header) no se afecta.
- **Sin nada pendiente:** no aparece la tarjeta morada y `PendingList` muestra
  su estado vacío.
- **Sin altas recientes:** el bloque muestra un texto vacío, no desaparece.

## 6. Testing

- **Dominio** (`calcularEstructuraInstitucional`): código de facultad con
  cada nombre del mockup y con una palabra corta o con acento; carrera inactiva
  excluida de todo; facultad sin carreras → `REVISAR` y progreso 0; facultad
  inactiva → `INACTIVA`; altas recientes mezcladas, tope de 4 y desempate.
- **Caso de uso:** con puertos falsos; sin el permiso lanza denegación y no
  consulta a `auth`.
- **Integración del endpoint** (contra base efímera, como el resto): 403 sin
  `usuario.gestionar`, 200 con el administrador, conteos coherentes con datos
  sembrados.
- **Adaptador de `auth`:** cuenta solo usuarios activos; un usuario inactivo
  asignado a una carrera no suma; una carrera sin nadie devuelve ceros.
- **Guardia de aislamiento** con control positivo.
- **Frontend:** la vista con el endpoint simulado — datos completos, sin
  carreras sin director (la tarjeta morada no aparece), estado de error con
  reintento y estado de carga. Chequeo de accesibilidad con `axe-core` como el
  resto de pantallas.

## 7. Limitaciones conocidas (aceptadas)

- `usuariosConAcceso` cuenta todas las cuentas activas; el `usuarios` de cada
  facultad cuenta solo las asignadas a una carrera. Un administrador o un
  docente sin carrera está en el total y en ninguna facultad, así que la suma
  por facultad no iguala al KPI. No se fuerza a que cuadre: exigiría inventar
  una asignación que no existe.
- El permiso `usuario.gestionar` acopla esta vista a "quien administra
  usuarios". Si más adelante otro rol debe verla, se introduce un permiso
  propio.
- Son 4 altas recientes fijas, sin paginación.

## 8. Fuera de alcance

- Flujo de solicitud y aprobación de altas de carreras.
- Columna `codigo` persistida en `Facultad`.
- Las vistas de Director y Docente.
- La decisión pendiente sobre usuarios con `COORDINADOR_ACADEMICO` y `DOCENTE`
  a la vez (afecta al sub-proyecto 4, no a este).
