/**
 * «Mis evidencias»: las evaluaciones que el docente tiene asignadas en el plan de
 * evaluación vigente de su carrera, con sus enlaces de evidencia.
 *
 * Todo sale de `/mejora-continua/mis-evaluaciones`, que llega ordenado (por
 * asignatura, cierre de periodo y competencia): aquí solo se agrupa por asignatura
 * y se compone. Ante un fallo al agregar o retirar se vuelve a pedir la lista, para
 * no quedarse con datos que el servidor ya contradijo (por ejemplo un plan que dejó
 * de estar vigente).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import { Boton, EstadoVacio } from '@/shared/components/ui';

import {
  agregarEvidencia,
  listarMisEvaluaciones,
  retirarEvidencia,
  type EvaluacionAsignada,
} from '../api/mis-evidencias.api';
import { TarjetaEvaluacion } from '../components/TarjetaEvaluacion';

const mensajeDe = (fallo: unknown): string =>
  fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';

function Esqueleto() {
  const bloque = 'animate-pulse rounded-2xl bg-superficie-tenue';
  return (
    <div role="status" aria-label="Cargando tus evaluaciones" className="space-y-4">
      <div className={`${bloque} h-8 w-64`} />
      <div className={`${bloque} h-40`} />
      <div className={`${bloque} h-40`} />
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

/** Agrupa las evaluaciones ya ordenadas por asignatura, conservando el orden. */
function porAsignatura(
  evaluaciones: readonly EvaluacionAsignada[],
): { asignaturaId: string; nombre: string; evaluaciones: EvaluacionAsignada[] }[] {
  const grupos: { asignaturaId: string; nombre: string; evaluaciones: EvaluacionAsignada[] }[] = [];
  for (const e of evaluaciones) {
    const ultimo = grupos.at(-1);
    if (ultimo?.asignaturaId === e.asignatura.id) ultimo.evaluaciones.push(e);
    else
      grupos.push({
        asignaturaId: e.asignatura.id,
        nombre: e.asignatura.nombre,
        evaluaciones: [e],
      });
  }
  return grupos;
}

export function MisEvidenciasPage() {
  const { publicar } = useEncabezado();
  const { identidad } = useSesion();
  const carreraACargo = identidad?.carreraACargo ?? null;
  const qc = useQueryClient();
  // El id de usuario va en la clave: la caché de react-query sobrevive a un cierre de
  // sesión, y sin él el siguiente docente vería un instante la lista del anterior.
  const clave = ['mis-evaluaciones', identidad?.id ?? null, carreraACargo] as const;
  // Aviso de la página: el mensaje del servidor debe sobrevivir a la tarjeta, que puede
  // desaparecer cuando la lista recargada ya no trae esa evaluación.
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Mis evidencias' }], acciones: null });
    // `publicar` es estable dentro del render del layout; incluirlo dispararía un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consulta = useQuery({
    queryKey: clave,
    queryFn: listarMisEvaluaciones,
    enabled: carreraACargo !== null,
  });

  // Tras cada intento —salga bien o mal— se vuelve a pedir la lista: si salió mal
  // porque el estado cambió, la pantalla deja de mostrar lo que ya no es cierto.
  const alTerminar = () => qc.invalidateQueries({ queryKey: clave });

  const agregar = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: { enlace: string; descripcion: string } }) =>
      agregarEvidencia(id, datos),
    onSuccess: () => setAviso(null),
    onError: (fallo) => setAviso(mensajeDe(fallo)),
    onSettled: alTerminar,
  });
  const retirar = useMutation({
    mutationFn: (evidenciaId: string) => retirarEvidencia(evidenciaId),
    onSuccess: () => setAviso(null),
    onError: (fallo) => setAviso(mensajeDe(fallo)),
    onSettled: alTerminar,
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
        <p className="text-sm text-tinta">No se pudieron cargar tus evaluaciones.</p>
        <Boton onClick={() => void consulta.refetch()}>Reintentar</Boton>
      </div>
    );
  }

  const grupos = porAsignatura(consulta.data.evaluaciones);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Mis evidencias</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Registra los enlaces de evidencia de las evaluaciones que tienes asignadas.
        </p>
      </div>

      {aviso && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-2xl border border-alerta-borde bg-alerta-bg p-4"
        >
          <p className="text-sm font-medium text-alerta-fg">{aviso}</p>
          <Boton tamano="sm" variante="fantasma" onClick={() => setAviso(null)}>
            Cerrar
          </Boton>
        </div>
      )}

      {grupos.length === 0 ? (
        <EstadoVacio
          titulo="No tienes evaluaciones asignadas en el plan vigente."
          detalle="Cuando un coordinador te asigne una evaluación, aparecerá aquí."
        />
      ) : (
        grupos.map((g) => (
          <section
            key={g.asignaturaId}
            aria-labelledby={`asig-${g.asignaturaId}`}
            className="space-y-3"
          >
            <h2 id={`asig-${g.asignaturaId}`} className="text-sm font-semibold text-tinta">
              {g.nombre}
            </h2>
            {g.evaluaciones.map((e) => (
              <TarjetaEvaluacion
                key={e.id}
                evaluacion={e}
                onAgregar={async (id, datos) => {
                  await agregar.mutateAsync({ id, datos });
                }}
                onRetirar={async (evidenciaId) => {
                  await retirar.mutateAsync(evidenciaId);
                }}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
