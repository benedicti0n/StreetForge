# StreetForge

> **Draw it. Forge it. Drive it. Escape it.**

StreetForge is an original **GTA VI-inspired browser experience** built for Unlayer's **Build with React Image Editor Challenge**.

Instead of starting inside a predefined game world, StreetForge lets you **draw the world first**.

Using Unlayer's React Image Editor, you sketch a getaway course using simple visual primitives: roads, buildings, vegetation, water and ramps. StreetForge interprets that 2D drawing, converts it into a structured semantic map, builds a playable low-poly 3D environment from it, and then drops you into the world in a race car while a police interceptor chases you.

The image editor is not a side feature or customization screen.

**It is the level editor for the game.**

```text
DRAW
  ↓
INTERPRET
  ↓
FORGE
  ↓
DRIVE
  ↓
ESCAPE
```

---

## The GTA VI-Inspired Experience

The original idea was simple:

> What if you could sketch your own getaway route and then immediately drive through it while being chased by the police?

StreetForge combines a creative editor with an arcade driving experience.

### 1. Draw your world

The right half of the interface contains the React Image Editor.

Players sketch a top-down world using a simple semantic drawing language:

| Drawing | Meaning |
| --- | --- |
| Black | Roads |
| Red | Buildings |
| Blue | Water |
| Green | Vegetation |
| Orange | Ramps |

The drawing does not need to be perfect. It is intentionally designed to feel like sketching a rough level idea rather than working inside a traditional game engine.

---

### 2. Forge the sketch into a world

Press **Build World** and StreetForge transforms the 2D drawing into a structured map.

The pipeline is:

```text
React Image Editor
        ↓
Captured PNG
        ↓
AI-assisted sketch normalization
        ↓
Semantic color quantization
        ↓
Structured world representation
        ↓
Procedural low-poly 3D world
```

The AI normalization stage is deliberately constrained.

It does **not** generate a photorealistic image or a finished 3D environment. Its job is to clean up the player's rough sketch into a predictable, machine-readable top-down semantic map.

StreetForge then deterministically converts that normalized representation into the actual playable environment.

This keeps the generated world visually consistent, physically stable and faithful to the player's layout.

---

### 3. Enter the world you drew

Once generation finishes, the left side becomes the playable 3D version of the sketch.

The world can contain:

- generated road layouts
- low-poly buildings
- vegetation and tree models
- water regions
- stunt ramps
- world boundaries
- the player's race car
- a pursuing police interceptor

The editor and game are therefore directly connected:

```text
2D DRAWING
   │
   ▼
SEMANTIC MAP
   │
   ▼
3D LEVEL
   │
   ▼
GAMEPLAY
```

---

### 4. Start the chase

Press **Start Chase** and StreetForge transitions from level editor into driving mode.

```text
3
2
1
GO
```

The player takes control of the race car while the police vehicle begins an autonomous pursuit.

The police controller predicts the player's movement and drives the same physics system as the player's car rather than teleporting or following a scripted animation.

You can:

- accelerate
- brake and reverse
- steer
- use the handbrake
- hit ramps
- collide with the environment
- reset the car
- try to create enough distance to escape

---

## Why React Image Editor Is Core to StreetForge

The challenge requirement was not treated as:

> "Add an image editor somewhere in the app."

StreetForge is built around the editor.

Without the React Image Editor, the core gameplay loop does not exist.

The editor determines:

- the road topology
- obstacle placement
- building locations
- vegetation regions
- water placement
- ramp placement

The world you eventually drive through is derived from the image you created inside the editor.

```text
React Image Editor
        │
        └── defines the level
                │
                ▼
          StreetForge world
                │
                ▼
             gameplay
```

That makes the image editor part of the game's mechanics rather than simply part of its UI.

---

# Technical Architecture

