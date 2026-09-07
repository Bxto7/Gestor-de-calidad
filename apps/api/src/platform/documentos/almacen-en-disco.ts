/**
 * Almacén de documentos en disco.
 *
 * Adaptador de `AlmacenDeArchivosPort`. En el VPS el directorio es un volumen de
 * Docker; §5.6 prevé mover esto a Backblaze B2, y por eso lo que se guarda en la
 * base es una clave opaca y no una ruta absoluta: el día del cambio, las filas
 * ya escritas siguen valiendo y solo se sustituye esta clase.
 */

import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';

import type { AlmacenDeArchivosPort } from './puertos.js';

@Injectable()
export class AlmacenEnDisco implements AlmacenDeArchivosPort {
  private readonly log = new Logger(AlmacenEnDisco.name);
  private readonly base: string;

  constructor(directorio = process.env['DOCUMENTOS_DIR'] ?? './var/documentos') {
    this.base = resolve(directorio);
  }

  async guardar(clave: string, contenido: Buffer): Promise<string> {
    const destino = this.rutaDe(clave);
    await mkdir(this.base, { recursive: true });
    await writeFile(destino, contenido);

    this.log.log(`Documento guardado (${(contenido.byteLength / 1024).toFixed(0)} KB): ${clave}`);

    // Se devuelve la clave, no `destino`. Guardar la ruta absoluta ataría cada
    // fila a la ruta que tenía el contenedor el día que se generó.
    return clave;
  }

  async leer(ubicacion: string): Promise<Buffer> {
    return readFile(this.rutaDe(ubicacion));
  }

  /**
   * Resuelve una clave dentro del directorio base, y solo dentro.
   *
   * Hoy las claves las genera el sistema a partir de un UUID, así que no hay
   * entrada de usuario que pueda contener `..`. La comprobación está porque eso
   * es cierto hoy: el día que alguien añada un nombre de archivo elegido por
   * quien pide el documento, esto es lo que impide que `../../.env` sea un
   * destino válido.
   */
  private rutaDe(clave: string): string {
    const destino = resolve(join(this.base, normalize(clave)));

    if (isAbsolute(clave) || !(destino === this.base || destino.startsWith(this.base + sep))) {
      throw new Error(`Clave de documento fuera del almacén: ${clave}`);
    }

    return destino;
  }
}
