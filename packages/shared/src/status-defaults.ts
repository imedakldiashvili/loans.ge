// Initial statuses and transitions — written to the database by the seed, then edited from the admin console.
// Texts come from the prototypes (admin.html `settingsDefault`).
import type { Actor, ReasonKind, StatusConfig, StatusDef, TransitionDef } from './status';

const S = (
  key: string,
  sort: number,
  category: StatusDef['category'],
  ttlMinutes: number | null,
  labels: StatusDef['labels'],
  flags: StatusDef['flags'] = {},
): StatusDef => ({ key, sort, category, ttlMinutes, labels, flags, isEnable: true });

export const DEFAULT_STATUSES: StatusDef[] = [
  S('sent', 1, 'progress', 60, { customerKa: 'განაცხადი გაგზავნილია', customerEn: 'Application sent', partner: 'შემოსული', chip: 'შემოსული' }, { hidesPersonalData: true }),
  S('interested', 2, 'progress', 60, { customerKa: 'განაცხადი განხილვაშია', customerEn: 'Application under review', partner: 'განხილვაში', chip: 'განხილვაში' }),
  S('offer', 3, 'progress', 60, { customerKa: 'განაცხადზე შეთავაზება გამოგზავნილია', customerEn: 'Offer sent', partner: 'შეთავაზება გაგზავნილია', chip: 'გაგზავნილი' }, { requiresOffer: true }),
  S('accepted', 4, 'progress', 1440, { customerKa: 'განაცხადზე შეთავაზება დადასტურებულია', customerEn: 'Offer confirmed', partner: 'მომხმარებელმა დაადასტურა', chip: 'დადასტურებული' }, { revealsContacts: true }),
  S('done', 5, 'complete', null, { customerKa: 'განაცხადზე შეთავაზება დასრულდა', customerEn: 'Offer completed', partner: 'დასრულებული', chip: 'დასრულებული' }, { requiresIssued: true }),
  S('cancelled', 6, 'canceled', null, { customerKa: 'განაცხადზე შეთავაზება გაუქმებულია', customerEn: 'Offer cancelled', partner: 'გააუქმა პარტნიორმა', chip: 'გააუქმა პარტნიორმა' }),
  S('declined', 7, 'canceled', null, { customerKa: 'განაცხადზე შეთავაზება უარყოფილია', customerEn: 'Offer declined', partner: 'გააუქმა მომხმარებელმა', chip: 'გააუქმა მომხმარებელმა' }),
  S('expired', 8, 'canceled', null, { customerKa: 'განაცხადზე შეთავაზების ვადა გავიდა', customerEn: 'Offer expired', partner: 'ვადაგასული', chip: 'ვადაგასული' }, { isExpiryTarget: true }),
];

const T = (from: string[], to: string, by: Actor, reasonKind: ReasonKind | null = null): TransitionDef[] =>
  from.map((f) => ({ from: f, to, by, reasonKind, isEnable: true }));

const IN_PROGRESS = ['sent', 'interested', 'offer', 'accepted'];

export const DEFAULT_TRANSITIONS: TransitionDef[] = [
  ...T(['sent'], 'interested', 'partner'),
  ...T(['interested'], 'offer', 'partner'),
  ...T(['offer'], 'accepted', 'customer'),
  ...T(['accepted'], 'done', 'partner'),
  ...T(['sent', 'interested'], 'cancelled', 'partner', 'reject'),
  ...T(['offer', 'accepted'], 'cancelled', 'partner', 'cancel'),
  ...T(IN_PROGRESS, 'declined', 'customer'),
  ...T(IN_PROGRESS, 'expired', 'system'),
];

export const DEFAULT_STATUS_CONFIG: StatusConfig = { statuses: DEFAULT_STATUSES, transitions: DEFAULT_TRANSITIONS };
