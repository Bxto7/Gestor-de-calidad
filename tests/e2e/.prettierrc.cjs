/**
 * La misma configuración que `apps/web`, no una copia.
 *
 * Se reexporta en vez de duplicar el JSON porque la raíz del repositorio no
 * tiene `package.json` desde el que compartirla, y dos copias acabarían
 * divergiendo sin que nadie se entere hasta que el formato de un archivo
 * cambie al pasar de un paquete a otro.
 */
module.exports = require('../../apps/web/.prettierrc.json');
