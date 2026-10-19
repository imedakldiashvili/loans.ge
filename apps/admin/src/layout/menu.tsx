import { Icon } from '../ui/icons';

/** Reference panels — URL /refs/:key, API module in brackets. */
export const REF_PANELS: { key: string; label: string; module: string }[] = [
  { key: 'currencies', label: 'ვალუტები', module: 'currency' },
  { key: 'offerTypes', label: 'შეთავაზების ტიპები', module: 'offerType' },
  { key: 'regions', label: 'რეგიონები', module: 'region' },
  { key: 'cities', label: 'ქალაქები', module: 'city' },
  { key: 'districts', label: 'უბნები', module: 'district' },
  { key: 'rejectReasons', label: 'უარის მიზეზები', module: 'rejectReason' },
  { key: 'cancelReasons', label: 'გაუქმების მიზეზები', module: 'cancelReason' },
  { key: 'sectors', label: 'საქმიანობის სფერო', module: 'sector' },
  { key: 'incomes', label: 'შემოსავლის წყარო', module: 'incomeSource' },
  { key: 'creditHistory', label: 'საკრედიტო ისტორია', module: 'creditHistory' },
];

export interface MenuItem {
  path: string;
  label: string;
  icon?: () => JSX.Element;
  /** API module whose TotalCount is shown as the badge */
  count?: string;
}
export interface MenuGroup {
  key: string;
  label: string;
  icon: () => JSX.Element;
  items: MenuItem[];
}

// Collapsible groups; only one is open at a time (prototype MENU).
export const MENU: MenuGroup[] = [
  {
    key: 'main', label: 'მთავარი', icon: Icon.main,
    items: [
      { path: '/monitor', label: 'მონიტორინგი', icon: Icon.monitor },
      { path: '/apps', label: 'განაცხადები', icon: Icon.apps, count: 'application' },
      { path: '/offers', label: 'შეთავაზებები', icon: Icon.offers, count: 'offer' },
      { path: '/orgs', label: 'ორგანიზაციები', icon: Icon.orgs, count: 'organization' },
      { path: '/products', label: 'პროდუქტები', icon: Icon.products, count: 'productType' },
    ],
  },
  { key: 'refs', label: 'ცნობარები', icon: Icon.refs, items: REF_PANELS.map((r) => ({ path: `/refs/${r.key}`, label: r.label, count: r.module })) },
  {
    key: 'users', label: 'მომხმარებლები', icon: Icon.users,
    items: [
      { path: '/users/customers', label: 'მომხმარებლები', count: 'customer' },
      { path: '/users/staff', label: 'თანამშრომლები', count: 'staff' },
      { path: '/users/admins', label: 'ადმინისტრატორები', count: 'admin' },
    ],
  },
  {
    key: 'settings', label: 'პარამეტრები', icon: Icon.settings,
    items: [
      { path: '/settings/statuses', label: 'სტატუსები', count: 'status' },
      { path: '/settings/transitions', label: 'გადასვლები', count: 'statusTransition' },
      { path: '/settings/otp', label: 'OTP პარამეტრები' },
      { path: '/settings/pin', label: 'PIN-კოდი' },
      { path: '/settings/notify', label: 'შეტყობინებები' },
    ],
  },
  {
    key: 'integration', label: 'ინტეგრაცია', icon: Icon.orgs,
    items: [
      { path: '/integration/keys', label: 'API გასაღებები' },
      { path: '/integration/webhooks', label: 'webhook-ების ლოგი' },
    ],
  },
  {
    key: 'logs', label: 'ლოგები', icon: Icon.list,
    items: [
      { path: '/logs/actions', label: 'ქმედებების ლოგი' },
      { path: '/logs/jobs', label: 'ჯობების ლოგი' },
    ],
  },
];

export const groupOf = (path: string) => MENU.find((g) => g.items.some((i) => path === i.path || path.startsWith(i.path + '/')))?.key;
