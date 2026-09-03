/**
 * Búsqueda global, panel estadístico y bitácora de accesos (RF101–RF110).
 *
 * Tres pestañas y no tres pantallas porque responden a la misma pregunta desde
 * ángulos distintos —«cómo está el sistema»— y quien entra aquí suele mirarlas
 * seguidas. Separarlas en rutas obligaría a volver al menú entre una y otra.
 *
 * El criterio que gobierna todo lo que se pinta: **lo que falta se enseña**. Los
 * estados de plan a cero, los atributos sin cubrir y las carreras sin versión
 * vigente aparecen aunque no haya nada que contar. Un panel que solo mostrara lo
 * que existe siempre se vería completo.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import * as api from '../api/reportes.api';
import type { EstadoPlan } from '../api/reportes.api';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Cargando,
  Entrada,
  EstadoVacio,
  Selector,
  Tarjeta,
} from '@/shared/components/ui';

const ESTADOS: EstadoPlan[] = ['Borrador', 'En revisión', 'Aprobado', 'Vigente', 'Histórico'];

const TONO_ESTADO: Record<EstadoPlan, 'neutro' | 'progreso' | 'aprobado' | 'activo'> = {
  Borrador: 'neutro',
  'En revisión': 'progreso',
  Aprobado: 'aprobado',
  Vigente: 'activo',
  Histórico: 'neutro',
};

type Pestana = 'panel' | 'busqueda' | 'accesos';

export function ReportesPage() {
  const [pestana, setPestana] = useState<Pestana>('panel');
  const { puede } = useSesion();

  // La bitácora exige `auditoria.leer`, que no todos los roles tienen. Se
  // esconde la pestaña en vez de enseñarla y devolver un 403 al pulsarla.
  const verAccesos = puede('auditoria.leer');

  return (
    <>
      <CabeceraSeccion
        titulo="Reportes"
        descripcion="Estado del sistema, búsqueda de planes y registro de accesos."
      />

      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Tipo de reporte">
        <Pestanya activa={pestana === 'panel'} onClick={() => setPestana('panel')}>
          Panel general
        </Pestanya>
        <Pestanya activa={pestana === 'busqueda'} onClick={() => setPestana('busqueda')}>
          Búsqueda de planes
        </Pestanya>
        {verAccesos && (
          <Pestanya activa={pestana === 'accesos'} onClick={() => setPestana('accesos')}>
            Accesos
          </Pestanya>
        )}
      </div>

      {pestana === 'panel' && <PanelGeneral />}
      {pestana === 'busqueda' && <BusquedaGlobal />}
      {pestana === 'accesos' && verAccesos && <Accesos />}
    </>
  );
}

function Pestanya({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={[
        'rounded-lg px-4 py-2 text-sm font-semibold transition',
        activa
          ? 'bg-uc-primary text-white'
          : 'border border-borde bg-superficie text-tinta hover:bg-superficie-tenue',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* ── Panel general ────────────────────────────────────────────────────── */

