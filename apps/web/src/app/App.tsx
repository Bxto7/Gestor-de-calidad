import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './AppLayout';
import { RutaProtegida } from '@/features/auth/components/RutaProtegida';
import { ProveedorSesion } from '@/features/auth/hooks/ProveedorSesion';
import { AccesoPage } from '@/features/auth/pages/AccesoPage';
import { AsignaturasPage } from '@/features/plan-estudios/pages/AsignaturasPage';
import { CarrerasPage } from '@/features/plan-estudios/pages/CarrerasPage';
import { CompetenciasPage } from '@/features/plan-estudios/pages/CompetenciasPage';
import { FacultadesPage } from '@/features/plan-estudios/pages/FacultadesPage';
import { MallaCurricularPage } from '@/features/plan-estudios/pages/MallaCurricularPage';
import { ObjetivosPage } from '@/features/plan-estudios/pages/ObjetivosPage';
import { PlanEstudiosPage } from '@/features/plan-estudios/pages/PlanEstudiosPage';
import { ResumenPage } from '@/features/plan-estudios/pages/ResumenPage';
import { ErrorDeNegocio } from '@/shared/api/cliente';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos del plan cambian por acción del usuario, no solos: no tiene
      // sentido refetchear al volver a la pestaña.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // Un 403, un 404 o un 409 no mejoran por reintentar: son la respuesta,
      // no un fallo pasajero. Reintentarlos solo retrasa el mensaje al usuario
      // y multiplica la carga por tres cuando el servidor ya dijo que no.
      retry: (intentos, fallo) => !(fallo instanceof ErrorDeNegocio) && intentos < 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ProveedorSesion>
          <Routes>
            <Route path="/acceso" element={<AccesoPage />} />

            {/* Todo lo demás exige sesión iniciada. */}
            <Route element={<RutaProtegida />}>
              <Route element={<AppLayout />}>
                <Route index element={<ResumenPage />} />
                <Route path="plan-estudios" element={<FacultadesPage />} />
                <Route path="plan-estudios/facultades/:facultadId" element={<CarrerasPage />} />
                <Route path="plan-estudios/planes/:planId" element={<PlanEstudiosPage />} />
                <Route path="plan-estudios/planes/:planId/objetivos" element={<ObjetivosPage />} />
                <Route
                  path="plan-estudios/planes/:planId/competencias"
                  element={<CompetenciasPage />}
                />
                <Route
                  path="plan-estudios/planes/:planId/asignaturas"
                  element={<AsignaturasPage />}
                />
                <Route
                  path="plan-estudios/planes/:planId/malla"
                  element={<MallaCurricularPage />}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </ProveedorSesion>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
