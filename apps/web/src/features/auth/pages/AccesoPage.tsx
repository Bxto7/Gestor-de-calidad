/**
 * Pantalla de acceso conectada.
 *
 * `LoginPage` es puramente presentacional y se queda así: no sabe que existe
 * una API. Este componente es el que la ata a la sesión, de modo que la
 * pantalla siga pudiendo verse aislada —y probarse— sin servidor detrás.
 */

import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';

import { ErrorDeConexion, ErrorDeNegocio } from '../../../shared/api/cliente';
import { iniciarSesion } from '../api/auth.api';
import { useSesion } from '../hooks/contexto-sesion';
import { LoginPage, type Credenciales } from './LoginPage';

export function AccesoPage() {
  const { identidad, cargando, entrar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Mientras se restaura la sesión guardada no se decide nada: pintar el login
  // aquí haría parpadear la pantalla de acceso a quien ya estaba dentro.
  if (cargando) return null;

  // A dónde iba antes de que se le pidiera entrar. Si llegó directo al login,
  // al inicio.
  const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/';
  if (identidad) return <Navigate to={destino} replace />;

  async function manejarEnvio({ correo, password }: Credenciales) {
    setError(null);
    setEnviando(true);
    try {
      entrar(await iniciarSesion(correo.trim(), password));
      // `navigate` devuelve una promesa en react-router 7; no hay nada que
      // esperar aquí, pero descartarla explícitamente evita dejarla suelta.
      void navegar(destino, { replace: true });
    } catch (fallo) {
      // Las credenciales incorrectas llegan como 403 desde el backend, que no
      // distingue entre correo inexistente y contraseña equivocada: decirlo
      // sería confirmar qué cuentas existen.
      if (fallo instanceof ErrorDeNegocio) {
        setError(
          fallo.estado === 429
            ? 'Demasiados intentos seguidos. Espera un minuto antes de volver a probar.'
            : 'Correo o contraseña incorrectos.',
        );
      } else if (fallo instanceof ErrorDeConexion) {
        setError(fallo.message);
      } else {
        setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return <LoginPage onSubmit={manejarEnvio} error={error} enviando={enviando} />;
}
