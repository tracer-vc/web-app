# Tracer Design Language

Apply this system to the Tracer web app. It replaces the previous teal/soft-shadow look. The reference implementation is `Tracer Landing.dc.html`.

**The idea:** Tracer is about evidence, so the UI should feel like a well-kept research ledger, not generic SaaS. That means crisp ink outlines, square corners, hard offset shadows and a highlighter yellow that marks what matters. Avoid soft blurry shadows, big rounded corners, pill buttons and gradients.

---

## 1. Color

### Core
| Token | Hex | Use |
|---|---|---|
| `ink` | `#0e1530` | Primary text, borders, outlines, dark buttons, dark sections |
| `cobalt` | `#2b4bff` | Primary action, step markers, links, active/selected states |
| `cobalt-hover` | `#1a33c9` | Hover/pressed for cobalt |
| `highlight` | `#f2dc4b` | Signature offset shadow, CTA button on dark backgrounds |
| `highlight-soft` | `#fff1a1` | Highlighter tags, label backgrounds, "positive" status, cited-text highlight |

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `page` | `#f7f7f4` | App background (warm off-white) |
| `surface` | `#ffffff` | Cards, panels, tables |
| `sunken` | `#f4f6f8` | Backdrop behind showcased cards / inset areas |
| `subtle` | `#f7f8fa` | Table header rows, footer strips, quoted source boxes |
| `cobalt-tint` | `#e9ecff` | Feature/config blocks that need a tinted background |
| `cobalt-soft` | `#c9d2ff` | Secondary text on `ink` backgrounds |

### Text
| Token | Hex | Use |
|---|---|---|
| `text` | `#0e1530` | Headings, primary text |
| `text-strong` | `#1c2444` | Long-form body that needs a bit more weight |
| `text-secondary` | `#3a4262` | Body copy |
| `text-muted` | `#5a6180` | Descriptions, helper text |
| `text-tertiary` | `#7d839c` | Meta labels, captions, timestamps |
| `text-disabled` | `#a3a8bc` | Citations, disabled |

### Lines
| Token | Hex | Use |
|---|---|---|
| `line-ink` | `#0e1530` | Outlines of cards, panels, buttons, tables (the default) |
| `line` | `#e1e5ea` | Dividers inside cards, section borders |
| `line-soft` | `#eef0f3` | Row dividers in tables/lists |
| `line-timeline` | `#c9cdda` | Connector lines between steps |

### Status (always shown as tags, see §5)
| Meaning | Background | Text |
|---|---|---|
| Positive / Independent / Fact | `#fff1a1` | `#0e1530` |
| Neutral / Inference / Open question | `#f1f3f6` | `#3a4262` |
| Warning / Founder only / Speculation / Unresolved | `#ffe7e3` | `#a1261a` |
| Warning (border, when needed) | — | `#f7c9c1` |

Keep it disciplined: one cobalt action per view, with yellow as the only accent. Don't add new hues.

---

## 2. Typography

| Role | Font | Weight | Size / tracking |
|---|---|---|---|
| Display / H1 | **Bricolage Grotesque** | 700 | clamp(40px → 76px), line-height 1.02, letter-spacing −0.035em |
| H2 (section) | Bricolage Grotesque | 700 | clamp(30px → 46px), lh 1.05, ls −0.03em |
| H3 (card / feature title) | Bricolage Grotesque | 600 | 20–30px, ls −0.01 to −0.02em |
| Body | **Inter** | 400 / 500 | 15–18px, line-height 1.5 |
| UI labels, buttons | Inter | 500 / 600 | 13–16px |
| IDs, step numbers, meta labels, URLs | **JetBrains Mono** | 400 / 500 | 11–13px |

Google Fonts:
```
https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap
```

Rules:
- **Never use ALL CAPS** for labels or titles. Use sentence case everywhere.
- Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs.
- Use mono only for machine-ish things: IDs (C4, S1), step numbers, "Output"/"Source" meta labels, file paths.

---

## 3. Shape

- **Corner radius:** `4px` for cards, panels, buttons and inputs; `2–3px` for tags and small markers. Never use more than 4px, and never pills (`999px`).
- **Borders:** structural elements get a **1px `ink` outline** (`box-shadow: 0 0 0 1px #0e1530` or `border: 1px solid #0e1530`). Inner dividers use `line` / `line-soft`.
- **No blurry drop shadows.** Depth comes only from hard offset shadows:

| Shadow | Value | Use |
|---|---|---|
| Signature (large) | `10px 10px 0 #f2dc4b` | Hero media frame / one hero element per page |
| Signature (medium) | `6px 6px 0 #f2dc4b` | Showcased cards, config panels, modals |
| Signature (selected) | `5px 5px 0 #f2dc4b` | Active tab / selected list item (with ink outline) |
| Button | `3px 3px 0 #0e1530` | All outlined/filled buttons on light backgrounds |
| Icon button | `4px 4px 0 #0e1530` | Large round-trip actions (e.g. play) |

Use the yellow shadow sparingly, one or two per screen. It marks "look here".

---

## 4. Buttons

All buttons have a 4px radius, a 1px ink border and a hard ink offset shadow. On hover they **press in**: they move 2px down and right while the shadow shrinks.

