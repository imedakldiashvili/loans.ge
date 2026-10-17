import './env';
import 'reflect-metadata';
import './core/zod-ka';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupDocs } from './docs/openapi';
import { ensureDefaults, FS_PREFIX, FS_ROOT } from './core/files';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // URLs follow /{gateway}/{module}/{action} — no global prefix (STANDARDS.md §1)
  app.enableShutdownHooks();
  app.set('trust proxy', true);
  await ensureDefaults();
  // uploaded files (logos): read-only, cached for good (every upload gets a new name); an SVG can never run a script
  app.useStaticAssets(FS_ROOT, {
    prefix: FS_PREFIX, maxAge: '365d', immutable: true, index: false, dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });
  // integration API description: Swagger UI at /docs
  setupDocs(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API on http://localhost:${port} (health: /public/system/health, docs: /docs)`, 'Bootstrap');
}

bootstrap();
