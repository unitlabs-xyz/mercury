---
name: Mercury
description: An investment account that lives in a crypto wallet, set like a printed statement.
colors:
  harbour-teal: "#0f7480"
  harbour-teal-deep: "#0b5c66"
  harbour-teal-soft: "#6ba8b0"
  harbour-teal-tint: "#e8f4f5"
  harbour-teal-line: "#cbe4e7"
  white: "#ffffff"
  statement-paper: "#efede8"
  fresh-sheet: "#f7f6f2"
  ink: "#1b1a17"
  ink-soft: "#3a372f"
  muted: "#6b665c"
  faint: "#6f6a60"
  edge: "#dbd7ce"
  rule: "#e7e3da"
  cardline: "#e4e0d7"
  hair: "#f0ede6"
  chip: "#f4f2ec"
  gain: "#1a7f4b"
  gain-deep: "#177544"
  gain-tint: "#e7f3ec"
  gain-line: "#bcdcc9"
  loss: "#c0442f"
  loss-deep: "#b33d29"
  loss-tint: "#faebe8"
  loss-line: "#e8bdb4"
  caution: "#8a5e10"
  caution-tint: "#fbf3e0"
  caution-line: "#e6d2a4"
typography:
  display:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  figure-lg:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "42px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  figure:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  moment-title:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  page-title:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  title:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  subtitle:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  amount:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body-ui:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  caption:
    fontFamily: "Instrument Sans, ui-sans-serif, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.1em"
rounded:
  hairline: "3px"
  badge: "6px"
  control: "9px"
  action: "10px"
  inner: "14px"
  card: "16px"
  sheet: "20px"
  full: "9999px"
spacing:
  hair: "4px"
  tight: "8px"
  snug: "12px"
  base: "16px"
  room: "20px"
  card: "24px"
  section: "56px"
  band: "80px"
components:
  button-primary:
    backgroundColor: "{colors.harbour-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "10px 18px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.harbour-teal-deep}"
  button-secondary:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-disabled:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.faint}"
    rounded: "{rounded.action}"
  card:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 24px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.inner}"
    padding: "12px 16px"
  chip-selected:
    backgroundColor: "{colors.harbour-teal-tint}"
    textColor: "{colors.harbour-teal-deep}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "36px"
  chip:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "36px"
  badge-gain:
    backgroundColor: "{colors.gain-tint}"
    textColor: "{colors.gain-deep}"
    rounded: "{rounded.badge}"
    padding: "3px 7px"
  badge-loss:
    backgroundColor: "{colors.loss-tint}"
    textColor: "{colors.loss-deep}"
    rounded: "{rounded.badge}"
    padding: "3px 7px"
---

# Design System: Mercury

## Overview

**Creative North Star: "The Printed Statement"**

Mercury is set, not styled. The ground is warm off-white paper rather than white or dark; structure
comes from hairline rules and the edges of sheets, not from boxes with shadows; and every figure
sits in a tabular column so that columns of money actually line up. Authority is meant to come
from typesetting the way it does on a bank statement or a prospectus, where nothing is decorated
and nothing needs to be.

The density is deliberately unhurried. A screen carries one idea, states it in a heading, supports
it with one paragraph at reading measure, and then shows the numbers. Colour is scarce: a single
teal appears only where something is actionable or live, and the gain/loss pair appears only on
figures that actually moved. Most of any screen is paper, ink and rules.

Restraint here is a trust argument, not a taste preference. This is a product that refuses orders,
queues them, and tells people they can be sold out of a position while they sleep — the interface
has to feel like it is reading from a record rather than selling something.

**Key Characteristics:**
- Warm paper ground (Statement Paper `#efede8`), never white and never dark
- Hairline rules carry structure; borders replace shadows
- Harbour Teal on under a tenth of any screen, only where something is actionable or live
- Tabular numerals globally, so figures align down a column
- Monospace reserved for identifiers, never for prose or money
- Every number says where it came from

