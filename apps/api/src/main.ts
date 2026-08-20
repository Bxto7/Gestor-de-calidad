/**
 * Arranque de la API.
 *
 * `reflect-metadata` va primero de todo: NestJS lo necesita para leer los
 * decoradores, y cualquier import anterior fallaría.
 */
import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('api/v1');

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
}

arrancar().catch((error: unknown) => {
  // Sin esto, un fallo de arranque queda como una promesa rechazada sin manejar
  // y el proceso muere sin decir por qué.
  console.error('No se pudo arrancar la API:', error);
  process.exit(1);
});
