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
  S('interested', 2, 'progress', 60, { customerKa: 'განაცხადი განხილვაშია', customerEn: 'Application under review', partner: 'განხილვაში', chip: 'განხილვაში' }, { revealsContacts: true }),
  S('offer', 3, 'progress', 60, { customerKa: 'შეთავაზება გამოიგზავნა', customerEn: 'Offer sent', partner: 'შეთავაზება გაგზავნილია', chip: 'გაგზავნილი' }, { requiresOffer: true }),
  S('accepted', 4, 'progress', 1440, { customerKa: 'განაცხადზე შეთავაზება დადასტურებულია', customerEn: 'Offer confirmed', partner: 'მომხმარებელმა დაადასტურა', chip: 'დადასტურებული' }, { revealsContacts: true }),
  S('done', 5, 'complete', null, { customerKa: 'შეთავაზება დასრულებული', customerEn: 'Offer completed', partner: 'დასრულებული', chip: 'დასრულებული' }, { requiresIssued: true }),
  // closed before an offer: rejected by the organisation / declined by the customer
  S('rejected', 6, 'canceled', null, { customerKa: 'შეთავაზების გარეშე - უარყოფილია ორგანიზაციის მიერ', customerEn: 'No offer — rejected by the organisation', partner: 'უარყო პარტნიორმა', chip: 'უარყო პარტნიორმა' }),
  S('cancelled', 7, 'canceled', null, { customerKa: 'შეთავაზება გაუქმებულია ორგანიზაციის მიერ', customerEn: 'Offer cancelled by the organisation', partner: 'შეთავაზება გააუქმა პარტნიორმა', chip: 'გააუქმა პარტნიორმა' }),
  S('withdrawn', 8, 'canceled', null, { customerKa: 'შეთავაზების გარეშე - უარყოფილი მომხმარებლის მიერ', customerEn: 'No offer — declined by the customer', partner: 'უარი თქვა მომხმარებელმა', chip: 'უარი თქვა მომხმარებელმა' }),
  S('declined', 9, 'canceled', null, { customerKa: 'შეთავაზება უარყოფილი მომხმარებლის მიერ', customerEn: 'Offer declined by the customer', partner: 'შეთავაზება უარყო მომხმარებელმა', chip: 'გააუქმა მომხმარებელმა' }),
  S('expired', 10, 'canceled', null, { customerKa: 'განაცხადზე შეთავაზების ვადა გავიდა', customerEn: 'Offer expired', partner: 'ვადაგასული', chip: 'ვადაგასული' }, { isExpiryTarget: true }),
];

const T = (from: string[], to: string, by: Actor, reasonKind: ReasonKind | null = null): TransitionDef[] =>
  from.map((f) => ({ from: f, to, by, reasonKind, isEnable: true }));

const IN_PROGRESS = ['sent', 'interested', 'offer', 'accepted'];

export const DEFAULT_TRANSITIONS: TransitionDef[] = [
  ...T(['sent'], 'interested', 'partner'),
  ...T(['interested'], 'offer', 'partner'),
  ...T(['offer'], 'accepted', 'customer'),
  ...T(['accepted'], 'done', 'partner'),
  ...T(['sent', 'interested'], 'rejected', 'partner', 'reject'),
  ...T(['offer', 'accepted'], 'cancelled', 'partner', 'cancel'),
  ...T(['sent', 'interested'], 'withdrawn', 'customer'),
  ...T(['offer', 'accepted'], 'declined', 'customer'),
  ...T(IN_PROGRESS, 'expired', 'system'),
];

export const DEFAULT_STATUS_CONFIG: StatusConfig = { statuses: DEFAULT_STATUSES, transitions: DEFAULT_TRANSITIONS };
