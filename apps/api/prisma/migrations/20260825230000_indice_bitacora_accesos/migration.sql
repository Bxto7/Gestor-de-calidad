-- Bitácora de accesos: la consulta filtra por acción y ordena por fecha.
--
-- Sin este índice, buscar los intentos fallidos —que son raros frente al
-- volumen de accesos correctos— obliga a recorrer hacia atrás toda la
-- actividad reciente para reunir unas pocas filas.

-- CreateIndex
CREATE INDEX "audit_log_accion_fecha_idx" ON "auditoria"."audit_log"("accion", "fecha");

