# World Assets

The generated world renders the built-in procedural geometry by default.
Placing the files below and flipping the manifest flag upgrades the visuals
while keeping the generated layout (road route, building footprints, water
regions, vegetation regions, ramp positions) and all gameplay colliders
unchanged.

## Activation

1. Download each model from the Sketchfab page (Download button -> glTF/GLB).
2. Place the GLB files at the paths below.
3. Set `"enabled": true` in `public/models/world/manifest.json` and rebuild.

While the manifest is disabled (default) the app makes no model requests and
the procedural visuals are used - nothing breaks and no 404s appear.

## Files to place manually

The Sketchfab download API requires authentication, so these files could not
be fetched automatically. Download each model from the Sketchfab page
(Download button -> glTF/GLB) and place the GLB here:

| Path | Sketchfab model | Notes |
| --- | --- | --- |
| `public/models/world/roads/road.glb` | [ROAD Template](https://sketchfab.com/3d-models/road-template-4d07393f253c4777ac66c7ec2887e599) | Straight road segment; placed every ~8 m along the generated route. Width is auto-fitted to the road (8 m). Base painted road stays underneath. |
| `public/models/world/trees/trees.glb` | [Low poly trees](https://sketchfab.com/3d-models/low-poly-trees-51cae4a194344e8bbfbd0a4cff205f76) | One or more tree variants; cloned per vegetation region, auto-scaled to ~5 m height. |
| `public/models/world/buildings/buildings.glb` | [street buildings](https://sketchfab.com/3d-models/street-buildings-5113b368123e4b94b0aceaf2c32d6b6a) | Cloned per building footprint, fitted to each footprint (max 2.5x distortion). |
| `public/models/world/water/water.glb` | [Water Animation](https://sketchfab.com/3d-models/water-animation-e54ff76bef854b128af8d20cf9c03729) | Scaled to cover the generated water region; animation included in the model is preserved. |
| `public/models/world/ramps/ramp.glb` | [Skatepark Ramp Kicker](https://sketchfab.com/3d-models/skatepark-ramp-kicker-7654188f47ee46888ec77a43d87e40ca) | Placed per ramp region, oriented by the existing ramp yaw (facing the nearest road point), fitted to the ramp footprint. |

Tuning knobs live in `components/world/procedural/ProceduralWorld.tsx`:
`ROAD_SEGMENT_SPACING` (piece spacing in meters) and `TREE_TARGET_HEIGHT`.

If a model renders wrong-side-up or at a wrong scale, export it from
Sketchfab with "up" = +Y, and check the fitted scale in the browser console
(none is logged by default; the bounding-box fit assumes a centered model).

## Audio

| Path | Source | Notes |
| --- | --- | --- |
| `public/audio/engine.mp3` | [Lamborghini Urus Racing Sound Effect](https://pixabay.com/sound-effects/city-lamborghini-urus-racing-sound-effect-163336/) (Pixabay, mizanstock) | Already placed. Loopable driver engine sample; volume/playback rate follow speed and throttle. |
| `public/audio/police-siren.ogg` | (CC0, pre-existing) | The provided "police siren" URL pointed at the ramp model and is not an audio file, so the existing siren is retained and mixed at ~40% loudness. |

## Licenses / Attribution

- ROAD Template, Low poly trees, Water Animation: Sketchfab **CC Attribution** — credit the original authors in any distributed build.
- street buildings: Sketchfab **Standard License** (no redistribution of the model itself).
- Skatepark Ramp Kicker: license not listed on the model page at time of integration — verify before shipping.
- Engine sound: Pixabay Content License (free to use, no attribution required).
- Police siren: CC0 (pre-existing).