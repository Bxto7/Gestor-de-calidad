/**
 * Guardia de rutas.
 *
 * Recuerda a dónde iba el usuario antes de mandarlo al login, para devolverlo
 * ahí después de entrar. Sin eso, quien abre un enlace directo a un plan acaba
 * en el inicio y tiene que volver a navegar hasta él.
 *
 * Esto **no es** control de acceso: solo evita pedir datos que el servidor
 * rechazaría. Quien autoriza es el backend en cada petición.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSesion } from '../hooks/contexto-sesion';

export function RutaProtegida() {
  const { identidad, cargando } = useSesion();
  const ubicacion = useLocation();

  // Al recargar la página hay un instante en el que todavía no se sabe si el
  // token guardado sirve. Redirigir en ese momento expulsaría a un usuario con
  // sesión válida en cada F5.
  if (cargando) return null;

  if (!identidad) {
    return (
      <Navigate
        to="/acceso"
        replace
        state={{ desde: `${ubicacion.pathname}${ubicacion.search}` }}
      />
    );
  }

  return <Outlet />;
}
