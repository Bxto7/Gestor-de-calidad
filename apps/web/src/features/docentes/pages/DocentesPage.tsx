/**
 * Docentes de la carrera del Director (RF-CH-010 a 014).
 *
 * La pantalla no decide nada de lo que decide el servidor —la carrera, la
 * unicidad del usuario, si el docente está en uso—: anticipa lo que ayuda y
 * enseña el mensaje que devuelve el servidor para el resto. Por eso el alta no
 * tiene selector de carrera: siempre es la del Director.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  Badge,
  Boton,
  CabeceraSeccion,
  Campo,
  Cargando,
  Entrada,
  EstadoVacio,
  Modal,
} from '@/shared/components/ui';

import type { Docente } from '../api/docentes.api';
import {
  useCambiarEstadoDocente,
  useCambiarPasswordDocente,
  useCrearDocente,
  useDocentes,
  useEliminarDocente,
} from '../api/queries';

type Accion =
  | { tipo: 'nuevo' }
  | { tipo: 'password'; docente: Docente }
  | { tipo: 'estado'; docente: Docente }
  | { tipo: 'eliminar'; docente: Docente };

export function DocentesPage() {
  const { planId } = useParams();
  const { data: docentes, isLoading } = useDocentes();
  const [accion, setAccion] = useState<Accion | null>(null);
  const cerrar = () => setAccion(null);

  return (
    <>
      <CabeceraSeccion
        titulo="Docentes"
        descripcion="Los docentes de tu carrera: quiénes pueden iniciar sesión y trabajar en los planes de mejora."
        acciones={
          <Boton variante="primario" onClick={() => setAccion({ tipo: 'nuevo' })}>
            Nuevo docente
          </Boton>
        }
      />

      {planId && (
        <Link
          to={`/plan-estudios/planes/${planId}`}
          className="mb-5 inline-block text-sm font-semibold text-uc-primary"
        >
          ← Volver al plan
        </Link>
      )}

      {isLoading ? (
        <Cargando />
      ) : !docentes || docentes.length === 0 ? (
        <EstadoVacio
          titulo="Aún no hay docentes"
          detalle="Registra al primero con «Nuevo docente»: podrá iniciar sesión con su usuario y contraseña."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Docentes de la carrera</caption>
            <thead className="border-b border-borde text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Docente
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {docentes.map((d) => (
                <tr key={d.id} className="border-b border-borde/60 last:border-0">
                  <td className="px-5 py-4">
                    <span className="font-semibold text-tinta">{d.nombreCompleto}</span>
                    <br />
                    <span className="text-xs text-tinta-suave">{d.email}</span>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tono={d.activo ? 'activo' : 'inactivo'}>
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        aria-label={`Editar contraseña de ${d.nombreCompleto}`}
                        onClick={() => setAccion({ tipo: 'password', docente: d })}
                      >
                        Editar contraseña
                      </Boton>
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        aria-label={`${d.activo ? 'Inactivar' : 'Reactivar'} a ${d.nombreCompleto}`}
                        onClick={() => setAccion({ tipo: 'estado', docente: d })}
                      >
                        {d.activo ? 'Inactivar' : 'Reactivar'}
                      </Boton>
                      <Boton
                        variante="peligro"
                        tamano="sm"
                        aria-label={`Eliminar a ${d.nombreCompleto}`}
                        onClick={() => setAccion({ tipo: 'eliminar', docente: d })}
                      >
                        Eliminar
                      </Boton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {accion?.tipo === 'nuevo' && <FormularioNuevoDocente onCerrar={cerrar} />}
      {accion?.tipo === 'password' && (
        <FormularioPassword docente={accion.docente} onCerrar={cerrar} />
      )}
      {accion?.tipo === 'estado' && <ConfirmarEstado docente={accion.docente} onCerrar={cerrar} />}
      {accion?.tipo === 'eliminar' && (
        <ConfirmarEliminar docente={accion.docente} onCerrar={cerrar} />
      )}
    </>
  );
}

function FormularioNuevoDocente({ onCerrar }: { onCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const crear = useCrearDocente();

  function guardar() {
    setError(null);
    crear.mutate(
      { nombreCompleto: nombre, email, password },
      { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
    );
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nuevo docente"
      descripcion="Quedará asociado a tu carrera."
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={crear.isPending}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={guardar} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        {error && <Alerta mensaje={error} />}
        <Campo etiqueta="Nombre completo" requerido>
          {(props) => (
            <Entrada {...props} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          )}
        </Campo>
        <Campo
          etiqueta="Usuario"
          ayuda="Es el correo con el que el docente inicia sesión."
          requerido
        >
          {(props) => (
            <Entrada
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre.apellido@continental.edu.pe"
            />
          )}
        </Campo>
        <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres." requerido>
          {(props) => (
            <Entrada
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}

function FormularioPassword({ docente, onCerrar }: { docente: Docente; onCerrar: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cambiar = useCambiarPasswordDocente();

  function guardar() {
    setError(null);
    cambiar.mutate(
      { id: docente.id, password },
      { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
    );
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Editar contraseña"
      descripcion={`${docente.nombreCompleto} · ${docente.email}`}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={cambiar.isPending}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={guardar} disabled={cambiar.isPending}>
            {cambiar.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        {error && <Alerta mensaje={error} />}
        <Campo
          etiqueta="Nueva contraseña"
          ayuda="Mínimo 8 caracteres. Cerrará las sesiones abiertas del docente."
          requerido
        >
          {(props) => (
            <Entrada
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Campo>
      </form>
    </Modal>
  );
}

function ConfirmarEstado({ docente, onCerrar }: { docente: Docente; onCerrar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const cambiar = useCambiarEstadoDocente();
  const inactivar = docente.activo;
  const verbo = inactivar ? 'Inactivar' : 'Reactivar';

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`${verbo} docente`}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={cambiar.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={cambiar.isPending}
            onClick={() =>
              cambiar.mutate(
                { id: docente.id, activo: !inactivar },
                { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
              )
            }
          >
            {verbo}
          </Boton>
        </>
      }
    >
      {error && <Alerta mensaje={error} />}
      <p className="text-sm text-tinta">
        {inactivar
          ? `${docente.nombreCompleto} dejará de poder iniciar sesión y de aparecer como responsable en registros nuevos. Su historial se conserva.`
          : `${docente.nombreCompleto} volverá a poder iniciar sesión.`}
      </p>
    </Modal>
  );
}

function ConfirmarEliminar({ docente, onCerrar }: { docente: Docente; onCerrar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const eliminar = useEliminarDocente();
  const inactivar = useCambiarEstadoDocente();
  const ocupado = eliminar.isPending || inactivar.isPending;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Eliminar docente"
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Boton>
          {error && docente.activo && (
            <Boton
              variante="secundario"
              disabled={ocupado}
              onClick={() =>
                inactivar.mutate(
                  { id: docente.id, activo: false },
                  { onSuccess: onCerrar, onError: (e) => setError(mensaje(e)) },
                )
              }
            >
              Inactivar en su lugar
            </Boton>
          )}
          <Boton
            variante="peligro"
            disabled={ocupado}
            onClick={() => {
              setError(null);
              eliminar.mutate(docente.id, {
                onSuccess: onCerrar,
                onError: (e) => setError(mensaje(e)),
              });
            }}
          >
            Eliminar
          </Boton>
        </>
      }
    >
      {error && <Alerta mensaje={error} />}
      <p className="text-sm text-tinta">
        Se borrará la cuenta de {docente.nombreCompleto} ({docente.email}). No se puede deshacer, y
        solo se permite si ningún registro la referencia.
      </p>
    </Modal>
  );
}

function Alerta({ mensaje: texto }: { mensaje: string }) {
  return (
    <p role="alert" className="mb-4 rounded-lg bg-alerta-bg px-3 py-2 text-sm text-alerta-fg">
      {texto}
    </p>
  );
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : 'No se pudo completar la operación.';
}