## Colors

A warm, low-chroma paper palette with exactly one accent and a strictly rationed performance pair.

### Primary
- **Harbour Teal** (`#0f7480`): The only accent. Primary buttons, live indicators, focus rings,
  the selected state of a filter, and links inside prose. Its scarcity is what makes it readable
  as "this does something".
- **Harbour Teal Deep** (`#0b5c66`): The pressed and hovered state of anything Harbour Teal, and
  teal text on a tinted ground where the base teal would fail contrast.
- **Harbour Teal Tint** (`#e8f4f5`) with **Teal Line** (`#cbe4e7`): The ground for informational
  strips — a live buyer count, a selected chip, an icon medallion.
- **Harbour Teal Soft** (`#6ba8b0`): Second step in the portfolio split bar, and hover borders.

### Secondary
The performance pair. These are never decorative and never appear on anything that did not move.
- **Gain** (`#1a7f4b`), **Gain Deep** (`#177544`) on **Gain Tint** (`#e7f3ec`) with **Gain Line**
  (`#bcdcc9`): A rise, a filled order, a ready-to-buy verdict. Deep is the on-tint variant.
- **Loss** (`#c0442f`), **Loss Deep** (`#b33d29`) on **Loss Tint** (`#faebe8`) with **Loss Line**
  (`#e8bdb4`): A fall, a refusal, a price we will not pay.

### Tertiary
- **Caution** (`#8a5e10`) on **Caution Tint** (`#fbf3e0`) with **Caution Line** (`#e6d2a4`): The
  third verdict — queued, waiting, switched off, liquidation risk. It exists because a queued
  order is neither a success nor a failure, and colouring it green or red would lie about which.

### Neutral
- **Statement Paper** (`#efede8`): The application ground. Every app screen sits on this.
- **Fresh Sheet** (`#f7f6f2`): The landing ground and the recessed fill inside app cards, half a
  step lighter than the page.
- **White** (`#ffffff`): Cards and sheets only — the top sheet in the stack, never a page ground.
- **Ink** (`#1b1a17`): Headings, figures, anything that must be read first.
- **Ink Soft** (`#3a372f`): Body prose inside cards.
- **Muted** (`#6b665c`): Secondary prose, labels, and any sustained text on Statement Paper.
- **Faint** (`#6f6a60`): The lightest text step — captions and stamps. It clears 4.5:1 on every
  ground in the system, which is why it is this value and not lighter.
- **Rules**, lightest to heaviest: Hair `#f0ede6`, Cardline `#e4e0d7`, Rule `#e7e3da`, Edge
  `#dbd7ce`. Hair divides rows inside a card; Cardline is the card's own edge.
- **Chip** (`#f4f2ec`): Neutral pill fills and disabled button grounds.

### Named Rules

**The One Accent Rule.** Harbour Teal appears on at most a tenth of any screen. If a second thing
wants to be teal, one of them is not actually actionable.

**The Earned Colour Rule.** Gain, Loss and Caution are applied to figures and verdicts that
genuinely moved or genuinely changed state. A number that is merely important stays Ink.

**The Contrast Floor.** Every text colour clears 4.5:1 on every ground it is permitted to sit on.
Faint is `#6f6a60` rather than something lighter for exactly this reason. Sustained prose on
Statement Paper uses Muted, not Faint.

## Typography

**Display Font:** Instrument Sans (with `ui-sans-serif`, Helvetica)
**Body Font:** Instrument Sans (the same family; the system is single-voiced)
**Label/Mono Font:** JetBrains Mono (with `ui-monospace`, SFMono-Regular)

**Character:** One humanist grotesque doing every job, tightened hard at display sizes and left
alone at reading sizes. The pairing's whole personality is the contrast between that warm,
slightly narrow sans and a mono used so sparingly it reads as a change of register rather than a
second font.