```css
/* Primary */
background:#2b4bff; color:#fff; border:1px solid #0e1530; border-radius:4px;
box-shadow:3px 3px 0 #0e1530; transition:transform .12s, box-shadow .12s;
/* hover */
background:#1a33c9; transform:translate(2px,2px); box-shadow:1px 1px 0 #0e1530;

/* Secondary */
background:#fff; color:#0e1530; border:1px solid #0e1530; border-radius:4px;
box-shadow:3px 3px 0 #0e1530;
/* hover */
transform:translate(2px,2px); box-shadow:1px 1px 0 #0e1530;

/* On dark (ink) backgrounds */
background:#f2dc4b; color:#0e1530; border:1px solid #f2dc4b; border-radius:4px; font-weight:600;
/* hover */
background:#fff1a1;
```

Sizes: small `8px 15px` / 14px text (nav, toolbars); default `11px 20px` / 16px text. Keep labels on one line (`white-space: nowrap`). Inputs match the button height and radius.

---

## 5. Tags, labels and status

- **Section / eyebrow label:** mono 13px, weight 500, `ink` text on a `highlight-soft` background, padding `3px 8px`, radius 2px. It reads like a highlighter mark.
- **Status tag:** Inter 12px, weight 500, padding `3px 10px`, radius 3px, colours from the Status table. Square, never pill-shaped.
- **Highlighted text in content** (e.g. the sentence a citation supports): `highlight-soft` background, `ink` text, 2–4px radius, small horizontal padding.
- **Citation chip** (e.g. `C4`): mono 12px, cobalt background, white text, 2px radius.
- **Output tag:** a mono 11px "Output" label in `text-tertiary`, with the value below it in a 14px/600 highlighter tag.

---

## 6. Components and patterns

**Cards / panels**
- `surface` background, 4px radius, 1px ink outline, padding 24–28px.
- Header row: 13px `text-tertiary` label on the left, optional status tag on the right, divided by `line-soft`.
- Showcased cards (demos, previews) sit on a `sunken` backdrop and get the medium yellow signature shadow.

**Tables / lists** (claims, sources, conflicts, config)
- `surface` with a 1px ink outline; rows divided by `line-soft`; padding `14px 18–20px`.
- Row layout: mono ID, then a primary line (15px/500) with a meta line below (13px `text-tertiary`), then a status tag on the right.
- Optional header row: 11–12px `text-tertiary` on `subtle`.

**Tabs / selectable list items**
- Inactive: transparent; hover `#f7f8fa`.
- Active: white background, `0 0 0 1px #0e1530, 5px 5px 0 #f2dc4b`.

**Pipeline / step timeline**
- Each step starts with a 32px `ink` square (2px radius) holding a white mono number ("01"), followed by a 1px `line-timeline` connector that runs to the next step. The last step has no connector.
- Title 19px/600, description 15px `text-muted`, output tag at the bottom.
- All steps sit together on one white panel with an ink outline.

**Source / excerpt box**
- `subtle` background with a 1px `line-soft` outline, 4px radius.
- A meta line ("Deck, slide 7") plus a source-type tag, then the quote in italic 15px `ink`.

**Contradiction / conflict**
- The two claims sit side by side as cards with a large number or quote (Bricolage 22px/600) and the source meta above.
- Below them is a full-width strip with an "Unresolved" warning tag and a one-line explanation.

**Window / app frame** (screenshots, media)
- White, 1px ink outline, large yellow signature shadow.
- Title bar on `subtle` with real macOS traffic lights (`#ff5f57`, `#febc2e`, `#28c840`) and a mono URL in `text-tertiary`.

**Dark blocks** (CTA, emphasis)
- `ink` background, white heading, `cobalt-soft` body text, yellow button.

---

## 7. Layout and spacing

- Max content width 1180px with 24px side padding.
- Section padding: 96–112px vertical.
- Section head: eyebrow label, then H2 (12px gap), then lead paragraph (18px, `text-secondary`/`text-muted`, max ~640px, 18px gap). Content starts 48–56px below.
- Use grid/flex with `gap` (16–24px between cards, 40–72px between text and visual columns).
- Alternate `page` and white sections sparingly, separated by 1px `line` borders. Don't stack many white sections.
- Layouts must reflow: `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`, and no fixed heights on boxes that hold text.

---

## 8. Voice and copy

- **Plain language for anyone new.** Say "every statement links to its source", not "atomic claims with excerpts". Explain app terms on first use (e.g. "dimensions, the criteria every deal is scored on, like team or moat").
- **No em dashes.** Use commas, periods or parentheses.
- **No all caps.**
- **Be short.** One idea per sentence; descriptions of 1–2 lines.
- **Speak to the investor's reality:** time pressure, IC scrutiny ("Is that from the deck?"), and founder versus independent evidence.
- Use app terminology (Thesis Card, Evidence Pack, Decision Snapshot, Proceed / Watch / Pass) as proper names, consistently.

---

## 9. Don'ts

- No soft or blurred shadows, glows or gradients.
- No radii above 4px and no pill shapes (except the circular macOS window dots).
- No teal or green, and no new accent hues.
- No emoji, decorative icons or filler stats.
- Don't use the yellow signature shadow on more than 1–2 elements per screen.
- Don't use mono for body text.
