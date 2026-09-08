import { PrismaService } from '../src/platform/database/prisma.service.js';

const prisma = new PrismaService();

(async () => {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'mejora_continua' AND tablename = 'indicacion_medicion'
    `);
    console.log('Índices en indicacion_medicion:');
    (result as any[]).forEach(r => {
      console.log(`  - ${r.indexname}`);
      console.log(`    ${r.indexdef}`);
    });
  } finally {
    await prisma.$disconnect();
  }
})();