### Hierarchy
- **Display** (600, 40px → 52px at `sm` → 62px at `lg`, 1.06, `-0.035em`): The landing hero and
  the opener of a marketing page. One per screen.
- **Headline** (600, 30px, 1.1, `-0.03em`): Section openers. It steps to 40px on the landing's
  full-bleed bands, where the measure is wide enough to carry it, and stays at 30px inside the app
  shell, where the column is narrower.
- **Figure Large** (600, 42px, 1.1, `-0.035em`): The one number a screen exists to show — total
  portfolio value, cash balance, borrowing power.
- **Figure** (600, 32px, 1.15, `-0.02em`): A secondary headline number, such as a stock price.
- **Moment Title** (600, 26px → 34px at `sm`, 1.15, `-0.03em`): The heading of a dialog that
  marks an occasion — welcome, account ready.
- **Page Title** (600, 22px, 1.2, `-0.02em`): The heading of an app screen or a task sheet.
- **Title** (600, 18px, 1.25, `-0.015em`): Section headings inside a page.
- **Subtitle** (600, 16px, 1.3, `-0.01em`): Card headings and row names.
- **Lead** (400, 17px, 1.55): The paragraph directly under a display heading. One per surface.
- **Amount** (600, 26px, `-0.02em`): The figure being entered or committed — a buy amount, a
  send amount. The subject of its screen, so it outranks the heading above it.
- **Body** (400, 15px, 1.6): Prose, held to roughly 65–75 characters. Long-form measures are
  capped explicitly rather than left to the container.
- **Body UI** (400, 14px, 1.55): Interface prose — button labels, list rows, sheet lines.
- **Body Small** (400, 13px, 1.55): The interface workhorse — row labels, secondary lines,
  explanatory sentences inside cards. The most used step in the system by a wide margin.
- **Caption** (400, 12px, 1.5): Footnotes, provenance lines, column sub-labels.
- **Code** (mono, 500, 24px): The one-time-code field's digits, sized so a six-character code
  reads as six objects rather than a word.
- **Label** (500, 11px, `0.1em`, uppercase): The `stamp` utility. Column headers and small
  capitalised markers.

The full ladder is **11 · 12 · 13 · 14 · 15 · 16 · 17 · 18 · 22 · 24 · 26 · 30 · 32 · 40 · 42**,
with three roles stepping up at wider viewports: display to 52 then 62, headline to 40 on
full-bleed bands, and moment title to 34. Anything off those values is drift.

### Named Rules (continued)

**The One Step-Up Rule.** A role that grows at a breakpoint grows to exactly one documented value.
Section headings that step to 36 in one file, 38 in another and 40 in four more are not a scale,
they are an accident. The same holds for dialog titles: one step-up value, not two.

### Named Rules

**The Mono Is For Identifiers Rule.** JetBrains Mono is for tickers, token symbols, wallet
addresses, mint addresses, multipliers, route labels and stamp labels. It is never used for dollar
figures, share counts, percentages, or prose. Monospace here signals "this is a name a machine
also uses", not "this is technical".

**The Aligned Figures Rule.** `font-variant-numeric: tabular-nums` is set globally on `body`.
Every column of money lines up by default, and nothing should opt out.

**The Tightening Rule.** Letter-spacing tightens as type grows (`-0.01em` at title, `-0.035em` at
display) and never goes positive except on the 11px uppercase stamp, where it opens to `0.1em`.

## Layout

A single centred measure with a full-bleed band system underneath it.

**Landing.** Full-width bands alternate between Fresh Sheet and white, each with a top and bottom
hairline. Content inside every band is capped at 1440px and inset by the `gutter` utility: 20px
below 640px, 40px from 640px, 80px from 1024px.

**Application.** A fixed 236px sidebar from 1024px up, hidden below it, with the main column
capped at 1280px and inset 20px/32px. Page sections stack on a 56px rhythm (`mt-14`), with 20px
between cards in a group. More space sits above a heading than below it.

