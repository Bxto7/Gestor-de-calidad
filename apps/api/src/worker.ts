/**
 * Arranque del worker (§5.2: mismo código que la API, proceso aparte).
 *
 *   npm run start:worker
 *
 * No levanta servidor HTTP: `createApplicationContext` construye el contenedor
 * de dependencias sin abrir un puerto. El worker no atiende peticiones, y
 * exponerle uno solo añadiría superficie que el firewall tendría que cerrar.
 *
 * Por qué un proceso propio y no un hilo dentro de la API: generar el PDF de un
 * plan de 74 asignaturas ocupa la CPU durante cientos de milisegundos. Dentro
 * de la API competiría por el event loop con las peticiones que esta cola
 * existe precisamente para no bloquear.
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module.js';

async function arrancar(): Promise<void> {
  // Sin `bufferLogs`: en un contexto de aplicación nada vuelve a vaciar el
  // búfer, y el worker arrancaba sin escribir una sola línea — indistinguible
  // de un proceso colgado.
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Sin esto, `onModuleDestroy` no se ejecuta al recibir SIGTERM: `docker
  // compose down` cortaría el proceso con un documento a medio generar y su
  // fila quedaría en «Generando» para siempre.
  app.enableShutdownHooks();

  new Logger('Worker').log('Worker de documentos arrancado.');
}

arrancar().catch((error: unknown) => {
  console.error('No se pudo arrancar el worker:', error);
  process.exit(1);
});
