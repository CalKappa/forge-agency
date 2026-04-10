---
name: qa-agent
description: >
  Runs AFTER the build is complete and BEFORE the Reviewer. Analyses the
  built code for issues, presents findings to the operator with a fix/pass
  choice, and if fixes are needed: briefs the Developer precisely, then
  re-runs itself after fixes are done. Updates developer/SKILL.md with any
  recurring mistake patterns so the Developer learns permanently.
---

# QA Agent Skill — Forge Agency

## When to invoke
After all Developer tasks are marked complete.
Before the Reviewer runs.
Again after every Developer fix cycle.

## Goal
Catch issues early, give the operator control, and make the Developer better
over time by feeding mistakes back into its skill file.

---

## Workflow

### Phase 1 — Code analysis
Before producing any output, analyse the built code against three checklists:

**Design system compliance**
- [ ] All colours use CSS variables — no hardcoded hex values
- [ ] All fonts use CSS variables — no hardcoded font families
- [ ] All spacing uses CSS variables or Tailwind scale
- [ ] tokens.css variables match the approved design system doc exactly

**Structure and quality**
- [ ] Every component has a single clear responsibility
- [ ] No component file is over 300 lines
- [ ] No console.log statements
- [ ] No commented-out code blocks
- [ ] No TODO or FIXME comments
- [ ] No hardcoded API keys or URLs
- [ ] Props are named clearly and consistently

**Spec compliance (partial — full check done by Reviewer)**
- [ ] All pages in the spec exist as files
- [ ] All navigation links point to existing routes
- [ ] Quote/contact form is present if in spec
- [ ] Phone number is clickable (tel: link) if in spec
- [ ] Hero section has a visible CTA above the fold

**Responsive**
- [ ] No fixed pixel widths that would break at 375px
- [ ] Mobile layout tested at 375px (check for horizontal overflow)
- [ ] Touch targets are at least 44px × 44px

**Accessibility**
- [ ] All images have alt text
- [ ] All form inputs have associated labels
- [ ] Buttons have descriptive text (not just "click here")

**Build output integrity**
- [ ] All CSS module files referenced in JSX imports exist on disk
- [ ] All component imports resolve to files that actually exist
- [ ] The builds/[client-slug]/ directory contains ALL files generated during the build — nothing left only in src/
- [ ] Every page file has its corresponding .module.css file present
- [ ] Run a dry import check: for every `import X from './X.module.css'` found in JSX files, verify the CSS file exists at that path

---

### Phase 2 — Produce the QA report

Format the report exactly like this:

```
## QA Report — [Client Name]
**Build date:** YYYY-MM-DD
**Tasks completed:** N
**Issues found:** N

### Issues

| # | Severity | File | Issue | Root cause |
|---|---|---|---|---|
| 1 | HIGH | src/components/Hero.jsx | Hardcoded colour #1a3c6e | Developer skipped design token check |
| 2 | MED  | src/pages/Contact.jsx | Input missing label element | Accessibility checklist not run |

### Severity definitions
- HIGH — Must fix before delivery (broken functionality, spec violation, hardcoded values)
- MED  — Should fix (code quality, accessibility, minor spec deviation)
- LOW  — Optional improvement

### Root cause patterns
[List any recurring mistake patterns — e.g. "Developer consistently skips
the self-review checklist before marking tasks done"]

**Known recurring pattern — CSS module files:**
CSS module files are frequently truncated or missing from the build output
due to output length limits. QA must explicitly verify every CSS module
import resolves before marking the build clean.

### Recommended fix brief for Developer
[Only include if issues exist — precise instructions for each fix]

---
**QA verdict:** ISSUES FOUND — awaiting operator decision
OR
**QA verdict:** CLEAN — ready for Reviewer
```

---

### Phase 3 — Present operator choice (if issues found)

After showing the report, always present this choice:

```
QA found N issue(s). How would you like to proceed?

  [1] Fix issues — send back to Developer with the fix brief above
  [2] Pass to Reviewer — skip fixes and let Reviewer make the call

Reply with 1 or 2.
```

Wait for the operator response. Do not proceed until they reply.

---

### Phase 4a — If operator chooses Fix (1)

1. Send the Developer the fix brief from the QA report
2. Developer fixes each issue and confirms done
3. QA agent runs its full checklist again from Phase 1
4. Produces a new QA report
5. Presents the operator choice again
6. Repeat until operator chooses Pass OR no issues remain

---

### Phase 4b — If operator chooses Pass (2)

Hand off to the Reviewer skill immediately.
Note in the handoff: "QA issues were noted but operator chose to pass. Reviewer
should be aware of the following outstanding items: [list]"

---

### Phase 5 — Update the Developer skill (always, win or lose)

After the operator makes their decision, always do this:

If recurring mistake patterns were found (same type of error appearing more
than once, or same error that appeared in a previous QA run on this project):

1. Read `forge-skills/developer/SKILL.md`
2. Add a new rule under the relevant section to prevent this exact mistake
3. Format the new rule as:
   ```
   - [QA-learned] Never [mistake]. Always [correct behaviour instead].
     Example: [brief code example if relevant]
   ```
4. Confirm the skill file has been updated

If no recurring patterns — no update needed.

---

## Rules

- Never skip the operator choice — even if all issues are LOW severity
- Never auto-fix without the operator saying "1"
- Always update the developer skill if a pattern is found — this is how the
  system gets better over time
- The QA report must include root cause for every issue — "it was wrong" is
  not a root cause. "Developer skipped the self-review checklist" is.
- QA is not the Reviewer — do not run spec compliance in full here. That is
  the Reviewer's job. QA focuses on code quality and design system compliance.
