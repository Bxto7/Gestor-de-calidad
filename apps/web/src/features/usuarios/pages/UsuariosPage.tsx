/**
 * Administración de cuentas y roles.
 *
 * La pantalla no reimplementa ninguna de las reglas del backend —no dejarse sin
 * administrador, no administrarse a sí mismo, exigir carrera cuando el rol
 * concede permisos acotados—. Las anticipa donde ayuda (desactivando el botón de
 * la propia cuenta) y para el resto enseña el mensaje que devuelve el servidor.
 *
 * Duplicar aquí la regla del «último administrador» significaría mantener dos
 * copias que se desincronizan, y la del navegador nunca es la autoridad.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import * as api from '../api/usuarios.api';
import type { Rol, Usuario } from '../api/usuarios.api';
import { useSesion } from '@/features/auth/hooks/contexto-sesion';
import { useCarreras } from '@/features/plan-estudios/api/queries';
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
  Tarjeta,
} from '@/shared/components/ui';

export function UsuariosPage() {
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<Usuario | null | 'nuevo'>(null);
  const [credencial, setCredencial] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { identidad } = useSesion();
  const clienteQuery = useQueryClient();

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ['usuarios', texto],
    queryFn: () => api.listarUsuarios(texto),
  });

  const { data: roles } = useQuery({ queryKey: ['usuarios', 'roles'], queryFn: api.listarRoles });

  const cambiarEstado = useMutation({
    mutationFn: (v: { id: string; activo: boolean }) => api.cambiarEstadoUsuario(v.id, v.activo),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: (e: unknown) => setError(mensaje(e)),
  });

  const restablecer = useMutation({
    mutationFn: (id: string) => api.restablecerPassword(id),
    onSuccess: (r) => setCredencial({ email: r.usuario.email, password: r.passwordTemporal }),
    onError: (e: unknown) => setError(mensaje(e)),
  });

  return (
    <>
      <CabeceraSeccion
        titulo="Usuarios"
        descripcion="Cuentas del sistema, sus roles y su alcance."
        acciones={
          <Boton variante="primario" onClick={() => setEditando('nuevo')}>
            Nueva cuenta
          </Boton>
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-alerta-borde bg-alerta-bg px-4 py-3 text-sm text-alerta-fg"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold underline">
            Descartar
          </button>
        </p>
      )}

      <Entrada
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por nombre o correo…"
        aria-label="Buscar cuentas"
        className="mb-5 max-w-sm"
      />

      {isLoading ? (
        <Cargando />
      ) : !usuarios || usuarios.length === 0 ? (
        <EstadoVacio titulo="Ninguna cuenta coincide" detalle="Prueba con otro nombre o correo." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-superficie">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-borde text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-5 py-3 font-semibold">Persona</th>
                <th className="px-5 py-3 font-semibold">Roles</th>
                <th className="px-5 py-3 font-semibold">Última actividad</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esYo = u.id === identidad?.id;

                return (
                  <tr key={u.id} className="border-b border-borde/60 last:border-0">
                    <td className="px-5 py-4">
                      <span className="font-semibold text-tinta">{u.nombreCompleto}</span>
                      {esYo && <span className="ml-2 text-xs text-tinta-tenue">(tú)</span>}
                      <br />
                      <span className="text-xs text-tinta-suave">{u.email}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r.codigo} tono="neutro">
                            {r.nombre}
                          </Badge>
                        ))}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-tinta-suave">
                      {u.ultimaActividad
                        ? new Date(u.ultimaActividad).toLocaleDateString('es-PE')
                        : 'Nunca entró'}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tono={u.activo ? 'activo' : 'neutro'}>
                        {u.activo ? 'Activa' : 'Desactivada'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <span className="flex flex-wrap gap-3 text-sm font-semibold">
                        <button
                          type="button"
                          disabled={esYo}
                          // La propia cuenta no se edita desde aquí: es la regla
                          // del backend, anticipada para no ofrecer un botón que
                          // va a devolver 409.
                          title={esYo ? 'Pídeselo a otro administrador.' : undefined}
                          onClick={() => setEditando(u)}
                          className="text-uc-primary hover:underline disabled:cursor-not-allowed disabled:text-tinta-tenue disabled:no-underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={esYo || cambiarEstado.isPending}
                          title={esYo ? 'Quedarías sin acceso para revertirlo.' : undefined}
                          onClick={() =>
                            cambiarEstado.mutate({ id: u.id, activo: !u.activo })
                          }
                          className="text-uc-primary hover:underline disabled:cursor-not-allowed disabled:text-tinta-tenue disabled:no-underline"
                        >
                          {u.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                        <button
                          type="button"
                          disabled={restablecer.isPending}
                          onClick={() => restablecer.mutate(u.id)}
                          className="text-uc-primary hover:underline disabled:cursor-not-allowed"
                        >
                          Restablecer contraseña
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {roles && (
        <Tarjeta className="mt-6">
          <h2 className="mb-3 text-sm font-bold text-tinta">Roles del sistema</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {roles.map((r) => (
              <li key={r.id} className="rounded-xl border border-borde px-4 py-3">
                <p className="text-sm font-bold text-tinta">{r.nombre}</p>
                <p className="mt-0.5 text-sm text-tinta-suave">{r.descripcion}</p>
                <p className="mt-2 text-xs text-tinta-tenue">
                  {r.permisos.length} permisos · {r.usuariosAsignados} cuenta
                  {r.usuariosAsignados === 1 ? '' : 's'}
                </p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {editando !== null && roles && (
        <FormularioUsuario
          usuario={editando === 'nuevo' ? null : editando}
          roles={roles}
          onCerrar={() => setEditando(null)}
          onCreada={(email, password) => setCredencial({ email, password })}
        />
      )}

      {credencial && (
        <CredencialTemporal credencial={credencial} onCerrar={() => setCredencial(null)} />
      )}
    </>
  );
}

/* ── Alta y edición ───────────────────────────────────────────────────── */

