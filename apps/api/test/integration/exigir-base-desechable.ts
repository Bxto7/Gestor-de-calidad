/**
 * Impide que la suite de integración se ejecute contra una base que no sea
 * desechable.
 *
 * Estas pruebas vacían tablas con TRUNCATE en cada `beforeEach`: es lo que las
 * hace fiables y también lo que las hace peligrosas. Apuntadas por descuido a la
 * base de desarrollo se llevan por delante lo que hubiera —pasó: borraron un
 * plan de estudios recién cargado, con sus 74 asignaturas— y apuntadas a
 * producción serían una catástrofe.
 *
 * El único caso legítimo es una base creada para esto y que se tira después. Se
 * exige declararlo, en vez de intentar adivinarlo: mirar si la base "parece
 * vacía" fallaría justo en el arranque de una base real recién migrada.
 *
 * Cómo declararlo:
 *
 *   SGC_DB_DESECHABLE=1 npm run test:integration
 *
 * o poniendo el nombre de la base en `sgc_test`, que es lo que hace CI.
 */

const MARCA_EXPLICITA = process.env['SGC_DB_DESECHABLE'] === '1';

/** Nombres reservados para bases de prueba. */
const NOMBRES_DESECHABLES = ['sgc_test', 'sgc_ci'];

function nombreDeLaBase(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

export function exigirBaseDesechable(): void {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL. Las pruebas de integración necesitan un PostgreSQL desechable.',
    );
  }

  if (MARCA_EXPLICITA || NOMBRES_DESECHABLES.includes(nombreDeLaBase(url))) return;

  throw new Error(
    `Estas pruebas vacían tablas y la base "${nombreDeLaBase(url)}" no está marcada como ` +
      'desechable.\n\n' +
      'Si de verdad es una base de usar y tirar, decláralo:\n' +
      '  SGC_DB_DESECHABLE=1 npm run test:integration\n\n' +
      `O nómbrala ${NOMBRES_DESECHABLES.join(' o ')}, que es lo que hace CI.\n` +
      'Nunca contra la base de desarrollo con datos que te importen, y jamás contra producción.',
  );
}
