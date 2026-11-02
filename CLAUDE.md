# CLAUDE.md

## Core
- Change only what was asked. No unrequested refactors, reformatting, or new files. Suggest instead.
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
- After 2 failed attempts on the same issue, stop and report cause and options.

## Code quality
- One responsibility per function/component. No magic numbers.
- Extract repeated logic, but don't abstract prematurely.
- Always handle errors. Remove debug console.log.
- Comments explain why, not what.
- Style via CSS classes and CSS variables; minimize inline JS styles.

## Project (fill in)
- Stack:
- Run:
- Build / lint / test:
- Key folders:
- Notes:
