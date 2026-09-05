/**
 * RF-PM-002: los dos tipos de plan de medición.
 *
 * Vive en `domain/` y no en el puerto, donde estaba: es un concepto del negocio
 * —la Directa se organiza por periodos académicos y la Indirecta por años
 * calendario— y no un detalle del contrato de persistencia. Un archivo de
 * dominio no puede importar de `application/` sin romper la regla de
 * dependencias de CLAUDE.md §3.2, y `codigo-medicion.ts` lo necesita.
 *
 * El puerto lo reexporta para no romper a quien ya lo importaba de allí.
 */
export type TipoMedicion = 'DIRECTA' | 'INDIRECTA';
