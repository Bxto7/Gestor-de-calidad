import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  CambiarEstadoDocenteDto,
  CambiarPasswordDocenteDto,
  CrearDocenteDto,
} from './docentes.dto.js';

async function errores<T extends object>(clase: new () => T, datos: object): Promise<string[]> {
  const fallos = await validate(plainToInstance(clase, datos));
  return fallos.flatMap((f) => Object.values(f.constraints ?? {}));
}

const valido = {
  nombreCompleto: 'Luis Ramos',
  email: 'luis@sgc.local',
  password: 'Clave.Docente.1',
};

describe('CrearDocenteDto', () => {
  it('acepta los datos completos', async () => {
    expect(await errores(CrearDocenteDto, valido)).toEqual([]);
  });

  it('rechaza un usuario que no es un correo', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, email: 'luis' })).toEqual([
      'El usuario debe ser un correo con formato válido.',
    ]);
  });

  it('rechaza un nombre en blanco, midiéndolo ya recortado', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, nombreCompleto: '    ' })).toEqual([
      'El nombre debe tener entre 3 y 200 caracteres.',
    ]);
  });

  it('rechaza una contraseña de 7 caracteres', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, password: '1234567' })).toEqual([
      'La contraseña debe tener al menos 8 caracteres.',
    ]);
  });

  it('rechaza una contraseña de más de 128 caracteres', async () => {
    expect(await errores(CrearDocenteDto, { ...valido, password: 'a'.repeat(129) })).toEqual([
      'La contraseña no puede pasar de 128 caracteres.',
    ]);
  });
});

describe('CambiarPasswordDocenteDto', () => {
  it('acepta 8 caracteres y rechaza 7', async () => {
    expect(await errores(CambiarPasswordDocenteDto, { password: '12345678' })).toEqual([]);
    expect(await errores(CambiarPasswordDocenteDto, { password: '1234567' })).toHaveLength(1);
  });
});

describe('CambiarEstadoDocenteDto', () => {
  it('exige un booleano', async () => {
    expect(await errores(CambiarEstadoDocenteDto, { activo: false })).toEqual([]);
    expect(await errores(CambiarEstadoDocenteDto, { activo: 'no' })).toHaveLength(1);
  });
});