StreetForge combines image editing, computer vision-style semantic processing, procedural generation, real-time 3D rendering, rigid-body physics and autonomous vehicle pursuit inside a single browser experience.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js App Router |
| UI | React, TypeScript, Tailwind CSS |
| Image Editor | `@unlayer/react-image-editor` |
| AI normalization | OpenAI GPT Image |
| 3D Engine | Three.js |
| React 3D | React Three Fiber |
| 3D Utilities | drei |
| Physics | Rapier / `@react-three/rapier` |
| Vehicle System | Rapier Dynamic Raycast Vehicle Controller |
| Experimental world generation | World Labs Marble |
| Gaussian Splat Rendering | Spark |
| Audio | Web Audio API + local vehicle/siren assets |

---

# World Generation Pipeline

The main StreetForge pipeline uses an AI-assisted but deterministic approach.

```text
Unlayer Editor
     │
     ▼
1024×1024 PNG
     │
     ▼
OpenAI Image Normalization
     │
     ▼
Semantic Palette Quantization
     │
     ▼
World Parser
     │
     ├── Roads
     ├── Buildings
     ├── Water
     ├── Vegetation
     └── Ramps
     │
     ▼
Procedural World Builder
     │
     ▼
React Three Fiber Scene
```

### Semantic normalization

The AI stage converts freehand input into a restricted palette.

For example:

```text
ROAD       → dark charcoal
BUILDING   → red
WATER      → blue
VEGETATION → green
RAMP       → orange
TERRAIN    → grass
```

The result is quantized again locally so downstream world generation never depends on imperfect RGB values returned by an image model.

---

## Deterministic generation

After normalization, the 3D environment is built locally.

AI does **not** control the physics or directly create game geometry.

StreetForge derives:

- road masks
- connected semantic regions
- building footprints
- vegetation regions
- water boundaries
- ramp locations
- vehicle spawn positions
- road direction/tangents

from the normalized map.

This means gameplay remains predictable even when the player's original drawing is messy.

---

# Roads

Roads are generated from the semantic road mask and rendered into the world's ground texture.

The visual road system includes:

- asphalt
- shoulders
- center markings
- terrain separation

Road generation intentionally remains procedural instead of forcing a fixed road model onto arbitrary curves.

This lets the road accurately follow whatever route the user sketches.

---

# Buildings, Trees, Water and Ramps

Other semantic objects are converted into low-poly world props.

### Buildings

Connected building regions become building placements with simple gameplay colliders.

### Vegetation

Vegetation regions generate controlled clusters of low-poly trees rather than one object per pixel.

### Water

Water regions remain aligned with their 2D position and are rendered as visible water areas with gameplay boundaries.

### Ramps

Ramp regions create stunt ramps positioned and oriented relative to nearby road direction.

---

# Vehicle Physics

Both cars run through the same reusable physics architecture.

Each vehicle consists of:

```text
Dynamic Rigid Body
       +
Simplified Chassis Collider
       +
4 Raycast Wheels
       +
Suspension
       +
Engine / Brake Forces
```

Rapier's raycast vehicle system handles:

- acceleration
- braking
- steering
- suspension
- traction
- collisions
- wheel-ground interaction

The imported vehicle meshes are visual representations placed on top of the physics chassis.

This separation means the same vehicle physics implementation can accept control input from either:

```text
PLAYER KEYBOARD
```

or:

```text
POLICE AI
```

---

# Police Pursuit

The police vehicle is not animated along a predefined path.

It actually drives.

The pursuit controller reads:

- player position
- player velocity
- police position
- police velocity
- heading difference
- distance to player

and produces ordinary vehicle controls:

```ts
{
  throttle,
  brake,
  steering,
  handbrake
}
```

The controller also includes:

- predictive targeting
- speed management
- steering smoothing
- stuck detection
- recovery behavior

The police therefore has to physically navigate the same world as the player.

---

# Experience State Machine

StreetForge uses a centralized game lifecycle:

```text
editing
   ↓
generating
   ↓
world-ready
   ↓
countdown
   ↓
playing
   ├── escaped
   └── busted
```

`RUN IT BACK` resets the cars and chase while reusing the same world.

No new AI generation request is required for replay.

---

# Controls

| Input | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / Reverse |
| `A` / `←` | Steer Left |
| `D` / `→` | Steer Right |
| `Space` | Handbrake |
| `R` | Reset Vehicle |
| Mouse | Orbit / Pan / Zoom in inspection mode |

