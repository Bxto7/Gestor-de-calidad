/**
 * Cliente HTTP del sistema.
 *
 * Es la única pieza que sabe que al otro lado hay una API REST: sabe de rutas,
 * cabeceras, códigos de estado y del formato de error que devuelve el filtro de
 * NestJS. Todo lo demás —capa de datos, hooks, componentes— trabaja con
 * promesas y con `ErrorDeNegocio`, igual que cuando los datos venían de un
 * almacén en memoria.
 *
 * Dos responsabilidades que conviene mirar juntas:
 *
 *  1. **Traducir errores.** El backend responde `{ statusCode, error, message }`.
 *     Un 409 es una regla de negocio y debe llegar a la UI como un mensaje
 *     legible junto al formulario; un 500 no lo es y no debe disfrazarse de uno.
 *
 *  2. **Renovar la sesión.** El access token dura quince minutos (§4.4). Cuando
 *     caduca a mitad de una jornada de trabajo, el usuario no debe perder lo que
 *     estaba haciendo: la petición que recibe 401 espera a que se rote el
 *     refresh token y se reintenta una sola vez.
 */

import { limpiarSesion, leerSesion, guardarSesion } from './sesion';

/**
 * En desarrollo Vite hace de proxy hacia el backend, así que basta la ruta
 * relativa. En producción, Caddy sirve el estático y la API bajo el mismo
 * dominio (§5.2), con lo que también vale. `VITE_API_URL` existe para el caso
 * en que no sea así.
 */
const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

/**
 * Error que la UI sabe mostrar: viene de una regla de negocio, no de un fallo.
 *
 * Se define aquí y no en la capa de datos porque es el cliente quien decide qué
 * respuestas cuentan como tal.
 */
export class ErrorDeNegocio extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
    this.name = 'ErrorDeNegocio';
  }
}

/** Fallo que el usuario no puede resolver: red caída, 500, respuesta ilegible. */
export class ErrorDeConexion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeConexion';
  }
}

interface CuerpoDeError {
  message?: string | string[];
  error?: string;
}

/**
 * Saca un mensaje presentable de la respuesta.
 *
 * `class-validator` devuelve `message` como array cuando falla más de un campo;
 * unirlos con un punto y coma da un texto que cabe en una alerta sin perder
 * ninguno de los motivos.
 */
function mensajeDeError(cuerpo: CuerpoDeError | null, estado: number): string {
  if (cuerpo?.message) {
    return Array.isArray(cuerpo.message) ? cuerpo.message.join('; ') : cuerpo.message;
  }
  if (cuerpo?.error) return cuerpo.error;
  return `La petición falló con código ${estado}.`;
}

async function leerCuerpo(respuesta: Response): Promise<unknown> {
  // 204 no trae cuerpo; intentar parsearlo lanzaría.
  if (respuesta.status === 204) return null;
  const texto = await respuesta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/**
 * Renovación del access token.
 *
 * La promesa se guarda en una variable de módulo para que varias peticiones que
 * caduquen a la vez —lo normal al volver a una pestaña abierta— compartan una
 * sola rotación. Sin esto, cada una pediría su propio refresh y todas menos la
 * primera fallarían: el backend rota el token en cada uso y considera un reuso
 * como señal de robo.
 */
let renovacionEnCurso: Promise<boolean> | null = null;

async function renovarSesion(): Promise<boolean> {
  renovacionEnCurso ??= (async () => {
    try {
      const sesion = leerSesion();
      if (!sesion) return false;

      const respuesta = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: sesion.refreshToken }),
      });
      if (!respuesta.ok) {
        limpiarSesion();
        return false;
      }

      const datos = (await respuesta.json()) as {
        accessToken: string;
        refreshToken: string;
        usuario?: { id: string; nombre: string };
      };
      guardarSesion({
        accessToken: datos.accessToken,
        refreshToken: datos.refreshToken,
        usuario: datos.usuario ?? sesion.usuario,
      });
      return true;
    } catch {
      limpiarSesion();
      return false;
    } finally {
      // Se libera en el `finally` para que la siguiente caducidad —quince
      // minutos después— vuelva a intentarlo en vez de reutilizar el resultado.
      renovacionEnCurso = null;
    }
  })();

  return renovacionEnCurso;
}

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  cuerpo?: unknown;
  /** Parámetros de consulta. Los `undefined` se descartan, no se envían vacíos. */
  parametros?: Record<string, string | number | boolean | undefined>;
}

function construirUrl(ruta: string, parametros?: Opciones['parametros']): string {
  const url = `${BASE}${ruta}`;
  if (!parametros) return url;

  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined) query.set(clave, String(valor));
  }
  const texto = query.toString();
  return texto ? `${url}?${texto}` : url;
}

async function ejecutar(ruta: string, opciones: Opciones, reintentar: boolean): Promise<unknown> {
  const sesion = leerSesion();

  let respuesta: Response;
  try {
    respuesta = await fetch(construirUrl(ruta, opciones.parametros), {
      method: opciones.metodo ?? 'GET',
      headers: {
        ...(opciones.cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(sesion ? { Authorization: `Bearer ${sesion.accessToken}` } : {}),
      },
      ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
    });
  } catch {
    // `fetch` solo rechaza por fallo de red; un 500 llega como respuesta.
    throw new ErrorDeConexion(
      'No se pudo contactar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }

  // 401 con sesión guardada: el access token caducó. Se renueva y se reintenta
  // una sola vez, para que un refresh token también inválido no entre en bucle.
  if (respuesta.status === 401 && reintentar && sesion) {
    if (await renovarSesion()) return ejecutar(ruta, opciones, false);
    limpiarSesion();
  }

  if (respuesta.ok) return leerCuerpo(respuesta);

  const cuerpo = (await leerCuerpo(respuesta)) as CuerpoDeError | null;
  const mensaje = mensajeDeError(cuerpo, respuesta.status);

  // 400 (entrada mal formada), 403 (sin permiso), 404 y 409 (regla de negocio)
  // son cosas que el usuario puede entender y a veces corregir. El resto no:
  // presentarlas como un aviso amable ocultaría un fallo real del sistema.
  if ([400, 403, 404, 409, 422, 429].includes(respuesta.status)) {
    throw new ErrorDeNegocio(mensaje, respuesta.status);
  }
  throw new ErrorDeConexion(mensaje);
}

export const cliente = {
  get: <T>(ruta: string, parametros?: Opciones['parametros']): Promise<T> =>
    ejecutar(ruta, { metodo: 'GET', parametros }, true) as Promise<T>,

  post: <T>(ruta: string, cuerpo?: unknown): Promise<T> =>
    ejecutar(ruta, { metodo: 'POST', cuerpo }, true) as Promise<T>,

  patch: <T>(ruta: string, cuerpo?: unknown): Promise<T> =>
    ejecutar(ruta, { metodo: 'PATCH', cuerpo }, true) as Promise<T>,

  put: <T>(ruta: string, cuerpo?: unknown): Promise<T> =>
    ejecutar(ruta, { metodo: 'PUT', cuerpo }, true) as Promise<T>,

  delete: (ruta: string): Promise<void> =>
    ejecutar(ruta, { metodo: 'DELETE' }, true) as Promise<void>,
};

/** Para el login, que no puede llevar token porque todavía no lo hay. */
export async function pedirSinSesion<T>(ruta: string, cuerpo: unknown): Promise<T> {
  return ejecutar(ruta, { metodo: 'POST', cuerpo }, false) as Promise<T>;
}
