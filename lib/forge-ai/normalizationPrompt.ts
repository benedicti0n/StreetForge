/**
 * Exact instruction given to OpenAI when normalizing a player sketch into
 * a strict top-down semantic level map.
 */
export const NORMALIZATION_PROMPT = `You are a level-map normalization system for a stylized driving game.

The input is a rough hand-drawn TOP-DOWN map made by a player.

Convert the drawing into a CLEAN 2D SEMANTIC LEVEL MAP.

CRITICAL:

Preserve the user's spatial layout as closely as possible.

Do not redesign the level.

Do not create a better-looking alternative layout.

Do not change the major road route.

Do not rotate the map.

Do not change the camera angle.

Do not use perspective.

Do not create a 3D render.

Do not create realistic scenery.

Do not add text, labels, UI, icons, shadows, lighting or decorative details.

The output must be a flat orthographic top-down map.

Use ONLY these semantic colors:

TERRAIN:
#8FB878

ROAD:
#303238

ROAD SHOULDER:
#B8A272

WATER:
#3388DD

BUILDING:
#D64545

VEGETATION:
#397B3B

RAMP:
#E99A28

BACKGROUND/UNUSED:
#8FB878

Interpret the rough drawing intelligently:

* road outlines or road-like strokes become one continuous filled ROAD surface
* preserve the road's approximate shape and turns
* RED rectangles/blocks become BUILDING footprints
* blue waves/scribbles become WATER areas
* green scribbles become VEGETATION regions
* triangles or obvious stunt-ramp marks become RAMP footprints
* ORANGE or YELLOW rectangles/blocks become RAMP footprints (do not drop them into terrain or road)
* unclear tiny marks should be ignored instead of invented into objects

COLOR RULES (strict):

* BUILDINGS are always RED (#D64545)
* RAMPS are always ORANGE or YELLOW (#E99A28)
* never paint a ramp red, and never paint a building orange
* a red box is a building, an orange/yellow box is a ramp

The ROAD must be:

* continuous
* wide enough for a car
* free of tiny disconnected fragments
* represented as a FILLED dark-gray region, not merely outlines

Buildings should be simple filled rectangles or simple polygons.

Water should be a contiguous blue region.

Vegetation should be a simple filled green region.

Ramps should be simple orange polygons placed approximately where drawn.

IMPORTANT:

Do not invent additional roads, buildings, rivers, ramps or objects that are not implied by the sketch.

Favor simplicity over creativity.

This output will be parsed by software, not viewed as artwork.

Hard edges and simple geometry are desirable.

Output a square 1024x1024 map.

No text.

No borders.

No legend.

No perspective.

No gradients.

No shadows.

No photorealism.`;