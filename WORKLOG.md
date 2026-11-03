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
- **Cut smoother**: live tip point follows the pointer between recorded points (groove grows continuously, end kept on release); widths smoothed with neighbours; Catmull-Rom subdivision ×2 → CUT_POINTS 12→25. Tried bounding-box culling of the cut loop → hard seam inside blobs (smax reaches deeper than the box), removed. Perf note for step 6: cut loop now 24 segments per sceneSdf call.
- **Text see-through**: opaque themes show the backdrop copy at 25%, nudged by the surface normal; chrome shows it as a darker imprint (light text vanished in highlights). Water unchanged. Screenshots Pastel + Silver cut sweep ✅ no console errors, `npm run build` ✅
- **Text see-through 되돌림**: 불투명 테마(Pastel/Vivid/Silver·Gold) 배경 문구 25% 비침 제거, Water는 기존 굴절로 그대로. `npm run build` ✅

## 2026-11-02 · Step 6 — Performance + accessibility
- **Cut perf**: `uCutCount` uniform — no groove → carve (smax + 24-segment loop) skipped in every sceneSdf call; with a groove the loop stops at the live point count.
- **Mobile quality**: touch devices may drop to 0.4×, starting at 0.7× (desktop 1× / 0.5×). Headless SwiftShader drops straight to the floor (looks soft) — check sharpness/FPS on a real phone.
- **Reduced motion** (`prefers-reduced-motion`, live): idle drift + radius pulse frozen (touch still moves liquid); CSS transitions/animations off.
- **A11y**: focus rings hidden everywhere (by request). Backdrop copy given to screen readers as visually-hidden `.copy`. Fixed: desktop open → focus never reached the close button (visibility transition started at hidden) → visibility flips at once on open, delayed on close. Verified Tab → Enter → focus on Close → Esc → focus back on toggle, desktop + mobile(reduced) ✅ cut gesture screenshot ✅ no console errors, `npm run build` ✅
- **Deploy**: GitHub Pages workflow (`.github/workflows/deploy.yml`) — builds with `--base=./` on push to main.
- **Mobile too blurry on a real phone** → touch starts at 1× and floors at 0.7× (≈1 px per CSS px with the 1.5 DPR cap). `npm run build` ✅
- **Copyright**: bottom-left `COPYRIGHT ⓒ 2026 UNI` (2xs, aligned to the toggle row, under the open sheet). Screenshots desktop Pastel + mobile Silver ✅ `npm run build` ✅

## 2026-11-03 · Stretch → slime finger
- Thin snapping strand (sag, pinch, loose drops) replaced by a **finger-wide arm**: 14 segments + tip, radius 0.03–0.04 short-side, reach capped at 0.4, thins 20% at full reach, root flares into the body. Segments chase the root→tip line on springs (wobble); release → underdamped recoil back into the blob (overshoot jiggle), no snap. Merge 0.16 (0.12 left bead dimples). Shader extra slots 9 → 15. Screenshots desktop + mobile hold/recoil/rest ✅ no console errors, `npm run build` ✅

