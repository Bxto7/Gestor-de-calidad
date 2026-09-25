/**
 * Vista de inicio del Docente (`DOCENTE`).
 *
 * Todo sale de «mis evaluaciones», la misma consulta y la misma clave de caché que
 * usa `MisEvidenciasPage`: al subir o retirar una evidencia allí, este resumen se
 * actualiza solo. El cálculo vive en `domain/vista-docente.ts`; esta página compone.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import {
  claveMisEvaluaciones,
  listarMisEvaluaciones,
} from '@/features/mejora-continua/api/mis-evidencias.api';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  Boton,
  KpiCard,
  PendingList,
  ReportBridgeCard,
  TarjetaDeAccion,
} from '@/shared/components/ui';

import {
  fechaLocalIso,
  kpisDeDocente,
  plazosDe,
  primerNombre,
  subtituloDeDocente,
  venceProntoDe,
} from '../domain/vista-docente';

/** Mismas proporciones que la vista cargada, para que no salte de tamaño. */
function Esqueleto() {
  const bloque = 'animate-pulse rounded-2xl bg-superficie-tenue';
  return (
    <div role="status" aria-label="Cargando tu resumen" className="space-y-6">
      <div className={`${bloque} h-16`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${bloque} h-24`} />
        ))}
      </div>
      <div className={`${bloque} h-28`} />
      <div className={`${bloque} h-48`} />
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

export function VistaDocenteInicio() {
  const { identidad } = useSesion();
  const carreraACargo = identidad?.carreraACargo ?? null;

  const consulta = useQuery({
    queryKey: claveMisEvaluaciones(identidad?.id, carreraACargo),
    queryFn: listarMisEvaluaciones,
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
        <p className="text-sm text-tinta">No se pudo cargar tu resumen.</p>
        <Boton onClick={() => void consulta.refetch()}>Reintentar</Boton>
      </div>
    );
  }

  const { evaluaciones } = consulta.data;
  const hoy = fechaLocalIso(new Date());
  const kpis = kpisDeDocente(evaluaciones);
  const venceProximo = venceProntoDe(evaluaciones, hoy);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">
          Hola, {primerNombre(identidad?.nombre ?? '')}
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">{subtituloDeDocente(kpis)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard etiqueta="Mis asignaturas" valor={kpis.asignaturas} />
        <KpiCard etiqueta="Evidencias pendientes" valor={kpis.pendientes} />
        <KpiCard etiqueta="Competencias que evalúo" valor={kpis.competencias} />
      </div>

      <TarjetaDeAccion
        etiqueta="Vence pronto"
        titulo={venceProximo.titulo}
        descripcion={venceProximo.descripcion}
        boton={{ texto: 'Subir evidencia', href: '/mis-evidencias' }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PendingList
          titulo="Mis plazos"
          items={plazosDe(evaluaciones, hoy)}
          vacio="No tienes plazos pendientes."
        />
        <ReportBridgeCard
          titulo="Resultados de mis competencias"
          descripcion="El detalle por competencia y periodo vive en Reportes."
        />
      </div>
    </div>
  );
}
