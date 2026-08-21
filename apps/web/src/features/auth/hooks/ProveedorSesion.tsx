/**
 * Proveedor de sesión.
 *
 * Un único sitio donde la aplicación sabe quién está dentro y qué puede hacer.
 * Los componentes preguntan `puede('plan.aprobar')` en vez de mirar el rol,
 * porque §3.5 dice que los roles se configuran como datos: comprobar el nombre
 * del rol en el código volvería a meter esa configuración dentro del despliegue.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { leerSesion, limpiarSesion, suscribirseASesion } from '../../../shared/api/sesion';
import {
  cerrarSesion as cerrarEnServidor,
  consultarIdentidad,
  type Identidad,
} from '../api/auth.api';
import { ContextoSesion, type ValorSesion } from './contexto-sesion';

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [identidad, setIdentidad] = useState<Identidad | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al arrancar (y al recargar la página) hay token guardado pero no identidad:
  // se pide al servidor en vez de deducirla del token, que además podría llevar
  // permisos ya caducados.
  useEffect(() => {
    let vigente = true;

    async function restaurar() {
      if (!leerSesion()) {
        if (vigente) setCargando(false);
        return;
      }
      try {
        const recuperada = await consultarIdentidad();
        if (vigente) setIdentidad(recuperada);
      } catch {
        // Token inservible: se descarta y el usuario vuelve al login.
        limpiarSesion();
      } finally {
        if (vigente) setCargando(false);
      }
    }

    void restaurar();
    return () => {
      vigente = false;
    };
  }, []);

  // Si el cliente HTTP limpia la sesión —refresh caducado a mitad de trabajo—,
  // el contexto tiene que enterarse para que la ruta protegida reaccione.
  useEffect(
    () =>
      suscribirseASesion(() => {
        if (!leerSesion()) setIdentidad(null);
      }),
    [],
  );

  const permisos = useMemo(() => new Set(identidad?.permisos ?? []), [identidad]);

  const puede = useCallback((permiso: string) => permisos.has(permiso), [permisos]);

  const dirigeCarrera = useCallback(
    (carreraId: string | null | undefined) =>
      // `null` en `carreraACargo` significa "no está acotado a ninguna", no
      // "las dirige todas": quien no tiene carrera asignada no dirige nada.
      carreraId != null && identidad?.carreraACargo === carreraId,
    [identidad],
  );

  const puedeEn = useCallback(
    (permiso: string, carreraId: string | null | undefined) => {
      if (!permisos.has(permiso)) return false;
      // Sin carrera en juego —la estructura académica es institucional— no hay
      // nada que acotar.
      if (carreraId == null) return true;
      // Un rol sin carrera asignada no está acotado a ninguna: el administrador
      // gestiona facultades de toda la universidad.
      if (identidad?.carreraACargo == null) return true;
      return identidad.carreraACargo === carreraId;
    },
    [permisos, identidad],
  );

  const entrar = useCallback((nueva: Identidad) => setIdentidad(nueva), []);

  const salir = useCallback(async () => {
    await cerrarEnServidor();
    setIdentidad(null);
  }, []);

  const valor = useMemo<ValorSesion>(
    () => ({ identidad, cargando, puede, dirigeCarrera, puedeEn, entrar, salir }),
    [identidad, cargando, puede, dirigeCarrera, puedeEn, entrar, salir],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}
