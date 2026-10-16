// One-off: extracts the demo data defaults from prototype/admin.html into prisma/seed-data/prototype.json.
// Evaluates the prototype script up to the point where it starts using the DOM/storage, with minimal stubs.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../../prototype/admin.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const cut = script.indexOf('  const DB = {');
if (cut < 0) throw new Error('DB marker not found');
const prefix = script.slice(0, cut);
const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
const document = { documentElement: el(), getElementById: el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: el, body: el() };
const window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const fn = new Function('document', 'window', 'localStorage', 'matchMedia',
  prefix + '\nreturn { orgs: orgsDefault(), productTypes: productsDefault(), refs: refsDefault(), settings: settingsDefault(), admins: adminsDefault(), customers: customersDefault(), staffNames: STAFF_NAMES, staff: orgsDefault().filter(o => o.partner !== false).map((o, i) => ({ org: o.id, list: seedStaff(o.name, i) })), partnerTemplates: PARTNER_TEMPLATES, demoApps: demoAppsDefault() };');
const data = fn(document, window, window.localStorage, window.matchMedia);
const out = path.join(__dirname, 'seed-data/prototype.json');
fs.writeFileSync(out, JSON.stringify(data, null, 2));
console.log('written', out, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v])));
