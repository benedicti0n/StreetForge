# Vehicle Assets — Structure & Phase 4 Notes

## World Conventions

- Y = up; ground plane at y = 0.
- Vehicle forward = **-Z** in world space (both vehicles are rotated `rotationY = π` from source space, where their fronts face +Z).
- Vehicle reference point: the `worldPosition` in `vehicleDefinitions.ts` is the bounding-box center at ground level. `visualOffset` translates the source-space model so its box center lands on that reference point; `visualScale` converts source units to metres.

## Race Car — Entinity XF

- Source format: glTF 2.0 (Sketchfab download, SketchUp/COLLADA-derived). Final: self-contained `.glb`.
- Source bounds (x, y, z): 159.92 × 93.09 × 351.34 units; center (101.21, 46.94, -173.27); ground contact at y = 0.40.
- Dimensions after scale (0.0131): **≈ 4.60 m long (z), 2.09 m wide (x), 1.22 m high (y)**.
- Hierarchy root: `Sketchfab_model > Collada_visual_scene_group > SketchUp > instance_0` — parts are `Material2_*` / `Material3_*` mesh nodes.
- Meshes: 130; triangles: ≈ 44,444; materials: 14 (MeshStandardMaterial, solid colors, roughness 0.6; no textures). Material 10 (`material_10`) is dark glass (transparent, opacity 0.74, depthWrite false).
- Named parts: `bump_fro01` (front bumper), `bump_rea01` (rear bumper), `windscre02` (windscreen), `volante` (steering wheel), `luci` (lights), `vetreria` (glass), `chassis`, `door_lf_02`, `door_rf_ok`, `wing_lf_ok`, `boot_dam`, `boot_ok`, `fondo`, `interno`, `minuteria`.
- Front faces **+Z** in source space; bumper positions confirm front at the +Z end.
- **Wheel nodes (Phase 4):** `wheel_rb`, `wheel_rb_1`, `wheel_rb_2`, `wheel_rb_3` — Object3D containers whose local origins coincide with the wheel geometry centres (verified: container position ≈ subtree box centre). Axles in source space: front z ≈ -66.8 (x ≈ 37.8 / 164.6), rear z ≈ -293.2 (x ≈ 33.6 / 168.8). Each contains 4 meshes (rim + tyre passes). These containers are valid spin/steer pivots; spin about the local X axis.
- Steering wheel node `volante` exists and is separately identifiable.
- Notable geometry: red materials (`material_3` #ff6060, `material_4` #ff0000) exist only on two tiny interior accents (~108 verts each); the exterior is black/silver/white.

## Police Car — LSPD Police Interceptor

- Source format: glTF 2.0 (Sketchfab download). Final: self-contained `.glb`.
- Source bounds (x, y, z): 10.45 × 7.90 × 25.60 units; center (5.185, 3.98, -12.40); ground contact at y = 0.03.
- Dimensions after scale (0.185): **≈ 4.74 m long (z), 1.93 m wide (x), 1.46 m high (y, incl. lightbar)**.
- Hierarchy root: `Sketchfab_model > Collada_visual_scene_group > SketchUp > instance_0`; parts are `Material2_*` / `Material3_*` mesh nodes.
- Meshes: 102; triangles: ≈ 35,348; materials: 19 (solid colors, no textures). Livery colours present: white body, black trim, red, amber (`#ffbb00`) and blue (`#0000ff`) lightbar materials.
- Named parts: `bonnet_ok` (hood), `boot_ok` (trunk), `glasslight` (all glazing), `policelig0` (lightbar base), `policeligh` (lightbar assembly), `interior`, `cage`, `chassis`, `door_lf_ok`/`door_lr_ok`/`door_rf_ok`/`door_rr_ok`, `LX`, `skpEF`.
- Front faces **+Z** in source space (hood at +Z end, trunk at -Z end).
- **Wheel nodes (Phase 4 — CAUTION):** `wheel`, `wheel_1`, `wheel_2`, `wheel_3` are Object3D containers, but their local origins do **NOT** coincide with the wheel geometry: container positions are (15.49, 3.53, -41.36) and (-5.10, 3.53, -55.36), while the actual wheel geometry centres sit at (±4, 1.86, -5.13 / -19.13) — a SketchUp-import origin offset (~14 units). For visual spin/steering, Phase 4 must pivot around each wheel's geometry centre (or add a pivot group at the geometry centre), not around the container node. Wheel geometry size ≈ 1.36 × 3.65 × 3.65 units.
- Front axle wheel geometry at z ≈ -5.13, rear at z ≈ -19.13 (source space).

## Shared Notes for Phase 4

- Both models are single-scene glTFs with duplicated front/back-face material passes (a SketchUp-import pattern); VehicleModel clones the scene per instance and renders all materials `DoubleSide` so flipped-winding faces display correctly.
- Materials are shared per instance clone (materials cloned, not the cached GLTF scene) — safe to adjust per-instance properties later without touching the asset cache.
- Neither model has textures; all appearance is PBR solid colour. No material swaps should be needed.