# CLAUDE.md

## Core
- Change only what was asked. No unrequested refactors, reformatting, or new files. Suggest instead.
- Create files/folders only when necessary, and keep them to a minimum. Prefer adding to existing files.
- If unclear, ask one short question instead of guessing.
- Follow existing style, structure, and naming. Ask before adding dependencies.
- Respond in Korean.

## Efficiency
- Locate code with Grep/Glob, then Read only the needed range. Never read whole files by default.
- Don't re-read files already read. Don't re-read after editing to verify.
- Use Edit for partial changes. Never rewrite whole files.
- Use subagents only when explicitly asked.
- Limit large outputs (logs, full test runs) with head/tail/grep.
- Never read node_modules, dist, build, .next, coverage, or lock files.

## Responses
- No preamble, recaps, or apologies. Be brief.
- After changes: list changed files, one line each. Don't reprint code.
- Explain in detail only when asked.

## Workflow
- For tasks with 3+ steps, propose a plan (max 5 lines) and wait for approval.
- Small change → verify (build/lint/test, whichever exists) → next.
- UI changes: verify with browser screenshots (desktop + mobile) and show them. Provide a preview link when asked.
- After 2 failed attempts on the same issue, stop and report cause and options.
- Test/QA history: keep it brief, in a single file `WORKLOG.md` only. Never leave temp test files, screenshots, or other files the site doesn't need in the repo.

## Code quality
- One responsibility per function/component. No magic numbers.
- Extract repeated logic, but don't abstract prematurely.
- Always handle errors. Remove debug console.log.
- Comments explain why, not what.
- Style via CSS classes and CSS variables; minimize inline JS styles.

## Components
- Organize components by feature and by screen. Never put everything in one file.
- Before creating a component, search for an existing one and reuse or extend it.
- Used in 2+ places → move to shared components. Used in 1 place → keep it inside that feature/screen.

## Class naming
- Parent (section/block) classes use unique names. e.g. `.notice`, `.main-visual`
- Child elements use short, common names. e.g. `tit-wrap`, `tit`, `txt`, `btn-wrap`, `img`, `list`, `item`
- Write child styles nested under their parent in SCSS so they never collide.
- If a child class has styles shared everywhere (e.g. `tit-wrap` → flex, space-between), declare them once at the top level; inside each parent, write only the differences.

## Styles (SCSS)
- Write real SCSS, not flat CSS: use nesting (max 10 levels), variables, and mixins.
- Split SCSS files by role, not per component:
  - `_reset`: reset default tag properties (padding, margin, list-style, outline, background, border, etc.)
  - `_variables`: colors, spacing, fonts, radii, breakpoints
  - `_mixins`: repeated patterns, media queries
  - `_layout`: header, footer, shared layout
  - `_common`: shared elements (buttons, titles, forms, icons, etc.)
  - `_content`: sub-page content
  - `_main`: main page only
- Read `_variables` and `_mixins` before writing styles.
- Colors, spacing, font sizes, radii, breakpoints → variables only. No hard-coded values.
- Media queries and repeated patterns (flex centering, ellipsis, etc.) → use existing mixins. Add a new mixin only when a pattern repeats.

## Fonts & icons
- Load fonts from Google Fonts and icons from Google Material Symbols via CDN.
- Icons: `<span class="material-symbols-outlined">icon_name</span>`. Outline by default; add the `fill` class for the filled version (controlled via `font-variation-settings`).

## Design
- With no design reference, default to a mid-century + minimal style.
- Define design tokens (colors, fonts, spacing, radii) before building UI.

## Project (fill in)
- Stack: React + SCSS (default when no other requirement is given)
- Run:
- Build / lint / test:
- Key folders:
- Notes:
