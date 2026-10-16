import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminApiKeyController, PartnerApiKeyController } from './api-keys';
import { AdminWebhookDeliveryController, PartnerWebhookController, PartnerWebhookDeliveryController, WebhookService, WebhookWorker } from './webhooks';

/** Integration (stage 6b): API keys for banks' systems on the partner gateway, signed webhooks with retries. */
@Module({
  imports: [AuthModule],
  controllers: [PartnerApiKeyController, AdminApiKeyController, PartnerWebhookController, PartnerWebhookDeliveryController, AdminWebhookDeliveryController],
  providers: [WebhookService, WebhookWorker],
})
export class IntegrationModule {}
