-- RF-CH-043 / RF-CH-044 (Bloque 6b): los planes de Mejora pasan a tres estados.
--
-- Hasta ahora Mejora reutilizaba el enum de Medición y Evaluación (cinco
-- estados). El documento de cambios fija tres para Mejora —Borrador, En revisión
-- y Aprobado— y su RN2 manda que lo que estaba Vigente o Histórico quede
-- Aprobado. «Vigente» pasa a ser una regla calculada: la última aprobada de cada
-- linaje.
--
-- El enum `EstadoMedicion` de la base CONSERVA `VIGENTE` e `HISTORICO`: Medición
-- y Evaluación los siguen usando. Solo cambian las filas de `planes_mejora`.
--
-- No es reversible sin perder la distinción entre lo que estaba Vigente y lo que
-- era Histórico; la universidad aún debe ratificar la migración (§7 del
-- documento). Es una migración de datos, no un caso de uso: no emite eventos de
-- auditoría. Idempotente: una segunda aplicación no encuentra filas que cambiar.
--
-- La sección marcada es UNA sentencia: la prueba
-- `test/integration/migracion-estados-de-mejora.int.spec.ts` la extrae por sus
-- marcas y la ejecuta sobre casos conocidos. No cambiar las marcas.

-- estados-de-mejora:inicio
UPDATE "mejora_continua"."planes_mejora"
   SET "estado" = 'APROBADO'
 WHERE "estado" IN ('VIGENTE', 'HISTORICO');
-- estados-de-mejora:fin
