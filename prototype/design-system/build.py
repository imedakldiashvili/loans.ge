# -*- coding: utf-8 -*-
import os, json, datetime
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'project')
def w(path, text):
    p = os.path.join(ROOT, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='\n').write(text)

LOGO = '/_blob/b1bd547f06580df8130bcb6e3d83f94d'
FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;500;600;700&display=swap">'
BASE = FONT + '<style>body{margin:0;padding:16px;background:var(--bg);color:var(--fg-body);font-family:var(--font-sans);font-size:14px;line-height:1.6}*{box-sizing:border-box}.row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}</style>'

# ---------------- tokens ----------------
C = lambda n, l, d, u: {"name": n, "value": {"light": l, "dark": d}, "usage": u}
tokens = {
 "name": "loans.ge", "version": 1,
 "meta": {"source": "D:/MM/loans-ge.html (customer web, v375)"},
 "color": {
  "themes": [{"id": "light", "name": "Light"}, {"id": "dark", "name": "Dark"}],
  "tokens": [
   C("bg", "#ffffff", "#151826", "Page, header, cards, inputs, modal. Default ground for `fg` and `fg-body`."),
   C("bg-soft", "#f8fafd", "#1b1f30", "Hero band, advantages band, cabinet background, group headers, disabled inputs, hover on ghost buttons."),
   C("card", "#f0f2fa", "#222740", "Reserved tint for inset panels; rarely used."),
   C("fg", "#343c5c", "#e8ebf5", "Headings, labels, control text. 9.3:1 on `bg`, 8.7:1 on `bg-soft` (light)."),
   C("fg-body", "#333333", "#d5d9e6", "Running body copy on `bg`."),
   C("muted", "#808080", "#9aa0b8", "Secondary text: captions, dates, ticks, placeholders. 3.9:1 on `bg` — use at 13px+ only for non-essential text; the site keeps it from the source."),
   C("line", "#e3e7f1", "#2e3450", "Hairline borders of cards, inputs, icon buttons, dividers, inactive radio rings."),
   C("green", "#5ebb47", "#6cc955", "Brand green: primary buttons (`btn-green`), stats numbers, selected radio, active tab text, accepted status. White text on it is 2.6:1 — the source keeps it; prefer `green-dark` for text on `bg`."),
   C("green-dark", "#4ca538", "#5ebb47", "Hover of green buttons."),
   C("green-soft", "#e8f6e3", "#1f3320", "Tint behind green text: active nav item, success badges."),
   C("orange", "#f47429", "#f98a47", "Brand orange: hero title, amounts, slider fill, focus ring on buttons, pending-offer status, countdown digits."),
   C("orange-soft", "#fdeee4", "#3a2a20", "Tint behind orange text: pending badges, countdown pill, selected currency row."),
   C("hero", "#343c5c", "#343c5c", "Deep navy of the hero illustration and shadows (rgba 52,60,92)."),
   C("red", "#d9534f", "#f08a86", "Every \"decline\" element: declined/rejected status text, red outline buttons, cancel icon hover, countdown at 00:00."),
   C("red-soft", "#fdecec", "#3a2222", "Tint behind red text: declined badges, expired countdown pill."),
   C("blue", "#1e63b5", "#6ea3e6", "\"Under review\" status text."),
   C("blue-soft", "#e6eef9", "#1c2a40", "Tint behind blue status text."),
   C("done", "#e8eaf2", "#2e3450", "Tint behind the \"completed\" status (text `fg`)."),
   C("grey-status", "#8a8f9f", "#8a8f9f", "Text of the \"cancelled\" status (struck through) and disabled pager arrows."),
   C("on-accent", "#ffffff", "#ffffff", "Text and glyphs on `green`, `orange`, `red` and `blue` fills, and inside organisation avatars."),
   C("overlay", "rgba(20,24,40,0.6)", "rgba(20,24,40,0.7)", "Modal backdrop (with 3px blur).")
  ]},
 "type": {
  "fonts": [],
  "families": {"sans": "\"Noto Sans Georgian\", \"FiraGO\", \"Helvetica Neue\", Arial, sans-serif"},
  "groups": [
   {"name": "Headings", "family": "sans", "styles": [
     {"name": "hero-title", "fontSize": "30px", "lineHeight": 1.25, "fontWeight": 600, "letterSpacing": "0.5px", "sample": "აირჩიე საუკეთესო შეთავაზება", "usage": "Hero h1, uppercase, in `orange`."},
     {"name": "section-title", "fontSize": "22px", "lineHeight": 1.3, "fontWeight": 600, "letterSpacing": "0.5px", "sample": "შეთავაზებები", "usage": "Section and page titles, uppercase, centered, `fg`."},
     {"name": "card-title", "fontSize": "18px", "lineHeight": 1.3, "fontWeight": 600, "sample": "სამომხმარებლო სესხი", "usage": "Product name on an application card."},
     {"name": "step-title", "fontSize": "20px", "lineHeight": 1.3, "fontWeight": 700, "sample": "შეავსე განაცხადი", "usage": "Titles of the two how-it-works cards."},
     {"name": "panel-title", "fontSize": "16px", "lineHeight": 1.4, "fontWeight": 700, "sample": "დაგვიკავშირდით", "usage": "Footer column headings, dialog titles, profile sections (15px)."}
   ]},
   {"name": "Text", "family": "sans", "styles": [
     {"name": "body", "fontSize": "14px", "lineHeight": 1.6, "fontWeight": 400, "sample": "ერთი განაცხადით რამდენიმე ორგანიზაციიდან იღებ შეთავაზებებს.", "usage": "Default body copy, radio labels, profile rows."},
     {"name": "body-lg", "fontSize": "15px", "lineHeight": 1.5, "fontWeight": 400, "sample": "შეიყვანე ელ. ფოსტა", "usage": "Input text, selects, step card paragraphs, terms pages."},
     {"name": "small", "fontSize": "13px", "lineHeight": 1.5, "fontWeight": 500, "sample": "მომხმარებლის სახელი", "usage": "Form labels, buttons, menu links, table cells, footer, countdown digits."},
     {"name": "caption", "fontSize": "12px", "lineHeight": 1.4, "fontWeight": 600, "sample": "განაცხადი განხილვაშია", "usage": "Status badges, dates under amounts, table (dense) cells."},
     {"name": "micro", "fontSize": "11px", "lineHeight": 1.3, "fontWeight": 700, "sample": "ქარ EN", "usage": "Language toggle, slider ticks, range buttons, avatar initials."}
   ]},
   {"name": "Numbers", "family": "sans", "styles": [
     {"name": "amount", "fontSize": "24px", "lineHeight": 1, "fontWeight": 700, "sample": "12 000 ₾", "usage": "Loan amount on cards and stats; always `font-variant-numeric: tabular-nums`, thousands separated by a space."},
     {"name": "amount-form", "fontSize": "22px", "lineHeight": 1, "fontWeight": 400, "sample": "1 000 000 ₾", "usage": "Amount readout in the quick form, `orange`, right-aligned, min-width 102px."}
   ]}
  ]},
 "spacing": {"tokens": [
   {"name": "space-1", "value": "4px", "usage": "Gap between grouped buttons, chip padding."},
   {"name": "space-2", "value": "8px", "usage": "Header item gap, icon-button gap, countdown-to-icon gap."},
   {"name": "space-3", "value": "12px", "usage": "Card grid gap, row gap in detail lists, nav box gap."},
   {"name": "space-4", "value": "16px", "usage": "Page side gutter, card inner padding, modal gutter, form field gap."},
   {"name": "space-5", "value": "20px", "usage": "Panel padding, step card side padding."},
   {"name": "space-6", "value": "24px", "usage": "Section inner spacing, footer bottom gap."},
   {"name": "space-7", "value": "28px", "usage": "Modal padding, advantages grid gap, footer column gap."},
   {"name": "space-8", "value": "36px", "usage": "Below section titles."},
   {"name": "space-9", "value": "48px", "usage": "Hero top padding, section block padding."},
   {"name": "control-h", "value": "36px", "usage": "Header controls (language, login, user, logout)."},
   {"name": "icon-btn", "value": "34px", "usage": "Square icon buttons on cards and rows."},
   {"name": "wrap", "value": "1140px", "usage": "Max content width (`.wrap`)."}
 ]},
 "radius": {"tokens": [
   {"name": "radius-xs", "value": "3px", "usage": "Inner highlight of the language toggle."},
   {"name": "radius-sm", "value": "4px", "usage": "Buttons, inputs, selects, step cards, stepper squares, amount box."},
   {"name": "radius-md", "value": "6px", "usage": "Icon buttons, status group boxes, dropdown lists, filter chips, pager."},
   {"name": "radius-lg", "value": "8px", "usage": "Cards, panels, nav boxes, compare table wrapper."},
   {"name": "radius-xl", "value": "10px", "usage": "Modal box."},
   {"name": "radius-pill", "value": "999px", "usage": "Status badges, tags, countdown pill."},
   {"name": "radius-circle", "value": "50%", "usage": "Avatars, radio rings, social icons, slider thumb."}
 ]},
 "shadow": {"tokens": [
   {"name": "shadow-card", "value": {"light": "0 6px 24px rgba(52,60,92,0.16), 0 1px 4px rgba(52,60,92,0.08)", "dark": "0 6px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4)"}, "usage": "How-it-works step cards and advantage cards."},
   {"name": "shadow-dropdown", "value": {"light": "0 8px 20px rgba(52,60,92,0.14)", "dark": "0 8px 20px rgba(0,0,0,0.5)"}, "usage": "Currency dropdown list."},
   {"name": "shadow-modal", "value": "0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)", "usage": "Modal box over the overlay."}
 ]}
}
w('tokens.json', json.dumps(tokens, ensure_ascii=False, indent=1))

