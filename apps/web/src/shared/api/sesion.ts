/**
 * Almacenamiento de la sesión en el navegador.
 *
 * Se usa `sessionStorage` y no `localStorage` a propósito: la sesión muere al
 * cerrar la pestaña. En un laboratorio de cómputo compartido —que es donde va a
 * usarse esto— dejar la sesión viva en el navegador tras cerrar la ventana es
 * dejarla abierta para el siguiente que se siente.
 *
 * Guardar tokens en el almacenamiento del navegador expone a XSS: quien logre
 * inyectar un script puede leerlos. La alternativa —cookie `HttpOnly`— exige
 * que el backend las emita y las valide, y además defensa contra CSRF. No es
 * complicado, pero es un cambio en los dos lados; queda anotado como pendiente
 * antes de manejar datos reales en producción (OWASP ASVS L2, §6.2).
 */

const CLAVE = 'sgc.sesion';

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  usuario: { id: string; nombre: string };
}

/** Quienes quieren enterarse de que la sesión cambió (el contexto de React). */
const suscriptores = new Set<() => void>();

export function suscribirseASesion(escuchar: () => void): () => void {
  suscriptores.add(escuchar);
  return () => suscriptores.delete(escuchar);
}

function avisar(): void {
  for (const escuchar of suscriptores) escuchar();
}

export function leerSesion(): Sesion | null {
  try {
    const guardado = sessionStorage.getItem(CLAVE);
    if (!guardado) return null;

    const sesion = JSON.parse(guardado) as Partial<Sesion>;
    // Un almacenamiento manipulado o de una versión anterior no debe dejar la
    // aplicación en un estado a medias: si falta algo, no hay sesión.
    if (!sesion.accessToken || !sesion.refreshToken || !sesion.usuario) return null;
    return sesion as Sesion;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: Sesion): void {
  sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
  avisar();
}

export function limpiarSesion(): void {
  sessionStorage.removeItem(CLAVE);
  avisar();
}
