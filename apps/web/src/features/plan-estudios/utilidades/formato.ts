/** Formato de fechas en español peruano, centralizado para no repetir opciones. */

const FECHA = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const FECHA_HORA = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  return FECHA.format(new Date(iso));
}

export function formatearFechaHora(iso: string): string {
  return FECHA_HORA.format(new Date(iso));
}

/** Pluraliza sin repetir ternarios por toda la UI. */
export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}
