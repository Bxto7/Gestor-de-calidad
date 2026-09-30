/**
 * Guardia de autorización por ruta (RF-CH-002 a 005).
 *
 * Vive siempre anidada dentro de `RutaProtegida`: cuando llega a montarse, la
 * sesión ya terminó de restaurarse y hay una identidad válida. Por eso no
 * repite la comprobación de `cargando` — repetirla sería una rama de código
 * que este árbol de rutas nunca ejercita.
 *
 * Solo mira el permiso plano (`puede`), nunca la carrera del recurso: un rol
 * puede seguir consultando en modo lectura el contenido de otra carrera
 * (§3.5), y este guard no debe impedirlo. El acotamiento por carrera lo
 * decide el backend en cada petición, igual que ya lo documenta
 * `RutaProtegida` para la autenticación.
 *
 * `redirigirA` es a dónde se manda a quien no tiene el permiso. Por defecto es
 * `/`, el resumen, que es un destino válido para cualquier rol autenticado.
 */

import { Navigate, Outlet } from 'react-router-dom';

import { useSesion } from '../hooks/contexto-sesion';

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
