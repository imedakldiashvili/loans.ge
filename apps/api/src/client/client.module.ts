import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StatusConfigService } from '../core/status-config';
import { ClientApplicationController, ClientApplicationOrgController, ClientApplicationService } from './applications';
import { ClientProfileController, ClientProfileService, PublicStatsController } from './profile';

/** client gateway — the customer site: applications, offers, profile. */
@Module({
  imports: [AuthModule],
  controllers: [ClientApplicationController, ClientApplicationOrgController, ClientProfileController, PublicStatsController],
  providers: [ClientApplicationService, ClientProfileService, StatusConfigService],
})
export class ClientModule {}