function PanelGeneral() {
  const { data, isLoading } = useQuery({ queryKey: ['reportes', 'panel'], queryFn: api.panel });

  if (isLoading || !data) return <Cargando etiqueta="Reuniendo el estado del sistema…" />;

  const cubiertos = data.totalAtributos - data.atributosSinCubrir.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Cifra etiqueta="Facultades" valor={data.facultades} />
        <Cifra etiqueta="Carreras" valor={data.carreras} />
        <Cifra etiqueta="Asignaturas activas" valor={data.asignaturas} />
        <Cifra etiqueta="Competencias" valor={data.competencias} />
        <Cifra etiqueta="Objetivos educacionales" valor={data.objetivos} />
        <Cifra
          etiqueta="Atributos del graduado cubiertos"
          valor={`${cubiertos} / ${data.totalAtributos}`}
          alerta={data.atributosSinCubrir.length > 0}
        />
      </div>

      <Tarjeta>
        <h2 className="mb-3 text-sm font-bold text-tinta">Planes por estado</h2>
        <ul className="flex flex-wrap gap-2">
          {data.planesPorEstado.map((e) => (
            <li
              key={e.estado}
              className="flex items-baseline gap-2 rounded-lg border border-borde px-3 py-2"
            >
              <span className="text-lg font-extrabold text-tinta">{e.total}</span>
              <Badge tono={TONO_ESTADO[e.estado]}>{e.estado}</Badge>
            </li>
          ))}
        </ul>
      </Tarjeta>

      {/*
        Los dos hallazgos que el panel existe para enseñar. Aparecen solo cuando
        los hay: al revés que los recuentos de arriba, aquí una lista vacía sí
        significa «todo en orden» y decirlo es información, no ruido.
      */}
      <Tarjeta>
        <h2 className="mb-1 text-sm font-bold text-tinta">Carreras sin versión vigente</h2>
        <p className="mb-3 text-sm text-tinta-suave">
          Una carrera que se imparte sin un plan vigente registrado no tiene con qué responder a una
          acreditación.
        </p>
        {data.carrerasSinPlanVigente.length === 0 ? (
          <p className="text-sm font-semibold text-estado-activo-fg">
            Todas las carreras tienen un plan vigente.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.carrerasSinPlanVigente.map((c) => (
              <li
                key={c.id}
                className="rounded-lg bg-alerta-bg px-3 py-1.5 text-sm font-semibold text-alerta-fg"
              >
                {c.nombre}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-1 text-sm font-bold text-tinta">Atributos del graduado sin cubrir</h2>
        <p className="mb-3 text-sm text-tinta-suave">
          Atributos del marco ICACIT que ninguna competencia activa desarrolla.
        </p>
        {data.atributosSinCubrir.length === 0 ? (
          <p className="text-sm font-semibold text-estado-activo-fg">
            Los {data.totalAtributos} atributos tienen al menos una competencia.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.atributosSinCubrir.map((codigo) => (
              <li
                key={codigo}
                className="rounded-lg bg-alerta-bg px-3 py-1.5 font-mono text-sm font-bold text-alerta-fg"
              >
                {codigo}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: number | string;
  alerta?: boolean;
}) {
  return (
    <Tarjeta>
      <p className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">{etiqueta}</p>
      <p
        className={[
          'mt-1 text-3xl font-extrabold',
          alerta ? 'text-alerta-fg' : 'text-uc-primary',
        ].join(' ')}
      >
        {valor}
      </p>
    </Tarjeta>
  );
}

/* ── Búsqueda global ──────────────────────────────────────────────────── */

function BusquedaGlobal() {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoPlan | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['reportes', 'planes', texto, estado],
    queryFn: () => api.buscarPlanes({ texto, estado: estado || undefined }),
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-3">
        <Entrada
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Plan, carrera o facultad…"
          aria-label="Buscar planes"
          className="max-w-sm"
        />
        <Selector
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoPlan | '')}
          aria-label="Filtrar por estado"
          className="max-w-[12rem]"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Selector>
      </div>

      {isLoading ? (
        <Cargando />
      ) : !data || data.length === 0 ? (
        <EstadoVacio
          titulo="Ningún plan coincide"
          detalle="El texto busca a la vez en el código del plan, la carrera y la facultad."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-borde text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Carrera</th>
                <th className="px-5 py-3 font-semibold">Facultad</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 text-right font-semibold">Asignaturas</th>
                <th className="px-5 py-3 font-semibold">Reporte</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-b border-borde/60 last:border-0">
                  <td className="px-5 py-4">
                    <Link
                      to={`/plan-estudios/planes/${p.id}`}
                      className="font-mono text-xs font-bold text-uc-primary hover:underline"
                    >
                      {p.codigo}
                    </Link>
                    <span className="ml-2 text-xs text-tinta-suave">v{p.version}</span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-tinta">{p.carrera}</td>
                  <td className="px-5 py-4 text-tinta-suave">{p.facultad}</td>
                  <td className="px-5 py-4">
                    <Badge tono={TONO_ESTADO[p.estado]}>{p.estado}</Badge>
                  </td>
                  <td className="px-5 py-4 text-right text-tinta-suave">{p.asignaturas}</td>
                  <td className="px-5 py-4">
                    <Link
                      to={`/reportes/planes/${p.id}`}
                      className="text-sm font-semibold text-uc-primary hover:underline"
                    >
                      Ver reporte
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ── Bitácora de accesos ──────────────────────────────────────────────── */

function Accesos() {
  const [soloIncidentes, setSoloIncidentes] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['reportes', 'accesos', soloIncidentes],
    queryFn: () => api.bitacoraDeAccesos(soloIncidentes),
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Boton
          variante={soloIncidentes ? 'primario' : 'secundario'}
          onClick={() => setSoloIncidentes((v) => !v)}
        >
          {soloIncidentes ? 'Viendo solo incidentes' : 'Ver solo incidentes'}
        </Boton>
        <p className="text-sm text-tinta-suave">
          Intentos rechazados y reusos de token. El refresco de sesión no se registra: rota cada
          quince minutos y enterraría lo que importa.
        </p>
      </div>

      {isLoading ? (
        <Cargando />
      ) : !data || data.length === 0 ? (
        <EstadoVacio
          titulo={soloIncidentes ? 'Sin incidentes registrados' : 'Sin accesos registrados'}
          detalle={
            soloIncidentes
              ? 'No hay intentos rechazados ni reusos de token en la bitácora.'
              : 'Todavía no hay accesos anotados.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-borde text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Acción</th>
                <th className="px-5 py-3 font-semibold">Cuenta</th>
                <th className="px-5 py-3 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-b border-borde/60 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap text-tinta-suave">
                    {new Date(e.fecha).toLocaleString('es-PE')}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tono={esIncidente(e.accion) ? 'progreso' : 'activo'}>
                      {ETIQUETA_ACCION[e.accion] ?? e.accion}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 font-semibold text-tinta">{e.usuarioNombre}</td>
                  <td className="px-5 py-3 text-tinta-suave">{e.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const ETIQUETA_ACCION: Record<string, string> = {
  'acceso.concedido': 'Inicio de sesión',
  'acceso.rechazado': 'Intento fallido',
  'acceso.cierre': 'Cierre de sesión',
  'acceso.reuso_token': 'Reuso de token',
};

function esIncidente(accion: string): boolean {
  return accion === 'acceso.rechazado' || accion === 'acceso.reuso_token';
}
