/**
 * Preparación de las pruebas de componente.
 *
 * Aporta los emparejadores de `jest-dom` —`toBeInTheDocument`, `toBeDisabled`,
 * `toBeChecked`— y limpia el DOM entre pruebas. Sin la limpieza, un componente
 * montado en una prueba seguiría en el documento durante la siguiente y las
 * consultas encontrarían dos coincidencias donde debería haber una.
 */

import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
