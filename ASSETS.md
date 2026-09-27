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

- **Road** — the Road Template GLB is tiled along the generated centerline
  every 8 m on top of the painted CanvasTexture road, which stays underneath
  as the authoritative drivable surface. (This is the pre-disable behaviour;
  see the road-disable commit.)
- **Trees** — the trees pack is split into its individual low-poly variants
  at load time. For every vegetation region a limited number of interior
  points is sampled deterministically (small region 1-3 trees, medium 3-7,
  large 6-12), each point is mapped with the shared semantic transform, and
  one tree variant is placed there. Trees are height-fitted to a 3-8 m band
  with ±15% scale jitter and a deterministic golden-angle yaw. No tree is
  created from an individual green pixel.
- **Buildings** — ONE connected building region becomes ONE building model.
  The region centroid maps through the shared transform, the normalized
  model is fitted to the region footprint (max 3x per-axis, vertical follows
  the smaller factor) and its long axis is aligned to the region aspect.
  Existing box colliders kept.
- **Water** — the contour-shaped flat water surface (painted from the
  semantic water region) is authoritative. The Water Animation GLB is a
  100 x 100 m ocean plane and cannot conform to arbitrary lake shapes, so it
  is rendered only as a subtle enhancement tile scaled to sit inside the
  region bounds. Boundary/hazard walls kept.
- **Ramp** — ONE ramp region becomes ONE kicker model, oriented so the low
  side faces the nearest road centerline point, footprint-fitted to the
  9 x 11 m standard and resting on the terrain. The existing trimesh
  collider is kept (stability over fidelity).

Every model is split into normalized variants at load time (`getVariants`):
each variant's full world matrix is baked into cloned geometry and translated
so the local origin is the horizontal Box3 centre with the base at Y = 0.
Semantic placement then applies a single world position/rotation/scale - no
Sketchfab origin offsets leak into the world.

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