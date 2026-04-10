---
name: systematic-debugging
description: >
  Use when a bug, error, or unexpected behaviour is reported. Follows a
  4-phase root-cause process before touching any code. Prevents the common
  agent failure of making random changes hoping something sticks. Triggers
  on: error messages, "it's broken", "not working", visual bugs.
---

# Systematic Debugging Skill — Forge Agency

## When to invoke
ANY time something is reported as broken or not working as expected.
Never jump straight to changing code. Always diagnose first.

---

## The 4-phase process

### Phase 1 — Reproduce
Before anything else, confirm you can reliably reproduce the bug.

- What exactly happens? (error message, visual glitch, missing element)
- What was expected to happen?
- Which page/component/route is affected?
- Does it happen on mobile, desktop, or both?
- Does it happen in all browsers or just one?

If you can't reproduce it consistently, you can't fix it safely.

### Phase 2 — Locate
Find the smallest piece of code responsible.

**For visual bugs:**
1. Inspect the element — what CSS property is wrong?
2. Is it a specificity issue? A missing CSS variable?
3. Is it a responsive breakpoint issue?
4. Is it a missing class or wrong class name?

**For JavaScript/React errors:**
1. Read the full error message — don't skip the stack trace
2. Identify the file and line number
3. Is it a missing prop? A null reference? An import error?
4. Is it a state/render timing issue?

**For data/API bugs:**
1. Check the network tab — what was the request and response?
2. Check the Supabase logs — what was the query?
3. Is the data structure what the component expects?

### Phase 3 — Understand root cause
Do NOT fix the symptom. Fix the cause.

Ask: "Why did this happen?"
- Is it a logic error in the component?
- Is it a missing guard (null check, empty array check)?
- Is it a CSS conflict from a global style?
- Is it an incorrect assumption in the spec?

Write the root cause down in plain English before writing any code:
"The ReviewWidget crashes because it assumes `reviews` is always an array,
but the API returns `null` when no reviews exist."

### Phase 4 — Fix and verify

**Fix:**
- Make the smallest possible change that addresses the root cause
- Don't refactor unrelated code while fixing
- Add a null/empty guard if the data can be absent

**Verify:**
- [ ] The original bug no longer reproduces
- [ ] The fix doesn't break adjacent behaviour
- [ ] Mobile and desktop both work correctly
- [ ] No new console errors introduced

**Document:**
Add a brief comment above the fix:
```js
// FIX: Guard against null reviews from API (reviews can be null if no reviews yet)
const safeReviews = reviews ?? [];
```

---

## Defence-in-depth (prevent recurrence)

After fixing, consider:
- Should there be a PropTypes or TypeScript check to catch this earlier?
- Should there be a fallback UI (empty state) instead of crashing?
- Is the same pattern used elsewhere? Fix all instances.
- Should the spec be updated to reflect this constraint?

---

## What NOT to do
- Don't change multiple things at once and see what sticks
- Don't comment out the broken code and write new code next to it
- Don't ignore the console error and keep building
- Don't guess at the fix without understanding the cause