Vehicle keyboard controls are isolated from the editor so typing or drawing inside the React Image Editor does not accidentally control the car.

---

# Audio

StreetForge uses dedicated vehicle audio assets:

```text
public/audio/engine.mp3
public/audio/police-siren.mp3
```

The engine sound responds to gameplay state and vehicle movement.

The police siren activates during pursuit and is intentionally mixed at a lower level so it does not overwhelm the vehicle audio.

Browser autoplay restrictions are handled by unlocking audio after a user interaction.

---

# Asset Pipeline

StreetForge combines procedural geometry with imported 3D assets.

Vehicle and environmental models are loaded as GLB/glTF assets and normalized at runtime for:

- scale
- orientation
- ground alignment
- bounding dimensions

Gameplay colliders remain deliberately simple even when the visual asset is more detailed.

This keeps Rapier physics stable and avoids using complex visual meshes directly as dynamic collision geometry.

---

# Experimental Marble Mode

StreetForge also contains an experimental integration with **World Labs Marble**.

This was an earlier approach to world generation:

```text
Sketch
  ↓
Marble
  ↓
Gaussian Splat
  +
Collider Mesh
  ↓
Spark + Rapier
```

A real Marble-generated world was successfully tested with:

- Spark Gaussian splat rendering
- generated GLB collision geometry
- safe vehicle spawning
- player driving
- police pursuit

However, the final StreetForge experience uses the low-poly Forge pipeline because it provides:

- stronger visual consistency
- lower latency
- deterministic physics
- clearer correspondence to the user's drawing
- better performance
- more reliable gameplay

The Marble integration remains available as an experimental system.

---

# Project Structure

```text
app/
├── api/
│   ├── forge/
│   │   └── normalize/
│   └── world/

components/
├── map-editor/
│   └── React Image Editor integration
│
├── workspace/
│   └── split editor / game workspace
│
└── world/
    ├── vehicles/
    ├── physics/
    ├── police/
    ├── camera/
    ├── audio/
    ├── procedural/
    └── HUD / game state

lib/
├── forge-ai/
│   ├── normalization prompt
│   ├── semantic palette
│   └── quantization
│
├── sketchworld/
│   ├── parsing
│   ├── world construction
│   └── semantic mapping
│
└── worldlabs/
    └── experimental Marble integration
```

---

# Environment Variables

Create:

```text
.env.local
```

### OpenAI AI Forge

```env
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
```

The OpenAI key is server-side only and is never exposed to browser bundles.

If OpenAI normalization is unavailable, StreetForge can fall back to the local Forge interpretation pipeline.

### Experimental World Labs integration

```env
WLT_API_KEY=
WORLDLABS_API_BASE_URL=
WORLDLABS_DRAFT_MODEL=
WORLDLABS_FINAL_MODEL=
WORLDLABS_MOCK_MODE=
```

These variables are only required for experimental Marble mode.

---

# Local Development

Install dependencies:

```bash
npm install
```

Run StreetForge:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

---

# Asset Attribution

Third-party vehicle and environment assets retain their respective licenses and attribution.

Vehicle attribution is documented in:

[`public/models/vehicles/ATTRIBUTION.md`](public/models/vehicles/ATTRIBUTION.md)

Additional vehicle asset notes are available in:

```text
docs/vehicle-assets.md
```

Audio and environment assets should retain their corresponding source/license information alongside the project.

---

# Challenge Requirement

StreetForge was built for the **Build with React Image Editor Challenge**.

The project satisfies the core requirement by making React Image Editor an essential part of the gameplay loop:

```text
CREATE IMAGE
     ↓
INTERPRET IMAGE
     ↓
GENERATE GAME WORLD
     ↓
PLAY INSIDE IT
```

The editor is therefore not decorative.

**The player's image becomes the level.**

---

# Disclaimer

StreetForge is an original project inspired by the open-world driving and police-pursuit fantasy associated with GTA-style games.

It is not affiliated with, endorsed by, or based on assets from Rockstar Games or Grand Theft Auto VI.

---

# StreetForge

**Draw your getaway. Forge it into a world. Escape the pursuit.**
