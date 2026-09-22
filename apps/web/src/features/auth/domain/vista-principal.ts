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
