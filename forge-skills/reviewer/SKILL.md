---
name: reviewer
description: >
  Runs after the Developer agent completes all tasks. Performs a systematic
  two-stage review: spec compliance first, then code quality. Produces a
  structured review report. Triggers when all plan tasks are marked complete.
---

# Reviewer Skill — Forge Agency

## When to invoke
After all Developer tasks are marked `[x]` complete in the plan file.
This is a mandatory gate before any site is delivered to the client.

---

## Two-stage review process

### Stage 1 — Spec compliance
Does the built site match what the client approved?

Go through the spec section by section:

**Pages & structure**
- [ ] All pages listed in the spec exist
- [ ] Navigation links to all pages correctly
- [ ] Page titles match the spec

**Above the fold (Home)**
- [ ] Hero headline matches spec (or is an approved variation)
- [ ] Primary CTA is visible above fold on mobile
- [ ] Phone number is correct and clickable (`tel:` link)

**Key sections**
- [ ] All services listed in spec appear on the Services page/section
- [ ] Trust signals present (years in business, accreditations, guarantees)
- [ ] Testimonials section present (if in spec)
- [ ] Google Reviews widget or equivalent (if in spec)

**Contact**
- [ ] Quote form present with fields from spec
- [ ] Business address correct
- [ ] Map embed present (if in spec)
- [ ] All contact methods listed (phone, email, WhatsApp if specified)

**SEO basics**
- [ ] `<title>` tag on each page includes trade + location
- [ ] Meta description on each page (150–160 chars)
- [ ] H1 exists and is unique on each page
- [ ] Images have descriptive alt text

---

### Stage 2 — Code quality review

**Design tokens**
- [ ] No hardcoded hex colours in any component
- [ ] No hardcoded font families in any component
- [ ] All spacing uses CSS variables or Tailwind scale

**Accessibility**
- [ ] All images have non-empty alt text (decorative images use `alt=""`)
- [ ] All form inputs have associated `<label>` elements
- [ ] Keyboard navigation works through nav and form
- [ ] Focus states are visible (not removed with `outline: none`)

**Performance flags**
- [ ] No images over 500KB
- [ ] All images have explicit `width` and `height` set
- [ ] Google Fonts loaded with `display=swap`

**Code hygiene**
- [ ] No `console.log` in any file
- [ ] No commented-out code blocks
- [ ] No TODOs or `// FIXME` left in production files
- [ ] No `// REVIEW-NEEDED` comments left unresolved

**Responsive**
- [ ] No horizontal overflow at 375px
- [ ] Touch targets ≥ 44px × 44px on mobile
- [ ] Font sizes ≥ 16px for body text on mobile

---

## Review report format

Save to: `docs/reviews/YYYY-MM-DD-<client-slug>-review.md`

```markdown
# Review Report: [Client Name]
**Date:** YYYY-MM-DD
**Reviewer:** Reviewer Agent
**Plan:** docs/plans/YYYY-MM-DD-<client-slug>-plan.md

## Stage 1 — Spec Compliance
**Status:** PASS / FAIL

Issues found:
- [ ] [Issue description] — File: [filename] — Severity: HIGH/MEDIUM/LOW

## Stage 2 — Code Quality
**Status:** PASS / FAIL

Issues found:
- [ ] [Issue description] — File: [filename] — Severity: HIGH/MEDIUM/LOW

## Overall verdict
APPROVED FOR DELIVERY / REQUIRES FIXES

## Required fixes before delivery
(list HIGH severity issues only — MEDIUM/LOW can be post-launch)
```

---

## Severity definitions
- **HIGH**: Blocks delivery — missing spec requirement, broken functionality, accessibility failure
- **MEDIUM**: Should fix — code smell, minor spec deviation, non-critical UX issue
- **LOW**: Nice to have — minor polish, suggestion for future improvement

---

## After review
- If APPROVED: Hand off to Orchestrator for client delivery
- If REQUIRES FIXES: Return to Developer agent with the review report
- Developer fixes HIGH issues, Reviewer re-runs Stage 1 & 2 on changed files only
