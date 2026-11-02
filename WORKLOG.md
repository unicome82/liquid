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
- Mode twist → **stretch** (`stretch.ts`): press near a blob edge pulls a 6-blob strand + tip; snaps past 0.35–0.6 su (intensity), tip oozes home, beads retract; release before snap = rubber-band recoil. Per-blob merge range (uBlobs vec4.w, strand 0.08) keeps the thread thin; blobs < 0.012 hidden (dimple dots). Twist/swirl code removed. BLOB_COUNT = 12 + 9.
- Verified via direct sim drive: pull → thin neck, snap → beads + flying tip ✅ Faint beading ridges remain on long strands. `npm run build` ✅

## 2026-11-02 · Step 5 — Details
- **Colour cycle** (`colorCycle.ts`): blobs drift sky → lavender → pink → peach, 15 s per step, eased. First tried shader YIQ hue rotation → went lime/teal (off-palette), replaced with palette loop.
- **Grain**: shader film grain 0.035, 24 fps pattern change, frame index wrapped (sin precision).
- **Hint** (`features/hint`): per-mode guide bottom-left, fades on first press on the liquid (panel clicks ignored), returns on mode change. `aria-live="polite"`.
- Verified (headless): hint opacity 1 → 0 after press, desktop + mobile; colours stay pastel at 18 s; no console errors. `npm run build` ✅
- **Revised**: grain, hint and colour cycle removed (colours static). 6 liquid colours (sky, mint, lavender, pink, peach, coral; mint/coral tokens added) assigned per load by cycling a shuffled palette over blob order → any amount uses all colours evenly, 6 largest blobs all differ; landscape/portrait share the assignment. Screenshots desktop + mobile ✅ no console errors, `npm run build` ✅
- **Size** control (50–150 %, step 5, default 100): scales all target radii, sim eases to new size. Slider End/Home → blobs grow/shrink together, desktop + mobile screenshots ✅ (150 % fuses most blobs into one mass). `npm run build` ✅
- **Color themes** (Pastel default / Vivid / White / Silver / Gold): `$liquid-themes` SCSS map → `--liquid-<theme>-<n>` CSS vars; scene stores colour slots so theme switch recolours without reshuffling. `OptionGroup` extracted for Mode + Color (swatch = conic gradient). Mono themes skip butter lift (White went yellow). Silver/Gold: `uMetal` → fake studio env reflection + per-blob hemisphere normals.
- Fix: Sass minified `#ffffff` → `#fff`, colour parser rejected it → WebGL fell back to gradient; short hex now expanded.
- Metal tries: SDF bevel → flat coin; deep bevel → cone tip at centre; hemisphere domes → OK, smax with bevel → edge ring; current = domes smax'd only with each other. Known: thin flat lip at blob edge (SDF merge expands outline past sphere radius), flat necks. Screenshots all themes desktop + gold mobile ✅ `npm run build` ✅
- **Panel redesign**: 28rem wide, each row `label | control | value` on one line (OptionGroup now a div radiogroup, legends can't sit in grid). Close (X) moved beside the "Controls" title; toggle hides while open, focus moves between them. Glass: bg alpha 0.45, blur 24px. Colour = swatch-only (name kept visually hidden for screen readers). UI colours via `--ui-*` vars, flipped by `.liquid.is-dark`.
- **Blob size follows viewport (A)**: `fitScale = sqrt(long/short ÷ reference)` clamped 0.75–1.5 → widening the window grows blobs; reference screens unchanged.
- **White → Water**: lens refraction of the backdrop (flipped), thin dark edge, caustic opposite the light, sharp specular.
- **Silver/Gold** (reference: liquid chrome) on black bg: dome height `sqrt(-d(2R+d))` with blended local radius (exact hemisphere, no cone, smooth necks) + studio env (sky, dark horizon band, soft vertical streak, softbox). Known: small kink can appear on small blobs near large ones.
- Screenshots desktop + mobile for Pastel/Vivid/Water/Silver/Gold ✅ no console errors, `npm run build` ✅
- **Chrome flatter**: soft height ceiling `h / (1 + h/0.12)` on the dome (water keeps full dome) → rims stay round, tops level out.
- **Backdrop text sample** (`backdropText.ts`): copy drawn on a 2D canvas (DM Sans 500, wraps to width, centred), uploaded as texture, redrawn on CSS size change and after the font loads; shader mixes it into the backdrop (ink on light themes, cream on dark), so Water refracts/flips it. Screenshots Water/Pastel/Silver desktop + mobile ✅ `npm run build` ✅
- **Water = thin film**: refraction 0.06 (no flip) through a flattened dome (ceiling 0.05) → text reads as directly beneath, only the rim bends it.
- **Chrome layered/brighter**: env facing 0.9 (more white) + 5 stacked horizontal dark bands → nested contour lines along rims. Screenshots Water/Silver/Gold desktop + mobile ✅ `npm run build` ✅
- Fix: panel blur never applied — mixin wrote `backdrop-filter` + `-webkit-backdrop-filter`, the minifier kept only the prefixed one (Chrome ignores it). Now unprefixed only; build emits both. Computed `backdrop-filter: blur(24px)` ✅
- Chrome highlights whiten (env 0.85→1.2 blends tint → white) so gold's bright areas read white. Screenshots Gold/Silver desktop + mobile ✅ `npm run build` ✅
- Panel blur 24px → 8px. `npm run build` ✅
- **Temporary font select** (top-right, `FontSelect.tsx`): DM Sans / Instrument Serif / Fraunces / Bricolage Grotesque / Unbounded for the backdrop copy; renderer redraws on change and again once the face loads. Copy now shrinks to fit 70% of the height (wide faces overran the logo). Mobile: label hidden + smaller text so the pill clears the logo. Screenshots all fonts desktop, Unbounded mobile ✅ `npm run build` ✅
- Temporary font select removed; backdrop copy now **Meie Script** (Google Fonts), height-fit kept.
- **Controls**: no fill / no shadow (glass = blur 8px only). Panel = fixed bottom sheet (left/right/bottom 0, radius 0) that grows out of the toggle via `clip-path: inset(... round full)` → `inset(0)`, content fades in after. Fields wrap into auto-fit columns (min 22rem) so the full-width sheet stays short on desktop. Screenshots closed/mid/open desktop + mobile ✅ `npm run build` ✅
- Backdrop copy centre-aligned. Controls fill back: page colour (cream) 50% on Pastel/Vivid/Water, black 50% on Silver/Gold (`--ui-glass`). Panel closes on any pointer press outside it. Verified outside press → closed, inside (theme change) → stays open, desktop + mobile ✅ `npm run build` ✅
- Panel: clip-path 'grow from button' removed (background looked odd mid-animation); sheet now fades + slides up on its own, toggle stays a plain button. Screenshots desktop + mobile ✅ `npm run build` ✅