# ---------------- README ----------------
w('README.md', """loans.ge is a loan marketplace for individuals: one application, several offers, one choice. Three surfaces share this system — the customer site, the partner workspace (organisations answer applications) and the admin console (configuration). Everything below is written for an agent building one of them.

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
""")

# ---------------- components ----------------
def comp(name, group, height, readme, body, subtitle=""):
    sub = f' subtitle="{subtitle}"' if subtitle else ''
    w(f'components/{name}/README.md', readme)
    w(f'components/{name}/preview.html', f'<!-- @dsCard group="{group}" height={height}{sub} -->\n' + BASE + body)

comp('Button', 'Actions', 120,
"""Buttons carry the one action of a view; green is primary, orange is the hero call-to-action, ghost is secondary, red outline is decline.

Consumer provides: the label (13px/600, Georgian with English twin), the variant, optional leading icon (16px), `disabled`. Height 40px (10px vertical padding), 22px horizontal padding, 4px radius, no border on filled variants. `full` stretches to the container width (used in the quick form and dialogs, 12px vertical padding, 14px text). Do: one green button per view; red outline only for declining an offer; ghost for "უკან". Don't: put two filled buttons side by side; use orange outside the hero/quick form.""",
"""<style>.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 22px;border-radius:var(--radius-sm);font:inherit;font-weight:600;font-size:13px;cursor:pointer;border:1px solid transparent;white-space:nowrap}.btn:focus-visible{outline:2px solid var(--orange);outline-offset:2px}.g{background:var(--green);color:var(--on-accent)}.g:hover{background:var(--green-dark)}.o{background:var(--orange);color:var(--on-accent)}.gh{background:transparent;color:var(--fg);border-color:var(--line)}.gh:hover{background:var(--bg-soft)}.r{background:transparent;color:var(--red);border-color:var(--red)}.r:hover{background:var(--red-soft)}.btn:disabled{opacity:.5;cursor:not-allowed}</style>
<div class="row"><button class="btn g">შეავსე განაცხადი</button><button class="btn o">+ ახალი განაცხადი</button><button class="btn gh">უკან</button><button class="btn r">უარი</button><button class="btn g" disabled>კოდის გაგზავნა</button></div>""")

