/**
 * Vista de inicio del Administrador institucional (`ADMIN_SISTEMA`):
 * «Estructura institucional».
 *
 * Todo sale de una sola consulta a `/estructura-institucional`; el cálculo vive
 * en el backend (`calcularEstructuraInstitucional`) y la traducción a props en
 * `domain/vista-admin.ts`. Esta página solo compone.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  Boton,
  DataPanel,
  KpiCard,
  PendingList,
  ReportBridgeCard,
  SecondaryCardGrid,
} from '@/shared/components/ui';

import { obtenerEstructuraInstitucional } from '../api/estructura.api';
import { AccionRecomendada } from '../components/AccionRecomendada';
import { filaDeFacultad, pendientesDe, tarjetasDeAltas } from '../domain/vista-admin';

/** Mismas proporciones que la vista cargada, para que no salte de tamaño. */
function Esqueleto() {
  const bloque = 'animate-pulse rounded-2xl bg-superficie-tenue';
  return (
    <div role="status" aria-label="Cargando estructura institucional" className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bloque} h-24`} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${bloque} h-64`} />
        <div className={`${bloque} h-64`} />
      </div>
    </div>
  );
}

export function VistaAdminInicio() {
  const consulta = useQuery({
    queryKey: ['estructura-institucional'],
    queryFn: obtenerEstructuraInstitucional,
  });

  if (consulta.isPending) return <Esqueleto />;

  if (consulta.isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 rounded-2xl bg-superficie-tenue p-6"
      >
        <p className="text-sm text-tinta">No se pudo cargar la estructura institucional.</p>
        <Boton onClick={() => void consulta.refetch()}>Reintentar</Boton>
      </div>
    );
  }

  const e = consulta.data;
  const altas = tarjetasDeAltas(e.altasRecientes);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-tinta">Estructura institucional</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard etiqueta="Facultades activas" valor={e.kpis.facultadesActivas} />
        <KpiCard etiqueta="Carreras" valor={e.kpis.carreras} />
        <KpiCard etiqueta="Usuarios con acceso" valor={e.kpis.usuariosConAcceso} />
        <KpiCard etiqueta="Carreras sin director" valor={e.kpis.carrerasSinDirector} />
      </div>

      <AccionRecomendada carreras={e.carrerasSinDirector} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <DataPanel
            titulo="Facultades"
            filas={e.facultades.map(filaDeFacultad)}
            vacio="Aún no hay facultades registradas."
          />
          <Link to="/plan-estudios" className="text-sm font-semibold text-uc-primary">
            Ver todo
          </Link>
        </div>
        <PendingList
          titulo="Pendientes de estructura"
          items={pendientesDe(e)}
          vacio="No hay pendientes de estructura."
        />
      </div>

      <section aria-labelledby="altas-recientes" className="space-y-3">
        <h2 id="altas-recientes" className="text-sm font-semibold text-tinta">
          Altas recientes
        </h2>
        {altas.length === 0 ? (
          <p className="text-sm text-tinta-suave">Sin altas recientes.</p>
        ) : (
          <SecondaryCardGrid items={altas} />
        )}
      </section>

      <ReportBridgeCard
        titulo="Reportes"
        descripcion="Consulta los reportes de cobertura y estado de los planes de estudio."
      />
    </div>
  );
}
