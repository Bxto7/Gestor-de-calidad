/**
 * RF-PJ-001 a RF-PJ-038: el listado de planes de mejora, sin las pantallas
 * incrustadas en Criterios/Atributos/Competencias que 2c-J-A había dejado
 * como posibilidad — módulo de nivel superior, igual a medición y evaluación
 * (ver diseño del 11 de septiembre de 2026).
 *
 * RF-PJ-038: búsqueda por texto y filtros por aspecto, estado de
 * implementación y estado documental, además del filtro por carrera. El
 * selector de estado documental reutiliza `TONO_ESTADO` en vez de una
 * constante `ESTADOS_MEDICION` — no existe tal constante en el dominio web,
 * y `PlanesMedicionPage.tsx`/`PlanesEvaluacionPage.tsx` ya listan sus
 * opciones con `Object.keys(TONO_ESTADO)`.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { useCriterios } from '@/features/acreditacion/api/queries';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { useCarreras, useCompetencias, useObjetivos } from '@/features/plan-estudios/api/queries';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Cargando,
  Entrada,
  EstadoVacio,
  Selector,
} from '@/shared/components/ui';

import { ModalNuevoPlanMejora } from '../components/ModalNuevoPlanMejora';
import { TONO_ESTADO } from '../domain/estado-medicion';
import { usePlanesMejora } from '../api/queries';
import {
  ESTADOS_IMPLEMENTACION,
  type AspectoPlanMejora,
  type EstadoImplementacion,
  type EstadoMedicion,
  type PlanMejora,
} from '../domain/tipos';

const ETIQUETA_ASPECTO: Record<AspectoPlanMejora, string> = {
  CRITERIO_ACREDITACION: 'Criterio de Acreditación',
  OBJETIVO_EDUCACIONAL: 'Objetivo Educacional',
  COMPETENCIA: 'Competencia',
};

export function PlanesMejoraPage() {
  const { publicar } = useEncabezado();
  const navegar = useNavigate();
  const { data: carreras } = useCarreras();
  const [elegida, setElegida] = useState('');
  const [creando, setCreando] = useState(false);
  const [texto, setTexto] = useState('');
  const [aspecto, setAspecto] = useState<AspectoPlanMejora | ''>('');
  const [estadoImplementacion, setEstadoImplementacion] = useState<EstadoImplementacion | ''>('');
  const [estado, setEstado] = useState<EstadoMedicion | ''>('');

  const carreraId = elegida || (carreras?.[0]?.id ?? '');

  const { data: planes, isLoading } = usePlanesMejora({
    carreraId,
    texto: texto || undefined,
    aspecto: aspecto || undefined,
    estadoImplementacion: estadoImplementacion || undefined,
    estado: estado || undefined,
  });
  const { data: criterios } = useCriterios(carreraId);
  const { data: objetivos } = useObjetivos();
  const { data: competencias } = useCompetencias();

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Planes de Mejora' }], acciones: null });
  }, [publicar]);

  function nombreDelElemento(plan: PlanMejora): string {
    if (plan.aspecto === 'CRITERIO_ACREDITACION') {
      return criterios?.find((c) => c.id === plan.criterioAcreditacionId)?.nombre ?? '—';
    }
    if (plan.aspecto === 'OBJETIVO_EDUCACIONAL') {
      return objetivos?.find((o) => o.id === plan.objetivoEducacionalId)?.nombre ?? '—';
    }
    return competencias?.find((c) => c.id === plan.competenciaId)?.nombre ?? '—';
  }

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Planes de Mejora"
        descripcion="Acciones de mejora sobre criterios de acreditación, objetivos educacionales y competencias."
        acciones={
          <SiPuede permiso="mejora.crear" carreraId={carreraId}>
            <Boton variante="primario" onClick={() => setCreando(true)} disabled={!carreraId}>
              Nuevo plan de mejora
            </Boton>
          </SiPuede>
        }
      />

      <Selector
        aria-label="Carrera"
        value={carreraId}
        onChange={(e) => setElegida(e.target.value)}
        className="max-w-sm"
      >
        <option value="">Selecciona una carrera…</option>
        {(carreras ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.codigo} — {c.nombre}
          </option>
        ))}
      </Selector>

      <div className="flex flex-wrap gap-3">
        <Entrada
          role="searchbox"
          aria-label="Buscar por código o nombre"
          placeholder="Buscar por código o nombre…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="max-w-xs"
        />
        <Selector
          aria-label="Aspecto"
          value={aspecto}
          onChange={(e) => setAspecto(e.target.value as AspectoPlanMejora | '')}
        >
          <option value="">Todos los aspectos</option>
          <option value="CRITERIO_ACREDITACION">Criterio de acreditación</option>
          <option value="OBJETIVO_EDUCACIONAL">Objetivo educacional</option>
          <option value="COMPETENCIA">Competencia</option>
        </Selector>
        <Selector
          aria-label="Estado de implementación"
          value={estadoImplementacion}
          onChange={(e) => setEstadoImplementacion(e.target.value as EstadoImplementacion | '')}
        >
          <option value="">Toda implementación</option>
          {ESTADOS_IMPLEMENTACION.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Selector>
        <Selector
          aria-label="Estado documental"
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoMedicion | '')}
        >
          <option value="">Todo estado</option>
          {Object.keys(TONO_ESTADO).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Selector>
      </div>

      {isLoading ? (
        <Cargando etiqueta="Cargando planes de mejora…" />
      ) : (planes ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay planes de mejora"
          detalle="Crea el primero para esta carrera con el botón de arriba."
        />
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Planes de mejora de la carrera elegida</caption>
          <thead>
            <tr className="border-b border-borde text-left text-tinta-suave">
              <th scope="col" className="py-2 pr-4">
                Código
              </th>
              <th scope="col" className="py-2 pr-4">
                Aspecto
              </th>
              <th scope="col" className="py-2 pr-4">
                Elemento
              </th>
              <th scope="col" className="py-2 pr-4">
                Estado
              </th>
              <th scope="col" className="py-2 pr-4">
                Implementación
              </th>
            </tr>
          </thead>
          <tbody>
            {(planes ?? []).map((p) => (
              <tr key={p.id} className="border-b border-borde">
                <td className="py-2 pr-4">
                  <Link
                    to={`/mejora-continua/mejora/${p.id}`}
                    className="text-uc-primary hover:underline"
                  >
                    {p.codigo}
                  </Link>
                </td>
                <td className="py-2 pr-4">{ETIQUETA_ASPECTO[p.aspecto]}</td>
                <td className="py-2 pr-4">{nombreDelElemento(p)}</td>
                <td className="py-2 pr-4">
                  <Badge tono={TONO_ESTADO[p.estado]}>{p.estado}</Badge>
                </td>
                <td className="py-2 pr-4">{p.estadoImplementacion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creando && (
        <ModalNuevoPlanMejora
          carreraId={carreraId}
          onCerrar={() => setCreando(false)}
          onCreado={(plan) => navegar(`/mejora-continua/mejora/${plan.id}`)}
        />
      )}
    </div>
  );
}
