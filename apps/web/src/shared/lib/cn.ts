import { twMerge } from 'tailwind-merge';

/**
 * Une clases resolviendo conflictos de Tailwind. Sin `twMerge`, un
 * `className="w-44"` pasado desde fuera NO gana sobre el `w-full` de la clase
 * base: tienen la misma especificidad y decide el orden del CSS generado, no el
 * del string. Esto ya rompió el ancho de los selectores de filtro.
 */
export function cn(...clases: (string | false | null | undefined)[]): string {
  return twMerge(clases.filter(Boolean).join(' '));
}