## 2026-11-03 · Cut + Stretch → Mold
- **Mold** (`mold.ts`, icon `pan_tool`) replaces Cut and Stretch: press outside the liquid → cut (unchanged groove); press on a blob → fingertip dent trail in the surface (shading only, heals over 3 s) + dough pulled past the edge as one tapered capsule (`uPullRoot/Tip`, fillet 0.12), recoils with a soft wobble on release. Slow drag = thick, fast = thin, for cut groove, dent and pull (`strokeWidth`).
- **Colour fix**: transition lift used `1 - maxW/total`, so overlapping parts of one colour (blob + its own strand) were tinted with the fixed transition colour. Now Gini impurity over hues (pairwise, skipped when one blob dominates) → same colour stays itself, different hues blend as before.
- Dent ridges caught the specular as stripes → dent trail segments smooth-unioned (0.03), depth 0.02. Stretch's 15 extra blob slots removed (BLOB_COUNT 27 → 12).
- Screenshots desktop Pastel press/pull/cut + mobile Water press/pull ✅ no console errors, `npm run build` ✅
- Pulled arm looked pointed along its middle and too thin → width 0.06–0.11 (root ×1.4), axis distance rounded (`PULL_ROUND` 0.04) and arm included in the dome radius → round crown. Dent wider (0.045–0.08) and smoother (0.06) so fast strokes leave no sparkly creases. Screenshots desktop press/pull + mobile pull ✅ `npm run build` ✅
- Pulled arm troughed: the dent continues along the arm (capsule at 50% width, same dent profile) so the dough reads as pressed and drawn out, not domed. Screenshots desktop + mobile pull ✅ `npm run build` ✅
- **Mold 철회**: still felt off → `src` back to main's Cut (as before, fast stroke = wide groove), Stretch removed entirely (BLOB_COUNT 12). Modes: Attract / Repel / Cut; 4th mode TBD. Screenshots Cut desktop + mobile ✅ no console errors, `npm run build` ✅
- **Ripple** mode (`ripple.ts`, icon `waves`): press spawns a ring (another every 0.12 travel / 0.6 s while held, max 6), grows 0.35–0.6/s by intensity, fades over 2.4 s. Shader adds a wave packet (width 0.07, wavelength 0.06) to the surface height for shading only — outline untouched. Water ×0.3 (refraction shredded the text at full height). Light outward push (0.4) on the blobs. Screenshots desktop Pastel/Water/Silver + mobile Gold ✅ no console errors, `npm run build` ✅
- **Ripple moves the drops too**: wave height also displaces the outline in sceneSdf (×1.2, fading out 0.025 past the edge so crests in open space raise no specks), and each ring pushes the blobs it sweeps outward (1.5/s² at full strength, Gaussian over the blob radius) → edges wobble and drops bob as the wave passes. Screenshots desktop Pastel/Silver + mobile Water ✅ no console errors, `npm run build` ✅
- Ripple calmer (too fine/fast/strong): wavelength 0.06→0.14, packet 0.07→0.15, speed 0.2–0.35/s (lifetime 3.2 s), amplitude 0.006–0.011, outline ×0.8, ring push 0.8, while held a ring every 0.2 travel / 1 s. Screenshots desktop Pastel/Silver ✅ `npm run build` ✅
- **Ripple stays in its own body of liquid**: blobs flood-filled into connected groups each step (gap < MERGE_K/2 = 0.14 counts as joined); a ring starts only in the drop under the press (or whose edge is within 0.1), and both the shader (group of the nearest blob, `uBlobGroups`/`uRippleGroups`) and the push skip other groups. Press in open space → no ring. Screenshots desktop Silver (pink body waves, orange body still) + mobile Gold ✅ no console errors, `npm run build` ✅
- **Attract/Repel → Move** (default mode, icon `drag_pan`): press on a drop (or within 0.05 of its edge) picks it up with the grab offset kept; it follows the finger on a stiff spring (120/s², ζ 0.9) and on release its home becomes where it was let go (minus drift), so it stays. Attract-only core easing removed. A layout change (amount/size/theme/orientation) re-homes all drops. Screenshots desktop + mobile drag/after ✅ no console errors, `npm run build` ✅
- **Drop** mode (`drop.ts`, icon `water_drop`): press lays a bead (0.04–0.06 by intensity, another every 0.12 travel while held, max 4 → BLOB_COUNT 12+4) in the nearest drop's colour; it springs into that drop (4–9/s², ζ 0.7) and on reaching 70% depth sinks away, swells the target by its volume share (eases back via RADIUS_RATE) and emits a Ripple through that body (`RippleField.emit`). Merge range opens 0.06 → 0.28 only within 0.06 of the target edge so a fresh bead doesn't bridge to every neighbour. Screenshots desktop Pastel + mobile Silver drop/after ✅ no console errors, `npm run build` ✅
- Drop softer/slower (bead looked pointy, merged too fast): pull 4–9 → 0.8–1.6/s², ζ 0.7 → 1 (no overshoot), grow 8 → 3/s, sink 5 → 2/s, merge range apart 0.06 → 0.12 and opens over 0.15 (was 0.06) of edge gap → rounder bead, gradual neck. Mobile screenshot: bead round ✅ (headless ~2fps, so timing checked by spring math: ~1 s → ~3 s to merge) `npm run build` ✅
- Drop natural: bead keeps a flat top (Pastel rim depth = min(BEVEL, 0.5 × local radius) so small beads no longer peak), and the ring now starts at the contact point the moment the bead meets the body's edge, not after absorption. `npm run build` ✅ (headless ~2fps → bead not caught in screenshots; checked in preview)
- **Drop → Splash** (`splash.ts`, icon `bubble_chart`): tap a body → 5–8 droplets (0.022–0.04, capped so one tap takes ≤35% of its area) fly out from the tap point, each aimed to land 0.08–0.16 past the edge (launch = reach × drag 2.5/s); they rest 0.8 s, then ease (1.2 s) into a critically damped pull (1.4/s²) back home and sink in at 60% depth. Host radius shrinks by the area out in droplets and refills as they return. Merge range 0.28 near the host (necks out/in) → 0.04 apart; max 8 droplets (BLOB_COUNT 12+8). Node sim of the droplet path ✅ `npm run build` ✅ (headless ~2fps: splash not caught in screenshots)
- **Splash 삭제** (원하던 느낌과 달라 보류): `splash.ts`·모드 항목 제거, BLOB_COUNT = AMOUNT_RANGE.max로 복귀. 모드는 Move / Cut / Ripple. `npm run build` ✅
- **좁은 폭 컨트롤 잘림 수정**: 320px에서 패널 내용 376px로 넘침 → 열 최소폭 `min(22rem, 100%)`, 컨트롤 열 `minmax(0, 1fr)`, 모드 버튼 `min-width: 0`, 색상 스와치 줄바꿈 허용. 320/360/1280 넘침 0 + 스크린샷 ✅ `npm run build` ✅
- **Move 늘어남 + 밀어내기**: 셰이더 `uStretch`로 물방울을 이동 방향 타원(면적 유지)으로 그림, 늘어남 = 속도×0.35(최대 0.7), 형태 스프링 90/s²·ζ0.3이라 놓으면 출렁이며 원형 복귀(다른 모드에서 움직일 때도 적용). 물방울 밖을 누른 채 움직이면 가장자리가 손끝에서 0.14–0.24 떨어질 때까지 비켜남(정지 위치 기준이라 밀다가 힘이 약해지지 않음). 주의: GLSL ES 1.0은 함수 인자로 uniform 배열 인덱싱 불가 → 값을 넘김. 드래그 스크린샷 desktop + mobile ✅ (headless 저fps라 밀림 폭은 실기기 확인 필요) `npm run build` ✅
- Shadow tightened so blobs sit on the surface: offset (0.025,-0.045)→(0.008,-0.014), blur 0.14→0.05, strength 0.2→0.26. Screenshots desktop + mobile ✅ `npm run build` ✅
- Vivid theme more saturated: #1e9bff,#00c98d,#8a5cff,#ff3d8b,#ff8a1f,#ff4a3d → #0077ff,#00d96f,#7a2cff,#ff1477,#ff7a00,#ff2a2a. Screenshots desktop + mobile ✅ `npm run build` ✅
- Mobile zoom off: viewport maximum-scale=1, user-scalable=no + html/body touch-action: manipulation (iOS ignores user-scalable). Preview LIQUID updated. `npm run build` ✅
- 레트로 팔레트: Vivid = #f3620f #ffc20a #67944b #078d8c #084973 #da0d1e, Pastel = 같은 색을 흰색 60% 섞어 생성(`pastel-list`). 스크린샷 데스크톱 + 모바일 ✅ `npm run build` ✅
- 배경 미드센츄리 오프화이트 단색 #f2ece0 (그라데이션·핑크 액센트 제거). 그림자 붉은기 원인 = 라벤더 tint → 웜그레이 #8f877c, 크기 축소 offset (0.002,-0.008) / blur 0.03 / 0.3. 빛 위쪽으로 LIGHT_DIR (-0.18,0.75,0.64), 크롬 softbox도 맞춤.
- 셰이더 최적화: uBlobCount로 빈 슬롯 루프 생략, 색·반경 루프 통합(blendBlobs), domeNormal이 shadeLiquid의 SDF·ripple 샘플 재사용, 리플 없으면 nearestGroup 생략, 완전히 덮인 픽셀은 배경·그림자 생략. 헤드리스 A/B 약 2.1배 (pastel/water/gold, 모바일 동일).
- 모바일 선명도: 터치 DPR 상한 1.5→2, 최소 품질 0.7→0.75 (최저 1.5px/CSS px). 스크린샷 데스크톱 + 모바일 ✅ 콘솔 에러 없음 ✅ `npm run build` ✅
- 그림자 연하게 0.3→0.16. Vivid 교체 #e8b43b #db713a #c74732 #788b43 #287e79 #283f60 (Pastel은 흰색 60% 자동). Silver/Gold 윗면 납작하게 METAL_HEIGHT_CEILING 0.12→0.04. 스크린샷 ✅ 콘솔 에러 없음 ✅ `npm run build` ✅
- Pastel/Vivid 윗면 납작하게(Silver/Gold와 맞춤): BEVEL 0.12→0.05, BEVEL_RADIUS_SHARE 0.5→0.25. 스크린샷 ✅ `npm run build` ✅
- 납작한 윗면 경계 부드럽게: 림 프로파일 sqrt(1-t²)→sqrt(1-t³) (윗면과 만나는 곳 곡률 0), BEVEL 0.05→0.08, 비율 0.25→0.35. 스크린샷 ✅ `npm run build` ✅
- Silver/Gold 원복 METAL_HEIGHT_CEILING 0.04→0.12. Pastel/Vivid 두께↑·경계 부드럽게 BEVEL 0.08→0.13, 비율 0.35→0.5 (t³ 프로파일 유지). Water 두께↑ WATER_HEIGHT_CEILING 0.05→0.08. 스크린샷 ✅ `npm run build` ✅
- Silver/Gold 높이 0.08(중간). Pastel/Vivid 더 완만: BEVEL 0.13→0.2, 비율 0.5→0.7. 그림자 → 비치는 그림자: 밝은 테마는 물방울 색이 배경에 투과(SHADOW_TRANSMIT 0.7, 세기 0.45), 크롬은 기존 회색 그림자 유지. Water는 거의 투명한 빛 번짐. 스크린샷 ✅ `npm run build` ✅
- 레퍼런스(광택 폴리시 방울) 반영: 작고 선명한 하이라이트(SPECULAR 320/0.95, sheen 0.05), 가장자리 색 깊게(BODY_EDGE_DEPTH 0.45), 흰 림 약화(RIM 0.15), 명암 대비 SHADE_MIN 0.82. 바닥: 얇은 접촉 그림자 + 물방울 색이 아래로 비치는 반사(유리/대리석). 크롬은 기존 그림자. 스크린샷 ✅ `npm run build` ✅
- 그림자 전부 삭제(셰이더 background·uShadowTint·$color-shadow 제거). 어두운 면 좁고 진하게: SHADE_MIN 0.82→0.9, 가장자리 깊이 0.45→0.75를 1-n.z 0.3~0.85 구간에만. 스크린샷 ✅ `npm run build` ✅
- 성능 테스트(헤드리스, 720×450·390×844, 최적화 전 빌드 대비): 테마 4종·모드 3종·모바일 모두 2.0~2.7배 fps, p95 프레임 약 절반. 콘솔 에러 없음.
- iOS Safari 상태바·주소창 아래 잘림: 캔버스를 fixed + 100lvh로(툴바 뒤까지 그림), UI는 100dvh 유지. Chromium 모바일 스크린샷 ✅ (실기기 미확인) `npm run build` ✅
- 아이폰 실기기: fixed 레이어가 툴바에서 끊기고 Safari가 단색 띠를 칠함 → .liquid·캔버스를 absolute로(툴바 아래로 이어짐), 어두운 테마는 html 배경을 night로 맞춰 상태바 색 일치. 스크롤 없음 확인 ✅ `npm run build` ✅ (실기기 미확인)
