/**
 * Composición del proceso worker.
 *
 * Importa `AppModule` en vez de redeclarar los proveedores: la unión de puertos
 * y adaptadores ya está resuelta ahí, y tenerla dos veces significaría que un
 * cambio de adaptador puede aplicarse en la API y olvidarse en el worker — con
 * los dos procesos comportándose distinto sobre los mismos datos.
 *
 * Lo único que añade es el consumidor de la cola, que solo debe existir aquí:
 * si la API también consumiera, generaría documentos en el mismo proceso que
 * atiende las peticiones y la cola no serviría de nada.
 */

import { Module } from '@nestjs/common';

import { AppModule } from './app.module.js';
import { WorkerDeDocumentos } from './modules/plan-estudios/infrastructure/queue/documentos.worker.js';

@Module({
  imports: [AppModule],
  providers: [WorkerDeDocumentos],
})
export class WorkerModule {}
