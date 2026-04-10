---
name: developer
description: >
  The core build skill for the Developer agent. Executes the implementation
  plan task by task. Enforces code quality, design token usage, accessibility,
  and mobile-first development. Triggers when a plan AND a design system
  document both exist and are approved.
---

## Animation Library — GSAP vs Vanilla

Check the design brief's **Animation Style** section before writing any animation code.

- If the design brief specifies **GSAP** or **ScrollTrigger**: load both via CDN in the HTML `<head>` before `styles.css` — `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js">` and `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js">`. Register ScrollTrigger at the top of `script.js`. Use `gsap.from()` for hero entrances. Use `ScrollTrigger` for all scroll animations.
- If the design brief specifies **vanilla** or is silent: use `IntersectionObserver` + CSS class toggles only. No GSAP. No CDN script tags.
- Never mix both approaches in the same project.

---

## Output Type — Default

Build in plain HTML/CSS/JS unless explicitly told otherwise.
NO React. NO JSX. NO package.json. NO npm required.

Output structure for every build:
```
index.html              ← homepage
[page].html             ← one file per additional page
styles/tokens.css       ← CSS custom properties from design system
styles/global.css       ← resets + base styles
styles/components.css   ← all component styles
scripts/main.js         ← vanilla JS (mobile menu, forms, animations)
```

The client must be able to open `index.html` directly in any browser with no build step.

---

# Developer Skill — Forge Agency

## When to invoke
After BOTH of these exist:
1. An approved implementation plan (from writing-plans)
2. An approved design system document (from the designer skill)

Execute tasks in plan order. Never skip tasks or reorder without reason.
**Never make aesthetic decisions** — those are locked in the design system doc.
If something visual isn't covered in the design system, flag it — don't invent.

---

## Before you start
Read `docs/design/<client-slug>-design-system.md` fully before writing any code.
Copy the `tokens.css` block from that document into `styles/tokens.css` as
your very first task. Everything else builds on top of these tokens.

---

## Core Principles

### 1. Design tokens first — always from the design system doc
NEVER hardcode colours, fonts, or spacing. NEVER invent new values.
All visual values come from the designer's `tokens.css` block:

```css
:root {
  /* These values come from docs/design/<client>-design-system.md */
  /* Do not add values here that aren't in the design system doc  */

  --color-primary:  [from design system];
  --color-accent:   [from design system];
  --color-surface:  [from design system];
  --color-text:     [from design system];
  --color-muted:    [from design system];

  --font-heading:   [from design system];
  --font-body:      [from design system];

  /* Spacing — these are standard and don't come from the designer */
  --space-xs: 0.5rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2.5rem;
  --space-xl: 4rem;

  --max-width: 1200px;
  --radius: 8px;
}
```

### 2. Mobile-first always
Write CSS for mobile first, then add `@media (min-width: 768px)` for desktop.
Test at 375px (iPhone SE) as your baseline.

### 3. Semantic HTML
Use the right element for the job:
- `<nav>` for navigation
- `<main>` for page content
- `<section>` with `aria-label` for major sections
- `<article>` for service cards / testimonial cards
- `<address>` for contact information
- `<button>` for actions, `<a>` for navigation

### 4. Performance standards
- Images: use WebP format, explicit `width` and `height` attributes
- Fonts: load from Google Fonts with `display=swap`
- No unused CSS — only import what the component needs
- Target Lighthouse score > 90 on all four metrics

---

## Per-task workflow

For each task in the plan:

1. **Read the task** — understand the spec reference before writing code
2. **Check tokens.css** — does this task need new variables? Add them first
3. **Write the component** — follow the structure below
4. **Self-review against checklist** (see below)
5. **Mark task complete** in the plan file

### HTML section structure
Each section is written directly in the relevant `.html` file. CSS lives in
`styles/components.css` using BEM-style class names. No frameworks needed.

```html
<!-- Section written inline in index.html -->
<section class="services" aria-label="Our Services">
  <div class="container">
    <h2 class="services__heading">Complete Building Services</h2>
    <!-- content -->
  </div>
</section>
```