comp('IconButton', 'Actions', 100,
"""Square 34px outlined buttons for row and card actions: view, cancel, offers, close.

Consumer provides: a 19px stroke icon, `title` and `aria-label` (the same Georgian verb), and a role class: default (hover green), `danger` (hover red), `good` (hover green, for offers). Ground `bg`, border `line`, radius 6px, icon colour `muted` at rest. Several sit in a row with 8px gap, right-aligned in their row. Don't: use text inside; use for primary actions.""",
"""<style>.ib{width:34px;height:34px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--bg);color:var(--muted);cursor:pointer;display:grid;place-items:center}.ib svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.ib:hover{border-color:var(--green);color:var(--green)}.ib.danger:hover{border-color:var(--red);color:var(--red)}.ib:focus-visible{outline:2px solid var(--orange)}.lbl{font-size:12px;color:var(--muted);margin-top:4px;text-align:center}</style>
<div class="row" style="gap:20px">
<div><button class="ib good" title="შეთავაზებები"><svg viewBox="0 0 24 24"><path d="M5 7.2A2.2 2.2 0 0 1 7.2 5h1a2.2 2.2 0 0 0 1.55-.64l.7-.7a2.2 2.2 0 0 1 3.12 0l.7.7c.42.41.97.64 1.55.64h1a2.2 2.2 0 0 1 2.2 2.2v1c0 .58.23 1.13.64 1.55l.7.7a2.2 2.2 0 0 1 0 3.12l-.7.7a2.2 2.2 0 0 0-.64 1.55v1a2.2 2.2 0 0 1-2.2 2.2h-1a2.2 2.2 0 0 0-1.55.64l-.7.7a2.2 2.2 0 0 1-3.12 0l-.7-.7a2.2 2.2 0 0 0-1.55-.64h-1a2.2 2.2 0 0 1-2.2-2.2v-1a2.2 2.2 0 0 0-.64-1.55l-.7-.7a2.2 2.2 0 0 1 0-3.12l.7-.7A2.2 2.2 0 0 0 5 8.2z"/><path d="M9 15l6-6"/></svg></button><div class="lbl">შეთავაზებები</div></div>
<div><button class="ib" title="ნახვა"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button><div class="lbl">ნახვა</div></div>
<div><button class="ib danger" title="გაუქმება"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg></button><div class="lbl">გაუქმება</div></div>
</div>""")

