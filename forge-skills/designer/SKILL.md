---
name: designer
description: >
  Use AFTER writing-plans and BEFORE the Developer agent writes any code.
  Commits to a bold, specific aesthetic direction for the site. Produces a
  design system document (colours, fonts, motion, layout tone) that the
  Developer agent implements faithfully. Triggers on any new site build or
  visual redesign. NEVER skip this — it prevents AI slop aesthetics.
---

# Designer Skill — Forge Agency

## Why this skill exists

Without design direction, AI agents default to what Anthropic calls
**distributional convergence** — the statistical average of all web design
training data. That means Inter font, purple gradients on white, minimal
animations, grid card layouts. Every site looks the same.

This skill forces a committed aesthetic decision BEFORE any code is written,
so the Developer agent has a clear visual contract to implement.

---

## When to invoke
- After the writing-plans skill has produced an approved implementation plan
- Before the Developer agent starts any component
- On any redesign where the visual direction needs updating

**Do NOT skip this step.** Generic design undermines client trust and makes
AI-built sites immediately recognisable — and dismissible.

---

## Step 1 — Read the brief

Before making any design decisions, absorb:
- The client's trade and business name
- Their target customer (homeowners? businesses? emergency callers?)
- The tone approved in the brainstorming spec (professional? friendly? premium?)
- Any brand assets provided (logo colours, existing imagery)
- Competitor sites in the same trade + location (what are they doing?)

---

## Step 2 — Commit to a single aesthetic direction

Pick ONE direction and execute it with precision. Do not hedge.
Bold maximalism and refined minimalism both work — the key is **intentionality**.

### Available directions (choose one, make it specific)

**Refined & Trust-building**
Heavy serif headings, muted palette, generous whitespace, understated motion.
Good for: accountants, solicitors, high-end trades (bespoke joinery, architects).

**Bold & Local**
Strong sans-serif, high contrast, trade imagery as hero, urgent CTAs.
Good for: plumbers, electricians, roofers — trades where speed of response matters.

**Warm & Approachable**
Rounded corners, earthy tones, photography-led, conversational copy tone.
Good for: landscaping, interior design, childcare-adjacent services.

**Clean & Modern**
Geometric sans-serif, monochromatic with one accent, grid-aligned, minimal motion.
Good for: tech services, cleaning companies, property management.

**Premium & Distinctive**
Dark backgrounds, metallic accents, editorial layout, asymmetric composition.
Good for: luxury tradespeople, bespoke services, high-ticket clients.

### The question to ask
> "What's the ONE thing someone will remember about this site?"
Lock that in before anything else.

---

## Step 3 — Define the design system

Once you've committed to a direction, produce the following. Be specific.
No vague choices. Every decision must be implementable in CSS.

### Typography
- **Heading font**: [specific Google Font name] — [why it fits the brand]
- **Body font**: [specific Google Font name] — [why it pairs well]
- **Avoid**: Inter, Roboto, Arial, system-ui, Space Grotesk
- **Scale**: H1 / H2 / H3 / body / small sizes in rem

**Font pairing examples by direction:**
- Bold & Local: `Oswald` (headings) + `Nunito Sans` (body)
- Refined & Trust: `Cormorant Garamond` (headings) + `Lato` (body)
- Warm & Approachable: `Fraunces` (headings) + `Plus Jakarta Sans` (body)
- Clean & Modern: `DM Sans` (headings) + `DM Sans` (body, one-font system)
- Premium & Distinctive: `Bebas Neue` (headings) + `Crimson Pro` (body)

### Colour palette
Define 5 variables. Be specific with hex codes:
```
--color-primary:   [dominant brand colour]
--color-accent:    [sharp contrast colour for CTAs]
--color-surface:   [background — can be off-white, dark, warm cream]
--color-text:      [primary text — not pure black unless intentional]
--color-muted:     [secondary text, borders, subtle UI]
```

**Rules:**
- Dominant colour + sharp accent outperforms a palette of 5 equal colours
- If surface is dark, text must be light — don't use dark-on-dark
- Accent colour appears on CTAs, links, icons — nowhere else
- Never use purple gradient on white. Never use #6366f1 as an accent.

### Motion & animation
Define the site's movement personality:
- **Page load**: staggered reveal (elements fade/slide in sequence, 0.1s delay each)
- **Hover states**: button scale (1.02), colour transition (0.2s ease)
- **Scroll**: fade-in-up on section entry (IntersectionObserver)
- **Intensity**: subtle / moderate / expressive

One well-orchestrated page load beats scattered micro-interactions everywhere.
Pick the high-impact moments and execute those well. Leave the rest static.

### Layout tone
- **Alignment**: centred / left-aligned / asymmetric
- **Spacing**: generous (lots of whitespace) / compact (dense, information-rich)
- **Grid-breaking elements**: overlapping sections? diagonal dividers? full-bleed images?
- **Hero layout**: image left + text right / full-bleed background + overlay text / split-screen

### Background treatment
Do NOT default to solid white or solid grey.
Choose one atmospheric approach:
- Subtle noise texture overlay (2–4% opacity)
- Gradient mesh (2–3 brand colours, very low saturation)
- Geometric pattern (SVG, brand colour at 5% opacity)
- Section-alternating (white → very light tint → white)
- Dark sections for contrast (footer, CTA blocks)

---

## Step 4 — Write the design system document

Save to: `docs/design/YYYY-MM-DD-<client-slug>-design-system.md`

```markdown
# Design System: [Client Name]
**Direction:** [chosen aesthetic direction in one sentence]
**Memorable quality:** [the one thing someone will remember]

## Typography
- Heading: [Font Name], [weight]
- Body: [Font Name], [weight]
- Google Fonts import: [URL]
- Scale: H1: 3rem | H2: 2rem | H3: 1.5rem | body: 1rem | small: 0.875rem

## Colours
--color-primary:  [hex]  → [usage: nav, headings, key UI]
--color-accent:   [hex]  → [usage: CTAs, links, icons only]
--color-surface:  [hex]  → [usage: page background]
--color-text:     [hex]  → [usage: body copy]
--color-muted:    [hex]  → [usage: secondary text, borders]

## Motion
- Page load: [description]
- Hover: [description]
- Scroll trigger: [yes/no + description]
- Intensity: [subtle/moderate/expressive]

## Layout
- Alignment: [centred/left/asymmetric]
- Spacing: [generous/compact]
- Hero: [layout description]
- Background: [treatment description]

## tokens.css
[Full CSS custom properties block — ready to paste]
```

---

## Step 5 — Hand off to Developer

The Developer agent receives:
1. The approved implementation plan (from writing-plans)
2. This design system document

The Developer implements components using ONLY the tokens defined here.
No aesthetic decisions are made during development — those are locked in here.

---

## Anti-patterns to enforce (never allow these)

| Banned | Use instead |
|---|---|
| Inter / Roboto / Arial | A characterful Google Font from the pairing guide |
| Purple gradient (#6366f1) on white | Brand-specific palette from above |
| Uniform padding everywhere | Generous whitespace OR intentional density |
| Cards in a 3-column grid | Asymmetric layouts, overlaps, varied sizing |
| No animation at all | At minimum: page load stagger + hover states |
| Solid white background only | Atmospheric treatment + section variation |
| Space Grotesk as "distinctive" | It's not. Pick something less common. |
