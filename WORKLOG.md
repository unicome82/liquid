# WORKLOG

## 2026-11-02 · Step 1 — Setup
- Vite + React + TS + SCSS scaffold, design tokens, full-screen no-scroll layout, logo only.
- `npm run build` ✅ / screenshots desktop 1440×900, mobile 390×844 ✅ (scrollHeight = viewport, Syne font applied)

## 2026-11-02 · Step 2 — Static metaball scene
- Raw WebGL SDF metaballs (smin merge, bevel normals, specular/rim, soft drop shadow), colors read from CSS tokens.
- Fix: GLSL ES 1.0 rejected array index via function param → pass blob vec3 instead.
- Tuned: grey hue blends → lift toward butter; thin necks → MERGE_K 0.28; separate portrait layout.
- `npm run build` ✅ / screenshots desktop + mobile ✅
- Color tweak: sky → pastel #7ec8f8, butter → brighter #fff3a1; shadow 0.35→0.2, pink accent 0.35→0.2 (yellow read as beige). Screenshots ✅

## 2026-11-02 · Control panel
- Panel (Intensity / Amount / Mode) bottom-right, toggle + Esc close; settings in `src/shared/settings.ts`.
- Amount live (4–12, BLOB_COUNT = AMOUNT_RANGE.max). Intensity / Mode stored only — wired in steps 3–4.
- Known: at 12 blobs (desktop) MERGE_K 0.28 fuses most blobs into one mass; revisit with motion.
- `npm run build` ✅ / screenshots open + closed, desktop + mobile ✅

## 2026-11-02 · Step 3 — Idle motion + performance
- Spring/damping sim (`physics.ts`), intensity → stiffness, damping ratio (1.4 honey → 0.6 wobbly), drift speed.
- Amount change: blobs grow in / shrink out; aspect switch: blobs flow to new layout. Blobs grow from 0 on load (doubles as intro).
- Perf: RAF loop paused when tab hidden, dt clamped 1/30s, adaptive resolution 0.5–1× (<50fps degrade), touch DPR cap 1.5, shadow SDF skipped far from liquid.
- Headless FPS (SwiftShader CPU, no GPU): desktop 4.3 / mobile 3.0 — not representative; verify on a real device.
- `npm run build` ✅ / motion screenshots desktop + mobile ✅

## 2026-11-02 · Step 4 — Pointer interaction
- `pointer.ts`: mouse hover / touch drag, smoothed velocity, tap flag, speed cap 3/s (synthetic ~1ms events spiked velocity).
- Modes: attract / repel / swirl radial-tangential force + stir along pointer motion; tap = extra impulse. Drip sheds up to 4 droplets that ooze back.
- Shader BLOB_COUNT = 12 + 4 droplets. Canvas `touch-action: none`, logo `pointer-events: none`.
- Verified (headless): attract pulls center ball, repel pushes it into right column.
- Known: drip droplets spawn but merge back immediately (MERGE_K 0.28 > droplet gap) — not visible as separate drops.
- `npm run build` ✅
- Modes revised: swirl/drip → **cut** (`cut.ts` trail carves a groove via shader smax, heals in 0.9s) / **melt** (gravity sag + drips peel off blob bottom, fall and taper).
- **Ink** cursor blob in all modes except cut (springs after pointer, takes nearby liquid colour). BLOB_COUNT = 12 + 4 drips + 1 ink.
- Verified (headless): ink merges into ball, cut groove visible, melt sags blob downward. `npm run build` ✅
- Removed ink cursor (BLOB_COUNT back to 12 + 4). Mouse now reacts only while pressed (hover ignored), same as touch. Verified hover = no change, press+drag = attract ✅
- Mode melt → **mix**: stirred blobs blend colours toward their shared average (recover 0.08/s) + shader colour-only swirl warp (marbling) that follows stroke turning direction; liquid also spins tangentially. Melt drips removed (BLOB_COUNT = 12). `npm run build` ✅
- Mode mix → **twist**: colour mixing removed; swirl warp now applied to the SDF (shape + colour spiral), max 8 rad, unwinds at 0.5/s. Direct render at angle 5 shows clear spiral ✅ `npm run build` ✅
- Random layout per load: fixed x/y removed, `scatter()` best-candidate sampling (16 candidates, 5% edge overflow) keeps sizes/colours from the reference. Two loads differ ✅ desktop + mobile screenshots ✅ `npm run build` ✅
- Cut smoothing: per-segment min width caused stepped notches → tapered capsules (width lerps along segment, plain min — smin added scallops). CUT_SMOOTH 0.04→0.1, width 0.02–0.06, ease-out heal. Direct render before/after ✅ `npm run build` ✅