comp('StatusBadge', 'Feedback', 200,
"""The eight offer/application statuses as pills; colour encodes who must act next.

Consumer provides: the status key. Text is the full Georgian sentence from the vocabulary (`offer` განაცხადზე შეთავაზება დასადასტურებელია · `interested` განაცხადი განხილვაშია · `sent` განაცხადი გაგზავნილია · `accepted` განაცხადზე შეთავაზება დადასტურებულია · `done` განაცხადზე შეთავაზება დასრულდა · `declined` განაცხადზე შეთავაზება უარყოფილია · `rejected` განაცხადი უარყოფილია · `cancelled` განაცხადზე შეთავაზება გაუქმებულია). 12px/600, 4px 10px padding, 999px radius, `nowrap`. Orange = customer must act, green = accepted, blue = organisation is reviewing, red = any decline, grey struck-through = cancelled. Inside a group header the badge loses its fill and keeps only the colour. Display order in a card: offer, interested, sent, accepted, done, declined, rejected, cancelled.""",
"""<style>.st{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:var(--radius-pill);white-space:nowrap}.offer{background:var(--orange-soft);color:var(--orange)}.interested{background:var(--blue-soft);color:var(--blue)}.sent{background:var(--bg-soft);color:var(--muted);border:1px solid var(--line)}.accepted{background:var(--green);color:var(--on-accent)}.done{background:var(--done);color:var(--fg)}.declined,.rejected{background:var(--red-soft);color:var(--red)}.cancelled{background:var(--bg-soft);color:var(--grey-status);text-decoration:line-through}</style>
<div class="row" style="gap:8px"><span class="st offer">განაცხადზე შეთავაზება დასადასტურებელია</span><span class="st interested">განაცხადი განხილვაშია</span><span class="st sent">განაცხადი გაგზავნილია</span><span class="st accepted">განაცხადზე შეთავაზება დადასტურებულია</span><span class="st done">განაცხადზე შეთავაზება დასრულდა</span><span class="st declined">განაცხადზე შეთავაზება უარყოფილია</span><span class="st rejected">განაცხადი უარყოფილია</span><span class="st cancelled">განაცხადზე შეთავაზება გაუქმებულია</span></div>""")

comp('Countdown', 'Feedback', 90,
"""A one-hour countdown pill shown before the action icons of a pending offer or a sent application.

Consumer provides: the start timestamp; the pill renders `mm:ss` of `start + 60 min − now`, ticking every second, stopping at `00:00`. 28px high, 9px side padding, 999px radius, `orange-soft` ground, `orange` 1px border and 13px/700 tabular digits; at zero it turns `red` / `red-soft`. Title: "დასადასტურებლად დარჩენილი დრო" (offers) or "პასუხისთვის დარჩენილი დრო" (sent). Don't: show hours; show it on accepted or declined rows.""",
"""<style>.cd{display:inline-flex;align-items:center;height:28px;padding:0 9px;border:1px solid var(--orange);border-radius:var(--radius-pill);background:var(--orange-soft);color:var(--orange);font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}.cd.over{color:var(--red);border-color:var(--red);background:var(--red-soft)}</style>
<div class="row" style="gap:16px"><span class="cd" id="a">56:54</span><span class="cd" id="b">04:54</span><span class="cd over">00:00</span></div>
<script>let a=56*60+54,b=4*60+54;const f=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');setInterval(()=>{a=Math.max(0,a-1);b=Math.max(0,b-1);document.getElementById('a').textContent=f(a);document.getElementById('b').textContent=f(b);},1000);</script>""")

