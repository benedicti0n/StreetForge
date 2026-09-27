# World Assets

The generated world renders built-in procedural geometry only as a fallback.
Each imported model is auto-detected: as soon as its GLB exists at the
registered path (below), the real model replaces the placeholder on the next
world build. No flag or manifest is required.

Layout (road route, building footprints, water regions, vegetation regions,
ramp positions) and all gameplay colliders are never changed by these files.

## Models to place manually

The Sketchfab download API requires authentication, so these files cannot be
fetched by the app. Download each model from the Sketchfab page
(Download button -> glTF/GLB) and place the GLB at the exact path below
(`worldAssets.ts` is the registry):

| Registry key | Sketchfab model | Place at |
| --- | --- | --- |
| `road` | [ROAD Template](https://sketchfab.com/3d-models/road-template-4d07393f253c4777ac66c7ec2887e599) | `public/models/world/road/road.glb` |
| `trees` | [Low poly trees](https://sketchfab.com/3d-models/low-poly-trees-51cae4a194344e8bbfbd0a4cff205f76) | `public/models/world/trees/trees.glb` |
| `buildings` | [street buildings](https://sketchfab.com/3d-models/street-buildings-5113b368123e4b94b0aceaf2c32d6b6a) | `public/models/world/buildings/buildings.glb` |
| `water` | [Water Animation](https://sketchfab.com/3d-models/water-animation-e54ff76bef854b128af8d20cf9c03729) | `public/models/world/water/water.glb` |
| `ramp` | [Skatepark Ramp Kicker](https://sketchfab.com/3d-models/skatepark-ramp-kicker-7654188f47ee46888ec77a43d87e40ca) | `public/models/world/ramp/ramp.glb` |

## How each model is used

- **Road** — if the model is a modular straight/curved segment kit it is
  tiled along the generated centerline every 8 m (`ROAD_SEGMENT_SPACING`),
  width-fitted to the 8 m road. The painted CanvasTexture road stays
  underneath as the authoritative drivable surface, so any generated curve
  keeps working. A single non-modular strip is treated as roadside dressing.
- **Trees** — cloned per vegetation region (deterministic variant when the
  GLB has several top-level meshes), height-fitted to ~5 m, deterministic
  scale/rotation.
- **Buildings** — cloned per generated footprint, fitted to the footprint
  (max 2.5x per-axis distortion), existing box colliders kept.
- **Water** — fitted to the generated water region; the first animation clip
  plays via `AnimationMixer` when the GLB includes one (ripples etc.).
  Boundary/hazard walls kept.
- **Ramp** — cloned per ramp region, oriented by the existing ramp yaw
  (facing the nearest road point), footprint-fitted, resting on the terrain.
  The existing trimesh collider is kept (stability over fidelity).

Every model is auto-normalized at runtime (`normalizeModel`): Box3 size,
center, and minY are measured and each placement lifts the model so its
lowest point sits on the terrain. Centralized per-asset transforms
(`WORLD_ASSET_CONFIG` in `lib/worldAssets.ts`): `scale`, `rotationY`,
`yOffset`, `fit`, `targetHeight`.

## Audio

| Path | Source | Notes |
| --- | --- | --- |
| `public/audio/engine.mp3` | [Lamborghini Urus Racing Sound Effect](https://pixabay.com/sound-effects/city-lamborghini-urus-racing-sound-effect-163336/) (Pixabay, mizanstock) | Already placed. Player engine sample; gain/rate follow speed and throttle. |
| `public/audio/police-siren.ogg` | (CC0, pre-existing) | The provided "police siren" URL pointed at the ramp model and is not an audio file, so the existing siren is retained and mixed at ~40% loudness. |

## Development diagnostics

In development, one console line per asset is printed when a world builds:

```
[streetforge] world assets
road: loaded (N meshes, clips: none, size: ...)
trees: FAILED /models/world/trees/trees.glb
```

## Licenses / Attribution

- ROAD Template, Low poly trees, Water Animation: Sketchfab **CC Attribution** — credit the original authors in any distributed build.
- street buildings: Sketchfab **Standard License** (no redistribution of the model itself).
- Skatepark Ramp Kicker: license not listed on the model page at time of integration — verify before shipping.
- Engine sound: Pixabay Content License (free to use, no attribution required).
- Police siren: CC0 (pre-existing).