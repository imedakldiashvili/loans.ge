import { Module } from '@nestjs/common';
import { StatusConfigService } from '../core/status-config';
import { PartnerApplicationController, PartnerApplicationService } from './applications';
import { PARTNER_CATALOG } from './catalog';

/** partner gateway (= integration API): catalogue, staff, applications. */
@Module({
  controllers: [...PARTNER_CATALOG.map((p) => p.controller), PartnerApplicationController],
  providers: [...PARTNER_CATALOG.map((p) => p.service), PartnerApplicationService, StatusConfigService],
})
export class PartnerModule {}
