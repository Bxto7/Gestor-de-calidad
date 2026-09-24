import { StreamableFile } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '../../../../../shared-kernel/domain-events/domain-event.js';
import type {
  ConsultarDocumentoActa,
  GenerarDocumentoActa,
} from '../../application/use-cases/generar-documento-acta.use-case.js';
import { DocumentosActaController, DocumentosDelActaController } from './documentos-acta.controller.js';

const actor = { id: 'u1' } as unknown as Actor;

describe('DocumentosDelActaController', () => {
  it('delega el pedido en GenerarDocumentoActa.encolar con el tipo del DTO', async () => {
    const encolar = vi.fn().mockResolvedValue({ id: 't1' });
    const c = new DocumentosDelActaController(
      { encolar } as unknown as GenerarDocumentoActa,
      {} as ConsultarDocumentoActa,
    );
    await expect(c.pedir('a1', actor, { tipo: 'ACTA_PDF' })).resolves.toEqual({ id: 't1' });
    expect(encolar).toHaveBeenCalledWith(actor, 'a1', 'ACTA_PDF');
  });

  it('lista con tope por defecto de 20 y acepta un límite válido', async () => {
    const listarDeActa = vi.fn().mockResolvedValue([]);
    const c = new DocumentosDelActaController(
      {} as GenerarDocumentoActa,
      { listarDeActa } as unknown as ConsultarDocumentoActa,
    );
    await c.listar('a1', actor);
    await c.listar('a1', actor, '5');
    await c.listar('a1', actor, '500');
    expect(listarDeActa.mock.calls.map((x: unknown[]) => x[2])).toEqual([20, 5, 20]);
  });
});

describe('DocumentosActaController', () => {
  it('descarga con attachment y nombre saneado', async () => {
    const descargar = vi.fn().mockResolvedValue({
      contenido: Buffer.from('x'),
      tipoMime: 'application/pdf',
      nombreArchivo: 'AC 001"\r\n.pdf',
    });
    const c = new DocumentosActaController({ descargar } as unknown as ConsultarDocumentoActa);
    const r = await c.descargar('t1', actor);
    expect(r).toBeInstanceOf(StreamableFile);
    expect(r.getHeaders().disposition).toBe('attachment; filename="AC_001___.pdf"');
    expect(r.getHeaders().type).toBe('application/pdf');
  });

  it('consulta el estado por id', async () => {
    const estado = vi.fn().mockResolvedValue({ id: 't1', estado: 'Listo' });
    const c = new DocumentosActaController({ estado } as unknown as ConsultarDocumentoActa);
    await expect(c.estado('t1', actor)).resolves.toMatchObject({ estado: 'Listo' });
    expect(estado).toHaveBeenCalledWith(actor, 't1');
  });
});
