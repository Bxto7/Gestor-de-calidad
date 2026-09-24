/**
 * Lo que la vista de inicio del Administrador necesita saber de la estructura
 * institucional, derivado en un solo sitio.
 *
 * Dominio puro: recibe listas y conteos ya leídos y devuelve el resumen. No
 * conoce a `auth` —el conteo entra como un mapa— ni a Prisma ni a NestJS.
 *
 * Las carreras inactivas no cuentan para nada: una carrera apagada sin
 * director no es una tarea pendiente. Las facultades inactivas aparecen en la
 * lista, con su estado, pero quedan fuera de los KPI y de las listas de
 * pendientes por la misma razón.
 */

export interface FacultadEntrada {
  readonly id: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly creadoEn: Date;
}

export interface CarreraEntrada {
  readonly id: string;
  readonly facultadId: string;
  readonly nombre: string;
  readonly activa: boolean;
  readonly creadoEn: Date;
}

/** Misma forma que el puerto de `auth`, declarada aquí para que el dominio no importe nada. */
export interface ConteoDeCarrera {
  readonly usuarios: number;
  readonly directores: number;
}

export type EstadoFacultad = 'ACTIVA' | 'REVISAR' | 'INACTIVA';

export interface FilaFacultad {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly activa: boolean;
  readonly carreras: number;
  readonly usuarios: number;
  readonly carrerasSinDirector: number;
  readonly progreso: number;
  readonly estado: EstadoFacultad;
}

export interface AltaReciente {
  readonly tipo: 'CARRERA' | 'FACULTAD';
  readonly id: string;
  readonly nombre: string;
  readonly contexto: string;
  readonly creadoEn: string;
}

export interface EstructuraInstitucional {
  readonly kpis: {
    readonly facultadesActivas: number;
    readonly carreras: number;
    readonly usuariosConAcceso: number;
    readonly carrerasSinDirector: number;
  };
  readonly facultades: readonly FilaFacultad[];
  readonly carrerasSinDirector: readonly { id: string; nombre: string; facultad: string }[];
  readonly facultadesSinCarreras: readonly { id: string; nombre: string }[];
  readonly altasRecientes: readonly AltaReciente[];
}

export interface EntradaEstructura {
  readonly facultades: readonly FacultadEntrada[];
  readonly carreras: readonly CarreraEntrada[];
  readonly conteos: ReadonlyMap<string, ConteoDeCarrera>;
  readonly usuariosConAcceso: number;
}

const ALTAS_MAXIMAS = 4;

/** Tres primeras letras de la última palabra, en mayúsculas y sin acentos. */
export function codigoDeFacultad(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/);
  const ultima = palabras[palabras.length - 1] ?? '';
  return ultima
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3);
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) =>
  a.nombre.localeCompare(b.nombre, 'es');

function carrerasTexto(n: number): string {
  return n === 1 ? '1 carrera' : `${n} carreras`;
}

export function calcularEstructuraInstitucional(
  entrada: EntradaEstructura,
): EstructuraInstitucional {
  const sinConteo: ConteoDeCarrera = { usuarios: 0, directores: 0 };
  const conteoDe = (id: string) => entrada.conteos.get(id) ?? sinConteo;

  const activasPorFacultad = new Map<string, CarreraEntrada[]>();
  for (const c of entrada.carreras) {
    if (!c.activa) continue;
    const lista = activasPorFacultad.get(c.facultadId) ?? [];
    lista.push(c);
    activasPorFacultad.set(c.facultadId, lista);
  }
  const activasDe = (facultadId: string) =>
    [...(activasPorFacultad.get(facultadId) ?? [])].sort(porNombre);
  const sinDirector = (c: CarreraEntrada) => conteoDe(c.id).directores === 0;

  const ordenadas = [...entrada.facultades].sort(porNombre);

  const facultades: FilaFacultad[] = ordenadas.map((f) => {
    const carreras = activasDe(f.id);
    const faltantes = carreras.filter(sinDirector).length;
    const conDirector = carreras.length - faltantes;
    const estado: EstadoFacultad = !f.activa
      ? 'INACTIVA'
      : carreras.length === 0 || faltantes > 0
        ? 'REVISAR'
        : 'ACTIVA';

    return {
      id: f.id,
      nombre: f.nombre,
      codigo: codigoDeFacultad(f.nombre),
      activa: f.activa,
      carreras: carreras.length,
      usuarios: carreras.reduce((suma, c) => suma + conteoDe(c.id).usuarios, 0),
      carrerasSinDirector: faltantes,
      progreso: carreras.length === 0 ? 0 : Math.round((conDirector / carreras.length) * 100),
      estado,
    };
  });

  const activas = ordenadas.filter((f) => f.activa);

  const carrerasSinDirector = activas.flatMap((f) =>
    activasDe(f.id)
      .filter(sinDirector)
      .map((c) => ({ id: c.id, nombre: c.nombre, facultad: f.nombre })),
  );

  const facultadesSinCarreras = activas
    .filter((f) => activasDe(f.id).length === 0)
    .map((f) => ({ id: f.id, nombre: f.nombre }));

  const candidatas: (AltaReciente & { readonly instante: number })[] = [
    ...activas.map((f) => {
      const n = activasDe(f.id).length;
      return {
        tipo: 'FACULTAD' as const,
        id: f.id,
        nombre: f.nombre,
        contexto: n === 0 ? 'Sin carreras aún' : carrerasTexto(n),
        creadoEn: f.creadoEn.toISOString(),
        instante: f.creadoEn.getTime(),
      };
    }),
    ...activas.flatMap((f) =>
      activasDe(f.id).map((c) => ({
        tipo: 'CARRERA' as const,
        id: c.id,
        nombre: c.nombre,
        contexto: f.nombre,
        creadoEn: c.creadoEn.toISOString(),
        instante: c.creadoEn.getTime(),
      })),
    ),
  ];

  const altasRecientes: AltaReciente[] = candidatas
    .sort((a, b) => b.instante - a.instante || porNombre(a, b))
    .slice(0, ALTAS_MAXIMAS)
    .map(({ instante: _instante, ...alta }) => alta);

  return {
    kpis: {
      facultadesActivas: activas.length,
      carreras: facultades.filter((f) => f.activa).reduce((suma, f) => suma + f.carreras, 0),
      usuariosConAcceso: entrada.usuariosConAcceso,
      carrerasSinDirector: carrerasSinDirector.length,
    },
    facultades,
    carrerasSinDirector,
    facultadesSinCarreras,
    altasRecientes,
  };
}
