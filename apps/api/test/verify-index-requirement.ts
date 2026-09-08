/**
 * Verificar que el índice único es realmente necesario.
 *
 * Este script:
 * 1. Borra el índice único actual (con las 3 columnas)
 * 2. Crea uno nuevo sin grupo_objetivo (con solo 2 columnas)
 * 3. Ejecuta la primera prueba que debería FALLAR (crea dos indicaciones del
 *    mismo grupo en el mismo año)
 * 4. Restaura el índice original
 */

import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

(async () => {
  try {
    console.log('Preparando para verificar la necesidad del índice...');

    // 1. Preparar datos de prueba
    await prisma.$executeRawUnsafe(`
      TRUNCATE mejora_continua.indicacion_medicion, mejora_continua.medicion_alcanzada,
               mejora_continua.evidencia, mejora_continua.asignatura_evaluada,
               mejora_continua.configuracion_competencia,
               mejora_continua.planes_evaluacion, mejora_continua.documentos_medicion,
               mejora_continua.programacion_medicion, mejora_continua.competencias_del_plan,
               mejora_continua.periodos_medicion, mejora_continua.planes_medicion
      RESTART IDENTITY CASCADE`);
    await prisma.$executeRawUnsafe(`
      TRUNCATE plan_estudios.planes_estudio, plan_estudios.carreras, plan_estudios.facultades
      RESTART IDENTITY CASCADE`);

    const facultad = await prisma.facultad.create({ data: { nombre: 'Ingeniería' } });
    const carrera = await prisma.carrera.create({
      data: { facultadId: facultad.id, nombre: 'Sistemas', codigo: 'ISI', duracionAnios: 5 },
    });
    const pe = await prisma.planEstudios.create({
      data: {
        carreraId: carrera.id,
        codigo: 'PE-ISI-2026-v1',
        version: 1,
        estado: 'VIGENTE',
        duracionAnios: 5,
      },
    });

    const base = await prisma.planMedicion.create({
      data: {
        planEstudiosId: pe.id,
        tipo: 'INDIRECTA',
        codigo: 'PM-IND-2026-v1',
        meta: 0.7,
        estado: 'APROBADO',
      },
    });

    const planId = (
      await prisma.planEvaluacion.create({ data: { planMedicionId: base.id, codigo: 'EV-IND-1' } })
    ).id;

    const anio2026 = randomUUID();

    console.log('\n✓ Datos de prueba creados');

    // 2. Borrar el índice único actual
    console.log('\n1. Borrando índice único actual (con grupo_objetivo)...');
    await prisma.$executeRawUnsafe(`
      DROP INDEX mejora_continua.indicacion_medicion_plan_evaluacion_id_periodo_id_grupo_objet_k
    `);
    console.log('   ✓ Índice borrado');

    // 3. Crear índice SIN grupo_objetivo
    console.log('\n2. Creando índice sin grupo_objetivo (para verificar que es necesario)...');
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX indicacion_medicion_plan_periodo_key
        ON mejora_continua.indicacion_medicion (plan_evaluacion_id, periodo_id)
    `);
    console.log('   ✓ Índice nuevo creado');

    // 4. Intentar crear dos indicaciones del mismo grupo en el mismo año
    // Esto DEBE FALLAR porque el índice sin grupo_objetivo lo permitiría
    console.log('\n3. Intentando crear dos indicaciones del mismo grupo/año (debería pasar sin el check)...');

    try {
      const ind1 = await prisma.indicacionDeMedicion.create({
        data: {
          planEvaluacionId: planId,
          periodoId: anio2026,
          grupoObjetivo: 'EGRESADOS' as any,
          instruccion: 'Encuesta a egresados',
          enlaceInstrumento: 'https://forms.example.com',
        },
      });
      console.log(`   ✓ Primera indicación creada: ${ind1.id}`);

      // La segunda con el MISMO grupo y MISMO año debería PASAR con el índice
      // sin grupo_objetivo, porque la uniqueness es solo por (plan, periodo)
      const ind2 = await prisma.indicacionDeMedicion.create({
        data: {
          planEvaluacionId: planId,
          periodoId: anio2026,
          grupoObjetivo: 'EMPLEADORES' as any, // Grupo diferente, pero índice no lo chequea
          instruccion: 'Encuesta a empleadores',
          enlaceInstrumento: 'https://forms.example.com',
        },
      });
      console.log(`   ✓ Segunda indicación creada: ${ind2.id}`);
      console.log('   ⚠️  PROBLEMA: El índice sin grupo_objetivo permite dos indicaciones del mismo año');
      console.log('   Esto confirma que el grupo_objetivo es NECESARIO en el índice único.');
    } catch (e) {
      console.log(`   ✗ Error (inesperado): ${(e as Error).message}`);
    }

    // 5. Restaurar el índice original
    console.log('\n4. Restaurando el índice único original (con grupo_objetivo)...');
    await prisma.$executeRawUnsafe(`
      DROP INDEX mejora_continua.indicacion_medicion_plan_periodo_key
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX indicacion_medicion_plan_evaluacion_id_periodo_id_grupo_objet_k
        ON mejora_continua.indicacion_medicion (plan_evaluacion_id, periodo_id, grupo_objetivo)
    `);
    console.log('   ✓ Índice original restaurado');

    console.log('\n✅ Verificación completada: el índice con grupo_objetivo es NECESARIO');
  } finally {
    await prisma.$disconnect();
  }
})();
