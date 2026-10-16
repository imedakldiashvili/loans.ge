loans.ge is a loan marketplace for individuals: one application, several offers, one choice. Three surfaces share this system — the customer site, the partner workspace (organisations answer applications) and the admin console (configuration). Everything below is written for an agent building one of them.

## Content fundamentals

- Georgian first, English second. Every string has an English twin; the language toggle must never shift layout — give labels fixed widths or `min-height` and measure both languages (the longest Georgian label sets the width).
- Address the customer as **შენ** (informal second person): "შეავსე განაცხადი", "აირჩიე საუკეთესო შეთავაზება". Wizard step titles may use the polite plural when they read as a question ("რომელი ბანკის სერვისებით სარგებლობთ"). Partner and admin surfaces use neutral imperatives.
- Statuses are sentences, not labels, and always name the object: "განაცხადი გაგზავნილია", "განაცხადზე შეთავაზება დადასტურებულია". Never abbreviate them in the customer cabinet; abbreviate only inside the compare table (✓ / ✕ icons with a title).
- Numbers: amounts as `12 000 ₾` (space thousands, currency after, non-breaking), rates as `12%`, terms as `36 თვე`, dates as `07.10.2026, 12:11`, countdowns as `56:54` (minutes:seconds). Always `font-variant-numeric: tabular-nums` where digits align.
- No emoji in UI. Icons are inline SVG strokes (see Iconography). Copyright line reads exactly `© 2026 loans.ge`.

## Visual foundations

**Colour.** Two brand hues carry meaning: `green` is the action and the positive outcome (primary buttons, selected states, accepted offers); `orange` is the money and the moment that needs the customer (hero title, amounts, pending offers, countdowns, slider). Blue only says "under review"; `red` is the single colour of every decline — filter chip, status, outline buttons, cancel hover. Neutrals are navy-biased (`fg` #343c5c), never pure grey. Surfaces alternate `bg` and `bg-soft` in bands; cards sit on `bg-soft` as `bg` with a `line` border. Dark theme is a token swap, not an inversion: fills stay brand-coloured, grounds go to the navy scale.

**Type.** One family everywhere: Noto Sans Georgian from Google Fonts (`--font-sans`), weights 400/500/600/700. Headings are 600, uppercase with 0.5px tracking only at `hero-title` and `section-title`. Body is 14px/1.6. Buttons and labels are 13px/600. Keep headings `text-wrap: balance`.

**Spacing.** 4px steps (`space-1` … `space-9`), 16px side gutter at every width, 1140px max content width. Cards: 16–18px inner padding; panels: 20px; modal: 28px.

**Radii.** Square-ish controls: 4px on buttons and inputs, 6px on icon buttons and chips, 8px on cards, 10px on the modal. Pills (999px) are reserved for status badges, tags and the countdown. Circles for avatars and radio rings.

**Borders, not shadows.** Cards, inputs and icon buttons are outlined with `line`. Shadows appear only on the two how-it-works cards (`shadow-card`), the currency dropdown and the modal.

**Focus.** Buttons focus with a 2px `orange` outline at 2px offset; inputs, selects and radios with a 2px `green` outline at 0 offset. Never remove it.

**States.** Hover darkens green buttons to `green-dark`, tints ghost buttons with `bg-soft`, colours icon buttons green (or red for danger). Disabled inputs: `bg-soft` ground, `muted` text. Selected chips and range buttons fill with their colour and switch text to `on-accent`.

**Layout.** Header 70px, sticky, `bg` with a `line` bottom border. Content stacks in bands. Cabinet: a two-level navigation above the content (top line: განაცხადები / პროფილი; second line: radio buttons with counts + a green primary on the right), then cards. Tables (compare) use `table-layout: fixed`, a sticky first column of fixed width, and horizontal scroll inside their own wrapper.

**Motion.** 150ms background/transform transitions on buttons, 200ms chevron rotation. Respect `prefers-reduced-motion`.

## Iconography

Inline SVG, 24-unit viewBox, `stroke="currentColor"`, stroke-width 2 (2.5 for chevrons), round caps and joins, rendered at 16–19px. Sources: hand-drawn in the site, Tabler-style. Icons in use: document (applications), archive (closed), user (profile), eye (view), circle-x (cancel/close), circle-check (accept), circle-alert (pending), percent badge (offers), chevron-down/left/right, sun/moon (theme), log-in/log-out, scale (retired). Organisation avatars are 28px circles filled with a per-organisation colour (`#1e63b5 #7b4fb5 #0f9d8a #c0392b #b8860b #2e7d32`) and the last word of the name in `on-accent`, 11px/700.

## Logo

`assets/Logos/logo.png` — the recoloured mark (orange arrows, green notes) on transparent ground, shown at 36px high in the header and footer next to the wordmark "Loans.ge" (green, `.ge` in orange, 20px/700). Do not redraw it; do not place it on orange or green.

## Using this system

Load `tokens.css`, then the Google Fonts link for Noto Sans Georgian. Build with the components in this book; each README says what the consumer provides. For a new surface (partner, admin) reuse: Button, IconButton, StatusBadge, Countdown, Input, Choice, FilterChip, Pager, Card, Modal — and keep the status vocabulary and colours exactly.