**Grids** collapse in one step, not three: three columns at `xl`, two at `sm`, one below. Ranked
lists and comparison rows restructure rather than shrink — the issuer comparison becomes a
two-line block on narrow screens instead of a squeezed four-column row.

**Density.** Card padding is 20px vertical and 20–24px horizontal. Rows inside a card are 14px
vertical with a hairline between. Touch targets reach 44px under coarse pointers and relax back to
36–40px where a mouse is available.

### Named Rules

**The Restructure Don't Shrink Rule.** When a horizontal row cannot hold its columns, it becomes
stacked lines with the same information. Nothing is truncated to fit and no font size drops below
its step to buy width.

## Elevation & Depth

**Paper stacking.** Surfaces behave like sheets of paper on a desk. They overlap and cast only the
shadow real paper would, which is almost none until something is picked up. Depth is carried by
three grounds stacking — Statement Paper under Fresh Sheet under white — with a hairline at every
seam. A card is legible as a card because of its `#e4e0d7` edge, not because of a shadow.

Shadows are therefore a response to state, not a property of a component at rest.

### Shadow Vocabulary
- **Seated** (`0 1px 2px rgba(27,26,23,0.05–0.07)`): The sheet is resting on the one below it.
  Sidebar's active item, small pills.
- **Lifted** (`0 2px 14px rgba(27,26,23,0.07)`): Hover on a card that can be picked up.
- **Raised** (`0 6px 20px rgba(27,26,23,0.12)`): A dropdown or popover held above the page.
- **Floating** (`0 24px 60px rgba(27,26,23,0.28)`): Modals and sheets only. The one place the
  metaphor allows a real shadow, because the sheet genuinely is off the desk.

### Named Rules

**The Hairline Before Shadow Rule.** If a surface needs separating, give it a border. Reach for a
shadow only when the surface is genuinely above the page — hovered, dragged, or modal.

## Shapes

Radii are modest and consistent: 16px for cards and sheets (`rounded-2xl`), 14px for containers
nested inside them, 9–10px for buttons and controls, 6px for small badges, and full rounding for
pills, chips and avatars. The 20px radius appears only on the modal, which is the largest sheet.

Form language is rectangular and calm — no clipped corners, no angled cuts, no decorative
geometry. Icons are drawn from one authored SVG set at a consistent 1.8–2px stroke on a 24px
viewbox; token and company marks are the issuers' real logos, circular, never redrawn.

### Card Finishes

The one place the palette does not reach. A card is a physical object, and the four tiers are
read as materials rather than as colours: **Basic** an anodised blue, **Silver**, **Gold**, and
**Platinum**. Each is a multi-stop sweep at roughly 118°, not a flat fill, because what makes
metal look like metal is a highlight travelling across a surface. Values live in
`apps/web/src/cards/CardArt.tsx` and are deliberately outside the token set.

### Named Rules

**The Material Exception Rule.** Rendered objects — a card, a coin, a device — may carry their own
material colours, because no warm-neutral palette can make gold look like gold. Everything around
the object stays in the system. This is the only sanctioned exception, and it applies to the
object, never to its surroundings.

**The Nested Radius Rule.** A container inside a card steps down one level (16px outer, 14px
inner). Two identical radii nested inside each other read as a mistake.

## Components

The feel to aim for is **tactile and confident**: presses respond physically, springs carry real
weight, and every state acknowledges itself.

### Buttons
- **Shape:** Softly squared (9px for bar and inline actions, 10px for full-width sheet actions).
- **Primary:** Harbour Teal ground, white label, 600 weight, 10px/18px padding.
- **Hover / Focus:** Ground shifts to Harbour Teal Deep over 200ms; press scales to 0.97 on a
  spring (stiffness 480, damping 34). Focus shows the global 2px Harbour Teal ring at 2px offset.
