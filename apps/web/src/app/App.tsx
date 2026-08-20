import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './AppLayout';
import { AsignaturasPage } from '@/features/plan-estudios/pages/AsignaturasPage';
import { CarrerasPage } from '@/features/plan-estudios/pages/CarrerasPage';
import { CompetenciasPage } from '@/features/plan-estudios/pages/CompetenciasPage';
import { FacultadesPage } from '@/features/plan-estudios/pages/FacultadesPage';
import { MallaCurricularPage } from '@/features/plan-estudios/pages/MallaCurricularPage';
import { ObjetivosPage } from '@/features/plan-estudios/pages/ObjetivosPage';
import { PlanEstudiosPage } from '@/features/plan-estudios/pages/PlanEstudiosPage';
import { ResumenPage } from '@/features/plan-estudios/pages/ResumenPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos del plan cambian por acción del usuario, no solos: no tiene
      // sentido refetchear al volver a la pestaña.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
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
            <Route path="plan-estudios/planes/:planId/asignaturas" element={<AsignaturasPage />} />
            <Route path="plan-estudios/planes/:planId/malla" element={<MallaCurricularPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