function FormularioUsuario({
  usuario,
  roles,
  onCerrar,
  onCreada,
}: {
  usuario: Usuario | null;
  roles: Rol[];
  onCerrar: () => void;
  onCreada: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [nombre, setNombre] = useState(usuario?.nombreCompleto ?? '');
  const [codigos, setCodigos] = useState<string[]>(usuario?.roles.map((r) => r.codigo) ?? []);
  const [carreraId, setCarreraId] = useState(usuario?.carreraId ?? '');
  const [error, setError] = useState<string | null>(null);

  const { data: carreras } = useCarreras();
  const clienteQuery = useQueryClient();

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = {
        nombreCompleto: nombre,
        roles: codigos,
        carreraId: carreraId || null,
      };
      return usuario
        ? { usuario: await api.editarUsuario(usuario.id, datos), passwordTemporal: null }
        : await api.crearUsuario({ ...datos, email });
    },
    onSuccess: (r) => {
      void clienteQuery.invalidateQueries({ queryKey: ['usuarios'] });
      if (r.passwordTemporal) onCreada(r.usuario.email, r.passwordTemporal);
      onCerrar();
    },
    onError: (e: unknown) => setError(mensaje(e)),
  });

  function alternarRol(codigo: string) {
    setCodigos((previos) =>
      previos.includes(codigo) ? previos.filter((c) => c !== codigo) : [...previos, codigo],
    );
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={usuario ? 'Editar cuenta' : 'Nueva cuenta'}
      descripcion={usuario?.email}
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardar.isPending}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        {error && (
          <p role="alert" className="rounded-lg bg-alerta-bg px-3 py-2 text-sm text-alerta-fg">
            {error}
          </p>
        )}

        {usuario ? (
          <Campo etiqueta="Correo" ayuda="No se edita: es el identificador con el que se entra.">
            {(props) => <Entrada {...props} value={usuario.email} disabled />}
          </Campo>
        ) : (
          <Campo etiqueta="Correo institucional" requerido>
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
        )}

        <Campo etiqueta="Nombre completo" requerido>
          {(props) => (
            <Entrada {...props} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          )}
        </Campo>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[13px] font-semibold text-tinta">Roles</legend>

          <div className="rounded-lg border border-borde bg-white">
            {roles.map((r) => (
              <label
                key={r.codigo}
                className="flex cursor-pointer items-start gap-2.5 border-b border-borde/60 px-3 py-2.5 last:border-0 hover:bg-superficie-tenue"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-uc-primary"
                  checked={codigos.includes(r.codigo)}
                  onChange={() => alternarRol(r.codigo)}
                />
                <span className="block text-sm font-semibold text-tinta">
                  {r.nombre}
                  <span className="mt-0.5 block text-xs font-normal text-tinta-suave">
                    {r.descripcion}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/*
          El servidor decide si la carrera hace falta, derivándolo de los
          permisos del rol. Aquí no se replica esa regla: se ofrece el campo
          siempre y, si sobra o falta, el mensaje del servidor lo dice.
        */}
        <Campo
          etiqueta="Carrera sobre la que tiene alcance"
          ayuda="Obligatoria para los roles que conceden permisos acotados a una carrera, como Director o Coordinador."
        >
          {(props) => (
            <Selector
              {...props}
              value={carreraId}
              onChange={(e) => setCarreraId(e.target.value)}
            >
              <option value="">Sin alcance de carrera</option>
              {(carreras ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          )}
        </Campo>
      </form>
    </Modal>
  );
}

/* ── Credencial temporal ──────────────────────────────────────────────── */

/**
 * La contraseña generada, enseñada una sola vez.
 *
 * No se puede volver a consultar porque no se guarda en claro en ninguna parte.
 * El aviso es explícito: quien cierra este modal sin copiarla tiene que
 * restablecerla otra vez, y es mejor decirlo que dejar que lo descubra.
 */
function CredencialTemporal({
  credencial,
  onCerrar,
}: {
  credencial: { email: string; password: string };
  onCerrar: () => void;
}) {
  const [copiada, setCopiada] = useState(false);

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Contraseña temporal"
      descripcion={credencial.email}
      ancho="sm"
      pie={
        <Boton variante="primario" onClick={onCerrar}>
          Ya la guardé
        </Boton>
      }
    >
      <p className="mb-3 text-sm text-tinta-suave">
        Se muestra <strong className="text-tinta">una sola vez</strong>. No se guarda en claro,
        así que no hay forma de volver a consultarla: si se pierde, hay que restablecerla.
      </p>

      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-lg border border-borde bg-superficie-tenue px-3 py-2.5 font-mono text-sm break-all text-tinta">
          {credencial.password}
        </code>
        <Boton
          variante="secundario"
          onClick={() => {
            void navigator.clipboard.writeText(credencial.password).then(() => setCopiada(true));
          }}
        >
          {copiada ? 'Copiada' : 'Copiar'}
        </Boton>
      </div>

      <p className="mt-3 text-sm text-tinta-suave">
        Entrégala por un canal distinto al correo institucional de esa persona, y pídele que la
        cambie al entrar.
      </p>
    </Modal>
  );
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : 'No se pudo completar la operación.';
}