- **Secondary:** White ground, `#d5d0c6` border, Ink Soft label; the border darkens on hover.
- **Disabled:** Chip ground, Faint label, `cursor-not-allowed`. Never a faded primary.

### Chips
- **Style:** Fully rounded, 36px tall (44px under coarse pointers), white ground with a Cardline
  border.
- **State:** Selected takes Harbour Teal Tint with a Harbour Teal border and Teal Deep label.
  Unselected borders warm toward Teal Soft on hover.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** White on Statement Paper; Fresh Sheet for recessed panels inside a card.
- **Shadow Strategy:** None at rest. See Elevation — the Cardline border does the work.
- **Border:** 1px Cardline (`#e4e0d7`).
- **Internal Padding:** 20px vertical, 20–24px horizontal; internal rows divided by Hair.

### Inputs / Fields
- **Style:** White ground, Cardline border, 14px radius, generous padding. The label wraps the
  input so the whole field is the target, not just the text box.
- **Focus:** Border shifts to Harbour Teal via `focus-within`. The caret is Harbour Teal globally.
- **Amount fields:** Oversized (26px, 600) with a Faint currency mark, because the number is the
  subject of the screen.

### Navigation
- **Sidebar:** 236px, items 41px tall with an icon and label. Active takes a white ground with the
  Seated shadow and 600 weight; inactive is Muted and warms to a translucent white on hover.
- **Top bar:** Sticky, `rgba` Fresh Sheet at 85% with a 12px backdrop blur, items divided by
  vertical Navline rules, each with an underline that grows from the left on hover and focus.
- **Mobile:** The sidebar is hidden below 1024px; the page header carries the context instead.

### Verdict Panels (signature)
The component the product is really about. A decision from the execution engine renders as one of
three panels sharing a shape but never a colour: **Gain Tint** for a fill, **Caution Tint** for a
queue, **Loss Tint** for a refusal. Each opens with an icon and a short verdict in 600 weight,
then one sentence of plain explanation, then a definition list of the figures behind it. The three
are visually siblings so the product never looks like it is hiding one of them.

### Issuer Comparison Row (signature)
Two lines rather than a wide row. Line one carries the token symbol in mono, the issuer name, and
a verdict badge pushed right. Line two carries the multiplier in mono on the left and the price
per real share on the right, with impact and how much dearer it is underneath. It holds its shape
from 320px to 1440px without truncating.

## Do's and Don'ts

### Do:
- **Do** put every app screen on Statement Paper (`#efede8`) and reserve white for cards.
- **Do** separate surfaces with a hairline before reaching for a shadow.
- **Do** keep Harbour Teal under a tenth of the screen, on things that are actionable or live.
- **Do** use JetBrains Mono for tickers, addresses, multipliers and route labels only.
- **Do** state a figure's source next to it — "read live from", "reference price of one real
  share" — because provenance is part of this product's visual language.
- **Do** restructure rows into stacked lines on narrow screens rather than shrinking type.
- **Do** step a nested container's radius down one level from its parent.
- **Do** hold every screen to WCAG 2.1 AA, including 44px targets under coarse pointers.

### Don't:
- **Don't** reach for the fintech startup template: purple-to-blue gradients on white, oversized
  rounded cards, 3D illustrated mascots, or a hero with a floating phone mock. This is the one
  named anti-reference.
- **Don't** set a kicker or eyebrow above a heading. The heading carries its own weight.
- **Don't** put a monospace face on a dollar figure, a share count or a percentage.
- **Don't** give a component a shadow at rest.
- **Don't** use Faint for sustained prose on Statement Paper; that is Muted's job.
- **Don't** colour a figure green or red unless it actually moved, or amber unless it is genuinely
  in a third state.
- **Don't** draw a bar, ring or sparkline to stand in for content that could be stated as aligned
  text and read exactly.
- **Don't** nest a card inside a card.
