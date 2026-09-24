/**
 * 3.1 Inicio / Resumen — despachador por rol, sin RF asociados.
 *
 * Elige qué vista de inicio mostrar según `vistaActiva` (auth, Fase 0a).
 * Los roles sin vista propia (`COORDINADOR_ACADEMICO`, `USUARIO_CONSULTOR`)
 * y cualquier `vistaActiva` no reconocida (`null`) caen en `ResumenGenerico`
 * — el contenido original de esta pantalla, sin cambios.
 */

import { useEffect } from 'react';

import { useEncabezado } from '@/app/encabezado';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';

import { SelectorDeVista } from '../components/SelectorDeVista';
import { ResumenGenerico } from './ResumenGenerico';
import { VistaAdminInicio } from './VistaAdminInicio';
import { VistaDirectorInicio } from './VistaDirectorInicio';
import { VistaDocenteInicio } from './VistaDocenteInicio';

export function ResumenPage() {
  const { vistaActiva } = useSesion();
  const { publicar } = useEncabezado();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Resumen' }], acciones: <SelectorDeVista /> });
    // Páginas que nunca llaman `publicar` heredarían estas acciones si no se limpian.
    return () => publicar({ migas: [], acciones: null });
    // `publicar` es estable dentro del render del layout; incluirlo dispararía
    // un bucle porque el contexto se recrea al publicar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
