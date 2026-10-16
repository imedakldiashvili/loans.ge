import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminReferencesModule } from './admin/references.module';
import { AdminUsersModule } from './admin/users.module';
import { AdminViewsModule } from './admin/views.module';
import { AuthModule } from './auth/auth.module';
import { ActionLogMiddleware } from './core/action-log';
import { EnvelopeExceptionFilter, EnvelopeInterceptor } from './core/envelope';
import { PrismaModule } from './core/prisma.service';
import { DevOutboxModule } from './dev/dev-outbox';
import { HealthController } from './health/health.controller';
import { NotifyModule } from './notify/notify.module';
import { PartnerModule } from './partner/partner.module';
import { PublicReferencesModule } from './public/references.module';
import { WorkerModule } from './worker/expiry';

@Module({
  imports: [PrismaModule, NotifyModule, DevOutboxModule.register(), AuthModule, AdminReferencesModule, AdminUsersModule, AdminViewsModule, PartnerModule, PublicReferencesModule, WorkerModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: EnvelopeExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ActionLogMiddleware).forRoutes('*');
  }
}
