export const WORLD_SKETCH_PROMPT = `This image is a top-down level-design sketch for a driving environment.

Interpret its spatial layout as a world map.

Preserve the major relative placement and shapes.

Convert paths/roads into realistic driveable ground.

Interpret vegetation/tree-like marks as vegetation.

Interpret ramp-like shapes as driveable stunt ramps or raised surfaces.

Keep the central environment navigable by cars.

Create coherent realistic terrain around the sketch rather than treating the drawing as a flat billboard or wall.

The aesthetic is a sunny coastal crime-action driving environment.`;

export const WORLD_SKETCH_FINAL_PROMPT = `${WORLD_SKETCH_PROMPT}

Generate the highest-fidelity version of this world.`;