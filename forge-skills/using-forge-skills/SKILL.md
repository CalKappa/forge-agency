---
name: using-forge-skills
description: >
  Master reference for all Forge Agency agents. Defines which skill to invoke
  and when. Every agent must check this before acting. Skills are not optional.
---

# Using Forge Agency Skills

## The rule
**If a skill exists for your task, you MUST use it. No exceptions.**

Skills override default agent behaviour. They encode hard-won patterns that
prevent the most common failures in AI-generated web development.

---

## Skill decision tree

```
New request received
        │
        ▼
Is this a new site or major feature?
   YES → brainstorming (always first)
        │
        ▼
   Spec approved by client?
   YES → writing-plans
        │
        ▼
   Plan approved?
   YES → designer (aesthetic direction locked in before any code)
        │
        ▼
   Design system doc approved?
   YES → developer (task by task, using design system tokens)
        │
        ▼
   All tasks complete?
   YES → reviewer (mandatory gate)
        │
        ▼
   Review passed?
   YES → deliver to client
   NO  → developer (fix HIGH issues) → reviewer again

Is something broken or not working?
   YES → systematic-debugging (before touching any code)
```

---

## Skill summary

| Skill | Agent | Triggers on |
|---|---|---|
| `brainstorming` | Orchestrator | New site, new feature, redesign |
| `writing-plans` | Orchestrator | Approved design spec |
| `designer` | Designer | Approved implementation plan |
| `developer` | Developer | Approved plan + approved design system |
| `reviewer` | Reviewer | All developer tasks marked complete |
| `systematic-debugging` | Any | Error, bug, broken behaviour |

---

## Mandatory announcements

When you invoke a skill, say so:
> "Using **brainstorming** skill to refine the brief before any design work."
> "Using **designer** skill to lock in the aesthetic direction before coding."
> "Using **systematic-debugging** skill to find the root cause before fixing."

This keeps the Orchestrator and the human informed of what stage we're at.

---

## Skill priority order (when multiple could apply)

1. **systematic-debugging** — if something is broken, fix it before building more
2. **brainstorming** — if building something new, spec it before planning
3. **writing-plans** — if a spec exists, plan before designing
4. **designer** — if a plan exists, lock in aesthetics before building
5. **developer** — if a plan + design system exist, build task by task
6. **reviewer** — if all tasks are done, review before delivering

Process skills (debugging, brainstorming) always run before implementation skills.
The designer always runs before the developer — never skip it.

---

## What agents must never do

- Write code before a spec exists
- Plan before the spec is approved by the client
- Build before the plan AND design system are approved
- Make aesthetic decisions during development (that's the designer's job)
- Deliver before the Reviewer has run
- Fix a bug without running systematic-debugging first
- Skip a skill because "it seems simple enough"

Simple tasks become complex. The skill prevents that.
