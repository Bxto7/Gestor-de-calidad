/**
 * Consumidor de la cola de documentos.
 *
 * Se registra solo en el proceso `worker` (§5.2: mismo código, entrypoint
 * distinto). Si la API también consumiera, un PDF de un plan grande competiría
 * por CPU con las peticiones que se supone que no debe bloquear — que es
 * justo el motivo de tener una cola.
 */

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import { GenerarDocumento } from '../../application/use-cases/generar-documentos.use-case.js';
import { COLA_DOCUMENTOS_NOMBRE, conexionRedis, type TrabajoEnCola } from './documentos.cola.js';

/**
 * Cuántos documentos se generan a la vez.
 *
 * Dos, y no más: el VPS del MVP es un CPX21 de 3 vCPU compartido con
 * PostgreSQL, Redis y la API. Generar cuatro PDF grandes en paralelo dejaría a
 * la API sin CPU, y el RNF que esta cola existe para cumplir es el de que la
 * aplicación siga respondiendo mientras tanto.
 */
const SIMULTANEOS = 2;

@Injectable()
export class WorkerDeDocumentos implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WorkerDeDocumentos.name);
  private worker?: Worker<TrabajoEnCola>;
  private conexion?: Redis;

  constructor(private readonly generar: GenerarDocumento) {}

  onModuleInit(): void {
    this.worker = new Worker<TrabajoEnCola>(
      COLA_DOCUMENTOS_NOMBRE,
      async (job) => {
        const inicio = Date.now();
        await this.generar.ejecutar(job.data.trabajoId);
        // Se mide siempre: el RNF de §3.4 habla de menos de 5 s, y sin este
        // registro no habría forma de saber si se cumple en producción.
        this.log.log(`Documento ${job.data.trabajoId} procesado en ${Date.now() - inicio} ms.`);
      },
      { connection: (this.conexion = conexionRedis()), concurrency: SIMULTANEOS },
    );

    // `GenerarDocumento` no lanza: guarda el fallo como estado. Si aun así algo
    // escapa, es un fallo de la infraestructura de la cola y tiene que verse en
    // el log en vez de morir en silencio.
    this.worker.on('failed', (job, error) => {
      this.log.error(`Trabajo ${job?.id ?? '?'} falló: ${error.message}`);
    });

    this.worker.on('error', (error) => {
      this.log.error(`Error de la cola de documentos: ${error.message}`);
    });

    this.log.log(`Worker de documentos escuchando (concurrencia ${SIMULTANEOS}).`);
  }

  async onModuleDestroy(): Promise<void> {
    // `close()` espera a que terminen los trabajos en curso. Cortar en seco
    // dejaría un documento a medio escribir y su fila en «Generando».
    await this.worker?.close();
    this.conexion?.disconnect();
  }
}
