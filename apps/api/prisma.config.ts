import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de Prisma.
 *
 * Desde la versión 7 la URL de conexión ya no vive en `schema.prisma` sino
 * aquí, y `package.json#prisma` quedó deprecado. Sacar la credencial del
 * esquema es coherente con §5.7: lo que se versiona no contiene secretos, solo
 * la referencia a la variable de entorno.
 *
 * La 7 también dejó de cargar `.env` por su cuenta. Se usa el cargador nativo
 * de Node en lugar de añadir `dotenv`, y solo si el archivo existe: en CI y en
 * el VPS las variables llegan del entorno (Actions Secrets / .env del sistema),
 * no de un archivo dentro del repositorio.
 */
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