comp('Input', 'Forms', 230,
"""Text inputs, selects and the phone field: 4px radius, `line` border, 15px text, 11px 14px padding, green focus ring.

Consumer provides: a 13px/500 label above (6px gap), placeholder in `muted`, validation state. Phone: a `+995` prefix cell on `bg-soft` joined to the input, 9 digits, `tabular-nums`. Disabled: `bg-soft` ground, `muted` text, `not-allowed` cursor. Selects hide the native arrow and draw a chevron at the right (44px right padding). One-time code: the same field, centred digits, with the timer inside the field at the right. Don't: use rounded (pill) inputs; put labels inside the field.""",
"""<style>.f{display:grid;gap:6px;max-width:320px}.f label{font-size:13px;font-weight:500;color:var(--fg)}.in{width:100%;font:inherit;font-size:15px;padding:11px 14px;border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--bg);color:var(--fg)}.in:focus{outline:2px solid var(--green);outline-offset:0;border-color:var(--green)}.in::placeholder{color:var(--muted)}.in:disabled{background:var(--bg-soft);color:var(--muted);cursor:not-allowed}.ph{display:flex}.ph span{display:flex;align-items:center;padding:0 12px;border:1px solid var(--line);border-right:0;border-radius:4px 0 0 4px;background:var(--bg-soft);color:var(--muted);font-weight:600;font-size:14px}.ph .in{border-radius:0 4px 4px 0;font-variant-numeric:tabular-nums}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}</style>
<div class="grid"><div class="f"><label for="e">ელ. ფოსტა</label><input class="in" id="e" placeholder="name@example.com"></div><div class="f"><label for="p">მობილური</label><div class="ph"><span>+995</span><input class="in" id="p" placeholder="5XX XXX XXX"></div></div><div class="f"><label for="d">უბანი</label><input class="in" id="d" value="საბურთალო" disabled></div><div class="f"><label for="n">პირადი ნომერი</label><input class="in" id="n" value="01011234567"></div></div>""")

comp('Choice', 'Forms', 200,
"""Radio and checkbox rows: a 20px ring or square with a green fill, inside an outlined row (`opt-row`) or inline (`cab-radio`).

Consumer provides: the option label, `name`, checked state. Row form: 12px 16px padding, `bg` ground, `line` border, 6px radius, border turns green when checked; radios show a 10px green dot, checkboxes fill green with a white tick. Inline form (cabinet tabs): no ground, 42px row, label turns green and 600 when selected, optional count in parentheses in `muted`. Focus: 2px orange outline on the ring. Don't: mix radio and checkbox in one list; hide the native control without keeping it focusable.""",
"""<style>.opt{display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-md);font-size:14px;font-weight:500;color:var(--fg);cursor:pointer;margin-bottom:8px;max-width:360px}.opt:has(input:checked){border-color:var(--green)}.opt input,.cr input{position:absolute;opacity:0;width:0;height:0}.opt i,.cr i{width:20px;height:20px;border:2px solid var(--line);border-radius:50%;display:grid;place-items:center;flex:none}.opt i::after,.cr i::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--green);transform:scale(0)}.opt input:checked+i,.cr input:checked+i{border-color:var(--green)}.opt input:checked+i::after,.cr input:checked+i::after{transform:scale(1)}.chk i{border-radius:4px}.chk i::after{width:10px;height:6px;border-radius:0;background:none;border-left:2.5px solid var(--on-accent);border-bottom:2.5px solid var(--on-accent);transform:rotate(-45deg) translate(1px,-1px) scale(0)}.chk input:checked+i{background:var(--green)}.chk input:checked+i::after{transform:rotate(-45deg) translate(1px,-1px) scale(1)}.cr{display:inline-flex;align-items:center;gap:10px;padding:0 14px;height:42px;font-size:14px;font-weight:500;color:var(--fg);cursor:pointer}.cr:has(input:checked){color:var(--green);font-weight:600}.cr .rc{color:var(--muted);font-weight:500}.cr:has(input:checked) .rc{color:var(--green)}</style>
<label class="opt"><input type="radio" name="c" checked><i></i>პოზიტიური</label><label class="opt chk"><input type="checkbox" checked><i></i>ბანკი A</label>
<div><label class="cr"><input type="radio" name="v" checked><i></i>მიმდინარე <span class="rc">(3)</span></label><label class="cr"><input type="radio" name="v"><i></i>დასრულებული <span class="rc">(7)</span></label></div>""")

