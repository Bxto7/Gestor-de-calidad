-- ============================================================================
-- Un director dirige una sola carrera
--
-- La clave primaria de `usuario_carrera` es (usuario_id, carrera_id), que
-- admite varias filas por usuario. La universidad confirma que un Director
-- dirige exactamente una carrera, así que se impone aquí y no solo en la
-- capa de aplicación.
--
-- Se hace ahora, sin datos en la tabla: añadir esta restricción más tarde
-- exigiría resolver a mano los usuarios que ya tuvieran dos carreras.
--
-- Nota: la restricción aplica a CUALQUIER usuario, no solo a los que tengan el
-- rol de Director. Es intencional: la tabla existe para acotar el alcance sobre
-- una carrera, y hoy ese alcance es siempre de uno a uno. Si en el futuro otro
-- rol necesitara alcance sobre varias carreras, esta restricción es lo primero
-- que habría que revisar.
-- ============================================================================

ALTER TABLE "auth"."usuario_carrera"
  ADD CONSTRAINT "usuario_carrera_una_por_usuario" UNIQUE ("usuario_id");
