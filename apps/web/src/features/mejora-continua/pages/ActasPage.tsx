// apps/web/src/features/mejora-continua/pages/ActasPage.tsx

/**
 * Actas de aprobación — RF-AC-001 a 003 y RF-AC-020.
 *
 * El listado y el alta. El alta solo pide el periodo académico:
 * `periodoMedicionId` (opcional, filtra la sección Competencia al cargar
 * acciones) queda fuera de este ciclo — decisión tomada con el usuario, ver
 * §2 del spec de esta pantalla.
 *
 * Sin selector de carrera: a diferencia de `PlanesMejoraPage`, el backend
 * (`FiltroActas`) no filtra por carrera — mismo criterio que
 * `PlanesMedicionPage`/`PlanesEvaluacionPage`.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useEncabezado } from '@/app/encabezado';
import { SiPuede } from '@/features/auth/components/SiPuede';
import { ErrorDeNegocio } from '@/shared/api/cliente';
import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
  Selector,
} from '@/shared/components/ui';

import { useActas, useCrearActa } from '../api/queries';
import { TONO_ESTADO_ACTA, type EstadoActa } from '../domain/estado-acta';

const ESTADOS: readonly EstadoActa[] = ['Borrador', 'En revisión', 'Aprobada', 'Emitida', 'Histórica'];

export function ActasPage() {
  const { publicar } = useEncabezado();

  const [estado, setEstado] = useState<EstadoActa | ''>('');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);

  const { data: actas, isLoading } = useActas({
    estado: estado || undefined,
    texto: texto || undefined,
  });

  useEffect(() => {
    publicar({ migas: [{ etiqueta: 'Actas de aprobación' }], acciones: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <CabeceraSeccion
        titulo="Actas de aprobación"
        descripcion="Acta de aprobación de las acciones de mejora de cada periodo académico."
        acciones={
          <SiPuede permiso="actas.crear">
            <Boton variante="primario" onClick={() => setAbierto(true)}>
              Nueva acta
            </Boton>
          </SiPuede>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Entrada
          role="searchbox"
          aria-label="Buscar por código o título"
          placeholder="Buscar por código o título…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="max-w-xs"
        />
        <Selector
          aria-label="Filtrar por estado"
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoActa | '')}
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
        <Cargando etiqueta="Cargando actas de aprobación…" />
      ) : (actas ?? []).length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay actas de aprobación"
          detalle="Un acta de aprobación reúne y aprueba formalmente las acciones de mejora de un periodo académico."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Actas de aprobación registradas</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Código
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Periodo académico
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {(actas ?? []).map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      to={`/mejora-continua/actas/${a.id}`}
                      className="font-semibold text-uc-primary hover:underline"
                    >
                      {a.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{a.periodoAcademico}</td>
                  <td className="px-4 py-3">
                    <Badge tono={TONO_ESTADO_ACTA[a.estado]}>{a.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && <ModalNuevaActa onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

/** RF-AC-001 a RF-AC-003. */
function ModalNuevaActa({ onCerrar }: { onCerrar: () => void }) {
  const navegar = useNavigate();
  const crear = useCrearActa();

  const [periodoAcademico, setPeriodoAcademico] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    try {
      const creada = await crear.mutateAsync({ periodoAcademico });
      onCerrar();
      void navegar(`/mejora-continua/actas/${creada.id}`);
    } catch (e) {
      setError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo crear el acta.');
    }
  }

  return (
    <Modal
      abierto
      titulo="Nueva acta de aprobación"
      descripcion="Se crea en Borrador. La cabecera, los asistentes y las acciones se completan después."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!periodoAcademico.trim() || crear.isPending}
            onClick={() => void enviar()}
          >
            {crear.isPending ? 'Creando…' : 'Crear'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Periodo académico" requerido ayuda="Por ejemplo, 2026-1.">
          {(props) => (
            <Entrada
              {...props}
              value={periodoAcademico}
              onChange={(e) => setPeriodoAcademico(e.target.value)}
            />
          )}
        </Campo>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-estado-inactivo-bg px-3 py-2 text-sm text-estado-inactivo-fg"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
