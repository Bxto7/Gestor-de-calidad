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
 */

import { Navigate, Outlet } from 'react-router-dom';

import { useSesion } from '../hooks/contexto-sesion';

export function RutaConPermiso({ permiso }: { permiso: string }) {
  const { puede } = useSesion();

  if (!puede(permiso)) return <Navigate to="/" replace />;

  return <Outlet />;
}
