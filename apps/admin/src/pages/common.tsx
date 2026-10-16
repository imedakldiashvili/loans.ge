import logo from '../assets/logo.png';

// Shared view helpers and API row types.

export const CATEGORIES: Record<string, { ka: string; en: string }> = {
  bank: { ka: 'ბანკი', en: 'Bank' },
  mfo: { ka: 'მიკროსაფინანსო', en: 'Microfinance' },
  leasing: { ka: 'სალიზინგო', en: 'Leasing' },
  lender: { ka: 'სესხის გამცემი სუბიექტი', en: 'Lending entity' },
};

export interface OrgLite {
  ID: number;
  UID: string;
  NameKa: string;
  NameEn: string;
  Category: string;
  Color: string | null;
  LogoPath: string | null;
}

/** Uploaded files are served at /fs/{key}. */
export const fsUrl = (key: string) => `/fs/${key}`;

/** Organisation logo; without one — the loans.ge logo (prototype `orgMark`). */
export const OrgMark = ({ org, cls = '' }: { org?: Partial<OrgLite> | null; cls?: string }) =>
  org?.LogoPath ? (
    <span className={`olg ${cls}`}>
      <img src={fsUrl(org.LogoPath)} alt="" />
    </span>
  ) : (
    <span className={`olg tmp ${cls}`} title="დროებითი ლოგო (loans.ge)">
      <img src={logo} alt="" />
    </span>
  );

export interface StatusRow {
  ID: number;
  UID: string;
  Key: string;
  CustomerKa: string;
  CustomerEn: string;
  PartnerLabel: string;
  ChipLabel: string;
  Category: 'progress' | 'complete' | 'canceled';
  Color: string | null;
  TtlMinutes: number | null;
  Sort: number;
  IsEnable: boolean;
  HidesPersonalData: boolean;
  RevealsContacts: boolean;
  RequiresOffer: boolean;
  RequiresIssued: boolean;
  IsExpiryTarget: boolean;
}

export const STATUS_CATEGORIES = [
  { key: 'progress', en: 'In Progress', ka: 'მიმდინარე' },
  { key: 'complete', en: 'Complete', ka: 'დასრულებული' },
  { key: 'canceled', en: 'Canceled', ka: 'გაუქმებული' },
] as const;

/** Status colours from the prototype (CSS variables); a colour set on the status wins. */
export const ST_COLOR: Record<string, string> = {
  sent: 'var(--orange)', interested: 'var(--amber)', offer: 'var(--sky)', accepted: 'var(--blue)', done: 'var(--green)',
  rejected: 'var(--grey-status)', cancelled: 'var(--grey-status)', withdrawn: 'var(--grey-status)', declined: 'var(--grey-status)', expired: 'var(--grey-status)',
};
export const statusColor = (s?: Pick<StatusRow, 'Key' | 'Color'> | null, key?: string) => s?.Color || ST_COLOR[s?.Key ?? key ?? ''] || 'var(--grey-status)';

/** Status badge (prototype `.st`). */
export const StBadge = ({ status, statuses, which = 'PartnerLabel' }: { status: string; statuses?: StatusRow[]; which?: 'PartnerLabel' | 'ChipLabel' | 'CustomerKa' }) => {
  const s = statuses?.find((x) => x.Key === status);
  return <span className={`st ${status}`}>{s ? s[which] : status}</span>;
};

export const ROLES: Record<string, string> = { sales: 'გაყიდვების მენეჯერი', back: 'ბექ-ოფისი' };
