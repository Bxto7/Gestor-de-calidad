import { defineConfig } from 'vitest/config';

/**
 * Pruebas de integración: adaptadores contra un PostgreSQL real y efímero.
 *
 * Van en una configuración aparte de las unitarias, no en la misma con otro
 * patrón, por dos motivos:
 *
 *  1. `npm test` tiene que poder correr sin base de datos. El dominio es puro y
 *     esa es su ventaja; si el comando de siempre exigiera un contenedor
 *     levantado, la prueba rápida de cada guardado dejaría de ser rápida.
 *  2. Los umbrales de cobertura de §6.6 miden `domain/` y `application/`. Estas
 *     pruebas cubren `infrastructure/`, y mezclarlas inflaría el porcentaje con
 *     código que el umbral no pretende vigilar.
 *
 * CLAUDE.md §6.4 pide Testcontainers. Aquí el contenedor lo levanta quien
 * ejecuta —CI mediante `services:`, el equipo con `docker run`— porque
 * Testcontainers necesita un Docker accesible desde el proceso de pruebas, y en
 * Windows con Docker Desktop eso todavía obliga a configuración por máquina.
 * La diferencia es de arranque, no de aislamiento: la base sigue siendo
 * desechable y nunca es la de staging.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.int.spec.ts'],

    // Comparten una sola base y cada archivo la vacía con TRUNCATE. En paralelo
    // se borrarían los datos entre sí a mitad de una prueba.
    fileParallelism: false,

    // Levantar el pool de Prisma y aplicar el TRUNCATE es más lento que una
    // prueba en memoria; el valor por defecto de 5s se queda corto en un
    // arranque en frío.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
