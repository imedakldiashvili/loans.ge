import 'reflect-metadata';
import './core/zod-ka';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // URLs follow /{gateway}/{module}/{action} — no global prefix (STANDARDS.md §1)
  app.enableShutdownHooks();
  app.set('trust proxy', true);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API on http://localhost:${port} (health: /public/system/health)`, 'Bootstrap');
}

bootstrap();
