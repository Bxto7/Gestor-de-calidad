# Dependencias: decisiones y hallazgos pendientes

El *Definition of Done* (`CLAUDE.md` §6.6) exige que la auditoría de dependencias no deje
hallazgos críticos o altos «sin resolver o justificar explícitamente». Este documento es
donde se justifican los que quedan abiertos, para que `npm audit` no se convierta en ruido
que todo el mundo aprende a ignorar.

Última revisión: **25 de agosto de 2026**.

## Hallazgos abiertos

### `deepmerge-ts` — severidad alta (agotamiento de pila)

- **Cadena:** `prisma` → `@prisma/config` → `deepmerge-ts`
- **Por qué sigue abierto:** no hay versión de `prisma` que la resuelva todavía. Forzar una
  versión distinta de `deepmerge-ts` rompería `@prisma/config`, que es lo que lee
  `prisma.config.ts`.
- **Por qué se acepta:** `prisma` es una **devDependency**. Es la CLI de migraciones y
  generación de cliente; no entra en la imagen de producción, no atiende peticiones y no
  procesa entrada de usuario. El vector del aviso —fusionar objetos con referencias
  cíclicas— exige controlar la configuración, y quien controla `prisma.config.ts` ya tiene
  acceso al repositorio.
- **Cuándo revisarlo:** en cada actualización mayor de Prisma. Si `prisma` pasara alguna vez
  a `dependencies`, esta justificación deja de valer.

## Overrides declarados en `package.json`

### `uuid: ^11.1.1`

- **Motivo:** `exceljs` 4.4.0 arrastra `uuid` 8.3.2, con un aviso de severidad moderada
  (`GHSA-w5hq-g745-h8pq`: falta comprobación de límites del búfer en v3/v5/v6 cuando se pasa
  `buf`). La corrección que propone `npm audit fix --force` es bajar `exceljs` a la 3.4.0,
  un cambio incompatible que quitaría lo que RF073 necesita.
- **Por qué el override es seguro:** `exceljs` usa `uuid` en un único punto
  (`cf-rule-ext-xform.js`), llamando a `v4()` sin argumento `buf`, con el import nombrado
  `const {v4: uuidv4} = require('uuid')` — que uuid 11 sigue exponiendo. La prueba de que
  funciona no es teórica: `renderizadores.spec.ts` genera un libro y lo vuelve a abrir.
- **Cuándo retirarlo:** cuando `exceljs` publique una versión que dependa de `uuid >= 11.1.1`.

## Elecciones que conviene recordar

| Paquete | Elección | Por qué |
|---|---|---|
| `pdfkit` | Frente a `puppeteer` para el PDF (§4.2 dejaba las dos abiertas) | Puppeteer añade ~300 MB de Chromium a la imagen y 200–400 MB de RAM por render. El VPS del MVP es un CPX21 de 3 vCPU / 4 GB compartido con PostgreSQL, Redis, la API y el worker. El precio de PDFKit es maquetar a mano, y está acotado a `pdfkit.renderer.ts` porque el contenido vive en `domain/documentos/`. |
| `ioredis` | Dependencia directa y explícita | BullMQ 6 ya no la incluye —soporta también un backend PostgreSQL— y en un paquete ESM no puede cargarla por su cuenta: hay que construir el cliente y pasárselo. |
| `exceljs` | Frente a generar CSV | RF073 justifica el Excel por los «análisis externos». Un CSV no guarda tipos, y una columna de créditos como texto no se puede sumar ni llevar a una tabla dinámica. |