comp('FilterChip', 'Navigation', 90,
"""Multi-select status filters above the offers table; each chip carries an icon, a label and a count.

Consumer provides: the status set, counts, selected set. 8px 14px padding, 6px radius, 13px/600, 16px icon before the label, count in a 20px box after it. Rest: white ground, coloured text and border in the status colour (orange pending, green accepted, red declined). Selected: filled with that colour, text `on-accent`, count box at 22% white. Right-aligned, 8px gap. Several may be on at once; none on shows the empty message.""",
"""<style>.c{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid;border-radius:var(--radius-md);background:var(--bg);font:inherit;font-size:13px;font-weight:600;cursor:pointer}.c svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.c .n{min-width:22px;height:20px;padding:0 6px;display:grid;place-items:center;border-radius:5px;background:var(--bg-soft);color:var(--fg);font-size:12px}.o{color:var(--orange);border-color:var(--orange)}.g{color:var(--green);border-color:var(--green)}.r{color:var(--red);border-color:var(--red)}.on{color:var(--on-accent)}.o.on{background:var(--orange)}.g.on{background:var(--green)}.r.on{background:var(--red)}.on .n{background:rgba(255,255,255,.22);color:var(--on-accent)}</style>
<div class="row" style="justify-content:flex-end"><button class="c o on"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>დასადასტურებელი<span class="n">6</span></button><button class="c g on"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>დადასტურებული<span class="n">1</span></button><button class="c r"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>უარყოფილი<span class="n">1</span></button></div>""")

comp('Pager', 'Navigation', 80,
"""Page switcher under a list of five cards per page: arrow, page numbers, arrow.

Consumer provides: page count and current page. 34px squares, 6px radius, `line` border, 13px/600 tabular digits, 6px gap, centred, 18px above. Current page fills green with `on-accent` text and is not clickable; edge arrows disable at 40% opacity. Hidden when there is one page. Switching scrolls to the top of the list.""",
"""<style>.pg{display:flex;justify-content:center;gap:6px}.p{min-width:34px;height:34px;padding:0 10px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--bg);color:var(--fg);font:inherit;font-size:13px;font-weight:600;cursor:pointer;display:grid;place-items:center;font-variant-numeric:tabular-nums}.p svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.p:hover:not(:disabled){border-color:var(--green);color:var(--green)}.p.on{background:var(--green);border-color:var(--green);color:var(--on-accent)}.p:disabled{opacity:.4;cursor:default}</style>
<div class="pg"><button class="p" disabled><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button><button class="p on">1</button><button class="p">2</button><button class="p">3</button><button class="p"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>""")