```css
/* styles/components.css */
.services { padding: var(--space-4xl) 0; }
.services__heading { font-family: var(--font-heading); color: var(--color-primary); }
```

---

## Project scaffold — mandatory for every build

Every build output must be openable directly in a browser — no build step, no npm.
Always generate this file structure:

| File | Purpose |
|---|---|
| `index.html` | Homepage — full HTML document with `<link>` to CSS and `<script>` to JS |
| `[page].html` | One file per additional page (e.g. `about.html`, `contact.html`) |
| `styles/tokens.css` | CSS custom properties copied from the design system doc |
| `styles/global.css` | CSS reset + base styles, imports `tokens.css` via `@import` |
| `styles/components.css` | All component/section styles |
| `scripts/main.js` | Vanilla JS — mobile menu toggle, form handling, scroll animations |

**Rule: the client must be able to double-click `index.html` and see their site.**
No build step. No `npm install`. No server required.
If any of these files are missing, the build is incomplete — generate them before marking done.

---

## Self-review checklist (run before marking task done)

**Design**
- [ ] All colours from CSS variables (no hex codes inline)
- [ ] All fonts from CSS variables
- [ ] Spacing uses CSS variables or Tailwind scale, not px values

**Code quality**
- [ ] No console.log statements
- [ ] No commented-out code
- [ ] No TODOs left in code
- [ ] All links use correct relative paths (`href="about.html"` not `href="/about"`)
- [ ] Phone numbers use `tel:` links, emails use `mailto:` links

**Accessibility**
- [ ] All images have descriptive `alt` text
- [ ] All interactive elements are keyboard accessible
- [ ] Colour contrast ratio ≥ 4.5:1 for body text

**Responsive**
- [ ] Tested at 375px (mobile)
- [ ] Tested at 768px (tablet)
- [ ] Tested at 1280px (desktop)
- [ ] No horizontal scrollbar at any breakpoint

**Content**
- [ ] No lorem ipsum
- [ ] All copy matches the approved spec
- [ ] Phone numbers and addresses are correct

---

## Common web agency patterns

### Hero section
```html
<section class="hero" aria-label="Hero">
  <div class="container">
    <div class="hero__content">
      <h1>Your Trusted Local Specialists</h1>
      <p>Serving [location] homeowners since [year]</p>
      <a href="tel:07700900000" class="btn btn--primary">Call Now</a>
      <a href="#quote" class="btn btn--secondary">Get a Quote</a>
    </div>
    <div class="hero__image">
      <img src="images/hero.webp" alt="Professional building work in progress" width="800" height="600" />
    </div>
  </div>
</section>
```

### Service card
```html
<article class="service-card">
  <div class="service-card__icon" aria-hidden="true">🔧</div>
  <h3>Service Name</h3>
  <p>Short description of what this service covers.</p>
  <a href="#quote">Learn more →</a>
</article>
```

### Quote form
```html
<form id="quote" aria-label="Get a quote">
  <label for="name">Full Name</label>
  <input type="text" id="name" name="name" required />

  <label for="service">Service needed</label>
  <select id="service" name="service" required>
    <option value="">Select a service…</option>
    <option value="extensions">Extensions &amp; Conversions</option>
    <option value="kitchen">Kitchen &amp; Bathroom</option>
    <option value="repairs">General Repairs</option>
    <option value="emergency">Emergency</option>
  </select>

  <label for="message">Tell us more</label>
  <textarea id="message" name="message" rows="4"></textarea>

  <button type="submit">Send Enquiry</button>
</form>
```

### Mobile menu (scripts/main.js)
```js
const toggle = document.querySelector('.nav__toggle');
const menu   = document.querySelector('.nav__menu');
if (toggle && menu) {
  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('nav__menu--open');
    toggle.setAttribute('aria-expanded', isOpen);
  });
}
```

---

## When you're blocked
If a task is ambiguous or contradicts the spec:
1. Note the ambiguity clearly in a comment
2. Skip that task and move to the next
3. Flag it for the Reviewer agent with: `// REVIEW-NEEDED: [reason]`

Do NOT guess. Do NOT invent requirements not in the spec.
