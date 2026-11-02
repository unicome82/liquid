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