comp('Card', 'Layout', 330,
"""The application card: a summary row (icon, product, applicant, amount, date, actions) and an expandable detail with offers grouped by status.

Consumer provides: product name (`card-title`), applicant name (13px), amount (`amount`, `fg`, `on-accent` white in dark), date (12px `muted`, "07.10.2026, 12:11"), the action icon buttons (offers, view, close) and the grouped offer rows. Ground `bg`, `line` border, 8px radius, 16px 18px padding, 12px between cards. The chevron bar (26px) toggles the detail; detail groups are boxes with a `bg-soft` header holding the status (coloured text, no fill), a count box and a chevron; rows are 28px avatar + name + right-aligned countdown and icon buttons, separated by `line` hairlines. Current applications open expanded; closed ones collapsed.""",
"""<style>.card{max-width:640px;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden}.sum{display:grid;grid-template-columns:auto 1fr auto auto;gap:16px;align-items:center;padding:16px 18px}.ico{width:40px;height:40px;border-radius:var(--radius-lg);background:var(--green-soft);color:var(--green);display:grid;place-items:center}.ico svg,.ib svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.info b{display:block;font-size:18px;color:var(--fg)}.info span{font-size:13px;color:var(--fg)}.right{text-align:right}.right i{display:block;font-style:normal;font-size:24px;font-weight:700;color:var(--fg);font-variant-numeric:tabular-nums}.right small{font-size:12px;color:var(--muted)}.acts{display:flex;gap:8px}.ib{width:34px;height:34px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--bg);color:var(--muted);display:grid;place-items:center}.ib svg{width:19px;height:19px}.det{padding:2px 18px 14px}.grp{border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden}.gh{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-soft);border-bottom:1px solid var(--line);font-size:13px;color:var(--orange);font-weight:600}.gh b{min-width:26px;height:24px;padding:0 8px;display:grid;place-items:center;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--bg);font-size:12px;color:var(--fg)}.r{display:grid;grid-template-columns:28px 1fr auto;gap:12px;align-items:center;padding:7px 14px;font-size:13px;color:var(--fg)}.r+.r{border-top:1px solid var(--line)}.lg{width:28px;height:28px;border-radius:50%;color:var(--on-accent);font-size:11px;font-weight:700;display:grid;place-items:center}.cd{display:inline-flex;align-items:center;height:28px;padding:0 9px;border:1px solid var(--orange);border-radius:999px;background:var(--orange-soft);color:var(--orange);font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}.tog{display:grid;place-items:center;height:26px;color:var(--muted)}.tog svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;transform:rotate(180deg)}</style>
<div class="card"><div class="sum"><span class="ico"><svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></svg></span><span class="info"><b>სამომხმარებლო სესხი</b><span>იმედა კლდიაშვილი</span></span><span class="right"><i>12 000 ₾</i><small>07.10.2026, 12:11</small></span><span class="acts"><span class="ib"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></span><span class="ib"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg></span></span></div><div class="tog"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div><div class="det"><div class="grp"><div class="gh"><span>განაცხადზე შეთავაზება დასადასტურებელია</span><b>2</b></div><div class="r"><span class="lg" style="background:#1e63b5">A</span><span>ბანკი A</span><span class="acts"><span class="cd">56:54</span><span class="ib"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></span></span></div><div class="r"><span class="lg" style="background:#7b4fb5">B</span><span>ბანკი B</span><span class="acts"><span class="cd">48:37</span><span class="ib"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></span></span></div></div></div></div>""")

comp('Modal', 'Overlays', 300,
"""Centred dialog over a blurred navy overlay: 400px max, 10px radius, 4px green top border, 28px padding, centred text.

Consumer provides: a title (`panel-title`), one line of text, the body (inputs, buttons) and the close ×. Close button: 32px, top-right, `muted`, hover `bg-soft`. The primary button is full-width green; a secondary ghost sits beside or below. Closes on ×, overlay click and Escape. Variants in the site: authorisation (social buttons, "ან", email), one-time code, offer details (title = organisation, status pill, two tables), confirmation ("დიახ, დავასრულო" in red fill).""",
"""<style>.ov{min-height:270px;background:var(--overlay);display:flex;align-items:center;justify-content:center;padding:16px;border-radius:8px}.box{position:relative;width:100%;max-width:400px;background:var(--bg);border:1px solid var(--line);border-top:4px solid var(--green);border-radius:var(--radius-xl);padding:28px;box-shadow:var(--shadow-modal);text-align:center}.x{position:absolute;top:10px;right:12px;width:32px;height:32px;border:0;background:none;font-size:24px;line-height:1;color:var(--muted);cursor:pointer;border-radius:4px}.box h3{margin:0 0 8px;font-size:16px;font-weight:700;color:var(--fg)}.box p{margin:0 0 16px;color:var(--fg-body)}.in{width:100%;font:inherit;font-size:16px;padding:11px 14px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg);margin-bottom:16px}.btn{width:100%;padding:12px;border:0;border-radius:4px;background:var(--green);color:var(--on-accent);font:inherit;font-weight:600;font-size:14px}</style>
<div class="ov"><div class="box"><button class="x">×</button><h3>ავტორიზაცია</h3><p>შეიყვანე ელ. ფოსტა<br>გამოგიგზავნით ერთჯერად კოდს</p><input class="in" placeholder="name@example.com"><button class="btn">კოდის გაგზავნა</button></div></div>""")

