import { Module } from '@nestjs/common';
import { StatusConfigService } from '../core/status-config';
import { PartnerApplicationController, PartnerApplicationService } from './applications';
import { PARTNER_CATALOG } from './catalog';
import { PartnerOfferController, PartnerOfferService } from './offers';

/** partner gateway (= integration API): catalogue, staff, applications, sent offers (back office). */
@Module({
  controllers: [...PARTNER_CATALOG.map((p) => p.controller), PartnerApplicationController, PartnerOfferController],
  providers: [...PARTNER_CATALOG.map((p) => p.service), PartnerApplicationService, PartnerOfferService, StatusConfigService],
})
export class PartnerModule {}
