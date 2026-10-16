import { Module } from '@nestjs/common';
import { z } from 'zod';
import { CrudConfig, crudModuleParts } from '../core/crud';

// public gateway — read-only reference data for the partner cabinet and the customer site:
// only enabled, non-deleted rows; find + detail. Changes are made in the admin console.

const ro = (module: string, model: string, extra: Partial<CrudConfig> = {}): CrudConfig => ({
  gateway: 'public', module, model, schema: z.object({}), actions: ['find', 'detail'],
  scope: { isEnable: true, ...(extra.scope ?? {}) }, defaultSort: [{ field: 'sort', dir: 'asc' }], ...extra,
});

const ITEM_KINDS: Record<string, string> = {
  offerType: 'offer_type', rejectReason: 'reject_reason', cancelReason: 'cancel_reason',
  sector: 'sector', incomeSource: 'income_source', creditHistory: 'credit_history',
};

const configs: CrudConfig[] = [
  ro('currency', 'currency', { searchFields: ['code'] }),
  ro('region', 'region', { searchFields: ['nameKa', 'nameEn'] }),
  ro('city', 'city', { searchFields: ['nameKa', 'nameEn'], filterFields: ['regionId'] }),
  ro('district', 'district', { searchFields: ['nameKa', 'nameEn'], filterFields: ['cityId'] }),
  ...Object.entries(ITEM_KINDS).map(([module, kind]) => ro(module, 'referenceItem', { scope: { isEnable: true, kind }, searchFields: ['nameKa', 'nameEn'] })),
  ro('productType', 'productType', { searchFields: ['nameKa', 'nameEn'] }),
  ro('productTypeField', 'productTypeField', { filterFields: ['productTypeId'] }),
  // texts and categories for every surface; behaviour flags stay server-side
  ro('status', 'status'),
  // product types it accepts — the wizard lists only organisations that take the chosen loan
  ro('organization', 'organization', {
    searchFields: ['nameKa', 'nameEn'], filterFields: ['category', 'isPartner'],
    include: { productTypes: { where: { isDeleted: false }, select: { productTypeId: true } } },
  }),
];

const parts = configs.map(crudModuleParts);

@Module({ controllers: parts.map((p) => p.controller), providers: parts.map((p) => p.service) })
export class PublicReferencesModule {}