comp('LangToggle', 'Navigation', 80,
"""Header language switch and the header control row: 36px tall, `line` border, 4px radius, two 11px/700 segments, the active one filled green.

Consumer provides: the current language; clicking toggles ka/en and re-renders every text node without layout shift. Sits in the header with the theme button, login (110px wide) or user + logout icon buttons, 8px apart. Only in the header; the footer carries the copyright instead.""",
"""<style>.h{display:flex;align-items:center;gap:8px}.ctl{height:36px;min-width:36px;padding:0 8px;border:1px solid var(--line);border-radius:var(--radius-sm);background:transparent;color:var(--fg);display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.ctl svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.lang{padding:0 4px;font-size:11px;font-weight:700;letter-spacing:.3px}.lang span{padding:4px 7px;border-radius:var(--radius-xs);color:var(--muted)}.lang .on{background:var(--green);color:var(--on-accent)}.login{width:110px;background:var(--green);color:var(--on-accent);border-color:transparent}</style>
<div class="h"><button class="ctl" title="თემა"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button><button class="ctl lang"><span class="on">ქარ</span><span>EN</span></button><button class="ctl login">შესვლა</button><button class="ctl" title="იმედა"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></button><button class="ctl" title="გასვლა"><svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M21 3v18"/></svg></button></div>""")

# ---------------- assets README ----------------
w('assets/Logos/README.md', "logo.png — the loans.ge mark (orange arrows, green banknotes) on a transparent ground, 36px high in the header and footer, always beside the wordmark. Two-colour raster: it needs no ink note. Do not recolour, stretch or place on orange/green fills.")

# ---------------- cover ----------------
w('components/Cover/preview.html', """<!-- @dsCard height=300 -->
<!--
blocks: green 240x300 (space-9*5 x cover), orange 180x180 (space-9*3.75) + orange-soft 180x120 stacked, fg (navy) 60x300 slab at right edge; corners radius-lg 8px (cards) — squared where they meet the edge
arrangement: three unequal vertical bands bleeding off the top and right, the money hue stacked over its tint, the navy ink as a thin closing slab — the site's bands of bg/bg-soft turned 90°
pattern: pills — the status badges and countdown are the one shape the system owns (radius-pill), so five pills in on-accent cut from the green block at a space-3 (12px) pitch, 48px wide = the countdown pill's height x 1.7
scales: space-3 pitch, space-9 block module, radius-lg corners, radius-pill = half height on pills
-->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;700&display=swap">
<style>body{margin:0;background:var(--bg);font-family:var(--font-sans)}.cv{position:relative;width:960px;height:300px;overflow:hidden}.cv svg{position:absolute;left:0;top:0}.green{fill:var(--green)}.orange{fill:var(--orange)}.soft{fill:var(--orange-soft)}.ink{fill:var(--fg)}.pill{fill:var(--on-accent);rx:14}.name{position:absolute;left:48px;bottom:58px;margin:0;font-size:120px;line-height:.92;font-weight:700;color:var(--fg);max-width:440px}.name em{font-style:normal;color:var(--orange)}.tag{position:absolute;left:50px;bottom:30px;margin:0;font-size:14px;color:var(--muted);max-width:440px}</style>
<div class="cv"><svg width="960" height="300" viewBox="0 0 960 300"><rect class="green" x="480" y="0" width="240" height="300"/><rect class="orange" x="720" y="0" width="180" height="180"/><rect class="soft" x="720" y="180" width="180" height="120"/><rect class="ink" x="900" y="0" width="60" height="300"/><rect class="pill" x="528" y="60" width="48" height="28"/><rect class="pill" x="528" y="100" width="48" height="28"/><rect class="pill" x="528" y="140" width="48" height="28"/><rect class="pill" x="528" y="180" width="48" height="28"/><rect class="pill" x="528" y="220" width="48" height="28"/></svg><h1 class="name">loans<em>.ge</em></h1><p class="tag">ერთი განაცხადი, რამდენიმე შეთავაზება, შენი არჩევანი.</p></div>""")

# ---------------- index ----------------
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
index = {"v": 3, "layout": "files", "createdOnFiles": {"v": 1, "at": now}, "title": "loans.ge Design System", "namespace": "LoansGE",
 "libraries": [], "sections": {}, "groups": ["Logos"],
 "assetGroups": {"Logos": {"name": "Logos", "tile": "l", "order": ["logo.png"], "files": {"logo.png": {"name": "logo.png", "blob": "b1bd547f06580df8130bcb6e3d83f94d", "size": 60820, "type": "image/png"}}}},
 "blobs": {}, "docs": {"readme": "project/README.md", "sections": []},
 "lastChange": {"by": "Imeda Kldiashvili", "at": now, "via": "Claude Code", "note": "First build from loans-ge.html (customer web v375)"}}
w('design-system.json', json.dumps(index, ensure_ascii=False, indent=1))
print('files:', sum(len(f) for _,_,f in os.walk(ROOT)))
