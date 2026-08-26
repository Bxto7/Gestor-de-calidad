/**
 * Cola de generación de documentos (BullMQ sobre Redis).
 *
 * Lado productor: la API encola y responde. El consumidor vive en el proceso
 * `worker` (§5.2), que ejecuta el mismo código desde otro entrypoint.
 *
 * Es el único sitio del módulo que sabe que la cola existe. El caso de uso
 * depende de `ColaDeDocumentosPort`, así que probarlo no exige un Redis
 * levantado: en las pruebas se le pasa un doble que apunta lo que se encoló.
 */

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import type { ColaDeDocumentosPort } from '../../application/ports/documentos.port.js';

export const COLA_DOCUMENTOS_NOMBRE = 'documentos';

/** El trabajo solo lleva el identificador; el resto está en la base. */
export interface TrabajoEnCola {
  readonly trabajoId: string;
}

/**
 * Un cliente de Redis nuevo para quien lo pida.
 *
 * Se construye aquí y no se le pasa a BullMQ un objeto de opciones porque en un
 * paquete ESM —que es lo que este proyecto es— BullMQ no puede cargar `ioredis`
 * por su cuenta y aborta al instanciar la cola.
 *
 * Cada llamada devuelve una conexión propia a propósito: el `Worker` bloquea su
 * conexión esperando trabajos, y compartirla con la `Queue` dejaría a esta sin
 * poder encolar.
 */
export function conexionRedis(): Redis {
  const url = process.env['REDIS_URL'];
  if (!url) {
    // Falla al arrancar y no al pulsar «Generar PDF»: un servicio levantado sin
    // Redis acepta la petición, deja el trabajo en «En cola» y no lo procesa
    // nunca. El usuario vería una espera indefinida sin ningún error.
    throw new Error('Falta REDIS_URL. Revisa el .env o las variables del entorno.');
  }

  // `maxRetriesPerRequest: null` lo exige BullMQ: con el valor por defecto, una
  // desconexión momentánea de Redis haría fallar la espera bloqueante del
  // worker en vez de reintentarla.
  return new Redis(url, { maxRetriesPerRequest: null });
}

/** Reintentos y limpieza, compartidos por productor y worker. */
export const OPCIONES_TRABAJO = {
  // Tres intentos con espera creciente: los fallos típicos aquí son
  // transitorios (la base saturada, el disco ocupado). Un fallo de contenido
  // no se arregla reintentando, pero tampoco cuesta nada intentarlo.
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2_000 },

  // Redis guarda la cola en memoria: sin límite, los trabajos completados de
  // meses se acumularían. El histórico que importa está en PostgreSQL.
  removeOnComplete: { age: 3_600, count: 200 },
  removeOnFail: { age: 24 * 3_600, count: 500 },
};

@Injectable()
export class ColaDeDocumentosBullMq implements ColaDeDocumentosPort, OnModuleDestroy {
  private readonly log = new Logger(ColaDeDocumentosBullMq.name);
  private readonly cola: Queue<TrabajoEnCola>;
  private readonly conexion: Redis;

  constructor() {
    this.conexion = conexionRedis();
    this.cola = new Queue<TrabajoEnCola>(COLA_DOCUMENTOS_NOMBRE, {
      connection: this.conexion,
      defaultJobOptions: OPCIONES_TRABAJO,
    });
  }

  async encolar(trabajoId: string): Promise<void> {
    // El identificador del trabajo es también el del job: si la misma solicitud
    // llegara dos veces, BullMQ descarta la repetida en vez de generar el mismo
    // documento dos veces.
    await this.cola.add('generar', { trabajoId }, { jobId: trabajoId });
    this.log.log(`Trabajo encolado: ${trabajoId}`);
  }

  async onModuleDestroy(): Promise<void> {
    // La conexión es nuestra, así que se cierra también: `cola.close()` no
    // cierra un cliente que recibió ya construido, y el proceso no terminaría.
    await this.cola.close();
    this.conexion.disconnect();
  }
}
