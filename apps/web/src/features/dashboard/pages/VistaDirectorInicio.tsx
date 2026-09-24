/**
 * Vista de inicio del Director de Carrera (`DIRECTOR_CARRERA`).
 *
 * Todo sale de una sola consulta a `/mejora-continua/resumen-carrera`; el cálculo
 * vive en el backend (`calcularResumenDeCarrera`) y la traducción a props en
 * `domain/vista-director.ts`. Esta página solo compone.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  Boton,
  DataPanel,
  KpiCard,
  PendingList,
  ReportBridgeCard,
  SecondaryCardGrid,
  TarjetaDeAccion,
} from '@/shared/components/ui';

import { obtenerResumenDeCarrera } from '../api/resumen-carrera.api';
import {
  descripcionBajoMeta,
  filaDePlanMejora,
  pendientesDe,
  subtituloDe,
  tarjetasDeMejoraContinua,
  valorEstadoDelPlan,
} from '../domain/vista-director';
import { plural } from '../domain/vista-admin';

/** Mismas proporciones que la vista cargada, para que no salte de tamaño. */
function Esqueleto() {
  const bloque = 'animate-pulse rounded-2xl bg-superficie-tenue';
  return (
    <div role="status" aria-label="Cargando resumen de la carrera" className="space-y-6">
      <div className={`${bloque} h-16`} />
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

function SinCarrera() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-superficie-tenue p-6">
      <p className="text-sm text-tinta">Esta vista necesita una carrera asignada.</p>
      <Link to="/usuarios" className="text-sm font-semibold text-uc-primary">
        Ir a Usuarios
      </Link>
    </div>
  );
}

export function VistaDirectorInicio() {
  const { identidad } = useSesion();
  const carreraACargo = identidad?.carreraACargo ?? null;

  const consulta = useQuery({
    queryKey: ['resumen-carrera', carreraACargo],
    queryFn: obtenerResumenDeCarrera,
    enabled: carreraACargo !== null,
  });

  if (carreraACargo === null) return <SinCarrera />;
  if (consulta.isPending) return <Esqueleto />;

  if (consulta.isError) {
    if (consulta.error instanceof ErrorDeNegocio && consulta.error.estado === 409) {
      return <SinCarrera />;
    }
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 rounded-2xl bg-superficie-tenue p-6"
      >
        <p className="text-sm text-tinta">No se pudo cargar el resumen de la carrera.</p>
        <Boton onClick={() => void consulta.refetch()}>Reintentar</Boton>
      </div>
    );
  }

  const r = consulta.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">{r.carrera.nombre}</h1>
        <p className="mt-1 text-sm text-tinta-suave">{subtituloDe(r)}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard etiqueta="Estado del plan" valor={valorEstadoDelPlan(r)} />
        <KpiCard
          etiqueta="Mediciones del periodo"
          valor={`${r.kpis.medicionesCerradas} de ${r.kpis.medicionesTotal} cerradas`}
        />
        <KpiCard etiqueta="Planes de mejora" valor={r.kpis.planesMejoraAbiertos} />
        <KpiCard etiqueta="Por vencer o vencidas" valor={r.kpis.accionesQueVencen} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="space-y-2">
            <DataPanel
              titulo="Planes de mejora abiertos"
              filas={r.planesMejoraAbiertos.map(filaDePlanMejora)}
              vacio="No hay planes de mejora abiertos."
            />
            <Link to="/mejora-continua/mejora" className="text-sm font-semibold text-uc-primary">
              Ver todo
            </Link>
          </div>

          <section aria-labelledby="dentro-de-mejora-continua" className="space-y-3">
            <h2 id="dentro-de-mejora-continua" className="text-sm font-semibold text-tinta">
              Dentro de Mejora Continua
            </h2>
            <SecondaryCardGrid items={tarjetasDeMejoraContinua(r)} />
          </section>
        </div>

        <div className="space-y-6">
          {r.competenciasBajoMeta.length > 0 && (
            <TarjetaDeAccion
              etiqueta="Acción recomendada"
              titulo={`${plural(r.competenciasBajoMeta.length, 'competencia', 'competencias')} por debajo de la meta`}
              descripcion={descripcionBajoMeta(
                r.competenciasBajoMeta,
                r.mejoraContinua.periodoMedicion,
              )}
              boton={{ texto: 'Crear plan de mejora', href: '/mejora-continua/mejora' }}
            />
          )}
          <PendingList
            titulo="Pendientes de tu decisión"
            items={pendientesDe(r)}
            vacio="No hay pendientes de decisión."
          />
          <ReportBridgeCard
            titulo="Resultados vs. meta y cobertura"
            descripcion="El detalle por competencia, criterio y periodo vive en Reportes."
          />
        </div>
      </div>
    </div>
  );
}
