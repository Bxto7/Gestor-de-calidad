/**
 * Arranque de la API.
 *
 * `reflect-metadata` va primero de todo: NestJS lo necesita para leer los
 * decoradores, y cualquier import anterior fallaría.
 */
import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('api/v1');

  // ── Confianza en el proxy ────────────────────────────────────────────────
  //
  // Sin esto, Express toma como IP del cliente la del socket. Detrás de Caddy
  // (§5.2) esa es siempre la de Caddy, así que **toda la universidad comparte
  // un único cubo de rate limiting**: los 120 req/min globales y los 5 logins
  // por minuto de §4.4 dejarían de ser por persona y pasarían a ser por
  // instalación. Cinco personas entrando a primera hora bloquearían al resto.
  //
  // El valor es el número de saltos de proxy y no `true`. Confiar sin contarlos
  // deja que cualquiera mande un `X-Forwarded-For` inventado y se salte el
  // límite eligiendo una IP distinta en cada intento — que es exactamente lo
  // que el límite del login existe para impedir.
  //
  // 0 (por defecto) en desarrollo, donde no hay proxy; 1 en el VPS.
  const saltosDeProxy = Number(process.env['TRUST_PROXY'] ?? 0);
  if (saltosDeProxy > 0) {
    app.set('trust proxy', saltosDeProxy);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      // Descarta lo que el DTO no declara. Sin esto, un cliente podría colar
      // campos que un `Object.assign` descuidado acabaría persistiendo.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // §4.2: OpenAPI autogenerado, y §6.6 lo incluye en el Definition of Done.
  const doc = new DocumentBuilder()
    .setTitle('SGC — Sistema de Gestión de la Calidad')
    .setDescription('API del módulo Plan de Estudios y del módulo de Auth.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  const puerto = Number(process.env['PORT'] ?? 3000);
  await app.listen(puerto);

  const log = new Logger('Arranque');
  log.log(`API escuchando en http://localhost:${puerto}/api/v1`);
  log.log(`Documentación en http://localhost:${puerto}/api/docs`);
  if (saltosDeProxy > 0) log.log(`Confiando en ${saltosDeProxy} proxy(s) para la IP del cliente.`);
}

arrancar().catch((error: unknown) => {
  // Sin esto, un fallo de arranque queda como una promesa rechazada sin manejar
  // y el proceso muere sin decir por qué.
  console.error('No se pudo arrancar la API:', error);
  process.exit(1);
});
