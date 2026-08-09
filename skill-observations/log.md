# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created | DECLINED = user decided not to pursue

---

## 2026-08-08

### Observation 1: website-builder-setup installs deps blind to project conventions

**Status:** ACTIONED — Convention-check gate added to Step 3 of website-builder-setup SKILL.md (same session)

**Date:** 2026-08-08
**Session context:** Home page fluidity improvements for novel-reader + /website-builder-setup run
**Skill:** website-builder-setup
**Type:** internal
**Phase/Area:** Step 3 (Framer Motion install)

**Issue:** Skill unconditionally runs `npm install framer-motion` into the current repo. novel-reader's CLAUDE.md hard rule: "No CSS framework, no state library, no animation library." Install was skipped manually; home page motion done with plain CSS per repo conventions instead.

**Suggested improvement:** Gate repo-local installs on a project-convention check; global CLI installs stay ungated. (Applied.)

**Principle:** Setup skills that mutate a repo must read that repo's stated conventions before adding dependencies — a setup skill is a guest in the project, not its architect.

### Observation 2: overdrive mandates browser iteration that a hidden pane cannot deliver

**Status:** OPEN

**Date:** 2026-08-08
**Session context:** /impeccable layout overdrive delight typeset colorize on novel-reader home page
**Skill:** impeccable (overdrive.md)
**Type:** open-source
**Phase/Area:** "Iterate with Browser Automation"

**Issue:** overdrive.md says visual iteration is mandatory ("You MUST actively use browser automation tools to preview your work"). The browser pane in this session never composited frames: screenshots timed out, `requestAnimationFrame` never fired, and `document.documentElement.clientWidth` read 0 until a viewport was forced with an explicit width/height. Scroll-driven animations in particular cannot tick without frames, so the mandated visual loop was impossible for exactly the technique the command steers toward. Several probes were burned rediscovering this. Static verification via CSSOM and `getAnimations()` proved the wiring instead (`sw-speak -> ViewTimeline` ×92).

**Suggested improvement:** Add a fallback verification ladder to overdrive.md: (1) confirm the viewport actually has layout (`clientWidth > 0`; force an explicit resize first), (2) if frames are unavailable, verify statically — computed `animation-name`/`animation-timeline`/`animation-range`, and `getAnimations({subtree:true})` grouped by `timeline.constructor.name` to prove a real ScrollTimeline/ViewTimeline was built, (3) state plainly in the handoff that visual confirmation did not happen. Also warn that `el.getAnimations()[0]` is not reliably the authored animation — filter by `animationName`.

**Principle:** A skill that mandates a verification method must name what to do when the environment cannot provide it; otherwise the mandate converts into either wasted probing or a false claim of having verified.

### Observation 3: view() timelines silently no-op on inline boxes

**Status:** OPEN

**Date:** 2026-08-08
**Session context:** Word-by-word scroll narration on novel-reader home page
**Skill:** scroll-experience
**Type:** open-source
**Phase/Area:** "CSS Native (2024+)" / Sharp Edges table

**Issue:** Two failure modes cost real time and neither is documented. (1) `animation-range: cover calc(26% + var(--w) * 0.34%)` is dropped entirely when `--w` is an unregistered custom property — it substitutes as a token, not a number. Registering `@property --w { syntax: '<number>' }` fixed it. (2) `animation-timeline: view()` on a `display: inline` element resolves in computed style but produces no usable range; every element renders at 100% progress. `display: inline-block` is required. Both fail silently — computed styles look correct while the effect does nothing.

**Suggested improvement:** Add both to the skill's Sharp Edges table, and to the "Text Reveals / word-by-word highlight" pattern specifically, since per-word spans are the case that hits both at once.

**Principle:** For CSS features that fail silently, the skill must document the *silent* failure modes — a technique whose computed styles look correct while doing nothing is worse than one that errors, because the reader trusts the wrong signal.
